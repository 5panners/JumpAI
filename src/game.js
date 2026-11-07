import * as THREE from 'three';
import { JUMP, ACTION, HEALTH } from './config.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Physics } from './world/physics.js';
import { buildTerrain, height } from './world/terrain.js';
import { buildSkyMesh, buildBackdrop, SUN_DIR, FOG_COLOR } from './world/sky.js';
import { buildWater } from './world/water.js';
import { buildFlora, fadeFoliage } from './world/flora.js';
import { Particles } from './world/particles.js';
import { Level } from './world/level.js';
import { Player } from './entities/player.js';
import { Grumblebud, Puffpaw, resolveEnemyContacts, twinPoundWave } from './entities/enemies.js';
import { Thistlequeen } from './entities/boss.js';
import { buildFauna } from './entities/fauna.js';
import { CameraRig } from './camera.js';
import { createRenderer } from './render.js';
import { Hud } from './hud.js';

const STEP = 1 / 120;
const NO_EDGES = { jumpPressed: false, crouchPressed: false, attackPressed: false, grabPressed: false };

export class Game {
  constructor(container, hudRoot, opts = {}) {
    this.opts = opts;
    this.time = 0;
    this.mode = 'title';
    this.playerCount = 2;
    this.assist = false;
    this.stats = { prisms: 0, berries: 0, enemies: 0 };
    this.colourK = 0.8;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog(FOG_COLOR, 140, 760);
    scene.background = FOG_COLOR.clone();

    this.input = new Input();
    this.audio = new Audio();
    this.physics = new Physics();
    this.hud = new Hud(hudRoot);
    this.rig = new CameraRig();
    this.rig.occluder = (a, b) => this.physics.segmentHit(a, b);

    // light: warm late-morning sun, sky/ground bounce, rim from the opposite side
    const hemi = new THREE.HemisphereLight('#bfe4ff', '#6a9a3a', 0.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff0d2', 2.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sun = sun;
    const rim = new THREE.DirectionalLight('#ffd0f0', 0.55);
    rim.position.set(-SUN_DIR.x, 0.4, -SUN_DIR.z).multiplyScalar(50);
    scene.add(rim);

    const sky = buildSkyMesh();
    scene.add(sky);
    this.sky = sky;
    this.backdrop = buildBackdrop(scene);

    this.terrain = buildTerrain();
    scene.add(this.terrain);
    this.water = buildWater(scene);
    this.particles = new Particles(scene);
    this.flora = buildFlora(scene, this.physics);
    this.level = new Level(this);
    this.fauna = buildFauna(scene, this.flora.patches);

    this.players = [new Player(this, 0, 'tali'), new Player(this, 1, 'bram')];
    this.enemies = [
      [10, 52], [-22, 62], [40, 10], [-28, -4], [60, 4], [20, -62], [-70, -40], [50, 40],
    ].map(([x, z]) => new Grumblebud(this, x, z));
    this.enemies.push(...[[-58, -48], [2, -74], [72, 14], [40, -30], [-60, 8]].map(([x, z]) => new Puffpaw(this, x, z)));
    this.boss = new Thistlequeen(this, this.level.arenaCenter);

    this.gfx = createRenderer(container, scene, () => this.currentViews, { lowfx: !!opts.lowfx });
    this.currentViews = [];

    // reflections for water and metals from the sky
    const pm = new THREE.PMREMGenerator(this.gfx.renderer);
    const envScene = new THREE.Scene();
    envScene.add(buildSkyMesh());
    scene.environment = pm.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.35;

    this.placePlayers(this.level.spawnPoint);
    this.rig.reset(this.level.spawnPoint);
    this.inputs = [this.input.blank(), this.input.blank()];
    this.acc = 0;
    this.last = performance.now();
  }

  placePlayers(p) {
    this.players.forEach((pl, i) => {
      const x = p.x + (i === 0 ? -1.4 : 1.4);
      pl.spawn(new THREE.Vector3(x, height(x, p.z) + 0.2, p.z), Math.PI);
      pl.health = HEALTH.max;
    });
  }

  start(count) {
    this.playerCount = count;
    this.players[1].active = count > 1;
    this.mode = 'play';
    this.audio.unlock();
    this.placePlayers(this.level.spawnPoint);
    this.hud.message(count > 1 ? 'Tali and Bram arrive in Bloomvale Meadow!' : 'Tali arrives in Bloomvale Meadow!', 3);
    document.body.classList.add('playing');
  }

  inputFor(p) { return this.inputs[p.index] || this.input.blank(); }

  // ---- events from players ----
  onPoundLand(p, box) {
    this.audio.play('pound');
    this.particles.ring(p.pos, '#fff3c4', 2, 14);
    this.level.onPound(p, box);
    // stomp enemies directly below
    const o = p.partner;
    if (o && o.alive && Math.abs(this.time - o.lastPoundTime) <= ACTION.twinPoundWindow && o !== p) {
      const c = p.pos.clone().lerp(o.pos, 0.5);
      this.particles.ring(c, '#ffd23f', ACTION.twinPoundRadius, 60);
      this.particles.ring(c, '#ff5fa2', ACTION.twinPoundRadius * 0.6, 40);
      this.audio.play('twin');
      twinPoundWave(this, c);
      this.level.twinPound(c);
      this.hud.message('TWIN POUND!', 1.5);
      o.lastPoundTime = -10;
      p.lastPoundTime = -10;
    }
  }

  collectPrism(prism, by) {
    this.stats.prisms++;
    this.audio.play('prism');
    this.particles.paint(prism.pos, 60);
    by.health = HEALTH.max;
    this.hud.message(`Prism! "${prism.name}" (${this.stats.prisms} / 7)`, 3.5);
    if (this.stats.prisms === 7) {
      setTimeout(() => {
        this.audio.play('win');
        document.body.classList.add('won');
      }, 1200);
    }
  }

  collectBerry(p) {
    this.stats.berries++;
    p.health = Math.min(HEALTH.max, p.health + 1);
    this.audio.play('berry');
    this.particles.sparkle(p.pos.clone().add(new THREE.Vector3(0, 1, 0)), '#ffd23f', 4);
  }

  allDown() {
    const c = this.level.respawnPoint();
    this.players.forEach((pl, i) => {
      if (!pl.active) return;
      const x = c.x + (i === 0 ? -1.2 : 1.2);
      pl.spawn(new THREE.Vector3(x, height(x, c.z) + 0.3, c.z + 1.5), pl.facing);
      pl.health = HEALTH.max;
      pl.invuln = 2;
    });
    this.rig.reset(c, this.rig.yawFor(0));
    this.hud.message('Back to the last checkpoint!', 2.5);
  }

  // ---- player vs player: boost jumps and personal space ----
  resolvePlayers() {
    const [a, b] = this.players;
    if (!a.active || !b.active) return;
    for (const [p, q] of [[a, b], [b, a]]) {
      if (!p.alive || !q.alive || p.state === 'held' || q.state === 'held' || p.state === 'swim') continue;
      const hd = Math.hypot(p.pos.x - q.pos.x, p.pos.z - q.pos.z);
      const qTop = q.pos.y + q.height;
      const falling = ['air', 'dive', 'pound'].includes(p.state) && p.vel.y <= 0;
      if (hd < 0.8 && falling && p.prev.y >= qTop - 0.2 && p.pos.y <= qTop + 0.05 && p.pos.y > qTop - 0.7) {
        p.pos.y = qTop;
        const inp = this.inputFor(p);
        if (q.crouching) {
          const fv = p.facingVec();
          p.launch('boost', JUMP.boostCrouchUp, fv.x * JUMP.boostCrouchSpeed, fv.z * JUMP.boostCrouchSpeed);
          p.airMaxSpeed = JUMP.boostCrouchSpeed + 1;
        } else if (inp.jump || p.jumpBufferT > 0) {
          p.launch('boost', JUMP.boostHeld + Math.max(0, q.vel.y) * 0.6, p.vel.x * 0.4, p.vel.z * 0.4);
        } else {
          p.launch('single', JUMP.bounceSmall, p.vel.x, p.vel.z);
          p.jumpCut = true;
        }
        p.jumpBufferT = 0;
        p.noFallDamage = true;
        q.landSquash = 1;
        this.particles.burst(p.pos, '#ffffff', 6, 3);
      }
    }
    // separate overlapping heroes
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
    const d = Math.hypot(dx, dz), min = a.radius + b.radius;
    const vy = Math.abs(a.pos.y - b.pos.y) < 1.0;
    if (d < min && d > 0.0001 && vy && a.alive && b.alive && a.state !== 'held' && b.state !== 'held') {
      const push = (min - d) / 2;
      a.pos.x += (dx / d) * push; a.pos.z += (dz / d) * push;
      b.pos.x -= (dx / d) * push; b.pos.z -= (dz / d) * push;
    }
  }

  step(dt, inputs) {
    this.time += dt;
    this.level.update(dt);
    this.players.forEach((p, i) => p.update(dt, inputs[i], this.rig.yawFor(i)));
    this.resolvePlayers();
    for (const e of this.enemies) e.update(dt);
    resolveEnemyContacts(this);
    this.boss.update(dt);
    const act = this.players.filter((p) => p.active);
    if (act.length > 1 && act.every((p) => p.state === 'bubble')) this.allDown();
  }

  frame(now) {
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.opts.fixedDt) dt = this.opts.fixedDt;
    const states = this.input.poll();

    if (this.mode === 'title') {
      if (this.input.consumeKey('Digit1')) this.start(1);
      else if (this.input.consumeKey('Digit2')) this.start(2);
      else if (this.input.consumeKey('KeyH')) { this.assist = !this.assist; document.body.classList.toggle('assist', this.assist); }
    } else if (this.mode === 'play' || this.mode === 'pause') {
      if (this.input.consumeKey('Escape') || this.input.consumeKey('KeyP')) {
        this.mode = this.mode === 'play' ? 'pause' : 'play';
        document.body.classList.toggle('paused', this.mode === 'pause');
      }
      if (this.input.consumeKey('KeyM')) this.audio.toggleMusic();
    }

    if (this.mode === 'play') {
      this.inputs = states;
      this.acc += dt;
      let first = true;
      let n = 0;
      while (this.acc >= STEP && n < 8) {
        this.step(STEP, first ? states : states.map((s) => ({ ...s, ...NO_EDGES })));
        first = false;
        this.acc -= STEP;
        n++;
      }
      if (n === 8) this.acc = 0;
      this.audio.updateMusic();
    }

    const t = now / 1000;
    const camInputs = this.mode === 'play' ? states : [{ camX: 0.15 }, { camX: 0 }];
    if (this.debugCam) {
      const s = this.rig.shared;
      s.cam.position.copy(this.debugCam.pos);
      s.cam.lookAt(this.debugCam.look);
      s.pos.copy(this.debugCam.pos);
      this.rig.split = false;
    } else if (this.mode === 'title') {
      // slow showcase orbit
      const c = this.level.spawnPoint.clone().add(new THREE.Vector3(0, 0, -20));
      this.rig.follow(this.rig.shared, c, 22, dt, 0.08);
    } else {
      this.rig.update(dt, this.players, camInputs);
    }
    this.hud.setSplit(this.rig.split);

    for (const p of this.players) p.animate(dt);
    this.level.frame(dt, this.time);
    for (const p of this.players) {
      if (p.state === 'swim' && Math.random() < dt * 8) this.particles.spawn(p.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), new THREE.Vector3(0, 1.5, 0), '#e6fbff', 0.8, 0.6, -1, 0.5);
    }
    this.particles.update(dt);
    this.flora.update(t, this.players);
    this.fauna.update(dt, t, this.players);
    this.water.update(dt, t, this.particles);
    const focus = this.debugCam ? this.debugCam.pos.clone() : this.rig.focus();
    this.backdrop.update(dt, t, focus);
    this.sky.position.copy(focus);

