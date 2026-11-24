# "הסרטון המאושר" (Levi, 24.11) - the state to return to when he says "תחזור לסרטון המאושר"

Everything is done except the narration. Only the voice is missing; the film is silent of speech.

- Code: git tag `approved-v1` (this commit).
- Picture + sound artifact: GitHub run 45420384903, artifact `bunker3d-sound` (kept 14 days - after that re-render from the tag: render.yml, 20 segments, ~12-25 min).
- Picture source run: 45311803468 (artifact `bunker3d`).
- Soundtrack: no music, 3-tier foley, no loops, -27 LUFS without voice.
- Narration: Levi records it himself from the 13-paragraph script (vo.json). Convert his recording to voice 3
  (he-IL-AvriNeural +24% +7Hz + warm chain, see docs/VOICE.md), retime with retime.py (ASR on his file), then
  run song.js with VO=1 and render/remix.
Next step in this state: wait for his recording.
