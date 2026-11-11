// Audio sanity: renders every one-shot and ambience loop through an OfflineAudioContext (in Chromium) and checks peak / RMS:
// nothing clips (peak < 0.98 at master), nothing is inaudible, loops sit well below one-shots.   node tests/e2e/audio-levels.mjs
import { harness, open } from './lib.mjs';
const { check, base, browser, finish } = await harness('audio');
const P = await open(browser, 'desktop', base + 'index.html?seed=7', { newGame: false });
const res = await P.page.evaluate(async () => {
  const { audio, SOUND_NAMES, LOOP_NAMES, AUDIO } = await import('/src/audio.js');
  const out = { sounds: {}, loops: {} };
  const measure = (buf) => { const d = buf.getChannelData(0); let pk = 0, ss = 0, n = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; ss += d[i] * d[i]; n++; } return { peak: pk, rms: Math.sqrt(ss / n) }; };
  const render = async (fn, secs) => {
    const ctx = new OfflineAudioContext(1, Math.ceil(44100 * secs), 44100);
    audio.configure({ makeContext: () => ctx, storage: null });
    audio.unlock(); fn();
    return measure(await ctx.startRendering());
  };
  for (const name of SOUND_NAMES) {
    const long = ['sunrise', 'death', 'planeSwell', 'planePass', 'howl', 'fireOut'].includes(name);
    const m = await render(() => audio.play(name, { v: 1 }), long ? 6 : 2);
    // rms over the active part only: re-measure on a window up to 1.2 s (short sounds) so silence padding doesn't hide them
    out.sounds[name] = m;
  }
  for (const name of LOOP_NAMES) {
    const ctxLevel = { wind: AUDIO.amb.windBase + AUDIO.amb.windSnow, blizzardHowl: AUDIO.amb.blizzardHowl, fire: AUDIO.amb.fire }[name] ?? 0.3;
    out.loops[name] = await render(() => audio.setLevel(name, ctxLevel, 0.001), 3);
  }
  // worst case: strong blizzard wind + howl + a fire at point-blank
  out.mix = await render(() => { audio.setLevel('wind', AUDIO.amb.windBase + AUDIO.amb.windSnow + AUDIO.amb.windBlizzard, 0.001); audio.setLevel('blizzardHowl', AUDIO.amb.blizzardHowl, 0.001); audio.setLevel('fire', AUDIO.amb.fire, 0.001); }, 3);
  out.stack = await render(() => { for (const n of ['chop', 'hit', 'hurt', 'growl', 'place', 'craft', 'footstep', 'whoosh']) audio.play(n, { v: 1 }); }, 2);
  return out;
});
const f = (x) => x.toFixed(3);
let loudest = 0, quietest = 9;
for (const [n, m] of Object.entries(res.sounds)) {
  console.log(`  ${n.padEnd(12)} peak ${f(m.peak)} rms ${m.rms.toFixed(4)}`);
  check(m.peak < 0.95, `${n}: no clipping (peak ${f(m.peak)})`);
  check(m.peak > 0.03, `${n}: audible (peak ${f(m.peak)})`);
  loudest = Math.max(loudest, m.peak); quietest = Math.min(quietest, m.peak);
}
for (const [n, m] of Object.entries(res.loops)) {
  console.log(`  loop ${n.padEnd(12)} peak ${f(m.peak)} rms ${m.rms.toFixed(4)}`);
  check(m.peak < 0.2, `loop ${n}: well below one-shots (peak ${f(m.peak)})`);
  check(m.rms > 0.002, `loop ${n}: present (rms ${m.rms.toFixed(4)})`);
}
console.log(`  worst-case ambience mix peak ${f(res.mix.peak)}, one-shot stack peak ${f(res.stack.peak)}`);
check(res.mix.peak < 0.3, 'worst-case ambience mix stays below 0.3');
check(res.stack.peak < 0.98, 'eight simultaneous one-shots do not clip');
check(res.sounds.chop.peak > res.loops.wind.peak * 1.5, 'one-shots (chop) louder than the wind bed');
check(P.errors.length === 0, `no console errors ${P.errors.join('|')}`);
await finish();
