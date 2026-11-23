import json
W = json.load(open('/root/vo8/words.json'))          # [start, end, word] over the final mix
TEXT = ["יורים עליך טילים, אז אתה בונה בקתה מעץ.",
        "אבל עץ קורס כבר מההדף חלש, אז אתה חופר בור ויוצק בטון.",
        "רק שרסיס קולף את הבטון מבפנים, אז אתה מכסה אותו בשכבה של אדמה.",
        "עכשיו הכניסה: דלת שנפתחת החוצה, כדי שההדף יסגור אותה, מאחורי פנייה בזווית ישרה.",
        "אבל הפחמן הדו-חמצני שאתה נושף מצטבר, אז אתה מוציא צינור אוויר.",
        "הצינור הוא פתח להדף, אז אתה מרכיב שסתום שנסגר תוך חלקיק שנייה.",
        "ואם הכניסה נחסמת, אז אתה צריך יציאת חירום.",
        "ככה גדל מקלט."]
STARTS = ['יורים', 'אבל', 'רק', 'עכשיו', 'אבל', 'הצינור', 'הכניסה', 'ככה']   # first word of each line
def find(word, frm):                                   # index of the next word containing `word`
    for i in range(frm, len(W)):
        if word in W[i][2]: return i
    return frm
idx, cur = [], 0
for k, s in enumerate(STARTS):
    if k == 0: idx.append(0); cur = 1; continue
    if k == 6: cur = find('נחסמת', cur) - 1            # "ואם הכניסה" — anchor on the next word
    j = find(s, cur); idx.append(j); cur = j + 1
lines = []
for k, i in enumerate(idx):
    end = W[idx[k + 1] - 1][1] if k + 1 < len(idx) else W[-1][1]
    lines.append({'i': k, 't': round(W[i][0], 3), 'end': round(end, 3), 'text': TEXT[k]})
def at(line, *keys):                                   # time of the first of `keys` inside that line
    a = idx[line]; b = idx[line + 1] if line + 1 < len(idx) else len(W)
    for i in range(a, b):
        if any(k in W[i][2] for k in keys): return round(W[i][0], 3)
    return lines[line]['t']
ev = {
  'missiles': 0.0,
  'hut':      at(0, 'בונה', 'פונה', 'בקת'),
  'shrapnel': at(1, 'קורס'),
  'dig':      at(1, 'חופר'),
  'ceiling':  at(1, 'ויוצ', 'בטון'),
  'hit':      at(2, 'רסיס'),
  'soil':     at(2, 'מכסה'),
  'doorNeed': lines[3]['t'],
  'door':     at(3, 'דלת'),
  'turn90':   at(3, 'פנייה', 'זווית'),
  'sealed':   lines[4]['t'],
  'co2':      at(4, 'מצטבר', 'נושף'),
  'pipe':     at(4, 'מוציא', 'צינור'),
  'blastIn':  at(5, 'פתח', 'להדף'),
  'filter':   at(5, 'מרכיב', 'שסתום'),
  'collapse': lines[6]['t'],
  'exit2':    at(6, 'צריך', 'יציאת'),
  'done':     lines[7]['t'],
}
for k in ('drop', 'smoke', 'bend', 'openTop', 'choke', 'mamad'): ev[k] = 9999
VO = {'duration': round(W[-1][1] + 0.5, 3), 'lines': lines}
json.dump(VO, open('vo.json', 'w'), ensure_ascii=False)
json.dump(ev, open('ev.json', 'w'), ensure_ascii=False, indent=1)
open('vo-data.js', 'w').write('globalThis.VO = ' + json.dumps(VO, ensure_ascii=False) + ';\n')
open('ev-data.js', 'w').write('globalThis.EV = ' + json.dumps(ev, ensure_ascii=False) + ';\n')
for l in lines: print(l['t'], l['end'], l['text'][:40])
print(json.dumps(ev, ensure_ascii=False))
