const fs = require('fs');
// THE SONG — the recorded narration is the spine; a sparse bed and event SFX sit under it.
const path = require('path');
const { SR, Bus, reverb } = require('./engine/audio/dsp');
const I = require('./engine/audio/instruments');
const MIX = require('./engine/audio/mix');
const sc = require('./score');
const { BEAT, DURATION, m, ev } = sc;

const N = Math.ceil(DURATION * SR);
const bus = () => new Bus(N);
const drums = bus(), bass = bus(), pad = bus(), fx = bus(), verb = bus();

// --- MUSIC (rebuilt 24.11: the old drone changed chord at random moments and sounded "off") ---
// One steady 4-bar loop at 100 BPM, Dm - Bb - F - C, that only ADDS layers as the bunker grows.
// Layers: e-piano arpeggio from the start; soft kick + pizzicato from the dig; low strings once
// we are sealed in; everything drops out for the collapse, then the full loop resolves to D.
const add = (b, x, t, g) => x.L ? b.addStereo(x.L, x.R, t, g) : b.addMono(x, t, g);
const BT = 60 / 100, BAR = BT * 4;
const PROG = [['D3','F3','A3'], ['Bb2','D3','F3'], ['F3','A3','C4'], ['C3','E3','G3']];
const ROOT = ['D2', 'Bb1', 'F2', 'C2'];
const QUIET = [[ev.collapse - 0.1, ev.collapse + 2.6]];                  // music breathes out for the hit
const quiet = t => QUIET.some(([a, b]) => t >= a && t < b);
for (let bar = 0; bar * BAR < DURATION - 1; bar++) {
  const t0 = bar * BAR, ch = PROG[bar % 4];
  const end = t0 >= ev.done + 3;                                         // the last bars: only the tonic
  const chord = end ? PROG[0] : ch;
  for (let i = 0; i < 8; i++) {                                          // the arpeggio, 8ths
    const t = t0 + i * BT / 2; if (t >= DURATION - 0.5 || quiet(t)) continue;
    const n = chord[[0, 1, 2, 1, 0, 2, 1, 2][i]];
    add(pad, I.epiano(m(n) + 12, 0.5, { index: 1.1, decay: 0.7 }), t, 0.05);
  }
  if (t0 >= ev.dig && !quiet(t0)) {                                       // pulse: the work has started
    for (let i = 0; i < 4; i++) { const t = t0 + i * BT; if (!quiet(t)) add(drums, I.kick({ punch: 0.6, tail: 0.25 }), t, i % 2 ? 0.07 : 0.11); }
    add(bass, I.bass(m(end ? ROOT[0] : ROOT[bar % 4]), BAR * 0.9, { sub: 1 }), t0, 0.16);
  }
  if (t0 >= ev.soil && !quiet(t0)) for (let i = 0; i < 4; i++)           // pizzicato answering on the off-beats
    add(pad, I.pizz(m(chord[i % 3]) + 12, { seed: bar * 4 + i }), t0 + i * BT + BT / 2, 0.035);
  if (t0 >= ev.sealed - 0.5 && !quiet(t0))                               // sealed in: low strings hold the chord
    for (const n of chord) add(pad, I.strings(m(n) - 12, BAR, { attack: 0.5, release: 0.6, bright: 0.6 }), t0, 0.03);
}

// --- SOUND EFFECTS: CC0 recordings (sfxlib/cc0, licences in MANIFEST.tsv), cut tight into sfx/cut.
// Rule: one sound per thing you SEE, landing on the frame it happens. Nothing ambient that isn't on screen.
const CUT = path.join(__dirname, 'sfx', 'cut');
const one = (file, at, gain) => { try { const b = MIX.loadAudio(file, { at, gain, length: DURATION }); fx.addStereo(b.L, b.R, 0, 1); } catch (e) { console.warn('missing sfx', file); } };
const X = (n, at, g) => one(path.join(CUT, n + '.wav'), at, g);
const LIB = fs.existsSync(path.join(__dirname, 'sfxlib')) ? path.join(__dirname, 'sfxlib') : '/root/.claude/skills/media-use/audio/assets/sfx';
const P_ = (n, at, g) => one(path.join(LIB, n + '.mp3'), at, g);

