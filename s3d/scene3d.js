// Detailed 3D cutaway of a shelter, following the professional checklist:
// bevel every edge, assemble surfaces from parts (lifts, courses, joints),
// procedural PBR (albedo + normal + roughness + AO), IBL + sun, GTAO, ACES.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import * as TEX from './tex.js';

const TAU = Math.PI * 2;
const R = TEX.rng(20261122);

// ---- geometry helpers: nothing gets a razor-sharp edge ---------------------
const rbGeo = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r ?? Math.min(w, h, d) * 0.07);
function bx(g, w, h, d, x, y, z, mat, r) {
  const m = new THREE.Mesh(rbGeo(w, h, d, r), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function cyl(g, rt, rb, h, x, y, z, mat, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function tor(g, r, t, x, y, z, mat, seg = 10, rad = 24) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, seg, rad), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function sph(g, r, x, y, z, mat, s = 18) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, s, Math.max(6, s * 0.7 | 0)), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
THREE.ColorManagement.enabled = true;
const plain = (c, ro = 0.9, me = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: ro, metalness: me });

// ---- world (metres, y up, the cut face looks toward +z) --------------------
export const W = {
  px0: -5, px1: 5, wall: 0.62, floor: -7.2,
  slabTop: 0.28, slabBot: -0.42,   // the slab's top sits at ground level: no open band at the cut
  entX: -8.6, ventX: -6.7, exitX: 16.3,
  z0: -7.0, z1: 0,                      // the cutaway plane is z = 0
  rz0: -5.4,                            // inner face of the back wall
};
const ZD = W.z1 - W.z0, ZC = (W.z0 + W.z1) / 2;   // depth / centre of the block

