// A cutaway traction-elevator shaft built like the real thing (rear counterweight, machine room on top):
// car with sling, guide shoes, safety gear and rope hitch; six wire ropes over a grooved traction sheave
// down to the counterweight; overspeed governor with its own rope loop to a tension sheave in the pit;
// spring-applied brake on the machine; oil buffers in the pit; a traveling cable. Two people built from
// jointed parts. Everything is a pure function of time: apply(S, t, cam) reads SCORE.st(t).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import * as TEX from './tex.js';

const ORANGE = 0xF57423;
export const TOP = 62.0;                         // traction sheave axle height
const ROPE_X = [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5];
const RZ = -1.65;                                 // car-side rope line = car rail line
const SR = 0.985, SZ = RZ - SR, CWZ = SZ - SR;    // sheave rope radius / centre z / counterweight-side rope line (-3.62)
const BACK = -4.0;                                // front face of the shaft back wall
const GX = 2.1, GZ = -1.0, GR = 0.18, GY = 61.0, GYP = -7.6;   // governor sheave, its rope loop, tension sheave in the pit
const CZ = -1.65;                                 // car interior centre z
const mul32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

function tex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
const std = (o) => new THREE.MeshStandardMaterial(o);
function box(parent, w, h, d, x, y, z, mat) {
  const r = Math.min(w, h, d) * 0.12, g = Math.min(w, h, d) > 0.03 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, 0.04)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); parent.add(m); return m;
}
function cyl(parent, rt, rb, h, x, y, z, mat, seg = 28) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); parent.add(m); return m;
}
const cylX = (p, r, h, x, y, z, mat, seg) => { const m = cyl(p, r, r, h, x, y, z, mat, seg); m.rotation.z = Math.PI / 2; return m; };
const cylZ = (p, r, h, x, y, z, mat, seg) => { const m = cyl(p, r, r, h, x, y, z, mat, seg); m.rotation.x = Math.PI / 2; return m; };
function coil(p, r, wire, turns, h, x, y, z, mat) {                 // a real helical spring
  const pts = []; for (let i = 0; i <= turns * 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, i / (turns * 24) * h - h / 2, Math.sin(a) * r)); }
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, wire, 6), mat); m.position.set(x, y, z); p.add(m); return m;
}

// ---------- a person: jointed limbs, tapered body, a face ----------
function makePerson(M, o = {}) {
  const g = new THREE.Group();
  const mk = (geo, mat, x, y, z, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (par || g).add(m); return m; };
  const lathe = (prof, mat, x, y, z, sz, par) => { const m = mk(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 28), mat, x, y, z, par); m.scale.z = sz; return m; };
  const limb = (r0, r1, len, mat, par) => { const m = mk(new THREE.CylinderGeometry(r1, r0, len, 16), mat, 0, -len / 2, 0, par); mk(new THREE.SphereGeometry(r0, 16, 12), mat, 0, 0, 0, par); return m; };
  const shirt = o.shirt || M.shirt, pants = o.pants || M.pants;
  // pelvis + torso as one lathe profile: hips, waist, chest, shoulders
  lathe([[0.001, 0.0], [0.145, 0.0], [0.152, 0.06], [0.138, 0.15], [0.128, 0.24], [0.15, 0.36], [0.168, 0.46], [0.17, 0.52], [0.13, 0.58], [0.06, 0.615], [0.001, 0.62]], shirt, 0, 0.92, 0, 0.62);
  lathe([[0.001, 0.0], [0.15, 0.0], [0.155, 0.08], [0.146, 0.13], [0.001, 0.135]], pants, 0, 0.84, 0, 0.64);
  mk(new THREE.TorusGeometry(0.142, 0.016, 8, 32), M.belt, 0, 0.965, 0).scale.set(1, 1, 0.64); g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  mk(new RoundedBoxGeometry(0.05, 0.04, 0.02, 2, 0.008), M.steel, 0, 0.965, 0.094);
  if (!o.vest) { mk(new THREE.BoxGeometry(0.01, 0.34, 0.01), M.dark, 0, 1.24, 0.104); for (let i = 0; i < 4; i++) mk(new THREE.CylinderGeometry(0.008, 0.008, 0.005, 10), M.white, 0, 1.38 - i * 0.09, 0.108).rotation.x = Math.PI / 2; }
  for (const sx of [-1, 1]) { const c = mk(new THREE.BoxGeometry(0.07, 0.07, 0.012), shirt, sx * 0.04, 1.5, 0.085); c.rotation.z = sx * 0.45; c.rotation.x = -0.35; }
  if (o.vest) {                                                    // hi-vis vest with reflective bands
    lathe([[0.001, 0.0], [0.155, 0.0], [0.142, 0.12], [0.158, 0.3], [0.175, 0.42], [0.12, 0.5], [0.001, 0.51]], M.vest, 0, 1.0, 0, 0.66);
    for (const yy of [1.12, 1.24]) mk(new THREE.TorusGeometry(0.16, 0.012, 6, 32), M.reflect, 0, yy, 0).scale.set(1, 1, 0.66), g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  }
  // neck, head, face, hair
  mk(new THREE.CylinderGeometry(0.046, 0.054, 0.11, 16), M.skin, 0, 1.565, 0);
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); g.add(head);
  { const s = mk(new THREE.SphereGeometry(0.098, 32, 24), M.skin, 0, 0.065, -0.005, head); s.scale.set(0.9, 1.1, 1.02); }
  { const j = mk(new THREE.SphereGeometry(0.075, 24, 18), M.skin, 0, 0.0, 0.025, head); j.scale.set(0.95, 0.85, 0.9); }     // jaw and chin
  for (const sx of [-1, 1]) { const e = mk(new THREE.SphereGeometry(0.024, 12, 10), M.skin, sx * 0.09, 0.06, -0.01, head); e.scale.set(0.45, 1, 0.7); }
  const eyes = [];
  for (const sx of [-1, 1]) {
    const w = mk(new THREE.SphereGeometry(0.017, 16, 12), M.white, sx * 0.034, 0.075, 0.077, head); w.scale.set(1.15, 0.8, 0.55); eyes.push(w);
    mk(new THREE.SphereGeometry(0.0085, 12, 10), M.iris, sx * 0.035, 0.074, 0.087, head);
    const lid = mk(new THREE.SphereGeometry(0.019, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), M.skin, sx * 0.034, 0.078, 0.075, head); lid.scale.set(1.15, 0.9, 0.62); lid.rotation.x = 0.35;
    const br = mk(new RoundedBoxGeometry(0.044, 0.01, 0.012, 2, 0.004), M.hair, sx * 0.035, 0.104, 0.084, head); br.rotation.z = sx * 0.18; br.userData.sx = sx; eyes.push(br);
  }
  { const n = mk(new THREE.SphereGeometry(0.016, 12, 10), M.skin, 0, 0.048, 0.098, head); n.scale.set(0.8, 1.3, 1.2); }
  mk(new THREE.SphereGeometry(0.01, 10, 8), M.skin, 0, 0.034, 0.104, head);
  const mouth = mk(new THREE.SphereGeometry(0.018, 14, 10), M.mouth, 0, 0.005, 0.088, head); mouth.scale.set(1.3, 0.35, 0.5);
  if (o.helmet) {
    const h = mk(new THREE.SphereGeometry(0.118, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52), M.helmet, 0, 0.088, -0.005, head); h.scale.set(1, 1.0, 1.08);
    const b = mk(new THREE.CylinderGeometry(0.15, 0.15, 0.008, 32), M.helmet, 0, 0.1, 0.012, head); b.scale.set(0.82, 1, 1);
  } else {
    const h = mk(new THREE.SphereGeometry(0.102, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.6), M.hair, 0, 0.078, -0.012, head); h.scale.set(0.93, 1.08, 1.05);
    const bk = mk(new THREE.SphereGeometry(0.095, 20, 14), M.hair, 0, 0.05, -0.03, head); bk.scale.set(0.9, 0.95, 0.9);
    for (const sx of [-1, 1]) { const sb = mk(new RoundedBoxGeometry(0.02, 0.05, 0.05, 2, 0.01), M.hair, sx * 0.088, 0.055, 0.01, head); }
  }
  // arms
  const arms = [];
  for (const sx of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(sx * 0.19, 1.44, 0); g.add(a);
    mk(new THREE.SphereGeometry(0.058, 16, 12), shirt, 0, 0, 0, a);
    limb(0.052, 0.044, 0.28, shirt, a);
    const fa = new THREE.Group(); fa.position.y = -0.28; a.add(fa); a.userData.fa = fa;
    limb(0.046, 0.034, 0.25, o.longSleeve ? shirt : M.skin, fa);
    mk(new THREE.CylinderGeometry(0.05, 0.047, 0.05, 16), shirt, 0, 0.02, 0, fa);
    const hand = new THREE.Group(); hand.position.y = -0.26; fa.add(hand); a.userData.hand = hand;
    mk(new RoundedBoxGeometry(0.058, 0.08, 0.026, 3, 0.012), o.gloves ? M.glove : M.skin, 0, -0.04, 0, hand);
    for (let k = 0; k < 4; k++) mk(new RoundedBoxGeometry(0.012, 0.05, 0.016, 2, 0.006), o.gloves ? M.glove : M.skin, -0.021 + k * 0.014, -0.1, 0.002, hand);
    const th = mk(new RoundedBoxGeometry(0.016, 0.045, 0.016, 2, 0.007), o.gloves ? M.glove : M.skin, sx * -0.032, -0.035, 0.012, hand); th.rotation.z = sx * 0.6;
    arms.push(a);
  }
  // legs
  const legs = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.Group(); l.position.set(sx * 0.085, 0.9, 0); g.add(l);
    limb(0.078, 0.058, 0.43, pants, l);
    const sh = new THREE.Group(); sh.position.y = -0.43; l.add(sh); l.userData.shin = sh;
    limb(0.056, 0.042, 0.41, pants, sh);
    const ft = new THREE.Group(); ft.position.y = -0.43; sh.add(ft);
    mk(new RoundedBoxGeometry(0.095, 0.07, 0.25, 3, 0.03), o.boots ? M.boot : M.shoe, 0, -0.005, 0.05, ft);
    mk(new RoundedBoxGeometry(0.1, 0.02, 0.26, 2, 0.008), M.sole, 0, -0.04, 0.05, ft);
    if (!o.boots) for (let k = 0; k < 3; k++) mk(new THREE.BoxGeometry(0.06, 0.005, 0.01), M.white, 0, 0.03, 0.09 + k * 0.025, ft);
    legs.push(l);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { g, head, mouth, eyes, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1] };
}

