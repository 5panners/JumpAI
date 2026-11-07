import * as THREE from 'three';
import { height, riverZ, FEATURES } from './terrain.js';
import { addTree, addTulip, addRock, makeRng } from './flora.js';
import { JUMP } from '../config.js';

const M = {
  wood: new THREE.MeshStandardMaterial({ color: '#c98a4b', roughness: 0.85 }),
  woodDark: new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.9 }),
  stone: new THREE.MeshStandardMaterial({ color: '#c9bfd9', roughness: 0.9, flatShading: true }),
  stoneDark: new THREE.MeshStandardMaterial({ color: '#9d90b3', roughness: 0.95, flatShading: true }),
  cliff: new THREE.MeshStandardMaterial({ color: '#c79a6b', roughness: 0.95, flatShading: true }),
  hay: new THREE.MeshStandardMaterial({ color: '#f2c94c', roughness: 1 }),
  plat: new THREE.MeshStandardMaterial({ color: '#7fd1ff', roughness: 0.5 }),
  platTop: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
  crumble: new THREE.MeshStandardMaterial({ color: '#e7a36a', roughness: 0.9, flatShading: true }),
  cracked: new THREE.MeshStandardMaterial({ color: '#b3a18d', roughness: 1, flatShading: true }),
  red: new THREE.MeshStandardMaterial({ color: '#ff4d5e', roughness: 0.4, emissive: '#ff2040', emissiveIntensity: 0.3 }),
  green: new THREE.MeshStandardMaterial({ color: '#4dff88', roughness: 0.4, emissive: '#20ff60', emissiveIntensity: 0.6 }),
  brass: new THREE.MeshStandardMaterial({ color: '#ffcf4a', metalness: 0.8, roughness: 0.25 }),
  white: new THREE.MeshStandardMaterial({ color: '#fdfbf5', roughness: 0.8 }),
  spring: new THREE.MeshStandardMaterial({ color: '#ff5fb8', roughness: 0.4, emissive: '#ff2f9a', emissiveIntensity: 0.25 }),
};

const PRISM_NAMES = {
  summit: 'Summit of Bloomvale',
  boss: "Thistlequeen's Thorny Crown",
  bells: 'Three Bells, One Vault',
  plates: 'Two Plates, One Gate',
  rings: 'Ring Dash',
  falls: 'Behind the Falls',
  paint: 'Paint the Meadow',
};

