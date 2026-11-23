// Procedural PBR texture library — albedo + height->normal + roughness, drawn on canvas.
// No network, no files: everything is generated at build time.
import * as THREE from 'three';

const TAU = Math.PI * 2;
export function rng(seed) { let s = seed >>> 0; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---- value noise / fBm on a canvas (tileable) -------------------------------
function noiseGrid(n, R) { const g = new Float32Array(n * n); for (let i = 0; i < n * n; i++) g[i] = R(); return g; }
function sampleGrid(g, n, x, y) {
  const fx = x * n, fy = y * n, x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const i = (a, b) => g[((b % n + n) % n) * n + ((a % n + n) % n)];
  return (i(x0, y0) * (1 - sx) + i(x0 + 1, y0) * sx) * (1 - sy) + (i(x0, y0 + 1) * (1 - sx) + i(x0 + 1, y0 + 1) * sx) * sy;
}
export function fbm(seed, octaves = 5, base = 4) {
  const R = rng(seed), gs = [];
  for (let o = 0; o < octaves; o++) { const n = base << o; gs.push([noiseGrid(n, R), n]); }
  return (x, y) => { let v = 0, a = 0.5, s = 0; for (const [g, n] of gs) { v += a * sampleGrid(g, n, x, y); s += a; a *= 0.5; } return v / s; };
}

// ---- height -> normal (Sobel) ----------------------------------------------
export function heightToNormal(hc, strength = 2.2) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = cv(w, h), ctx = out.getContext('2d'), img = ctx.createImageData(w, h);
  const H = (x, y) => src[(((y % h + h) % h) * w + ((x % w + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return out;
}

function tx(canvas, rep, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Build a MeshStandardMaterial from albedo/height/roughness painters. */
export function pbr({ size = 512, rep = [1, 1], albedo, height, rough, normalScale = 1, ...rest }) {
  const ac = cv(size, size); albedo(ac.getContext('2d'), size);
  const m = new THREE.MeshStandardMaterial({ map: tx(ac, rep, true), ...rest });
  if (height) {
    const hc = cv(size, size); height(hc.getContext('2d'), size);
    const n = tx(heightToNormal(hc, 2.4), rep, false);
    m.normalMap = n; m.normalScale = new THREE.Vector2(normalScale, normalScale);
    m.aoMap = tx(hc, rep, false); m.aoMapIntensity = 0.55;
  }
  if (rough) { const rc = cv(size, size); rough(rc.getContext('2d'), size); m.roughnessMap = tx(rc, rep, false); }
  return m;
}

const sp = (c, n, R, S, rgba) => { for (let i = 0; i < n; i++) { c.fillStyle = rgba(R); c.beginPath(); c.arc(R() * S, R() * S, R() * R() * 3 + 0.4, 0, TAU); c.fill(); } };

// ===== CONCRETE ==============================================================
// "A concrete slab with no expansion cuts screams CGI" — so: aggregate, form-board
// lifts, tie-rod holes, stains and hairline cracks.
export function concrete({ tint = '#b4b0a6', rep = [1, 1], wet = 0 } = {}) {
  const N = fbm(7711, 6, 4), S2 = fbm(331, 4, 3);
  const paint = (c, S, mode) => {
    const R = rng(21);
    c.fillStyle = mode === 'h' ? '#8a8a8a' : (mode === 'r' ? '#c8c8c8' : tint); c.fillRect(0, 0, S, S);
    // cement mottling
    const img = c.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = N(x / S, y / S) - 0.5, n2 = S2(x / S * 3, y / S * 3) - 0.5, i = (y * S + x) * 4;
      const v = (n * 34 + n2 * 16) * (mode === 'h' ? 0.6 : 1);
      d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.92;
    }
    c.putImageData(img, 0, 0);
    // aggregate grit
    sp(c, S * 9, R, S, (R) => R() > 0.5 ? `rgba(90,88,84,${0.10 + R() * 0.3})` : `rgba(240,238,232,${0.07 + R() * 0.22})`);
    // form-board lift lines (pours are stacked, not continuous)
    for (let y = S / 4; y < S; y += S / 4) {
      c.strokeStyle = mode === 'h' ? 'rgba(0,0,0,0.75)' : 'rgba(70,68,62,0.33)'; c.lineWidth = mode === 'h' ? 3.5 : 2.2;
      c.beginPath(); for (let x = 0; x <= S; x += 8) c.lineTo(x, y + (N(x / S * 2, y / S) - 0.5) * 3); c.stroke();
      if (mode !== 'h') { c.strokeStyle = 'rgba(255,255,255,0.20)'; c.lineWidth = 1.4; c.beginPath(); for (let x = 0; x <= S; x += 8) c.lineTo(x, y + 2.6 + (N(x / S * 2, y / S) - 0.5) * 3); c.stroke(); }
    }
    // tie-rod holes
    for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
      const x = (gx + 0.5) * S / 4, y = (gy + 0.5) * S / 4 - S / 8;
      const g = c.createRadialGradient(x, y, 0, x, y, 7);
      g.addColorStop(0, mode === 'h' ? '#000' : 'rgba(60,58,54,0.85)'); g.addColorStop(1, mode === 'h' ? '#8a8a8a' : 'rgba(120,118,112,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 7, 0, TAU); c.fill();
    }
    // rust/damp streaks running down from the holes
    if (mode === 'a') for (let i = 0; i < 26; i++) {
      const x = R() * S, y = R() * S, len = 20 + R() * 120;
      const g = c.createLinearGradient(x, y, x, y + len);
      g.addColorStop(0, `rgba(${wet ? 70 : 118},${wet ? 66 : 112},${wet ? 58 : 104},${0.16 + R() * 0.12})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x, y, 2 + R() * 7, len);
    }
    // hairline cracks
    for (let i = 0; i < 5; i++) {
      let x = R() * S, y = R() * S, a = R() * TAU;
      c.strokeStyle = mode === 'h' ? 'rgba(0,0,0,0.9)' : 'rgba(78,76,70,0.5)'; c.lineWidth = mode === 'h' ? 2 : 1.1; c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 26; k++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 6; y += Math.sin(a) * 6; c.lineTo(x, y); }
      c.stroke();
    }
    if (mode === 'r') { c.globalAlpha = 0.5; sp(c, S * 5, R, S, (R) => `rgba(${R() > 0.5 ? 255 : 110},${R() > 0.5 ? 255 : 110},${R() > 0.5 ? 255 : 110},0.5)`); c.globalAlpha = 1; }
  };
  return pbr({ rep, roughness: wet ? 0.68 : 0.93, metalness: 0.0, normalScale: 1.15,
    albedo: (c, S) => paint(c, S, 'a'), height: (c, S) => paint(c, S, 'h'), rough: (c, S) => paint(c, S, 'r') });
}

// ===== SOIL (cut face: strata, grain, pebbles, roots) ========================
export function soilFace({ rep = [1, 1], seed = 5, size = 512 } = {}) {
  const N = fbm(900 + seed, 6, 4);
  const bands = [['#c39a68', 0.00], ['#b5885a', 0.22], ['#9d7049', 0.44], ['#8a5f3e', 0.68], ['#75502f', 1.0]];
  const paint = (c, S, mode) => {
    const R = rng(77 + seed);
    // One uniform earth surface: the horizontal layering comes from the separate
    // stratum slabs in the scene, never painted into a map that tiles.
    c.fillStyle = mode === 'a' ? bands[2][0] : (mode === 'h' ? '#7a7a7a' : '#d2d2d2'); c.fillRect(0, 0, S, S);
    for (let i = 0; i < 28; i++) {                        // soft blotches hide the tile seams
      const x = R() * S, y = R() * S, r = S * (0.04 + R() * 0.18), g = c.createRadialGradient(x, y, 0, x, y, r);
      const sh = R() > 0.5 ? '255,243,226' : '72,50,30';
      g.addColorStop(0, `rgba(${sh},${mode === 'a' ? 0.08 + R() * 0.12 : 0.05})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    // grain
    const img = c.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = (N(x / S * 4, y / S * 4) - 0.5) * 46 + (N(x / S * 11, y / S * 11) - 0.5) * 20, i = (y * S + x) * 4; d[i] += v; d[i + 1] += v * 0.85; d[i + 2] += v * 0.7; }
    c.putImageData(img, 0, 0);
    sp(c, S * 14, R, S, (R) => `rgba(${40 + R() * 60},${28 + R() * 44},${18 + R() * 30},${0.1 + R() * 0.35})`);
    // pebbles with a lit top edge
    for (let i = 0; i < S / 5; i++) {
      const x = R() * S, y = R() * S, r = 2 + R() * 7;
      c.fillStyle = mode === 'a' ? `rgba(${120 + R() * 60},${110 + R() * 50},${95 + R() * 45},0.95)` : (mode === 'h' ? '#e8e8e8' : '#9a9a9a');
      c.beginPath(); c.ellipse(x, y, r, r * (0.6 + R() * 0.4), R() * TAU, 0, TAU); c.fill();
      if (mode === 'a') { c.fillStyle = 'rgba(255,245,225,0.35)'; c.beginPath(); c.ellipse(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.3, 0, 0, TAU); c.fill(); }
    }
    // roots near the top
    if (mode !== 'r') for (let i = 0; i < 8; i++) {
      let x = R() * S, y = R() * S, a = R() * TAU;
      c.strokeStyle = mode === 'a' ? 'rgba(84,58,34,0.75)' : 'rgba(0,0,0,0.55)'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 16; k++) { a += (R() - 0.5) * 0.7; x += Math.cos(a) * 7; y += Math.sin(a) * 7; c.lineTo(x, y); } c.stroke();
    }
  };
  return pbr({ rep, size, roughness: 1.0, metalness: 0, normalScale: 1.5,
    albedo: (c, S) => paint(c, S, 'a'), height: (c, S) => paint(c, S, 'h'), rough: (c, S) => paint(c, S, 'r') });
}

// ===== GRASS / TOPSOIL top surface ==========================================
export function grass({ rep = [3, 3] } = {}) {
  const N = fbm(4242, 5, 4);
  const paint = (c, S, mode) => {
    const R = rng(13);
    c.fillStyle = mode === 'a' ? '#7f8a52' : (mode === 'h' ? '#808080' : '#c0c0c0'); c.fillRect(0, 0, S, S);
    const img = c.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = (N(x / S * 2.5, y / S * 2.5) - 0.5) * 96 + (N(x / S * 9 + 7, y / S * 9) - 0.5) * 34, i = (y * S + x) * 4; d[i] += v * 0.8; d[i + 1] += v; d[i + 2] += v * 0.5; }
    c.putImageData(img, 0, 0);
    for (let i = 0; i < S * 12; i++) {
      const x = R() * S, y = R() * S, l = 3 + R() * 7, a = -Math.PI / 2 + (R() - 0.5) * 1.3;
      c.strokeStyle = mode === 'a' ? `rgba(${80 + R() * 60},${92 + R() * 55},${48 + R() * 38},${0.3 + R() * 0.5})` : (mode === 'h' ? `rgba(255,255,255,${R() * 0.5})` : `rgba(90,90,90,0.4)`);
      c.lineWidth = 1 + R(); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    if (mode === 'a') sp(c, S * 2, R, S, (R) => `rgba(${130 + R() * 50},${110 + R() * 40},${80 + R() * 30},${R() * 0.5})`);
  };
  return pbr({ rep, roughness: 0.95, metalness: 0, normalScale: 0.9,
    albedo: (c, S) => paint(c, S, 'a'), height: (c, S) => paint(c, S, 'h'), rough: (c, S) => paint(c, S, 'r') });
}

// ===== WOOD planks (individual boards, grain, knots, nails) ==================
export function wood({ rep = [1, 1], tint = [150, 104, 60], boards = 5 } = {}) {
  const N = fbm(606, 5, 5);
  const paint = (c, S, mode) => {
    const R = rng(99), bh = S / boards;
    for (let b = 0; b < boards; b++) {
      const sh = 0.82 + R() * 0.36;
      c.fillStyle = mode === 'a' ? `rgb(${tint[0] * sh | 0},${tint[1] * sh | 0},${tint[2] * sh | 0})` : (mode === 'h' ? '#9a9a9a' : '#b4b4b4');
      c.fillRect(0, b * bh, S, bh - 1);
      // grain lines running along the board
      for (let i = 0; i < 26; i++) {
        const y0 = b * bh + R() * bh;
        c.strokeStyle = mode === 'a' ? `rgba(${60 + R() * 40},${38 + R() * 26},${18 + R() * 16},${0.12 + R() * 0.3})` : (mode === 'h' ? `rgba(0,0,0,${0.1 + R() * 0.25})` : `rgba(140,140,140,0.4)`);
        c.lineWidth = 0.7 + R() * 1.6; c.beginPath();
        for (let x = 0; x <= S; x += 7) c.lineTo(x, y0 + (N(x / S * 3, y0 / S * 9) - 0.5) * bh * 0.4); c.stroke();
      }
      // knots
      if (R() > 0.45) {
        const kx = R() * S, ky = b * bh + bh * (0.3 + R() * 0.4), kr = 4 + R() * 7;
        for (let k = 5; k >= 1; k--) {
          c.strokeStyle = mode === 'a' ? `rgba(${52 + k * 8},${32 + k * 6},${14 + k * 4},0.85)` : (mode === 'h' ? `rgba(${30 + k * 20},${30 + k * 20},${30 + k * 20},1)` : '#8a8a8a');
          c.lineWidth = 1.6; c.beginPath(); c.ellipse(kx, ky, kr * k / 5, kr * k / 5 * 0.62, 0.3, 0, TAU); c.stroke();
        }
      }
      // board gap (shadow line) + nails
      c.fillStyle = mode === 'h' ? '#1b1b1b' : (mode === 'a' ? 'rgba(42,28,16,0.9)' : '#e0e0e0');
      c.fillRect(0, b * bh + bh - 2.5, S, 2.5);
      for (const nx of [S * 0.12, S * 0.88]) {
        c.fillStyle = mode === 'a' ? '#5b5751' : (mode === 'h' ? '#d8d8d8' : '#5a5a5a');
        c.beginPath(); c.arc(nx, b * bh + bh * 0.5, 2.6, 0, TAU); c.fill();
        if (mode === 'a') { c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.arc(nx - 0.8, b * bh + bh * 0.5 - 0.8, 1.1, 0, TAU); c.fill(); }
      }
    }
  };
  return pbr({ rep, roughness: 0.88, metalness: 0, normalScale: 1.1,
    albedo: (c, S) => paint(c, S, 'a'), height: (c, S) => paint(c, S, 'h'), rough: (c, S) => paint(c, S, 'r') });
}

// ===== PAINTED METAL (steel door, filter housing): brushed + chips + rust ====
export function metal({ rep = [1, 1], base = '#4d6d82', rust = 0.5 } = {}) {
  const N = fbm(1515, 4, 6);
  const paint = (c, S, mode) => {
    const R = rng(55);
    c.fillStyle = mode === 'a' ? base : (mode === 'h' ? '#8c8c8c' : '#6e6e6e'); c.fillRect(0, 0, S, S);
    for (let i = 0; i < S * 6; i++) { // brushed streaks
      const y = R() * S; c.strokeStyle = `rgba(${R() > 0.5 ? 255 : 0},${R() > 0.5 ? 255 : 0},${R() > 0.5 ? 255 : 0},${0.02 + R() * 0.05})`;
      c.lineWidth = 0.6 + R(); c.beginPath(); c.moveTo(0, y); c.lineTo(S, y + (R() - 0.5) * 4); c.stroke();
    }
    for (let i = 0; i < 40 * rust; i++) { // paint chips exposing rust
      const x = R() * S, y = R() * S, r = 1.5 + R() * 6;
      c.fillStyle = mode === 'a' ? `rgba(${110 + R() * 50},${58 + R() * 30},${26 + R() * 18},${0.5 + R() * 0.45})` : (mode === 'h' ? `rgba(60,60,60,0.8)` : '#cfcfcf');
      c.beginPath(); c.ellipse(x, y, r, r * (0.5 + R() * 0.7), R() * TAU, 0, TAU); c.fill();
    }
    const img = c.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = (N(x / S * 2, y / S * 2) - 0.5) * 20, i = (y * S + x) * 4; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
    c.putImageData(img, 0, 0);
  };
  return pbr({ rep, roughness: 0.55, metalness: 0.75, normalScale: 0.8,
    albedo: (c, S) => paint(c, S, 'a'), height: (c, S) => paint(c, S, 'h'), rough: (c, S) => paint(c, S, 'r') });
}

// ===== SANDBAG / burlap =====================================================
export function burlap({ rep = [1, 1] } = {}) {
  const paint = (c, S, mode) => {
    const R = rng(808);
    c.fillStyle = mode === 'a' ? '#9c8a63' : (mode === 'h' ? '#808080' : '#d8d8d8'); c.fillRect(0, 0, S, S);
    const st = S / 46;
    for (let i = 0; i < 46; i++) for (let j = 0; j < 46; j++) {
      const o = (i + j) % 2;
      c.fillStyle = mode === 'a' ? `rgba(${o ? 60 : 255},${o ? 48 : 250},${o ? 30 : 235},${0.07 + R() * 0.07})` : (mode === 'h' ? `rgba(${o ? 40 : 220},${o ? 40 : 220},${o ? 40 : 220},0.6)` : `rgba(140,140,140,0.3)`);
      c.fillRect(i * st, j * st, st, st);
    }
  };
  return pbr({ rep, roughness: 0.97, metalness: 0, normalScale: 1.2,
    albedo: (c, S) => paint(c, S, 'a'), height: (c, S) => paint(c, S, 'h'), rough: (c, S) => paint(c, S, 'r') });
}

// ===== PLASTER (house walls) ================================================
export function plaster({ rep = [1, 1], tint = '#ded2b8' } = {}) {
  const N = fbm(313, 5, 4);
  const paint = (c, S, mode) => {
    const R = rng(404);
    c.fillStyle = mode === 'a' ? tint : (mode === 'h' ? '#8a8a8a' : '#c4c4c4'); c.fillRect(0, 0, S, S);
    const img = c.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = (N(x / S * 4, y / S * 4) - 0.5) * 26, i = (y * S + x) * 4; d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.9; }
    c.putImageData(img, 0, 0);
    sp(c, S * 4, R, S, (R) => `rgba(${R() > 0.5 ? 200 : 140},${R() > 0.5 ? 195 : 134},${R() > 0.5 ? 180 : 120},${R() * 0.25})`);
  };
  return pbr({ rep, roughness: 0.96, metalness: 0, normalScale: 0.75,
    albedo: (c, S) => paint(c, S, 'a'), height: (c, S) => paint(c, S, 'h'), rough: (c, S) => paint(c, S, 'r') });
}