// pose a rig from a few weights: grab (hands to the rails), float (weightless), crouch (braced, knees bent),
// look (eyes up), kneel (technician), walk (0..1 phase-driven)
function pose(R, P, t) {
  const up = P.float || 0, grab = P.grab || 0, cr = P.crouch || 0, kn = P.kneel || 0, wk = P.walk || 0;
  const w1 = Math.sin(t * 6.1) * 0.14 * up, w2 = Math.sin(t * 7.7 + 1) * 0.16 * up, br = Math.sin(t * 2.4) * (1 - up);
  const wp = (P.walkPhase || 0) * Math.PI * 2;
  R.armL.rotation.set(-grab * 0.3 - up * 0.35 + w2 * 0.5 + wk * Math.sin(wp) * 0.35, 0, -0.1 - grab * 0.95 - up * 2.2 + w1 - cr * 0.25);
  R.armR.rotation.set(-grab * 0.3 - up * 0.25 - w1 * 0.5 - wk * Math.sin(wp) * 0.35, 0, 0.1 + grab * 0.95 + up * 2.2 - w2 + cr * 0.25);
  R.armL.userData.fa.rotation.set(-0.12 - grab * 0.25 - up * 0.45 - kn * 1.1, 0, -0.08 - grab * 0.2 - up * 0.5);
  R.armR.userData.fa.rotation.set(-0.12 - grab * 0.25 - up * 0.4 - kn * 1.3, 0, 0.08 + grab * 0.2 + up * 0.5);
  R.armL.userData.hand.rotation.set(grab * 0.4, 0, -grab * 0.3); R.armR.userData.hand.rotation.set(grab * 0.4, 0, grab * 0.3);
  const lx = up * 0.55 + w1 * 0.7 + cr * 0.75 + kn * 1.55 + wk * Math.sin(wp) * 0.45, rx = up * 0.28 - w2 * 0.7 + cr * 0.7 + kn * 0.1 - wk * Math.sin(wp) * 0.45;
  R.legL.rotation.set(-lx, 0, -0.03 - grab * 0.06 - up * 0.2 - cr * 0.08);
  R.legR.rotation.set(-rx, 0, 0.03 + grab * 0.06 + up * 0.16 + cr * 0.08);
  R.legL.userData.shin.rotation.x = up * 0.9 + cr * 1.35 + kn * 1.6 + wk * Math.max(0, -Math.sin(wp)) * 0.7;
  R.legR.userData.shin.rotation.x = up * 0.6 + cr * 1.25 + kn * 1.55 + wk * Math.max(0, Math.sin(wp)) * 0.7;
  R.head.rotation.set(-0.38 * (P.look || 0) + up * 0.15 + br * 0.015 + cr * 0.15 + kn * 0.35, Math.sin(t * 4.1) * 0.22 * up + (P.turn || 0), Math.sin(t * 3.3) * 0.06 * up);
  const fear = clamp((P.look || 0) + up + grab * 0.6);                // mouth opens, brows lift
  R.mouth.scale.set(1.3 - fear * 0.35, 0.35 + fear * 0.9, 0.5);
  for (const e of R.eyes) { if (e.userData.sx !== undefined) { e.position.y = 0.104 + fear * 0.008; e.rotation.z = e.userData.sx * (0.18 - fear * 0.3); } else e.scale.y = 0.8 + fear * 0.25; }
  R.g.position.y = (P.baseY || 0) + br * 0.004 - grab * 0.05 - cr * 0.32 - kn * 0.46 + up * 0.45 + Math.sin(t * 5.3) * 0.03 * up;
  R.g.rotation.z = up * 0.12 * Math.sin(t * 2.1);
}

