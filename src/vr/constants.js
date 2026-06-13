// Shared VR constants (metres / radians). local-floor reference space
// puts the origin on the floor, so standing eye height ≈ 1.6 m.
export const EYE_Y = 1.6;

// ---- Sphere of work (the browser) ----
export const SPHERE_RADIUS = 5.5; // tiles float on a sphere this far out
export const SPHERE_TILES = 150; // ~filled via repeated, shuffled projectArt
export const SPHERE_TILE_SCALE = 0.42; // shrink the desktop tile geometry (3.2×2.875)
export const SPHERE_ROT_SPEED = 0.035; // rad/s auto-rotation (~2°/s), kept slow
export const SPHERE_TILT = 0.02; // near-level spin axis (was visibly lopsided)
export const SPHERE_RADIUS_JITTER = 0.07; // ±fraction of radius so neighbour corners don't clash

// Filter re-arrange: matching cards cluster in front at a closer radius.
export const FILTER_CLOSE = 0.82; // matching tiles pulled to this × radius (nearer)

// Warp transition (enter/exit "star tunnel")
export const WARP_IN_DUR = 1.6; // seconds
export const WARP_OUT_DUR = 1.2;

// ---- Floating stage ----
export const STAGE_RADIUS = 1.7; // the platform you stand on

// ---- Gaze-following filter companion ----
export const COMPANION_DIST = 1.25; // metres in front of the eyes
export const COMPANION_DOWN = 0.42; // how far below the view centre it rides
export const COMPANION_SIDE = 0.32; // and to the right
export const COMPANION_LAG = 0.055; // lerp factor — low = more trailing "drag"

// ---- Feel / accent (one place to tune the whole mood) ----
// Electric cyan-blue accent, shared by hover rims, orbs, companion, stage.
export const ACCENT = 0x4cc9ff;
export const ACCENT_DIM = 0x1b6f9c;

// Motion: kept deliberately subtle — refined, not flashy.
export const HOVER_SCALE = 1.14; // hovered tile grows to this × base
export const HOVER_DUR = 0.25; // seconds, hover scale/rim tween
export const FOCUS_DUR = 0.45; // seconds, focus / modal open-close tween
export const BOB_AMP = 0.012; // metres, idle vertical breathing
export const BOB_SPEED = 0.6; // radians/sec of the breathing sine
