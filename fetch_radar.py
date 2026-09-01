#!/usr/bin/env python3
"""
SkyPulse Radar Fetcher & Compositor CLI
Fetch real-time weather radar images, composite radar overlays on base maps,
and export high-resolution PNGs or animated GIFs.

Usage:
  python3 fetch_radar.py --city "New York" --output ny_radar.png
  python3 fetch_radar.py --lat 51.5074 --lon -0.1278 --zoom 8 --gif --output london_radar.gif
  python3 fetch_radar.py --city "Tokyo" --frames 6 --palette 2 --output tokyo.gif
"""

import argparse
import datetime
import io
import json
import math
import os
import sys
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont

# Constants
RAINVIEWER_API_URL = "https://api.rainviewer.com/public/weather-maps.json"
GEOCODING_API_URL = "https://geocoding-api.open-meteo.com/v1/search"
# ESRI Dark Canvas & OSM
ESRI_DARK_TEMPLATE = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
OSM_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SkyPulse-Radar/1.0"
}

def lat_lon_to_tile(lat, lon, zoom):
    """Convert latitude, longitude to slippy map tile (x, y)."""
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y

def geocode_city(city_name):
    """Geocode a city name using Open-Meteo Geocoding API."""
    params = urllib.parse.urlencode({"name": city_name, "count": 1, "format": "json"})
    url = f"{GEOCODING_API_URL}?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=8) as resp:
        data = json.loads(resp.read().decode())
        if not data.get("results"):
            raise ValueError(f"Could not find coordinates for city: '{city_name}'")
        res = data["results"][0]
        name = res.get("name", city_name)
        country = res.get("country", "")
        return res["latitude"], res["longitude"], f"{name}, {country}".strip(", ")

def fetch_image_from_url(url):
    """Fetch an image from URL and return PIL Image or None on failure."""
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=5) as resp:
            img_data = resp.read()
            return Image.open(io.BytesIO(img_data)).convert("RGBA")
    except Exception:
        # Tile may not exist or be blank
        return None

