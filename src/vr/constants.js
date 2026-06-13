// Shared VR layout constants (metres / radians). local-floor reference
// space puts the origin on the floor, so standing eye height ≈ 1.6 m.
export const EYE_Y = 1.6;

// Gallery hall: each zone is a curved wall of panels at WALL_DIST from the
// room centre; its teleport pad sits PAD_DIST out along the same radial.
export const WALL_DIST = 6;
export const PAD_DIST = 3;
export const PANEL_SCALE = 0.5; // shrink the desktop tile geometry (3.2×2.875)

// Zones, in display order. Grouped by project `source`.
export const ZONES = [
  { label: 'LYRIC VIDEOS', source: 'lyricvideo.tv' },
  { label: 'STUDIO WORK', source: 'ughdstudios.com' },
  { label: 'DESIGN', source: 'umesh.design' },
];

// ---- Feel / accent (one place to tune the whole mood) ----
// Electric cyan-blue accent, shared by hover rims, reticle, pads,
// horizon glow and signage so the space reads as one futuristic set.
export const ACCENT = 0x4cc9ff;
export const ACCENT_DIM = 0x1b6f9c;

// Motion: kept deliberately subtle — refined, not flashy.
export const HOVER_SCALE = 1.14; // hovered panel grows to this × base
export const HOVER_DUR = 0.25; // seconds, hover scale/rim tween
export const FOCUS_DUR = 0.45; // seconds, focus open/close tween
export const BOB_AMP = 0.012; // metres, idle vertical breathing
export const BOB_SPEED = 0.6; // radians/sec of the breathing sine
