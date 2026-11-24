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

// --- NO MUSIC (Levi, 24.11): the Zack D Films way - voice on top, a quiet room tone under it,
// and close, real foley only on what the eye is following. Three loudness tiers:
//   HERO (0.55-0.7)  the four story beats: far strike + hut, direct hit, door blown, house collapse
//   ACTION (0.2-0.35) things you watch being done: bucket bites, pours, hatch, bolts
//   BED (0.03-0.1)   wind outside, engines while they work, room tone inside - felt, not noticed
// Cut on purpose: counter ticks/chimes, whooshes on camera moves, anything not on screen.
const CUT = path.join(__dirname, 'sfx', 'cut');
const one = (file, at, gain) => { try { const b = MIX.loadAudio(file, { at, gain, length: DURATION }); fx.addStereo(b.L, b.R, 0, 1); } catch (e) { console.warn('missing sfx', file); } };
const X = (n, at, g) => one(path.join(CUT, n + '.wav'), at, g);
const TLc = 0.95;                                                          // one bucket cycle (matches film.js)

// BED
X('siren', 0, 0.1);                                                        // far-off alarm, under everything
X('wind', 0, 0.07); X('wind', 11.5, 0.05); X('wind', ev.soil, 0.05);
X('room', ev.doorNeed - 0.5, 0.05); X('room', ev.doorNeed + 39, 0.05); X('room', ev.doorNeed + 78, 0.05);   // inside: air, not silence
X('diesel', ev.dig - 0.9, 0.08);                                           // the excavator drives in and works
X('diesel', ev.soil - 0.4, 0.07);
X('truck', ev.dig + 4.0, 0.07); X('truck', ev.ceiling - 0.3, 0.06);        // the mixer rolls in

// HERO
X('whine_boom', ev.missiles + 0.3, 0.3);                                   // rockets over the hill
X('big_boom', ev.shrapnel - 0.75, 0.6); X('tunnel_rumble', ev.shrapnel - 0.55, 0.25); // the far strike, the front rolling in
X('hut_collapse', ev.shrapnel + 0.05, 0.6);                                // the hut torn apart
X('big_boom', ev.hit - 0.03, 0.62); X('dirt_fall', ev.hit + 0.2, 0.3);     // the direct hit
X('far_boom', ev.blowDoor - 0.05, 0.6); X('metal_crash', ev.blowDoor + 0.15, 0.35); // the door blown in
X('big_boom', ev.blastIn, 0.4);                                            // a blast outside the sealed bunker
X('big_boom', ev.collapse - 0.03, 0.62); X('house_collapse', ev.collapse + 0.15, 0.5); // the house comes down

// ACTION
for (let i = 0; i < 5; i++) X('shovel', ev.dig + i * TLc + 0.15, 0.22);    // each bucket bite
for (let i = 0; i < 5; i++) X('dirt_fall', ev.dig + i * TLc + 0.62, 0.16); // each dump on the spoil heap
for (const a of [0, 1.1, 2.2]) X('water', ev.dig + 5 * TLc + 0.15 + a, 0.12); // three wall pours
X('water', ev.ceiling + 0.2, 0.13); X('water', ev.ceiling + 1.4, 0.13);    // the slab, two passes
for (let i = 0; i < 5; i++) X('dirt_fall', ev.soil + 0.1 + i * TLc + 0.6, 0.2); // earth onto the roof
X('door_rattle', ev.doorNeed + 1.5, 0.2);                                  // the plain door shakes
X('stone_drop', ev.seat, 0.3);                                             // the shaft seats
X('squeak', ev.door + 0.2, 0.2); X('big_latch', ev.door + 1.4, 0.32);      // the steel hatch
X('latch', ev.lock, 0.3); X('latch', ev.lock + 0.5, 0.3); X('latch', ev.lock + 1.0, 0.34); // three bolts
X('big_latch', ev.sealed, 0.4);                                            // shut in
X('metal_crash', ev.filter + 0.5, 0.3);                                    // the valve slams
X('shovel', ev.tunnel + 0.3, 0.2);                                         // the tunnel
X('latch', ev.exit2 + 0.6, 0.3);                                           // the far lid
X('rain', ev.rain, 0.2);                                                   // rain on the mound
X('water', ev.sump - 0.4, 0.16);                                           // water into the sump

// --- the narration ---
// No narration for now (Levi, 24.11): sound only. The voice is decided later, so the music and
// effects carry the film and are no longer ducked. VO=1 brings the narration back.
const WITH_VO = process.env.VO === '1';
const voice = WITH_VO ? MIX.loadAudio(path.join(__dirname, 'out', 'vo.wav'), { at: 0, gain: 1, length: DURATION }) : null;
if (voice) MIX.duck([pad, bass, drums, fx], voice, { depth: 0.78, attack: 0.02, release: 0.40, threshold: 0.02 });

const stems = { ...(voice ? { voice } : {}), fx, verb: reverb(verb, { room: 0.8, damp: 0.35 }) };
const GAIN = { voice: 1.05, drums: 0.5, bass: WITH_VO ? 0.34 : 0.36, pad: WITH_VO ? 0.85 : 0.72, fx: WITH_VO ? 0.4 : 0.85, verb: 0.7 };
const out = path.join(__dirname, 'out');
const mix = MIX.mixdown(stems, GAIN, { stemDir: process.env.STEMS ? out : null });
MIX.highpass(mix, 24);
MIX.fadeOut(mix, DURATION - 1.2, DURATION);
const M = MIX.master(mix, parseFloat(process.env.DRIVE || '0.4'), undefined, { lufs: process.env.LUFS ? parseFloat(process.env.LUFS) : -16 });
MIX.writeWav(path.join(out, 'music.wav'), mix);
console.log(`wrote out/music.wav (${DURATION.toFixed(2)}s${M.lufs !== undefined ? `, ${M.lufs.toFixed(1)} LUFS` : ''})`);