def fetch_rainviewer_metadata():
    """Fetch radar frames metadata from RainViewer."""
    req = urllib.request.Request(RAINVIEWER_API_URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.loads(resp.read().decode())

def compose_radar_image(center_lat, center_lon, zoom, radar_path, host, palette=2, smooth=1, snow=1, grid_radius=1, base_style="dark", location_title="", timestamp_str=""):
    """
    Composite a grid of tiles concurrently around center_lat, center_lon.
    Uses native radar zoom <= 7 with upscale if zoom > 7.
    """
    tile_size = 256
    grid_span = 2 * grid_radius + 1
    total_w = grid_span * tile_size
    total_h = grid_span * tile_size
    
    # Calculate base map tile coords
    center_x, center_y = lat_lon_to_tile(center_lat, center_lon, zoom)
    
    # Cap radar zoom to 7 (RainViewer max public zoom)
    radar_zoom = min(zoom, 7)
    rc_x, rc_y = lat_lon_to_tile(center_lat, center_lon, radar_zoom)

    composite = Image.new("RGBA", (total_w, total_h), (10, 14, 23, 255))
    radar_overlay = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))

    # Base map tiles
    base_tasks = []
    for dy in range(-grid_radius, grid_radius + 1):
        for dx in range(-grid_radius, grid_radius + 1):
            tx = center_x + dx
            ty = center_y + dy
            px = (dx + grid_radius) * tile_size
            py = (dy + grid_radius) * tile_size
            
            if base_style == "dark":
                base_url = ESRI_DARK_TEMPLATE.format(z=zoom, y=ty, x=tx)
            else:
                base_url = OSM_TEMPLATE.format(z=zoom, x=tx, y=ty)
            base_tasks.append((px, py, base_url))

    def fetch_base(task):
        px, py, url = task
        return px, py, fetch_image_from_url(url)

    with ThreadPoolExecutor(max_workers=16) as executor:
        for px, py, tile in executor.map(fetch_base, base_tasks):
            if tile:
                composite.paste(tile, (px, py))

    # Radar tiles: fetch covering area at radar_zoom
    radar_tasks = []
    if radar_zoom == zoom:
        for dy in range(-grid_radius, grid_radius + 1):
            for dx in range(-grid_radius, grid_radius + 1):
                tx = rc_x + dx
                ty = rc_y + dy
                px = (dx + grid_radius) * tile_size
                py = (dy + grid_radius) * tile_size
                r_url = f"{host}{radar_path}/256/{radar_zoom}/{tx}/{ty}/{palette}/{smooth}_{snow}.png"
                radar_tasks.append((px, py, r_url, tile_size))
    else:
        # Scale difference
        scale = 2 ** (zoom - radar_zoom)
        # Fetch tiles around rc_x, rc_y
        r_radius = max(1, math.ceil(grid_radius / scale))
        temp_radar = Image.new("RGBA", ((2 * r_radius + 1) * tile_size, (2 * r_radius + 1) * tile_size), (0, 0, 0, 0))
        
        for dy in range(-r_radius, r_radius + 1):
            for dx in range(-r_radius, r_radius + 1):
                tx = rc_x + dx
                ty = rc_y + dy
                px = (dx + r_radius) * tile_size
                py = (dy + r_radius) * tile_size
                r_url = f"{host}{radar_path}/256/{radar_zoom}/{tx}/{ty}/{palette}/{smooth}_{snow}.png"
                radar_tasks.append((px, py, r_url, tile_size))

    def fetch_radar(task):
        px, py, url, size = task
        return px, py, fetch_image_from_url(url)

    if radar_zoom == zoom:
        with ThreadPoolExecutor(max_workers=16) as executor:
            for px, py, tile in executor.map(fetch_radar, radar_tasks):
                if tile:
                    radar_overlay.paste(tile, (px, py), tile)
    else:
        # Composite temp radar and scale
        r_radius = max(1, math.ceil(grid_radius / (2 ** (zoom - radar_zoom))))
        temp_w = (2 * r_radius + 1) * tile_size
        temp_radar = Image.new("RGBA", (temp_w, temp_w), (0, 0, 0, 0))
        with ThreadPoolExecutor(max_workers=16) as executor:
            for px, py, tile in executor.map(fetch_radar, radar_tasks):
                if tile:
                    temp_radar.paste(tile, (px, py), tile)
        # Resize to match
        scale = 2 ** (zoom - radar_zoom)
        resized_w = int(temp_w * scale)
        temp_radar = temp_radar.resize((resized_w, resized_w), Image.BILINEAR)
        # Center crop
        crop_x = (resized_w - total_w) // 2
        crop_y = (resized_w - total_h) // 2
        if crop_x >= 0 and crop_y >= 0:
            radar_overlay = temp_radar.crop((crop_x, crop_y, crop_x + total_w, crop_y + total_h))
        else:
            radar_overlay.paste(temp_radar, (-crop_x, -crop_y), temp_radar)

    # Apply soft edge feathering mask so Doppler merges seamlessly into map corners
    mask = Image.new("L", (total_w, total_h), 255)
    mask_draw = ImageDraw.Draw(mask)
    margin = 32
    for i in range(margin):
        alpha_val = int(255 * (i / margin))
        mask_draw.rectangle([i, i, total_w - 1 - i, total_h - 1 - i], outline=alpha_val)
    
    # Combine alpha channels
    r, g, b, a = radar_overlay.split()
    feathered_a = Image.composite(a, Image.new("L", (total_w, total_h), 0), mask)
    radar_overlay.putalpha(feathered_a)

    composite = Image.alpha_composite(composite, radar_overlay)
    
    # Draw bottom HUD bar (Earth Scan Systems Light Theme)
    hud_h = 50
    hud_bg = Image.new("RGBA", (total_w, hud_h), (255, 255, 255, 240))
    composite.paste(hud_bg, (0, total_h - hud_h), hud_bg)
    
    draw = ImageDraw.Draw(composite)
    
    # Title & Info
    title = location_title or f"Earth Scan Systems • Pakistan (Zoom {zoom})"
    draw.text((16, total_h - 40), title, fill=(15, 23, 42, 255))
    
    if timestamp_str:
        draw.text((16, total_h - 22), f"Observation: {timestamp_str}", fill=(22, 129, 78, 255))
        
    draw.text((total_w - 240, total_h - 30), "EARTH SCAN SYSTEMS", fill=(22, 129, 78, 255))
    
    return composite

