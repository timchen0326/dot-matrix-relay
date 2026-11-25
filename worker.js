// Relay for the Dot Matrix watch face. Each user deploys their own copy to
// their own (free) Cloudflare account. Stateless: each request from the watch
// carries the calendar links and Strava API keys from the face's settings; the
// relay reads them, answers with a small JSON the watch can parse, and stores
// nothing.
//
// POST /  {cal1, cal2, id, secret, token}  ->
//   a:  [sport code, start epoch, elapsed minutes, label]   newest activity
//   k:  [[sport code, start epoch, moving minutes], ...]    last 8 days, newest first
//   e:  [[start, end, "title", "w" (calendar 1) / "p" (calendar 2)], ...]  next events
//   eh: end epoch of the latest event that already finished (last 24 h)
//   rt: Strava's new refresh token, when it changed (the watch keeps it)
//   sx: Strava's HTTP status when it failed (401 = wrong keys or token)
//
// GET /         setup guide
// GET /strava   helps a user get their Strava refresh token (OAuth with their
//               own Strava API app; the keys stay in their browser tab)

import { nextEvents } from "./calendar.js";

// --- Strava ---------------------------------------------------------------

function classify(a) {
  const type = a.sport_type || a.type || "";
  const name = (a.name || "").toLowerCase();
  if (type === "Basketball" || name.includes("basketball")) return "b";
  if (type === "Golf") return "g";
  if (type === "Badminton") return "m";
  if (type === "RockClimbing" || name.includes("bouldering")) return "c";
  if (["Workout", "WeightTraining", "Crossfit", "HighIntensityIntervalTraining"].includes(type)) return "w";
  return null;
}

const LABELS = {
  b: "Basketball", g: "Golf", m: "Badminton", c: "Bouldering",
  WeightTraining: "Weights", HighIntensityIntervalTraining: "HIIT", Crossfit: "Crossfit", Workout: "Workout",
};
const EXTRA_CODES = {
  Run: "r", TrailRun: "r", VirtualRun: "r",
  Ride: "k", MountainBikeRide: "k", GravelRide: "k", EBikeRide: "k", VirtualRide: "k",
  Swim: "s", Walk: "h", Hike: "h", Yoga: "y", Pilates: "y",
};

function codeOf(a) {
  return classify(a) || EXTRA_CODES[a.sport_type || a.type] || "o";
}

function labelOf(a, code) {
  const type = a.sport_type || a.type || "";
  const label = LABELS[code] || LABELS[type] || type.replace(/([a-z])([A-Z])/g, "$1 $2") || "Activity";
  return label.slice(0, 11);
}

async function stravaToken(params) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return { ok: res.ok, status: res.status, json: res.ok ? await res.json() : null };
}

async function activities(accessToken, query) {
  const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw Object.assign(new Error("strava"), { status: res.status });
  return res.json();
}

async function strava(b, nowS) {
  if (!b.id || !b.secret || !b.token) return null;
  const t = await stravaToken({
    client_id: String(b.id).trim(),
    client_secret: String(b.secret).trim(),
    grant_type: "refresh_token",
    refresh_token: String(b.token).trim(),
  });
  if (!t.ok) return { sx: t.status };
  const access = t.json.access_token;
  try {
    let acts = await activities(access, `per_page=60&after=${nowS - 8 * 86400}`);
    // Nothing this week: still show the newest activity ever
    if (acts.length === 0) acts = await activities(access, "per_page=1");
    const out = { k: [] };
    let latest = null;
    for (const a of acts) {
      const ts = Math.floor(Date.parse(a.start_date) / 1000);
      const code = codeOf(a);
      // Elapsed time for the headline (what Strava shows for golf)
      const total = Math.round((a.elapsed_time || a.moving_time || 0) / 60);
      if (!latest || ts > latest[1]) latest = [code, ts, total, labelOf(a, code)];
      if (nowS - ts < 8 * 86400) out.k.push([code, ts, Math.round((a.moving_time || 0) / 60)]);
    }
    out.k = out.k.sort((p, q) => q[1] - p[1]).slice(0, 24);
    if (latest) out.a = latest;
    const fresh = t.json.refresh_token;
    if (fresh && fresh !== String(b.token).trim()) out.rt = fresh;
    return out;
  } catch (e) {
    return { sx: e.status || 502 };
  }
}

// --- Calendars ------------------------------------------------------------

