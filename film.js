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
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.direction = 'rtl';
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
  function chunks(text, n = 5) {
    const w = text.replace(/\s+/g, ' ').trim().split(' '), out = [];
    for (let i = 0; i < w.length; i += n) out.push(w.slice(i, i + n).join(' '));
    return out;
  }
  const CAPS = [];
  for (const c of S.captions) {
    const parts = chunks(c.text, 5), span = (c.end - c.t) / parts.length;
    parts.forEach((p, i) => CAPS.push({ t: c.t + i * span, end: c.t + (i + 1) * span, text: p }));
  }
  function caption(ctx, c, t) {
    if (t < c.t || t > c.end) return;
    const inA = clamp((t - c.t) / 0.16), out = clamp((c.end - t) / 0.10);
    const size = 46, lines = wrap(ctx, c.text, size, W - 260), lh = size * 1.3;
    const cy = H * 0.80 - (lines.length - 1) * lh * 0.5;
    ctx.save(); ctx.globalAlpha = Math.min(inA, out);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.direction = 'rtl';
    lines.forEach((l, i) => {
      const y = cy + i * lh;
      ctx.font = `600 ${size}px Rubik, RubikL, sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,12,16,0.5)'; ctx.lineJoin = 'round';
      ctx.strokeText(l, W / 2, y);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#ffffff'; ctx.fillText(l, W / 2, y);
    });
    ctx.restore();
  }

  // ---------- camera: one continuous move, no cuts -----------------------
  const CAM = [
    [0.0,              [-7, 2.0, 15],    [-13, 11, -24],   50],  // sky, fire coming in
    [ev.hut,           [-9.2, 3.2, 15],  [-13.6, 2.4, -5], 42],  // the hut, the moment he says it
    [ev.shrapnel,      [-8.6, 3.6, 13],  [-13.6, 2.6, -4], 44],  // it is not enough
    [ev.dig,           [12, 5.5, 19],    [0, -2.8, -3],    44],  // the dig starts on the word
    [ev.ceiling,       [12, 4.2, 18],    [0, -2.2, -3],    42],  // the slab
    [ev.hit,           [9, 2.2, 14],     [-1.0, -2.2, -3], 44],  // the hit
    [ev.soil,          [11, 3.6, 17],    [0, -2.2, -3],    41],  // earth going on
    [ev.doorNeed,      [-8.6, 1.2, 9.4], [-3.0, -1.4, -2.4], 42],// the way in
    [ev.riser,         [-7.0, 4.4, 7.6], [-2.8, 0.8, -2.4], 40], // the shaft rises
    [ev.door,          [-6.2, 4.2, 6.2], [-2.8, 1.3, -2.4], 42], // the hatch
    [ev.seat,          [-5.4, 3.9, 5.6], [-2.8, 1.5, -2.4],  40],// it seats like a plug
    [ev.ladder,        [0.6, -3.0, 6.2], [-2.5, -3.8, -2.4], 44],// the ladder
    [ev.lock,          [-3.6, 2.0, 1.2], [-2.8, 1.3, -2.45], 30],// the bolts, tight
    [ev.sealed,        [-5.0, 3.0, 6.2], [-2.8, 1.4, -2.4],  42], // the hatch drops shut
    [ev.sealed + 2.4,  [4, -1.6, 11],    [-0.6, -4.4, -2.5], 46], // shut in with his own breath
    [ev.pipe,          [-13.5, 1.0, 17], [-6.5, -2.0, -2.2], 46], // the pipe
    [ev.sleeve,        [-12.5, -1.2, 13],[-6.7, -2.6, -2.2], 44], // concrete poured round it
    [ev.blastIn,       [-12.0, 2.2, 15], [-6.6, -1.0, -2.2], 46], // it is still a hole
    [ev.filter,        [-11.5, -3.0, 12],[-6.4, -5.4, -2.2], 46], // the valve and the blower
    [ev.collapse,      [-3, 6.0, 19],    [-10.5, 1.6, -3], 46],  // the house comes down
    [ev.tunnel,        [10.5, -5.0, 10], [10.8, -6.2, -2.2], 44],// digging the tunnel
    [ev.exit2,         [19, 1.0, 15],    [15.8, -3.0, -2.2], 42],// the shaft, far out
    [ev.rain,          [10, 4.0, 19],    [0.4, 0.4, -3],   46], // winter: rain over the plot
    [ev.rain + 4.6,    [6, -2.4, 12],    [1.0, -6.0, -2.4], 46], // and water on the floor inside
    [ev.sump,          [5.6, -4.6, 7],   [3.6, -7.0, -1.5], 40], // the sump
    [ev.pump,          [5.0, -5.2, 5.4], [3.6, -6.8, -1.5], 36], // the pump
    [ev.comfort,       [6.5, -3.4, 12],  [0.4, -5.6, -2.6], 48], // light and a bed
    [ev.done,          [15, 5, 24],      [1, -3, -3],      40],  // the whole thing
    [S.DURATION,       [-20, 10, 32],    [-2, -2, -6],     40]   // ends opposite where it began
  ];
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

  function animate(t) {
    const P = SC.P;
    const shake = (t >= ev.shrapnel ? 0.42 : 0) * Math.exp(-(t - ev.shrapnel) * 3.2)
      + (t >= ev.hit ? 0.5 : 0) * Math.exp(-(t - ev.hit) * 3.0)
      + (t >= ev.collapse ? 0.4 : 0) * Math.exp(-(t - ev.collapse) * 3.2);

    // --- incoming fire -------------------------------------------------
    const misOn = t < ev.dig;
    vis(P.missiles, misOn);
    if (misOn) P.missiles.children.forEach((m, i) => {
      const d = m.userData, u = ((t * d.sp * 0.36) + i * 0.143) % 1;
      m.position.set(-34 + u * 44, 26 - u * 20 + (d.y - 26) * 0.3, d.z - 14);
      m.rotation.z = -0.36; m.scale.setScalar(0.55);
      if (u > 0.9) m.scale.setScalar(0.55 * Math.max(0.001, (1 - u) / 0.1));
    });

    // --- hut: stands, then is blown apart -------------------------------
    const hutGone = t >= ev.shrapnel;
    vis(P.hut, t >= ev.hut - 0.05 && !hutGone);
    if (!hutGone) riseIn(P.hut, t, ev.hut, 0.9, 5);
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
    vis(P.digger, t >= ev.dig - 1.2 && t < ev.soil + 2.5);
    if (P.digger.visible && P.digger.userData.m) {
      const m = P.digger.userData.m, u = (t - (ev.dig - 1.2)) * 0.8;
      m.position.x = -9.5 + Math.sin(u * 0.6) * 0.5;
      m.rotation.y = 1.9 + Math.sin(u * 0.6) * 0.12;
    }

    // --- sky and the worker ---------------------------------------------
    P.clouds.children.forEach((c, i) => { c.position.x = ((c.position.x + t * c.userData.sp * 0.6 + 400) % 800) - 400; });
    const digging = t >= ev.dig - 0.6 && t < ev.ceiling - 0.3;
    vis(P.worker, t >= ev.hut - 0.3 && t < ev.soil);
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
      const k = clamp((app(t, AT[m.userData.slot] || ev.dig, 1.5) - (i % 8) * 0.05) / 0.5);
      m.visible = k < 0.999;
      m.scale.y = Math.max(0.001, 1 - k); m.position.y = m.userData.y0 - (m.userData.h0 / 2) * k;
    });

    // --- walls, floor, roof ---------------------------------------------
    vis(P.pit, t >= ev.dig + 0.5);
    if (P.pit.visible) riseIn(P.pit, t, ev.dig + 0.5, 1.1, 7);
    vis(P.roof, t >= ev.ceiling);
    if (P.roof.visible) { const a = app(t, ev.ceiling, 0.9); P.roof.position.y = (1 - a) * 9; P.roof.position.x = (1 - a) * -3; }

    // a shell drops into the still-open pit
    const dropOn = t >= ev.drop - 0.1 && t < ev.ceiling;
    vis(P.shell, dropOn);
    if (dropOn) { const e = clamp((t - ev.drop) / 0.85); P.shell.position.y = 24 * (1 - e * e) - 22 * 0 - (e * e) * 2; P.shell.position.y = 22 - e * e * 29; }

    // --- earth cover -----------------------------------------------------
    vis(P.soilcap, t >= ev.soil);
    if (P.soilcap.visible) { const a = app(t, ev.soil, 1.3); P.soilcap.scale.set(1, Math.max(0.02, a), 1); }

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
      if (t < ev.collapse) { P.house.children[0].children.forEach((m, i) => { const s0 = snapshot.house[i]; m.position.copy(s0.p); m.rotation.copy(s0.r); }); }
      else {
        const e = Math.min(t - ev.collapse, 2.4);
        P.house.children[0].children.forEach((m, i) => {
          const s0 = snapshot.house[i], d = (i * 37 % 13) / 13;
          const f = clamp(e - d * 0.35) ** 1.6;
          m.position.set(s0.p.x + (d - 0.5) * 3.4 * f, Math.max(0.3, s0.p.y - s0.p.y * clamp(f * 0.9)), s0.p.z + (d - 0.5) * 1.6 * f);
          m.rotation.set(s0.r.x + (d - 0.5) * 2.6 * f, s0.r.y, s0.r.z + (d - 0.5) * 2.2 * f);
        });
      }
    }
    vis(P.rubble, t >= ev.collapse && t < ev.exit2 + 0.4);
    if (P.rubble.visible) {
      const e = t - ev.collapse;
      P.rubble.children.forEach((m) => {
        const d = m.userData, y = Math.max(0.35, 2.5 + d.up * e - 9.81 * e * e * 0.5);
        m.position.set(-11.0 + Math.cos(d.a) * d.sp * e * 0.6, y, -3.2 + Math.sin(d.a) * d.sp * e * 0.3 + d.z);  // lands on the shaft
        m.rotation.set(d.rx * Math.min(e, 1.6), d.a, d.rz * Math.min(e, 1.6));
      });
    }

    // --- escape shaft ------------------------------------------------------
    vis(P.exit, t >= ev.tunnel); if (P.exit.visible) riseIn(P.exit, t, ev.tunnel, 1.2, 6);

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
    ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
    ctx.fillText('הלחץ דוחף אותו אל המסגרת', cx, cy + R * 1.5);
    ctx.restore();
  }


  // ---------- numbers that count up, with the riser under them ------------
  const COUNT = [
    [ev.dig + 1.1,     1.5, 7,  'מטר',    'עומק הבור',    [-1.2, -3.6, -0.6], 0, -250],
    [ev.ceiling + 0.8, 1.4, 30, 'ס"מ',    'בטון מזוין',   [0, 0.12, -0.6],    0, -260],
    [ev.soil + 1.0,    1.2, 1,  'מטר',    'אדמה מעל הגג', [0, 1.5, -1.6],     0,  210],
    [ev.door + 1.5,    1.4, 70, 'ס"מ',    'קוטר המכסה',   [-2.8, 1.72, -4.3], 0, -250],
    [ev.lock + 0.4,    0.9, 3,  'בריחים', 'נעילה',        [-2.8, 1.45, -4.3], 250, -150],
    [ev.tunnel + 1.0,  1.4, 10, 'מטר',    'אורך המנהרה',  [10.6, -6.0, -2.2], 0, -230],
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
      ctx.translate(lx, ly); ctx.scale(pop, pop); ctx.translate(-lx, -ly);
      ctx.fillStyle = 'rgba(14,16,20,0.9)'; rr(ctx, lx - bw / 2, ly - bh / 2, bw, bh, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(255,208,137,0.5)'; ctx.lineWidth = 2;
      rr(ctx, lx - bw / 2, ly - bh / 2, bw, bh, 18); ctx.stroke();
      ctx.textBaseline = 'alphabetic'; ctx.direction = 'rtl';
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

  // ---------- labels pinned to real 3-D points ---------------------------
  const V3 = new TH.Vector3();
  function project(x, y, z) {
    V3.set(x, y, z).project(SC.cam);
    return [(V3.x * 0.5 + 0.5) * W, (-V3.y * 0.5 + 0.5) * H, V3.z < 1];
  }
  const LABELS = [
    [ev.dig + 2.9, 2.2, 'קירות בטון', [-5.3, -4.2, -0.2], 250, 150],
    [ev.riser + 1.2, 2.2, 'צינור בטון עד פני הקרקע', [-2.8, 0.6, -4.3], 250, -40],
    [ev.door + 1.4, 2.2, 'מכסה פלדה עגול', [-2.8, 1.7, -4.3], 230, -200],
    [ev.seat + 0.9, 2.4, 'הלחץ סוגר אותו', [-2.8, 1.5, -4.3], -240, -200],
    [ev.sleeve + 0.7, 2.4, 'בטון יצוק סביב הצינור', [-6.7, -2.4, -2.2], 250, -120],
    [ev.filter + 1.0, 2.4, 'שסתום הדף', [-6.1, -5.6, -1.6], -250, -170],
    [ev.exit2 + 1.0, 2.4, 'פיר יציאה', [16.3, -0.6, -2.2], -230, -170],
    [ev.sump + 1.0, 2.2, 'בור ניקוז', [3.6, -7.0, -1.5], 240, -190],
    [ev.pump + 0.9, 2.0, 'משאבה', [3.6, -6.6, -1.5], -230, -150],
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
      ctx.drawImage(SC.renderer.domElement, 0, 0, W, H);
      dof(ctx, c.g);
      {                                                     // cinematic grade: warm top, cool floor, vignette
        ctx.save();
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(255,196,130,0.16)'); g.addColorStop(0.55, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(28,46,86,0.20)');
        ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        const v = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.20, W / 2, H * 0.5, H * 0.72);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.72, 'rgba(0,0,0,0.12)'); v.addColorStop(1, 'rgba(0,0,0,0.44)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      // a single-frame flash on the three structural hits
      for (const h of [ev.shrapnel, ev.hit, ev.collapse]) {
        const f = clamp(1 - (t - h) / 0.1) * (t >= h ? 1 : 0);
        if (f > 0) { ctx.save(); ctx.globalAlpha = f * 0.5; ctx.fillStyle = '#ffd9a0'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      }
      archArcs(ctx, t);
      staleAir(ctx, t);
      counters(ctx, t);
      labels(ctx, t);
      for (const cp of CAPS) caption(ctx, cp, t);
    },
    post: { vignette: 0.38, grain: 0.03 },
  });
})();
