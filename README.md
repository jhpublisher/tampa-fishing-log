# Tampa Bay Fishing Log

A phone-friendly web page for logging fishing trips around Tampa Bay.
Live: https://jhpublisher.github.io/tampa-fishing-log/

**Round 1 features:** trip log with map pin, catches (species, size, bait, kept), catch photos (time/location read from the photo when available), notes, NOAA tide charts for every Tampa Bay station, moon phase and solunar times, a 7-day "best times" score, and Tampa Bay species with FWC limits.

## How it's built
Plain HTML/CSS/JavaScript, no build step. Hosted on GitHub Pages from `main`.
Libraries are in `vendor/` (Leaflet, SunCalc, supabase-js).

## Data (Supabase)
- Trips live in the `trips` table and photos in the private `catch-photos` bucket.
- Run `supabase/setup.sql` once in the Supabase SQL Editor to create them.
- Each user signs in with email and password and can only see their own data (row-level security).
- Settings are in `js/config.js`. The publishable key is safe to be public.

## Run it locally
`python3 -m http.server` in this folder, then open http://localhost:8000.

## Rules data
FWC limits live in `js/species.js` and were compiled 2026-11-26. Confirm at myfwc.com before keeping fish; rules change.
