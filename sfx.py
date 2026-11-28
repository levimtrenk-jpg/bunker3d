# Sound effects for the whole elevator short, synthesized, timed from out/ev.json (written by score.js).
import json, numpy as np
from scipy import signal
from scipy.io import wavfile
J = json.load(open('out/ev.json')); E = J['ev']; D = J['duration']
SR = 48000; N = int(SR * D); t = np.arange(N) / SR
rng = np.random.default_rng(7)
def noise(): return rng.standard_normal(N)
def bp(x, lo, hi, o=2): return signal.sosfilt(signal.butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def hp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, 'high', fs=SR, output='sos'), x)
def lp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, 'low', fs=SR, output='sos'), x)
def env(t0, a=0.002, d=0.3):
    x = np.zeros(N); i0 = int(t0 * SR); m = min(int((a + d * 6) * SR), N - i0)
    if m <= 0: return x
    tt = np.arange(m) / SR; x[i0:i0 + m] = np.minimum(1, tt / max(a, 1e-4)) * np.exp(-tt / d); return x
def seg(a, b): return ((t >= a) & (t < b)).astype(float)
def ramp(a, b, v0, v1): return np.clip((t - a) / (b - a), 0, 1) * (v1 - v0) + v0
def tone(fn): return np.sin(2 * np.pi * np.cumsum(fn) / SR)
def boom(t0, f0=70, f1=28, d=0.3, g=0.9): return tone(f0 * np.exp(-(t - t0).clip(0) * 5) + f1) * env(t0, 0.001, d) * g
def tick(t0, f=3000, d=0.008, g=0.3): return hp(noise(), f) * env(t0, 0.0005, d) * g
def sweepnoise(a, b, f0, f1, g):
    out = np.zeros(N); blk = 4800; win = np.hanning(blk * 2); src = noise()
    for k in range(int(a * SR), min(int(b * SR), N - blk * 2), blk // 2):
        u = (k / SR - a) / max(1e-3, b - a); c = f0 + (f1 - f0) * u
        x = bp(src[k:k + blk * 2], max(80, c * 0.5), min(20000, c * 1.5), 2) * win; out[k:k + blk * 2] += x
    return out * g
L = np.zeros(N)
# --- room tone (power on) / emergency silence (power off) ---
pw = np.ones(N)
for a, b in [(E['cut'], E['p3']), (E['cut2'], E['p5'])]: pw *= 1 - seg(a, b)
hum = tone(np.full(N, 100.0)) * 0.03 + tone(np.full(N, 200.0)) * 0.012
L += (hum + lp(hp(noise(), 90), 900) * 0.035) * lp(pw, 30)
L += lp(noise(), 200) * 0.02                                     # shaft air, always
# --- part 1 ---
for c in [E['cut'], E['cut2']]:
    L += boom(c) + tick(c, 1500, 0.012, 0.8) + bp(noise(), 900, 7000) * env(c, 0.001, 0.07) * 0.4
    L += tick(c + 0.05, 2500, 0.006, 0.3) + tick(c + 0.12, 2500, 0.006, 0.25)
f0, fz = E['fall'], E['freeze']
L += hp(noise(), 2800) * env(f0, 0.001, 0.05) * 0.5
L += sweepnoise(f0, fz, 300, 2400, 0.5) * ramp(f0, fz, 0.2, 1.0)
L += lp(noise(), 300) * seg(f0, fz) * ramp(f0, fz, 0.1, 0.35)
for tp in E['passes']: L += bp(noise(), 400, 2500) * env(tp, 0.04, 0.22) * 0.45
L *= np.where((t >= fz) & (t < E['thaw']), 0.03, 1.0)
L += tone(np.full(N, 55.0)) * env(fz, 0.001, 0.3) * 0.7 + tone(np.full(N, 3100.0)) * seg(fz, fz + 0.5) * np.exp(-(t - fz).clip(0) * 5) * 0.06
th, re = E['thaw'], E['rewEnd']
L += sweepnoise(th, re, 2400, 300, 0.7) + tone(180 + 2600 * np.clip((t - th) / (re - th), 0, 1) ** 2) * seg(th, re) * 0.06
L += boom(re, 60, 30, 0.2, 0.5)
for i in range(6): L += (np.sin(2 * np.pi * 1100 * 1.12 ** i * t) * 0.6) * env(E['ropes'] + 1.1 + i * 0.13, 0.0008, 0.3) * 0.15
L += tone(np.full(N, 70.0)) * env(E['cw'] + 3.6, 0.3, 1.2) * 0.25                            # the counterweight: a low weight
L += sweepnoise(E['cw'] + 0.5, E['cw'] + 3.5, 1800, 400, 0.15)                              # camera drop over the wheel
# --- part 2: the tear, slow motion ---
sn = E['snap']
L *= np.where((t > sn - 0.08) & (t < sn), 0.0, 1.0)
L += hp(noise(), 600) * env(sn, 0.0003, 0.03) * 1.0 + boom(sn, 50, 30, 0.8, 1.0)
for i in range(6): L += tone(np.full(N, 240.0 + i * 45)) * env(sn + 0.012 * i, 0.0005, 0.3) * 0.2
slow = seg(sn + 0.1, E['stop'] + 0.3)
L += lp(noise(), 120) * slow * 0.25 + tone(np.full(N, 41.0)) * slow * 0.12                     # slow-motion drone
L += sweepnoise(E['plunge'], E['plunge'] + 1.6, 3000, 600, 0.5)                               # the camera dive
gr = seg(E['govClose'], E['trip'])                                                            # governor whir, rising
L += tone(300 + 900 * np.clip((t - E['govClose']) / (E['trip'] - E['govClose']), 0, 1)) * gr * 0.05 + bp(noise(), 1500, 4000) * gr * 0.03
L += tick(E['trip'], 2000, 0.02, 0.9) + boom(E['trip'], 200, 80, 0.08, 0.4)                    # the pawl
L += boom(E['link'] + 0.1, 120, 50, 0.12, 0.5) + tick(E['link'] + 0.1, 1200, 0.03, 0.5)        # lever clunk
cl = seg(E['clamp'], E['stop'])                                                               # wedges screech on the rails
scr = bp(noise(), 2500, 6000) * (0.6 + 0.4 * np.sin(2 * np.pi * 37 * t)) + tone(np.full(N, 2900.0)) * 0.3
L += scr * cl * ramp(E['clamp'], E['stop'], 0.55, 0.2) + boom(E['clamp'], 150, 60, 0.15, 0.6)
L += boom(E['stop'], 80, 35, 0.35, 0.8) + tick(E['stop'], 800, 0.05, 0.5)
L += boom(E['stop'] + 0.6, 60, 30, 0.15, 0.35)                                                # he lands on the floor
# --- part 3: running into the pit ---
p3, ct = E['p3'], E['contact']
L += sweepnoise(p3 - 0.15, p3 + 0.2, 4000, 800, 0.4)
L += (tone(np.full(N, 120.0)) * 0.04 + lp(noise(), 500) * 0.06) * seg(p3, ct)                  # car running
L += boom(ct, 90, 40, 0.4, 0.9) + bp(noise(), 300, 2500) * env(ct + 0.05, 0.05, 0.6) * 0.35       # thud + oil hiss
# --- part 4: brake ---
L += sweepnoise(E['p4'] - 0.15, E['p4'] + 0.2, 4000, 800, 0.35)
L += tone(np.full(N, 50.0)) * seg(E['brakeShot'], E['cut2']) * 0.05                            # the coil hums while powered
c2 = E['cut2']; L += tick(c2 + 0.04, 900, 0.04, 0.9) + boom(c2 + 0.05, 260, 90, 0.1, 0.6)       # spring clank
L += sweepnoise(E['p4pull'], E['p4pull'] + 3.2, 500, 1800, 0.12)
# --- part 5 ---
L += sweepnoise(E['p5'] - 0.2, E['p5'] + 1.0, 3000, 300, 0.3)
for k in range(28): L += tick(E['p5'] + 0.3 + k * 0.09, 4000, 0.004, 0.06)                     # counter ticks
L += boom(E['techs'] + 0.25, 60, 35, 0.4, 0.6)
L += sweepnoise(E['carbon'] - 0.1, E['carbon'] + 0.6, 2500, 600, 0.3)
L += tone(np.full(N, 660.0)) * env(E['carbon'] + 1.0, 0.2, 0.8) * 0.06
# --- part 6 ---
L += sweepnoise(E['p6'] - 0.15, E['p6'] + 0.2, 4000, 800, 0.3)
dg = E['doors'] - 0.4
L += (np.sin(2 * np.pi * 1318 * t) * 0.6 + np.sin(2 * np.pi * 2636 * t) * 0.15) * env(dg, 0.002, 0.5) * 0.25   # ding
L += bp(noise(), 300, 2000) * seg(E['doors'], E['doors'] + 1.4) * 0.08 + tick(E['doors'] + 1.4, 600, 0.03, 0.3)
L += lp(noise(), 1500) * seg(E['doors'], D) * ramp(E['doors'], E['doors'] + 1.2, 0, 0.06)      # hallway air
# master
L = np.tanh(L * 0.9)
L[:int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR)); L[-int(0.5 * SR):] *= np.linspace(1, 0, int(0.5 * SR))
L *= (10 ** (-2.5 / 20)) / np.abs(L).max()
st = np.stack([L, np.roll(L, int(0.0004 * SR)) * 0.97], 1)
wavfile.write('out/music.wav', SR, (st * 32767).astype(np.int16))
print('wrote out/music.wav', D)
