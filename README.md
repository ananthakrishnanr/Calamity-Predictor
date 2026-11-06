# Calamity Risk Estimator

A single-page, no-build web app that estimates how likely heavy rain / flooding, heat and strong wind are for a place and month, from 1991 to last full year of ERA5 reanalysis data via [Open-Meteo](https://open-meteo.com) (free, no API key).

**This is a statistical climatology estimate, not a weather forecast.** Nobody can forecast daily weather for a future year. Check IMD / local authorities for real warnings.

## Run

Open `index.html` in a browser (or `python3 -m http.server` in this folder). Needs internet for the data, Chart.js 4.4.1 and Leaflet 1.9.4 (cdnjs) and OpenStreetMap tiles.
Self-check of the stats functions: open `index.html?test=1`.

## How it works (`app.js`)
1. `geocode` finds the place; `getJSON` fetches and caches responses in localStorage.
2. `monthMetrics` computes per-year metrics for the chosen month (total rain, wettest day, days >64.5 mm and >115.6 mm, hottest day, days >40 °C, strongest gust).
3. `forecast` fits a least-squares line (`linearTrend`) and adds the 10th–90th percentile of the residuals (`percentile`) for the range. Under 15 years it uses the mean and flags low confidence.
4. `probability` averages the raw share of past years above a threshold with the share after shifting onto the trend.
5. `gridPoints` / `areaStats` sample 3×3 points at ±10 km (one multi-point API call, last 15 years, rain only) and rank them by mean monthly rain and heavy-rain days.

Hazard definitions: flood-level = wettest day >64.5 mm (IMD heavy rain); very heavy = >115.6 mm; heat = at least one day >40 °C; storm = gust >90 km/h (gusts are only a proxy for cyclones).

## Limits
- ERA5 is a ~25 km grid. Rain extremes are smoothed, so real street-level peaks are higher. Several of the 9 map points often fall in the same grid cell, so area differences are coarse.
- Linear trend only: no seasonality shifts, ENSO / monsoon cycles or non-linear change. Yearly swings are much larger than the trend.
- Rain totals use calendar months; the hazards use the single worst day per year, so probabilities are "at least one such day in the month".
- Elevation is the grid-cell elevation from the API, not a street-level height. Neighbourhood names are not shown.
- Open-Meteo's free tier is rate-limited; cached results are reused.
- The 90 km/h gust and 40 °C thresholds are simple choices, not official cyclone or heatwave definitions.

## Next steps
- Better models: ARIMA or an ML model with climate indices (ENSO, IOD).
- IMD station data to correct the reanalysis bias.
- GDACS (or IBTrACS) cyclone tracks for real cyclone frequency instead of a gust proxy.
- Finer-resolution elevation / flood-plain data for area ranking.