// Each setting may hold one link, or several separated by spaces or commas.
function feeds(b) {
  return [[b.cal1, "w"], [b.cal2, "p"]]
    .filter(([s]) => typeof s === "string" && s.trim())
    .flatMap(([s, src]) =>
      s.split(/[\s,]+/)
        .filter((u) => /^(https|webcal):\/\//i.test(u))
        .slice(0, 3)
        .map((url) => ({ url, src }))
    );
}

async function calendars(b, now) {
  const list = feeds(b);
  if (list.length === 0) return null;
  const results = await Promise.all(
    list.map((f) =>
      nextEvents(f.url, now)
        .then((r) => r && { next: r.next.map((ev) => [ev[0], ev[1], ev[2], f.src]), lastEnd: r.lastEnd })
        .catch(() => null)
    )
  );
  if (results.every((r) => r === null)) return null;
  const last = Math.max(0, ...results.map((r) => (r ? r.lastEnd : 0)));
  const seen = new Set();
  const e = results
    .flatMap((r) => (r ? r.next : []))
    .sort((p, q) => p[0] - q[0] || p[1] - q[1])
    .filter((ev) => {
      const key = ev.slice(0, 3).join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
  return { e, last };
}

// --- Setup pages ----------------------------------------------------------

const STYLE = `<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:640px;margin:2em auto;padding:0 1em;color:#222}
h1{font-size:1.5em}code{background:#f2f2f2;padding:2px 5px;border-radius:4px;word-break:break-all}
input{width:100%;padding:.6em;margin:.3em 0 1em;font:inherit;box-sizing:border-box}
button{background:#fc5200;color:#fff;border:0;padding:.7em 1.4em;font:inherit;border-radius:6px;cursor:pointer}
.box{background:#f7f7f7;padding:1em;border-radius:8px;margin:1em 0}li{margin:.4em 0}</style>`;

function guidePage(origin) {
  return `<!doctype html><title>Dot Matrix setup</title>${STYLE}
<h1>Dot Matrix watch face setup</h1>
<p>This is your own relay. Everything goes into the face's settings: on your phone open <b>Garmin Connect</b>
&gt; your watch &gt; Watch Faces &gt; Dot Matrix &gt; Settings. First set <b>Your relay URL</b> to
<code>${new URL(origin).host}</code>. The watch updates every 15 minutes.</p>
<h2>Calendar</h2>
<p>Paste a private iCal link into <b>Calendar 1</b> (shown orange) and optionally <b>Calendar 2</b> (blue):</p>
<ul>
<li><b>Google Calendar</b> (computer): Settings &gt; pick the calendar &gt; Integrate calendar &gt;
<b>Secret address in iCal format</b>.</li>
<li><b>iCloud</b>: Calendar app &gt; calendar info &gt; turn on <b>Public Calendar</b> &gt; copy the link.</li>
<li><b>Outlook</b>: Settings &gt; Calendar &gt; Shared calendars &gt; Publish a calendar &gt; copy the <b>ICS</b> link.</li>
</ul>
<p>Anyone with the link can read that calendar, so don't share it anywhere else.</p>
<h2>Strava</h2>
<p><a href="${origin}/strava">Get your Strava keys here</a> (about 3 minutes).</p>
<h2>Weather (optional)</h2>
<p>Weather works out of the box (Open-Meteo, free, no key). To use your own key instead, set
<b>Weather source</b> and paste the key into <b>Weather API key</b>:</p>
<ul>
<li><b>OpenWeatherMap</b>: free key at <a href="https://home.openweathermap.org/api_keys">openweathermap.org</a>
(new keys take up to 2 hours to start working).</li>
<li><b>Open-Meteo (paid key)</b>: for an Open-Meteo API subscription.</li>
</ul>
<p>The weather key goes straight from your phone to the weather service, not through this relay.
The face shows <b>key?</b> where the temperature goes if the key is refused.</p>
<h2>Privacy</h2>
<p>Your links and keys stay in your watch's settings. Every 15 minutes the watch sends them to this relay,
which runs on your own Cloudflare account, reads your next events and recent activities and sends back a
short summary. Nothing is stored.</p>`;
}

function stravaPage(origin) {
  const host = new URL(origin).host;
  return `<!doctype html><title>Strava keys for Dot Matrix</title>${STYLE}
<h1>Strava keys for Dot Matrix</h1>
<div id="start">
<p>You make your own small Strava "API app"; only you can use it.</p>
<ol>
<li>Open <a href="https://www.strava.com/settings/api" target="_blank">strava.com/settings/api</a> and create an app.
Name: anything (e.g. <i>My watch</i>). Category: Other. Website: <code>${origin}</code>.
<b>Authorization Callback Domain:</b> <code>${host}</code></li>
<li>Copy the <b>Client ID</b> and <b>Client Secret</b> from that page into here:</li>
</ol>
<label>Client ID<input id="cid" inputmode="numeric" autocomplete="off"></label>
<label>Client Secret<input id="csec" autocomplete="off"></label>
<button onclick="go()">Connect with Strava</button>
</div>
<div id="done" hidden>
<p>Done<span id="who"></span>. In <b>Garmin Connect</b> &gt; your watch &gt; Watch Faces &gt; Dot Matrix &gt; Settings, fill in:</p>
<div class="box">
<p>Strava Client ID<br><code id="o1"></code></p>
<p>Strava Client Secret<br><code id="o2"></code></p>
<p>Strava Refresh Token<br><code id="o3"></code></p>
</div>
<p>The face shows your newest activity within 15 minutes.</p>
</div>
<p id="err" style="color:#c00"></p>
<script>
const $ = (id) => document.getElementById(id);
function go() {
  const id = $("cid").value.trim(), sec = $("csec").value.trim();
  if (!/^\\d+$/.test(id) || sec.length < 20) { $("err").textContent = "Check the Client ID (a number) and Client Secret."; return; }
  sessionStorage.setItem("dm", JSON.stringify({ id, sec }));
  location.href = "https://www.strava.com/oauth/authorize?" + new URLSearchParams({
    client_id: id, response_type: "code", redirect_uri: location.origin + "/strava",
    approval_prompt: "force", scope: "activity:read_all" });
}
(async () => {
  const q = new URLSearchParams(location.search);
  if (q.get("error")) { $("err").textContent = "Strava access was not allowed. Try again and press Authorize."; return; }
  const code = q.get("code");
  if (!code) return;
  const saved = JSON.parse(sessionStorage.getItem("dm") || "null");
  if (!saved) { $("err").textContent = "Start again from this page (the keys are only kept in this tab)."; return; }
  if (!(q.get("scope") || "").includes("activity:read")) { $("err").textContent = "Please tick the box that lets the app see your activities, then try again."; return; }
  const r = await fetch("/strava/exchange", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: saved.id, secret: saved.sec, code }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) { $("err").textContent = "Strava said no (" + (j.error || r.status) + "). Check the Client Secret and that the callback domain is exactly ${host}."; return; }
  sessionStorage.removeItem("dm");
  history.replaceState(null, "", "/strava");
  $("start").hidden = true; $("done").hidden = false;
  $("o1").textContent = saved.id; $("o2").textContent = saved.sec; $("o3").textContent = j.token;
  if (j.name) $("who").textContent = ", " + j.name;
})();
</script>`;
}

async function exchange(request) {
  const b = await request.json().catch(() => ({}));
  if (!b.id || !b.secret || !b.code) return Response.json({ error: "missing" }, { status: 400 });
  const t = await stravaToken({
    client_id: String(b.id), client_secret: String(b.secret), code: String(b.code), grant_type: "authorization_code",
  });
  if (!t.ok) return Response.json({ error: t.status }, { status: 400 });
  return Response.json({ token: t.json.refresh_token, name: (t.json.athlete && t.json.athlete.firstname) || "" });
}

const html = (body) => new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET") {
      if (url.pathname === "/strava") return html(stravaPage(url.origin));
      if (url.pathname === "/") return html(guidePage(url.origin));
      return new Response("not found", { status: 404 });
    }
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    if (url.pathname === "/strava/exchange") return exchange(request);
    if (url.pathname !== "/") return new Response("not found", { status: 404 });

    const b = await request.json().catch(() => null);
    if (!b || typeof b !== "object") return new Response("bad request", { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    const [cal, sv] = await Promise.all([
      calendars(b, now).catch(() => null),
      strava(b, now).catch(() => ({ sx: 502 })),
    ]);
    const out = {};
    if (cal) {
      out.e = cal.e;
      if (cal.last) out.eh = cal.last;
    }
    if (sv) Object.assign(out, sv);
    return Response.json(out, { headers: { "Cache-Control": "no-store" } });
  },
};
