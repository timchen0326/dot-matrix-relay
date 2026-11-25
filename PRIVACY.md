# Dot Matrix watch face: privacy policy

Last updated: November 25, 2026

The developer of Dot Matrix does not collect, receive or store any of your
data. There is no developer server, account, analytics or tracking.

## What the watch face sends, and where

- **Weather:** every 15 minutes the watch sends its approximate location
  (latitude and longitude) to the weather service you choose in the settings:
  Open-Meteo (default) or OpenWeatherMap, with your own key if you add one.
  Their privacy policies apply: https://open-meteo.com/en/terms and
  https://openweather.co.uk/privacy-policy.
- **Calendar and Strava (optional):** if you set them up, the watch sends your
  calendar links and Strava API keys to **your own relay**, which runs on your
  own Cloudflare account. Your relay uses them to read your calendar (from
  Google, Apple or Microsoft) and your recent activities (from Strava), sends a
  short summary back to the watch, and stores nothing. The developer has no
  access to your relay.
- **On the watch:** heart rate, steps and battery are read on the watch and
  never leave it. The latest weather, events and activities are cached on the
  watch so the face can show them.

## Where your settings are kept

Your relay URL, calendar links and keys are stored in the watch face's settings
on your watch and in your Garmin Connect app, under Garmin's privacy policy
(https://www.garmin.com/privacy/connect/).

## Removing your data

Uninstall the watch face to remove everything it stored on your watch. Delete
your relay in your Cloudflare dashboard. To revoke Strava access, remove the app
at https://www.strava.com/settings/apps.

## Contact

Questions: https://github.com/timchen0326/dot-matrix-relay/issues
