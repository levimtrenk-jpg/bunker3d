// THE SCORE for the elevator short. One timeline read by the picture (film.js, s3d/elev3d.js) and the
// sound (sfx.py reads out/ev.json). Times follow the approved narration at ~2.6 words/s; they are
// re-timed to the real recording later. Everything here is a pure function of t.
(function () {
  const node = typeof require !== 'undefined';
  const U = node ? require('./engine/util') : globalThis.U;
  const FPS = 30;
  const FORMAT = U.pickFormat('9:16');
  const [W, H] = U.formatSize(FORMAT);
  const SAFE = U.safeArea(W, H);
  const DURATION = 63.32;

  const ev = {
    // part 1: the fall you imagine (slowed while he asks), rewind, ropes, counterweight, the tear
    cut: 0.6, fall: 0.96, slow: 2.4, freeze: 6.0, thaw: 7.14, rewEnd: 8.78,
    ropes: 8.78, cw: 17.26, snap: 23.5, plunge: 24.27,
    // part 2: governor senses overspeed, stops its rope, the rope pulls the safety gear (real physics, slow motion)
    govClose: 26.22, trip: 28.59, govRope: 29.04, link: 30.4, clamp: 32.01, stop: 34.42,
    // part 3: the buffers (a car at running speed past the bottom floor, ropes intact)
    p3: 34.42, contact: 37.83, p3end: 39.46,
    // part 4: the brake
    p4: 39.46, brakeShot: 41.73, cut2: 44.54, p4pull: 45.34,
    // part 5: numbers
    p5: 49.72, techs: 53.74, carbon: 999,
    // part 6: the ending, loops to frame one
    p6: 56.98, doors: 60.16,
  };
  const G = 12;                    // the imagined fall (part 1) reads better a touch faster than 9.8
  const G2 = 9.81;                 // real physics for part 2
  const Y0 = 34.08;                // car centre when its floor is flush with the landing at 33 m
  const FLOORS = [6, 15, 24, 33, 42, 51];
  const CW0 = 18;                  // counterweight centre while the car waits at Y0
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const ease = sm;

  // ---------- part 1: the imagined fall ----------
  const SLOWK = 0.22;
  function tauRun(t) { return t < ev.slow ? t - ev.fall : (ev.slow - ev.fall) + (t - ev.slow) * SLOWK; }
  function tau(t) {               // seconds of free fall accumulated (slows while he asks, goes back down in the rewind)
    if (t < ev.fall) return 0;
    if (t < ev.freeze) return tauRun(t);
    const hold = tauRun(ev.freeze);
    if (t < ev.thaw) return hold;
    if (t < ev.rewEnd) return hold * (1 - sm((t - ev.thaw) / (ev.rewEnd - ev.thaw)));
    return 0;
  }

  // ---------- part 2: real numbers ----------
  // A governor trips at ~115-125 % of rated speed, so the car is caught after ~2-3 m, not 30.
  // Real time is stretched: story seconds per real second, as knots.
  const K2 = [[ev.snap, 0], [ev.snap + 1.0, 0.06], [ev.plunge + 0.9, 0.16], [ev.govClose, 0.22], [ev.trip, 0.40], [ev.clamp, 0.52], [ev.stop, 1.0]];
  function story2(t) {
    if (t <= K2[0][0]) return 0;
    for (let i = 0; i < K2.length - 1; i++) {
      const [a, sa] = K2[i], [b, sb] = K2[i + 1];
      if (t <= b) return sa + (sb - sa) * (t - a) / (b - a);
    }
    return 1.0;
  }
  const SF = 0.52, V1 = G2 * SF, Y1 = 0.5 * G2 * SF * SF, AD = V1 / (1.0 - SF);   // free fall to the clamp, then constant deceleration
  function drop2(s) {
    if (s <= SF) return 0.5 * G2 * s * s;
    const u = Math.min(s, 1.0) - SF;
    return Y1 + V1 * u - 0.5 * AD * u * u;
  }
  const v2 = (s) => (s <= SF ? G2 * s : Math.max(0, V1 - AD * (Math.min(s, 1) - SF)));

  // ---------- part 3: running speed into the pit ----------
  const VRUN = 3.2, YC = -5.725, STROKE = 0.52, A3 = VRUN * VRUN / (2 * STROKE);
  function p3y(t) {
    if (t <= ev.contact) return YC + VRUN * (ev.contact - t);
    const s = (t - ev.contact) * 0.38;                             // slow motion on the impact
    const tt = Math.min(s, VRUN / A3);
    return YC - (VRUN * tt - 0.5 * A3 * tt * tt);
  }

  // ---------- the state of the whole world at time t ----------
  function st(t) {
    const o = { t, part: 1, carY: Y0, cwY: CW0, ropes: 'intact', story: 0, power: 1, emerg: 0, tau: 0,
      float: 0, grab: 0, crouch: 0, look: 0, gov: 0, govV: 0, govTrip: 0, link: 0, wedge: 0, wedgeFail: 0,
      buffer: 0, brake: 0, brakeHold: 0, door: 0, tech: 0, carbon: 0,
      gRopes: 0, gCW: 0, gGovRope: 0, gGov: 0, gWedge: 0, gBuffer: 0, gBrake: 0 };
    if (t < ev.snap) {                                               // part 1
      o.part = 1;
      o.tau = tau(t);
      o.carY = Y0 - 0.5 * G * o.tau ** 2;
      o.ropes = o.tau > 0.01 ? 'trail' : 'intact';
      o.float = sm(o.tau / 0.45);
      o.power = t < ev.cut ? 1 : t < ev.cut + 0.05 ? 0 : t < ev.cut + 0.12 ? 0.5 : 0;
      o.emerg = sm((t - ev.cut - 0.12) / 0.18);
      o.grab = t >= ev.cut ? sm((t - ev.cut - 0.06) / 0.22) * (1 - o.float) : 0;
      o.look = sm((t - ev.cut) / 0.15) * (1 - sm((t - ev.fall) / 0.3));
      if (t >= ev.ropes) {
        o.gRopes = sm((t - ev.ropes - 0.1) / 0.9) * (1 - sm((t - ev.cw - 0.2) / 0.6) * 0.75);
        o.gCW = sm((t - ev.cw - 0.3) / 0.6) * (1 - sm((t - ev.snap + 0.6) / 0.5));
      }
      return o;
    }
    if (t < ev.p3) {                                                 // part 2 (from the snap)
      o.part = 2; o.power = 0; o.emerg = 1;
      const s = story2(t); o.story = s;
      o.carY = Y0 - drop2(s); o.ropes = 'snapped';
      const v = v2(s);
      o.float = s < SF ? sm(s / 0.08) : 1 - sm((s - SF) / 0.05);
      o.crouch = s > SF ? sm((s - SF) / 0.06) * (1 - sm((t - ev.stop - 0.4) / 1.2) * 0.4) : 0;
      o.grab = 0.25 * (1 - o.float) * (s > SF ? 1 : 0);
      o.gov = (s < 0.40 ? drop2(s) : drop2(0.40)) / 0.18;            // governor sheave angle: rope travel / radius
      o.govV = s < 0.40 ? v : 0;
      o.govTrip = sm((t - ev.trip) / 0.35);
      o.link = sm((t - ev.link) / 1.0);
      o.wedge = sm((t - ev.clamp + 0.5) / 0.5);
      o.gGovRope = sm((t - ev.govRope) / 0.5) * (1 - sm((t - ev.link - 0.4) / 0.6) * 0.6);
      o.gGov = sm((t - ev.govClose) / 0.5) * (1 - sm((t - ev.govRope) / 0.6) * 0.5);
      o.gWedge = sm((t - ev.link) / 0.5);
      return o;
    }
    if (t < ev.p4) {                                                 // part 3
      o.part = 3; o.power = 1; o.emerg = 0;
      o.carY = p3y(t); o.cwY = CW0 + (Y0 - o.carY);
      o.buffer = Math.max(0, YC - o.carY);
      o.wedgeFail = 1;
      o.gBuffer = sm((t - ev.contact + 1.8) / 0.8);
      o.crouch = t > ev.contact ? sm((t - ev.contact) / 0.25) * 0.55 : 0;
      return o;
    }
    if (t < ev.p5) {                                                 // part 4
      o.part = 4;
      o.power = t < ev.cut2 ? 1 : t < ev.cut2 + 0.05 ? 0 : t < ev.cut2 + 0.12 ? 0.5 : 0;
      o.emerg = sm((t - ev.cut2 - 0.12) / 0.18);
      o.brake = sm((t - ev.cut2 - 0.03) / 0.12);                     // springs close the shoes the instant the coil lets go
      o.brakeHold = 1 - o.brake;
      o.gBrake = t < ev.brakeShot ? 0 : sm((t - ev.brakeShot - 0.3) / 0.6) * (t < ev.cut2 ? 0.45 : 1) * (1 - sm((t - ev.p4pull - 1.5) / 1.2) * 0.6);
      o.grab = t >= ev.cut2 ? sm((t - ev.cut2 - 0.06) / 0.22) * (1 - sm((t - ev.cut2 - 2.6) / 1.2) * 0.7) : 0;
      o.look = sm((t - ev.cut2) / 0.15) * (1 - sm((t - ev.cut2 - 1.6) / 0.6));
      return o;
    }
    if (t < ev.p6) {                                                 // part 5
      o.part = 5; o.power = 1;
      o.tech = 1;
      o.carbon = sm((t - ev.carbon - 0.8) / 1.6);
      return o;
    }
    o.part = 6; o.power = 1;                                         // part 6
    o.door = sm((t - ev.doors) / 1.4);
    return o;
  }

  // moments the first fall passes a landing (for the sound)
  const passes = [];
  for (const f of FLOORS) {
    const need = Y0 - (f + 0.2);
    if (need > 0) { const tt = Math.sqrt(2 * need / G); for (let x = ev.fall; x < ev.freeze; x += 0.005) if (tau(x) >= tt) { passes.push(+x.toFixed(3)); break; } }
  }
  ev.passes = passes;

  const carY = (t) => st(t).carY;
  const carV = (t) => { const e = 1 / 240; return (carY(t + e) - carY(t - e)) / (2 * e); };

  const markers = {
    cut: { t: ev.cut, sync: 'av' }, snap: { t: ev.snap, sync: 'av' }, trip: { t: ev.trip },
    clamp: { t: ev.clamp }, contact: { t: ev.contact }, cut2: { t: ev.cut2, sync: 'av' }, doors: { t: ev.doors },
  };
  const S = { p1: [0, ev.snap], p2: [ev.snap, ev.p3], p3: [ev.p3, ev.p4], p4: [ev.p4, ev.p5], p5: [ev.p5, ev.p6], p6: [ev.p6, DURATION] };
  const SCORE = { SLOWK, FPS, FORMAT, W, H, SAFE, DURATION, ev, markers, S, G, Y0, CW0, FLOORS, YC, ease, tau, st, carY, carV, story2, drop2 };
  if (node) {
    module.exports = SCORE;
    if (require.main === module) {
      require('fs').writeFileSync(require('path').join(__dirname, 'out', 'ev.json'), JSON.stringify({ ev, duration: DURATION }, null, 1));
      const s = st(ev.stop + 0.5);
      console.log('wrote out/ev.json', 'stop y', s.carY.toFixed(2), 'drop', (Y0 - s.carY).toFixed(2), 'v@trip', (G2 * 0.40).toFixed(1), 'm/s',
        '| p3 start y', p3y(ev.p3).toFixed(2), 'buffer', st(ev.p3end - 0.2).buffer.toFixed(2));
    }
  } else globalThis.SCORE = SCORE;
})();