export function build(VW, VH, SS = Number(globalThis.RQ_SS || 0.8)) {
  const RW = Math.round(VW * SS), RH = Math.round(VH * SS);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(RW, RH, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060a);
  scene.fog = new THREE.Fog(0x070b12, 14, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const R = mul32(20261128);

  const stone = tex(256, 256, (x, w, h) => {
    x.fillStyle = '#3b3d40'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { const v = 40 + R() * 110 | 0; x.fillStyle = `rgba(${v},${v},${v},0.6)`; x.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); }
    x.fillStyle = '#1c1d1f'; x.fillRect(0, h / 2, w, 2); x.fillRect(w / 2, 0, 2, h);
  }, [2, 2]);
  const strands = tex(64, 256, (x, w, h) => {
    x.fillStyle = '#8f8d88'; x.fillRect(0, 0, w, h);
    for (let i = -8; i < 24; i++) { x.strokeStyle = 'rgba(20,20,20,0.5)'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, i * 16); x.lineTo(w, i * 16 + 40); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.3)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, i * 16 + 6); x.lineTo(w, i * 16 + 46); x.stroke(); }
  }, [3, 200]);
  const hazard = tex(128, 32, (x, w, h) => { x.fillStyle = '#d9a514'; x.fillRect(0, 0, w, h); x.fillStyle = '#151515'; for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 16, h); x.lineTo(i * 16 + 8, h); x.lineTo(i * 16 + 8 + h, 0); x.lineTo(i * 16 + h, 0); x.fill(); } }, [1, 1]);

  const M = {
    back: TEX.concrete({ tint: '#8d9196', rep: [6, 34] }),
    side: TEX.concrete({ tint: '#83878c', rep: [3, 34] }),
    room: TEX.concrete({ tint: '#9a9890', rep: [3, 2] }),
    rusty: std({ color: 0x545a62, metalness: 0.6, roughness: 0.55 }),
    yellow: std({ color: 0xd9a514, roughness: 0.6, metalness: 0.2 }),
    hazard: std({ map: hazard, roughness: 0.6 }),
    cable: std({ color: 0x141414, roughness: 0.7 }),
    glass: std({ color: 0xfff3d6, emissive: 0xffe2b0, emissiveIntensity: 2, roughness: 0.3 }),
    iris: std({ color: 0x2a1a10, roughness: 0.15 }),
    belt: std({ color: 0x3a2618, roughness: 0.6 }),
    cut: std({ color: 0x3b3f45, roughness: 0.95 }),
    cutLight: std({ color: 0x55595f, roughness: 0.95 }),
    rail: std({ color: 0x7c828a, metalness: 0.8, roughness: 0.35 }),
    steel: std({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.32 }),
    dark: std({ color: 0x2a313a, metalness: 0.6, roughness: 0.5 }),
    door: std({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.3 }),
    carWall: std({ color: 0xc9ccd0, metalness: 0.9, roughness: 0.28 }),
    mirror: std({ color: 0xb8bec6, metalness: 0.9, roughness: 0.22 }),
    floorStone: std({ map: stone, roughness: 0.55, metalness: 0.1 }),
    lamp: std({ color: 0x222222, emissive: 0xfff0d0, emissiveIntensity: 1.5, roughness: 0.4 }),
    emerg: std({ color: 0x200c04, emissive: 0xff8a3a, emissiveIntensity: 0, roughness: 0.5 }),
    emergCar: std({ color: 0x200c04, emissive: 0xff9a4a, emissiveIntensity: 0, roughness: 0.5 }),
    btn: std({ color: 0x333333, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.4 }),
    skin: std({ color: 0xc99475, roughness: 0.62 }),
    hair: std({ color: 0x1c1816, roughness: 0.75 }),
    shirt: std({ color: 0x3f6d8f, roughness: 0.85 }),
    white: std({ color: 0xf2f1ee, roughness: 0.35 }),
    mouth: std({ color: 0x6a3530, roughness: 0.6 }),
    pants: std({ color: 0x2b3550, roughness: 0.9 }),
    shoe: std({ color: 0x15181c, roughness: 0.6 }),
    sole: std({ color: 0xe8e4da, roughness: 0.8 }),
    boot: std({ color: 0x4a3420, roughness: 0.75 }),
    glove: std({ color: 0x5a5d3a, roughness: 0.8 }),
    vest: std({ color: 0xff7a10, roughness: 0.7 }),
    reflect: std({ color: 0xe8ecef, metalness: 0.4, roughness: 0.25, emissive: 0x555555, emissiveIntensity: 0.4 }),
    helmet: std({ color: 0xf2c418, roughness: 0.35 }),
    techShirt: std({ color: 0x3a3f46, roughness: 0.85 }),
    techPants: std({ color: 0x23324a, roughness: 0.9 }),
    brake: std({ color: 0x7a2a22, metalness: 0.5, roughness: 0.5 }),
    pad: std({ color: 0x3b2f28, roughness: 0.9, emissive: ORANGE, emissiveIntensity: 0 }),
    spring: std({ color: 0x9a8a2a, metalness: 0.7, roughness: 0.4, emissive: ORANGE, emissiveIntensity: 0 }),
    coilM: std({ color: 0x5c3a1e, metalness: 0.6, roughness: 0.4, emissive: 0xffc070, emissiveIntensity: 0 }),
    safety: std({ color: 0x80878f, metalness: 0.7, roughness: 0.4, emissive: ORANGE, emissiveIntensity: 0 }),
    sheave: std({ color: 0x8b949e, metalness: 0.85, roughness: 0.3 }),
    gov: std({ color: 0x8b949e, metalness: 0.85, roughness: 0.3, emissive: ORANGE, emissiveIntensity: 0 }),
    govRope: std({ color: 0x9a988f, metalness: 0.85, roughness: 0.4, emissive: ORANGE, emissiveIntensity: 0 }),
    cw: std({ color: 0x4a5058, metalness: 0.6, roughness: 0.5, emissive: ORANGE, emissiveIntensity: 0 }),
    buffer: std({ color: 0xd9a514, roughness: 0.5, metalness: 0.3, emissive: ORANGE, emissiveIntensity: 0 }),
    chrome: std({ color: 0xdde2e6, metalness: 1.0, roughness: 0.12, emissive: ORANGE, emissiveIntensity: 0 }),
    hall: new THREE.MeshBasicMaterial({ color: 0xffe2b8, toneMapped: false }),
  };
  const ropeMat = std({ map: strands, color: 0xa8a69f, metalness: 0.9, roughness: 0.42, emissive: ORANGE, emissiveIntensity: 0 });

  // ---------- the building ----------
  const world = new THREE.Group(); scene.add(world);
  const H0 = -12, H1 = 72;
  box(world, 16, 60 - H0, 0.5, 0, (60 + H0) / 2, BACK - 0.25, M.back);              // shaft back wall
  box(world, 16, 12, 0.5, 0, 66, -4.75, M.room);                                  // machine-room back wall (deeper room)
  for (const s of [-1, 1]) {
    const d = -BACK, geo = new THREE.BoxGeometry(5.2, 60 - H0, d);
    const b = new THREE.Mesh(geo, [M.side, M.side, M.side, M.side, M.cut, M.side]); b.position.set(s * (2.5 + 2.6), (60 + H0) / 2, BACK / 2); world.add(b);
    box(world, 0.02, 60 - H0, d, s * 2.5, (60 + H0) / 2, BACK / 2, M.side);
    box(world, 5.0, 12, 5.0, s * 7.5, 66, -2.5, M.cut);                           // machine-room side walls
  }
  box(world, 16, 0.6, 5.0, 0, 72.3, -2.5, M.cut);                                  // machine-room roof slab
  const FLOORS = globalThis.SCORE.FLOORS;
  const shaftLamps = [], emergLamps = [];
  FLOORS.forEach((f, i) => {
    for (const s of [-1, 1]) box(world, 5.2, 0.6, -BACK + 0.04, s * 5.1, f - 0.3, BACK / 2, M.cutLight);
    // landing at the front (the cut): sill, door track, the edge of the landing doors
    box(world, 1.5, 0.06, 0.16, 0, f + 0.02, -0.4, M.steel);
    box(world, 1.6, 0.08, 0.1, 0, f + 2.25, -0.35, M.rusty);
    for (const sx of [-1, 1]) box(world, 0.1, 2.2, 0.08, sx * 0.78, f + 1.1, -0.32, M.door);
    box(world, 0.08, 0.14, 0.05, 0.62, f + 2.1, -0.4, M.yellow);                 // door lock
    // wall hardware on the back wall: shaft lamp, junction box, emergency lamp
    const lmp = box(world, 0.14, 0.24, 0.12, 2.15, f + 1.6, BACK + 0.2, M.glass); shaftLamps.push(lmp);
    for (const yy of [-0.1, 0, 0.1]) box(world, 0.16, 0.012, 0.14, 2.15, f + 1.6 + yy, BACK + 0.2, M.dark);
    box(world, 0.24, 0.24, 0.1, 1.85, f + 0.9, BACK + 0.06, M.dark);
    emergLamps.push(box(world, 0.2, 0.1, 0.07, -2.4, f + 2.6, -0.4, M.emerg));
  });
  // car guide rails (side walls) with brackets and fishplates
  for (const s of [-1, 1]) {
    box(world, 0.07, 72, 0.16, s * 1.74, 24, RZ, M.rail);
    box(world, 0.05, 72, 0.22, s * 1.79, 24, RZ, M.rail);
    for (let y = -10; y < 60; y += 2.5) { box(world, 0.72, 0.14, 0.34, s * 2.14, y, RZ, M.dark); for (const dz of [-0.1, 0.1]) cylX(world, 0.018, 0.06, s * 1.82, y, RZ + dz, M.steel, 8); }
    for (let y = -10; y < 60; y += 5) box(world, 0.12, 0.5, 0.26, s * 1.8, y + 1.2, RZ, M.rusty);
  }
  // counterweight rails at the back, bracketed to the back wall
  for (const s of [-1, 1]) {
    box(world, 0.16, 72, 0.07, s * 0.86, 24, CWZ, M.rail);
    for (let y = -10; y < 60; y += 2.5) box(world, 0.14, 0.12, -BACK + CWZ + 0.1, s * 0.86, y, (BACK + CWZ) / 2, M.dark);
  }
  // conduit, cable tray, sprinkler pipe on the back wall
  for (const [x, r, m] of [[1.55, 0.035, M.steel], [1.65, 0.035, M.steel], [-1.6, 0.06, M.rusty]]) cyl(world, r, r, 72, x, 24, BACK + 0.09, m, 12);
  box(world, 0.3, 72, 0.06, -2.1, 24, BACK + 0.04, M.rusty);
  for (let y = -10; y < 60; y += 1.2) for (const x of [1.55, 1.65, -1.6]) box(world, 0.12, 0.03, 0.08, x, y, BACK + 0.06, M.dark);
  // pit: floor, ladder, oil buffers under the car and the counterweight, the governor tension sheave
  box(world, 16, 1.0, -BACK + 0.2, 0, -9.5, BACK / 2, M.dark);
  for (let y = -8.8; y < -5; y += 0.3) box(world, 0.4, 0.03, 0.03, -2.2, y, -0.5, M.yellow);
  for (const s of [-1, 1]) box(world, 0.03, 4.0, 0.03, -2.2 + s * 0.2, -7.0, -0.5, M.yellow);
  const plungers = [];
  for (const x of [-0.7, 0.7]) {
    cyl(world, 0.24, 0.3, 0.12, x, -8.94, RZ, M.dark);
    cyl(world, 0.2, 0.22, 1.2, x, -8.3, RZ, M.buffer);
    const p = cyl(world, 0.11, 0.11, 0.62, x, -7.4, RZ, M.chrome); plungers.push(p);
    const cap = cyl(world, 0.17, 0.17, 0.07, x, -7.1, RZ, M.dark); p.userData.cap = cap;
    box(world, 0.46, 0.08, 0.02, x, -8.6, RZ + 0.22, M.hazard);
  }
  for (const x of [-0.45, 0.45]) { cyl(world, 0.17, 0.2, 1.0, x, -8.45, CWZ, M.buffer); cyl(world, 0.08, 0.08, 0.5, x, -7.7, CWZ, M.chrome); }

  // ---------- machine room: traction machine on its bedplate ----------
  const MZ = SZ;
  for (const s of [-1, 1]) box(world, 7.0, 0.7, 5.0, s * (1.3 + 3.5), 59.65, -2.5, M.cutLight);
  box(world, 4.8, 0.26, 2.0, 1.2, 60.15, MZ, M.steel);
  for (const [x, z] of [[-0.8, -0.75], [-0.8, 0.75], [3.2, -0.75], [3.2, 0.75]]) box(world, 0.44, 0.16, 0.44, x, 60.06, MZ + z, M.belt);
  const sheaveG = new THREE.Group(); sheaveG.position.set(0, TOP, MZ); world.add(sheaveG);
  cylX(sheaveG, 0.94, 1.16, 0, 0, 0, M.sheave, 72);
  for (const x of ROPE_X) { const gr = new THREE.Mesh(new THREE.TorusGeometry(0.945, 0.03, 8, 72), M.dark); gr.position.x = x; gr.rotation.y = Math.PI / 2; sheaveG.add(gr); }
  for (const x of [-0.6, 0.6]) cylX(sheaveG, 0.99, 0.04, x, 0, 0, M.sheave, 72);      // flanges
  cylX(sheaveG, 0.74, 1.3, 0, 0, 0, M.dark, 48);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cylX(sheaveG, 0.15, 1.34, 0, Math.sin(a) * 0.46, Math.cos(a) * 0.46, M.steel, 20); }
  cylX(sheaveG, 0.26, 1.44, 0, 0, 0, M.steel, 28);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; cylX(sheaveG, 0.025, 1.5, 0, Math.sin(a) * 0.2, Math.cos(a) * 0.2, M.dark, 8); }
  cylX(world, 0.12, 4.0, 1.3, TOP, MZ, M.steel, 20);                               // main shaft
  for (const x of [-0.85, 0.85, 2.35]) { box(world, 0.34, TOP - 60.28, 0.5, x, (TOP + 60.28) / 2 - 0.1, MZ, M.dark); cylX(world, 0.21, 0.32, x, TOP, MZ, M.rusty, 20); }
  // brake: drum, two shoes with pads, arms, compression springs, the release coil
  cylX(world, 0.52, 0.46, 1.6, TOP, MZ, M.brake, 48);
  const shoes = [];
  for (const sy of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(1.6, TOP, MZ); world.add(g);
    const shoe = box(g, 0.5, 0.12, 0.42, 0, sy * 0.62, 0, M.dark);
    const pad = box(g, 0.44, 0.05, 0.38, 0, sy * 0.545, 0, M.pad);
    box(g, 0.12, 0.62, 0.14, 0.32, sy * 0.95, 0, M.steel);
    const sp = coil(g, 0.07, 0.014, 7, 0.38, 0.32, sy * 1.42, 0, M.spring);
    box(g, 0.2, 0.05, 0.2, 0.32, sy * 1.65, 0, M.steel);
    shoes.push({ g, sy, sp });
  }
  box(world, 0.34, 0.5, 0.34, 2.0, TOP + 0.95, MZ, M.coilM);                       // release solenoid
  box(world, 0.05, 1.9, 0.05, 1.92, TOP, MZ + 0.22, M.steel);
  // motor: finned housing, terminal box, encoder, fan cowl, power cable
  box(world, 1.5, 1.2, 1.15, 3.1, TOP, MZ, M.dark);
  for (let i = 0; i < 12; i++) box(world, 1.5, 0.04, 1.22, 3.1, TOP - 0.52 + i * 0.095, MZ, M.rusty);
  box(world, 0.42, 0.3, 0.34, 3.1, TOP + 0.76, MZ, M.steel);
  cylX(world, 0.37, 0.3, 4.0, TOP, MZ, M.rusty, 24);
  for (let i = 0; i < 10; i++) box(world, 0.05, 0.62, 0.05, 4.0, TOP, MZ, M.dark).rotation.x = i / 10 * Math.PI;
  cylX(world, 0.09, 0.12, 4.22, TOP, MZ, M.dark, 16);
  { const pts = [new THREE.Vector3(3.1, TOP + 0.9, MZ), new THREE.Vector3(3.3, TOP + 1.5, MZ - 0.4), new THREE.Vector3(4.2, TOP + 1.6, -4.3), new THREE.Vector3(4.6, 60.2, -4.4)];
    world.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 8), M.cable)); }
  // controller cabinet against the back wall, with lamps and a door handle
  box(world, 1.2, 2.1, 0.6, -2.6, 61.1, -4.15, M.rusty);
  box(world, 0.02, 2.0, 0.02, -2.0, 61.1, -3.84, M.dark);
  const ctlLamps = []; for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), i < 2 ? M.glass : M.btn); l.position.set(-2.35, 61.8 - i * 0.14, -3.84); ctlLamps.push(l); }
  ctlLamps.forEach((l) => world.add(l));
  box(world, 0.06, 0.25, 0.06, -2.1, 60.9, -3.82, M.steel);

  // ---------- overspeed governor (machine room) + its rope loop + tension sheave (pit) ----------
  const govG = new THREE.Group(); govG.position.set(GX, GY, GZ); world.add(govG);
  box(world, 0.5, GY - 60.3, 0.4, GX, (GY + 60.3) / 2 - 0.12, GZ - 0.05, M.dark);   // pedestal
  box(world, 0.7, 0.1, 0.6, GX, 60.33, GZ - 0.05, M.steel);
  cylZ(world, 0.035, 0.36, GX, GY, GZ - 0.05, M.steel, 12);                        // axle
  const govWheel = new THREE.Group(); govG.add(govWheel);
  cylZ(govWheel, GR - 0.01, 0.07, 0, 0, 0, M.gov, 40);
  { const gr = new THREE.Mesh(new THREE.TorusGeometry(GR, 0.014, 8, 40), M.dark); govWheel.add(gr); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; const sp = box(govWheel, 0.02, GR * 1.6, 0.02, 0, 0, 0.04, M.dark); sp.rotation.z = a; }
  const flyW = [];
  for (const s of [-1, 1]) { const fw = new THREE.Group(); fw.position.set(s * 0.05, 0, 0.07); govWheel.add(fw);
    box(fw, 0.03, 0.13, 0.025, 0, s * 0.06, 0, M.steel); const b = cylZ(fw, 0.032, 0.04, 0, s * 0.13, 0, M.gov, 16); flyW.push({ fw, s }); }
  const pawl = new THREE.Group(); pawl.position.set(GR + 0.06, GR * 0.6, 0.06); govG.add(pawl);
  box(pawl, 0.03, 0.16, 0.03, 0, -0.06, 0, M.gov); box(pawl, 0.06, 0.03, 0.04, -0.02, -0.14, 0, M.gov);
  box(govG, 0.08, 0.5, 0.08, GR + 0.08, 0.05, -0.05, M.dark);
  box(govG, 0.12, 0.08, 0.1, GR + 0.02, GR + 0.1, 0.06, M.yellow);                // switch
  // tension sheave in the pit, on a weighted arm
  const tensG = new THREE.Group(); tensG.position.set(GX, GYP, GZ); world.add(tensG);
  cylZ(tensG, GR - 0.01, 0.06, 0, 0, 0, M.sheave, 32);
  box(tensG, 0.08, 0.5, 0.08, GR + 0.1, 0.05, -0.06, M.dark); box(tensG, 0.6, 0.06, 0.06, GR - 0.1, -0.15, -0.1, M.dark);
  box(tensG, 0.24, 0.3, 0.16, -0.3, -0.25, -0.1, M.rusty);
  // the two straight runs of the governor rope + moving marker sleeves
  const govRopes = [-1, 1].map((s) => { const m = cyl(world, 0.014, 0.014, GY - GYP, GX + s * GR, (GY + GYP) / 2, GZ, M.govRope, 8); return m; });
  const NMARK = 46;
  const markGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.08, 10);
  const marks = new THREE.InstancedMesh(markGeo, M.dark, NMARK * 2); world.add(marks); marks.frustumCulled = false;

  // ---------- the counterweight ----------
  const cwG = new THREE.Group(); world.add(cwG);
  for (const s of [-1, 1]) { box(cwG, 0.1, 3.7, 0.24, s * 0.72, 0, 0, M.steel); for (const yy of [1.5, -1.6]) box(cwG, 0.14, 0.24, 0.2, s * 0.8, yy, 0, M.dark); }
  box(cwG, 1.56, 0.18, 0.28, 0, 1.88, 0, M.steel); box(cwG, 1.56, 0.18, 0.28, 0, -1.88, 0, M.steel);
  for (let i = 0; i < 22; i++) box(cwG, 1.3, 0.15, 0.2, 0, -1.68 + i * 0.16, 0, M.cw);
  box(cwG, 1.2, 0.07, 0.26, 0, 2.0, 0, M.dark);
  for (const x of ROPE_X) { coil(cwG, 0.034, 0.008, 6, 0.16, x, 2.12, 0, M.rusty); cyl(cwG, 0.026, 0.045, 0.15, x, 2.29, 0, M.dark, 12); }

  // ---------- the car ----------
  const car = new THREE.Group(); scene.add(car);
  box(car, 2.0, 0.12, 2.2, 0, -1.14, CZ, M.floorStone);
  box(car, 2.0, 0.1, 2.2, 0, 1.15, CZ, M.carWall);
  for (const s of [-1, 1]) box(car, 0.06, 2.4, 2.2, s * 0.97, 0, CZ, M.carWall);
  box(car, 1.94, 2.3, 0.06, 0, 0, -2.72, M.carWall);                               // back wall
  box(car, 1.3, 1.1, 0.015, 0, 0.25, -2.685, M.mirror);                             // mirror
  { const hr = cylX(car, 0.022, 1.8, 0, -0.15, -2.62, M.steel, 12); for (const x of [-0.9, 0.9]) cylZ(car, 0.014, 0.1, x, -0.15, -2.67, M.steel, 8); }
  for (const s of [-1, 1]) { const hr = cylZ(car, 0.022, 1.9, s * 0.88, -0.15, CZ, M.steel, 12); }
  // front: transom with the floor indicator, door sill, jamb edges (the doors themselves are in the cut)
  box(car, 2.0, 0.26, 0.08, 0, 1.0, -0.58, M.carWall);
  for (const sx of [-1, 1]) box(car, 0.22, 2.3, 0.08, sx * 0.89, 0, -0.58, M.carWall);
  box(car, 1.6, 0.04, 0.12, 0, -1.07, -0.6, M.steel);
  const indC = document.createElement('canvas'); indC.width = 256; indC.height = 96;
  const indT = new THREE.CanvasTexture(indC); indT.colorSpace = THREE.SRGBColorSpace;
  box(car, 0.5, 0.17, 0.03, 0, 1.0, -0.53, M.dark);
  { const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.13), new THREE.MeshBasicMaterial({ map: indT, toneMapped: false })); ind.position.set(0, 1.0, -0.513); car.add(ind); }
  // operating panel on the right wall, near the door
  box(car, 0.04, 1.1, 0.34, 0.93, 0.05, -0.85, M.steel);
  for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 16), M.btn); b.rotation.z = Math.PI / 2; b.position.set(0.905, 0.45 - (i >> 1) * 0.16, -0.92 + (i & 1) * 0.14); car.add(b); }
  box(car, 0.03, 0.1, 0.1, 0.905, -0.3, -0.85, M.yellow);                         // alarm button
  box(car, 0.3, 0.09, 0.14, -0.78, 1.06, -0.62, M.emergCar);                        // emergency light
  const lampPanel = box(car, 1.3, 0.03, 0.95, 0, 1.08, CZ, M.lamp);
  for (const [x, z] of [[-0.55, -1.2], [0.55, -1.2], [-0.55, -2.1], [0.55, -2.1]]) cyl(car, 0.09, 0.09, 0.02, x, 1.09, z, M.glass, 18);
  // roof, sling, crosshead, hitch with springs and wedge sockets
  box(car, 2.2, 0.14, 2.4, 0, 1.27, CZ, M.dark);
  box(car, 2.5, 0.3, 0.3, 0, 1.5, RZ, M.steel);
  box(car, 1.45, 0.08, 0.34, 0, 1.78, RZ, M.dark);
  for (const x of ROPE_X) {
    cyl(car, 0.016, 0.016, 0.34, x, 1.62, RZ, M.steel, 10);
    coil(car, 0.036, 0.009, 7, 0.2, x, 1.68, RZ, M.rusty);
    cyl(car, 0.028, 0.028, 0.05, x, 1.86, RZ, M.steel, 12);
    cyl(car, 0.034, 0.052, 0.17, x, 1.99, RZ, M.dark, 14);
  }
  for (const s of [-1, 1]) box(car, 0.1, 2.9, 0.2, s * 1.15, 0.12, RZ, M.steel);
  box(car, 2.5, 0.15, 0.3, 0, -1.3, RZ, M.steel);
  for (const s of [-1, 1]) for (const yy of [1.5, -1.3]) { box(car, 0.16, 0.2, 0.26, s * 1.58, yy, RZ, M.dark); for (const o of [-0.09, 0.09]) box(car, 0.05, 0.22, 0.08, s * 1.62, yy, RZ + o, M.belt); }
  // safety gear: a block astride each rail with two wedges that the linkage pulls up
  const wedges = [];
  for (const s of [-1, 1]) {
    box(car, 0.34, 0.42, 0.42, s * 1.6, -1.1, RZ, M.dark);
    for (const o of [-1, 1]) { const w = box(car, 0.08, 0.2, 0.06, s * 1.74, -1.1, RZ + o * 0.07, M.safety); w.rotation.x = o * 0.14; wedges.push(w); }
    box(car, 0.08, 0.5, 0.08, s * 1.45, -0.8, RZ + 0.24, M.steel);
  }
  cylX(car, 0.022, 2.9, 0, -0.55, RZ + 0.24, M.steel, 10);                          // synchronising shaft to both sides
  const linkRod = cyl(car, 0.016, 0.016, 2.15, 1.45, 0.5, GZ, M.steel, 8);
  const lever = new THREE.Group(); lever.position.set(1.45, 1.62, GZ); car.add(lever);
  box(lever, GX - GR - 1.45 + 0.04, 0.06, 0.06, (GX - GR - 1.45) / 2, 0, 0, M.safety);
  box(lever, 0.09, 0.12, 0.09, GX - GR - 1.45, 0, 0, M.safety);                 // rope grip on the governor rope
  cylZ(car, 0.04, 0.12, 1.45, 1.62, GZ, M.dark, 12);
  // car-top railing, door operator, inspection box
  for (const [x, z] of [[-1.0, -0.6], [1.0, -0.6], [-1.0, -2.7], [1.0, -2.7]]) cyl(car, 0.02, 0.02, 1.0, x, 1.84, z, M.yellow, 8);
  for (const z of [-0.6, -2.7]) cylX(car, 0.02, 2.0, 0, 2.32, z, M.yellow, 8);
  for (const x of [-1.0, 1.0]) cylZ(car, 0.02, 2.1, x, 2.32, -1.65, M.yellow, 8);
  box(car, 1.7, 0.25, 0.3, 0, 1.47, -0.75, M.dark); box(car, 0.35, 0.25, 0.3, 0.6, 1.47, -1.05, M.rusty);
  const insp = box(car, 0.4, 0.22, 0.3, -0.6, 1.46, -2.3, M.dark);
  box(car, 0.06, 0.05, 0.02, -0.6, 1.5, -2.14, M.yellow);
  box(car, 2.0, 0.08, 2.2, 0, -1.25, CZ, M.dark);

  // people
  const person = makePerson(M, {}); car.add(person.g); person.g.position.set(-0.12, -1.08, -1.78);
  const tech = makePerson(M, { shirt: M.techShirt, pants: M.techPants, vest: true, helmet: true, gloves: true, boots: true, longSleeve: true });
  car.add(tech.g); tech.g.position.set(-0.78, 1.34, -2.1); tech.g.rotation.y = -0.7;

  // ---------- ropes: tubes with proper ring frames, rebuilt every frame ----------
  const RS = 12, RAD = 0.05, LAY = 26;
  function tubeMesh(N, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * RS * 3), 3));
    const idx = []; for (let a = 0; a < N - 1; a++) for (let b = 0; b < RS; b++) { const p = a * RS + b, q = a * RS + (b + 1) % RS; idx.push(p, q, p + RS, q, q + RS, p + RS); }
    g.setIndex(idx);
    const uv = new Float32Array(N * RS * 2); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.userData.N = N; scene.add(m); return m;
  }
  const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _x = new THREE.Vector3(1, 0, 0);
  function writeTube(mesh, pts, lay0 = 0, rad = RAD, flat = 0) {
    const N = mesh.userData.N, pos = mesh.geometry.attributes.position.array, uv = mesh.geometry.attributes.uv.array;
    let len = 0;
    for (let a = 0; a < N; a++) {
      const p = pts[a], q = pts[Math.min(N - 1, a + 1)], o = pts[Math.max(0, a - 1)];
      _t.set(q[0] - o[0], q[1] - o[1], q[2] - o[2]).normalize();
      if (a > 0) len += Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]) / (a === N - 1 ? 1 : 2) * (a === N - 1 ? 1 : 1);
      _n.copy(Math.abs(_t.x) > 0.9 ? _z : _x); _b.crossVectors(_t, _n).normalize(); _n.crossVectors(_b, _t).normalize();
      const twist = lay0 + len * LAY;
      for (let b = 0; b < RS; b++) {
        const ang = b / RS * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        const r = rad * (1 + 0.17 * (1 - flat) * Math.cos(6 * (ang - twist)));
        const rx = r * (1 + flat * 0.5), ry = r * (1 - flat * 0.55);
        const k = (a * RS + b) * 3;
        pos[k] = p[0] + _n.x * c * rx + _b.x * s * ry; pos[k + 1] = p[1] + _n.y * c * rx + _b.y * s * ry; pos[k + 2] = p[2] + _n.z * c * rx + _b.z * s * ry;
        uv[(a * RS + b) * 2] = b / RS * 3; uv[(a * RS + b) * 2 + 1] = len * 0.4;
      }
    }
    mesh.geometry.attributes.position.needsUpdate = true; mesh.geometry.attributes.uv.needsUpdate = true; mesh.geometry.computeVertexNormals();
  }
  const ropes = ROPE_X.map((x) => ({ x, main: tubeMesh(170, ropeMat), stub: tubeMesh(40, ropeMat), cwSide: tubeMesh(90, ropeMat) }));
  const travel = tubeMesh(70, M.cable);

  // ---------- sparks: rope tear (at the sheave) and the safety gear on the rails ----------
  const mkPts = (n, size, color) => { const a = new Float32Array(n * 3); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); p.frustumCulled = false; scene.add(p); return { p, a }; };
  const tearS = mkPts(160, 4.2, 0xffb060), railS = mkPts(260, 3.6, 0xffc070);
  const sdT = Array.from({ length: 160 }, (_, i) => { const r = mul32(900 + i); const a = r() * Math.PI * 2, e = 0.3 + r() * 1.2, v = 2 + r() * 7;
    return { rope: i % 6, vx: Math.cos(a) * v * 0.7, vy: Math.sin(e) * v, vz: Math.sin(a) * v * 0.5, t0: r() * 0.12, life: 0.15 + r() * 0.3 }; });
  const sdR = Array.from({ length: 260 }, (_, i) => { const r = mul32(4400 + i); return { side: i % 2 ? 1 : -1, tb: r(), vx: (r() * 0.6 + 0.4) * 3.0, vy: 1 + r() * 4, vz: (r() - 0.5) * 3, life: 0.35 + r() * 0.5 }; });

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x8fb4e8, 0x0a0e14, 0.5); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xdfeaff, 1.2); scene.add(key); scene.add(key.target);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -6, right: 6, top: 9, bottom: -9, near: 0.5, far: 50 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  const carLamp = new THREE.PointLight(0xffe2b0, 14, 9, 2); car.add(carLamp); carLamp.position.set(0, 0.9, -1.0);
  const spot = new THREE.SpotLight(0xffe6c4, 45, 6, 1.15, 0.7, 2); spot.position.set(0, 1.04, CZ); car.add(spot); spot.target.position.set(0, -1.2, CZ); car.add(spot.target);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005;
  const emerg = new THREE.PointLight(0xff8a3a, 0, 5, 2); car.add(emerg); emerg.position.set(-0.78, 0.9, -0.9);
  const roomLamp = new THREE.PointLight(0xdfe8ff, 40, 14, 2); roomLamp.position.set(0.5, 70, -1.5); scene.add(roomLamp);
  const hall = new THREE.PointLight(0xffd8a8, 0, 7, 2); scene.add(hall);
  const glow = new THREE.PointLight(0xff9a4a, 0, 9, 2); scene.add(glow);
  const sparkLight = new THREE.PointLight(0xffb060, 0, 5, 2); scene.add(sparkLight);
  { const ND = 600, dp = new Float32Array(ND * 3); const r = mul32(77); for (let i = 0; i < ND; i++) { dp[i * 3] = (r() - 0.5) * 4.6; dp[i * 3 + 1] = -10 + r() * 82; dp[i * 3 + 2] = BACK + r() * 3.9; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x9fb6d0, size: 0.03, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }))); }
  world.traverse((o) => { if (o.isMesh && !(o.material && o.material.isMeshBasicMaterial)) { o.castShadow = true; o.receiveShadow = true; } });
  car.traverse((o) => { if (o.isMesh && !(o.material && o.material.isMeshBasicMaterial)) { o.castShadow = true; o.receiveShadow = true; } });
  const cam = new THREE.PerspectiveCamera(38, VW / VH, 0.05, 400);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, cam));
  try { const g = new GTAOPass(scene, cam, RW, RH); g.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.0, scale: 1.1, samples: 8, screenSpaceRadius: false }); composer.addPass(g); } catch (e) { console.log('GTAO off ' + e.message); }
  composer.addPass(new OutputPass());
  try { composer.addPass(new SMAAPass(RW, RH)); } catch (e) {}

  return { renderer, composer, scene, cam, M, ropeMat, world, car, cwG, sheaveG, govWheel, flyW, pawl, tensG, marks, shoes, plungers, wedges, lever, linkRod,
    person, tech, ropes, travel, writeTube, tearS, railS, sdT, sdR, hemi, key, carLamp, spot, emerg, roomLamp, hall, glow, sparkLight,
    indC, indT, shaftLamps, emergLamps, ctlLamps, lampPanel, insp, VW, VH };
}

