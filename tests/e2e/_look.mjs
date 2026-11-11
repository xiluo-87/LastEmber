import { harness, open, sleep } from './lib.mjs';
const { base, browser, finish } = await harness('look');
for (const v of ['portrait','landscape','desktop']) {
  const P = await open(browser, v, base + 'index.html?seed=7' + (v!=='desktop'?'&touch=1':''), { newGame:false });
  await P.shot(`look-${v}-title.png`);
  await P.page.click('#btn-new'); await sleep(600);
  await P.shot(`look-${v}-start.png`);
  console.log(v, P.errors);
}
await finish();
