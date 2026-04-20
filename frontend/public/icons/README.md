# PWA Icons

Drop real PNG icons here before shipping:
- `icon-192.png` — 192×192
- `icon-512.png` — 512×512
- `icon-512-maskable.png` — 512×512, with ~20% safe area padding for maskable display

Until then the PWA manifest will reference missing files and installability will be limited. You can generate all three from `public/favicon.svg` with any SVG-to-PNG tool (e.g. `pwa-asset-generator`).
