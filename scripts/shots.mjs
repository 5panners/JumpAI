// Renders a screenshot tour of Bloomvale's landmarks into ./screenshots.
// Usage: npm run build && node scripts/shots.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 4183;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res) => server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) res(); }));
mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:${PORT}/?players=2`);
await page.waitForFunction(() => window.__jumpai, null, { timeout: 90000 });

const views = {
  overview: [[0, 70, 120], [0, 0, -10]],
  heroes: [[3, 4.2, 69], [0, 2, 62]],
  falls: [[-36, 6, 40], [-45, 3, 8]],
  summit: [[30, 22, -20], [55, 20, -44]],
  windmill: [[-48, 8, -44], [-62, 7, -60]],
  arena: [[-22, 12, -12], [-22, 2, -38]],
  tulips: [[18, 7, 28], [4, 6, 10]],
  sky: [[0, 6, 40], [-40, 60, -400]],
};
const only = process.argv[2];
for (const [name, [pos, look]] of Object.entries(views)) {
  if (only && name !== only) continue;
  await page.evaluate(([pos, look, name]) => {
    const g = window.__jumpai;
    const V = (a) => g.level.spawnPoint.clone().set(a[0], a[1], a[2]);
    g.debugCam = { pos: V(pos), look: V(look) };
    if (name === 'heroes') {
      g.players[0].spawn(V([0, g.physics.terrain(0, 63), 63]), 0.4);
      g.players[1].spawn(V([1.6, g.physics.terrain(1.6, 63.5), 63.5]), -0.3);
    }
    document.querySelector('.message').classList.remove('show');
  }, [pos, look, name]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `screenshots/${name}.png` });
  console.log('saved', name);
}
await browser.close();
server.kill();
process.exit(0);
