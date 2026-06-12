# UGHD Studios — Infinite Grid Work Gallery

A Phantom.land-inspired portfolio gallery: a flat, uniform grid of project
cards that loops seamlessly in every direction, viewed through a fisheye lens
post-pass that makes it read like the inside of a sphere. Built with
Three.js + GSAP on Vite (vanilla JS, no framework).

## Run

```bash
npm install
npm run dev        # http://localhost:5180 (or default 5173)
npm run build      # production build → dist/
npm run verify     # headless Chrome interaction test + screenshots → /tmp/ughd-shots
```

> Node is installed locally at `~/.local/node/bin` on this machine — add it to
> PATH if `npm` isn't found: `export PATH="$HOME/.local/node/bin:$PATH"`

## How it works

- **Infinite grid** — 12 × 12 flat tiles (one shared `PlaneGeometry`), wrapped
  modulo the grid's world size around whatever the camera looks at, so drag /
  scroll loops endlessly on both axes. 144 tiles cycle through 34 projects.
- **Fisheye lens** — the scene renders into a `WebGLRenderTarget`, then a
  fullscreen shader applies barrel distortion (centre magnified, corners
  pinned) plus progressive edge blur and darkening. Pointer raycasts go
  through the same mapping so hover/click stay accurate under the warp.
- **Card faces** — painted to per-project `CanvasTexture`s (client name,
  title, tag pills, year, cover-fit artwork) after webfonts load; duplicate
  tiles share textures.
- **Drag / inertia** — pointer drag updates a target scroll offset on both
  axes; the render loop lerps toward it (lenis-style easing), with a velocity
  throw on release, mouse parallax, and a slow idle drift.
- **Detail page** — clicking a card flies the camera into the tile while the
  lens flattens to zero, then a GSAP timeline slides the overlay in with
  staggered content. YouTube projects autoplay an embed; artwork projects
  show the image.
- **Filter** — no tiles move. The grid ripple-fades in place: matching
  projects reappear on the tiles nearest the current view in full colour,
  and every other tile refills with non-matching work, greyed out
  (desaturation uniform + reduced opacity).

## Content

`src/data.js` holds all 34 projects extracted from lyricvideo.tv,
ughdstudios.com and umesh.design (YouTube IDs from the live portfolio embeds;
thumbnails cached in `public/thumbs/`). makelyricvideo.com is the SaaS
product — no portfolio items there. Edit `src/data.js` to add/remove work.
