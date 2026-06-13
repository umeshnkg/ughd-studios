import * as THREE from 'three';

// ============================================================
// WebXR (Meta Quest) progressive enhancement.
//
// The desktop site fakes its sphere with a fullscreen fisheye post
// pass — that trick can't survive in a headset (it breaks stereo and
// makes people sick), so VR is a *separate* render path:
//   • the flat wrapping grid is hidden
//   • a real cylinder of work tiles is built around the viewer
//   • we render the scene directly per-eye (no post pass)
//   • controllers raycast for hover / select
//
// Nothing here runs unless an immersive-vr capable device is present,
// so the normal site is completely unaffected.
// ============================================================

// Cylinder layout — tiles wrap 360° around a viewer standing at centre.
const VR_COLS = 18;
const VR_ROWS = 5;
const VR_RADIUS = 7;
const VR_SCALE = 0.72; // shrink the (large) desktop tile geometry to fit
const VR_EYE_Y = 1.5; // cylinder centre height (≈ standing eye level)

export function initVR(ctx) {
  const { renderer, scene, camera, projectArt, tileGeometry, makeCardMaterial,
          onEnter, onExit } = ctx;

  if (!navigator.xr || !window.isSecureContext) return;

  // Only surface the button on a device that can actually do immersive VR.
  navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
    if (supported) mountButton();
  }).catch(() => {});

  let vrGroup = null; // built lazily on first entry (textures loaded by then)
  let rig = null; // holds the camera at the cylinder centre
  let savedCamPos = new THREE.Vector3();
  const controllers = [];
  const raycaster = new THREE.Raycaster();
  const tmpMatrix = new THREE.Matrix4();
  let hovered = null;

  // focus view — a large panel a card flies into when selected
  let focusGroup = null;
  let focusPanel = null;
  let captionMesh = null;
  let captionCv = null;
  let captionCtx = null;
  let captionTex = null;
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  // ----- the brand button, injected into the header chrome -----
  function mountButton() {
    const header = document.querySelector('.chrome--top') || document.body;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--light vrbtn';
    btn.textContent = 'Enter VR';
    btn.addEventListener('click', () => {
      if (renderer.xr.isPresenting) {
        renderer.xr.getSession()?.end();
      } else {
        navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
        }).then(onSessionStarted).catch((e) => console.warn('VR start failed', e));
      }
    });
    header.appendChild(btn);
    ctx.button = btn;
  }

  // ----- build the cylindrical gallery once -----
  function buildCylinder() {
    vrGroup = new THREE.Group();
    const tileAngle = (2 * Math.PI) / VR_COLS;
    // deal project art across the tiles (shuffled, repeating as needed)
    const total = VR_COLS * VR_ROWS;
    const deal = [];
    while (deal.length < total) {
      const copy = projectArt.map((_, i) => i);
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      deal.push(...copy);
    }

    for (let r = 0; r < VR_ROWS; r++) {
      for (let c = 0; c < VR_COLS; c++) {
        const art = projectArt[deal[r * VR_COLS + c]];
        const mat = makeCardMaterial(art.tex, { value: 1 });
        const mesh = new THREE.Mesh(tileGeometry, mat);
        const angle = c * tileAngle;
        const y = VR_EYE_Y + (r - (VR_ROWS - 1) / 2) * (2.875 * VR_SCALE * 1.08);
        mesh.position.set(
          Math.sin(angle) * VR_RADIUS,
          y,
          -Math.cos(angle) * VR_RADIUS
        );
        mesh.scale.setScalar(VR_SCALE);
        mesh.lookAt(0, y, 0); // face the viewer at the centre
        mesh.userData.project = art.p;
        mesh.userData.baseScale = VR_SCALE;
        vrGroup.add(mesh);
      }
    }
    scene.add(vrGroup);
  }

  // ----- controllers + a cursor ray on each -----
  function buildControllers() {
    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    for (let i = 0; i < 2; i++) {
      const ctrl = renderer.xr.getController(i);
      const line = new THREE.Line(
        rayGeo,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
      );
      line.scale.z = 5;
      ctrl.add(line);
      ctrl.addEventListener('selectstart', () => onSelect(ctrl));
      rig.add(ctrl);
      controllers.push(ctrl);
    }
  }

  // ----- focus panel: build once, lazily -----
  function buildFocus() {
    focusGroup = new THREE.Group();
    focusGroup.visible = false;

    // artwork panel (matches the 1024×920 card ratio)
    const w = 2.6;
    const h = w * (920 / 1024);
    focusPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ transparent: true })
    );
    focusGroup.add(focusPanel);

    // caption strip below the artwork (canvas texture, repainted per select)
    captionCv = document.createElement('canvas');
    captionCv.width = 1024;
    captionCv.height = 180;
    captionCtx = captionCv.getContext('2d');
    captionTex = new THREE.CanvasTexture(captionCv);
    captionMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * (180 / 1024)),
      new THREE.MeshBasicMaterial({ map: captionTex, transparent: true })
    );
    captionMesh.position.y = -h / 2 - w * (180 / 1024) / 2 - 0.04;
    focusGroup.add(captionMesh);

    scene.add(focusGroup);
  }

  function paintCaption(p) {
    const ctx = captionCtx;
    ctx.clearRect(0, 0, 1024, 180);
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, 1024, 180);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = '600 60px "Space Grotesk", sans-serif';
    ctx.fillText(p.title || '', 40, 70);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '400 34px "Space Mono", monospace';
    ctx.fillText((p.client || p.source || '').toUpperCase(), 40, 132);
    captionTex.needsUpdate = true;
  }

  function openFocus(tile) {
    if (!focusGroup) buildFocus();
    focusPanel.material.map = tile.material.map;
    focusPanel.material.needsUpdate = true;
    paintCaption(tile.userData.project);

    // place it where the viewer is looking, then leave it put so they
    // can look around it; never pitched, to stay comfortable
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();
    focusGroup.position.copy(camPos).add(camDir.multiplyScalar(2.8));
    focusGroup.position.y = VR_EYE_Y;
    focusGroup.lookAt(camPos.x, VR_EYE_Y, camPos.z);

    focusGroup.visible = true;
    vrGroup.visible = false; // clear the gallery behind the focus view
    let t = 0;
    const grow = () => {
      t += 0.12;
      const k = Math.min(t, 1);
      focusGroup.scale.setScalar(0.6 + 0.4 * (1 - (1 - k) * (1 - k)));
      if (k < 1 && focusGroup.visible) requestAnimationFrame(grow);
    };
    focusGroup.scale.setScalar(0.6);
    grow();
  }

  function dismissFocus() {
    if (focusGroup) focusGroup.visible = false;
    vrGroup.visible = true;
  }

  function onSelect() {
    // a trigger pull while focused returns to the gallery
    if (focusGroup && focusGroup.visible) { dismissFocus(); return; }
    if (!hovered) return;
    openFocus(hovered);
  }

  function updateHover() {
    if (focusGroup && focusGroup.visible) return; // gallery hidden behind focus
    let nearest = null;
    let nearestDist = Infinity;
    for (const ctrl of controllers) {
      tmpMatrix.identity().extractRotation(ctrl.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);
      const hits = raycaster.intersectObjects(vrGroup.children, false);
      if (hits.length && hits[0].distance < nearestDist) {
        nearest = hits[0].object;
        nearestDist = hits[0].distance;
      }
    }
    if (nearest === hovered) return;
    if (hovered) hovered.scale.setScalar(hovered.userData.baseScale);
    hovered = nearest;
    if (hovered) hovered.scale.setScalar(hovered.userData.baseScale * 1.12);
  }

  // ----- session lifecycle -----
  function onSessionStarted(session) {
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    if (!vrGroup) buildCylinder();

    // park the camera at the cylinder centre via a rig (XR drives the camera)
    savedCamPos.copy(camera.position);
    rig = new THREE.Group();
    rig.position.set(0, 0, 0);
    rig.add(camera);
    scene.add(rig);
    if (!controllers.length) buildControllers();

    // hand the loop over to XR; skip the fisheye post pass entirely
    onEnter();
    vrGroup.visible = true;
    renderer.setAnimationLoop(() => {
      updateHover();
      renderer.render(scene, camera);
    });

    session.addEventListener('end', onSessionEnded);
    if (ctx.button) ctx.button.textContent = 'Exit VR';
  }

  function onSessionEnded() {
    renderer.setAnimationLoop(null);
    renderer.xr.enabled = false;
    if (focusGroup) focusGroup.visible = false;
    if (vrGroup) vrGroup.visible = false;
    if (hovered) { hovered.scale.setScalar(hovered.userData.baseScale); hovered = null; }
    // restore the desktop camera + render path
    if (rig) { rig.remove(camera); scene.remove(rig); rig = null; }
    camera.position.copy(savedCamPos);
    if (ctx.button) ctx.button.textContent = 'Enter VR';
    onExit();
  }
}
