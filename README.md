# Durga Puja Pandal Map

A browser-based map for the bundled Durga Puja pandal CSV. The app always loads the supplied CSV when the page opens; there is no import control.

## Run locally

From this folder, run:

```powershell
py -m http.server 8000
```

Then open http://localhost:8000 in a browser. The app automatically loads `pandal-data.csv`.

## Current CSV mapping

The supplied file is mapped as follows:

- `Name` -> Puja Organizer
- `Theme 2026` -> Theme Name
- `Lat` -> latitude
- `Lon` -> longitude
- `Landmark` -> address / location

The map uses free OpenStreetMap tiles, Leaflet, and Papa Parse from public CDNs, so an internet connection is needed while running it.
