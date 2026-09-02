#!/usr/bin/env python3
"""
ESS WeatherWatch Pakistan - Production HTTP & High-Speed Animated GIF Server
Serves static assets and provides instant real-time animated radar GIF compositing.
"""

import http.server
import socketserver
import urllib.parse
import urllib.request
import os
import io
import json
import datetime
import math
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw

# Runs behind the Node analytics server, which proxies /api/generate-gif here.
# Override with PORT when running this service standalone.
PORT = int(os.environ.get("PORT", 3001))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

RAINVIEWER_API_URL = "https://api.rainviewer.com/public/weather-maps.json"
TOPO_TEMPLATE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
OSM_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ESS-WeatherWatch/1.0"}

def lat_lon_to_tile(lat, lon, zoom):
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y

def fetch_image_from_url(url):
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=4) as resp:
            return Image.open(io.BytesIO(resp.read()))
    except Exception:
        return None

class ESSWeatherHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/generate-gif":
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
        else:
            super().do_HEAD()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/generate-gif":
            self.handle_generate_gif(parsed.query)
        else:
            super().do_GET()

    def handle_generate_gif(self, query_str):
        params = urllib.parse.parse_qs(query_str)
        lat = float(params.get("lat", [30.3753])[0])
        lon = float(params.get("lon", [69.3451])[0])
        zoom = int(params.get("zoom", [6])[0])
        frames_count = min(int(params.get("frames", [6])[0]), 8)

        try:
            req = urllib.request.Request(RAINVIEWER_API_URL, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=6) as resp:
                meta = json.loads(resp.read().decode())
            
            host = meta.get("host", "https://tilecache.rainviewer.com")
            past_frames = meta.get("radar", {}).get("past", [])
            
            if not past_frames:
                self.send_error(500, "No radar frames available")
                return

            selected_frames = past_frames[-frames_count:]
            
            # Base Map: 3x3 tiles centered on lat, lon
            center_x, center_y = lat_lon_to_tile(lat, lon, zoom)
            tile_size = 256
            grid_radius = 1
            total_w = (2 * grid_radius + 1) * tile_size
            total_h = (2 * grid_radius + 1) * tile_size

            base_img = Image.new("RGB", (total_w, total_h), (248, 250, 252))
            base_tasks = []
            for dy in range(-grid_radius, grid_radius + 1):
                for dx in range(-grid_radius, grid_radius + 1):
                    tx = center_x + dx
                    ty = center_y + dy
                    px = (dx + grid_radius) * tile_size
                    py = (dy + grid_radius) * tile_size
                    url = TOPO_TEMPLATE.format(z=zoom, x=tx, y=ty)
                    base_tasks.append((px, py, url))

            def fetch_base(item):
                px, py, url = item
                img = fetch_image_from_url(url)
                return px, py, img.convert("RGB") if img else None

            with ThreadPoolExecutor(max_workers=9) as ex:
                for px, py, tile in ex.map(fetch_base, base_tasks):
                    if tile:
                        base_img.paste(tile, (px, py))

            # Radar tiles for each frame
            radar_zoom = min(zoom, 7)
            rc_x, rc_y = lat_lon_to_tile(lat, lon, radar_zoom)

            def render_frame(frame_item):
                frame, idx = frame_item
                comp = base_img.copy().convert("RGBA")
                radar_layer = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))

                radar_tasks = []
                for dy in range(-grid_radius, grid_radius + 1):
                    for dx in range(-grid_radius, grid_radius + 1):
                        tx = rc_x + dx
                        ty = rc_y + dy
                        px = (dx + grid_radius) * tile_size
                        py = (dy + grid_radius) * tile_size
                        r_url = f"{host}{frame['path']}/256/{radar_zoom}/{tx}/{ty}/2/1_1.png"
                        radar_tasks.append((px, py, r_url))

                def fetch_radar(item):
                    px, py, url = item
                    img = fetch_image_from_url(url)
                    return px, py, img.convert("RGBA") if img else None

                with ThreadPoolExecutor(max_workers=9) as rex:
                    for px, py, r_tile in rex.map(fetch_radar, radar_tasks):
                        if r_tile:
                            radar_layer.paste(r_tile, (px, py), r_tile)

                comp = Image.alpha_composite(comp, radar_layer)

                # ESS Light Theme Header Watermark
                draw = ImageDraw.Draw(comp)
                draw.rectangle([0, 0, total_w, 48], fill=(255, 255, 255, 240), outline=(22, 129, 78, 200))
                draw.text((16, 10), "EARTH SCAN SYSTEMS", fill=(22, 129, 78, 255))
                draw.text((16, 28), "ESS WeatherWatch • Pakistan Live Radar", fill=(100, 116, 139, 255))

                pkt_dt = datetime.datetime.fromtimestamp(frame["time"], tz=datetime.timezone.utc) + datetime.timedelta(hours=5)
                pkt_str = pkt_dt.strftime("%I:%M %p PKT")
                draw.text((total_w - 140, 18), pkt_str, fill=(22, 129, 78, 255))

                return comp.convert("P", palette=Image.ADAPTIVE)

            with ThreadPoolExecutor(max_workers=frames_count) as f_ex:
                pil_frames = list(f_ex.map(render_frame, [(f, i) for i, f in enumerate(selected_frames)]))

            # Save animated GIF in memory
            buf = io.BytesIO()
            pil_frames[0].save(
                buf,
                format="GIF",
                save_all=True,
                append_images=pil_frames[1:],
                optimize=True,
                duration=350,
                loop=0
            )
            gif_bytes = buf.getvalue()

            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.send_header("Content-Disposition", 'attachment; filename="ESS_WeatherWatch_Pakistan_Animation.gif"')
            self.send_header("Content-Length", str(len(gif_bytes)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(gif_bytes)

        except Exception as e:
            self.send_error(500, f"Error generating GIF: {e}")

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == "__main__":
    try:
        with ReusableTCPServer(("", PORT), ESSWeatherHandler) as httpd:
            print(f"[*] ESS WeatherWatch Server running at http://localhost:{PORT}")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Stopping server...")
    except Exception as e:
        print(f"[!] Server error: {e}")