def main():
    parser = argparse.ArgumentParser(description="Fetch and composite real-time weather radar images.")
    parser.add_argument("--city", type=str, help="City name to fetch radar for (e.g. 'London', 'New York', 'Tokyo')")
    parser.add_argument("--lat", type=float, help="Center latitude")
    parser.add_argument("--lon", type=float, help="Center longitude")
    parser.add_argument("--zoom", type=int, default=6, help="Radar zoom level (default: 6, range: 4-10)")
    parser.add_argument("--palette", type=int, default=2, help="Radar color scheme (0-7, default: 2 TITAN)")
    parser.add_argument("--smooth", type=int, default=1, help="Precipitation smoothing (0 or 1, default: 1)")
    parser.add_argument("--snow", type=int, default=1, help="Snow detection highlight (0 or 1, default: 1)")
    parser.add_argument("--radius", type=int, default=1, help="Tile grid radius: 1 => 3x3 tiles (768x768px), 2 => 5x5 tiles")
    parser.add_argument("--basemap", choices=["osm", "dark", "satellite"], default="osm", help="Base map style (default: osm full color)")
    parser.add_argument("--frames", type=int, default=6, help="Number of recent frames to include in GIF (default: 6)")
    parser.add_argument("--gif", action="store_true", help="Export animated loop GIF instead of static PNG")
    parser.add_argument("--output", type=str, default="", help="Output file path (e.g. radar.png or radar.gif)")

    args = parser.parse_args()

    # Determine location coordinates
    title = ""
    if args.city:
        print(f"[*] Geocoding city: {args.city}...")
        lat, lon, title = geocode_city(args.city)
        print(f"[*] Found coordinates: Lat {lat:.4f}, Lon {lon:.4f} ({title})")
    elif args.lat is not None and args.lon is not None:
        lat, lon = args.lat, args.lon
        title = f"Lat: {lat:.3f}, Lon: {lon:.3f}"
    else:
        print("[!] No location provided, defaulting to New York City...")
        lat, lon, title = 40.7128, -74.0060, "New York, USA"

    zoom = max(4, min(10, args.zoom))

    print("[*] Fetching live radar scan metadata from RainViewer API...")
    meta = fetch_rainviewer_metadata()
    host = meta.get("host", "https://tilecache.rainviewer.com")
    past_scans = meta.get("radar", {}).get("past", [])

    if not past_scans:
        print("[!] Error: No radar frames found in RainViewer response.")
        sys.exit(1)

    print(f"[*] Available past scans: {len(past_scans)} frames")

    output_filename = args.output
    if not output_filename:
        output_filename = "radar_animation.gif" if args.gif else "radar_snapshot.png"

    if args.gif or output_filename.lower().endswith(".gif"):
        num_frames = min(args.frames, len(past_scans))
        selected_scans = past_scans[-num_frames:]
        print(f"[*] Generating animated GIF with {len(selected_scans)} frames...")

        composed_frames = []
        for i, scan in enumerate(selected_scans):
            t_str = datetime.datetime.fromtimestamp(scan["time"], tz=datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            print(f"  [{i+1}/{len(selected_scans)}] Compositing frame: {t_str}...")
            img = compose_radar_image(
                center_lat=lat,
                center_lon=lon,
                zoom=zoom,
                radar_path=scan["path"],
                host=host,
                palette=args.palette,
                smooth=args.smooth,
                snow=args.snow,
                grid_radius=args.radius,
                base_style=args.basemap,
                location_title=title,
                timestamp_str=t_str
            )
            composed_frames.append(img.convert("RGB"))

        if composed_frames:
            composed_frames[0].save(
                output_filename,
                save_all=True,
                append_images=composed_frames[1:],
                duration=400,
                loop=0,
                optimize=True
            )
            print(f"\n[+] Successfully created animated radar GIF: {os.path.abspath(output_filename)}")
    else:
        latest_scan = past_scans[-1]
        t_str = datetime.datetime.fromtimestamp(latest_scan["time"], tz=datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        print(f"[*] Compositing latest radar scan: {t_str}...")
        img = compose_radar_image(
            center_lat=lat,
            center_lon=lon,
            zoom=zoom,
            radar_path=latest_scan["path"],
            host=host,
            palette=args.palette,
            smooth=args.smooth,
            snow=args.snow,
            grid_radius=args.radius,
            base_style=args.basemap,
            location_title=title,
            timestamp_str=t_str
        )
        img.save(output_filename)
        print(f"\n[+] Successfully saved radar image to: {os.path.abspath(output_filename)}")

if __name__ == "__main__":
    main()