export function build(VW, VH, cam, SS = Number(globalThis.RQ_SS || 0.55)) {
  const RW = Math.round(VW * SS), RH = Math.round(VH * SS);
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(RW, RH, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.05;   // keeps colour saturation; ACES was washing the sky out
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const _rnd = Math.random; let _s = 123456789;
  Math.random = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe4f6, 150, 340);
  {                                   // sky: a vertex-coloured dome, so the gradient is exactly where we put it
    const geo = new THREE.SphereGeometry(320, 32, 24);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const cTop = new THREE.Color('#0f4aa8').convertSRGBToLinear(), cMid = new THREE.Color('#67a6ea').convertSRGBToLinear(),
          cHaze = new THREE.Color('#e9eef0').convertSRGBToLinear(), cDn = new THREE.Color('#b9c6b4').convertSRGBToLinear();
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 320;                       // -1 at the nadir, +1 at the zenith
      if (y >= 0.42) tmp.copy(cMid).lerp(cTop, Math.min(1, (y - 0.42) / 0.5));
      else if (y >= 0.03) tmp.copy(cHaze).lerp(cMid, (y - 0.03) / 0.39);
      else tmp.copy(cHaze).lerp(cDn, Math.min(1, -y / 0.25));
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    dome.renderOrder = -1; scene.add(dome); scene.userData.dome = dome;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);          // IBL, no network
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  const hemi = new THREE.HemisphereLight(0x8fb6f0, 0x7a5c38, 0.52); scene.add(hemi);        // less flat fill, so the key light reads
  const sun = new THREE.DirectionalLight(0xffd892, 5.2);                  // warm, low afternoon key
  sun.position.set(17, 31, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 110 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.035;
  scene.add(sun);
  // IBL tried and dropped: we already have a sky dome + hemisphere fill, so an environment map
  // double-counted the ambient and threw a blue cast over every shaded surface.
  const rim = new THREE.DirectionalLight(0xcfe0f5, 0.75);          // rim light: separates the structure from the ground
  rim.position.set(-20, 9, -26); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9fc0e8, 0.3); fill.position.set(-20, 10, 22); scene.add(fill);

  const M = {
    conc: TEX.concrete({ rep: [2, 2] }),
    concIn: TEX.concrete({ rep: [2.4, 1.6], tint: '#a8a49a', wet: 1 }),
    soil: TEX.soilFace({ rep: [2.2, 1], size: 768 }),
    soil2: TEX.soilFace({ rep: [1.6, 1], seed: 12, size: 768 }),
    grass: TEX.grass({ rep: [7, 7], tint: '#a9e27a' }),
    wood: TEX.wood({ rep: [1.5, 1] }),
    woodDk: TEX.wood({ rep: [1, 1], tint: [106, 72, 42], boards: 4 }),
    steel: TEX.metal({ rep: [1, 1], base: '#4f6c7c' }),
    steelD: TEX.metal({ rep: [2, 1], base: '#6a7076', rust: 0.9 }),
    burlap: TEX.burlap({ rep: [1.4, 1] }),
    plaster: TEX.plaster({ rep: [2, 1.4] }),
    rebar: plain(0x8b5b39, 0.72, 0.5),
    dark: plain(0x2b2f34, 0.95),
  };

  // A 20 m slab and a 1 m box must not share one UV scale. Cache clones by size.
  const _fc = new Map();
  const fit = (mat, w, h, unit = 3.2, tint) => {
    const rx = Math.max(0.5, Math.round(w / unit * 2) / 2), ry = Math.max(0.5, Math.round(h / unit * 2) / 2);
    const key = mat.uuid + '|' + rx + '|' + ry + '|' + (tint || '');
    let m = _fc.get(key);
    if (!m) {
      m = mat.clone();
      for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) if (m[k]) { m[k] = m[k].clone(); m[k].needsUpdate = true; m[k].repeat.set(rx, ry); }
      if (tint) m.color = new THREE.Color(tint);
      _fc.set(key, m);
    }
    return m;
  };

  const root = new THREE.Group(); scene.add(root);
  const P = {};
  const G = (n) => { const g = new THREE.Group(); P[n] = g; root.add(g); return g; };

  // ============ GROUND: strata as separate slabs, ragged cut face =========
  const gEarth = G('earth');
  const strata = [[0, -1.1, '#efe4d6'], [-1.1, -3.0, '#e4d6c4'], [-3.0, -5.6, '#d8c6b0'], [-5.6, -9.2, '#cdb9a2'], [-9.2, -13.5, '#c0ab93']];
  // Columns of ground. yTop < 0 leaves an open slot above — that is how the
  // entrance trench, the vent channel and the escape shaft stay visible.
  const column = (x0, x1, yTop, vT, vB) => {
    strata.forEach(([y0, y1], i) => {
      if (y0 > yTop) y0 = yTop; if (y1 >= y0) return;
      const parts = [];                                            // leave the tunnel's void out of the solid ground
      if (vT === undefined || y1 >= vT || y0 <= vB) parts.push([y0, y1]);
      else { if (y0 > vT) parts.push([y0, vT]); if (y1 < vB) parts.push([vB, y1]); }
      for (const [p0, p1] of parts) {
        const jig = 0.06 + R() * 0.22, h = p0 - p1, w = x1 - x0; if (h <= 0.02) continue;
        bx(gEarth, w, h, ZD - jig, (x0 + x1) / 2, p1 + h / 2, ZC - jig / 2, fit(i % 2 ? M.soil2 : M.soil, w, h, 4.2, strata[i][2]), 0.03);
      }
    });
    if (yTop > -0.05) bx(gEarth, x1 - x0, 0.3, ZD, (x0 + x1) / 2, 0.15, ZC, fit(M.grass, x1 - x0, ZD, 3.0), 0.04);
  };
  const SOLID = [[-27, -7.18], [-6.22, -5.62], [5.62, 27]];   // right of the pit the ground is solid; the tunnel is bored through it
  const SLOTS = [[6.22, 7.18, -7.7], [8.5, 10.75, -7.5]];
  bx(gEarth, 54, 32, ZD, 0, -13.5 - 16, ZC, fit(M.soil2, 54, 32, 4.2, '#b5a189'), 0.04);        // bedrock: the block is not floating in the air
  {
    const back = new THREE.Mesh(new THREE.BoxGeometry(620, 46, 600), fit(M.soil2, 620, 46, 4.2, '#bfab93'));
    back.position.set(0, -0.5 - 23, W.z0 - 300);                  // top stays UNDER the grass plane, or the distance renders brown
    back.receiveShadow = true; gEarth.add(back);                  // solid earth behind the cut: no sky showing through the dig
  }
  const TVT = -4.85, TVB = -7.6;                                 // the tunnel's void band
  for (const [a, b] of SOLID) column(a, b, 0, b > 5 ? TVT : undefined, b > 5 ? TVB : undefined);
  for (const [a, b, y] of SLOTS) column(a, b, y);
  column(W.px0 - W.wall, W.px1 + W.wall, W.floor - 0.56);        // soil under the shelter
  for (let i = 0; i < 140; i++) {                                // grass tufts, on solid ground only
    const x = -26 + R() * 52;
    if (!SOLID.some(([a, b]) => x > a + 0.2 && x < b - 0.2)) continue;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.08 + R() * 0.07, 0.28 + R() * 0.34, 5),
      plain(new THREE.Color().setHSL(0.26 + R() * 0.05, 0.55, 0.22 + R() * 0.10)));
    t.position.set(x, 0.44, W.z0 + 0.3 + R() * (ZD - 0.6)); t.rotation.z = (R() - 0.5) * 0.55; t.castShadow = true; gEarth.add(t);
  }
  for (let i = 0; i < 34; i++) {
    const x = -25 + R() * 50; if (!SOLID.some(([a, b]) => x > a && x < b)) continue;
    sph(gEarth, 0.1 + R() * 0.22, x, 0.33, W.z0 + R() * ZD, plain(0x8f8a80, 0.92), 8).scale.y = 0.55;
  }

  for (let i = 0; i < 70; i++) {                     // stones half-buried in the cut face (solid ground only)
    const x = -26 + R() * 52, y = -0.3 - R() * 12.2, r = 0.05 + R() ** 2 * 0.16;   // most are pebbles, a few fist-sized
    if (!SOLID.some(([a2, b2]) => x > a2 + r && x < b2 - r)) continue;   // never float over a trench or the pit
    const st = sph(gEarth, r, x, y, W.z1 - r * 0.72, plain(new THREE.Color().setHSL(0.07 + R() * 0.04, 0.16, 0.17 + R() * 0.12), 0.98), 8);
    st.scale.set(1, 0.72 + R() * 0.35, 0.55); st.castShadow = false;
  }

  // ============ PIT: walls poured in three lifts ==========================
  const gPit = G('pit');
  const wallH = Math.abs(W.floor - W.slabBot);
  const concW = fit(M.conc, 13, wallH, 7.0, '#d9d6cf');          // one smooth pour, not a stack of blocks
  const concF = fit(M.conc, 13, ZD, 7.0, '#d2cfc8');
  // walls as single pours, overlapping the floor and each other so no seam can open
  bx(gPit, W.wall, wallH + 0.5, ZD, W.px0 - W.wall / 2, W.floor + wallH / 2 - 0.12, ZC, concW, 0.03);   // outer face against the soil
  {                                                                 // right wall, with a doorway cut through to the escape tunnel
    const dz0 = -2.85, dz1 = -1.65, dTop = W.floor + 2.05;          // the opening
    const yB = W.floor - 0.12, yT = W.floor + wallH + 0.38;
    const seg = (zA, zB) => bx(gPit, W.wall, wallH + 0.5, zB - zA, W.px1 + W.wall / 2, W.floor + wallH / 2 - 0.12, (zA + zB) / 2, concW, 0.03);
    seg(W.rz0, dz0); seg(dz1, W.z1 + 0.05);
    bx(gPit, W.wall, yT - dTop, dz1 - dz0, W.px1 + W.wall / 2, (yT + dTop) / 2, (dz0 + dz1) / 2, concW, 0.03);
    bx(gPit, W.wall + 0.16, 0.16, dz1 - dz0 + 0.3, W.px1 + W.wall / 2, dTop + 0.08, (dz0 + dz1) / 2, M.steelD, 0.03);  // lintel
  }
  bx(gPit, 11.3, wallH + 0.5, W.wall, 0, W.floor + wallH / 2 - 0.12, W.rz0 - W.wall / 2, concW, 0.03);
  bx(gPit, 11.3 + W.wall * 2, 0.7, ZD + 0.1, 0, W.floor - 0.3, ZC, concF, 0.03);            // floor slab, under the walls
  const gSump = G('sump');                                                      // winter water: a sloped floor, a sump and a pump
  {
    const cm = fit(M.conc, 2.2, 1.2, 4.0, '#cfccc4');
    bx(gSump, 1.5, 0.9, 1.5, 3.6, W.floor - 0.4, -1.5, cm, 0.03);
    const hole = cyl(gSump, 0.55, 0.55, 0.86, 3.6, W.floor - 0.4, -1.5, plain(0x23211c, 0.98), 20);
    cyl(gSump, 0.22, 0.22, 0.42, 3.6, W.floor - 0.1, -1.5, M.steel, 14);        // the pump
    cyl(gSump, 0.06, 0.06, 1.2, 3.6, W.floor + 0.6, -1.5, M.steelD, 10);        // riser
    const el = cyl(gSump, 0.06, 0.06, 1.1, 4.15, W.floor + 1.18, -1.5, M.steelD, 10); el.rotation.z = Math.PI / 2;
    const gr = cyl(gSump, 0.62, 0.62, 0.06, 3.6, W.floor + 0.03, -1.5, M.steelD, 20);
    for (let i = -3; i <= 3; i++) bx(gSump, 1.2, 0.05, 0.05, 3.6, W.floor + 0.06, -1.5 + i * 0.14, M.steelD, 0.012);
  }

  // ============ CEILING: two bays + exposed rebar at the cut ==============
  const gRoof = G('roof');
  const slabH = (W.slabTop + 0.06) - W.slabBot, slabY = ((W.slabTop + 0.06) + W.slabBot) / 2;   // top sits above the grass plane
  const roofM = fit(M.conc, 11.3, ZD, 7.0, '#d9d6cf');
  const HX = -2.8, HZ = -4.3, HS = 0.6;                                         // entry riser: centre and half-width of the opening
  const Z0S = W.z0 - 0.04, Z1S = W.z1 + 0.04;                                   // slab z extent
  bx(gRoof, (HX - HS) - (-5.95), slabH, Z1S - Z0S, ((-5.95) + HX - HS) / 2, slabY, (Z0S + Z1S) / 2, roofM, 0.04);
  bx(gRoof, 5.95 - (HX + HS), slabH, Z1S - Z0S, (5.95 + HX + HS) / 2, slabY, (Z0S + Z1S) / 2, roofM, 0.04);
  bx(gRoof, HS * 2, slabH, (HZ - HS) - Z0S, HX, slabY, (Z0S + HZ - HS) / 2, roofM, 0.04);
  bx(gRoof, HS * 2, slabH, Z1S - (HZ + HS), HX, slabY, (Z1S + HZ + HS) / 2, roofM, 0.04);
  {                                                                             // a barrel vault under the slab: the shape real shelters use
    const span = 11.3, rise = 1.9, thick = 0.34;
    const R0 = (span * span / 4 + rise * rise) / (2 * rise);                     // radius of a segmental arch
    const half = Math.asin(span / 2 / R0);
    const sp = new THREE.Shape();
    const cyY = W.slabBot + 0.05 - R0;                                                  // arc centre below the crown, so it bows upward
    for (let i = 0; i <= 28; i++) { const a2 = -half + (i / 28) * half * 2; const x = Math.sin(a2) * R0, y = cyY + Math.cos(a2) * R0; i ? sp.lineTo(x, y) : sp.moveTo(x, y); }
    for (let i = 28; i >= 0; i--) { const a2 = -half + (i / 28) * half * 2; const r2 = R0 + thick; sp.lineTo(Math.sin(a2) * r2, cyY + Math.cos(a2) * r2); }
    sp.closePath();
    // The barrel vault is gone: a real blast-shelter ceiling is a flat reinforced slab, and the
    // arch left a wedge-shaped void against the slab's underside that read as a bright gap.
    bx(gRoof, span, 0.16, ZD, 0, W.slabBot - 0.08, ZC, fit(M.concIn, span, ZD, 7.0, '#cfccc4'), 0.02);   // soffit
    for (let i = 0; i < 9; i++)                                                 // downstand ribs, cast with the slab
      bx(gRoof, 0.22, 0.26, ZD, -5.0 + i * 1.25, W.slabBot - 0.26, ZC, fit(M.concIn, 0.3, ZD, 7.0, '#cbc8c0'), 0.02);
  }
  for (let i = 0; i < 3; i++) {                                                  // a few bars showing at the cut edge only
    const r = cyl(gRoof, 0.035, 0.035, 0.8, W.px1 - 0.55 + i * 0.2, W.slabBot - 0.02, -0.22, M.rebar, 7);
    r.rotation.x = 1.2; r.rotation.z = 0.15 * i;
  }

  // ============ EARTH COVER over the roof =================================
  const gCap = G('soilcap');
  const berm = (hw, hh, mat, yOff) => {                     // a berm profile extruded along z
    const sp2 = new THREE.Shape(); sp2.moveTo(-hw, 0);
    for (let i = 0; i <= 40; i++) { const t = i / 40, x = -hw + t * hw * 2; sp2.lineTo(x, Math.cos(t * Math.PI - Math.PI / 2) * 0 + Math.sin(t * Math.PI) ** 1.4 * hh); }
    sp2.lineTo(hw, 0); sp2.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sp2, { depth: ZD, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 6 }), mat);
    m.rotation.y = 0; m.position.set(0, 0.25 + yOff, W.z0); m.castShadow = m.receiveShadow = true; gCap.add(m); return m;
  };
  berm(6.72, 1.36, fit(M.soil, 14, ZD, 4.2, '#efe4d6'), 0);       // earth core, strictly inside the grass skin
  const capG = berm(6.82, 1.46, fit(M.grass, 14, ZD - 0.05, 3.0), 0); capG.position.z += 0.03; capG.castShadow = false;  // skin: no coplanar faces
  for (let i = 0; i < 40; i++) {
    const x = (R() - 0.5) * 13, t = Math.abs(x) / 6.8;
    const s = sph(gCap, 0.09 + R() * 0.2, x, 0.3 + Math.sin((1 - t) * Math.PI / 2) ** 1.4 * 1.45, W.z0 + 0.3 + R() * (ZD - 0.6), plain(0x948e81, 0.95), 7);
    s.scale.y = 0.55;
  }

  // ============ ENTRY RISER + round blast hatch in the roof ==============
  const gEnt = G('entrance');
  const steelL = plain(0x9aa1a9, 0.38, 0.9), steelM = plain(0x767d86, 0.45, 0.85), steelD2 = plain(0x4d535a, 0.5, 0.8);
  const rubber = plain(0x1d1f22, 0.95, 0);
  const RT = 1.62, RB = W.slabBot - 0.12, rIn = 0.5, rOut = 0.95;   // collar top / bottom, clear opening, outer face
  {
    const h = RT - RB, cy = (RT + RB) / 2;
    const outM = fit(M.conc, 2.4, h, 2.2, '#d9d6cf');
    const inM = plain(0x343129, 0.96); inM.side = THREE.DoubleSide;
    const osk = new THREE.Mesh(new THREE.CylinderGeometry(rOut, rOut, h, 36, 1, true), outM);
    osk.position.set(HX, cy, HZ); osk.castShadow = osk.receiveShadow = true; gEnt.add(osk);
    const ih = h + 0.1;                                                          // stops at the slab: a tube hanging in the room reads as a floating box
    const isk = new THREE.Mesh(new THREE.CylinderGeometry(rIn, rIn, ih, 36, 1, true), inM);
    isk.position.set(HX, RT - ih / 2, HZ); gEnt.add(isk);
    const soff = new THREE.Mesh(new THREE.RingGeometry(rIn, rIn + 0.4, 36), fit(M.concIn, 2.4, 2.4, 2.2, '#cfccc4'));
    soff.rotation.x = Math.PI / 2; soff.position.set(HX, W.slabBot - 0.01, HZ); gEnt.add(soff);   // the opening, read from inside
    const ann = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 36), outM);      // the rim you stand on
    ann.rotation.x = -Math.PI / 2; ann.position.set(HX, RT, HZ); ann.receiveShadow = true; gEnt.add(ann);
    const seat = new THREE.Mesh(new THREE.RingGeometry(rIn, rIn + 0.2, 36), steelD2);   // steel seat set into the concrete
    seat.rotation.x = -Math.PI / 2; seat.position.set(HX, RT + 0.008, HZ); gEnt.add(seat);
    const gask = new THREE.Mesh(new THREE.RingGeometry(rIn + 0.03, rIn + 0.15, 32), rubber);
    gask.rotation.x = -Math.PI / 2; gask.position.set(HX, RT + 0.018, HZ); gEnt.add(gask);
    for (let i = 0; i < 16; i++) { const a2 = i / 16 * TAU; sph(gEnt, 0.04, HX + Math.cos(a2) * (rOut - 0.14), RT + 0.015, HZ + Math.sin(a2) * (rOut - 0.14), steelD2, 7); }
    const rim = tor(gEnt, rOut + 0.02, 0.1, HX, RT - 0.06, HZ, outM, 10, 36);    // rolled lip at the top (a solid cylinder here would cap the hole)
    rim.rotation.x = Math.PI / 2; rim.castShadow = rim.receiveShadow = true;
    const apron = cyl(gEnt, rOut + 0.12, rOut + 0.55, 0.3, HX, 0.9, HZ, fit(M.soil2, 2.4, 0.6, 2.4, '#e7dccd'), 28);
    apron.receiveShadow = true;                                                  // earth banked against the collar
  }
  // the hatch itself: a steel plug on a side hinge, opening upwards
  const gDoor = G('door');
  const hPiv = new THREE.Group(); hPiv.position.set(HX - (rIn + 0.2), RT + 0.07, HZ); gDoor.add(hPiv);
  const leaf = new THREE.Group(); leaf.position.x = rIn + 0.2; hPiv.add(leaf);
  cyl(leaf, rIn + 0.2, rIn + 0.2, 0.17, 0, 0.085, 0, steelL, 36);                 // 30 cm steel disc
  cyl(leaf, rIn - 0.03, rIn - 0.03, 0.12, 0, -0.04, 0, steelM, 32);               // the plug that drops into the ring
  for (let i = 0; i < 3; i++) { const rb = bx(leaf, 1.26, 0.075, 0.13, 0, 0.2, 0, steelM, 0.02); rb.rotation.y = i / 3 * TAU; }
  for (let i = 0; i < 20; i++) { const a2 = i / 20 * TAU; sph(leaf, 0.035, Math.cos(a2) * (rIn + 0.11), 0.17, Math.sin(a2) * (rIn + 0.11), steelD2, 7); }
  const wheelG = new THREE.Group(); wheelG.position.set(0, 0.33, 0); leaf.add(wheelG);
  tor(wheelG, 0.2, 0.045, 0, 0, 0, steelD2, 9, 24).rotation.x = -Math.PI / 2;     // locking wheel
  for (let i = 0; i < 4; i++) { const sp2 = cyl(wheelG, 0.028, 0.028, 0.4, 0, 0, 0, steelD2, 7); sp2.rotation.z = Math.PI / 2; sp2.rotation.y = i * Math.PI / 4; }
  cyl(leaf, 0.07, 0.07, 0.2, 0, 0.3, 0, steelM, 12);
  for (let i = 0; i < 3; i++) {                                                   // three bolts driving into the ring
    const a2 = i / 3 * TAU + 0.6, bo = cyl(leaf, 0.05, 0.05, 0.42, Math.cos(a2) * (rIn + 0.02), 0.03, Math.sin(a2) * (rIn + 0.02), steelD2, 9);
    bo.rotation.z = Math.PI / 2; bo.rotation.y = -a2;
  }
  bx(leaf, 0.26, 0.025, 0.18, 0.2, 0.18, 0.3, plain(0xd8bf3a, 0.7), 0.012);       // warning plate
  for (const dz of [-0.26, 0.26]) cyl(hPiv, 0.075, 0.075, 0.3, 0, 0, dz, steelD2, 12).rotation.x = Math.PI / 2;
  gDoor.userData.leaf = leaf; gDoor.userData.hinge = hPiv; gDoor.userData.wheel = wheelG;
  // ladder from the floor up into the riser
  const gLad = G('ladder');
  const lx = HX + rIn - 0.14, lh = RT - W.floor - 0.4;
  for (const dz of [-0.28, 0.28]) cyl(gLad, 0.042, 0.042, lh, lx, W.floor + 0.2 + lh / 2, HZ + dz, M.steelD, 10);
  for (let y = W.floor + 0.55; y < RT - 0.25; y += 0.33) { const rg = cyl(gLad, 0.032, 0.032, 0.58, lx, y, HZ, M.steelD, 8); rg.rotation.x = Math.PI / 2; }
  const shLight = new THREE.PointLight(0xffe7c4, 3.2, 7, 2);                        // daylight dropping down the shaft
  shLight.position.set(HX, RT - 1.9, HZ); gEnt.add(shLight);

  // ============ VENT: pipe, flanges, 90° bend, filter, blower, cowl =======
  const gVent = G('vent');
  {                                                                 // the pipe is cast into a concrete sleeve, not left as a hole in the soil
    const cm = fit(M.conc, 1.6, 7.4, 3.2, '#d6d3cc');
    const sleeve = cyl(gVent, 0.62, 0.62, 7.0, W.ventX, -3.4, -2.2, cm, 24);
    sleeve.castShadow = sleeve.receiveShadow = true;
    cyl(gVent, 0.95, 0.95, 0.4, W.ventX, 0.1, -2.2, cm, 24);        // collar at grade
    for (const y of [-0.6, -3.4, -6.2]) { const f = tor(gVent, 0.66, 0.08, W.ventX, y, -2.2, M.steelD, 8, 20); f.rotation.x = Math.PI / 2; }
  }
  cyl(gVent, 0.3, 0.3, 7.4, W.ventX, -3.3, -2.2, M.steelD, 20);
  for (const y of [-6.5, -4.5, -2.5, -0.6]) {
    tor(gVent, 0.33, 0.07, W.ventX, y, -2.2, M.steelD, 8, 18).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; sph(gVent, 0.042, W.ventX + Math.cos(a) * 0.37, y, -2.2 + Math.sin(a) * 0.37, M.steelD, 6); }
  }
  const bend = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.3, 14, 18, Math.PI / 2), M.steelD);
  bend.position.set(W.ventX - 0.78, 0.6, -2.2); bend.rotation.z = Math.PI / 2; bend.castShadow = true; gVent.add(bend);
  cyl(gVent, 0.3, 0.3, 2.2, W.ventX - 1.85, 1.38, -2.2, M.steelD, 20).rotation.z = Math.PI / 2;
  const cowl = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 18), M.steelD);
  cowl.position.set(W.ventX - 3.15, 1.38, -2.2); cowl.rotation.z = Math.PI / 2; cowl.castShadow = true; gVent.add(cowl);
  for (let i = 0; i < 4; i++) bx(gVent, 0.05, 0.4, 0.4, W.ventX - 3.0 + i * 0.07, 1.38, -2.2, M.dark, 0.012);
  bx(gVent, 1.5, 1.9, 1.3, W.ventX - 0.12, -5.6, -2.2, M.steel, 0.08);           // filter housing
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.78; sph(gVent, 0.065, W.ventX - 0.12 + Math.cos(a) * 0.63, -5.6 + Math.sin(a) * 0.82, -1.56, M.steelD, 7); }
  for (let i = 0; i < 7; i++) bx(gVent, 1.05, 0.07, 0.06, W.ventX - 0.12, -6.15 + i * 0.17, -1.6, M.dark, 0.014);
  cyl(gVent, 0.55, 0.55, 0.7, W.ventX - 1.35, -5.6, -2.2, M.steel, 18).rotation.z = Math.PI / 2;   // blower
  cyl(gVent, 0.22, 0.22, 0.5, W.ventX - 1.9, -5.6, -2.2, plain(0x25282c, 0.85), 14).rotation.z = Math.PI / 2;
  bx(gVent, 0.8, 0.32, 0.32, W.ventX - 2.3, -6.35, -2.2, M.dark, 0.04);
  cyl(gVent, 0.26, 0.26, 2.3, W.ventX - 2.5, -5.6, -2.2, M.steelD, 16).rotation.z = Math.PI / 2;

  // ============ EMERGENCY EXIT: lined shaft + ladder + hatch ==============
  const gExit = G('exit');
  const TZ0 = -2.95, TZ1 = -1.55, TFY = -7.2, TTOP = -5.0, TSOFF = -5.3, TX0 = 5.0, TX1 = 16.3;
  {                                                                 // a cast tunnel, shown in section like the room
    const len = TX1 - TX0, cxm = (TX0 + TX1) / 2;
    const tm = fit(M.conc, len, 2.4, 7.0, '#d6d3cc'), ti = fit(M.concIn, len, 2.4, 7.0, '#cfccc4');
    bx(gExit, len, 0.3, TZ1 - TZ0 + 0.6, cxm, TFY - 0.15, (TZ0 + TZ1) / 2, tm, 0.03);          // invert
    bx(gExit, len, TTOP - TSOFF, TZ1 - TZ0 + 0.6, cxm, (TTOP + TSOFF) / 2, (TZ0 + TZ1) / 2, tm, 0.03); // crown
    bx(gExit, len, TSOFF - TFY, 0.3, cxm, (TSOFF + TFY) / 2, TZ0 - 0.15, ti, 0.03);            // far wall
    for (let x = TX0 + 1.2; x < TX1 - 0.6; x += 2.1) {                                          // ring beams every two metres
      bx(gExit, 0.18, TSOFF - TFY, 0.1, x, (TSOFF + TFY) / 2, TZ0 + 0.02, ti, 0.02);
      bx(gExit, 0.18, 0.1, TZ1 - TZ0, x, TSOFF - 0.05, (TZ0 + TZ1) / 2, ti, 0.02);
      const lp = new THREE.PointLight(0xffd9a0, 2.2, 5.5, 2); lp.position.set(x + 0.4, TSOFF - 0.35, (TZ0 + TZ1) / 2); gExit.add(lp);
      sph(gExit, 0.09, x + 0.4, TSOFF - 0.3, (TZ0 + TZ1) / 2, plain(0xfff1cf, 0.4), 8).material.emissive = new THREE.Color(0xffe3b0);
    }
  }
  {                                                                 // the shaft at the far end, with its ladder and lid
    const shm = M.concIn.clone(); shm.side = THREE.BackSide;
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, Math.abs(TFY) + 0.9, 28, 1, true), shm);
    sh.position.set(TX1, (TFY + 0.3) / 2, (TZ0 + TZ1) / 2); sh.receiveShadow = true; gExit.add(sh);
    const ring = tor(gExit, 1.04, 0.2, TX1, 0.26, (TZ0 + TZ1) / 2, M.conc, 10, 26); ring.rotation.x = Math.PI / 2;
    for (const dz of [-0.38, 0.38]) cyl(gExit, 0.05, 0.05, Math.abs(TFY) + 0.4, TX1 - 0.72, (TFY + 0.3) / 2, (TZ0 + TZ1) / 2 + dz, M.steelD, 9);
    for (let i = 0; i < 16; i++) { const r = cyl(gExit, 0.045, 0.045, 0.76, TX1 - 0.72, TFY + 0.5 + i * 0.42, (TZ0 + TZ1) / 2, M.steelD, 7); r.rotation.x = Math.PI / 2; }
    const lidPiv = new THREE.Group(); lidPiv.position.set(TX1 - 1.0, 0.46, (TZ0 + TZ1) / 2); gExit.add(lidPiv);
    const lid = cyl(lidPiv, 1.0, 1.0, 0.16, 1.0, 0, 0, M.steelD, 28);
    for (let i = 0; i < 8; i++) { const a3 = i / 8 * TAU; sph(lidPiv, 0.05, 1.0 + Math.cos(a3) * 0.72, 0.1, Math.sin(a3) * 0.72, M.steel, 7); }
    gExit.userData.lid = lidPiv;
    for (let i = 0; i < 12; i++) { const a2 = i / 12 * TAU; sph(gExit, 0.055, TX1 + Math.cos(a2) * 0.82, 0.55, (TZ0 + TZ1) / 2 + Math.sin(a2) * 0.82, M.steelD, 7); }
  }

  // ============ INTERIOR =================================================
  const gIn = G('interior');
  const gCf = G('comfort');
  const fy = W.floor;
  const bunk = new THREE.Group(); bunk.position.set(1.9, 0, -3.9); gCf.add(bunk);
  for (const [x, z] of [[-1.6, -0.75], [-1.6, 0.75], [1.6, -0.75], [1.6, 0.75]]) cyl(bunk, 0.07, 0.07, 3.0, x, fy + 1.5, z, M.steelD, 9);
  for (const y of [fy + 0.56, fy + 2.0]) {
    bx(bunk, 3.4, 0.1, 1.7, 0, y, 0, M.steelD, 0.03);
    bx(bunk, 3.2, 0.26, 1.5, 0, y + 0.18, 0, plain(0x6d7a86, 0.95), 0.1);
    bx(bunk, 0.78, 0.2, 0.5, -1.1, y + 0.33, 0, plain(0xd9d3c5, 0.95), 0.08);
  }
  const sh = new THREE.Group(); sh.position.set(3.1, 0, -4.1); gCf.add(sh);
  for (const z of [-1.25, 1.25]) cyl(sh, 0.05, 0.05, 2.5, 0.55, fy + 2.0, z, M.steelD, 8);
  for (const y of [fy + 1.3, fy + 2.1, fy + 2.9]) {
    bx(sh, 1.3, 0.07, 2.6, 0, y, 0, M.wood, 0.02);
    for (let i = 0; i < 5; i++) {
      if (R() > 0.78) continue;
      const z = -1.0 + i * 0.5;
      if (R() > 0.45) {
        cyl(sh, 0.16, 0.16, 0.42, 0, y + 0.25, z, plain(new THREE.Color().setHSL(R(), 0.5, 0.45), 0.45, 0.55), 14);
        cyl(sh, 0.164, 0.164, 0.14, 0, y + 0.25, z, plain(0xf2efe6, 0.65), 14);
      } else bx(sh, 0.44, 0.38, 0.4, 0, y + 0.23, z, plain(new THREE.Color().setHSL(0.07 + R() * 0.1, 0.38, 0.5), 0.9), 0.03);
    }
  }
  bx(gCf, 1.0, 0.9, 1.0, 3.4, fy + 0.45, -1.5, M.woodDk, 0.04);
  bx(gCf, 1.0, 0.9, 1.0, 3.4, fy + 1.35, -1.55, M.woodDk, 0.04).rotation.y = 0.28;
  bx(gCf, 0.62, 0.84, 0.36, 2.2, fy + 0.42, -0.8, plain(0x4a6b3f, 0.78), 0.07);   // jerrycan
  bx(gCf, 0.3, 0.09, 0.09, 2.2, fy + 0.88, -0.8, plain(0x3b5633, 0.82), 0.03);
  cyl(gCf, 0.09, 0.09, 0.1, 2.05, fy + 0.9, -0.8, plain(0x2f4529, 0.82), 10);
  cyl(gCf, 0.3, 0.24, 0.42, -3.9, fy + 0.21, -0.9, plain(0x9aa2a8, 0.62, 0.3), 16);  // bucket
  tor(gCf, 0.29, 0.03, -3.9, fy + 0.4, -0.9, plain(0x80888e, 0.6, 0.4), 6, 16).rotation.x = Math.PI / 2;
  bx(gCf, 1.8, 0.09, 0.9, -0.4, fy + 1.05, -1.3, M.wood, 0.02);                   // table
  for (const [x, z] of [[-1.15, -1.65], [-1.15, -0.95], [0.35, -1.65], [0.35, -0.95]]) bx(gCf, 0.1, 1.0, 0.1, x, fy + 0.52, z, M.woodDk, 0.02);
  cyl(gIn, 0.06, 0.06, 10.4, 0, W.slabBot - 0.16, -3.2, M.steelD, 9).rotation.z = Math.PI / 2;  // conduit
  bx(gIn, 0.4, 0.4, 0.22, -3.2, W.slabBot - 0.16, -3.2, M.steelD, 0.04);
  cyl(gCf, 0.035, 0.035, 0.75, 0.3, W.slabBot - 0.52, -1.0, M.dark, 7);
  sph(gCf, 0.13, 0.3, W.slabBot - 0.99, -1.0, new THREE.MeshStandardMaterial({ color: 0xffd089, emissive: 0xffb340, emissiveIntensity: 3.2, roughness: 0.3 }), 14);
  const shade = cyl(gCf, 0.26, 0.1, 0.2, 0.3, W.slabBot - 0.82, -1.0, plain(0x3b4046, 0.8), 16); shade.castShadow = true;
  const lamp = new THREE.PointLight(0xffb866, 13, 13, 2);
  lamp.position.set(0.3, W.slabBot - 1.05, -0.9); lamp.castShadow = false;
  lamp.shadow.mapSize.set(512, 512); lamp.shadow.bias = -0.005; gCf.add(lamp);

  // ============ PERSON (articulated) =====================================
  const gPer = G('person');
  const skin = plain(0xe8b48c, 0.75), shirt = plain(0xd9641f, 0.85), pants = plain(0x37465c, 0.9);
  const per = new THREE.Group(); per.position.set(-0.5, fy, -2.3); per.rotation.y = -0.55; gPer.add(per);
  bx(per, 0.62, 0.9, 0.36, 0, 1.46, 0, shirt, 0.16);
  sph(per, 0.26, 0, 2.08, 0, skin, 16);
  bx(per, 0.3, 0.17, 0.34, 0, 2.2, 0, plain(0x2e3a2a, 0.9), 0.08);
  for (const s of [-1, 1]) {
    bx(per, 0.17, 0.78, 0.17, s * 0.39, 1.45, 0, shirt, 0.08).rotation.z = s * 0.14;
    sph(per, 0.1, s * 0.46, 1.04, 0.04, skin, 10);
    bx(per, 0.21, 0.95, 0.23, s * 0.17, 0.5, 0, pants, 0.07);
    bx(per, 0.24, 0.14, 0.42, s * 0.17, 0.07, 0.08, plain(0x2b2723, 0.9), 0.05);
  }

  // ============ LANDSCAPE: what makes it a place, not a diagram ===========
  const gSky = G('clouds');
  {
    const topM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6ea, emissiveIntensity: 0.55, roughness: 1, fog: false });
    const midM = new THREE.MeshStandardMaterial({ color: 0xeef1f5, emissive: 0xd9e3ee, emissiveIntensity: 0.4, roughness: 1, fog: false });
    const baseM = new THREE.MeshStandardMaterial({ color: 0xb9c4d2, emissive: 0x9fadc0, emissiveIntensity: 0.32, roughness: 1, fog: false });
    const layers = [[9, 70, 150, 1.0], [10, 58, 220, 0.8], [8, 48, 290, 0.6]];   // count, height, distance, scale: near / mid / far
    for (const [cnt, hgt, dist, ls] of layers) for (let i = 0; i < cnt; i++) {
      const c = new THREE.Group();
      c.position.set(-260 + Math.random() * 520, hgt + Math.random() * 26, -dist - Math.random() * 40);
      const sc = (6 + Math.random() * 7) * ls, wide = 3 + (Math.random() * 3 | 0);
      for (let k = 0; k < wide; k++) {                 // flat, darker base: the underside in shadow
        const b = sph(c, sc * (0.9 + Math.random() * 0.4), (k - wide / 2) * sc * 1.1, 0, Math.random() * sc * 0.4, baseM, 12);
        b.scale.y = 0.32; b.castShadow = b.receiveShadow = false;
      }
      for (let k = 0; k < wide + 1; k++) {             // the body
        const b = sph(c, sc * (0.75 + Math.random() * 0.45), (k - wide / 2) * sc * 0.95, sc * 0.35, Math.random() * sc * 0.4, midM, 12);
        b.scale.y = 0.7; b.castShadow = b.receiveShadow = false;
      }
      for (let k = 0; k < 2 + (Math.random() * 3 | 0); k++) {   // sunlit tops
        const b = sph(c, sc * (0.6 + Math.random() * 0.4), (Math.random() - 0.5) * sc * wide * 0.8, sc * (0.7 + Math.random() * 0.35), Math.random() * sc * 0.3, topM, 12);
        b.scale.y = 0.85; b.castShadow = b.receiveShadow = false;
      }
      c.userData.sp = (0.35 + Math.random() * 0.5) * ls; c.userData.x0 = c.position.x; gSky.add(c);
    }
  }
  const gLand = G('land');
  {
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(600, 420, 1, 1), plain(0x74a155, 1));   // a textured map at this size minifies to brown mush
    gr.rotation.x = -Math.PI / 2; gr.position.set(0, 0.3, W.z0 - 210); gr.receiveShadow = true; gLand.add(gr);
    for (const sx of [-1, 1]) {                                                  // grass on the block top, left and right of the pit
      const wgr = 290, cx = sx * (5.9 + wgr / 2);
      const gm = fit(M.grass, wgr, ZD, 3.0); gm.side = THREE.DoubleSide;   // seen from just below, a one-sided plane shows sky through it
      const sideL = new THREE.Mesh(new THREE.PlaneGeometry(wgr, ZD, 1, 1), gm);
      sideL.rotation.x = -Math.PI / 2; sideL.position.set(cx, 0.296, ZC); sideL.receiveShadow = true; gLand.add(sideL);
    }
  }
  {
    const hillMat = plain(0x6f9a52, 1), hillFar = plain(0x86a98c, 1);
    for (let i = 0; i < 7; i++) {                      // a low ridge: only the crowns clear the horizon
      const r = 18 + Math.random() * 14;
      const h = sph(gLand, r, -140 + i * 46 + Math.random() * 18, -r * 0.55, -150 - Math.random() * 40, i % 2 ? hillFar : hillMat, 14);
      h.scale.y = 0.5 + Math.random() * 0.2; h.castShadow = h.receiveShadow = false;
    }
    const kit = KIT(), TREES = ['tree_oak', 'tree_pine', 'tree_fat', 'tree_dark'];
    const trunk = plain(0x6b4b32, 1), leafA = plain(0x4f7a3a, 1), leafB = plain(0x3f6a33, 1);
    const tree = (x, z, s) => {                        // built in code: a cone on a stick reads as a placeholder
      const t = new THREE.Group();
      t.position.set(x, 0.3, z); t.scale.setScalar(s * 0.62); t.rotation.y = Math.random() * 6.28; gLand.add(t);
      const lean = (Math.random() - 0.5) * 0.12;
      const h1 = 2.1 + Math.random() * 0.8;
      const tr1 = cyl(t, 0.1, 0.19, h1 * 2, 0, h1, 0, trunk, 8); tr1.rotation.z = lean;
      const tr2 = cyl(t, 0.06, 0.11, 1.5, Math.sin(lean) * 2.2, h1 * 2 + 0.6, 0, trunk, 7); tr2.rotation.z = lean * 1.6;
      const bx0 = Math.sin(lean) * 2.6, by0 = h1 * 2 + 1.1;
      for (let b = 0; b < 4; b++) {                    // branches, so the canopy has something holding it up
        const a = b / 4 * TAU + Math.random(), len = 0.9 + Math.random() * 0.7;
        const br = cyl(t, 0.05, 0.09, len * 2, bx0 + Math.cos(a) * len * 0.7, by0 + len * 0.5, Math.sin(a) * len * 0.7, trunk, 6);
        br.rotation.z = -Math.cos(a) * 0.7; br.rotation.x = Math.sin(a) * 0.7;
      }
      const n = 7 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {                    // clustered canopy with real colour variation
        const a = i / n * TAU + Math.random() * 0.5, rr = (i === 0 ? 0 : 0.8 + Math.random() * 1.3);
        const rad = (i === 0 ? 1.5 : 0.7 + Math.random() * 0.7);
        const col = new THREE.Color().setHSL(0.27 + Math.random() * 0.06, 0.38 + Math.random() * 0.14, 0.17 + Math.random() * 0.09);
        const lf = sph(t, rad, bx0 + Math.cos(a) * rr, by0 + 0.7 + Math.random() * 1.1, Math.sin(a) * rr, plain(col, 0.95), 9);
        lf.scale.set(1, 0.82 + Math.random() * 0.3, 1); lf.castShadow = true;
      }
      return t;
    };
    for (const [x, z, s] of [[-25, -20, 1.5], [-21.5, -27, 1.2], [22, -24, 1.6], [27.5, -18, 1.1],
                             [-30, -33, 1.8], [15, -31, 1.3], [-6, -35, 1.4], [33, -30, 1.5],
                             [-40, -26, 1.6], [41, -34, 1.4], [8, -44, 1.5], [-15, -48, 1.7]]) tree(x, z, s);
    if (kit.fence) { for (let i = 0; i < 18; i++) { const x = -36 + i * 4.3; if (x > -20 && x < 14) continue; place(gLand, 'fence', x, 0.3, -16, 2.2, 0); } }
    else {
      const post = plain(0x7a5a3c, 1);
      for (let i = 0; i < 16; i++) {
        const x = -34 + i * 4.6; if (x > -20 && x < 14) continue;
        bx(gLand, 0.16, 1.5, 0.16, x, 0.75, -16, post, 0.03);
        bx(gLand, 4.6, 0.1, 0.07, x + 2.3, 1.15, -16, post, 0.02);
        bx(gLand, 4.6, 0.1, 0.07, x + 2.3, 0.65, -16, post, 0.02);
      }
    }
    for (let i = 0; i < 16; i++) {                      // bushes, rocks and flowers from the kit
      const x = -34 + Math.random() * 68, z = -30 + Math.random() * 20;
      const nm = ['bush', 'bush_large', 'rock_small', 'rock_large', 'bush', 'log'][Math.floor(Math.random() * 6)];
      if (kit[nm]) place(gLand, nm, x, 0.3, z, (nm.startsWith('rock') ? 0.9 : 1.5) + Math.random() * 0.5, Math.random() * 6.28);
    }
  }

  // ============ DIGGER: the machine that does the earthwork ==============
  const gDig = G('digger');
  { const d = place(gDig, 'digger', -7.2, 0.3, -2.6, 2.3, 2.5); if (d) gDig.userData.m = d; }


  // ============ EXCAVATOR built in code: every joint can move ===========
  const gEx = G('excavator');
  {
    const yel = plain(0xf0b21a, 0.55, 0.1), dk = plain(0x2c2f33, 0.85), gl = plain(0x1d2a36, 0.2, 0.3), st = plain(0x8a8f94, 0.5, 0.6);
    const ex = new THREE.Group(); ex.position.set(-8.0, 0.3, -3.2); gEx.add(ex);
    for (const z of [-0.95, 0.95]) {                                      // tracks with rollers
      bx(ex, 3.4, 0.62, 0.62, 0, 0.31, z, dk, 0.2);
      for (let i = 0; i < 5; i++) cyl(ex, 0.17, 0.17, 0.66, -1.3 + i * 0.65, 0.3, z, st, 12).rotation.x = Math.PI / 2;
    }
    bx(ex, 1.6, 0.25, 1.6, 0, 0.72, 0, dk, 0.05);                         // slewing ring
    const sw = new THREE.Group(); sw.position.y = 0.85; ex.add(sw);
    bx(sw, 2.9, 0.55, 2.1, -0.35, 0.3, 0, yel, 0.12);                     // upper body
    bx(sw, 0.8, 0.85, 2.0, -1.55, 0.55, 0, yel, 0.18);                    // counterweight
    bx(sw, 1.2, 1.35, 0.95, 0.35, 1.2, 0.55, yel, 0.1);                   // cab
    bx(sw, 0.06, 0.95, 0.8, 0.96, 1.3, 0.55, gl, 0.02);                   // windscreen
    bx(sw, 0.9, 0.85, 0.05, 0.35, 1.3, 1.03, gl, 0.02);                   // side window
    cyl(sw, 0.07, 0.07, 0.7, -1.0, 1.0, -0.6, dk, 8);                     // exhaust
    const boom = new THREE.Group(); boom.position.set(0.55, 0.65, -0.35); sw.add(boom);
    bx(boom, 3.5, 0.42, 0.42, 1.65, 0.0, 0, yel, 0.08);
    cyl(boom, 0.08, 0.08, 2.4, 1.4, 0.32, 0, st, 8).rotation.z = Math.PI / 2;      // hydraulic ram
    const stick = new THREE.Group(); stick.position.set(3.35, 0, 0); boom.add(stick);
    bx(stick, 2.5, 0.32, 0.34, 1.15, 0, 0, yel, 0.07);
    const bucket = new THREE.Group(); bucket.position.set(2.35, 0, 0); stick.add(bucket);
    bx(bucket, 0.75, 0.55, 0.95, 0.3, -0.2, 0, dk, 0.08);
    for (let i = 0; i < 4; i++) bx(bucket, 0.2, 0.08, 0.1, 0.72, -0.42, -0.36 + i * 0.24, st, 0.02);   // teeth
    const load = sph(bucket, 0.42, 0.3, 0.05, 0, plain(0x6b4a2c, 1), 10); load.scale.set(1, 0.6, 1.1);
    ex.userData = { sw, boom, stick, bucket, load };
    gEx.userData.ex = ex;
  }

  // ============ CONCRETE MIXER: on site for every pour ==================
  const gMx = G('mixer');
  {
    const mx = new THREE.Group(); mx.position.set(7.8, 0.3, -3.4); gMx.add(mx);
    const red = plain(0xd8432a, 0.5, 0.1), wh = plain(0xe9e6df, 0.55, 0.1), dk = plain(0x25282c, 0.85), gl = plain(0x1d2a36, 0.2, 0.3);
    bx(mx, 5.2, 0.35, 1.8, 0, 0.75, 0, dk, 0.05);                         // chassis
    for (const x of [-1.9, -0.9, 1.7]) for (const z of [-0.85, 0.85]) cyl(mx, 0.45, 0.45, 0.32, x, 0.45, z, dk, 16).rotation.x = Math.PI / 2;
    bx(mx, 1.4, 1.5, 1.9, 2.0, 1.65, 0, red, 0.15);                       // cab
    bx(mx, 0.06, 0.7, 1.6, 2.72, 1.95, 0, gl, 0.02);
    const drum = new THREE.Group(); drum.position.set(-0.6, 2.0, 0); drum.rotation.z = -0.22; mx.add(drum);
    const d1 = cyl(drum, 0.9, 0.55, 2.6, 0, 0, 0, wh, 24); d1.rotation.z = Math.PI / 2;
    for (let i = 0; i < 3; i++) { const r = cyl(drum, 0.92 - i * 0.12, 0.92 - i * 0.12, 0.12, -0.8 + i * 0.8, 0, 0, red, 24); r.rotation.z = Math.PI / 2; }
    const chute = bx(mx, 2.6, 0.12, 0.4, -3.1, 1.25, 0, plain(0x9a9ea3, 0.5, 0.5), 0.03); chute.rotation.z = 0.3;
    const pourM = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.6 });
    const pour = cyl(gMx, 0.16, 0.22, 1, 0, 0, 0, pourM, 10); pour.castShadow = false;
    gMx.userData = { drum, pour };
  }

  // ============ FAR STRIKE: a rocket lands far away, the shock front rolls in ====
  const gFar = G('farblast');
  {
    const FX = -19, FZ = -48;
    const fire = sph(gFar, 1, FX, 0.3, FZ, new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.95, fog: false }), 18);
    const dust = sph(gFar, 1, FX, 0.3, FZ, new THREE.MeshStandardMaterial({ color: 0x5e5246, transparent: true, opacity: 0.8, roughness: 1, depthWrite: false }), 16);
    const ringM = new THREE.MeshBasicMaterial({ color: 0xfff0d2, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const rings = [0, 1].map(() => { const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 8, 72), ringM.clone()); r.rotation.x = Math.PI / 2; r.position.set(FX, 0.6, FZ); gFar.add(r); return r; });
    const rk = new THREE.Group(); gFar.add(rk);                               // the rocket that falls
    const b = cyl(rk, 0.4, 0.4, 3.6, 0, 0, 0, M.steelD, 12);
    const n = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 12), M.steelD); n.position.y = -2.4; n.rotation.x = Math.PI; rk.add(n);
    const tr = new THREE.Mesh(new THREE.ConeGeometry(0.45, 5, 10), new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.85 })); tr.position.y = 4.3; rk.add(tr);
    gFar.userData = { fire, dust, rings, rk, FX, FZ };
  }

  // ============ BLAST through the side door: the front and the dust ======
  const gDB = G('doorblast');
  {
    const fm = new THREE.MeshBasicMaterial({ color: 0xfff2da, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const front = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI), fm); front.rotation.y = Math.PI / 2; gDB.add(front);
    const dm = plain(0xa89a82, 1);
    const puffs = [];
    for (let i = 0; i < 40; i++) { const m = sph(gDB, 0.08 + R() * 0.16, 0, 0, 0, dm, 6); m.userData = { a: (R() - 0.5) * 1.6, b: (R() - 0.5) * 1.2, sp: 3 + R() * 5 }; puffs.push(m); }
    gDB.userData = { front, puffs };
  }

  // ============ WORKER: the viewer, doing the work on the surface =========
  const gWork = G('worker');
  {
    const wk = new THREE.Group(); wk.position.set(-6.4, 0.3, -0.6); wk.rotation.y = -1.25; gWork.add(wk);
    const sh = plain(0xd9641f, 0.85), pa = plain(0x37465c, 0.9), sk = plain(0xe8b48c, 0.75);
    bx(wk, 0.62, 0.9, 0.36, 0, 1.46, 0, sh, 0.16);
    sph(wk, 0.26, 0, 2.08, 0, sk, 16);
    bx(wk, 0.3, 0.17, 0.34, 0, 2.2, 0, plain(0x2e3a2a, 0.9), 0.08);
    for (const s of [-1, 1]) {
      bx(wk, 0.21, 0.95, 0.23, s * 0.17, 0.5, 0, pa, 0.07);
      bx(wk, 0.24, 0.14, 0.42, s * 0.17, 0.07, 0.08, plain(0x2b2723, 0.9), 0.05);
    }
    const arms = new THREE.Group(); arms.position.set(0, 1.9, 0); wk.add(arms);   // both arms + shovel swing together
    for (const s of [-1, 1]) {
      const a = bx(arms, 0.17, 0.8, 0.17, s * 0.39, -0.42, 0.06, sh, 0.08); a.rotation.x = -0.5;
      sph(arms, 0.1, s * 0.42, -0.78, 0.36, sk, 10);
    }
    const shovel = new THREE.Group(); shovel.position.set(0, -0.72, 0.36); arms.add(shovel);
    cyl(shovel, 0.055, 0.055, 1.7, 0, -0.55, 0.42, plain(0x9a7245, 0.9), 8).rotation.x = -0.75;
    const blade = bx(shovel, 0.42, 0.52, 0.06, 0, -1.3, 1.08, plain(0x8e949c, 0.45, 0.8), 0.03);
    blade.rotation.x = -0.75;
    wk.userData = { arms, shovel };
    gWork.userData.wk = wk;
  }

  // ============ SURFACE: wooden hut, plank by plank =======================
  const gHut = G('hut');
  const HUT_TRIM = 1;
  const hut = new THREE.Group(); hut.position.set(-14.6, 0.3, -3.4); hut.rotation.y = 0.24; gHut.add(hut);
  for (let i = 0; i < 16; i++) {
    const y = 0.22 + i * 0.4;
    for (const [w, d, x, z] of [[4.2, 0.14, 0, -1.7], [4.2, 0.14, 0, 1.7], [0.14, 3.4, -2.1, 0], [0.14, 3.4, 2.1, 0]]) {
      if (z === 1.7 && i < 5) { bx(hut, 1.3, 0.38, d, -1.4, y, z, M.wood, 0.02); bx(hut, 1.3, 0.38, d, 1.4, y, z, M.wood, 0.02); continue; }
      bx(hut, w, 0.38, d, x, y, z, M.wood, 0.02);
    }
  }
  for (const [x, z] of [[-2.1, -1.7], [2.1, -1.7], [-2.1, 1.7], [2.1, 1.7]]) bx(hut, 0.22, 3.7, 0.22, x, 1.85, z, M.woodDk, 0.04);
  for (let i = 0; i < 10; i++) {
    const p = bx(hut, 4.8, 0.12, 0.5, 0, 4.42 - Math.abs(i - 4.5) * 0.26, -1.9 + i * 0.42, M.woodDk, 0.02);
    p.rotation.x = (i < 5 ? -1 : 1) * 0.44;
  }
  bx(hut, 1.24, 2.1, 0.12, 0, 1.25, 1.78, M.woodDk, 0.02);                      // door, with a frame so it reads
  for (const [w2, h2] of [[1.44, 0.14], [0.14, 2.3]]) bx(hut, w2, h2, 0.16, 0, 1.25 + (h2 < 1 ? 1.12 : 0), 1.8, M.wood, 0.02);
  bx(hut, 0.14, 2.3, 0.16, -0.68, 1.25, 1.8, M.wood, 0.02);
  bx(hut, 0.14, 2.3, 0.16, 0.68, 1.25, 1.8, M.wood, 0.02);
  sph(hut, 0.08, 0.42, 1.25, 1.88, plain(0x5a5048, 0.6, 0.5), 9);
  bx(hut, 0.95, 0.95, 0.08, 1.35, 2.3, 1.76, plain(0x8fb4c8, 0.2, 0.1), 0.02);   // a window on the side we see
  bx(hut, 1.04, 0.1, 0.14, 1.35, 2.3, 1.79, M.woodDk, 0.02);
  bx(hut, 0.1, 1.04, 0.14, 1.35, 2.3, 1.79, M.woodDk, 0.02);
  bx(hut, 0.9, 0.9, 0.08, -1.1, 2.2, -1.76, plain(0x8fb4c8, 0.2, 0.1), 0.02);
  bx(hut, 0.98, 0.1, 0.14, -1.1, 2.2, -1.79, M.woodDk, 0.02);
  bx(hut, 0.1, 0.98, 0.14, -1.1, 2.2, -1.79, M.woodDk, 0.02);

  // ============ SURFACE: house (collapses later) ==========================
  const gHouse = G('house');                                       // the same timber cabin as the opening, grown into a house
  const ho = new THREE.Group(); ho.position.set(-13.2, 0.3, -3.2); gHouse.add(ho);   // clear of the vent and of the hatch shots
  for (let i = 0; i < 9; i++) {                                    // stacked logs, like the hut
    const y = 0.3 + i * 0.46;
    bx(ho, 6.0, 0.44, 5.0, 0, y, 0, i % 2 ? M.wood : M.woodDk, 0.05);
  }
  bx(ho, 6.3, 0.26, 5.3, 0, 4.5, 0, M.woodDk, 0.05);
  for (let r2 = 0; r2 < 5; r2++) for (const sg of [-1, 1]) {       // shingled roof in the same timber
    const tl = bx(ho, 6.4 - r2 * 0.12, 0.16, 0.62, 0, 4.72 + r2 * 0.46, sg * (2.2 - r2 * 0.45), r2 % 2 ? M.wood : M.woodDk, 0.04);
    tl.rotation.x = sg * -0.74;
  }
  bx(ho, 0.8, 1.3, 0.8, 1.8, 6.4, -0.6, M.woodDk, 0.05);           // chimney
  bx(ho, 1.2, 2.3, 0.16, -1.6, 1.45, 2.56, M.woodDk, 0.03);        // door, clear of the windows
  for (const x of [1.5, 2.6]) {
    bx(ho, 1.0, 1.0, 0.1, x - 0.4, 2.9, 2.54, plain(0x7ea2b8, 0.16, 0.1), 0.02);
    bx(ho, 1.12, 0.1, 0.14, x - 0.4, 2.9, 2.57, M.woodDk, 0.03);
    bx(ho, 0.1, 1.12, 0.14, x - 0.4, 2.9, 2.57, M.woodDk, 0.03);
  }

  // ============ THE WRONG DOOR: an ordinary side door, shown so the blast can take it ==
  const gBad = G('baddoor');
  {
    const fx = W.px0 + 0.02, fz = -1.35, fyy = W.floor;
    bx(gBad, 0.12, 2.25, 0.16, fx + 0.04, fyy + 1.12, fz - 0.62, M.steelD, 0.02);   // frame
    bx(gBad, 0.12, 2.25, 0.16, fx + 0.04, fyy + 1.12, fz + 0.62, M.steelD, 0.02);
    bx(gBad, 0.12, 0.16, 1.4, fx + 0.04, fyy + 2.2, fz, M.steelD, 0.02);
    const leafG = new THREE.Group(); leafG.position.set(fx + 0.06, fyy, fz); gBad.add(leafG);
    bx(leafG, 0.07, 2.05, 1.08, 0, 1.03, 0, plain(0x8a6a48, 0.75), 0.02);           // a plain wooden door
    bx(leafG, 0.04, 0.5, 0.5, 0.05, 1.5, 0, plain(0x6f5338, 0.8), 0.01);
    sph(leafG, 0.05, 0.08, 1.0, 0.4, plain(0x6a6a6a, 0.4, 0.6), 8);
    gBad.userData.leaf = leafG;
    {
      const st = plain(0x8a8f94, 0.4, 0.7);
      for (const y of [0.35, 1.0, 1.7]) bx(leafG, 0.1, 0.16, 0.06, 0.04, y, -0.54, st, 0.01);   // hinges
      bx(leafG, 0.05, 0.3, 1.0, 0.04, 0.17, 0, st, 0.01);                                           // kick plate
      const lamp2 = new THREE.Group(); lamp2.position.set(W.px0 + 0.12, W.floor + 2.45, -1.35); gBad.add(lamp2);
      bx(lamp2, 0.14, 0.12, 0.34, 0, 0, 0, plain(0x2c2f33, 0.6), 0.02);
      bx(lamp2, 0.1, 0.06, 0.26, 0.04, -0.07, 0, new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), 0.02);
    }
  }
  const gPatch = G('patch');                                                       // the doorway cast shut afterwards
  bx(gPatch, W.wall * 0.9, 2.3, 1.42, W.px0 - W.wall / 2 + 0.02, W.floor + 1.12, -1.35, fit(M.concIn, 1.5, 2.3, 7.0, '#cfccc4'), 0.02);
  const gPlug = G('plug');                                                         // the tunnel doorway stays solid wall until the tunnel exists
  bx(gPlug, W.wall * 0.96, 2.1, 1.26, W.px1 + W.wall / 2, W.floor + 1.0, -2.25, fit(M.concIn, 1.3, 2.1, 7.0, '#cfccc4'), 0.02);

  // ============ BLAST WAVE over the sealed mound ==========================
  const gWave = G('wave');
  {
    const wm = new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 56), wm);
    ring.rotation.x = Math.PI / 2; ring.position.set(-2.0, 1.45, -2.6); ring.name = 'ring'; gWave.add(ring);
    const dm = plain(0x9c8f78, 0.98);
    for (let i = 0; i < 70; i++) {
      const a2 = R() * TAU, r2 = 1 + R() * 5;
      const d = sph(gWave, 0.07 + R() * 0.13, -2.0 + Math.cos(a2) * r2, 0.45 + R() * 0.5, -2.6 + Math.sin(a2) * r2 * 0.6, dm, 6);
      d.userData = { a: a2, r: r2, up: 0.4 + R() * 1.4 };
    }
  }

  // ============ WINTER: rain, water on the floor =========================
  const gRain = G('rain');
  for (let i = 0; i < 260; i++) {                                   // streaks of rain over the plot
    const d = bx(gRain, 0.035, 0.52, 0.035, -18 + R() * 36, 1 + R() * 14, -7 + R() * 8,
                 plain(0xbcd6ea, 0.25, 0.1), 0.01);
    d.userData = { sp: 7 + R() * 5, y0: 1 + R() * 14 };
  }
  const gWater = G('water');                                        // the pool that creeps across the floor
  {
    const wm = new THREE.MeshStandardMaterial({ color: 0x2c4a52, roughness: 0.1, metalness: 0.55, transparent: true, opacity: 0.6 });
    const pool = bx(gWater, 11.2, 0.06, ZD - 0.2, 0, W.floor + 0.05, ZC, wm, 0.0);
    pool.name = 'pool';
    for (let i = 0; i < 24; i++) {                                  // drips running down the wall
      const dr = bx(gWater, 0.03, 0.3, 0.03, -5.0 + R() * 10, W.floor + 1 + R() * 4, W.rz0 + 0.08, plain(0x9fc3d6, 0.2, 0.2), 0.01);
      dr.userData = { sp: 1.2 + R() * 1.6, y0: W.floor + 1 + R() * 4 };
    }
  }

  // ============ ANIMATED EXTRAS ==========================================
  // Earth still filling the pit, before it is dug out.
  const gFill = G('pitfill');
  for (const [x0, x1, slot, vT, vB, band] of [[W.px0 - W.wall, W.px1 + W.wall, 'pit'], [-7.18, -6.22, 'vent'], [5.62, 17.4, 'tun', -4.85, -7.6, 1]]) {
    const w = x1 - x0; gFill.userData.slot = gFill.userData.slot || 0;
    strata.forEach(([y0, y1], i) => {
      const parts = [];
      if (band) { const p0 = Math.min(y0, vT), p1 = Math.max(y1, vB); if (p0 > p1) parts.push([p0, p1]); }   // only the tunnel band
      else if (vT === undefined || y1 >= vT || y0 <= vB) parts.push([y0, y1]);
      else { if (y0 > vT) parts.push([y0, vT]); if (y1 < vB) parts.push([vB, y1]); }
      for (const [p0, p1] of parts) {
        const h = p0 - p1; if (h <= 0.02) continue;
        bx(gFill, w, h, ZD, (x0 + x1) / 2, p1 + h / 2, ZC, fit(i % 2 ? M.soil2 : M.soil, w, h, 4.2, strata[i][2]), 0.03).userData.slot = slot;
      }
    });
    if (!band) bx(gFill, w, 0.3, ZD, (x0 + x1) / 2, 0.15, ZC, fit(M.grass, w, ZD, 3.0), 0.04).userData.slot = slot;
  }

  // Incoming fire.
  const gMis = G('missiles');
  const flameM = new THREE.MeshBasicMaterial({ color: 0xffb04a });
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Group();
    const body = cyl(m, 0.16, 0.16, 1.5, 0, 0, 0, M.steelD, 10); body.rotation.z = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 10), M.steelD); nose.rotation.z = -Math.PI / 2; nose.position.x = 1.0; m.add(nose);
    const tr = new THREE.Mesh(new THREE.ConeGeometry(0.15, 2.6, 8), flameM); tr.rotation.z = Math.PI / 2; tr.position.x = -2.0; m.add(tr);
    m.userData = { i, sp: 0.8 + R() * 0.5, x: -34 + R() * 14, y: 26 + R() * 10, z: W.z0 + 0.5 + R() * (ZD - 1) };
    gMis.add(m);
  }

  // Flying planks (hut) and rubble (house).
  const gDeb = G('debris');
  for (let i = 0; i < 26; i++) {
    const m = bx(gDeb, 0.3 + R() * 1.3, 0.12 + R() * 0.12, 0.26 + R() * 0.3, 0, 0, 0, i % 3 ? M.wood : M.woodDk, 0.02);
    m.userData = { a: R() * TAU, up: 6 + R() * 9, sp: 3 + R() * 7, rx: (R() - 0.5) * 9, rz: (R() - 0.5) * 9, z: (R() - 0.5) * 3 };
  }
  const gRub = G('rubble');
  for (let i = 0; i < 22; i++) {
    const m = bx(gRub, 0.35 + R() * 1.3, 0.2 + R() * 0.3, 0.3 + R() * 0.5, 0, 0, 0, i % 2 ? M.wood : M.woodDk, 0.04);   // broken timber, not abstract panels
    m.userData = { a: R() * TAU, up: 2 + R() * 6, sp: 1.5 + R() * 5, rx: (R() - 0.5) * 6, rz: (R() - 0.5) * 6, z: (R() - 0.5) * 3 };
  }

  // A shell that drops into the still-open pit.
  const gRock = G('shell');
  const shell = cyl(gRock, 0.26, 0.26, 1.2, 0.5, 20, -2.5, M.steelD, 12);
  const shNose = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.6, 12), M.steelD); shNose.position.set(0.5, 19.3, -2.5); gRock.add(shNose); shNose.rotation.x = Math.PI;

  // Stale air, then filtered air.
  const gHaze = G('haze');
  const haze = new THREE.Mesh(new THREE.BoxGeometry(8.5, 5.8, 5.1),
    new THREE.MeshBasicMaterial({ color: 0xbfa36a, transparent: true, opacity: 0, depthWrite: false }));
  haze.position.set(0, (W.floor + W.slabBot) / 2, -2.75); gHaze.add(haze);

  // The straight pipe, before it is bent.
  const gVS = G('ventstraight');
  cyl(gVS, 0.3, 0.3, 2.6, W.ventX, 1.0, -2.2, M.steelD, 20);
  const cowl2 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 18), M.steelD); cowl2.position.set(W.ventX, 2.45, -2.2); gVS.add(cowl2);
  // Blast front racing down the pipe.
  const gPulse = G('pulse');
  const pulse = sph(gPulse, 0.33, W.ventX, 0, -2.2, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), 12);
  // Smoke drifting toward the intake.
  const gSmoke = G('smoke');
  for (let i = 0; i < 16; i++) {
    const m = sph(gSmoke, 0.25 + R() * 0.4, 0, 0, 0, new THREE.MeshBasicMaterial({ color: 0x6a6054, transparent: true, opacity: 0.5, depthWrite: false }), 8);
    m.userData = { a: R(), r: R(), s: 0.5 + R() };
  }

  // ---- composer ---------------------------------------------------------
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, cam));
  let gtao = null;
  try {
    gtao = new GTAOPass(scene, cam, RW, RH);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: Number(globalThis.RQ_AO || 8), screenSpaceRadius: false });
    composer.addPass(gtao);
  } catch (e) { console.log('GTAO disabled: ' + e.message); }
  composer.addPass(new OutputPass());
  if (SS > 0.85) try { composer.addPass(new SMAAPass(RW, RH)); } catch (e) { console.log('SMAA disabled: ' + e.message); }
  Math.random = _rnd;

  return { renderer, scene, composer, cam, P, M, sun, lamp, VW, VH, RW, RH, gtao, hemi, rim, fill, dome: scene.userData.dome };
}