export class Level {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.physics = game.physics;
    this.t = 0;
    this.prisms = [];
    this.berries = [];
    this.drops = [];
    this.signs = [];
    this.checkpoints = [];
    this.crumbles = [];
    this.movers = [];
    this.springs = [];
    this.bells = [];
    this.plates = [];
    this.bales = [];
    this.rings = [];
    this.race = { active: false, time: 0, next: 0 };
    this.vaultOpen = false;
    this.cageOpen = false;
    this.paintFound = 0;
    this.rng = makeRng(7);
    this.build();
  }

  // ---------- helpers ----------
  box(x, top, z, sx, sy, sz, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, top - sy / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const b = this.physics.addPlatform(x, top, z, sx, sy, sz, opts);
    b.mesh = mesh;
    return b;
  }

  // a column standing on the terrain up to `top`
  pillar(x, top, z, sx, sz, material, opts = {}) {
    const g = height(x, z) - 1.5;
    return this.box(x, top, z, sx, top - g, sz, material, { safe: true, ...opts });
  }

  floatPlatform(x, top, z, sx, sz, opts = {}) {
    const b = this.box(x, top, z, sx, 0.6, sz, M.plat, { safe: true, ...opts });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.1, 0.12, sz + 0.1), M.platTop);
    cap.position.y = 0.3;
    b.mesh.add(cap);
    return b;
  }

  sign(x, z, text) {
    const h = height(x, z);
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.3, 6), M.woodDark);
    post.position.y = 0.65;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.1), M.wood);
    board.position.y = 1.3;
    const mark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M.brass);
    mark.position.set(0, 1.3, 0.08);
    g.add(post, board, mark);
    g.position.set(x, h, z);
    post.castShadow = board.castShadow = true;
    this.scene.add(g);
    this.signs.push({ pos: new THREE.Vector3(x, h, z), text, g });
  }

  signAt(x, y, z, text) {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.1), M.wood);
    board.position.y = 1.0;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.0, 6), M.woodDark);
    post.position.y = 0.5;
    g.add(post, board);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.signs.push({ pos: new THREE.Vector3(x, y, z), text, g });
  }

  // ---------- collectibles ----------
  addPrism(id, pos, hidden = false) {
    const g = new THREE.Group();
    const gemMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ff66cc', emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.3 });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), gemMat);
    gem.scale.y = 1.4;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.7 }));
    g.add(gem, halo);
    g.position.copy(pos);
    g.visible = !hidden;
    this.scene.add(g);
    const p = { id, name: PRISM_NAMES[id], pos: pos.clone(), g, gem, halo, gemMat, hidden, collected: false, rise: 0 };
    this.prisms.push(p);
    return p;
  }

  revealPrism(id) {
    const p = this.prisms.find((q) => q.id === id);
    if (!p || p.collected || !p.hidden) return;
    p.hidden = false;
    p.g.visible = true;
    p.rise = 1;
    this.game.particles.paint(p.pos, 40);
    this.game.audio.play('prism');
    this.game.hud.message(`A Prism appeared: ${p.name}!`, 3);
  }

  spawnBerry(pos, persistent = false) {
    const m = new THREE.Mesh(this.berryGeo, this.berryMat);
    m.position.copy(pos);
    m.castShadow = true;
    this.scene.add(m);
    this.berries.push({ m, pos: pos.clone(), taken: false, phase: this.rng() * 6, persistent });
  }

  berryLine(x1, z1, x2, z2, n, yOff = 0.9) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      this.spawnBerry(new THREE.Vector3(x, Math.max(height(x, z), 0.2) + yOff, z), true);
    }
  }

  berryRing(cx, y, cz, r, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawnBerry(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r), true);
    }
  }

  addDrop(pos, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.2 }));
    m.geometry.translate(0, 0, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 14), m.material);
    tip.position.y = 0.38;
    m.add(tip);
    m.position.copy(pos);
    this.scene.add(m);
    this.drops.push({ m, pos: pos.clone(), taken: false });
  }

  checkpoint(x, z) {
    const h = height(x, z);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), M.white);
    pole.position.y = 1.3;
    const flagMat = new THREE.MeshStandardMaterial({ color: '#9a9aa2', side: THREE.DoubleSide, roughness: 0.8 });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 6, 1), flagMat);
    flag.position.set(0.47, 2.25, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M.brass);
    knob.position.y = 2.65;
    g.add(pole, flag, knob);
    g.position.set(x, h, z);
    pole.castShadow = true;
    this.scene.add(g);
    const c = { pos: new THREE.Vector3(x, h, z), flag, flagMat, on: false };
    this.checkpoints.push(c);
    return c;
  }

  // ---------- build ----------
  build() {
    this.berryGeo = new THREE.IcosahedronGeometry(0.28, 1);
    this.berryMat = new THREE.MeshStandardMaterial({ color: '#ffc61a', emissive: '#ffae00', emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.2 });
    const S = FEATURES.spawn;
    this.spawnPoint = new THREE.Vector3(S.x, height(S.x, S.z), S.z);

    this.buildStart();
    this.buildTulips();
    this.buildSummit();
    this.buildWindmills();
    this.buildVault();
    this.buildPlates();
    this.buildRace();
    this.buildFalls();
    this.buildRiver();
    this.buildRuins();
    this.buildArena();
    this.buildScenery();
    this.buildBerries();
  }

  buildStart() {
    const s = this.spawnPoint;
    this.checkpoint(s.x - 4, s.z - 2).on = true;
    this.activeCheckpoint = this.checkpoints[0];
    this.checkpoints[0].flagMat.color.set('#ff5fa2');
    this.sign(s.x + 3, s.z - 3, 'Welcome to Bloomvale! Move with WASD / arrows / left stick. Jump with Space / Enter / A. Jump again just as you land to chain a double and triple jump.');
    this.sign(s.x - 3, s.z - 7, 'Co-op: jump on your partner\'s head for a Boost Jump. Grab them (G / . / Y), then press grab again to Toss them. Neutral stick tosses straight up.');
    this.sign(s.x + 7, s.z - 9, 'Spring pads launch you high. Ground pound (crouch in the air) onto one to fly even higher.');
    // spring pad + reward platform
    const sx = s.x + 8, sz = s.z - 13;
    this.addSpring(sx, height(sx, sz), sz);
    this.floatPlatform(sx, height(sx, sz) + 7, sz - 5, 4, 4);
    this.berryRing(sx, height(sx, sz) + 8, sz - 5, 1.2, 5);
    // paint prism appears here once all paint drops are found
    this.addPrism('paint', new THREE.Vector3(s.x, s.y + 2.8, s.z - 10), true);
  }

  addSpring(x, baseY, z) {
    const top = baseY + 0.35;
    const b = this.box(x, top, z, 1.6, 0.35, 1.6, M.spring, { noLedge: true, safe: false });
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 20), M.brass);
    coil.rotation.x = Math.PI / 2;
    coil.position.y = -0.2;
    b.mesh.add(coil);
    b.onLand = (p, pound) => {
      p.launch('spring', pound ? JUMP.springPound : JUMP.springSmall, p.vel.x * 0.3, p.vel.z * 0.3);
      p.jumpCut = true;
      p.noFallDamage = true;
      this.game.audio.play('spring');
      b.squash = 1;
    };
    this.springs.push(b);
    return b;
  }

  buildTulips() {
    const tops = [[-2, 20, 3.4, '#ff4f8b'], [2, 16.5, 4.9, '#ffd23f'], [6.5, 14, 6.4, '#ff7b39'], [10, 10, 7.9, '#b07cff'], [8, 5.5, 9.4, '#5ad1ff'], [3.5, 3, 11.0, '#ff5fa2']];
    for (const [x, z, top, c] of tops) {
      addTulip(this.scene, this.physics, x, z, top, c);
      this.spawnBerry(new THREE.Vector3(x, top + 0.9, z), true);
    }
    this.sign(-5, 24, 'Giant tulips! Hold jump for a higher jump. Tap it for a short hop.');
    const last = tops[tops.length - 1];
    this.addDrop(new THREE.Vector3(last[0], last[2] + 1.2, last[1]), '#ff4d6d');
  }

  buildSummit() {
    const S = FEATURES.summit;
    const base = height(S.x, S.z);
    this.checkpoint(32, -27);
    const P = [];
    P.push(this.floatPlatform(59, base + 1.5, -45, 3, 3));
    P.push(this.floatPlatform(61.5, base + 3.0, -41, 3, 3));
    const c1 = this.addCrumble(58, base + 4.4, -37.5, 3, 3);
    const c2 = this.addCrumble(54, base + 5.4, -38.5, 3, 3);
    P.push(this.floatPlatform(50.5, base + 5.4, -41.5, 3, 3));
    this.addSpring(50.5, base + 5.4, -41.5);
    const top = this.floatPlatform(52, base + 10.6, -46.5, 5, 4);
    this.signAt(50.2, base + 10.6, -47.8, 'Too high to reach? Backflip: hold crouch, then jump. Or Boost off your partner.');
    this.addPrism('summit', new THREE.Vector3(52, base + 10.6 + 4.6, -46.5));
    this.addDrop(new THREE.Vector3(61.5, base + 3.0 + 1.3, -41), '#3a86ff');
    this.sign(40, -38, 'The summit tower: watch out for crumbling platforms!');
    // rolling hay bales down the main approach
    this.baleLane = { a: new THREE.Vector3(47, 0, -43), b: new THREE.Vector3(26, 0, -21), timer: 0 };
    this.baleGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.7, 14);
    this.baleGeo.rotateX(Math.PI / 2);
    this.summitTop = top;
    void c1; void c2; void P;
  }

  addCrumble(x, top, z, sx, sz) {
    const b = this.box(x, top, z, sx, 0.6, sz, M.crumble, { safe: false });
    b.home = b.mesh.position.clone();
    b.crumbleT = -1;
    b.respawnT = 0;
    b.onLand = () => { if (b.crumbleT < 0) { b.crumbleT = 0.6; this.game.audio.play('crumble'); } };
    this.crumbles.push(b);
    return b;
  }

  buildWindmills() {
    const spots = [[-62, -60], [8, -86], [78, 24]];
    spots.forEach(([x, z], i) => this.windmill(x, z, i));
    this.sign(-55, -50, 'Ring the bell on each windmill: ground pound (crouch in the air) the red button on the balcony.');
  }

  windmill(x, z, i) {
    const g0 = height(x, z);
    const group = new THREE.Group();
    group.position.set(x, g0, z);
    this.scene.add(group);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.4, 14, 10), M.stone);
    tower.position.y = 7;
    tower.castShadow = true;
    tower.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3, 10), new THREE.MeshStandardMaterial({ color: ['#ff6b6b', '#4dabf7', '#ffd43b'][i], roughness: 0.7 }));
    roof.position.y = 15.5;
    roof.castShadow = true;
    group.add(tower, roof);
    this.physics.addBox(x, g0 + 7, z, 3.8, 14, 3.8, { noLedge: true });
    // blades
    const hub = new THREE.Group();
    hub.position.set(0, 12.5, 2.5);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k / 4) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6, 0.12), M.white);
      blade.position.y = 3.6;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7, 0.2), M.woodDark);
      spar.position.y = 3.3;
      blade.castShadow = true;
      arm.add(blade, spar);
      hub.add(arm);
    }
    group.add(hub);
    // balcony + hay-bale steps
    const top = g0 + 6;
    this.box(x, top, z, 8, 0.5, 8, M.wood, { safe: true });
    const steps = [[7, 4, 1.5], [7, 0.8, 3.0], [5.4, -2.2, 4.5]];
    for (const [dx, dz, h] of steps) {
      const b = this.pillar(x + dx, g0 + h, z + dz, 2, 2, M.hay);
      b.mesh.material = M.hay;
    }
    // bell + button
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 0.8, 12, 1, true), M.brass);
    bell.material.side = THREE.DoubleSide;
    const bellPivot = new THREE.Group();
    bellPivot.position.set(0, 9.2, 2.3);
    bell.position.y = -0.5;
    bellPivot.add(bell);
    group.add(bellPivot);
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.3, 16), M.red);
    button.position.set(x, top + 0.15, z + 3);
    this.scene.add(button);
    this.bells.push({ pos: new THREE.Vector3(x, top, z + 3), rung: false, button, bellPivot, swing: 0, hub, i });
    if (i === 1) this.addDrop(new THREE.Vector3(x - 3, top + 1.2, z - 3), '#ffbe0b');
  }

  buildVault() {
    const x = 22, z = -4;
    const g = height(x, z);
    const fl = g + 0.3;
    this.box(x, fl, z, 7, 1.2, 7, M.stoneDark, { safe: true });
    this.box(x, fl + 3.4, z - 3.1, 7, 3.4, 0.8, M.stone); // back
    this.box(x - 3.1, fl + 3.4, z, 0.8, 3.4, 7, M.stone); // left
    this.box(x + 3.1, fl + 3.4, z, 0.8, 3.4, 7, M.stone); // right
    this.box(x - 2.2, fl + 3.4, z + 3.1, 1.8, 3.4, 0.8, M.stone); // front left
    this.box(x + 2.2, fl + 3.4, z + 3.1, 1.8, 3.4, 0.8, M.stone); // front right
    this.box(x, fl + 4.0, z, 7.4, 0.6, 7.4, M.stoneDark, { safe: true }); // roof
    this.vaultDoor = this.box(x, fl + 3.4, z + 3.1, 2.6, 3.4, 0.5, M.woodDark, { noLedge: true });
    this.vaultDoor.home = this.vaultDoor.mesh.position.clone();
    const sym = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M.red);
      s.position.set((k - 1) * 0.7, fl + 2.6, z + 3.4);
      sym.add(s);
    }
    this.scene.add(sym);
    this.vaultLights = sym.children;
    this.addPrism('bells', new THREE.Vector3(x, fl + 1.5, z - 0.5));
    this.sign(x + 5, z + 6, 'The Bell Vault. Three red lights, three windmill bells.');
    this.addDrop(new THREE.Vector3(x, fl + 5.2, z), '#8338ec');
  }

  buildPlates() {
    const y1 = height(14, 30), y2 = height(30, 30);
    this.plates.push(this.makePlate(14, y1, 30), this.makePlate(30, y2, 30));
    const cx = 22, cz = 42, cg = height(cx, cz);
    this.box(cx, cg + 0.3, cz, 4, 0.8, 4, M.stoneDark, { safe: true });
    this.cage = new THREE.Group();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), M.brass);
      bar.position.set(Math.cos(a) * 1.4, 1.5, Math.sin(a) * 1.4);
      this.cage.add(bar);
    }
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 16), M.brass);
    lid.position.y = 3;
    this.cage.add(lid);
    this.cage.position.set(cx, cg + 0.3, cz);
    this.scene.add(this.cage);
    this.cageBox = this.physics.addBox(cx, cg + 0.3 + 1.6, cz, 3.0, 3.2, 3.0, { noLedge: true });
    this.addPrism('plates', new THREE.Vector3(cx, cg + 1.8, cz));
    this.sign(22, 26, 'Two plates, one gate: both plates need weight at the same time. (Playing solo? A plate stays down for 6 seconds.)');
  }

  makePlate(x, g, z) {
    const base = this.box(x, g + 0.1, z, 2.6, 0.6, 2.6, M.stoneDark, { safe: true });
    const plate = this.box(x, g + 0.3, z, 2.0, 0.2, 2.0, M.red, { safe: true, noLedge: true });
    plate.home = plate.mesh.position.y;
    plate.pressedT = 0;
    void base;
    return plate;
  }

  buildRace() {
    const sx = -10, sz = 50, sg = height(sx, sz);
    this.raceStart = this.box(sx, sg + 0.5, sz, 2.4, 1.2, 2.4, M.green, { safe: true });
    this.raceStart.mesh.material = new THREE.MeshStandardMaterial({ color: '#4dff88', emissive: '#18c95a', emissiveIntensity: 0.5 });
    this.sign(sx + 2.5, sz + 2, 'Ring Dash: step on the green stump, then fly through all 6 rings in 25 seconds.');
    const pts = [[-22, 38], [-12, 22], [4, 14], [12, -2], [-6, -6], [-16, 30]];
    const ringGeo = new THREE.TorusGeometry(1.4, 0.16, 10, 32);
    pts.forEach(([x, z], i) => {
      const y = height(x, z) + 1.8 + (i === 3 ? 0.8 : 0);
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffd23f', emissiveIntensity: 0.3, transparent: true, opacity: 0.35 });
      const m = new THREE.Mesh(ringGeo, mat);
      m.position.set(x, y, z);
      const next = pts[(i + 1) % pts.length];
      m.lookAt(next[0], y, next[1]);
      this.scene.add(m);
      this.rings.push({ m, mat, pos: m.position.clone(), done: false });
    });
    this.addPrism('rings', new THREE.Vector3(sx, sg + 3.2, sz), true);
  }

  buildFalls() {
    const top = 9;
    const W = this.game.water;
    // cliff with a hidden alcove behind the waterfall
    this.box(-50.25, top, 6.5, 5.5, 13, 7, M.cliff, { safe: true });
    this.box(-39.75, top, 6.5, 5.5, 13, 7, M.cliff, { safe: true });
    this.box(-45, top, 4.5, 5, 13, 3, M.cliff, { safe: true });
    this.box(-45, top, 8, 5, top - 3.6, 4, M.cliff, { noLedge: true });
    this.box(-45, 0.5, 8, 5, 4.5, 4, M.stoneDark, { safe: true });
    W.addWaterfall(-45, top, -0.1, 10.25, 5, 0);
    // stream on top
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshStandardMaterial({ color: '#4fd8ea', roughness: 0.1, transparent: true, opacity: 0.8 }));
    stream.rotation.x = -Math.PI / 2;
    stream.position.set(-45, top + 0.03, 7);
    this.scene.add(stream);
    this.addPrism('falls', new THREE.Vector3(-45, 1.9, 7.6));
    // climbing rocks on the east side
    const steps = [[-34.5, 2.8, 9.5], [-34.5, 4.3, 6.5], [-34.5, 5.8, 3.5], [-34.5, 7.5, 0.5]];
    for (const [x, t, z] of steps) this.pillar(x, t, z, 2.5, 2.5, M.stoneDark);
    this.addDrop(new THREE.Vector3(-50, top + 1.2, 5), '#06d6a0');
    this.sign(-30, 40, 'The pond: swim! Crouch to dive under, jump to stroke. Leaving the water refills your health. Something glints behind the falls...');
    this.checkpoint(-28, 42);
    this.addDrop(new THREE.Vector3(-38, -2.6, 32), '#fb5607');
  }

  buildRiver() {
    // stepping stones
    const sx = -70, rz = riverZ(sx);
    for (let k = -2; k <= 2; k++) this.pillar(sx + (k % 2) * 0.8, 0.5, rz + k * 2.6, 1.6, 1.6, M.stoneDark);
    // drifting log raft
    const lx = -88, lz = riverZ(lx);
    const log = this.box(lx, 0.35, lz, 2.4, 0.5, 3, M.wood, { safe: false });
    this.movers.push({ b: log, axis: 'z', center: lz, amp: 5, speed: 0.6, last: 0 });
    // river island with a paint drop
    const ix = -80, iz = riverZ(ix);
    this.box(ix, 0.6, iz, 3, 3, 3, M.stoneDark, { safe: true });
    this.addDrop(new THREE.Vector3(ix, 1.8, iz), '#ffd23f');
  }

  buildRuins() {
    const x = 68, z = -2, g = height(x, z);
    this.box(x, g + 3, z - 3, 6, 4.5, 0.8, M.stone);
    this.box(x - 3, g + 3, z, 0.8, 4.5, 6, M.stone);
    this.box(x + 3, g + 3, z, 0.8, 4.5, 6, M.stone);
    this.box(x, g + 3.4, z, 6.8, 0.5, 6.8, M.stoneDark, { safe: true });
    const crack = this.box(x, g + 3, z + 3, 5.2, 4.5, 0.8, M.cracked, { breakable: true, noLedge: true });
    // crack lines
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.1), M.woodDark);
      l.position.set(-1.6 + k * 0.8, (k % 2) * 0.4, 0.42);
      l.rotation.z = (k % 2 ? 0.5 : -0.4);
      crack.mesh.add(l);
    }
    this.crackWall = crack;
    this.addDrop(new THREE.Vector3(x, g + 1.2, z - 0.5), '#3a86ff');
    this.berryRing(x, g + 0.9, z, 1.6, 4);
    this.sign(x - 4, z + 6, 'A cracked wall. Bram can Curl Roll through it (crouch while running). A dive or a Twin Pound works too.');
  }

  buildArena() {
    const A = FEATURES.arena;
    this.arenaCenter = new THREE.Vector3(A.x, height(A.x, A.z), A.z);
    const thorn = new THREE.MeshStandardMaterial({ color: '#4c6b3c', flatShading: true, roughness: 1 });
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.35) continue; // gap facing +z
      const x = A.x + Math.cos(a) * 16.5, z = A.z + Math.sin(a) * 16.5;
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), thorn);
      bush.position.set(x, height(x, z) + 1.0, z);
      bush.scale.y = 1.3;
      bush.castShadow = true;
      this.scene.add(bush);
      this.physics.addBox(x, height(x, z) + 1.5, z, 2.4, 3, 2.4, { noLedge: true });
    }
    this.checkpoint(A.x + 3, A.z + 21);
    this.sign(A.x - 3, A.z + 21, 'Thistlequeen\'s garden. Dodge her thorn balls. When she gets dizzy, jump on her crown!');
    this.addPrism('boss', new THREE.Vector3(A.x, this.arenaCenter.y + 2.2, A.z + 5.5), true);
  }

  buildScenery() {
    const rng = this.rng;
    const avoid = [[0, 72, 16], [-45, 26, 22], [55, -45, 14], [-22, -38, 22], [22, -4, 8], [22, 36, 14], [-10, 50, 6], [-62, -60, 8], [8, -86, 8], [78, 24, 8], [68, -2, 7], [4, 12, 12], [-45, 6, 10], [-34, 5, 5]];
    let n = 0;
    for (let tries = 0; tries < 400 && n < 46; tries++) {
      const a = rng() * Math.PI * 2, r = 20 + rng() * 78;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (height(x, z) < 0.8) continue;
      if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
      if (Math.abs(z - riverZ(x)) < 8 && x < -40) continue;
      addTree(this.scene, this.physics, x, z, rng, 0.8 + rng() * 0.6);
      n++;
    }
    for (let k = 0; k < 24; k++) {
      const a = rng() * Math.PI * 2, r = 15 + rng() * 85;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
      addRock(this.scene, this.physics, x, z, 0.6 + rng() * 1.2, rng() < 0.6);
    }
  }

  buildBerries() {
    this.berryLine(0, 66, 0, 44, 6);
    this.berryLine(-4, 36, -8, 18, 5);
    this.berryLine(10, -10, 24, -18, 5);
    this.berryRing(-45, 0.9, 26, 8, 10);
    this.berryLine(-56, -52, -40, -42, 5);
    this.berryLine(14, -60, 22, -40, 5);
    this.berryLine(70, 18, 50, 12, 5);
    this.berryLine(-18, -18, -21, -10, 3);
  }

  // ---------- interactions ----------
  breakBox(b, player) {
    if (!b.enabled) return;
    b.enabled = false;
    b.mesh.visible = false;
    const c = b.mesh.position.clone();
    this.game.particles.burst(c, '#b3a18d', 30, 7, 2);
    this.game.audio.play('break');
    if (player) this.game.hud.message('Smash! The wall crumbles.', 2);
  }

  onPound(player, box) {
    for (const bell of this.bells) {
      if (bell.rung) continue;
      const d = Math.hypot(player.pos.x - bell.pos.x, player.pos.z - bell.pos.z);
      if (d < 1.2 && Math.abs(player.pos.y - bell.pos.y) < 0.6) this.ringBell(bell);
    }
    void box;
  }

  ringBell(bell) {
    bell.rung = true;
    bell.swing = 1;
    bell.button.material = M.green;
    bell.button.scale.y = 0.4;
    this.game.audio.play('bell');
    const n = this.bells.filter((b) => b.rung).length;
    this.vaultLights[n - 1].material = M.green;
    if (n === 3) {
      this.vaultOpen = true;
      this.game.audio.play('door');
      this.game.hud.message('All three bells ring out! The Bell Vault rumbles open.', 4);
    } else {
      this.game.hud.message(`Bell ${n} of 3 rung!`, 2.5);
    }
  }

  twinPound(center) {
    if (this.crackWall && this.crackWall.enabled && this.crackWall.mesh.position.distanceTo(center) < 9) this.breakBox(this.crackWall, null);
  }

  respawnPoint() { return this.activeCheckpoint.pos; }

  // ---------- per-step update ----------
  update(dt) {
    const g = this.game;
    this.t += dt;
    const players = g.players.filter((p) => p.active);

    // moving platforms
    for (const mv of this.movers) {
      const off = Math.sin(this.t * mv.speed) * mv.amp;
      const d = off - mv.last;
      mv.last = off;
      this.physics.moveBox(mv.b, 0, 0, d);
      mv.b.mesh.position.z += d;
    }

    // crumbling platforms
    for (const b of this.crumbles) {
      if (b.crumbleT >= 0) {
        b.crumbleT -= dt;
        b.mesh.position.x = b.home.x + Math.sin(this.t * 60) * 0.06;
        if (b.crumbleT < 0) {
          b.enabled = false;
          b.respawnT = 4;
          g.particles.burst(b.mesh.position, '#e7a36a', 14, 4, 1.5);
        }
      } else if (!b.enabled) {
        b.respawnT -= dt;
        b.mesh.position.y -= dt * 6;
        b.mesh.visible = b.respawnT > 3;
        if (b.respawnT <= 0) {
          b.enabled = true;
          b.mesh.visible = true;
          b.mesh.position.copy(b.home);
        }
      }
    }

    for (const s of this.springs) {
      s.squash = Math.max(0, (s.squash || 0) - dt * 5);
      s.mesh.scale.y = 1 - s.squash * 0.5;
    }

    // bells
    for (const bell of this.bells) {
      bell.hub.rotation.z += dt * (bell.rung ? 2.2 : 0.5);
      bell.swing = Math.max(0, bell.swing - dt * 0.4);
      bell.bellPivot.rotation.x = Math.sin(this.t * 8) * 0.6 * bell.swing;
    }
    if (this.vaultOpen && this.vaultDoor.enabled !== false) {
      const m = this.vaultDoor.mesh;
      m.position.y -= dt * 1.2;
      if (m.position.y < this.vaultDoor.home.y - 3.6) { this.vaultDoor.enabled = false; m.visible = false; }
    }

    // pressure plates
    const solo = g.playerCount < 2;
    let pressed = 0;
    for (const pl of this.plates) {
      const on = players.some((p) => p.groundBox === pl && p.grounded);
      if (on) pl.pressedT = solo ? 6 : 0.05;
      else pl.pressedT -= dt;
      const down = pl.pressedT > 0;
      if (down) pressed++;
      pl.mesh.position.y = pl.home - (down ? 0.15 : 0);
      pl.mesh.material = down ? M.green : M.red;
    }
    if (!this.cageOpen && pressed === 2) {
      this.cageOpen = true;
      this.cageBox.enabled = false;
      g.audio.play('switch');
      g.audio.play('door');
      g.hud.message('Click! Both plates are down. The cage opens!', 3);
    }
    if (this.cageOpen && this.cage.position.y > -10) this.cage.position.y -= dt * 2;

    // ring dash
    const R = this.race;
    if (!R.active && !this.prisms.find((p) => p.id === 'rings').collected && !R.won) {
      if (players.some((p) => p.groundBox === this.raceStart)) {
        R.active = true; R.time = 25; R.next = 0;
        this.rings.forEach((r) => { r.done = false; r.mat.opacity = 0.9; r.mat.emissiveIntensity = 0.8; });
        g.audio.play('checkpoint');
        g.hud.message('Ring Dash! Go go go!', 2);
      }
    }
    if (R.active) {
      R.time -= dt;
      g.hud.timer(R.time);
      for (const r of this.rings) {
        if (r.done) continue;
        if (players.some((p) => p.pos.clone().add(new THREE.Vector3(0, 0.55, 0)).distanceTo(r.pos) < 1.6)) {
          r.done = true;
          r.mat.opacity = 0.15;
          r.mat.emissiveIntensity = 0;
          g.audio.play('ring');
          g.particles.burst(r.pos, '#ffd23f', 12, 4);
        }
      }
      const left = this.rings.filter((r) => !r.done).length;
      if (left === 0) {
        R.active = false; R.won = true;
        g.hud.timer(null);
        this.revealPrism('rings');
      } else if (R.time <= 0) {
        R.active = false;
        g.hud.timer(null);
        this.rings.forEach((r) => { r.mat.opacity = 0.35; r.mat.emissiveIntensity = 0.3; });
        g.hud.message(`Out of time! ${left} ring${left > 1 ? 's' : ''} left. Step on the stump to try again.`, 3);
      }
    }

    // hay bales
    const L = this.baleLane;
    L.timer -= dt;
    if (L.timer <= 0 && players.some((p) => p.pos.distanceTo(new THREE.Vector3(36, p.pos.y, -32)) < 40)) {
      L.timer = 3.2;
      const m = new THREE.Mesh(this.baleGeo, M.hay);
      m.castShadow = true;
      this.scene.add(m);
      this.bales.push({ m, t: 0 });
    }
    const dir = L.b.clone().sub(L.a); const len = dir.length(); dir.normalize();
    for (let i = this.bales.length - 1; i >= 0; i--) {
      const b = this.bales[i];
      b.t += dt * 7;
      if (b.t > len) { g.particles.burst(b.m.position, '#f2c94c', 10, 3); this.scene.remove(b.m); this.bales.splice(i, 1); continue; }
      const x = L.a.x + dir.x * b.t, z = L.a.z + dir.z * b.t;
      b.m.position.set(x, height(x, z) + 0.9, z);
      b.m.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
      b.m.rotation.z = 0;
      b.m.rotateOnAxis(new THREE.Vector3(1, 0, 0), b.t / 0.9);
      for (const p of players) {
        if (!p.alive) continue;
        const d = Math.hypot(p.pos.x - x, p.pos.z - z);
        if (d < 1.2 && p.pos.y < b.m.position.y + 0.8) p.hurt(1, b.m.position);
      }
    }
  }

  // ---------- per-frame visuals + pickups ----------
  frame(dt, t) {
    const g = this.game;
    const players = g.players.filter((p) => p.active && p.alive);
    const centre = (p) => p.pos.clone().add(new THREE.Vector3(0, 0.55, 0));

    for (const p of this.prisms) {
      if (p.collected) continue;
      p.rise = Math.max(0, p.rise - dt * 0.8);
      p.g.position.set(p.pos.x, p.pos.y + Math.sin(t * 2) * 0.15 - p.rise * 2, p.pos.z);
      p.gem.rotation.y = t * 1.6;
      p.halo.rotation.x = Math.PI / 2 + Math.sin(t) * 0.3;
      p.halo.rotation.y = t * 0.7;
      p.gemMat.emissive.setHSL((t * 0.15) % 1, 0.9, 0.55);
      if (p.hidden) continue;
      if (Math.random() < dt * 6) g.particles.sparkle(p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5))), '#fff6c8', 1);
      for (const pl of players) {
        if (centre(pl).distanceTo(p.pos) < 1.4) {
          p.collected = true;
          p.g.visible = false;
          g.collectPrism(p, pl);
          break;
        }
      }
    }

    for (const b of this.berries) {
      if (b.taken) continue;
      b.m.position.y = b.pos.y + Math.sin(t * 3 + b.phase) * 0.12;
      b.m.rotation.y = t * 2 + b.phase;
      for (const pl of players) {
        if (centre(pl).distanceTo(b.m.position) < 1.0) {
          b.taken = true;
          b.m.visible = false;
          g.collectBerry(pl, b);
          break;
        }
      }
    }

    for (const d of this.drops) {
      if (d.taken) continue;
      d.m.position.y = d.pos.y + Math.sin(t * 2.5) * 0.15;
      d.m.rotation.y = t * 1.5;
      for (const pl of players) {
        if (centre(pl).distanceTo(d.m.position) < 1.1) {
          d.taken = true;
          d.m.visible = false;
          this.paintFound++;
          g.particles.paint(d.pos, 20);
          g.audio.play('drop');
          g.hud.message(`Paint Drop ${this.paintFound} of ${this.drops.length}!`, 2);
          if (this.paintFound === this.drops.length) this.revealPrism('paint');
          break;
        }
      }
    }

    for (const c of this.checkpoints) {
      c.flag.rotation.y = Math.sin(t * 3 + c.pos.x) * 0.2;
      if (c.on) continue;
      if (players.some((p) => p.pos.distanceTo(c.pos) < 2.2)) {
        this.checkpoints.forEach((o) => { o.on = false; o.flagMat.color.set('#9a9aa2'); });
        c.on = true;
        c.flagMat.color.set('#ff5fa2');
        this.activeCheckpoint = c;
        g.audio.play('checkpoint');
        g.particles.burst(c.pos.clone().add(new THREE.Vector3(0, 2.3, 0)), '#ff5fa2', 14, 4);
        g.hud.message('Checkpoint!', 1.5);
      }
    }

    let hint = null, best = 3.2;
    for (const s of this.signs) {
      for (const pl of players) {
        const d = pl.pos.distanceTo(s.pos);
        if (d < best) { best = d; hint = s.text; }
      }
    }
    g.hud.hint(hint);
  }
}
