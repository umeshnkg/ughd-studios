import * as THREE from 'three';

// ============================================================
// Spatial audio: a head-tracked AudioListener on the camera plus a
// quiet low drone at each station, so turning your head changes the
// mix and the room feels like a place. Uses three's own WebAudio
// context; everything is wrapped so a blocked/unsupported context just
// stays silent rather than throwing.
// ============================================================

export function createSpatial({ camera, vrRoot, positions }) {
  const drones = [];
  let listener = null;
  let actx = null;
  try {
    listener = new THREE.AudioListener();
    camera.add(listener);
    actx = listener.context;

    positions.forEach((pos, i) => {
      const pa = new THREE.PositionalAudio(listener);
      const osc = actx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 48 + i * 6; // low pad, a little detuned per station
      const g = actx.createGain();
      g.gain.value = 0.0;
      osc.connect(g);
      pa.setNodeSource(g);
      pa.setRefDistance(2.5);
      pa.setMaxDistance(14);
      pa.setDistanceModel('linear');
      pa.position.copy(pos).setY(1.6);
      vrRoot.add(pa);
      osc.start();
      // ease in very quietly once the context is running
      g.gain.setTargetAtTime(0.01, actx.currentTime, 3);
      drones.push(pa);
    });
  } catch {
    /* spatial audio unavailable — silent, non-fatal */
  }

  return {
    resume() { actx?.resume().catch(() => {}); },
    suspend() { actx?.suspend().catch(() => {}); }, // silence drones on VR exit
  };
}