    // shadows follow the action
    const act = this.players.filter((p) => p.active);
    const c = new THREE.Vector3();
    act.forEach((p) => c.add(p.pos));
    c.multiplyScalar(1 / Math.max(1, act.length));
    if (this.mode === 'title') c.copy(this.level.spawnPoint);
    const spread = act.length > 1 ? act[0].pos.distanceTo(act[1].pos) : 0;
    const ext = Math.min(70, 34 + spread / 2);
    const cam = this.sun.shadow.camera;
    if (cam.right !== ext) {
      cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
      cam.updateProjectionMatrix();
    }
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(SUN_DIR, 120);
    cam.far = 300;

    // colour returns to the world as Prisms are restored
    const target = 0.8 + 0.35 * (this.stats.prisms / 7);
    this.colourK += (target - this.colourK) * Math.min(1, dt * 1.5);
    this.gfx.setSaturation(this.colourK);
    this.backdrop.setColorRestored(this.stats.prisms / 7);

    this.hud.update(dt, this);
    this.currentViews = this.rig.views(window.innerWidth, window.innerHeight);
    if (this.mode !== 'title') {
      const segs = [];
      this.currentViews.forEach((v, i) => {
        const ps = this.rig.split ? [this.players[i]] : this.players.filter((p) => p.active);
        for (const p of ps) segs.push([v.camera.position, p.pos.clone().add(new THREE.Vector3(0, 0.6, 0))]);
      });
      fadeFoliage(segs, dt);
    }
    this.gfx.render();
    this.input.endFrame();
  }

  // Deterministic stepping for tests: `held(t)` returns [p1, p2] partial input
  // states (held buttons and stick); button-press edges are derived here.
  simulate(seconds, held, onStep) {
    const prev = [{}, {}];
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      const raw = held(i * STEP) || [{}, {}];
      const inputs = [0, 1].map((k) => {
        const s = { ...this.input.blank(), ...(raw[k] || {}) };
        for (const b of ['jump', 'crouch', 'attack', 'grab']) {
          s[b + 'Pressed'] = !!s[b] && !prev[k][b];
          prev[k][b] = !!s[b];
        }
        return s;
      });
      this.inputs = inputs;
      this.step(STEP, inputs);
      if (onStep) onStep(i * STEP);
    }
  }

  run() {
    const loop = (now) => {
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
