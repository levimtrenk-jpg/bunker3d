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

// --- bed: one soft chord per chapter, keyed to the events so it can never drift ---
const CH = [
  [ev.missiles, ['D2', 'A2', 'D3'], 520],
  [ev.dig,      ['D2', 'F2', 'C3'], 620],
  [ev.soil,     ['Bb1', 'F2', 'D3'], 700],
  [ev.doorNeed, ['D2', 'A2', 'E3'], 560],
  [ev.sealed,   ['C2', 'G2', 'D3'], 460],   // sealed in: the air goes dull
  [ev.pipe,     ['F2', 'C3', 'A3'], 820],
  [ev.collapse, ['Bb1', 'F2', 'Bb2'], 640],
  [ev.done,     ['D2', 'A2', 'D3'], 1100],  // resolve
];
CH.forEach(([t0, ch, cutoff], i) => {
  const t1 = i + 1 < CH.length ? CH[i + 1][0] : DURATION;
  const dur = Math.max(1.5, t1 - t0 + 1.2);
  for (const n of ch) {
    const { L, R } = I.padNote(m(n), dur, { cutoff, attack: 1.1, release: 1.8 });
    pad.addStereo(L, R, t0, 0.055);
  }
});

// --- one low note per build step: the structure growing. No drum kit: it fought the voice ---
[[ev.dig, 'D1'], [ev.ceiling, 'F1'], [ev.soil, 'Bb0'], [ev.pipe, 'C1'], [ev.collapse, 'Bb0'], [ev.done, 'D1']]
  .forEach(([t, n]) => bass.addMono(I.bass(m(n), 2.4, { sub: 1 }), t, 0.3));

// --- event SFX: real recordings/renders, each tied to a score event -----------
// sfx/*.wav are rendered locally by sfxbrew (free for commercial use, no attribution);
// the mp3s come from the media-use library (Pixabay licence, commercial use allowed).
const SFXDIR = path.join(__dirname, 'sfx');
const LIB = fs.existsSync(path.join(__dirname, 'sfxlib')) ? path.join(__dirname, 'sfxlib')
          : '/root/.claude/skills/media-use/audio/assets/sfx';   // vendored, so CI has them too
const one = (file, at, gain) => { try { const b = MIX.loadAudio(file, { at, gain, length: DURATION }); fx.addStereo(b.L, b.R, 0, 1); } catch (e) { /* missing file: skip */ } };
const S_ = (n, at, g) => one(path.join(SFXDIR, n + '.wav'), at, g);
const P_ = (n, at, g) => one(path.join(LIB, n + '.mp3'), at, g);

for (let i = 0; i < 3; i++) S_('whoosh', ev.missiles + 0.4 + i * 1.7, 0.30);      // rockets passing overhead
S_('explosion', ev.shrapnel, 0.55); P_('impact-bass-1', ev.shrapnel + 0.02, 0.45); // the hut goes
for (let i = 0; i < 7; i++) S_('footstepStone', ev.dig + 0.5 + i * 0.9, 0.22);     // digging
S_('land', ev.ceiling + 0.15, 0.5); P_('impact-bass-2', ev.ceiling + 0.2, 0.32);   // the slab lands
S_('explosion', ev.hit, 0.42); S_('hit', ev.hit + 0.06, 0.4);                      // a direct hit
for (let i = 0; i < 5; i++) S_('land', ev.soil + i * 0.6, 0.3);                    // earth going on
S_('swordClash', ev.door + 0.6, 0.35);                                             // the steel door
P_('whoosh-cinematic', ev.sealed - 0.2, 0.28);                                     // sealed in
P_('whoosh', ev.pipe + 0.2, 0.3);                                                  // the pipe opens
S_('hit', ev.filter + 0.5, 0.45);                                                  // the valve slams
S_('explosion', ev.collapse, 0.5); P_('impact-bass-1', ev.collapse + 0.03, 0.42);  // the house comes down
for (let i = 0; i < 5; i++) S_('footstepStone', ev.exit2 + 0.4 + i * 0.8, 0.22);   // digging out
P_('riser', ev.done - 1.6, 0.18);                                                  // into the last line

// --- the counting numbers on screen: a riser, ticks, and a chime on landing ---
for (const [t0, dur] of [[ev.dig + 1.1, 1.5], [ev.ceiling + 0.8, 1.4], [ev.soil + 1.0, 1.3], [ev.door + 1.5, 1.4], [ev.lock + 0.4, 0.9]]) {
  P_('riser', t0 - 0.15, 0.22);                                                    // the scale-up under the count
  const n = Math.round(dur / 0.11);
  for (let i = 0; i < n; i++) P_('click-soft', t0 + i * (dur / n), 0.1);           // the digits ticking
  P_('chime', t0 + dur + 0.02, 0.2);                                               // it lands
}
{                                                                                   // outdoor wind bed, fading as we go underground
  for (let t0 = 0; t0 < ev.sealed; t0 += 4.6) S_('wind', t0, 0.1 * (1 - t0 / Math.max(1, ev.sealed)));
}

// --- the narration ---
const voice = MIX.loadAudio(path.join(__dirname, 'out', 'vo.wav'), { at: 0, gain: 1, length: DURATION });

// duck everything under the voice so the words always win
MIX.duck([pad, bass, drums, fx], voice, { depth: 0.78, attack: 0.02, release: 0.40, threshold: 0.02 });

const stems = { voice, drums, bass, pad, fx, verb: reverb(verb, { room: 0.8, damp: 0.35 }) };
const GAIN = { voice: 1.05, drums: 0, bass: 0.34, pad: 0.85, fx: 0.4, verb: 0.7 };
const out = path.join(__dirname, 'out');
const mix = MIX.mixdown(stems, GAIN, { stemDir: process.env.STEMS ? out : null });
MIX.highpass(mix, 24);
MIX.fadeOut(mix, DURATION - 1.2, DURATION);
const M = MIX.master(mix, parseFloat(process.env.DRIVE || '0.4'), undefined, { lufs: process.env.LUFS ? parseFloat(process.env.LUFS) : -16 });
MIX.writeWav(path.join(out, 'music.wav'), mix);
console.log(`wrote out/music.wav (${DURATION.toFixed(2)}s${M.lufs !== undefined ? `, ${M.lufs.toFixed(1)} LUFS` : ''})`);