// ---------- everything that changes with time ----------
export function apply(S, t, camPos) {
  const sc = globalThis.SCORE, ev = sc.ev, s = sc.st(t);
  const y = s.carY;
  S.car.position.y = y;
  const cd = Math.hypot(camPos[0], camPos[2] + 2); S.scene.fog.far = 60 + Math.max(0, cd - 20) * 1.4; S.scene.fog.near = 14 + Math.max(0, cd - 20);
  S.cwG.position.set(0, s.cwY, CWZ);
  const on = s.power, em = s.emerg;

  // lights
  S.hemi.intensity = 0.38 * on + 0.3 * (1 - on);
  S.scene.environmentIntensity = 0.34 * on + 0.14;
  S.key.intensity = 0.5 * on + 0.16 * (1 - on);
  S.carLamp.intensity = 14 * on; S.spot.intensity = 45 * on;
  S.M.lamp.emissiveIntensity = 1.5 * on; S.M.glass.emissiveIntensity = 2.2 * on;
  S.M.btn.emissiveIntensity = 1.4 * on + 0.15;
  S.M.emerg.emissiveIntensity = 2.6 * em; S.M.emergCar.emissiveIntensity = 3.2 * em; S.emerg.intensity = 12 * em;
  S.roomLamp.intensity = 40 * on + 4;
  S.hall.position.set(0, y + 0.4, 0.6); S.hall.intensity = 55 * s.door;

  // the floor indicator (battery-backed, stays lit)
  {
    const fy = y - 1.08 + 0.6; let n = 1; sc.FLOORS.forEach((f, i) => { if (fy >= f) n = i + 1; });
    const v = sc.carV(t), dir = v < -0.05 ? 'v' : v > 0.05 ? '^' : '-', k = n + dir;
    if (S._ind !== k) {
      S._ind = k; const x = S.indC.getContext('2d'), w = 256, h = 96, col = '#ff3a1e';
      x.fillStyle = '#050505'; x.fillRect(0, 0, w, h);
      x.font = '700 78px Inter, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = 'rgba(255,58,30,0.08)'; x.fillText('88', 160, 52);
      x.shadowColor = col; x.shadowBlur = 14; x.fillStyle = col; x.fillText(String(n), 160, 52);
      x.beginPath(); if (dir === 'v') { x.moveTo(40, 32); x.lineTo(84, 32); x.lineTo(62, 68); } else { x.moveTo(40, 64); x.lineTo(84, 64); x.lineTo(62, 28); }
      x.globalAlpha = dir === '-' ? 0.15 : 1; x.fill(); x.globalAlpha = 1; x.shadowBlur = 0; S.indT.needsUpdate = true;
    }
  }

  // people
  const P = { float: s.float, grab: s.grab, crouch: s.crouch, look: s.look, baseY: 0 };
  let walk = 0, wph = 0, turn = 0, pz = -1.78;
  if (s.part === 6) {                                             // the doors open, he steps toward the light
    walk = sm((t - ev.doors - 0.6) / 0.4) * (1 - sm((t - ev.doors - 2.6) / 0.4));
    const u = clamp((t - ev.doors - 0.6) / 2.2); pz = -1.78 + u * 0.95; wph = u * 2.2;
    turn = 0;
  }
  pose(S.person, Object.assign(P, { walk, walkPhase: wph, turn }), t);
  S.person.g.position.y = -1.08 + S.person.g.position.y;
  S.person.g.position.z = pz;
  S.tech.g.visible = s.tech > 0.5;
  if (S.tech.g.visible) { pose(S.tech, { kneel: 1, look: 0, turn: Math.sin(t * 0.9) * 0.15 }, t); S.tech.g.position.y = 1.34 + S.tech.g.position.y; }

  // counterweight + ropes
  const cwTop = s.cwY + 2.36;
  const gR = s.gRopes, cwg = s.gCW;
  S.ropeMat.emissiveIntensity = 0.42 * gR;
  S.M.cw.emissiveIntensity = 0.22 * cwg;
  const carbon = s.carbon;
  S.ropeMat.color.setRGB(0.66 * (1 - carbon) + 0.05 * carbon, 0.65 * (1 - carbon) + 0.05 * carbon, 0.62 * (1 - carbon) + 0.055 * carbon);
  S.ropeMat.metalness = 0.9 - 0.6 * carbon; S.ropeMat.roughness = 0.42 + 0.1 * carbon;
  const a0 = y + 2.07;
  S.ropes.forEach((rp, i) => {
    const x = rp.x, ph = i * 0.9 + t * 7.5;
    if (s.ropes === 'intact') {
      // car hitch -> up to the sheave -> over 180 degrees -> down to the counterweight
      const N = 170, pts = [], L1 = TOP - a0, L2 = TOP - cwTop, n1 = 60, na = 50, n2 = N - n1 - na;
      for (let k = 0; k < n1; k++) pts.push([x, a0 + L1 * (k / n1), RZ]);
      for (let k = 0; k < na; k++) { const u = k / (na - 1) * Math.PI; pts.push([x, TOP + Math.sin(u) * SR, SZ + Math.cos(u) * SR]); }
      for (let k = 1; k <= n2; k++) pts.push([x, TOP - L2 * (k / n2), CWZ]);
      S.writeTube(rp.main, pts, i * 0.7, undefined, carbon);
      rp.stub.visible = false; rp.cwSide.visible = false; rp.main.visible = true;
    } else {
      // trailing (imagined fall) or torn (part 2): a slack rope above the car, swaying
      const torn = s.ropes === 'snapped', N = 170, pts = [];
      const L = torn ? 9 : (TOP - (sc.Y0 + 2.07));
      const sw = torn ? 0.14 + 0.1 * sm(s.story / 0.3) : 0.24 * sm((s.tau || 0) / 0.5);
      for (let k = 0; k < N; k++) {
        const u = k / (N - 1), e = Math.pow(u, 1.6);
        pts.push([x + Math.sin(u * 14 - ph) * sw * e + (torn ? Math.sin(u * 5 - ph * 1.3) * 0.3 * u * u * u : 0), a0 + L * u, RZ + Math.cos(u * 11 - ph * 0.8) * sw * 0.5 * e]);
      }
      S.writeTube(rp.main, pts, i * 0.7);
      // the counterweight side stays over the sheave
      const N2 = 90, p2 = [], na = 40, L2 = TOP - cwTop;
      for (let k = 0; k < na; k++) { const u = k / (na - 1) * Math.PI * 0.5 + Math.PI * 0.5; p2.push([x, TOP + Math.sin(u) * SR, SZ + Math.cos(u) * SR]); }
      for (let k = 1; k <= N2 - na; k++) p2.push([x, TOP - L2 * (k / (N2 - na)), CWZ]);
      S.writeTube(rp.cwSide, p2, i * 0.7); rp.cwSide.visible = true;
      rp.stub.visible = torn;
      if (torn) {                                                 // the torn end left in the groove, whipping down
        const ts = Math.max(0, s.story * 3 - i * 0.01), dec = Math.exp(-ts * 1.1), sp2 = [];
        for (let k = 0; k < 40; k++) {
          const u = k / 39, len = 1.5 + (i % 3) * 0.2;
          if (u < 0.35) { const a = Math.PI * 0.5 - (u / 0.35) * Math.PI * 0.5; sp2.push([x, TOP + Math.sin(a) * SR, SZ + Math.cos(a) * SR]); continue; }
          const v = (u - 0.35) / 0.65;
          sp2.push([x + Math.sin(ts * 9 + i) * 0.6 * dec * v * v, TOP - v * len * (1 - 0.15 * v * (1 - dec)), RZ + Math.cos(ts * 7 + i * 1.7) * 0.35 * dec * v * v]);
        }
        S.writeTube(rp.stub, sp2, i * 0.7);
      }
    }
  });

  // traveling cable: hangs in a U from under the car to its hitch on the back wall at mid-height
  {
    const yc = y - 1.4, yh = 14, Lc = 24, low = Math.max(-8.6, (yc + yh - Lc) / 2), xa = 0.55, xb = 1.25, zc = -3.12, r = (xb - xa) / 2;
    const k2 = Math.round(t * 30);
    if (S._trav !== k2) {
      S._trav = k2; const pts = [];
      for (let k = 0; k < 25; k++) pts.push([xa, yc - (yc - low) * (k / 25), zc]);
      for (let k = 0; k < 20; k++) { const a = Math.PI - k / 19 * Math.PI; pts.push([xa + r + Math.cos(a) * r, low - Math.sin(a) * r * 0.9, zc]); }
      for (let k = 1; k <= 25; k++) pts.push([xb, low + (yh - low) * (k / 25), zc]);
      S.writeTube(S.travel, pts, 0, 0.035, 1);
    }
  }

  // governor: the wheel turns with the rope; flyweights swing out with speed; the pawl drops in at the trip
  const travelGov = s.part === 2 ? sc.drop2(Math.min(s.story, 0.40)) : (s.part === 3 ? (sc.Y0 - y) : (s.part === 1 ? (sc.Y0 - y) : 0));
  S.govWheel.rotation.z = -travelGov / GR;
  const spd = s.part === 2 ? clamp(s.govV / 4) : 0;
  for (const f of S.flyW) f.fw.rotation.z = f.s * (0.15 + 0.85 * Math.max(spd, s.govTrip));
  S.pawl.rotation.z = -0.9 * (1 - s.govTrip);
  S.M.gov.emissiveIntensity = 0.3 * s.gGov;
  S.M.govRope.emissiveIntensity = 0.9 * s.gGovRope;
  // rope markers: the car side moves with the car until the trip, then stops
  {
    const dummy = S._dm || (S._dm = new THREE.Object3D());
    const off = ((travelGov % 1.5) + 1.5) % 1.5;
    for (let i = 0; i < 46; i++) {
      const yA = -7 + i * 1.5 - off, yB = -7 + i * 1.5 + off;
      dummy.position.set(GX - GR, yA, GZ); dummy.updateMatrix(); S.marks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(GX + GR, yB, GZ); dummy.updateMatrix(); S.marks.setMatrixAt(46 + i, dummy.matrix);
    }
    S.marks.instanceMatrix.needsUpdate = true;
  }
  // safety gear: the lever is held by the stopped rope while the car keeps going; the wedges rise
  S.lever.rotation.z = 0.42 * s.link;
  S.wedges.forEach((w) => { w.position.y = -1.1 + 0.07 * s.wedge; });
  S.M.safety.emissiveIntensity = s.wedgeFail ? 0 : 0.8 * s.gWedge;
  S.M.safety.color.setHex(s.wedgeFail ? 0x5a5f66 : 0x80878f);
  // buffers
  S.plungers.forEach((p) => { p.position.y = -7.4 - s.buffer; p.userData.cap.position.y = -7.1 - s.buffer; });
  S.M.buffer.emissiveIntensity = 0.25 * s.gBuffer; S.M.chrome.emissiveIntensity = 0.15 * s.gBuffer;
  // brake: coil energised holds the shoes off; springs push them onto the drum
  S.shoes.forEach((b) => { b.g.position.y = TOP + b.sy * 0.055 * (1 - s.brake) * (s.part === 4 ? 1 : 0); b.sp.scale.y = 1 + 0.18 * (1 - s.brake) * (s.part === 4 ? -1 : 0); });
  S.M.coilM.emissiveIntensity = s.part === 4 ? 0.9 * s.brakeHold * (t > ev.brakeShot ? 1 : 0) : 0;
  S.M.pad.emissiveIntensity = 0.8 * s.gBrake * s.brake; S.M.spring.emissiveIntensity = 0.7 * s.gBrake;
  S.ctlLamps.forEach((l, i) => { l.visible = i < 2 ? on > 0.5 : true; });

  // sparks: the tear
  {
    const a = S.tearS.a, torn = s.part === 2, u0 = s.story;
    for (let i = 0; i < 160; i++) {
      const d = S.sdT[i], u = u0 - d.t0;
      if (!torn || u < 0 || u > d.life) { a[i * 3 + 1] = -999; continue; }
      a[i * 3] = ROPE_X[d.rope] + d.vx * u; a[i * 3 + 1] = TOP + 0.95 + d.vy * u - 4.9 * u * u; a[i * 3 + 2] = SZ + d.vz * u;
    }
    S.tearS.p.geometry.attributes.position.needsUpdate = true;
  }
  // sparks: the wedges biting the rails (born along the slide, between clamp and stop)
  {
    const a = S.railS.a, live = s.part === 2 && t > ev.clamp - 0.1;
    let n = 0;
    for (let i = 0; i < 260; i++) {
      const d = S.sdR[i], tb = ev.clamp + d.tb * (ev.stop - ev.clamp), u = (t - tb) * 0.35;
      if (!live || u < 0 || u > d.life) { a[i * 3 + 1] = -999; continue; }
      const yb = sc.carY(tb) - 1.1; n++;
      a[i * 3] = d.side * (1.74 - d.vx * u * 0.4); a[i * 3 + 1] = yb + d.vy * u - 4.9 * u * u; a[i * 3 + 2] = RZ + d.vz * u;
    }
    S.railS.p.geometry.attributes.position.needsUpdate = true;
    S.sparkLight.position.set(1.7, y - 1.1, RZ + 0.4); S.sparkLight.intensity = live ? 6 * Math.min(1, n / 40) : 0;
  }
  // the orange accent light sits near whatever is lit up
  const gl = Math.max(gR, cwg, s.gGov, s.gGovRope * 0.6, s.gWedge, s.gBuffer, s.gBrake);
  S.glow.position.set(camPos[0] * 0.3 + 0.6, camPos[1] + 0.4, camPos[2] - 1.6); S.glow.intensity = 26 * gl;
  S.key.position.set(camPos[0] - 3, camPos[1] + 4, camPos[2] + 6);
  S.key.target.position.set(0, camPos[1] - 1, -1.65); S.key.target.updateMatrixWorld();
  return s;
}

export function shot(S, pos, tgt, fov) {
  S.cam.position.set(pos[0], pos[1], pos[2]);
  if (fov && Math.abs(fov - S.cam.fov) > 1e-6) { S.cam.fov = fov; S.cam.updateProjectionMatrix(); }
  S.cam.lookAt(tgt[0], tgt[1], tgt[2]);
  S.composer.render();
  return S.renderer.domElement;
}
window.ELEV = { build, apply, shot, THREE, TOP, GX, GY, GZ, GR, GYP, SZ, CWZ, RZ };
