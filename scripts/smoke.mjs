// Headless test run: boots the built game, checks the moveset, co-op moves and
// puzzles with deterministic simulated input, and saves screenshots.
// Usage: npm run build && npm run smoke   (screenshots go to ./screenshots)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 4179;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
server.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((res) => server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) res(); }));

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__jumpai, null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/title.png' });
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(500);

  // test helpers live in the page
  await page.evaluate(() => {
    const g = window.__jumpai;
    const V = (x, y, z) => g.level.spawnPoint.clone().set(x, y, z);
    window.T = {
      g,
      at(i, x, z, y) {
        const p = g.players[i];
        const gy = g.physics.groundBelow(x, z, 200, 0.3, 0).y;
        p.spawn(V(x, y ?? gy + 0.05, z), Math.PI);
        p.health = 6; p.invuln = 0;
        g.simulate(0.3, () => [{}, {}]);
      },
      // run a script; returns peak height gained and distance travelled
      run(i, secs, held) {
        const p = g.players[i];
        const y0 = p.pos.y, x0 = p.pos.x, z0 = p.pos.z;
        let peak = y0, kinds = new Set(), states = new Set();
        g.simulate(secs, (t) => { const r = [{}, {}]; r[i] = held(t); return r; }, () => {
          peak = Math.max(peak, p.pos.y);
          kinds.add(p.jumpKind); states.add(p.state);
        });
        return { rise: peak - y0, dist: Math.hypot(p.pos.x - x0, p.pos.z - z0), kinds: [...kinds], states: [...states], state: p.state, kind: p.jumpKind, y: p.pos.y };
      },
    };
    // enemies off for the mechanic checks (they get their own checks)
    g.enemies.forEach((e) => { e.alive = false; e.respawnT = 1e9; e.group.visible = false; });
    // park P2 out of the way
    T.at(1, 20, 70);
  });

  const r = (code) => page.evaluate(code);

  // --- moveset ---
  let o = await r(() => { T.at(0, 0, 60); return T.run(0, 1.0, () => ({ moveY: 1 })); });
  check(o.dist > 5.5 && o.dist < 9.5, `run: ${o.dist.toFixed(1)} m in 1 s (full speed 9 m/s after 0.6 s)`);

  o = await r(() => { T.at(0, 0, 60); return T.run(0, 1.2, (t) => ({ jump: t < 0.6 })); });
  check(Math.abs(o.rise - 1.8) < 0.2, `single jump peak ${o.rise.toFixed(2)} m (spec 1.8)`);

  o = await r(() => { T.at(0, 0, 60); return T.run(0, 1.2, (t) => ({ jump: t < 0.03 })); });
  check(o.rise < 1.3, `tapped jump is a short hop (${o.rise.toFixed(2)} m)`);

  o = await r(() => {
    T.at(0, 0, 66);
    // run up, then jump three times, re-pressing just as each landing happens
    const p = T.g.players[0];
    let phase = 0, jumps = 0, wasAir = false, maxRise = 0, kinds = [];
    let base = p.pos.y;
    const res = T.run(0, 4.5, (t) => {
      const air = !p.grounded;
      if (wasAir && !air) phase = 0;
      if (!wasAir && air) { jumps++; kinds.push(p.jumpKind); base = p.pos.y; }
      wasAir = air;
      phase += 1 / 120;
      const jump = t > 0.9 && !air && jumps < 3 ? phase > 0.02 : air;
      maxRise = Math.max(maxRise, p.pos.y - base);
      return { moveY: 1, jump };
    });
    return { kinds, maxRise, res };
  });
  check(o.kinds.join(',') === 'single,double,triple', `jump chain: ${o.kinds.join(' > ')}`);

  o = await r(() => { T.at(0, 0, 60); return T.run(0, 1.6, (t) => ({ crouch: t < 0.3, jump: t > 0.1 && t < 0.9 })); });
  check(o.kinds.includes('backflip') && Math.abs(o.rise - 3.8) < 0.3, `backflip peak ${o.rise.toFixed(2)} m (spec 3.8)`);

  o = await r(() => {
    T.at(0, 0, 66);
    const p = T.g.players[0];
    let start = null, end = null;
    T.run(0, 2.2, (t) => {
      if (p.jumpKind === 'long' && !start) start = p.pos.clone();
      if (start && !end && p.grounded && t > 1.2) end = p.pos.clone();
      return { moveY: 1, crouch: t > 1.0 && t < 1.15, jump: t > 1.06 && t < 1.2 };
    });
    return { d: start && end ? start.distanceTo(end) : 0 };
  });
  check(o.d > 6 && o.d < 9.5, `long jump covers ${o.d.toFixed(1)} m (spec ~7)`);

  o = await r(() => { T.at(0, 0, 60); return T.run(0, 1.4, (t) => ({ jump: t < 0.2, crouch: t > 0.3 && t < 0.35 })); });
  check(o.states.includes('poundSpin') && o.states.includes('pound') && o.state === 'ground', `ground pound: ${o.states.filter((s) => s.startsWith('pound')).join(' > ')}`);

  o = await r(() => { T.at(0, 0, 60); return T.run(0, 1.6, (t) => ({ moveY: 1, attack: t > 0.8 && t < 0.85 })); });
  check(o.states.includes('dive') && o.states.includes('belly'), `dive into belly slide (${o.states.join(',')})`);

  o = await r(() => {
    // fly at the windmill W1 tower (a 3.8 m box at -62,-60) and kick off it
    const g = T.g;
    T.at(0, -62, -55.5);
    const p = g.players[0];
    p.pos.y += 3; p.vel.set(0, 4, -8); p.setState('air', 'single'); p.facing = Math.PI; p.airMaxSpeed = 9;
    let kicked = false, away = 0;
    T.run(0, 1.2, () => {
      if (p.jumpKind === 'wall' && !kicked) { kicked = true; away = p.vel.z; }
      return { moveY: 1, jump: p.wallT > 0 && !kicked };
    });
    return { kicked, away };
  });
  check(o.kicked && o.away > 3, `wall kick bounces off the windmill tower (${o.away.toFixed(1)} m/s away)`);

  o = await r(() => { T.at(0, -45, 18); return T.run(0, 1.5, () => ({})); });
  check(o.state === 'swim', `swimming in the pond (${o.state})`);
  o = await r(() => T.run(0, 1.5, (t) => ({ crouch: t < 1.5 })));
  check(o.y < -1.3, `diving underwater (${o.y.toFixed(2)} m)`);

  o = await r(() => {
    const g = T.g;
    T.at(0, 0, 60);
    const p = g.players[0];
    p.spawn(p.pos.clone().setY(p.pos.y + 11), Math.PI);
    p.health = 6; p.invuln = 0;
    g.simulate(2, () => [{}, {}]);
    return { hp: p.health };
  });
  check(o.hp === 5, `falling 11 m costs 1 health (${o.hp}/6)`);

  // --- co-op ---
  o = await r(() => {
    const g = T.g;
    T.at(0, 0, 60); T.at(1, 0, 60.0, g.players[0].pos.y + 4);
    let kinds = new Set(), peak = 0;
    const p2 = g.players[1];
    g.simulate(2, () => [{}, { jump: true }], () => { kinds.add(p2.jumpKind); peak = Math.max(peak, p2.pos.y - g.players[0].pos.y); });
    return { kinds: [...kinds], peak };
  });
  check(o.kinds.includes('boost') && o.peak > 4, `Boost Jump off partner's head (peak ${o.peak.toFixed(1)} m above P1's feet)`);

  o = await r(() => {
    const g = T.g;
    T.at(0, 0, 60); T.at(1, 0.9, 60);
    const p1 = g.players[0], p2 = g.players[1];
    g.simulate(0.2, () => [{ grab: true }, {}]);
    const held = p2.state;
    g.simulate(0.1, () => [{}, {}]);
    let peak = 0;
    g.simulate(1.5, (t) => [{ grab: t < 0.03 }, {}], () => { peak = Math.max(peak, p2.pos.y - p1.pos.y); });
    return { held, kind: p2.jumpKind, peak };
  });
  check(o.held === 'held' && o.peak > 5, `grab (${o.held}) and Toss partner (peak ${o.peak.toFixed(1)} m)`);

  o = await r(() => {
    const g = T.g;
    T.at(0, 0, 60); T.at(1, 3, 60);
    const e = g.enemies[0];
    e.alive = true; e.group.visible = true;
    e.pos.set(1.5, g.players[0].pos.y, 57); e.home.copy(e.pos);
    const held = (t) => ({ jump: t < 0.2, crouch: t > 0.32 && t < 0.36 });
    g.simulate(1.2, (t) => [held(t), held(t + 0.01)]);
    return { alive: e.alive };
  });
  check(!o.alive, 'Twin Pound shockwave defeats a nearby Grumblebud');

  o = await r(() => {
    const g = T.g;
    T.at(0, 0, 60); T.at(1, 3, 60);
    g.players[0].health = 1; g.players[0].invuln = 0;
    g.players[0].hurt(1, null, true);
    const bubbled = g.players[0].state;
    // partner hops into the bubble to pop it
    g.simulate(6, (t) => [{}, { jump: t > 2 && (t % 0.8) < 0.4 }]);
    return { bubbled, after: g.players[0].state, hp: g.players[0].health };
  });
  check(o.bubbled === 'bubble' && o.after !== 'bubble' && o.hp === 1, `Revive Bubble: ${o.bubbled} > revived with ${o.hp} health`);

  // --- puzzles ---
  o = await r(() => {
    const g = T.g;
    for (const b of g.level.bells) {
      T.at(0, b.pos.x, b.pos.z, b.pos.y + 0.1);
      g.simulate(1.0, (t) => [{ jump: t < 0.15, crouch: t > 0.3 && t < 0.34 }, {}]);
    }
    g.simulate(4, () => [{}, {}]);
    return { rung: g.level.bells.filter((b) => b.rung).length, open: g.level.vaultOpen, door: g.level.vaultDoor.enabled };
  });
  check(o.rung === 3 && o.open && o.door === false, `bells rung ${o.rung}/3, vault door opened`);

  o = await r(() => {
    const g = T.g;
    const [a, b] = g.level.plates;
    T.at(0, a.mesh.position.x, a.mesh.position.z, a.max.y + 0.05);
    T.at(1, b.mesh.position.x, b.mesh.position.z, b.max.y + 0.05);
    g.simulate(0.5, () => [{}, {}]);
    return { open: g.level.cageOpen };
  });
  check(o.open, 'both pressure plates open the cage');

  o = await r(() => {
    const g = T.g;
    const before = g.stats.prisms;
    const pr = g.level.prisms.find((p) => p.id === 'summit');
    T.at(0, pr.pos.x, pr.pos.z, g.level.summitTop.max.y + 0.05);
    T.at(0, pr.pos.x, pr.pos.z, g.level.summitTop.max.y + 0.05);
    const p = g.players[0];
    let peak = 0;
    g.simulate(1.4, (t) => [{ crouch: t < 0.25, jump: t > 0.08 && t < 0.85 }, {}], () => {
      if (g.stats.prisms === before) g.level.frame(1 / 120, g.time);
      peak = Math.max(peak, p.pos.y);
    });
    return { got: g.stats.prisms > before, peak: peak - g.level.summitTop.max.y };
  });
  check(o.got, `backflip on the summit platform collects the Summit Prism`);

  o = await r(() => {
    const g = T.g;
    const boss = g.boss;
    T.at(0, boss.pos.x, boss.pos.z + 10);
    g.simulate(1.0, () => [{}, {}]);
    const woke = boss.state !== 'sleep';
    boss.state = 'dizzy'; boss.timer = 5; boss.lowered = true; boss.setCrownY(boss.crownLow);
    T.at(0, boss.pos.x, boss.pos.z, boss.crownBox.max.y + 0.5);
    g.simulate(0.3, () => [{}, {}]);
    return { woke, hits: boss.hits };
  });
  check(o.woke && o.hits === 1, `Thistlequeen wakes and takes a crown hit (hits ${o.hits})`);

  // --- visuals ---
  await r(() => { T.at(0, 2, 64); T.at(1, 4, 63); T.g.rig.reset(T.g.players[0].pos); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'screenshots/play.png' });
  await r(() => { T.at(0, -40, 40); T.at(1, 8, 8); });
  await page.waitForTimeout(2500);
  const split = await r(() => T.g.rig.split);
  check(split, 'screen splits when heroes are far apart');
  await page.screenshot({ path: 'screenshots/split.png' });
} catch (e) {
  errors.push(String(e.stack || e));
}

check(errors.length === 0, `no page errors${errors.length ? ':\n  ' + errors.slice(0, 8).join('\n  ') : ''}`);
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