X('siren', 0, 0.22);                                                        // the alarm while the rockets fly
X('wind', 0, 0.14); X('wind', 11.5, 0.1);                                // outside, before we go down
X('whine_boom', ev.missiles + 0.3, 0.35);                                  // rockets over the hill
X('big_boom', ev.shrapnel - 0.75, 0.5); X('tunnel_rumble', ev.shrapnel - 0.6, 0.3); // the far strike, its shock front rolling in
X('big_boom', ev.shrapnel - 0.05, 0.55); X('hut_collapse', ev.shrapnel + 0.1, 0.5); // the hut is torn apart
X('swish', ev.dig - 0.25, 0.3);                                            // into the time-lapse
for (let i = 0; i < 5; i++) { X('shovel', ev.dig + i * 0.95 + 0.1, 0.3); X('dirt_fall', ev.dig + i * 0.95 + 0.6, 0.22); }  // each bucket: bite, dump
X('tunnel_rumble', ev.dig, 0.12); X('tunnel_rumble', ev.dig + 3, 0.12);     // the machine's engine
for (const a of [0, 1.1, 2.2]) X('water', ev.dig + 4.9 + a, 0.16);         // three wall pours
X('water', ev.ceiling + 0.2, 0.18); X('water', ev.ceiling + 1.4, 0.18);    // the slab poured
X('big_boom', ev.hit - 0.03, 0.5); X('dirt_fall', ev.hit + 0.2, 0.4);      // a direct hit on the roof
X('swish', ev.soil - 0.3, 0.25);
for (let i = 0; i < 5; i++) X('dirt_fall', ev.soil + 0.7 + i * 0.95, 0.3);   // each load dumped on the roof
X('door_rattle', ev.doorNeed + 1.5, 0.35);                                 // the plain door shakes
X('far_boom', ev.blowDoor - 0.05, 0.55); X('metal_crash', ev.blowDoor + 0.15, 0.4); // and blows out
X('swish', ev.riser - 0.15, 0.3); X('tunnel_rumble', ev.riser + 0.2, 0.25);  // the shaft rises
X('stone_drop', ev.seat, 0.45);                                            // it seats
X('squeak', ev.door + 0.2, 0.35); X('big_latch', ev.door + 1.4, 0.5);       // the steel hatch
X('latch', ev.lock, 0.5); X('latch', ev.lock + 0.5, 0.5); X('latch', ev.lock + 1.0, 0.55); // three bolts
X('big_latch', ev.sealed, 0.6);                                            // shut
X('swish', ev.pipe, 0.25);                                                 // the air pipe
X('far_boom', ev.blastIn, 0.4);                                            // a blast outside
X('metal_crash', ev.filter + 0.5, 0.45);                                   // the valve slams
X('big_boom', ev.collapse - 0.03, 0.6); X('house_collapse', ev.collapse + 0.15, 0.55); // the house comes down
X('shovel', ev.tunnel + 0.3, 0.35); X('tunnel_rumble', ev.tunnel + 2.0, 0.2); // the tunnel
X('latch', ev.exit2 + 0.6, 0.5);                                           // the far lid opens
X('rain', ev.rain, 0.35);                                                  // rain on the mound
X('water', ev.sump - 0.4, 0.3);                                            // water into the sump
X('jackhammer', ev.pump, 0.08);                                            // the pump hums (very low)

// --- the counting numbers on screen: ticks while counting, a chime when it lands ---
for (const [t0, dur] of [[ev.dig + 1.1, 1.5], [ev.ceiling + 0.8, 1.4], [ev.soil + 1.0, 1.3], [ev.door + 1.5, 1.4], [ev.lock + 0.4, 0.9]]) {
  const n = Math.round(dur / 0.11);
  for (let i = 0; i < n; i++) P_('click-soft', t0 + i * (dur / n), 0.07);
  P_('chime', t0 + dur + 0.02, 0.16);
}

// --- the narration ---
// No narration for now (Levi, 24.11): sound only. The voice is decided later, so the music and
// effects carry the film and are no longer ducked. VO=1 brings the narration back.
const WITH_VO = process.env.VO === '1';
const voice = WITH_VO ? MIX.loadAudio(path.join(__dirname, 'out', 'vo.wav'), { at: 0, gain: 1, length: DURATION }) : null;
if (voice) MIX.duck([pad, bass, drums, fx], voice, { depth: 0.78, attack: 0.02, release: 0.40, threshold: 0.02 });

const stems = { ...(voice ? { voice } : {}), drums, bass, pad, fx, verb: reverb(verb, { room: 0.8, damp: 0.35 }) };
const GAIN = { voice: 1.05, drums: 0.5, bass: WITH_VO ? 0.34 : 0.36, pad: WITH_VO ? 0.85 : 0.72, fx: WITH_VO ? 0.4 : 0.85, verb: 0.7 };
const out = path.join(__dirname, 'out');
const mix = MIX.mixdown(stems, GAIN, { stemDir: process.env.STEMS ? out : null });
MIX.highpass(mix, 24);
MIX.fadeOut(mix, DURATION - 1.2, DURATION);
const M = MIX.master(mix, parseFloat(process.env.DRIVE || '0.4'), undefined, { lufs: process.env.LUFS ? parseFloat(process.env.LUFS) : -16 });
MIX.writeWav(path.join(out, 'music.wav'), mix);
console.log(`wrote out/music.wav (${DURATION.toFixed(2)}s${M.lufs !== undefined ? `, ${M.lufs.toFixed(1)} LUFS` : ''})`);
