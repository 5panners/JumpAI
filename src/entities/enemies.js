import * as THREE from 'three';
import { JUMP, ACTION } from '../config.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const GREY = new THREE.Color('#8d8d94');

// Base enemy. Starts grey (drained by the Hush-blight); defeat restores colour.
class Enemy {
  constructor(game, x, z) {
    this.game = game;
    this.home = new THREE.Vector3(x, game.physics.terrain(x, z), z);
    this.pos = this.home.clone();
    this.vel = new THREE.Vector3();
    this.alive = true;
    this.radius = 0.6;
    this.height = 1.0;
    this.facing = Math.random() * Math.PI * 2;
    this.t = Math.random() * 10;
    this.stun = 0;
    this.respawnT = 0;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.colorMats = [];
  }

  tint(m, color) {
    m.userData.real = new THREE.Color(color);
    m.color.copy(GREY).lerp(m.userData.real, 0.15);
    this.colorMats.push(m);
    return m;
  }

  nearestPlayer(maxD = Infinity) {
    let best = null, bd = maxD;
    for (const p of this.game.players) {
      if (!p.active || !p.alive || p.state === 'held') continue;
      const d = p.pos.distanceTo(this.pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { p: best, d: bd } : null;
  }

  defeat(by) {
    if (!this.alive) return;
    this.alive = false;
    this.group.visible = false;
    this.respawnT = 25;
    const c = this.pos.clone().add(new THREE.Vector3(0, this.height * 0.6, 0));
    this.game.particles.paint(c, 26);
    this.game.audio.play('pop');
    this.game.level.spawnBerry(c.clone().add(new THREE.Vector3(0, 0.3, 0)));
    this.game.stats.enemies++;
  }

  tick(dt) {
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && !this.nearestPlayer(25)) {
        this.alive = true;
        this.group.visible = true;
        this.pos.copy(this.home);
      }
      return false;
    }
    this.t += dt;
    this.stun -= dt;
    return true;
  }
}