// CC0 low-poly models (Net Forge asset library) — loaded before build() so build stays synchronous
export async function loadKit(base, names) {
  const L = new GLTFLoader(), kit = {};
  L.setMeshoptDecoder(MeshoptDecoder);   // the CC0 kit ships meshopt-compressed glb
  await Promise.all(names.map((n) => new Promise((res) => {
    L.load(`${base}${n}.glb`, (g) => {

      const o = g.scene;
      // The kit's own materials come through with a wrong colour profile (green trees render teal),
      // so every imported mesh is repainted from a palette keyed by model name and height.
      const PAL = {
        tree:   [[1.3, 0x6a4a2e], [99, 0x3c8a34]],      // trunk below 1.3, canopy above
        bush:   [[99, 0x44702f]],
        rock:   [[99, 0x8a8782]],
        log:    [[99, 0x6a4a2e]],
        fence:  [[99, 0x8a6a46]],
        flower: [[0.5, 0x3f7a35], [99, 0xb3352c]],
        digger: [[0.9, 0x3a3f45], [99, 0xe0a81d]],      // tracks dark, body yellow
        tractor:[[0.9, 0x3a3f45], [99, 0xd8341f]],
        truck:  [[0.9, 0x3a3f45], [99, 0x2f6fb5]],
        crate:  [[99, 0x9a7245]],
        barrel: [[99, 0x4f6b74]],
      };
      const key = Object.keys(PAL).find((k) => n.startsWith(k)) || 'rock';
      const box = new THREE.Box3().setFromObject(o), hgt = Math.max(0.001, box.max.y - box.min.y);
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.castShadow = m.receiveShadow = true;
        const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
        const rel = (c.y - box.min.y) / hgt * 2.2;                     // 0 at the base, ~2.2 at the top
        const band = PAL[key].find(([lim]) => rel <= lim) || PAL[key][PAL[key].length - 1];
        m.material = new THREE.MeshStandardMaterial({ color: band[1], roughness: 0.88, metalness: 0, flatShading: true });
      });
      kit[n] = o; res();
    }, undefined, () => res());
  })));
  return kit;
}
const KIT = () => (globalThis.KIT || {});
function place(parent, name, x, y, z, s = 1, ry = 0) {
  const src = KIT()[name]; if (!src) return null;
  const o = src.clone(true); o.position.set(x, y, z); o.scale.setScalar(s); o.rotation.y = ry; parent.add(o); return o;
}

export function makeCam(VW, VH) { return new THREE.PerspectiveCamera(36, VW / VH, 0.3, 420); }

export function shot(S, pos, tgt, fov) {
  S.cam.position.set(pos[0], pos[1], pos[2]);
  if (fov && fov !== S.cam.fov) { S.cam.fov = fov; S.cam.updateProjectionMatrix(); }
  S.cam.lookAt(tgt[0], tgt[1], tgt[2]);
  S.composer.render();
  return S.renderer.domElement;
}
window.S3D = { build, shot, makeCam, loadKit, W, THREE };
