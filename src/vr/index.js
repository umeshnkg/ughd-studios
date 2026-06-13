import * as THREE from 'three';
import gsap from 'gsap';
import { createEnvironment } from './environment.js';
import { createSphere } from './sphere.js';
import { createFocus } from './focus.js';
import { createModal } from './modal.js';
import { createTheater } from './theater.js';
import { createOrbs } from './orbs.js';
import { createFilter } from './filter.js';
import { buildAbout, buildContact } from './panels.js';
import { duckMusic, unduckMusic, startAmbient, stopAmbient,
         playTick, playClick, playWhoosh } from '../audio.js';

// ============================================================
// WebXR (Meta Quest) experience — orchestrator (v3).
//
// Floating stage in a starfield; a full sphere of work tiles slowly
// auto-rotates around you. Control orbs (Demo / About / Contact / Exit)
// open modals; a gaze-following companion filters the sphere. The
// desktop fisheye site is untouched — it just pauses while the headset
// session owns the loop.
// ============================================================

export function initVR(ctx) {
  const { renderer, scene, camera, projectArt, tileGeometry, makeCardMaterial,
          onEnter, onExit } = ctx;

  if (!navigator.xr || !window.isSecureContext) return;

  navigator.xr.isSessionSupported('immersive-vr')
    .then((ok) => { if (ok) mountButton(); })
    .catch(() => {});

  const vrRoot = new THREE.Group();
  vrRoot.visible = false;
  scene.add(vrRoot);

  let built = false;
  let rig = null;
  let rightCtrl = null;
  let env = null, sphere = null, focus = null, modal = null, theater = null,
      orbs = null, filter = null;
  const controllers = [];
  const savedCamPos = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const tmpMatrix = new THREE.Matrix4();
  let rightHover = null;
  let inspecting = false;
  let gripHeld = false;

  // ----- brand button in the header chrome -----
  function mountButton() {
    const header = document.querySelector('.chrome--top') || document.body;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--light vrbtn';
    btn.textContent = 'Enter VR';
    btn.addEventListener('click', () => {
      if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
      startAmbient(); // inside the click gesture so audio isn't blocked
      navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      }).then(onSessionStarted).catch((e) => { console.warn('VR start failed', e); stopAmbient(); });
    });
    header.appendChild(btn);
    ctx.button = btn;
  }

  // ----- build the world once -----
  function buildWorld() {
    env = createEnvironment(vrRoot);
    sphere = createSphere({ scene: vrRoot, projectArt, tileGeometry, makeCardMaterial });
    focus = createFocus({ scene: vrRoot, camera, duckMusic, unduckMusic });
    modal = createModal({ scene: vrRoot, camera });
    theater = createTheater({ duckMusic, unduckMusic });
    orbs = createOrbs({
      scene: vrRoot,
      actions: {
        demo: () => { modal.open(theater.group, { w: theater.w, h: theater.h, onClose: () => theater.stop() }); theater.play(); },
        about: () => { const a = buildAbout(); modal.open(a.group, { w: a.w, h: a.h }); },
        contact: () => { const c = buildContact(); modal.open(c.group, { w: c.w, h: c.h }); },
        exit: () => renderer.xr.getSession()?.end(),
      },
    });
    filter = createFilter({ scene: vrRoot, camera, sphere });

    // gsap's ticker is frozen during XR (rAF suspended); drive it from the
    // XR loop via gsap.updateRoot(t). lagSmoothing(0) avoids huge deltas.
    gsap.ticker.lagSmoothing(0);
    built = true;
  }

  function setupControllers() {
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      const laser = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
      );
      laser.scale.z = 5;
      c.add(laser);
      c.addEventListener('connected', (e) => {
        c.userData.handedness = e.data.handedness;
        c.userData.inputSource = e.data;
        rightCtrl = controllers.find((x) => x.userData.handedness === 'right') || controllers[1] || c;
      });
      c.addEventListener('selectstart', onSelect);
      c.addEventListener('squeezestart', () => {
        gripHeld = true;
        if (focus && focus.isOpen()) { inspecting = true; focus.setInspect(true); }
      });
      c.addEventListener('squeezeend', () => {
        gripHeld = false;
        if (inspecting) { inspecting = false; focus.setInspect(false); }
      });
      rig.add(c);
      controllers.push(c);
    }
    rightCtrl = controllers[1] || controllers[0];
  }

  // ----- pointer (right controller) -----
  function updatePointer() {
    if (!rightCtrl) return;
    tmpMatrix.identity().extractRotation(rightCtrl.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(rightCtrl.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);

    let targets;
    if (modal.isOpen()) targets = [modal.closeButton];
    else targets = [...sphere.tiles, ...orbs.meshes, filter.companion, ...filter.pillTargets()];

    const hit = raycaster.intersectObjects(targets, false)[0]?.object || null;
    rightHover = hit;

    // route hover highlights
    if (hit && sphere.tiles.includes(hit)) { if (sphere.setHover(hit)) playTick(); orbs.setHover(null); }
    else { sphere.clearHover(); orbs.setHover(hit && hit.userData.orb ? hit : null); }
  }

  function onSelect() {
    if (!built) return;
    if (modal.isOpen()) {
      if (rightHover === modal.closeButton) { playClick(); modal.close(); }
      return;
    }
    if (focus.isOpen()) { playWhoosh(); focus.dismiss(); return; }
    if (!rightHover) return;
    if (rightHover.userData.orb) { playClick(); rightHover.userData.action?.(); return; }
    if (rightHover.userData.companion) { playClick(); filter.toggle(); return; }
    if (rightHover.userData.pill) { playClick(); filter.selectPill(rightHover); return; }
    if (sphere.tiles.includes(rightHover)) { playWhoosh(); focus.open(rightHover); }
  }

  // ----- session lifecycle -----
  async function onSessionStarted(session) {
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    renderer.xr.setFoveation?.(1);

    if (!rig) {
      rig = new THREE.Group();
      vrRoot.add(rig);
      savedCamPos.copy(camera.position);
      rig.add(camera);
      setupControllers();
    } else {
      rig.add(camera);
    }
    if (!built) buildWorld();

    onEnter();
    vrRoot.visible = true;
    sphere.playIntro();

    renderer.setAnimationLoop(() => {
      if (built) {
        const t = performance.now() / 1000;
        gsap.updateRoot(t); // advance gsap on the XR clock
        env.update();
        orbs.update(t);
        filter.update();
        // pause the spin whenever something is being viewed or grabbed
        sphere.setPaused(modal.isOpen() || focus.isOpen() || gripHeld);
        sphere.update(t);
        filter.companion.visible = !modal.isOpen() && !focus.isOpen();
        if (focus.isOpen()) {
          focus.update(t);
          if (inspecting && rightCtrl) focus.inspectFrom(rightCtrl);
        } else {
          updatePointer();
        }
      }
      renderer.render(scene, camera);
    });

    session.addEventListener('end', onSessionEnded);
    if (ctx.button) ctx.button.textContent = 'Exit VR';
  }

  function onSessionEnded() {
    renderer.setAnimationLoop(null);
    renderer.xr.enabled = false;
    if (theater) theater.stop();
    if (modal && modal.isOpen()) modal.close();
    if (focus) focus.dismiss();
    vrRoot.visible = false;
    if (rig) rig.remove(camera);
    camera.position.copy(savedCamPos);
    stopAmbient();
    if (ctx.button) ctx.button.textContent = 'Enter VR';
    onExit();
  }
}
