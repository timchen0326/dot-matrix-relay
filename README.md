# Dot Matrix relay: set up your own (free, about 10 minutes)

The Dot Matrix watch face shows your next calendar event and your newest Strava
activity. Your watch can't read calendar files or Strava directly, so it asks
a tiny program, the relay, that you run on your own free Cloudflare account.
It only reads what your watch sends it and stores nothing. Weather works
without it.

## 1. Deploy the relay

**Easiest:** press the button, sign in to (or create) a free Cloudflare
account, and follow the steps.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/timchen0326/dot-matrix-relay)

When it's done, Cloudflare shows your relay's address, like
`https://dot-matrix-relay.yourname.workers.dev`. Open it in a browser: that
page is your setup guide.

**Or from a terminal** (needs Node.js):
```
npm install -g wrangler
wrangler login
git clone https://github.com/timchen0326/dot-matrix-relay
cd dot-matrix-relay
wrangler deploy
```

## 2. Fill in the watch face settings

On your phone: Garmin Connect > your watch > Watch Faces > Dot Matrix > Settings.

- **Your relay URL**: the address from step 1.
- **Calendar 1 / Calendar 2**: private iCal links (Calendar 1 shows orange,
  Calendar 2 blue). Your relay's page explains where to find them for Google,
  iCloud and Outlook.
- **Strava**: open `/strava` on your relay (e.g.
  `https://dot-matrix-relay.yourname.workers.dev/strava`) and follow it. It
  gives you the Client ID, Client Secret and Refresh Token to paste in.
- **Weather** (optional): Open-Meteo works with no key; or pick OpenWeatherMap
  and paste your key.

The face updates within 15 minutes. If something is wrong it says so on the
face: "add your relay in settings", "Strava error 401" (check the Strava keys),
"key?" in place of the temperature (weather key refused).

## Cost

Free. Cloudflare's free plan allows 100,000 requests a day; your watch makes
about 100.

## What's in here

- `worker.js`: the relay (POST from the watch, plus the setup pages `/` and `/strava`)
- `calendar.js`: reads iCal feeds (time zones, repeating events, edits and cancellations)

The relay never stores anything: no database, no logs of your links or keys.