export class Grumblebud extends Enemy {
  constructor(game, x, z) {
    super(game, x, z);
    this.state = 'wander';
    this.timer = 0;
    this.target = this.home.clone();
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), this.tint(mat('#8bd35c'), '#8bd35c'));
    bulb.scale.set(1, 1.15, 1);
    bulb.position.y = 0.6;
    bulb.castShadow = true;
    this.group.add(bulb);
    this.body = bulb;
    const petalMat = this.tint(mat('#ff4f8b', { side: THREE.DoubleSide }), '#ff4f8b');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), petalMat);
      p.scale.set(1, 0.4, 0.6);
      p.position.set(Math.cos(a) * 0.3, 1.25, Math.sin(a) * 0.3);
      p.rotation.y = -a;
      p.rotation.z = 0.6;
      this.group.add(p);
    }
    // grumpy brow + eyes
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat('#ffffff'));
      e.position.set(0.18 * s, 0.75, 0.47);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat('#111'));
      pu.position.set(0.18 * s, 0.73, 0.56);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), mat('#2d4a1c'));
      brow.position.set(0.18 * s, 0.88, 0.52);
      brow.rotation.z = 0.45 * s;
      this.group.add(e, pu, brow);
    }
    const footMat = this.tint(mat('#5a9a3a'), '#5a9a3a');
    this.feet = [-1, 1].map((s) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), footMat);
      f.scale.set(1, 0.6, 1.4);
      f.position.set(0.22 * s, 0.08, 0.05);
      this.group.add(f);
      return f;
    });
  }

  update(dt) {
    if (!this.tick(dt)) return;
    const near = this.nearestPlayer(10);
    const speedMap = { wander: 1.2, chase: 3.2, windup: 0, butt: 8.5, recover: 0 };
    this.timer -= dt;
    if (this.stun > 0) { this.state = 'recover'; }
    switch (this.state) {
      case 'wander':
        if (this.timer <= 0 || this.pos.distanceTo(this.target) < 0.5) {
          this.timer = 2 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2;
          this.target.set(this.home.x + Math.cos(a) * 6, 0, this.home.z + Math.sin(a) * 6);
        }
        if (near) this.state = 'chase';
        break;
      case 'chase':
        if (!near || this.pos.distanceTo(this.home) > 16) { this.state = 'wander'; break; }
        this.target.copy(near.p.pos);
        if (near.d < 2.4) { this.state = 'windup'; this.timer = 0.55; }
        break;
      case 'windup':
        if (near) this.target.copy(near.p.pos);
        if (this.timer <= 0) { this.state = 'butt'; this.timer = 0.32; }
        break;
      case 'butt':
        if (this.timer <= 0) { this.state = 'recover'; this.timer = 0.8; }
        break;
      case 'recover':
        if (this.timer <= 0 && this.stun <= 0) this.state = near ? 'chase' : 'wander';
        break;
      default: break;
    }
    const sp = speedMap[this.state];
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    if (this.state !== 'butt' && Math.hypot(dx, dz) > 0.1) this.facing = Math.atan2(dx, dz);
    this.pos.x += Math.sin(this.facing) * sp * dt;
    this.pos.z += Math.cos(this.facing) * sp * dt;
    const g = this.game.physics.groundBelow(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.3, 0.6);
    this.pos.y = g.y;
    if (this.pos.y < -0.2) { this.pos.x -= Math.sin(this.facing) * sp * dt * 2; this.pos.z -= Math.cos(this.facing) * sp * dt * 2; this.target.copy(this.home); }

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;
    const bob = Math.abs(Math.sin(this.t * (sp + 2) * 2)) * 0.08;
    this.body.position.y = 0.6 + bob;
    this.feet.forEach((f, i) => { f.position.z = 0.05 + Math.sin(this.t * (sp + 2) * 2 + i * Math.PI) * 0.15; });
    if (this.state === 'windup') {
      this.group.rotation.x = -0.25;
      this.body.scale.set(1.08, 1.05 + Math.sin(this.t * 40) * 0.05, 1.08);
    } else if (this.state === 'butt') {
      this.group.rotation.x = 0.35;
    } else {
      this.group.rotation.x = 0;
      this.body.scale.set(1, 1.15, 1);
    }
    if (this.stun > 0) this.group.rotation.z = Math.sin(this.t * 20) * 0.2; else this.group.rotation.z = 0;
  }

  attacking() { return this.state === 'butt'; }
}

