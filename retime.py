import sys, json, re, soundfile as sf, scipy.signal as sg
sys.path.insert(0, '/root/vo2/tools'); import humanize as H
SP = 1.06                                   # the final narration is sped up by this
VO = json.load(open('/root/vo14/vo.json'))
words = []                                  # (abs_time, word) on the pre-speed timeline
for l in VO['lines']:
    x, sr = sf.read(f"/root/vo14/lines/l{l['i']:02d}.wav", dtype='float32')
    x = x if x.ndim == 1 else x[:, 0]
    for s, e, w in H.words_of(sg.resample_poly(x, 16000, sr).astype('float32')):
        words.append((l['t'] + s, w, l['i']))
def at(line, *keys):                        # time of the first of `keys` inside `line`
    for t, w, i in words:
        if i == line and any(k in w for k in keys): return t
    return VO['lines'][line]['t']
L = [l['t'] for l in VO['lines']]
ev = {
  'missiles': L[0],
  'hut':      at(0, 'בקתה', 'מתחיל'),
  'shrapnel': at(1, 'עוזרת', 'מספיק'),
  'dig':      at(1, 'חופר'),
  'ceiling':  at(2, 'יוצק', 'תקרה'),
  'hit':      at(3, 'ישירה', 'חשוף'),
  'soil':     at(3, 'מכסה', 'אדמה'),
  'doorNeed': L[4],
  'riser':    at(5, 'בונה', 'צינור'),
  'door':     at(5, 'פלדה', 'מכסה'),
  'seat':     at(6, 'שקע', 'פקק'),
  'ladder':   at(7, 'סולם', 'מתקין'),
  'lock':     at(7, 'נועל', 'בריחים'),
  'sealed':   at(8, 'סוגר'),
  'co2':      at(8, 'נגמר', 'שעה'),
  'pipe':     at(8, 'מוציא', 'צינור'),
  'sleeve':   at(8, 'ויוצק', 'סביבו'),
  'blastIn':  at(9, 'חור'),
  'filter':   at(9, 'שסתום', 'מתקין'),
  'collapse': L[10],
  'tunnel':   at(10, 'מנהרה', 'חופר'),
  'exit2':    at(10, 'פיר', 'יציאה'),
  'rain':     L[11],
  'sump':     at(11, 'חופר', 'ניקוז'),
  'pump':     at(11, 'משאבה', 'ומתקין'),
  'comfort':  at(12, 'תוסיף', 'אור'),
  'done':     at(12, 'מקלט', 'עקרונות'),
}
ev = {k: round(v / SP, 3) for k, v in ev.items()}
ev['drop'] = ev['smoke'] = ev['bend'] = ev['openTop'] = ev['choke'] = ev['mamad'] = ev['turn90'] = 9999
VO['duration'] = round(VO['duration'] / SP, 3)
for l in VO['lines']:
    l['t'] = round(l['t'] / SP, 3); l['end'] = round(l['end'] / SP, 3)
    if 'words' in l:
        for w in l['words']: w['t'] = round(w['t'] / SP, 3)
json.dump(VO, open('vo.json', 'w'), ensure_ascii=False)
json.dump(ev, open('ev.json', 'w'), ensure_ascii=False, indent=1)
open('vo-data.js', 'w').write('globalThis.VO = ' + json.dumps(VO, ensure_ascii=False) + ';\n')
open('ev-data.js', 'w').write('globalThis.EV = ' + json.dumps(ev, ensure_ascii=False) + ';\n')
print(json.dumps(ev, ensure_ascii=False, indent=1)); print('duration', VO['duration'])
