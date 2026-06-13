# UGHD Studios — Project Guide

Portfolio site for UGHD Studios. Vanilla JS, no framework. Three.js + GSAP on
Vite. Multi-page static build deployed to Cloudflare Pages (auto-deploy from
GitHub `main`).

## Rules
- Do not make code changes until you have ~95% confidence in what to build. Ask
  follow-up questions first. Use plan mode for anything non-trivial.
- **Careers: strip all salary/compensation from job listings before publishing
  on careers.html.**
- Never commit `.dev.vars` (secrets). Push/commit only when I ask.

## Commands
- `npm run dev` — Vite dev server (http://localhost:5180, fallback 5173)
- `npm run dev:full` — Vite behind `wrangler pages dev` (tests the Function too)
- `npm run build` — production build → `dist/`
- `npm run verify` — headless Chrome interaction test + screenshots → /tmp/ughd-shots
- Node is at `~/.local/node/bin`. If `npm` isn't found:
  `export PATH="$HOME/.local/node/bin:$PATH"`

## Pages (Vite inputs)
`index.html` (gallery) · `about.html` · `careers.html` — all registered in
[vite.config.js](vite.config.js).

## Structure
- [src/data.js](src/data.js) — all 34 projects (single source of content; edit here to add/remove work)
- [src/main.js](src/main.js) — gallery: infinite 12×12 grid + fisheye lens shader
- [src/leadform.js](src/leadform.js) — lead form UI
- [src/careers.js](src/careers.js) · [src/about.js](src/about.js) · [src/pages.js](src/pages.js) — page logic
- [src/audio.js](src/audio.js) — background music · [src/navpill.js](src/navpill.js) — nav
- [src/vr.js](src/vr.js) — WebXR/VR prototype (active on branch `vr-webxr-prototype`)
- [functions/api/lead.js](functions/api/lead.js) — Cloudflare Pages Function: lead form → ClickUp + Resend email
- `scripts/*.mjs` — Puppeteer verify/check scripts · `public/thumbs/` — cached project art

## How the gallery works (see [README.md](README.md) for full detail)
Flat looping grid of `CanvasTexture` cards rendered to a `WebGLRenderTarget`,
then a fullscreen barrel-distortion shader (centre magnified, edges blurred/
darkened). Drag = lerped scroll offset on both axes; click flies camera into
tile while the lens flattens. Filter ripple-fades in place — tiles never move.

## Lead form pipeline
Form → `functions/api/lead.js` → creates a ClickUp task in the "fresh leads"
list, then sends notification email via Resend. Env vars (set in Cloudflare
Pages settings + local `.dev.vars`): `CLICKUP_API_TOKEN`, `CLICKUP_LIST_ID`,
`RESEND_API_KEY`. Resend is only called when configured; notify address is
overridable.

## Hosting
Cloudflare Pages + GitHub auto-deploy. Domain via Porkbun. No email hosting
(transactional mail goes through Resend).
