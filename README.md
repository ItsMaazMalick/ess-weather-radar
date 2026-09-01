# SkyPulse — Live Weather Radar Imagery & Display System

SkyPulse is a real-time meteorological weather radar platform and automated image fetcher. It connects directly to global Doppler radar networks and satellite feeds to provide live precipitation tracking, animated nowcasting loops, customizable color schemes, and Python CLI tools for image extraction.

![Sample Radar Output](sample_london_radar.png)

---

## 🌟 Key Features

1. **Interactive Real-Time Radar Map (Web UI)**:
   - **Global Doppler Radar**: Displays real-time Doppler radar scans worldwide via the RainViewer Open API.
   - **Time Machine Player**: Seamlessly scrub and animate between past radar scans (~2 hours history) and future AI/extrapolated nowcast predictions (~30–50 minutes ahead).
   - **Multiple Color Schemes**: Choose from 8 meteorological palettes (Standard, Universal Blue, TITAN Classic, The Weather Channel, Meteored Rainbow, NEXRAD Level-III, Rainbow HD, Dark Sky).
   - **Layer Controls**: Toggle precipitation smoothing, snow detection highlights, infrared satellite clouds, and custom layer opacity.
   - **Base Maps**: Switch between Dark Glow, Satellite Imagery, Clean Light (Voyager), and OpenStreetMap.
   - **Live Weather Metrics**: Real-time localized temperature, precipitation volume, wind speed, humidity, and barometric pressure powered by Open-Meteo.
   - **Global Search & Geolocation**: Instant city search with auto-complete and "My Location" GPS lock.
   - **Export & Snapshot**: Download annotated high-resolution PNG snapshots or copy shareable deep links.

2. **Standalone Python Radar Fetcher & GIF Generator (`fetch_radar.py`)**:
   - High-performance multithreaded tile fetching.
   - Generates composite radar images over dark canvas or OpenStreetMap basemaps.
   - Exports high-resolution PNG snapshots or multi-frame animated loop GIFs.
   - Auto-geocodes city names or accepts exact latitude/longitude coordinates.

---

## 🚀 Quick Start

### 1. Running the Interactive Web App
You can launch the web app with any static server:

```bash
# Using Python
python3 -m http.server 3000

# Or using Node.js
npm start
```
Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

### 2. Using the Python Radar CLI Tool (`fetch_radar.py`)

#### Fetch a single radar snapshot by city name:
```bash
python3 fetch_radar.py --city "London" --zoom 6 --output london_radar.png
```

#### Fetch radar snapshot by coordinates:
```bash
python3 fetch_radar.py --lat 40.7128 --lon -74.0060 --zoom 7 --output nyc_radar.png
```

#### Generate an animated radar loop GIF:
```bash
python3 fetch_radar.py --city "Tokyo" --zoom 6 --frames 8 --gif --output tokyo_loop.gif
```

#### Options & Arguments:
| Flag | Description | Default |
|---|---|---|
| `--city` | City name to geocode and center radar on | `"New York"` |
| `--lat`, `--lon` | Exact geographic coordinates | `40.7128`, `-74.0060` |
| `--zoom` | Map zoom level (4 to 10) | `6` |
| `--palette` | Radar color palette index (0–7) | `2` (TITAN) |
| `--smooth` | Bilinear smoothing (1 = on, 0 = off) | `1` |
| `--snow` | Highlight snow/freezing rain (1 = on, 0 = off) | `1` |
| `--radius` | Grid tile radius (`1` = 3x3 tiles / 768x768px, `2` = 5x5 tiles) | `1` |
| `--basemap` | Base map style (`dark` or `osm`) | `dark` |
| `--frames` | Number of recent radar scans to include in GIF | `6` |
| `--gif` | Export animated GIF loop | `False` |
| `--output` | Output filename (`.png` or `.gif`) | auto |

---

## ⌨️ Keyboard Shortcuts (Web App)
- `Space`: Play / Pause animated radar loop
- `→` / `←`: Step forward / backward by 1 frame (10-minute intervals)
- `L`: Jump immediately to latest live radar scan
- `S`: Open snapshot / image export dialog
- `M`: Center map to current GPS location
- `Esc`: Close modals and drawers

---

## 📡 Data Providers & APIs
- **Radar & Satellite Imagery**: [RainViewer Global API](https://www.rainviewer.com/api.html) (Free, no API key required).
- **Weather Metrics & Geocoding**: [Open-Meteo](https://open-meteo.com/) (Open-access meteorological forecast & geocoding).
- **Base Maps**: ESRI World Dark Canvas, CartoDB, & OpenStreetMap contributors.
