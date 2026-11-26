// THE SCORE — single source of truth. Every timing comes from the recorded narration
// (vo.json, written by the voice build), so picture and voice cannot drift apart.
(function () {
  const node = typeof require !== 'undefined';
  const U = node ? require('./engine/util') : globalThis.U;
  const MU = node ? require('./engine/music') : globalThis.MUSIC;
  const { m, makeClock } = MU;
  const VO = node ? require('./vo.json') : globalThis.VO;
  const EV = node ? require('./ev.json') : globalThis.EV;   // event times, derived from the spoken words

  const FPS = 60;   // 60 keeps constant camera motion smooth
  const FORMAT = U.pickFormat('9:16');
  const [W, H] = U.formatSize(FORMAT);
  const SAFE = U.safeArea(W, H);
  const clock = makeClock({ bpm: 100, offset: 0 });
  const { T, BEAT } = clock;
  const DURATION = Math.ceil(VO.duration + 1.3);

  const L = VO.lines.map((l) => l.t); // start time of every spoken line

  // Each build step is pinned to the word that describes it (see retime.py).
  const ev = Object.assign({}, EV);
  ev.co2 = Math.min(ev.co2, ev.pipe - 1.0);

  const markers = {
    shrapnel: { t: ev.shrapnel, sync: 'av' },
    hit: { t: ev.hit, sync: 'av' },
    soil: ev.soil,
    door: ev.door,
    sealed: ev.sealed,
    pipe: ev.pipe,
    filter: ev.filter,
    collapse: { t: ev.collapse, sync: 'av' },
    exit2: ev.exit2,
    done: ev.done,
  };

  // captions are the narration, word for word
  const captions = VO.lines.map((l, i) => ({
    t: l.t, end: (VO.lines[i + 1] ? VO.lines[i + 1].t : l.end + 0.6) - 0.04, text: l.text,
  }));

  const SCORE = { FPS, FORMAT, W, H, SAFE, DURATION, clock, T, BEAT, S: {}, m, ev, markers, captions, VO, L };
  if (node) module.exports = SCORE; else globalThis.SCORE = SCORE;
})();
