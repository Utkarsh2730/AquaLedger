"""
Generates the YouTube video's background music: a calm, original pad + arpeggio (no samples, so no
copyright claims). Usage: python3 scripts/youtube-music.py <seconds> <out.wav>
"""
import sys
import wave

import numpy as np

SR = 44100
seconds = float(sys.argv[1])
out = sys.argv[2]
n = int(SR * seconds)
t = np.arange(n) / SR


def hz(note):  # MIDI note -> frequency
    return 440.0 * 2 ** ((note - 69) / 12)


# I–vi–IV–V in C, voiced softly; 4 s per chord
CHORDS = [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62]]
BAR = 4.0
mix = np.zeros(n)

# pad: detuned sines with slow attack/release per chord
for start in np.arange(0, seconds, BAR):
    chord = CHORDS[int(start // BAR) % len(CHORDS)]
    a, b = int(start * SR), min(int((start + BAR + 1.0) * SR), n)
    seg = t[a:b] - start
    env = np.minimum(1, seg / 1.2) * np.clip((BAR + 1.0 - seg) / 1.5, 0, 1)
    for note in chord:
        f = hz(note)
        for detune in (-0.12, 0.12):
            mix[a:b] += 0.05 * env * np.sin(2 * np.pi * (f + detune) * seg)
    # bass root
    mix[a:b] += 0.06 * env * np.sin(2 * np.pi * hz(chord[0] - 12) * seg)

# arpeggio: soft plucks on eighth notes (one octave up), gentle decay
STEP = BAR / 8
for i, start in enumerate(np.arange(0, seconds, STEP)):
    chord = CHORDS[int(start // BAR) % len(CHORDS)]
    note = chord[[1, 2, 3, 4, 3, 2, 3, 1][i % 8]] + 12
    a, b = int(start * SR), min(int((start + 1.2) * SR), n)
    seg = t[a:b] - start
    env = np.exp(-seg * 4.5) * np.minimum(1, seg / 0.01)
    f = hz(note)
    mix[a:b] += 0.035 * env * (np.sin(2 * np.pi * f * seg) + 0.3 * np.sin(2 * np.pi * 2 * f * seg))

# soften: short smoothing filter (gentle low-pass), fade in/out, normalize to about -10 dBFS peak
kernel = np.hanning(15)
y = np.convolve(mix, kernel / kernel.sum(), mode="same")
fade = int(2.5 * SR)
y[:fade] *= np.linspace(0, 1, fade)
y[-fade:] *= np.linspace(1, 0, fade)
y = y / (np.max(np.abs(y)) + 1e-9) * 0.32

stereo = np.stack([y, np.roll(y, int(0.012 * SR))], axis=1)  # a touch of width
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((stereo * 32767).astype("<i2").tobytes())
print(f"wrote {out} ({seconds:.1f} s)")
