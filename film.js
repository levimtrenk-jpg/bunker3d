// The film: camera, cuts, 2D finishing (freeze, rewind tape, bloom), callout labels, numbers and captions.
// The world is s3d/elev3d.js; the timeline is score.js. Pure function of t.
(function () {
  const S = globalThis.SCORE, ev = S.ev, W = S.W, H = S.H;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const L3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const io = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const CZ = -1.65, RZ = -1.65;
  let SC = null, E = null;

  // ---------- camera: one function of t, with hard cuts between scenes ----------
  function camAt(t, s) {
    const y = s.carY, TOP = E.TOP, SZ = E.SZ, CWZ = E.CWZ;
    let p, g, f = 38;
    const wideA = (yy) => ({ p: [0, yy + 1.4, 24], g: [0, yy + 0.6, CZ] });
    if (t < ev.fall) {                                               // A: wide, quiet, slow push
      const k = sm(t / ev.fall); p = [0, y + 1.4, lerp(24, 16, k)]; g = [0, y + 0.6, CZ];
    } else if (t < ev.freeze) {                                      // B: chase the fall, then push in on his face
      const sp = clamp(Math.abs(S.carV(t)) / 24), k = sm((t - ev.fall) / 0.6), z = sm((t - ev.fall - 0.7) / 1.3);
      const d = lerp(lerp(16, 11.5, k), 3.6, z);
      p = [lerp(0, -0.35, z), lerp(lerp(y + 1.4, y + 0.3 + 2 * sp, k), y + 0.62, z), d];
      g = [0, lerp(lerp(y + 0.6, y + 0.3 + 2 * sp, k), y + 0.45, z), CZ];
      f = lerp(38, 42, k);
    } else if (t < ev.thaw) {                                        // C: frozen on the close-up
      const k = (t - ev.freeze) / (ev.thaw - ev.freeze);
      p = [-0.35, y + 0.62, lerp(3.6, 3.3, k)]; g = [0, y + 0.45, CZ]; f = 42;
    } else if (t < ev.rewEnd) {                                      // D: the rewind pulls back and tilts up the ropes
      const k = (t - ev.thaw) / (ev.rewEnd - ev.thaw), b = sm((k - 0.35) / 0.65);
      p = [lerp(-0.35, 0.9, sm(k)), lerp(y + 0.62, y + 2.8, b), lerp(3.3, 5.0, sm(k))]; g = [0, lerp(y + 0.45, y + 2.1, b), RZ]; f = 42;
    } else if (t < ev.cw) {                                          // E: the hitch, six ropes, then crane all the way up to the sheave
      const k1 = sm((t - ev.rewEnd) / 1.0), k2 = io((t - ev.rewEnd - 2.4) / 3.6);
      const hp = [0.9, y + 2.8, lerp(5.0, 2.6, k1)], hg = [0, y + 2.1, RZ];
      const tp = [-1.5, TOP + 0.2, 4.6], tg = [0, TOP + 0.25, SZ];
      p = L3(hp, tp, k2); g = L3(hg, tg, k2); f = lerp(40, 38, k2);
      p[1] += Math.sin(Math.PI * k2) * 3;                            // the crane arcs a little
    } else if (t < ev.snap - 1.0) {                                  // F: over the wheel and down the back to the counterweight
      const u = t - ev.cw, k = io((u - 0.3) / 2.4), k2 = sm((u - 2.7) / 3.0);
      const p0 = [-1.5, TOP + 0.2, 4.6], g0 = [0, TOP + 0.25, SZ];
      const p1 = [3.4, s.cwY + 1.4, 3.2], g1 = [0, s.cwY + 0.6, CWZ];
      p = L3(p0, p1, k); g = L3(g0, g1, k); f = 38;
      p[0] += k2 * -1.2; p[2] -= k2 * 0.6;                           // slow drift round the counterweight
    } else if (t < ev.plunge) {                                      // G: cut back to the sheave for the tear
      const u = t - (ev.snap - 1.0);
      p = [-1.25, TOP + 0.55, lerp(4.4, 3.9, sm(u / 2.2))]; g = [0, TOP + 0.6, RZ - 0.4]; f = 38;
    } else if (t < ev.govClose) {                                    // H: the plunge down the shaft to the car
      const k = io((t - ev.plunge) / 1.4);
      p = L3([-1.25, TOP + 0.55, 3.9], [-0.6, y + 0.9, 5.6], k); g = L3([0, TOP + 0.6, RZ - 0.4], [0.2, y + 0.3, CZ], k); f = lerp(38, 44, k);
    } else if (t < ev.govRope) {                                     // J: the governor senses the speed, and locks
      const k = sm((t - ev.govClose) / (ev.govRope - ev.govClose));
      p = [E.GX + 0.25, E.GY + 0.1, E.GZ + lerp(1.7, 1.15, k)]; g = [E.GX, E.GY, E.GZ]; f = 38;
    } else if (t < ev.link) {                                        // I: its rope, stopped, down to the grip on the car
      const k = io((t - ev.govRope) / 1.3);
      p = [3.0, y + 1.7 + (1 - k) * 5.5, 1.6]; g = [E.GX - E.GR, y + 1.62 + (1 - k) * 6.5, E.GZ]; f = 40;
    } else if (t < ev.clamp - 0.4) {                                 // K: the rope grip pulls the lever up
      const k = sm((t - ev.link) / 2.2);
      p = [lerp(2.9, 2.6, k), y + 1.55, lerp(1.2, 0.9, k)]; g = [1.7, y + 1.45, -1.0]; f = 40;
    } else if (t < ev.stop) {                                        // L: the wedges bite the rail
      p = [2.35, y - 0.85, -0.35]; g = [1.74, y - 1.1, RZ]; f = 44;
    } else if (t < ev.p3) {                                          // M: stopped. He drops to the floor.
      const k = sm((t - ev.stop) / 0.9);
      p = [0.3, y + 0.35, lerp(4.0, 4.6, k)]; g = [0, y - 0.1, CZ]; f = 40;
    } else if (t < ev.contact) {                                     // N: from the pit, the car coming down
      const k = sm((t - ev.p3) / (ev.contact - ev.p3));
      p = [1.7, -7.7, 2.6]; g = [0, lerp(y - 1.0, -6.4, k), RZ]; f = 46;
    } else if (t < ev.p4) {                                          // O: the buffer takes it
      p = [2.1, -8.2, 1.9]; g = [0.6, -7.4, RZ]; f = 42;
    } else if (t < ev.brakeShot) {                                   // P: the same wide as frame one. Lights on.
      const k = sm((t - ev.p4) / (ev.brakeShot - ev.p4));
      ({ p, g } = wideA(y)); p[2] = lerp(22, 17, k);
    } else if (t < ev.p4pull) {                                      // Q: the brake
      const k = sm((t - ev.brakeShot) / (ev.p4pull - ev.brakeShot));
      p = [lerp(2.9, 2.6, k), TOP + 0.45, SZ + lerp(3.9, 3.4, k)]; g = [1.8, TOP + 0.3, SZ]; f = 38;
    } else if (t < ev.p5) {                                          // R: pull back and down to the car, hanging still in the dark
      const k = io((t - ev.p4pull) / 3.4);
      p = L3([2.6, TOP + 0.45, SZ + 3.4], [0.4, y + 1.0, 7.5], k); g = L3([1.7, TOP + 0.15, SZ], [0, y + 0.3, CZ], k); f = 40;
    } else if (t < ev.techs) {                                       // S: the whole shaft
      const k = sm((t - ev.p5) / (ev.techs - ev.p5));
      p = [0, 30, lerp(118, 100, k)]; g = [0, 30, -2]; f = 40;
    } else if (t < ev.p6) {                                          // T: the car top, a technician at work
      const k = sm((t - ev.techs) / (ev.carbon - ev.techs));
      p = [lerp(-2.3, -2.0, k), y + 2.7, lerp(0.7, 0.4, k)]; g = [-0.7, y + 1.8, -2.0]; f = 40;
    } else if (t < ev.doors + 0.4) {                                 // V: back in the car
      const k = sm((t - ev.p6) / (ev.doors + 0.4 - ev.p6));
      p = [-0.3, y + 0.6, lerp(4.6, 3.9, k)]; g = [0, y + 0.42, CZ]; f = 40;
    } else {                                                         // W: doors open, he steps out, pull back to frame one
      const k = io((t - ev.doors - 0.4) / (S.DURATION - ev.doors - 0.6));
      const a = wideA(y);
      p = L3([-0.3, y + 0.6, 3.9], a.p, k); g = L3([0, y + 0.42, CZ], a.g, k); f = 38;
    }
    // shake on the impacts
    let sh = 0.01;
    for (const [tt, a, d] of [[ev.cut, 0.08, 11], [ev.snap, 0.18, 6], [ev.clamp, 0.05, 3], [ev.stop, 0.06, 5], [ev.contact, 0.12, 4], [ev.cut2, 0.05, 9]]) if (t >= tt) sh += a * Math.exp(-(t - tt) * d);
    if (t >= ev.fall && t < ev.freeze) sh += 0.03 + 0.04 * clamp(Math.abs(S.carV(t)) / 24);
    if (t >= ev.thaw && t < ev.rewEnd) sh += 0.04;
    if (t >= ev.clamp && t < ev.stop) sh += 0.012;
    const near = Math.hypot(p[0] - g[0], p[1] - g[1], p[2] - g[2]);
    const jx = (Math.sin(t * 91.3) + Math.sin(t * 37.7) * 0.6) * sh * Math.min(1, near / 6), jy = (Math.sin(t * 77.9) + Math.sin(t * 53.1) * 0.6) * sh * Math.min(1, near / 6);
    return { p: [p[0] + jx, p[1] + jy, p[2]], g, f };
  }

  // ---------- 2D finishing ----------
  let tmp = null, bloom = null;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function finish(ctx, src, t) {
    const frozen = t >= ev.freeze && t < ev.thaw, rew = t >= ev.thaw && t < ev.rewEnd;
    ctx.save();
    ctx.filter = frozen ? 'grayscale(0.7) contrast(1.12) brightness(1.06)' : rew ? 'saturate(0.7) hue-rotate(-14deg) contrast(1.1)' : 'saturate(1.12) contrast(1.06)';
    ctx.drawImage(src, 0, 0, W, H);
    ctx.restore(); ctx.filter = 'none';
    if (rew) {
      if (!tmp) tmp = mk(W, H);
      const tc = tmp.getContext('2d'); tc.drawImage(ctx.canvas, 0, 0, W, H);
      const fr = Math.floor(t * 30), amp = 38 * Math.sin(Math.PI * (t - ev.thaw) / (ev.rewEnd - ev.thaw));
      for (let i = 0; i < 14; i++) {
        const y0 = hash(fr * 3 + i) * H, h = 12 + hash(fr * 5 + i) * 90, dx = (hash(fr * 7 + i) - 0.5) * 2 * amp;
        if (hash(fr * 11 + i) < 0.45) continue;
        ctx.drawImage(tmp, 0, y0, W, h, dx, y0, W, h);
      }
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.07; ctx.fillStyle = '#3ad0ff'; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (!bloom) bloom = mk(Math.round(W / 6), Math.round(H / 6));
    const bc = bloom.getContext('2d');
    bc.filter = 'brightness(0.85) contrast(2.1) blur(3px)'; bc.drawImage(ctx.canvas, 0, 0, bloom.width, bloom.height); bc.filter = 'none';
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.45; ctx.filter = 'blur(10px)'; ctx.drawImage(bloom, 0, 0, W, H); ctx.restore();
    let fl = 0;
    if (t >= ev.freeze) fl = Math.max(fl, 0.2 * clamp(1 - (t - ev.freeze) / 0.07));
    if (t >= ev.snap) fl = Math.max(fl, 0.3 * clamp(1 - (t - ev.snap) / 0.08));
    if (fl > 0) { ctx.save(); ctx.globalAlpha = fl; ctx.fillStyle = '#fff4e0'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  // ---------- text helpers ----------
  const FONT = (w, sz) => `${w} ${sz}px Rubik, sans-serif`;
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function strokeText(ctx, str, x, y, size, col = '#fff', w = 900, lw = 14) {
    ctx.font = FONT(w, size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 4; ctx.strokeStyle = '#000'; ctx.lineWidth = lw; ctx.strokeText(str, x, y);
    ctx.shadowColor = 'transparent'; ctx.fillStyle = col; ctx.fillText(str, x, y);
  }

  // ---------- callout labels on the parts being talked about ----------
  function project(x, y, z) {
    const v = new E.THREE.Vector3(x, y, z).project(SC.cam);
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2];
  }
  const LABELS = [
    [ev.rewEnd + 1.2, ev.rewEnd + 5.0, (s) => [0.5, s.carY + 2.3, RZ], 'כבלי פלדה', [-260, -170]],
    [ev.cw + 2.6, ev.snap - 1.1, (s) => [0.65, s.cwY + 1.0, E.CWZ], 'משקולת נגדית', [-300, -260]],
    [ev.govRope + 0.2, ev.link - 0.1, (s) => [E.GX - E.GR, s.carY + 3.0, E.GZ], 'כבל הוויסת', [-330, 60]],
    [ev.govClose + 0.3, ev.govRope - 0.1, (s) => [E.GX + 0.06, E.GY + 0.16, E.GZ + 0.08], 'ויסת מהירות', [-300, -330]],
    [ev.clamp - 0.2, ev.stop, (s) => [1.74, s.carY - 1.1, RZ], 'צבתות בטיחות', [-330, -300]],
    [ev.p3 + 1.2, ev.p3end - 0.1, (s) => [0.7, -7.1 - s.buffer, RZ], 'בולם שמן', [-300, -320]],
    [ev.brakeShot + 0.4, ev.cut2 - 0.3, (s) => [2.0, E.TOP + 0.95, E.SZ], 'סליל חשמלי', [-320, -260]],
    [ev.brakeShot + 0.4, ev.p4pull, (s) => [1.6, E.TOP + 0.55, E.SZ + 0.2], 'נעלי בלם', [-340, 230]],
    [ev.cut2 + 0.2, ev.p4pull, (s) => [1.92, E.TOP + 1.4, E.SZ], 'קפיצים', [200, -260]],
  ];
  function labels(ctx, t, s) {
    for (const [a, b, fn, text, off] of LABELS) {
      if (t < a || t > b) continue;
      const k = sm((t - a) / 0.25) * (1 - sm((t - b + 0.25) / 0.25));
      const [x, y, z] = fn(s), [sx, sy, vis] = project(x, y, z); if (!vis) continue;
      const lx = clamp(sx + off[0], 200, W - 200), ly = clamp(sy + off[1], 330, H * 0.6);
      ctx.save(); ctx.globalAlpha = k;
      ctx.strokeStyle = '#F57423'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = '#F57423'; ctx.beginPath(); ctx.arc(sx, sy, 9, 0, 7); ctx.fill();
      ctx.font = FONT(800, 46); const tw = ctx.measureText(text).width + 44, th = 70;
      ctx.fillStyle = 'rgba(12,14,18,0.88)'; rr(ctx, lx - tw / 2, ly - th / 2, tw, th, 16); ctx.fill();
      ctx.strokeStyle = '#F57423'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = FONT(800, 46); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.fillStyle = '#fff'; ctx.fillText(text, lx, ly + 2);
      ctx.restore();
    }
  }

  // ---------- numbers ----------
  function numbers(ctx, t) {
    const fmt = (n) => Math.round(n).toLocaleString('en-US');
    if (t >= ev.p5 + 0.3 && t < ev.techs) {
      const k = sm((t - ev.p5 - 0.3) / 0.3) * (1 - sm((t - ev.techs + 0.3) / 0.3)), c = io((t - ev.p5 - 0.3) / 2.6);
      ctx.save(); ctx.globalAlpha = k;
      strokeText(ctx, fmt(18e9 * c), W / 2, H * 0.24, 118, '#F57423', 900, 16);
      strokeText(ctx, 'נסיעות במעלית בשנה · ארה״ב', W / 2, H * 0.24 + 110, 52, '#fff', 800, 10);
      ctx.restore();
    }
    if (t >= ev.techs + 0.2 && t < ev.p6) {
      const k = sm((t - ev.techs - 0.2) / 0.3) * (1 - sm((t - ev.p6 + 0.3) / 0.3)), c = io((t - ev.techs - 0.2) / 1.0);
      ctx.save(); ctx.globalAlpha = k;
      strokeText(ctx, String(Math.round(27 * c)), W / 2, H * 0.19, 190, '#F57423', 900, 18);
      strokeText(ctx, 'מקרי מוות בשנה, בממוצע', W / 2, H * 0.19 + 140, 52, '#fff', 800, 10);
      if (t > ev.techs + 1.6) strokeText(ctx, 'רובם טכנאים', W / 2, H * 0.19 + 215, 58, '#ffd08a', 900, 10);
      ctx.restore();
    }
    if (t >= ev.carbon + 3.0 && t < ev.p6) {
      const k = sm((t - ev.carbon - 3.0) / 0.3) * (1 - sm((t - ev.p6 + 0.3) / 0.3)), c = io((t - ev.carbon - 3.2) / 1.2);
      const x0 = 150, wFull = W - 300, y0 = H * 0.17;
      ctx.save(); ctx.globalAlpha = k;
      strokeText(ctx, 'משקל הכבל (לפי היצרן)', W / 2, y0, 48, '#fff', 800, 10);
      for (const [i, name, frac, col] of [[0, 'פלדה', 1, '#9aa3ad'], [1, 'סיבי פחמן', 0.2, '#F57423']]) {
        const yy = y0 + 90 + i * 120;
        ctx.fillStyle = 'rgba(12,14,18,0.8)'; rr(ctx, x0, yy, wFull, 70, 14); ctx.fill();
        ctx.fillStyle = col; rr(ctx, x0 + wFull * (1 - frac * c), yy, Math.max(1, wFull * frac * c), 70, 14); ctx.fill();
        ctx.font = FONT(900, 44); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.fillStyle = '#fff';
        ctx.fillText(name, x0 + wFull - 20, yy + 37);
      }
      ctx.restore();
    }
  }

  // ---------- captions: the approved narration, a few words at a time ----------
  const LINES = [
    [1.0, 3.0, 'החשמל קרס, והמעלית שלך מתחילה ליפול.'],
    [3.1, 6.1, 'מה אתה עושה? לקפוץ רגע לפני הנחיתה? לשכב על הרצפה?'],
    [6.3, 8.0, 'בוא נעצור רגע, ונחזור אחורה.'],
    [8.2, 14.2, 'אתה בטח חושב שהמעלית תלויה על כבל אחד. אבל יש בה בין ארבעה לשמונה, וכל אחד מהם לבד יכול להחזיק אותה.'],
    [14.4, 18.1, 'ובצד השני תלויה משקולת נגדית, כדי שהמנוע ירים רק את ההפרש.'],
    [18.3, 20.0, 'אבל נניח שאיכשהו כולם נקרעו.'],
    [20.2, 21.6, 'עכשיו אתה בנפילה חופשית.'],
    [21.9, 25.6, 'אבל גלגלת קטנה למעלה מרגישה שאתה מהיר מדי, ועוצרת כבל נפרד.'],
    [25.8, 28.8, 'הכבל מושך צבתות פלדה שננעלות על המסילות, ואתה עוצר.'],
    [29.4, 33.1, 'ואם גם זה נכשל, בתחתית הפיר מחכים בולמים. הם בולעים את המכה.'],
    [33.6, 38.0, 'אבל רגע. מה עם החשמל שנפל? על המנוע יש בלם, שמופעל ברגע שהחשמל נעלם.'],
    [38.3, 41.3, 'הדבר שחשבת שיפיל אותך, הוא בדיוק הדבר שעוצר אותך.'],
    [41.8, 44.8, 'בארצות הברית נוסעים במעלית שמונה עשר מיליארד פעם בשנה.'],
    [45.0, 47.7, 'מתים בה בממוצע עשרים ושבעה אנשים, רובם טכנאים.'],
    [48.2, 52.0, 'אז מה עושים כשהמעלית נופלת? כלום. המעלית כבר עצרה בלעדיך.'],
  ];
  const CAPS = [[0, 0.95, 'מה עושים כשהמעלית נופלת?', 1]];
  for (const [a, b, text] of LINES) {                           // chunks of up to 4 words, split at punctuation, timed by letters
    const words = text.split(' '), parts = []; let cur = [];
    for (const w of words) { cur.push(w); if (cur.length >= 4 || (/[,.?]$/.test(w) && cur.length >= 2)) { parts.push(cur.join(' ')); cur = []; } }
    if (cur.length) parts.push(cur.join(' '));
    const wts = parts.map((p) => p.replace(/[^א-תA-Za-z0-9]/g, '').length + 2), tot = wts.reduce((x, y2) => x + y2, 0);
    let acc = 0;
    parts.forEach((p, i) => { const t0 = a + (b - a) * acc / tot; acc += wts[i]; CAPS.push([t0, a + (b - a) * acc / tot - 0.02, p.replace(/[,.]$/, '')]); });
  }
  function caption(ctx, c, t) {
    const [a, b, text, hook] = c; if (t < a || t >= b) return;
    const pop = clamp((t - a) / 0.08), size = hook ? 84 : 74;
    ctx.save(); ctx.font = FONT(900, size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    const words = text.split(' '), lines = []; let ln = '';
    for (const w of words) { const tr = ln ? ln + ' ' + w : w; if (ctx.measureText(tr).width > W - 220 && ln) { lines.push(ln); ln = w; } else ln = tr; }
    lines.push(ln);
    const cy = hook ? H * 0.2 : H * 0.74, lh = size * 1.18, top = cy - (lines.length - 1) * lh / 2;
    const sc = 0.88 + 0.12 * pop; ctx.translate(W / 2, cy); ctx.scale(sc, sc); ctx.translate(-W / 2, -cy); ctx.globalAlpha = pop;
    lines.forEach((l, i) => strokeText(ctx, l, W / 2, top + i * lh, size, hook && i === lines.length - 1 ? '#F57423' : '#fff'));
    ctx.restore();
  }

  Studio.film({
    async init() {
      const f = new FontFace('Rubik', 'url(fonts/rubik-he-900.woff2)', { weight: '900' }); document.fonts.add(f); await f.load();
      E = ELEV; SC = ELEV.build(W, H);
    },
    draw(ctx, t) {
      const s0 = S.st(t);
      const c = camAt(t, s0);
      const s = ELEV.apply(SC, t, c.p);
      const src = ELEV.shot(SC, c.p, c.g, c.f);
      finish(ctx, src, t);
      labels(ctx, t, s);
      numbers(ctx, t);
      /* captions go in a separate SRT file, not burned in */
    },
    post: { vignette: 0.42, grain: 0.035 },
    fadeOut: 0,
  });
})();
