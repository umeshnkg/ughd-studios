import * as THREE from 'three';
import gsap from 'gsap';
import { createEnvironment } from './environment.js';
import { createGallery } from './gallery.js';
import { createTeleport } from './teleport.js';
import { createFocus } from './focus.js';
import { createUI } from './ui.js';
import { duckMusic, unduckMusic } from '../audio.js';

// ============================================================
// WebXR (Meta Quest) experience — orchestrator.
//
// A progressive enhancement: nothing here runs unless an immersive-vr
// device is present. Entering hides the flat fisheye site and builds a
// branded "gallery hall" — work split into zones, teleport locomotion,
// video-capable focus view, in-world wrist menu. The desktop render
// path (the fisheye post pass in main.js) is completely untouched; it
// just pauses while the headset session owns the loop.
// ============================================================

export function initVR(ctx) {
  const { renderer, scene, camera, projectArt, tileGeometry, makeCardMaterial,
          onEnter, onExit } = ctx;

  if (!navigator.xr || !window.isSecureContext) return;

  navigator.xr.isSessionSupported('immersive-vr')
    .then((ok) => { if (ok) mountButton(); })
    .catch(() => {});

  // everything VR lives under one root we can hide on exit, so the
  // desktop render of `scene` never shows VR objects
  const vrRoot = new THREE.Group();
  vrRoot.visible = false;
  scene.add(vrRoot);

  let built = false;
  let rig = null;
  let leftCtrl = null, rightCtrl = null;
  let env = null, gallery = null, teleport = null, focus = null, ui = null;
  let blink = null;
  const controllers = [];
  const savedCamPos = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const tmpMatrix = new THREE.Matrix4();
  let rightHover = null;

  // ----- brand button in the header chrome -----
  function mountButton() {
    const header = document.querySelector('.chrome--top') || document.body;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--light vrbtn';
    btn.textContent = 'Enter VR';
    btn.addEventListener('click', () => {
      if (renderer.xr.isPresenting) renderer.xr.getSession()?.end();
      else navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      }).then(onSessionStarted).catch((e) => console.warn('VR start failed', e));
    });
    header.appendChild(btn);
    ctx.button = btn;
  }

  // ----- build the world once (after the session + rig exist) -----
  function buildWorld() {
    env = createEnvironment(vrRoot);
    gallery = createGallery({ scene: vrRoot, projectArt, tileGeometry, makeCardMaterial });
    focus = createFocus({ scene: vrRoot, camera, duckMusic, unduckMusic });

    // comfort blink: a black shell on the camera, faded in/out per jump
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide,
        transparent: true, opacity: 0, depthTest: false })
    );
    shell.renderOrder = 999;
    camera.add(shell);
    blink = (cb) => {
      gsap.timeline()
        .to(shell.material, { opacity: 1, duration: 0.12, onComplete: cb })
        .to(shell.material, { opacity: 0, duration: 0.2 });
    };
    blink.shell = shell;

    built = true;
  }

  // controllers report handedness only once connected
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
        resolveRoles();
      });
      c.addEventListener('disconnected', () => { c.userData.inputSource = null; });
      c.addEventListener('selectstart', onSelect);
      rig.add(c);
      controllers.push(c);
    }
  }

  // assign left/right once known; init teleport + wrist UI on first resolve
  function resolveRoles() {
    leftCtrl = controllers.find((c) => c.userData.handedness === 'left') || controllers[0];
    rightCtrl = controllers.find((c) => c.userData.handedness === 'right') || controllers[1];
    if (!ui && leftCtrl) {
      ui = createUI({
        scene: vrRoot, leftController: leftCtrl,
        onExit: () => renderer.xr.getSession()?.end(),
        onRecenter: () => blink(() => { rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); }),
      });
      teleport = createTeleport({
        leftController: leftCtrl,
        getLeftSource: () => leftCtrl.userData.inputSource,
        rig, floorMesh: env.floor, pads: gallery.pads, blink, scene: vrRoot,
      });
    }
  }

  // ----- pointer (right controller) → panels + wrist buttons -----
  function updatePointer() {
    if (!rightCtrl) return;
    tmpMatrix.identity().extractRotation(rightCtrl.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(rightCtrl.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);
    const targets = [...gallery.panels, ...(ui ? ui.buttons : [])];
    const hit = raycaster.intersectObjects(targets, false)[0]?.object || null;
    if (ui && ui.buttons.includes(hit)) { ui.setHover(hit); gallery.clearHover(); rightHover = hit; }
    else if (gallery.panels.includes(hit)) { gallery.setHover(hit); ui && ui.setHover(null); rightHover = hit; }
    else { gallery.clearHover(); ui && ui.setHover(null); rightHover = null; }
  }

  function onSelect() {
    if (!built) return;
    if (focus.isOpen()) {
      focus.dismiss();
      gallery.setVisible(true);
      teleport && teleport.setVisible(true);
      return;
    }
    if (!rightHover) return;
    if (ui && ui.trigger(rightHover)) return; // exit / recenter
    // otherwise it's a work panel → open the focus view
    focus.open(rightHover);
    gallery.setVisible(false);
    teleport && teleport.setVisible(false);
  }

  // ----- session lifecycle -----
  async function onSessionStarted(session) {
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    renderer.xr.setFoveation?.(1); // ease the mobile GPU at the periphery

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
    if (blink) blink.shell.visible = true;
    ui && ui.reset();

    // arrival: fade the panels in
    gallery.group.visible = true;
    gsap.fromTo(gallery.group.scale, { x: 0.9, y: 0.9, z: 0.9 },
      { x: 1, y: 1, z: 1, duration: 1.2, ease: 'power3.out' });

    renderer.setAnimationLoop(() => {
      if (built) {
        env.update();
        if (focus.isOpen()) {
          gallery.clearHover(); ui && ui.setHover(null);
          teleport && teleport.update(false);
        } else {
          updatePointer();
          teleport && teleport.update(true);
        }
        ui && ui.update();
      }
      renderer.render(scene, camera);
    });

    session.addEventListener('end', onSessionEnded);
    if (ctx.button) ctx.button.textContent = 'Exit VR';
  }

  function onSessionEnded() {
    renderer.setAnimationLoop(null);
    renderer.xr.enabled = false;
    if (focus) focus.dismiss();
    vrRoot.visible = false;
    if (blink) blink.shell.visible = false;
    if (rig) rig.remove(camera); // hand the camera back to the desktop loop
    camera.position.copy(savedCamPos);
    if (ctx.button) ctx.button.textContent = 'Enter VR';
    onExit();
  }
}
