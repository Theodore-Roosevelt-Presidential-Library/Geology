# Read the Rocks (Geology)

Geology explorer for Theodore Roosevelt National Park and the North Dakota Badlands. A Theodore Roosevelt Presidential Library Labs tool.

**Live:** https://geology.labs.trlibrary.com (GitHub Pages)

## What's in it

| Section | What it does | Data |
|---|---|---|
| Explore the Map | Colored geologic map of the park. Tap anywhere for the rock layer, its age, a plain-language story, what to look for and the elevation. "Use my location" follows you and updates the card when you cross into a new layer. Every spot has a share link and directions. Outside the park map, taps fall back to the USGS state bedrock map (via Macrostrat), so it works anywhere in the U.S. | `data/geology.topo.json`, `data/units.json`, Macrostrat API |
| Drive-along | Riding through the park, notes pop up (and can be read aloud) as the phone reaches each stop on the South Unit Scenic Loop and the North Unit Scenic Drive. Keeps the screen awake; optional spoken alerts when you cross into a new rock layer. Start it from the map sidebar or Where to See It | `data/drive.json` |
| Read the Layers | Clickable layer-cake column, oldest at the bottom, plus the younger deposits cut into it | `data/units.json` |
| Where to See It | 15 pullouts and trails with what to look for, map links and directions | `data/stops.json` |
| Landslide layer | Optional map layer of the North Dakota Geological Survey's statewide landslide inventory (about 59,500 landslides, mapped 2016 to 2023), drawn live by the state's map server in the tool's colors. With the layer on, tapped spots also say whether they sit inside a mapped landslide | NDGS map service (ND GIS Hub) |
| How the Badlands Formed | Nine-chapter timeline, from the swamp forests and Fossil Lake Wannagan to the glacier that turned the river | in `assets/app.js` (`STORY`) |

## Links and embedding

Share links: `https://geology.labs.trlibrary.com/?at=46.93143,-103.48537&z=15#map`.
Other links: `?stop=n-oxbow`, `?unit=Tsbc` (highlights a layer), `#layers`, `#stops`, `#story`.

Drop this into a Drupal Full HTML block. Each `div` becomes a self-sizing widget.

```html
<div data-read-the-rocks="map"></div>
<script src="https://geology.labs.trlibrary.com/embed.js" async></script>
```

Views: `map`, `layers`, `stops`, `story`, or `all` (tabs included).
Options: `data-stop="coalvein"`, `data-unit="Tsbb"`, `data-at="lat,lng"`, `data-min-height="900"`.
The embed grants the iframe geolocation so "Use my location" works on trlibrary.com.

## Data

- **Park geology:** NPS Geologic Resources Inventory, *Digital Geologic-GIS Map of Theodore Roosevelt National Park and Vicinity* (THRO, 2020), [DataStore 1044329](https://irma.nps.gov/DataStore/Reference/Profile/1044329). Source maps: Biek & Gonzalez (2001, NDGS Misc. Series 86) and Gonzalez (2004, NDGS 24K quadrangles). Public domain.
- Converted with `scripts/build_geology.py`: polygons simplified to about 5 m, reprojected to WGS84 and packed as TopoJSON (about 1.1 MB over the wire).
- **Beyond the park and elevation:** [Macrostrat](https://macrostrat.org) API (CC BY 4.0), live in the browser, from the USGS State Geologic Map Compilation.
- **Statewide landslides:** North Dakota Geological Survey landslide inventory, `https://ndgishub.nd.gov/arcgis/rest/services/All_Geology/MapServer/4`. Tiles come from the service's `export` endpoint with a `dynamicLayers` style; tap checks use its `query` endpoint. Shown from zoom 9 in.
- **Fossil Lake Wannagan:** Erickson, B.R., 1999, NDGS Miscellaneous Series 87.
- **Base maps:** USGS The National Map (Topo, Shaded Relief, Imagery).
- **Photos:** `assets/photos/` with credits in `assets/photos/credits.json`. Wikimedia Commons, public domain or CC BY-SA. To swap in Acquia DAM photos, replace a file with the same name and update its credit.

To rebuild the map data:

```
pip install pyogrio geopandas && npm i topojson-server@3.0.1
python3 scripts/build_geology.py thro_geology.gdb data node_modules/.bin
```

## Editing content

- Rock-layer text, colors, Roosevelt quotes: `data/units.json`
- Drive-along notes and trigger radius: `data/drive.json` (notes are read aloud, so keep them to two or three sentences)
- Stops: `data/stops.json` (coordinates and their sources are listed in `docs/fact-check.md`)
- Timeline: `STORY` in `assets/app.js`

Fonts load from trlibrary.com (Clearface, Dharma Gothic E, Frutiger).

## Setup checklist

1. Settings → Pages: deploy from `main`, root folder. Custom domain `geology.labs.trlibrary.com` (the `CNAME` file is included); enforce HTTPS.
2. DNS: CNAME `geology.labs` → `theodore-roosevelt-presidential-library.github.io`.

See `docs/fact-check.md` for sources and items to verify before the trlibrary.com page goes live, and `docs/trlibrary-page-draft.md` for draft page copy.
