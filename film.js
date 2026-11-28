// The film: a 3D cutaway rendered by s3d/, with Hebrew captions drawn over it.
// Every transform is a pure function of t, so parallel render workers agree.
(function () {
  const S = globalThis.SCORE, ev = S.ev, W = S.W, H = S.H;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = {
    outCubic: (x) => 1 - (1 - x) ** 3,
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
    outBack: (x, s = 1.7) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2,
    outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-9 * x) * Math.sin((x * 10 - 0.75) * 2.09) + 1),
  };
  const app = (t, t0, dur) => ease.outCubic(clamp((t - t0) / dur));
  const smooth = (x) => { const u = clamp((x - 0.18) / 0.64); return u * u * u * (u * (u * 6 - 15) + 10); };  // hold, ease, hold
  const TH = S3D.THREE, WD = S3D.W;

  // ---------- text -------------------------------------------------------
  const hText = (ctx, str, x, y, size, col, weight = 900) => {
    ctx.font = `${weight} ${size}px Rubik, RubikL, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr';
    ctx.fillStyle = col; ctx.fillText(str, x, y);
  };
  const tw = (ctx, str, size) => { ctx.font = `900 ${size}px Rubik, RubikL, sans-serif`; return ctx.measureText(str).width; };
  function wrap(ctx, text, size, maxW) {
    const words = text.split(' '), out = []; let line = '';
    for (const w of words) {
      const tryl = line ? line + ' ' + w : w;
      if (tw(ctx, tryl, size) > maxW && line) { out.push(line); line = w; } else line = tryl;
    }
    if (line) out.push(line); return out;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // Captions in the reference style: white, no box, a few words at a time, lower third.
  function chunks(text, n = 3) {
    const w = text.replace(/\s+/g, ' ').trim().split(' '), out = [];
    for (let i = 0; i < w.length; i += n) out.push(w.slice(i, i + n).join(' '));
    return out;
  }
  const CAPS = [];
  if (S.VO && S.VO.caps) S.VO.caps.forEach((c) => CAPS.push(c));
  if (!CAPS.length) for (const c of S.captions) {                        // v2: 2-3 words at a time, timed by their length in letters
    const parts = chunks(c.text, 3), wts = parts.map((p) => p.replace(/[^\u05d0-\u05eaA-Za-z0-9]/g, '').length + 2), tot = wts.reduce((x, y) => x + y, 0);
    let acc = 0;
    parts.forEach((p, i) => { const t0 = c.t + (c.end - c.t) * acc / tot; acc += wts[i]; CAPS.push({ t: t0, end: c.t + (c.end - c.t) * acc / tot, text: p }); });
  }
  const BUSY = [];                                     // screen rects taken by labels this frame
  const hit2 = (r, q) => r[0] < q[0] + q[2] && q[0] < r[0] + r[2] && r[1] < q[1] + q[3] && q[1] < r[1] + r[3];
  function caption(ctx, c, t) {
    if (t < c.t || t > c.end) return;
    const pop = clamp((t - c.t) / 0.09);
    const size = 72, lines = wrap(ctx, c.text, size, W - 200), lh = size * 1.18;
    const bh = lines.length * lh + 40;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    ctx.font = `800 ${size}px Rubik, RubikL, sans-serif`;
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 60;
    let cy = H * 0.70;                                   // lower third, above the platform buttons
    for (const y of [0.70, 0.17, 0.58, 0.40]) {          // move away from any label it would cover
      const r = [W / 2 - bw / 2, H * y - bh / 2, bw, bh];
      if (!BUSY.some((q) => hit2(r, q))) { cy = H * y; break; }
    }
    const top = cy - (lines.length - 1) * lh / 2;
    const sc = 0.9 + 0.1 * pop; ctx.translate(W / 2, cy); ctx.scale(sc, sc); ctx.translate(-W / 2, -cy);
    ctx.globalAlpha = pop; ctx.lineJoin = 'round';
    lines.forEach((l, i) => {
      const y = top + i * lh;
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 13; ctx.strokeText(l, W / 2, y);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#ffffff'; ctx.fillText(l, W / 2, y);
    });
    ctx.restore();
  }


  // ---------- camera: one continuous move, no cuts -----------------------
  const CAM = [
    [0.0,              [-7, 2.0, 15],    [-13, 11, -24],   50],  // sky, fire coming in
    [ev.hut,           [-9.2, 3.2, 15],  [-13.6, 2.4, -5], 42],  // the hut, the moment he says it
    [ev.shrapnel - 1.2,[-6, 4.0, 18],    [-15, 4.0, -22],  44],  // the hut and, far behind, the strike
    [ev.shrapnel,      [-8.6, 3.6, 13],  [-13.6, 2.6, -4], 44],  // it is not enough
    [ev.dig,           [-2.5, 8.5, 36],  [-3.5, -0.5, -3], 46],  // the machine at work, the pit, the sky turning
    [ev.ceiling,       [0, 9.0, 42],     [-1.5, -1.0, -3], 46],  // the slab poured
    [ev.hit,           [9, 2.2, 14],     [-1.0, -2.2, -3], 44],  // the hit
    [ev.soil,          [-0.5, 9.0, 43],  [-1.5, -0.5, -3], 46],  // earth dumped on, another day
    [ev.doorNeed,      [3.6, -4.2, 9.0], [-4.6, -6.0, -1.4], 46], // an ordinary side door
    [ev.blowDoor - 0.3,[0.4, -5.0, 4.6], [-4.8, -6.1, -1.4], 40], // pushing in as the pressure builds
    [ev.blowDoor + 1.6,[3.0, -4.4, 8.0], [-3.0, -6.0, -1.4], 46], // the empty doorway after
    [ev.riser,         [-5.8, 3.8, 6.8], [-2.8, 0.7, -2.4], 42], // the shaft rises through the earth
    [ev.door,          [-6.2, 4.2, 6.2], [-2.8, 1.3, -2.4], 42], // the hatch
    [ev.seat,          [-5.0, 3.4, 6.8], [-2.8, 1.4, -2.4], 44], // it seats like a plug
    [ev.ladder,        [2.6, -2.4, 7.6], [-2.5, -2.8, -2.4], 46], // the ladder inside
    [ev.lock,          [-3.6, 2.0, 1.2], [-2.8, 1.3, -2.45], 30],// the bolts, tight
    [ev.sealed,        [-5.0, 3.0, 6.2], [-2.8, 1.4, -2.4],  42], // the hatch drops shut
    [ev.sealed + 2.4,  [4, -1.6, 11],    [-0.6, -4.4, -2.5], 46], // shut in with his own breath
    [ev.pipe,          [-13.5, 1.0, 17], [-6.5, -2.0, -2.2], 46], // the pipe
    [ev.sleeve,        [-12.5, -1.2, 13],[-6.7, -2.6, -2.2], 44], // concrete poured round it
    [ev.blastIn,       [-12.0, 2.2, 15], [-6.6, -1.0, -2.2], 46], // it is still a hole
    [ev.filter,        [-6.4, -4.2, 10], [-6.5, -5.3, -2.2], 42], // the blast valve
    [ev.collapse,      [-6, 6.0, 26],    [-8, 1.6, -3.7], 52],  // the house comes down
    [ev.tunnel,        [1.5, 3.0, 17],   [13.0, -4.6, -2.2], 52], // the tunnel's whole run, shaft at its end
    [ev.exit2,         [20.5, -0.6, 18], [16.0, -3.2, -2.2], 44],// the shaft, far out
    [ev.comfort,       [6.5, -3.4, 12],  [0.4, -5.6, -2.6], 48], // light and a bed
    [ev.done,          [11, 3.2, 19],    [0.5, -3.0, -3],  42], // the whole thing
    [S.DURATION,       [-20, 10, 32],    [-2, -2, -6],     40]   // ends opposite where it began
  ];
  CAM.sort((a, b) => a[0] - b[0]);
  function camAt(t) {
    let i = 0; while (i < CAM.length - 2 && t >= CAM[i + 1][0]) i++;
    const [t0, p0, g0, f0] = CAM[i], [t1, p1, g1, f1] = CAM[i + 1];
    const k = smooth(clamp((t - t0) / Math.max(0.001, t1 - t0)));
    const lp = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const p = lp(p0, p1), g = lp(g0, g1);
    const u = clamp((t - t0) / Math.max(0.001, t1 - t0));          // 0..1 inside this shot
    const push = 1 - u * 0.06;                                      // a slow dolly in, always
    const dx = Math.sin(t * 0.21) * 0.35, dy = Math.cos(t * 0.17) * 0.22;
    return { p: [g[0] + (p[0] - g[0]) * push + dx, g[1] + (p[1] - g[1]) * push + dy, g[2] + (p[2] - g[2]) * push],
             g, f: f0 + (f1 - f0) * k };
  }

  // ---------- per-part animation ----------------------------------------
  const vis = (g, on) => { g.visible = !!on; };
  function riseIn(g, t, t0, dur, drop = 4) {         // slide up into place
    const a = app(t, t0, dur); g.visible = t >= t0 - 0.02;
    g.position.y = (1 - a) * -drop; return a;
  }
  let SC = null, snapshot = null;


  // ---------- TIME-LAPSE of the build: the machine works, the days roll by -----------
  const TL = { dig0: ev.dig, cyc: 0.45, n: 5 };
  TL.dig1 = TL.dig0 + TL.cyc * TL.n;                          // pit dug
  TL.lift0 = TL.dig1 + 0.15;                                  // walls poured in three lifts
  TL.lifts = [0, 0.7, 1.4].map((d) => TL.lift0 + d);
  TL.roof = [ev.ceiling + 0.2, ev.ceiling + 1.4];             // the slab poured in two passes
  TL.soil0 = ev.soil + 0.1;                                   // earth dumped on in five loads
  const WIN = [[ev.dig - 0.2, ev.hit - 0.35, 1], [ev.soil - 0.1, ev.doorNeed - 0.3, 1]];   // [from, to, days]
  const ss = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
  function dayProgress(t) {                                   // how many days have passed (0 outside the time-lapse)
    let d = 0;
    for (const [a, b, n] of WIN) if (t > a) d += n * ss(a, b, Math.min(t, b)) ;
    return d;
  }
  function skyClock(t) { let x = t; for (const [a, b] of WIN) x += 12 * clamp(Math.min(t, b) - a, 0, b - a); return x; }
  const scoopDone = (t) => { let k = 0; for (let i = 0; i < TL.n; i++) k += app(t, TL.dig0 + i * TL.cyc + 0.55, 0.2); return k / TL.n; };
  const lifts = (t) => TL.lifts.reduce((a, t0) => a + app(t, t0, 0.7), 0) / 3;
  const roofPour = (t) => TL.roof.reduce((a, t0) => a + app(t, t0, 0.8), 0) / 2;
  const soilDone = (t) => { let k = 0; for (let i = 0; i < 5; i++) k += app(t, TL.soil0 + i * TL.cyc + 0.6, 0.25); return k / 5; };

  const C3 = (h) => new TH.Color(h);
  const SUN0 = Math.atan2(31, 17), SUNC = C3(0xffd892), SUNSET = C3(0xff6a2a), DOME_N = C3(0x26345a), DOME_S = C3(0xffa476), WHITE = C3(0xffffff);
  const FOG0 = C3(0xcfe4f6), FOG_N = C3(0x2a3550), FOG_S = C3(0xe6a27c);
  let cloudMats = null, NIGHT = 0, WARM = 0;
  function dayCycle(t) {
    const th = SUN0 + dayProgress(t) * Math.PI * 2, e = Math.sin(th);
    const day = ss(-0.12, 0.35, e), warm = Math.max(0, 1 - Math.abs(e - 0.05) / 0.3) * (1 - ss(0.3, 0.5, e));
    SC.sun.position.set(Math.cos(th) * 35, Math.max(12, e * 35), 25);   // shadows never swing under the ground
    SC.sun.intensity = 5.2 * (0.55 + 0.45 * ss(-0.04, 0.3, e));      // the set stays lit; only the sky goes to night
    SC.sun.color.copy(SUNC).lerp(SUNSET, warm);
    SC.hemi.intensity = 0.4 + 0.12 * day; NIGHT = 1 - day; WARM = warm;
    const dc = SC.dome.material.color; dc.copy(DOME_N).lerp(WHITE, day).lerp(DOME_S, warm * 0.8);
    SC.scene.fog.color.copy(FOG_N).lerp(FOG0, 0.55 + 0.45 * day).lerp(FOG_S, warm * 0.5);
    if (!cloudMats) { cloudMats = new Set(); P0().clouds.traverse((m) => { if (m.material) cloudMats.add(m.material); }); cloudMats.forEach((m) => { m.userData.ei = m.emissiveIntensity; m.userData.ec = m.emissive.clone(); }); }
    cloudMats.forEach((m) => { m.emissiveIntensity = m.userData.ei * (0.35 + 0.65 * day); m.emissive.copy(m.userData.ec).lerp(SUNSET, warm * 0.7); });
  }
  const P0 = () => SC.P;

  // the excavator: dig in the pit, swing, dump behind; later the reverse to cover the roof
  const KEY = { dig: [-0.45, -1.25, -0.5], curl: [-0.35, -1.7, -1.7], lift: [0.3, -1.05, -1.5], dump: [0.25, -0.8, 0.5] };
  function kf(c, keys) {                                     // keys: [[c, [v...]], ...] eased between
    for (let i = 0; i < keys.length - 1; i++) {
      const [c0, a] = keys[i], [c1, b] = keys[i + 1];
      if (c <= c1) { const u = ss(c0, c1, c); return a.map((v, j) => v + (b[j] - v) * u); }
    }
    return keys[keys.length - 1][1];
  }
  function excavator(t) {
    const ex = SC.P.excavator.userData.ex, J = ex.userData;
    const digPhase = t >= TL.dig0 - 0.3 && t < TL.dig1 + 0.4, soilPhase = t >= TL.soil0 - 0.3 && t < TL.soil0 + 5 * TL.cyc + 0.4;
    let c = 0, t0 = digPhase ? TL.dig0 : TL.soil0;
    if (digPhase || soilPhase) c = clamp((t - t0) / TL.cyc, 0, TL.n) % 1;
    const sDig = soilPhase ? 1.5 : 0, sDump = soilPhase ? 0 : 1.5;   // where it loads, where it empties
    const k = kf(c, [[0, [sDig, ...KEY.dig]], [0.3, [sDig, ...KEY.curl]], [0.5, [sDump, ...KEY.lift]], [0.65, [sDump, ...KEY.dump]], [0.85, [sDump, ...KEY.lift]], [1, [sDig, ...KEY.dig]]]);
    const working = digPhase || soilPhase;
    J.sw.rotation.y = working ? k[0] : 0.4;
    J.boom.rotation.z = working ? k[1] : 0.35;
    J.stick.rotation.z = working ? k[2] : -1.3;
    J.bucket.rotation.z = working ? k[3] : -1.2;
    J.load.visible = working && c > 0.22 && c < 0.62;
    ex.position.y = 0.3 + (working ? Math.abs(Math.sin(c * Math.PI * 2)) * 0.03 : 0);   // it rocks as it works
    // v2: diesel puffs from the exhaust while working, beacon pulses
    J.puffs.forEach((p, i) => { const ph = ((t * 1.3 + i / 6) % 1); p.position.set(-1.0 - ph * 0.3, 1.4 + ph * 1.6, -0.6 + ph * 0.2); p.scale.setScalar(0.6 + ph * 2.2); p.material.opacity = working ? (1 - ph) * 0.35 : 0; });
    J.bea.material.emissiveIntensity = 1 + Math.max(0, Math.sin(t * 9)) * 2.5;
  }
  function buildWork(t) {
    const P = SC.P;
    vis(P.excavator, (t >= ev.dig - 1.6 && t < TL.dig1 + 1.4) || (t >= ev.soil - 1.0 && t < TL.soil0 + 5 * TL.cyc + 1.2));
    if (P.excavator.visible) {
      excavator(t);
      const ex = P.excavator.userData.ex;                     // drives in from the left, out again when done
      const tIn = t < ev.soil - 1.0 ? ev.dig - 1.6 : ev.soil - 1.0, tOut = t < ev.soil - 1.0 ? TL.dig1 + 0.4 : TL.soil0 + 5 * TL.cyc + 0.2;
      ex.position.x = -8.0 - 18 * (1 - app(t, tIn, 0.9)) - 18 * ss(tOut, tOut + 1.0, t);
    }
    const mxOn = (t >= TL.lift0 - 1.3 && t < TL.lifts[2] + 1.8) || (t >= TL.roof[0] - 1.1 && t < TL.roof[1] + 1.8);
    vis(P.mixer, mxOn);
    if (mxOn) {
      const mx = P.mixer.children[0], first = t < TL.roof[0] - 1.1;
      const tIn = first ? TL.lift0 - 1.3 : TL.roof[0] - 1.1, tOut = (first ? TL.lifts[2] : TL.roof[1]) + 0.9;
      mx.position.x = 7.8 + 20 * (1 - app(t, tIn, 0.9)) + 20 * ss(tOut, tOut + 0.9, t);   // backs in, pours, drives off
      const U = P.mixer.userData; U.drum.rotation.x = t * 4;
      const pours = TL.lifts.map((a) => [a, a + 0.75, -3.0]).concat(TL.roof.map((a) => [a, a + 0.85, 0.35]));
      const pr = pours.find(([a, b]) => t >= a && t < b);
      U.pour.visible = !!pr;
      if (pr) { const y0 = 1.1, y1 = pr[2]; U.pour.position.set(3.5, (y0 + y1) / 2, -3.4); U.pour.scale.set(1, y0 - y1, 1); }
      U.splash.forEach((s, i) => { s.visible = !!pr; if (pr) { const ph = (t * 2.2 + i / 10) % 1, an = i * 2.4; s.position.set(3.5 + Math.cos(an) * ph * 0.9, pr[2] + Math.sin(ph * Math.PI) * 0.5, -3.4 + Math.sin(an) * ph * 0.9); s.scale.setScalar(1 - ph * 0.6); } });
    }
  }
  // a rocket lands far off; its fireball and shock front roll in and flatten the hut
  function farStrike(t) {
    const P = SC.P, F = P.farblast.userData;
    const FI = ev.shrapnel - 0.75, D = Math.hypot(-14.6 - F.FX, -3.4 - F.FZ);
    const on = t >= FI - 1.4 && t < ev.dig;
    vis(P.farblast, on); if (!on) return;
    const fall = clamp((t - (FI - 1.4)) / 1.4);
    F.rk.visible = t < FI;
    F.rk.position.set(F.FX + 16 * (1 - fall), 0.3 + 46 * (1 - fall * fall), F.FZ);
    F.rk.rotation.z = -0.33;
    const e = t - FI;
    F.fire.visible = e > 0 && e < 0.9; if (F.fire.visible) { F.fire.scale.setScalar(1 + 11 * app(t, FI, 0.35)); F.fire.material.opacity = 0.95 * (1 - e / 0.9); }
    F.dust.visible = e > 0.05; if (F.dust.visible) { const a = app(t, FI, 2.4); F.dust.scale.set(5 + 14 * a, 4 + 15 * a, 5 + 14 * a); F.dust.material.opacity = 0.95 * (1 - clamp((e - 0.9) / 1.0)); F.dust.visible = e < 1.9; }
    F.rings.forEach((r, i) => {
      const e2 = e - i * 0.16; r.visible = e2 > 0 && e2 < 1.6;
      if (r.visible) { const rad = 2 + (D / 0.75) * e2; r.scale.set(rad, rad, 2 + rad * 0.06); r.material.opacity = 0.9 * (1 - e2 / 1.6); }
    });
  }
  // v2: one reusable explosion - rocket in, white core, fire, smoke column, sparks, shock ring
  function boom(g, pos, t0, t, k = 1, rocket = 0) {
    const e = t - t0, U = g.userData, onR = rocket > 0 && t > t0 - rocket && e < 0;
    const on = (e > 0 && e < 3.4) || onR; vis(g, on); if (!on) return;
    g.position.set(pos[0], pos[1], pos[2]);
    if (U.rk) { U.rk.visible = onR; if (onR) { const f = 1 - (t0 - t) / rocket; U.rk.position.set(14 * (1 - f), 24 * (1 - f * f), 0); U.rk.rotation.z = -0.53; U.rk.scale.setScalar(1.4); } }
    const live = e > 0;
    U.core.visible = live && e < 0.5; if (U.core.visible) { U.core.scale.setScalar(k * (0.6 + 6.5 * app(t, t0, 0.22))); U.core.material.opacity = 1 - e / 0.5; }
    U.fire.forEach((m) => { const d = m.userData; m.visible = live && e < 1.5; if (!m.visible) return;
      const a = app(t, t0, 0.5); m.position.set(Math.cos(d.a) * d.sp * a * k, d.b * 0.6 + d.up * a * k * 0.8, Math.sin(d.a) * d.sp * a * k * 0.6);
      m.scale.setScalar(k * (0.35 + 1.7 * a) * Math.max(0.001, 1 - e / 1.5)); m.material.opacity = 0.95 * (1 - e / 1.5); });
    U.smoke.forEach((m) => { const d = m.userData; m.visible = live && e > d.d * 0.3; if (!m.visible) return;
      const a = app(t, t0 + d.d, 3.0); m.position.set(Math.cos(d.a) * d.sp * a * k * 1.4, (0.4 + d.up * a * 1.5) * k, Math.sin(d.a) * d.sp * a * k * 0.8);
      m.scale.setScalar(k * (0.3 + 1.5 * a)); m.material.opacity = 0.8 * (1 - clamp((e - 1.2) / 2.1)); });
    U.sparks.forEach((m) => { const d = m.userData; m.visible = live && e < 1.6; if (!m.visible) return;
      const y = Math.max(0, d.up * e - 9.8 * e * e * 0.5) * k; m.position.set(Math.cos(d.a) * d.sp * e * k, y, Math.sin(d.a) * d.sp * e * k * 0.6); m.rotation.set(d.rx * e, d.a, 0); m.scale.setScalar(Math.max(0.001, 1 - e / 1.6)); });
    U.ring.visible = live && e < 1.3; if (U.ring.visible) { const r = k * (1 + 16 * e); U.ring.scale.set(r, r, 1 + r * 0.05); U.ring.material.opacity = 0.8 * (1 - e / 1.3); }
  }
  // the pressure front coming through the side doorway, and the dust it drives in
  function doorBlast(t) {
    const P = SC.P, U = P.doorblast.userData, e = t - (ev.blowDoor - 0.05);
    const on = e > 0 && e < 1.6; vis(P.doorblast, on); if (!on) return;
    const x = WD.px0 - 0.8 + e * 7, r = 1.1 + e * 1.6;
    U.front.position.set(x, WD.floor + 1.1, -1.35); U.front.scale.set(r * 0.35, r, r);
    U.front.material.opacity = 0.55 * (1 - e / 1.6);
    U.puffs.forEach((m) => {
      const d = m.userData;
      m.position.set(WD.px0 + d.sp * e, WD.floor + 1.0 + d.a * e * 1.2, -1.35 + d.b * e * 1.4);
      m.scale.setScalar(Math.max(0.001, 1 - e / 1.6));
    });
  }

  function animate(t) {
    const P = SC.P;
    const shake = (t >= ev.shrapnel ? 0.16 : 0) * Math.exp(-(t - ev.shrapnel) * 6.0)
      + (t >= ev.hit ? 0.18 : 0) * Math.exp(-(t - ev.hit) * 6.0)
      + (t >= ev.collapse ? 0.15 : 0) * Math.exp(-(t - ev.collapse) * 6.0);   // a punch, not a wobble

    // --- incoming fire -------------------------------------------------
    const misOn = t < ev.dig;
    vis(P.missiles, misOn);
    if (misOn) P.missiles.children.forEach((m, i) => {
      const d = m.userData, u = ((t * d.sp * 0.36) + i * 0.143) % 1;
      m.position.set(-34 + u * 44, 26 - u * 20 + (d.y - 26) * 0.3, d.z - 14);
      m.rotation.z = -0.36; m.scale.setScalar(1.3);
      if (u > 0.9) m.scale.setScalar(1.3 * Math.max(0.001, (1 - u) / 0.1));
    });

    boom(P.boomHut, [-14.6, 1.0, -3.4], ev.shrapnel, t, 1.05);
    boom(P.boomRoof, [-1.0, 0.5, -3.0], ev.hit, t, 0.85, 0);
    boom(P.boomHouse, [-2.8, 1.9, -4.3], ev.collapse, t, 0.95);
    // --- hut: stands, then is blown apart -------------------------------
    const hutGone = t >= ev.shrapnel;
    vis(P.hut, !hutGone);
    
    vis(P.debris, hutGone && t < ev.dig + 0.3);
    if (P.debris.visible) {
      const e = t - ev.shrapnel;
      P.debris.children.forEach((m) => {
        const d = m.userData, y = Math.max(0.3, 2.0 + d.up * e - 9.81 * e * e * 0.5);
        m.position.set(-14.6 + Math.cos(d.a) * d.sp * e, y, -3.4 + Math.sin(d.a) * d.sp * e * 0.5 + d.z);
        m.rotation.set(d.rx * e, d.a, d.rz * e);
      });
    }

    // --- the digger works the plot while the pit is dug --------------------
    vis(P.digger, false);                                  // replaced by the excavator built in code
    if (false) {
      const m = P.digger.userData.m, u = (t - (ev.dig - 1.2)) * 0.8;
      m.position.x = -9.5 + Math.sin(u * 0.6) * 0.5;
      m.rotation.y = 1.9 + Math.sin(u * 0.6) * 0.12;
    }

    // --- sky and the worker ---------------------------------------------
    const tau = skyClock(t);                                        // time runs fast in the time-lapse
    P.clouds.children.forEach((c) => { c.position.x = ((c.userData.x0 + tau * c.userData.sp * 0.6 + 400) % 800) - 400; });
    if (SC.birds) SC.birds.children.forEach((f) => {     // v2: flocks drift across the sky band, wings beating
      f.position.x = ((f.userData.x0 + tau * f.userData.sp + 500) % 1000) - 500;
      f.children.forEach((b, i) => { const w = Math.sin(tau * 7 + i) * 0.5; b.children[0].rotation.z = -0.25 + w; b.children[1].rotation.z = 0.25 - w; });
    });
    dayCycle(t);
    farStrike(t);
    buildWork(t);
    doorBlast(t);
    const digging = t >= ev.dig - 0.6 && t < ev.ceiling - 0.3;
    vis(P.worker, t >= ev.hut - 0.3 && t < ev.dig - 0.6);
    if (P.worker.visible) {
      const wk = P.worker.userData.wk, u = (t - (ev.dig - 0.6)) * 1.9;
      if (digging) {                                   // a real dig cycle: lift, drive in, toss
        const c = u % 1, lift = Math.sin(c * Math.PI);
        wk.userData.arms.rotation.x = -0.55 + lift * 1.15;
        wk.rotation.y = -0.9 + lift * 0.18;
        wk.position.y = 0.3 - lift * 0.06;
        wk.position.x = -3.2; wk.position.z = 1.6;
      } else {                                         // standing by the hut before the dig
        wk.userData.arms.rotation.x = -0.35 + Math.sin(t * 1.3) * 0.06;
        wk.rotation.y = -1.5; wk.position.set(-11.4, 0.3, 1.0);
      }
    }

    // --- dig: the earth in the pit goes away ----------------------------
    const AT = { pit: ev.dig, vent: ev.pipe - 0.5, tun: ev.tunnel - 0.6 };   // each hole opens only when it is made
    vis(P.pitfill, true);
    P.pitfill.children.forEach((m, i) => {
      let k;
      if (m.userData.slot === 'pit') {                            // dug from the top down, one bucket at a time
        const fr = clamp((0.4 - (m.userData.y0 + m.userData.h0 / 2)) / 7.8);   // depth of this layer's top, 0..1
        k = clamp((scoopDone(t) * 1.08 - fr) / 0.18);
      } else k = clamp((app(t, AT[m.userData.slot] || ev.dig, 1.5) - (i % 8) * 0.05) / 0.5);
      m.visible = k < 0.999;
      m.scale.y = Math.max(0.001, 1 - k); m.position.y = m.userData.y0 - (m.userData.h0 / 2) * k;
    });

    // --- walls, floor, roof ---------------------------------------------
    vis(P.pit, t >= TL.lift0);
    if (P.pit.visible) P.pit.position.y = -7 * (1 - lifts(t));
    vis(P.roof, t >= ev.ceiling);
    if (P.roof.visible) { P.roof.position.set(0, 0, 0); P.roof.scale.y = 0.12 + 0.88 * roofPour(t); }

    // a shell drops into the still-open pit
    const dropOn = t >= ev.drop - 0.1 && t < ev.ceiling;
    vis(P.shell, dropOn);
    if (dropOn) { const e = clamp((t - ev.drop) / 0.85); P.shell.position.y = 24 * (1 - e * e) - 22 * 0 - (e * e) * 2; P.shell.position.y = 22 - e * e * 29; }

    // --- earth cover -----------------------------------------------------
    vis(P.soilcap, t >= ev.soil);
    if (P.soilcap.visible) { P.soilcap.scale.set(1, Math.max(0.02, soilDone(t)), 1); }

    // --- entry riser, hatch, ladder -------------------------------------
    vis(P.entrance, t >= ev.riser - 0.3); if (P.entrance.visible) riseIn(P.entrance, t, ev.riser - 0.3, 1.2, 3);
    vis(P.ladder, t >= ev.ladder); if (P.ladder.visible) riseIn(P.ladder, t, ev.ladder, 0.8, 2);
    vis(P.door, t >= ev.door);
    if (P.door.visible) {                                   // lifted open, then dropped and locked
      const a = app(t, ev.door, 0.8), sh2 = clamp((t - ev.sealed) / 0.6);
      P.door.children[0].scale.setScalar(Math.max(0.3, a));
      P.door.userData.hinge.rotation.z = (1 - sh2) * 1.75 * a;          // swings up on its side hinge
      const wh = P.door.userData.wheel;
      if (wh) wh.rotation.y = clamp((t - ev.lock) / 1.6) * 6.6;         // the locking wheel actually turns
    }

    // --- interior and the person ----------------------------------------
    vis(P.interior, t >= ev.ceiling + 0.4); if (P.interior.visible) riseIn(P.interior, t, ev.ceiling + 0.4, 0.8, 2);
    vis(P.comfort, t >= ev.comfort); if (P.comfort.visible) riseIn(P.comfort, t, ev.comfort, 0.9, 2);
    vis(P.wave, false);
    vis(P.baddoor, t >= ev.doorNeed - 0.4 && t < ev.riser - 0.2);
    if (P.baddoor.visible) {
      const lf = P.baddoor.userData.leaf, tOpen = ev.blowDoor - 1.6;
      const rattle = clamp((t - (ev.doorNeed + 1.5)) / 3) * (t < tOpen ? 1 : 0) * Math.sin(t * 38) * 0.025;
      const crack = clamp((t - tOpen) / 0.5) * 0.28;
      const fly = clamp((t - ev.blowDoor) / 0.9), e2 = 1 - Math.pow(1 - fly, 2);
      lf.rotation.y = rattle + crack + e2 * 1.9;
      lf.rotation.z = e2 * 0.9;
      lf.position.set(WD.px0 + 0.06 + e2 * 3.6, WD.floor + e2 * (1.4 - fly * 1.2), -1.35 + e2 * 0.6);
    }
    vis(P.patch, t >= ev.riser - 0.2); if (P.patch.visible) riseIn(P.patch, t, ev.riser - 0.2, 0.7, 0.6);
    vis(P.plug, t < ev.tunnel - 0.6);
    vis(P.sump, t >= ev.sump); if (P.sump.visible) riseIn(P.sump, t, ev.sump, 0.8, 1.5);
    // --- winter: rain outside, water creeping over the floor, the pump taking it away
    const rainOn = t >= ev.rain - 0.6 && t < ev.pump + 3.0;
    vis(P.rain, rainOn);
    if (rainOn) {
      const f = clamp((t - (ev.rain - 0.6)) / 1.2) * clamp((ev.pump + 3.0 - t) / 1.5);
      P.rain.children.forEach((d) => {
        const u = d.userData, y = u.y0 - ((t * u.sp) % 16);
        d.position.y = y < 0.3 ? y + 16 : y; d.scale.y = f;
      });
    }
    vis(P.water, t >= ev.rain);
    if (P.water.visible) {
      const rise = clamp((t - ev.rain) / 7), drain = clamp((t - (ev.pump + 0.6)) / 3.2);
      const lvl = Math.max(0, rise * 0.3 - drain * 0.3);
      P.water.children.forEach((m) => {
        if (m.name === 'pool') { m.scale.y = Math.max(0.02, lvl / 0.06); m.position.y = WD.floor + 0.02 + lvl / 2; }
        else { const u = m.userData, y = u.y0 - ((t * u.sp) % 5.5); m.position.y = y; m.visible = drain < 0.5; }
      });
    }
    vis(P.person, t >= ev.ceiling + 0.5);
    if (P.person.visible) {
      const p = P.person.children[0];
      p.position.y = snapshot.personY + Math.abs(Math.sin(t * 1.1)) * 0.03;   // breathing
      p.rotation.y = -0.55 + Math.sin(t * 0.37) * 0.12;
      const bad0 = clamp((t - ev.co2) / 2.0) * (1 - clamp((t - ev.pipe - 0.6) / 1.4));   // stale air: he coughs and sways
      p.rotation.x = bad0 * (0.14 + Math.max(0, Math.sin(t * 7.5)) * 0.1);
      p.rotation.z = bad0 * Math.sin(t * 2.2) * 0.05;
      if (t >= ev.lock && t < ev.sealed + 1.4) p.rotation.y = -0.55 + Math.sin(clamp((t - ev.lock) / 1.0) * Math.PI) * 0.5;   // turns to watch the locking wheel
    }

    // --- stale air, then filtered ---------------------------------------
    const hz = SC.P.haze.children[0];
    const bad = clamp((t - ev.co2) / 2.0) * (1 - clamp((t - ev.pipe - 0.6) / 1.4));
    hz.material.opacity = bad * 0.5;
    hz.material.color.setHex(0xbfa36a);
    SC.lamp.intensity = 13 * (1 - bad * 0.45);

    // --- the vent --------------------------------------------------------
    vis(P.vent, t >= ev.pipe);
    if (P.vent.visible) riseIn(P.vent, t, ev.pipe, 1.0, 7);
    vis(P.ventstraight, t >= ev.pipe && t < ev.bend + 0.3);
    if (P.ventstraight.visible) { P.ventstraight.position.y = P.vent.position.y; const o = clamp(1 - (t - ev.bend) / 0.3); P.ventstraight.scale.set(1, Math.max(0.01, o), 1); }
    // the bend only exists after he bends it
    SC.bendParts.forEach((m) => { const a = app(t, ev.bend, 0.6); m.visible = t >= ev.bend; m.scale.setScalar(Math.max(0.3, a)); });
    // smoke drifting to the intake
    const smOn = t >= ev.smoke && t < ev.filter + 1.4;
    vis(P.smoke, smOn);
    if (smOn) P.smoke.children.forEach((m, i) => {
      const u = ((t - ev.smoke) * 0.33 + m.userData.a) % 1;
      m.position.set(WD.ventX - 7 + u * 7, 2.6 + Math.sin(u * 5 + i) * 0.7, -2.2 + (m.userData.r - 0.5) * 2.4);
      m.material.opacity = 0.45 * Math.sin(u * Math.PI) * (1 - clamp((t - ev.filter) / 1.2));
      m.scale.setScalar(m.userData.s * (0.6 + u));
    });
    // the blast front racing down a straight pipe
    const pu = (t - ev.blastIn) / 1.0;
    vis(P.pulse, pu >= 0 && pu <= 1 && t < ev.bend);
    if (P.pulse.visible) {
      const m = P.pulse.children[0];
      m.position.y = 2.2 - pu * 9.2; m.scale.setScalar(1 + pu * 0.7);
      m.material.color.setHex(0xffd9a0);
    }
    // filter + blower only after he installs them
    SC.filterParts.forEach((m) => { m.visible = t >= ev.filter; const a = app(t, ev.filter, 0.6); m.scale.setScalar(Math.max(0.3, a)); });

    // --- the house collapses ---------------------------------------------
    vis(P.house, t >= ev.soil - 0.4);
    if (P.house.visible) {
      P.house.scale.setScalar(app(t, ev.soil - 0.4, 0.7) || 0.01);
      if (t < ev.collapse) { P.house.children[0].scale.setScalar(1); P.house.children[0].children.forEach((m, i) => { const s0 = snapshot.house[i]; m.position.copy(s0.p); m.rotation.copy(s0.r); }); }
      else {
        const e = Math.min(t - ev.collapse, 2.4), sg = 1 - 0.38 * clamp(e) ** 1.6;
        P.house.children[0].scale.setScalar(sg);       // the cabin crumples smaller as it falls, so it lands on the hatch and not on the vent
        P.house.children[0].children.forEach((m, i) => {
          const s0 = snapshot.house[i], d = (i * 37 % 13) / 13;
          const f = clamp(e - d * 0.35) ** 1.6;
          m.position.set(s0.p.x + (10.4 / sg - 0) * f + (d - 0.5) * 0.5 * f, Math.max(1.3 * clamp(f) / sg, s0.p.y - s0.p.y * clamp(f * 0.9)), s0.p.z - 1.0 * f + (d - 0.5) * 1.4 * f);   // the cabin topples toward the hatch
          m.rotation.set(s0.r.x + (d - 0.5) * 2.6 * f, s0.r.y, s0.r.z + (d - 0.5) * 2.2 * f);
        });
      }
    }
    vis(P.rubble, t >= ev.collapse && t < ev.exit2 + 0.4);
    if (P.rubble.visible) {
      const e = t - ev.collapse;
      P.rubble.children.forEach((m) => {
        const d = m.userData, y = Math.max(1.75, 2.5 + d.up * e - 9.81 * e * e * 0.5);
        m.position.set(-2.8 + Math.cos(d.a) * Math.min(d.sp * e * 0.6, 1.5), y + Math.abs(d.z) * 0.22, -4.3 + Math.sin(d.a) * Math.min(d.sp * e * 0.3, 0.7) + d.z * 0.3);  // piles up on the round entrance hatch
        m.rotation.set(d.rx * Math.min(e, 1.6), d.a, d.rz * Math.min(e, 1.6));
      });
    }

    // --- escape shaft ------------------------------------------------------
    vis(P.exit, t >= ev.tunnel); if (P.exit.visible) {
      riseIn(P.exit, t, ev.tunnel, 1.2, 6);
      const ld = P.exit.userData.lid;                                 // the far lid lifts open, so the way out reads
      if (ld) ld.rotation.z = clamp((t - (ev.exit2 + 0.6)) / 1.4) * 1.5;
    }

    return shake;
  }


  // ---------- depth of field: blur everything off the focus plane ---------
  let BLUR = null;
  function dof(ctx, gaze) {
    const src = SC.renderer.domElement;
    if (!BLUR) { BLUR = document.createElement('canvas'); BLUR.width = W; BLUR.height = H; }
    const b = BLUR.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, W, H);
    b.filter = 'blur(11px)'; b.drawImage(src, 0, 0, W, H); b.filter = 'none';
    const [, sy] = project(gaze[0], gaze[1], gaze[2]);
    const f = Math.max(0.18, Math.min(0.9, sy / H));
    const m = b.createLinearGradient(0, 0, 0, H);
    m.addColorStop(0, 'rgba(0,0,0,0.95)');
    m.addColorStop(Math.max(0.001, f - 0.3), 'rgba(0,0,0,0)');
    m.addColorStop(Math.min(0.999, f + 0.24), 'rgba(0,0,0,0)');
    m.addColorStop(1, 'rgba(0,0,0,0.8)');
    b.globalCompositeOperation = 'destination-in'; b.fillStyle = m; b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'source-over';
    ctx.drawImage(BLUR, 0, 0);
  }

  // ---------- a white line diagram, the way the reference films explain ----
  function diagram(ctx, t) {
    const t0 = ev.seat + 0.1, dur = 3.2;
    if (t < t0 || t > t0 + dur) return;
    const a = clamp((t - t0) / 0.45) * clamp((t0 + dur - t) / 0.5);
    const cx = W * 0.5, cy = H * 0.24, R = W * 0.125, gr = clamp((t - t0) / 0.5);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, 0, W, H);          // settle the frame behind the drawing
    ctx.fillStyle = 'rgba(10,12,16,0.93)';
    ctx.fillRect(W * 0.06, cy - R * 2.1, W * 0.88, R * 3.9);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2 * gr); ctx.stroke();               // the plug
    ctx.beginPath();                                                              // the seat it drops into
    ctx.moveTo(cx - R * 2.1, cy + R * 0.55); ctx.lineTo(cx - R * 1.02, cy + R * 0.55);
    ctx.lineTo(cx - R * 1.02, cy - R * 0.5);
    ctx.moveTo(cx + R * 2.1, cy + R * 0.55); ctx.lineTo(cx + R * 1.02, cy + R * 0.55);
    ctx.lineTo(cx + R * 1.02, cy - R * 0.5);
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {                                               // pressure pushing it down
      const x = cx + i * R * 0.62, y0 = cy - R * 1.75, y1 = cy - R * 1.02 - gr * R * 0.1;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1);
      ctx.moveTo(x - 9, y1 - 13); ctx.lineTo(x, y1); ctx.lineTo(x + 9, y1 - 13); ctx.stroke();
    }
    ctx.font = `600 ${Math.round(W * 0.042)}px Rubik, RubikL, sans-serif`;
    ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
    ctx.fillText('The pressure pushes it into the frame', cx, cy + R * 1.5);
    ctx.restore();
  }


  // ---------- numbers that count up, with the riser under them ------------
  const COUNT = [
    [ev.dig + 1.1,     1.5, 7,  'm',    'pit depth',    [-1.2, -3.6, -0.6], 0, -250],
    [ev.ceiling + 0.8, 1.4, 70, 'cm',    'reinforced concrete',   [0, 0.12, -0.6],    0, -260],
    [ev.soil + 2.4,    1.2, 1,  'm',    'soil above roof', [0, 1.5, -1.6],     0,  210],
    [ev.door + 0.6,    1.0, 70, 'cm',    'hatch diameter',   [-2.8, 1.72, -4.3], 0, -250],
    [ev.lock + 1.0,    0.9, 3,  'bolts', 'locking',        [-2.8, 1.45, -4.3], 250, -150],
    [ev.tunnel + 1.0,  1.4, 10, 'm',    'tunnel length',  [10.6, -6.0, -2.2], 0, -230],
  ];
  function counters(ctx, t) {
    for (const [t0, dur, target, unit, cap, wp, dx, dy] of COUNT) {
      const life = t - t0; if (life < -0.25 || life > dur + 2.0) continue;
      const a = clamp((life + 0.25) / 0.3) * clamp((dur + 2.0 - life) / 0.45);
      const [sx, sy, front] = project(wp[0], wp[1], wp[2]); if (!front) continue;
      const u = clamp(life / dur), e = 1 - Math.pow(1 - u, 3);
      const val = Math.max(0, Math.round(target * e));
      const pop = 1 + 0.09 * clamp(1 - Math.abs(life - dur) / 0.22);
      const nsz = Math.round(W * 0.105), usz = Math.round(W * 0.042), csz = Math.round(W * 0.034);
      ctx.save(); ctx.globalAlpha = a;
      const numTxt = String(val);
      ctx.font = `800 ${nsz}px Rubik, RubikL, sans-serif`;
      const nw = tw(ctx, numTxt, nsz);
      ctx.font = `600 ${usz}px Rubik, RubikL, sans-serif`;
      const uw = tw(ctx, unit, usz);
      ctx.font = `500 ${csz}px Rubik, RubikL, sans-serif`;
      const cw = tw(ctx, cap, csz);
      const bw = Math.max(nw + uw + 44, cw + 44), bh = nsz * 1.08 + csz * 1.5 + 26;
      const mx = bw / 2 + 22, my = bh / 2 + 22;
      const lx = Math.max(mx, Math.min(W - mx, sx + dx));
      const ly = Math.max(H * 0.26, Math.min(H - my - 150, sy + dy));
      ctx.strokeStyle = '#ffd089'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lx, ly + bh / 2 * Math.sign(sy - ly || 1)); ctx.stroke();
      ctx.fillStyle = '#ffd089'; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 7); ctx.fill();
      if (a > 0.05) BUSY.push([Math.min(sx, lx - bw / 2) - 20, Math.min(sy, ly - bh / 2) - 20, Math.max(sx, lx + bw / 2) - Math.min(sx, lx - bw / 2) + 40, Math.max(sy, ly + bh / 2) - Math.min(sy, ly - bh / 2) + 40]);
      ctx.translate(lx, ly); ctx.scale(pop, pop); ctx.translate(-lx, -ly);
      ctx.fillStyle = 'rgba(14,16,20,0.9)'; rr(ctx, lx - bw / 2, ly - bh / 2, bw, bh, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(255,208,137,0.5)'; ctx.lineWidth = 2;
      rr(ctx, lx - bw / 2, ly - bh / 2, bw, bh, 18); ctx.stroke();
      ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr';
      const baseY = ly - bh / 2 + nsz * 0.98 + 10;
      ctx.textAlign = 'left';
      ctx.font = `800 ${nsz}px Rubik, RubikL, sans-serif`;
      ctx.fillStyle = '#ffffff'; ctx.fillText(numTxt, lx - bw / 2 + 22, baseY);
      ctx.font = `600 ${usz}px Rubik, RubikL, sans-serif`;
      ctx.fillStyle = '#ffd089'; ctx.fillText(unit, lx - bw / 2 + 22 + nw + 14, baseY);
      ctx.textAlign = 'center';
      ctx.font = `500 ${csz}px Rubik, RubikL, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fillText(cap, lx, baseY + csz * 1.35);
      ctx.restore();
    }
  }

  // ---------- the pressure arriving, drawn over the frame -----------------
  function blast(ctx, t) {
    blastAt(ctx, t, ev.shrapnel - 0.75, 0.25); blastAt(ctx, t, ev.blowDoor - 0.05, 1);
  }
  function blastAt(ctx, t, t0, fl) {
    const w = t - t0;
    if (w < 0 || w > 1.7) return;
    const u = clamp(w / 1.7), e = 1 - Math.pow(1 - u, 2.4);
    ctx.save();
    ctx.globalAlpha = (1 - u) * 0.5 * fl;                             // the flash
    ctx.fillStyle = '#fff3dc'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = (1 - u) * 0.9;                                  // the front, racing out
    ctx.strokeStyle = '#fff6e4'; ctx.lineWidth = 26 * (1 - u) + 3;
    ctx.beginPath(); ctx.arc(W * 0.5, H * 0.46, 60 + e * H * 0.95, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - u) * 0.45; ctx.lineWidth = 9 * (1 - u) + 2;
    ctx.beginPath(); ctx.arc(W * 0.5, H * 0.46, 20 + e * H * 1.25, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ---------- labels pinned to real 3-D points ---------------------------
  const V3 = new TH.Vector3();
  function project(x, y, z) {
    V3.set(x, y, z).project(SC.cam);
    return [(V3.x * 0.5 + 0.5) * W, (-V3.y * 0.5 + 0.5) * H, V3.z < 1];
  }
  const LABELS = [
    [TL.lifts[1], 2.2, 'concrete walls', [-5.3, -4.2, -0.2], 250, 150],
    [ev.riser + 1.2, 2.2, 'concrete pipe up to ground level', [-2.8, 0.6, -4.3], 250, -40],
    [ev.door + 1.4, 2.2, 'round steel hatch', [-2.8, 1.7, -4.3], 230, -200],
    [ev.seat + 0.9, 2.4, 'pressure seals it', [-2.8, 1.5, -4.3], -240, -200],
    [ev.sleeve + 0.7, 2.4, 'concrete poured around the pipe', [-6.7, -2.4, -2.2], 250, -120],
    [ev.filter + 1.0, 2.4, 'blast valve', [-6.1, -5.6, -1.6], -250, -170],
    [ev.exit2 + 1.0, 2.4, 'exit shaft', [16.3, -0.6, -2.2], -230, -170],
    [ev.sump + 1.0, 2.2, 'drain pit', [3.6, -7.0, -1.5], 240, -190],
    [ev.pump + 0.9, 2.0, 'pump', [3.6, -6.6, -1.5], -230, -150],
  ];
  function labels(ctx, t) {
    for (const [t0, dur, text, wp, dx, dy] of LABELS) {
      if (t < t0 || t > t0 + dur) continue;
      const a = clamp((t - t0) / 0.3) * clamp((t0 + dur - t) / 0.35);
      const [sx, sy, front] = project(wp[0], wp[1], wp[2]);
      if (!front) continue;
      const size = 40, bw = tw(ctx, text, size) + 34, bh = size * 1.35;
      const mx = bw / 2 + 24, my = bh / 2 + 24;                       // keep the tag fully on screen
      const lx = Math.max(mx, Math.min(W - mx, sx + dx));
      const ly = Math.max(H * 0.30, Math.min(H - my - 120, sy + dy));
      if (a > 0.05) BUSY.push([Math.min(sx, lx - bw / 2) - 20, Math.min(sy, ly - bh / 2) - 20, Math.max(sx, lx + bw / 2) - Math.min(sx, lx - bw / 2) + 40, Math.max(sy, ly + bh / 2) - Math.min(sy, ly - bh / 2) + 40]);
      ctx.save(); ctx.globalAlpha = a;
      ctx.strokeStyle = '#ffd089'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = '#ffd089'; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(16,18,22,0.86)'; rr(ctx, lx - bw / 2, ly - bh / 2, bw, bh, 14); ctx.fill();
      ctx.strokeStyle = '#ffd089'; ctx.lineWidth = 2.5; ctx.stroke();
      hText(ctx, text, lx, ly + size * 0.35, size, '#ffe7bd');
      ctx.restore();
    }
  }
  // the earth taking the blast: rings spreading out over the mound
  function archArcs(ctx, t) {
    const t0 = ev.soil + 1.0, e = t - t0; if (e < 0 || e > 2.2) return;
    const [cx, cy, front] = project(0, 1.5, -2.0); if (!front) return;
    const [ex] = project(6.6, 1.5, -2.0);
    const rad = Math.abs(ex - cx);
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const u = clamp((e - i * 0.34) / 1.5); if (u <= 0) continue;
      ctx.globalAlpha = (1 - u) * 0.85 * clamp((2.2 - e) / 0.5);
      ctx.strokeStyle = '#ffd089'; ctx.lineWidth = 7 * (1 - u) + 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rad * (0.25 + u * 0.95), rad * (0.25 + u * 0.95) * 0.42, 0, Math.PI, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
  // the air going bad: the frame itself gets heavy
  function staleAir(ctx, t) {
    const a = clamp((t - ev.co2) / 2.2) * (1 - clamp((t - ev.pipe - 0.6) / 1.4));
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha = a * 0.5;
    const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.12, W / 2, H * 0.55, H * 0.6);
    g.addColorStop(0, 'rgba(150,120,60,0)'); g.addColorStop(1, 'rgba(96,66,24,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a * 0.22 * (0.6 + 0.4 * Math.sin(t * 3.1));   // a slow pulse, like a headache
    ctx.fillStyle = '#7a5418'; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---------- the film ----------------------------------------------------
  Studio.film({
    async init() {
      const add = async (fam, src, range) => {
        const f = new FontFace(fam, `url(${src})`, { weight: '900', unicodeRange: range });
        document.fonts.add(f); await f.load();
      };
      await add('Rubik', 'fonts/rubik-he-900.woff2');
      await add('RubikL', 'fonts/rubik-la-900.woff2', 'U+0000-00FF');
      globalThis.KIT = await S3D.loadKit('models/', ['digger', 'tractor', 'tree_oak', 'tree_pine', 'tree_fat', 'tree_dark',
        'bush', 'bush_large', 'rock_large', 'rock_small', 'rock_tall', 'fence', 'log', 'flower_red', 'crate', 'barrel', 'truck']);
      const cam = S3D.makeCam(W, H);
      SC = S3D.build(W, H, cam);
      // remember where the pit fill and the house started
      SC.P.pitfill.children.forEach((m) => { m.userData.y0 = m.position.y; m.userData.h0 = m.geometry.parameters.height || 1; });
      snapshot = { house: SC.P.house.children[0].children.map((m) => ({ p: m.position.clone(), r: m.rotation.clone() })), personY: SC.P.person.children[0].position.y };
      // the parts that only appear when the script says so
      SC.bendParts = SC.P.vent.children.filter((m) => m.geometry && m.geometry.type === 'TorusGeometry' && m.geometry.parameters.arc < 6)
        .concat(SC.P.vent.children.filter((m) => Math.abs(m.position.x - (WD.ventX - 1.85)) < 0.01 || Math.abs(m.position.x - (WD.ventX - 3.15)) < 0.25));
      SC.filterParts = SC.P.vent.children.filter((m) => m.position.y < -5.0 && m.position.y > -6.6);
    },
    draw(ctx, t) {
      const sh = animate(t);
      const c = camAt(t);
      const jx = sh ? (Math.sin(t * 127.3) * sh) : 0, jy = sh ? (Math.sin(t * 91.7) * sh) : 0;
      S3D.shot(SC, [c.p[0] + jx, c.p[1] + jy, c.p[2]], c.g, c.f);
      ctx.filter = 'saturate(1.22) contrast(1.07)';                 // cinematic, not washed out
      ctx.drawImage(SC.renderer.domElement, 0, 0, W, H);
      ctx.filter = 'none';
      dof(ctx, c.g);
      if (false) {                                          // removed: night darkened the whole frame                    // night and golden hour over the whole frame
        ctx.save(); ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgba(${Math.round(255 - 130 * NIGHT)},${Math.round(255 - 115 * NIGHT - 35 * WARM)},${Math.round(255 - 60 * NIGHT - 80 * WARM)},1)`;
        ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      {                                                     // cinematic grade: warm top, cool floor, vignette
        ctx.save();
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(255,186,110,0.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(18,36,78,0.26)');
        ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        const v = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.20, W / 2, H * 0.5, H * 0.72);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.68, 'rgba(0,0,0,0.14)'); v.addColorStop(1, 'rgba(0,0,0,0.52)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      // a single-frame flash on the three structural hits
      for (const h of [ev.shrapnel, ev.hit, ev.collapse]) {
        const f = clamp(1 - (t - h) / 0.1) * (t >= h ? 1 : 0);
        if (f > 0) { ctx.save(); ctx.globalAlpha = f * 0.32; ctx.fillStyle = '#ffd9a0'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      }
      BUSY.length = 0;
      archArcs(ctx, t);
      staleAir(ctx, t);
      blast(ctx, t);
      counters(ctx, t);
      labels(ctx, t);
      /* captions are a separate SRT file now, not burned in */
    },
    post: { vignette: 0.38, grain: 0.03 },
  });
})();
