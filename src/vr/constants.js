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