export class Puffpaw extends Enemy {
  constructor(game, x, z) {
    super(game, x, z);
    this.radius = 0.9;
    this.height = 1.6;
    this.hover = 2.6;
    this.state = 'drift';
    this.timer = 2 + Math.random() * 2;
    const seedMat = this.tint(mat('#f6f6f6', { emissive: '#ffffff', emissiveIntensity: 0.15 }), '#fff8e8');
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), this.tint(mat('#ffcf5a'), '#ffcf5a'));
    this.group.add(core);
    this.core = core;
    const puff = new THREE.Group();
    for (let i = 0; i < 40; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), seedMat);
      s.position.copy(v.multiplyScalar(0.75));
      puff.add(s);
    }
    this.group.add(puff);
    this.puff = puff;
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat('#222'));
      e.position.set(0.17 * s, 0.1, 0.4);
      this.group.add(e);
    }
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), this.tint(mat('#ff9cc0'), '#ff9cc0'));
    cheek.position.set(0, -0.12, 0.38);
    cheek.scale.set(1.2, 0.8, 0.6);
    this.group.add(cheek);
    this.cheek = cheek;
  }

  update(dt) {
    if (!this.tick(dt)) return;
    this.timer -= dt;
    const near = this.nearestPlayer(12);
    if (this.state === 'drift') {
      const a = this.t * 0.4;
      this.pos.x = this.home.x + Math.cos(a) * 4;
      this.pos.z = this.home.z + Math.sin(a) * 4;
      if (near) this.facing = Math.atan2(near.p.pos.x - this.pos.x, near.p.pos.z - this.pos.z);
      if (this.timer <= 0 && near && near.d < 9 && this.stun <= 0) { this.state = 'inhale'; this.timer = 0.7; this.game.audio.play('wind'); }
    } else if (this.state === 'inhale') {
      if (this.timer <= 0) { this.state = 'blow'; this.timer = 0.6; }
    } else if (this.state === 'blow') {
      const fv = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
      for (const p of this.game.players) {
        if (!p.active || !p.alive || p.state === 'held') continue;
        const d = p.pos.clone().sub(this.pos); d.y = 0;
        const L = d.length();
        if (L < 8 && d.normalize().dot(fv) > 0.6) {
          p.vel.addScaledVector(fv, 26 * dt);
          if (p.grounded && p.state !== 'swim') { p.setState('air', 'knock'); p.vel.y = 3.5; p.airPeakY = p.pos.y; }
        }
      }
      if (Math.random() < 0.6) this.game.particles.spawn(this.pos.clone().addScaledVector(fv, 0.8), fv.clone().multiplyScalar(10).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2)), '#ffffff', 0.6, 0.9, 0, 0.2);
      if (this.timer <= 0) { this.state = 'drift'; this.timer = 3 + Math.random() * 2; }
    }
    const ground = this.game.physics.terrain(this.pos.x, this.pos.z);
    this.pos.y = Math.max(ground, 0) + this.hover + Math.sin(this.t * 1.5) * 0.3 - 0.8;
    this.group.position.copy(this.pos).add(new THREE.Vector3(0, 0.8, 0));
    this.group.rotation.y = this.facing;
    const swell = this.state === 'inhale' ? 1 + (0.7 - this.timer) * 0.6 : this.state === 'blow' ? 0.9 : 1;
    this.puff.scale.setScalar(swell);
    this.puff.rotation.y += dt * 0.5;
    this.cheek.scale.set(1.2 * swell, 0.8 * swell, 0.6);
    this.core.material.emissive = this.core.material.emissive || new THREE.Color();
    if (this.state === 'inhale') this.core.material.emissive.set('#ff8a3d'); else this.core.material.emissive.set('#000000');
    if (this.stun > 0) this.group.rotation.z = Math.sin(this.t * 20) * 0.25; else this.group.rotation.z = 0;
  }

  attacking() { return false; }
}

// Player vs enemy contact rules shared by every regular enemy.
export function resolveEnemyContacts(game) {
  for (const e of game.enemies) {
    if (!e.alive) continue;
    for (const p of game.players) {
      if (!p.active || !p.alive || p.state === 'held') continue;
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const hd = Math.hypot(dx, dz);
      const reach = e.radius + p.radius;
      const pBottom = p.pos.y, pTop = p.pos.y + p.height;
      const eBottom = e.pos.y, eTop = e.pos.y + e.height;
      // punch hitbox in front
      if (p.punchT > 0 && !p.punchHit) {
        const fv = p.facingVec();
        const hit = p.pos.clone().addScaledVector(fv, 0.9);
        if (Math.hypot(hit.x - e.pos.x, hit.z - e.pos.z) < e.radius + 0.6 && pBottom < eTop && pTop > eBottom - 0.5) {
          p.punchHit = true;
          e.defeat(p);
          continue;
        }
      }
      if (hd > reach || pBottom > eTop + 0.1 || pTop < eBottom) continue;
      const fromAbove = p.vel.y < 0 && p.prev.y >= eTop - 0.35;
      if (['dive', 'roll', 'slide', 'pound', 'belly'].includes(p.state) || (p.jumpKind === 'toss' && p.state === 'air')) {
        e.defeat(p);
        if (p.state === 'pound') { p.setState('air', 'single'); p.vel.set(0, JUMP.stompBounce, 0); }
        continue;
      }
      if (fromAbove) {
        e.defeat(p);
        p.pos.y = Math.max(p.pos.y, eTop);
        p.launch('single', p.game.inputFor(p).jump ? JUMP.stompBounceHeld : JUMP.stompBounce, p.vel.x, p.vel.z);
        p.jumpCut = true;
        p.game.audio.play('stomp');
        continue;
      }
      if (p.invuln <= 0) {
        p.hurt(1, e.pos);
        if (e.stun !== undefined) e.stun = 0.6;
      }
    }
  }
}

export function twinPoundWave(game, center) {
  for (const e of game.enemies) {
    if (!e.alive) continue;
    if (e.pos.distanceTo(center) < ACTION.twinPoundRadius) e.defeat(null);
  }
}
