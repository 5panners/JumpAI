import * as THREE from 'three';
import { JUMP } from '../config.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

// Thistlequeen: World 1 boss. Rolls thorn balls, then gets dizzy and lowers
// her crown. Three crown hits win. In phase 3 her crown stays high, so in
// co-op it takes a Boost Jump or a Toss to reach it.
export class Thistlequeen {
  constructor(game, center) {
    this.game = game;
    this.center = center.clone();
    this.pos = center.clone();
    this.state = 'sleep';
    this.timer = 0;
    this.hits = 0;
    this.t = 0;
    this.balls = [];
    this.volley = 0;
    this.defeated = false;
    this.radius = 2.4;
    this.crownHigh = 5.4;
    this.crownLow = 3.5;
    this.crownY = this.crownHigh;

    const g = new THREE.Group();
    this.group = g;
    this.bodyMat = mat('#8a8f86', { flatShading: true });
    this.realBody = new THREE.Color('#6fcf5a');
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), this.bodyMat);
    body.position.y = 2.4;
    body.castShadow = true;
    g.add(body);
    this.body = body;
    // thorns
    const thornMat = mat('#6a6e66', { flatShading: true });
    this.thornMat = thornMat;
    const ico = new THREE.IcosahedronGeometry(2.4, 1);
    const p = ico.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      if (v.y < -1.2) continue;
      const th = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 5), thornMat);
      th.position.copy(v).multiplyScalar(1.05).add(new THREE.Vector3(0, 2.4, 0));
      th.lookAt(th.position.clone().add(v));
      th.rotateX(Math.PI / 2);
      g.add(th);
    }
    // face
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), mat('#ffffff'));
      e.position.set(0.8 * s, 3.0, 2.0);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat('#2a0a2a'));
      pu.position.set(0.8 * s, 2.95, 2.3);
      g.add(e, pu);
    }
    // crown: the weak point
    const crown = new THREE.Group();
    this.crownMat = mat('#b8b2c8', { metalness: 0.4, roughness: 0.3, emissive: '#000000' });
    this.realCrown = new THREE.Color('#ff5fb8');
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 10), this.crownMat);
    crown.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const pt = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 5), this.crownMat);
      pt.position.set(Math.cos(a) * 0.85, 0.55, Math.sin(a) * 0.85);
      crown.add(pt);
    }
    crown.position.y = this.crownY - 0.3;
    g.add(crown);
    this.crown = crown;
    g.position.copy(this.pos);
    game.scene.add(g);

    // standable crown top (collider tracks the crown height)
    this.crownBox = game.physics.addPlatform(this.pos.x, this.pos.y + this.crownY, this.pos.z, 1.8, 0.4, 1.8, { noLedge: true });
    this.bodyBox = game.physics.addBox(this.pos.x, this.pos.y + 1.5, this.pos.z, 3.2, 3.0, 3.2, { noLedge: true });

    this.ballGeo = new THREE.IcosahedronGeometry(0.8, 0);
    this.ballMat = mat('#7c8a6a', { flatShading: true });
  }

  setCrownY(y) {
    const top = this.pos.y + y;
    const b = this.crownBox;
    const dy = top - b.max.y;
    this.game.physics.moveBox(b, 0, dy, 0);
    this.crownY = y;
    this.crown.position.y = y - 0.3;
  }

  activePlayers() { return this.game.players.filter((p) => p.active && p.alive); }

  update(dt) {
    this.t += dt;
    this.crownBox.delta.set(0, 0, 0);
    if (this.defeated) {
      this.body.rotation.y += dt * 0.5;
      this.group.position.y = this.pos.y + Math.abs(Math.sin(this.t * 2)) * 0.2;
      return;
    }
    const players = this.activePlayers();
    const inArena = players.some((p) => p.pos.distanceTo(this.center) < 14);
    this.timer -= dt;

    switch (this.state) {
      case 'sleep':
        this.body.scale.y = 1 + Math.sin(this.t * 1.5) * 0.03;
        if (inArena) {
          this.state = 'roar'; this.timer = 1.4;
          this.game.audio.play('bossRoar');
          this.game.hud.message('Thistlequeen awakens! Wait until she is dizzy, then pound her crown.', 4);
          this.game.hud.bossBar(true, this.hits);
        }
        break;
      case 'roar':
        this.body.scale.setScalar(1 + Math.sin(this.t * 30) * 0.03);
        if (this.timer <= 0) { this.state = 'attack'; this.timer = 0.4; this.volley = 0; }
        break;
      case 'attack':
        if (this.timer <= 0) {
          this.throwVolley(players);
          this.volley++;
          this.timer = this.hits >= 1 ? 1.4 : 1.9;
          if (this.volley >= 3 + this.hits) { this.state = 'dizzyIn'; this.timer = 1.6; }
        }
        this.group.rotation.y += dt * (0.6 + this.hits * 0.4);
        break;
      case 'dizzyIn':
        if (this.timer <= 0) {
          this.state = 'dizzy';
          this.timer = 5;
          const solo = players.length < 2 || this.game.playerCount < 2;
          this.lowered = this.hits < 2 || solo;
          this.game.hud.message(this.lowered ? 'She is dizzy! Jump high and pound her crown!' : 'Her crown is out of reach. Toss or Boost Jump your partner up!', 3);
        }
        break;
      case 'dizzy': {
        const target = this.lowered ? this.crownLow : this.crownHigh;
        this.setCrownY(THREE.MathUtils.lerp(this.crownY, target, Math.min(1, dt * 4)));
        this.body.rotation.z = Math.sin(this.t * 5) * 0.12;
        this.crownMat.emissive.set('#ffe36e');
        this.crownMat.emissiveIntensity = 0.5 + Math.sin(this.t * 10) * 0.3;
        if (this.timer <= 0) this.recover();
        break;
      }
      case 'hurt':
        this.body.rotation.z = Math.sin(this.t * 25) * 0.2;
        if (this.timer <= 0) {
          if (this.hits >= 3) this.win();
          else { this.state = 'attack'; this.timer = 0.8; this.volley = 0; this.setCrownY(this.crownHigh); }
        }
        break;
      default: break;
    }

    if (this.state !== 'dizzy') {
      this.crownMat.emissiveIntensity = 0;
      if (this.state !== 'hurt' && Math.abs(this.crownY - this.crownHigh) > 0.01) this.setCrownY(THREE.MathUtils.lerp(this.crownY, this.crownHigh, Math.min(1, dt * 3)));
      this.body.rotation.z *= 0.9;
    }

    // crown contact: stomp or pound from above
    for (const p of players) {
      if (this.state === 'dizzy' && p.groundBox === this.crownBox && p.grounded) { this.takeHit(p); break; }
    }

    this.updateBalls(dt);
    this.group.position.copy(this.pos);
  }

  recover() {
    this.state = 'attack';
    this.timer = 0.8;
    this.volley = 0;
    this.game.hud.message('She shook it off!', 1.5);
  }

  takeHit(p) {
    this.hits++;
    this.state = 'hurt';
    this.timer = 1.4;
    this.game.audio.play('bossHit');
    this.game.particles.paint(this.pos.clone().add(new THREE.Vector3(0, this.crownY, 0)), 40);
    this.game.hud.bossBar(true, this.hits);
    // fling the hitter off
    const d = p.pos.clone().sub(this.pos); d.y = 0; d.normalize();
    p.launch('single', JUMP.stompBounceHeld, d.x * 9, d.z * 9);
    p.noFallDamage = true;
    for (const q of this.game.players) {
      if (q !== p && q.groundBox === this.crownBox) { q.launch('single', JUMP.stompBounce, -d.x * 9, -d.z * 9); q.noFallDamage = true; }
    }
    this.bodyMat.color.lerp(this.realBody, 0.33);
    this.thornMat.color.lerp(new THREE.Color('#3f9a3a'), 0.33);
    this.crownMat.color.lerp(this.realCrown, 0.33);
    this.clearBalls();
  }

  win() {
    this.defeated = true;
    this.state = 'done';
    this.bodyMat.color.copy(this.realBody);
    this.crownMat.color.copy(this.realCrown);
    this.setCrownY(this.crownHigh);
    this.game.hud.bossBar(false);
    this.game.hud.message('Thistlequeen is herself again! She leaves you a Prism.', 4);
    this.game.audio.play('win');
    this.game.particles.paint(this.pos.clone().add(new THREE.Vector3(0, 4, 0)), 80);
    this.game.level.revealPrism('boss');
    // a ring of flowers bursts out around her
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), mat(['#ff5fa2', '#ffd23f', '#b07cff'][i % 3], { emissive: '#ffffff', emissiveIntensity: 0.1 }));
      fl.position.set(this.pos.x + Math.cos(a) * 5, this.pos.y + 0.5, this.pos.z + Math.sin(a) * 5);
      this.game.scene.add(fl);
    }
  }

  throwVolley(players) {
    const n = 4 + this.hits * 2;
    const aim = players.length ? Math.atan2(players[0].pos.x - this.pos.x, players[0].pos.z - this.pos.z) : 0;
    for (let i = 0; i < n; i++) {
      const a = aim + (i - (n - 1) / 2) * (Math.PI * 2 / n);
      const m = new THREE.Mesh(this.ballGeo, this.ballMat);
      m.castShadow = true;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const p = this.pos.clone().addScaledVector(dir, 2.8);
      p.y = this.pos.y + 0.8;
      m.position.copy(p);
      this.game.scene.add(m);
      this.balls.push({ m, dir, speed: 6 + this.hits * 1.5, life: 4 });
    }
    this.game.audio.play('bossRoar');
  }

  clearBalls() {
    for (const b of this.balls) { this.game.scene.remove(b.m); this.game.particles.burst(b.m.position, '#9fd36a', 6, 3); }
    this.balls = [];
  }

  updateBalls(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.life -= dt;
      b.m.position.addScaledVector(b.dir, b.speed * dt);
      b.m.rotation.x += dt * b.speed;
      if (b.m.position.distanceTo(this.center) > 17 || b.life <= 0) {
        this.game.scene.remove(b.m);
        this.balls.splice(i, 1);
        continue;
      }
      for (const p of this.game.players) {
        if (!p.active || !p.alive || p.state === 'held') continue;
        const d = Math.hypot(p.pos.x - b.m.position.x, p.pos.z - b.m.position.z);
        if (d < 1.1 && p.pos.y < b.m.position.y + 0.7) p.hurt(1, b.m.position);
      }
    }
    // touching her body hurts
    for (const p of this.game.players) {
      if (!p.active || !p.alive) continue;
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (d < 2.3 && p.pos.y < this.pos.y + 2.9 && p.groundBox !== this.crownBox) p.hurt(1, this.pos);
    }
  }
}
