import * as THREE from 'three';
import { GRAVITY, FALL_GRAVITY_MULT, TERMINAL_FALL, MOVE, JUMP, ACTION, HEALTH, WATER_LEVEL, HERO_RADIUS, HERO_HEIGHT } from '../config.js';
import { buildHero } from './heroModels.js';

const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

const GROUND_STATES = new Set(['ground', 'poundLand', 'belly', 'slide', 'roll']);
const CUTTABLE = new Set(['single', 'double']);
const FLIP_KINDS = { triple: 0.55, backflip: 0.7, sideflip: 0.6, toss: 0.8, boost: 0.6 };

export const HEROES = {
  tali: { name: 'Tali', color: '#ff8a3d', marker: '#2bb7ff' },
  bram: { name: 'Bram', color: '#a9743f', marker: '#ffcf3a' },
};

export class Player {
  constructor(game, index, kind) {
    this.game = game;
    this.index = index;
    this.kind = kind;
    this.def = HEROES[kind];
    this.radius = HERO_RADIUS;
    this.height = HERO_HEIGHT;
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = Math.PI;
    this.speed = 0;
    this.active = true;
    this.health = HEALTH.max;
    this.air = HEALTH.airMax;
    this.state = 'air';
    this.stateTime = 0;
    this.jumpKind = 'fall';
    this.groundBox = null;
    this.lastSafe = new THREE.Vector3();
    this.safeTimer = 0;
    this.coyoteT = 0; this.jumpBufferT = 0; this.chainT = 0; this.chainCount = 0;
    this.skidT = 0; this.skidDir = 0;
    this.wallT = 0; this.wallN = new THREE.Vector3();
    this.invuln = 0; this.punchT = 0; this.punchHit = false;
    this.diveUsed = false; this.glideT = 0; this.jumpCut = false;
    this.airMaxSpeed = MOVE.runSpeed;
    this.airPeakY = 0; this.noFallDamage = false;
    this.ledgeBox = null; this.ledgeN = new THREE.Vector3(); this.ledgeCooldown = 0; this.ledgePushT = 0;
    this.swimMode = 'surface'; this.waterTime = 0; this.drownT = 0;
    this.carrying = null; this.holder = null;
    this.rollT = 0;
    this.crouching = false;
    this.lastPoundTime = -10;
    this.landSquash = 0;
    this.runPhase = 0;
    this.flip = 0;
    this.stats = { jumps: 0 };

    this.rig = buildHero(kind);
    game.scene.add(this.rig.root);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 20),
      new THREE.MeshBasicMaterial({ color: '#10202a', transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    game.scene.add(this.shadow);

    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.24, 4),
      new THREE.MeshBasicMaterial({ color: this.def.marker }),
    );
    this.marker.rotation.x = Math.PI;
    game.scene.add(this.marker);
  }

  get partner() {
    const o = this.game.players.find((p) => p !== this);
    return o && o.active ? o : null;
  }

  get grounded() { return GROUND_STATES.has(this.state); }
  get alive() { return this.state !== 'bubble'; }

  spawn(p, facing = Math.PI) {
    this.pos.copy(p);
    this.prev.copy(p);
    this.vel.set(0, 0, 0);
    this.lastSafe.copy(p);
    this.facing = facing;
    this.speed = 0;
    this.setState('air', 'fall');
    this.airPeakY = p.y;
    this.carrying = null; this.holder = null;
    this.air = HEALTH.airMax;
  }

  setState(s, kind) {
    this.state = s;
    this.stateTime = 0;
    if (kind !== undefined) this.jumpKind = kind;
  }

  horizSpeed() { return Math.hypot(this.vel.x, this.vel.z); }

  facingVec(out = new THREE.Vector3()) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  // ---- main update (fixed step) ----
  update(dt, inp, camYaw) {
    if (!this.active) return;
    const g = this.game;
    this.stateTime += dt;
    this.coyoteT -= dt; this.jumpBufferT -= dt; this.chainT -= dt; this.skidT -= dt;
    this.wallT -= dt; this.invuln -= dt; this.punchT -= dt; this.ledgeCooldown -= dt; this.rollT -= dt;
    if (inp.jumpPressed) this.jumpBufferT = MOVE.jumpBuffer;

    // ride moving platforms
    if (this.groundBox && (this.grounded || this.state === 'ledge')) {
      this.pos.add(this.groundBox.delta);
    }
    if (this.state === 'ledge' && this.ledgeBox) this.pos.add(this.ledgeBox.delta);

    const f = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const r = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const wish = f.multiplyScalar(inp.moveY).add(r.multiplyScalar(inp.moveX));
    const mag = Math.min(1, wish.length());
    if (mag > 0.001) wish.normalize();

    this.prev.copy(this.pos);

    if (inp.grabPressed) {
      if (this.carrying) this.throwCarried(wish, mag);
      else if (this.state === 'ground') this.tryGrab();
    }

    switch (this.state) {
      case 'bubble': this.updateBubble(dt); return;
      case 'held': this.updateHeld(dt, inp); return;
      case 'ledge': this.updateLedge(dt, inp, wish, mag); return;
      case 'swim': this.updateSwim(dt, inp, wish, mag); break;
      case 'poundSpin':
        this.vel.set(0, 0, 0);
        if (this.stateTime >= ACTION.poundSpin) { this.setState('pound'); this.vel.y = ACTION.poundSpeed; }
        break;
      case 'pound':
        this.vel.x = 0; this.vel.z = 0; this.vel.y = ACTION.poundSpeed;
        break;
      case 'poundLand':
        this.vel.x = 0; this.vel.z = 0;
        if (this.stateTime > ACTION.poundRecover) this.setState('ground');
        if (this.jumpBufferT > 0 && this.stateTime > 0.05) this.groundJump(inp, wish, mag);
        break;
      case 'belly': this.updateBelly(dt, inp, wish, mag); break;
      case 'slide': this.updateSlide(dt, inp, wish, mag); break;
      case 'roll': this.updateRoll(dt, inp, wish, mag); break;
      case 'dive': this.updateAir(dt, inp, wish, mag, true); break;
      case 'ground': this.updateGround(dt, inp, wish, mag); break;
      default: this.updateAir(dt, inp, wish, mag, false); break;
    }

    // integrate
    this.pos.addScaledVector(this.vel, dt);
    const wasGrounded = this.grounded;
    const res = g.physics.resolve(this, this.prev);

    // ground snapping when walking down slopes and steps
    if (!res.grounded && wasGrounded && this.vel.y <= 0.01) {
      const below = g.physics.groundBelow(this.pos.x, this.pos.z, this.pos.y, 0.2, 0.05);
      if (this.pos.y - below.y < 0.45) {
        this.pos.y = below.y;
        res.grounded = true;
        res.groundBox = below.box;
      }
    }

    this.afterCollide(res, inp, wish, mag, wasGrounded);
    this.checkWater(dt);

    if (this.pos.y < -15) {
      this.pos.copy(this.lastSafe).add(new THREE.Vector3(0, 0.5, 0));
      this.vel.set(0, 0, 0);
      this.setState('air', 'fall');
      this.airPeakY = this.pos.y;
      this.hurt(1, null, true);
    }

    if (this.carrying) {
      const c = this.carrying;
      if (c.state !== 'held' || c.holder !== this) this.carrying = null;
    }
  }

  // ---- ground ----
  updateGround(dt, inp, wish, mag) {
    this.crouching = inp.crouch && this.speed < 3;
    if (this.groundJump(inp, wish, mag)) return;

    const runMax = MOVE.runSpeed * (this.carrying ? 0.6 : 1);
    if (this.skidT > 0) {
      this.speed = approach(this.speed, 0, 40 * dt);
      if (this.skidT - dt <= 0) { this.facing = this.skidDir; this.speed = Math.min(this.speed, 2); }
    } else if (mag > 0.1 && !this.crouching && this.punchT <= 0) {
      const target = Math.atan2(wish.x, wish.z);
      const diff = wrap(target - this.facing);
      if (Math.abs(diff) > 2.3 && this.speed > 5.5) {
        this.skidT = MOVE.skidTime;
        this.skidDir = target;
        this.game.particles.dust(this.pos, 6);
        this.game.audio.play('skid');
      } else {
        const rate = THREE.MathUtils.lerp(MOVE.turnRateSlow, MOVE.turnRateFast, this.speed / MOVE.runSpeed);
        this.facing = wrap(this.facing + THREE.MathUtils.clamp(diff, -rate * dt, rate * dt));
        const turnPenalty = 1 - 0.35 * Math.min(1, Math.abs(diff) / 1.6);
        const target2 = mag * runMax * turnPenalty;
        this.speed = this.speed < target2
          ? Math.min(target2, this.speed + MOVE.accel * dt)
          : Math.max(target2, this.speed - MOVE.groundDecel * 0.5 * dt);
      }
    } else {
      this.speed = approach(this.speed, 0, MOVE.groundDecel * dt);
    }
    this.vel.x = Math.sin(this.facing) * this.speed;
    this.vel.z = Math.cos(this.facing) * this.speed;
    this.vel.y = 0;

    if (inp.crouchPressed && this.speed > ACTION.slideMinSpeed && !this.carrying) {
      if (this.kind === 'bram') {
        this.setState('roll');
        this.rollT = ACTION.rollTime;
        this.speed = Math.max(this.speed, ACTION.rollSpeed);
        this.game.audio.play('roll');
      } else {
        this.setState('slide');
      }
      return;
    }
    if (inp.attackPressed && !this.carrying) {
      if (this.speed >= 5) { this.startDive(true); return; }
      this.punchT = ACTION.punchTime;
      this.punchHit = false;
      this.game.audio.play('punch');
    }
  }

  groundJump(inp, wish, mag) {
    if (this.jumpBufferT <= 0) return false;
    if (!(this.grounded || this.coyoteT > 0)) return false;
    this.jumpBufferT = 0;
    this.coyoteT = 0;
    const hs = Math.max(this.speed, this.horizSpeed());
    let kind = 'single';
    let vy = JUMP.single;
    const fv = this.facingVec();
    let hx = fv.x * hs, hz = fv.z * hs;
    if (this.carrying) {
      vy = JUMP.single * 0.8;
    } else if ((inp.crouch || this.state === 'slide' || this.state === 'roll') && hs > 5.5) {
      kind = 'long';
      vy = JUMP.longJumpUp;
      const s = Math.max(hs * 1.2, JUMP.longJumpSpeed);
      hx = fv.x * s; hz = fv.z * s;
    } else if (inp.crouch && hs < 3) {
      kind = 'backflip';
      vy = JUMP.backflip;
      hx = fv.x * JUMP.backflipBack; hz = fv.z * JUMP.backflipBack;
    } else if (this.skidT > 0 || (mag > 0.5 && hs > 3 && Math.abs(wrap(Math.atan2(wish.x, wish.z) - this.facing)) > 2.3)) {
      kind = 'sideflip';
      vy = JUMP.sideflip;
      this.facing = this.skidT > 0 ? this.skidDir : Math.atan2(wish.x, wish.z);
      this.skidT = 0;
      const nf = this.facingVec();
      hx = nf.x * JUMP.sideflipSpeed; hz = nf.z * JUMP.sideflipSpeed;
    } else {
      if (this.chainT > 0 && hs > 1.5) this.chainCount = Math.min(this.chainCount + 1, 3);
      else this.chainCount = 1;
      if (this.chainCount === 3 && hs < MOVE.tripleMinSpeed) this.chainCount = 1;
      if (this.chainCount === 2) { kind = 'double'; vy = JUMP.double; }
      if (this.chainCount === 3) { kind = 'triple'; vy = JUMP.triple; }
    }
    if (kind !== 'single' && kind !== 'double' && kind !== 'triple') this.chainCount = 0;
    this.launch(kind, vy, hx, hz);
    return true;
  }

  launch(kind, vy, hx, hz) {
    this.vel.set(hx, vy, hz);
    this.setState('air', kind);
    this.jumpCut = false;
    this.diveUsed = false;
    this.glideT = 0;
    this.airPeakY = this.pos.y;
    this.airMaxSpeed = Math.max(MOVE.runSpeed, Math.hypot(hx, hz));
    this.flip = 0;
    this.stats.jumps++;
    this.game.audio.play('jump_' + kind);
    this.game.particles.dust(this.pos, kind === 'single' ? 3 : 6);
  }

  // ---- air ----
  updateAir(dt, inp, wish, mag, diving) {
    if (this.coyoteT > 0 && this.groundJump(inp, wish, mag)) return;
    this.airPeakY = Math.max(this.airPeakY, this.pos.y);

    if (!diving && mag > 0.1 && this.jumpKind !== 'knock') {
      const a = MOVE.accel * MOVE.airControl * (this.jumpKind === 'long' ? 0.5 : 1);
      this.vel.x += wish.x * a * mag * dt * 1.6;
      this.vel.z += wish.z * a * mag * dt * 1.6;
      const hs = this.horizSpeed();
      if (hs > this.airMaxSpeed) { this.vel.x *= this.airMaxSpeed / hs; this.vel.z *= this.airMaxSpeed / hs; }
      if (this.jumpKind !== 'backflip' && hs > 1) {
        const target = Math.atan2(this.vel.x, this.vel.z);
        this.facing = wrap(this.facing + THREE.MathUtils.clamp(wrap(target - this.facing), -5 * dt, 5 * dt));
      }
    }

    if (!this.jumpCut && !inp.jump && this.vel.y > 0 && CUTTABLE.has(this.jumpKind)) {
      this.vel.y *= JUMP.cutFactor;
      this.jumpCut = true;
    }

    const grav = GRAVITY * (this.vel.y > 0 ? 1 : FALL_GRAVITY_MULT) * (this.jumpKind === 'long' ? 0.85 : 1);
    this.vel.y = Math.max(this.vel.y - grav * dt, TERMINAL_FALL);

    // Tali's Scarf Glide
    if (this.kind === 'tali' && inp.jump && this.vel.y < 0 && this.glideT < ACTION.glideTime && !diving && this.jumpKind !== 'knock') {
      this.glideT += dt;
      this.vel.y = Math.max(this.vel.y, ACTION.glideFall);
      this.gliding = true;
    } else {
      this.gliding = false;
    }

    if (this.jumpKind === 'knock') return;
    if (inp.crouchPressed && !diving) {
      this.setState('poundSpin');
      this.game.audio.play('spin');
      return;
    }
    if (inp.attackPressed && !diving && !this.diveUsed) { this.startDive(false); return; }

    if (this.wallT > 0 && this.jumpBufferT > 0 && !diving) {
      this.jumpBufferT = 0;
      this.wallT = 0;
      this.facing = Math.atan2(this.wallN.x, this.wallN.z);
      this.launch('wall', JUMP.wallKickUp, this.wallN.x * JUMP.wallKickOut, this.wallN.z * JUMP.wallKickOut);
      this.airMaxSpeed = JUMP.wallKickOut + 1;
      this.game.particles.dust(this.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 5);
    }
  }

  startDive(fromGround) {
    const fv = this.facingVec();
    const s = Math.max(this.horizSpeed(), ACTION.diveSpeed);
    this.vel.x = fv.x * s;
    this.vel.z = fv.z * s;
    this.vel.y = fromGround ? ACTION.diveUp : Math.max(this.vel.y, 0) + 2.5;
    this.setState('dive', 'dive');
    this.diveUsed = true;
    this.airPeakY = Math.max(this.airPeakY, this.pos.y);
    this.game.audio.play('dive');
  }

  updateBelly(dt, inp, wish, mag) {
    let hs = this.horizSpeed();
    hs = Math.max(0, hs - ACTION.bellyFriction * dt);
    const fv = this.facingVec();
    if (mag > 0.2) this.facing = wrap(this.facing + THREE.MathUtils.clamp(wrap(Math.atan2(wish.x, wish.z) - this.facing), -2 * dt, 2 * dt));
    this.vel.x = fv.x * hs; this.vel.z = fv.z * hs; this.vel.y = 0;
    this.speed = hs;
    if (this.jumpBufferT > 0 && this.stateTime > 0.05) {
      this.jumpBufferT = 0;
      this.launch('rollout', JUMP.single * 0.9, this.vel.x * 0.8, this.vel.z * 0.8);
      return;
    }
    if (hs < 0.6 && this.stateTime > 0.25) this.setState('ground');
  }

  slopeAccel() {
    const t = this.game.physics.terrain.bind(this.game.physics);
    const e = 0.5, x = this.pos.x, z = this.pos.z;
    if (this.groundBox) return new THREE.Vector3();
    return new THREE.Vector3(-(t(x + e, z) - t(x - e, z)) / (2 * e), 0, -(t(x, z + e) - t(x, z - e)) / (2 * e)).multiplyScalar(GRAVITY * 0.5);
  }

  updateSlide(dt, inp, wish, mag) {
    const fv = this.facingVec();
    const sa = this.slopeAccel();
    this.speed = Math.max(0, this.speed - ACTION.slideFriction * dt + sa.dot(fv) * dt);
    this.speed = Math.min(this.speed, 15);
    if (mag > 0.2) this.facing = wrap(this.facing + THREE.MathUtils.clamp(wrap(Math.atan2(wish.x, wish.z) - this.facing), -2.5 * dt, 2.5 * dt));
    this.vel.x = Math.sin(this.facing) * this.speed;
    this.vel.z = Math.cos(this.facing) * this.speed;
    this.vel.y = 0;
    if (this.groundJump(inp, wish, mag)) return;
    if ((!inp.crouch && this.stateTime > 0.15) || this.speed < 1.5) this.setState('ground');
  }

  updateRoll(dt, inp, wish, mag) {
    if (mag > 0.2) this.facing = wrap(this.facing + THREE.MathUtils.clamp(wrap(Math.atan2(wish.x, wish.z) - this.facing), -3.5 * dt, 3.5 * dt));
    this.speed = ACTION.rollSpeed;
    this.vel.x = Math.sin(this.facing) * this.speed;
    this.vel.z = Math.cos(this.facing) * this.speed;
    this.vel.y = 0;
    if (this.groundJump(inp, wish, mag)) return;
    if (this.rollT <= 0) { this.setState('ground'); this.speed = MOVE.runSpeed * 0.8; }
  }

  // ---- ledge ----
  updateLedge(dt, inp, wish, mag) {
    this.vel.set(0, 0, 0);
    const n = this.ledgeN;
    const toward = mag > 0.3 ? -(wish.x * n.x + wish.z * n.z) : 0;
    this.ledgePushT = toward > 0.5 ? this.ledgePushT + dt : 0;
    if (!this.ledgeBox || !this.ledgeBox.enabled) { this.dropLedge(); return; }
    if ((this.jumpBufferT > 0 || this.ledgePushT > 0.2) && this.stateTime > 0.12) {
      this.jumpBufferT = 0;
      this.pos.y = this.ledgeBox.max.y;
      this.pos.x -= n.x * (this.radius + 0.35);
      this.pos.z -= n.z * (this.radius + 0.35);
      this.setState('ground');
      this.groundBox = this.ledgeBox;
      this.speed = 0;
      this.game.audio.play('climb');
      return;
    }
    if (inp.crouchPressed || (mag > 0.3 && toward < -0.5 && this.stateTime > 0.2)) this.dropLedge();
  }

  dropLedge() {
    this.pos.addScaledVector(this.ledgeN, 0.15);
    this.setState('air', 'fall');
    this.ledgeCooldown = 0.45;
    this.airPeakY = this.pos.y;
  }

  // ---- water ----
  checkWater(dt) {
    if (this.state === 'held' || this.state === 'bubble') return;
    const floor = this.game.physics.terrain(this.pos.x, this.pos.z);
    const depth = WATER_LEVEL - this.pos.y;
    const deepEnough = floor < WATER_LEVEL - 0.9;
    if (this.state !== 'swim') {
      if (deepEnough && depth > 0.7) {
        const fast = this.vel.y < -12 || this.jumpKind === 'pound';
        this.setState('swim');
        this.swimMode = fast ? 'under' : 'surface';
        this.speed = Math.min(this.horizSpeed(), 4.5);
        this.vel.y *= 0.25;
        this.noFallDamage = false;
        if (this.carrying) this.dropCarried();
        this.game.particles.splash(new THREE.Vector3(this.pos.x, WATER_LEVEL, this.pos.z), 14);
        this.game.audio.play('splash');
      }
    } else {
      this.waterTime += dt;
      if (!deepEnough && depth < 0.55) {
        this.leaveWater();
        this.setState('ground');
      }
    }
  }

  leaveWater() {
    if (this.waterTime > 0.4 && this.health < HEALTH.max) {
      this.health = HEALTH.max;
      this.game.audio.play('heal');
    }
    this.waterTime = 0;
    this.air = HEALTH.airMax;
  }

  updateSwim(dt, inp, wish, mag) {
    const surfaceY = WATER_LEVEL - 0.82;
    if (this.swimMode === 'surface') {
      this.air = Math.min(HEALTH.airMax, this.air + dt * 10);
      this.vel.y = (surfaceY - this.pos.y) * 6;
      if (mag > 0.1) {
        const target = Math.atan2(wish.x, wish.z);
        this.facing = wrap(this.facing + THREE.MathUtils.clamp(wrap(target - this.facing), -6 * dt, 6 * dt));
      }
      this.speed = approach(this.speed, mag * 4.5, 8 * dt);
      this.vel.x = Math.sin(this.facing) * this.speed;
      this.vel.z = Math.cos(this.facing) * this.speed;
      if (this.jumpBufferT > 0) {
        this.jumpBufferT = 0;
        this.leaveWater();
        this.launch('leap', JUMP.waterLeap, this.vel.x, this.vel.z);
        this.pos.y = Math.max(this.pos.y, surfaceY + 0.1);
        this.game.particles.splash(new THREE.Vector3(this.pos.x, WATER_LEVEL, this.pos.z), 10);
        this.game.audio.play('splash');
        return;
      }
      if (inp.crouchPressed) { this.swimMode = 'under'; this.vel.y = -3; this.game.audio.play('dive'); }
    } else {
      this.air -= dt;
      if (this.air <= 0) {
        this.air = 0;
        this.drownT -= dt;
        if (this.drownT <= 0) { this.drownT = 2; this.hurt(1, null, true); }
      }
      if (mag > 0.1) {
        const target = Math.atan2(wish.x, wish.z);
        this.facing = wrap(this.facing + THREE.MathUtils.clamp(wrap(target - this.facing), -4 * dt, 4 * dt));
      }
      if (inp.jumpPressed) { this.speed = Math.min(this.speed + 2.5, 7); this.game.audio.play('stroke'); }
      this.speed = approach(this.speed, mag * 5, 3 * dt);
      this.vel.x = Math.sin(this.facing) * this.speed;
      this.vel.z = Math.cos(this.facing) * this.speed;
      const vyTarget = inp.jump ? 3.5 : inp.crouch ? -3.5 : 0.5;
      this.vel.y = approach(this.vel.y, vyTarget, 8 * dt);
      if (this.pos.y >= surfaceY && this.vel.y >= 0) { this.swimMode = 'surface'; this.drownT = 0; }
    }
  }

  // ---- co-op carry ----
  tryGrab() {
    const o = this.partner;
    if (!o || this.carrying) return;
    if (!['ground', 'air'].includes(o.state) || o.carrying) return;
    const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
    if (d < 1.7 && Math.abs(o.pos.y - this.pos.y) < 1.0) {
      this.carrying = o;
      o.holder = this;
      o.setState('held');
      o.vel.set(0, 0, 0);
      this.game.audio.play('grab');
    }
  }

  dropCarried() {
    const c = this.carrying;
    if (!c) return;
    this.carrying = null;
    c.holder = null;
    c.setState('air', 'fall');
    c.airPeakY = c.pos.y;
  }

  throwCarried(wish, mag) {
    const c = this.carrying;
    this.carrying = null;
    c.holder = null;
    if (mag > 0.3) this.facing = Math.atan2(wish.x, wish.z);
    const fv = this.facingVec();
    if (mag > 0.3) c.launch('toss', ACTION.tossForwardUp, fv.x * ACTION.tossForward, fv.z * ACTION.tossForward);
    else c.launch('toss', ACTION.tossUp, fv.x * 1.2, fv.z * 1.2);
    c.facing = this.facing;
    c.noFallDamage = true;
    c.airMaxSpeed = ACTION.tossForward + 1;
    this.game.audio.play('toss');
  }

  updateHeld(dt, inp) {
    const h = this.holder;
    if (!h || !h.active || h.carrying !== this) { this.setState('air', 'fall'); this.holder = null; return; }
    this.pos.copy(h.pos).add(new THREE.Vector3(0, h.height + 0.05, 0));
    this.facing = h.facing;
    this.vel.copy(h.vel);
    if (inp.jumpPressed) {
      h.carrying = null;
      this.holder = null;
      this.launch('single', JUMP.single * 0.85, h.vel.x, h.vel.z);
    }
  }

  // ---- revive bubble ----
  updateBubble(dt) {
    const o = this.partner;
    if (!o) return;
    // drift to just above the partner's head; they jump into it to pop it
    const target = o.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    const d = target.clone().sub(this.pos);
    const dist = d.length();
    if (dist > 0.01) this.pos.addScaledVector(d.normalize(), Math.min(dist, 2.5 * dt));
    this.vel.set(0, 0, 0);
    if (o.alive && o.state !== 'held' && o.pos.distanceTo(this.pos) < 1.25 && this.stateTime > 1) {
      this.health = 1;
      this.invuln = 2;
      this.setState('air', 'single');
      this.vel.y = 6;
      this.airPeakY = this.pos.y;
      this.noFallDamage = true;
      this.game.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), '#bfefff', 18, 5);
      this.game.audio.play('revive');
      this.game.hud.message(`${this.def.name} is back!`);
    }
  }

  // ---- after collision ----
  afterCollide(res, inp, wish, mag, wasGrounded) {
    const g = this.game;
    if (res.wall && !res.grounded && this.state !== 'swim') {
      if (res.wallSpeed > 2.5 && ['air', 'dive'].includes(this.state)) {
        this.wallT = JUMP.wallKickWindow;
        this.wallN.copy(res.wall);
        if (this.state === 'dive' && res.wallSpeed > 6) {
          this.setState('air', 'knock');
          this.vel.set(res.wall.x * 3, 3, res.wall.z * 3);
          g.audio.play('bonk');
        }
        if (this.jumpBufferT > 0 && this.state === 'air') this.updateAir(0, inp, wish, mag, false);
      }
      if (res.wallBox && res.wallBox.breakable && (this.state === 'dive' || (this.state === 'air' && this.jumpKind === 'knock') || this.state === 'roll')) {
        g.level.breakBox(res.wallBox, this);
      }
      // ledge grab
      const b = res.wallBox;
      if (b && this.state === 'air' && this.jumpKind !== 'knock' && this.vel.y < 3 && this.ledgeCooldown <= 0 && !b.noLedge && !this.carrying) {
        const dy = b.max.y - this.pos.y;
        if (dy > 0.8 && dy < 1.45) {
          const n = res.wall;
          const clear = !g.physics.pointBlocked(this.pos.x - n.x * 0.6, b.max.y + 0.5, this.pos.z - n.z * 0.6);
          if (clear) {
            this.setState('ledge');
            this.ledgeBox = b;
            this.groundBox = b;
            this.ledgeN.copy(n);
            this.pos.y = b.max.y - 1.15;
            this.vel.set(0, 0, 0);
            this.facing = Math.atan2(-n.x, -n.z);
            this.ledgePushT = 0;
            g.audio.play('grabLedge');
            return;
          }
        }
      }
    }
    if (res.wall && res.wallBox && res.wallBox.breakable && this.state === 'roll') g.level.breakBox(res.wallBox, this);

    if (res.grounded && this.state === 'swim') {
      this.groundBox = res.groundBox;
    } else if (res.grounded) {
      this.groundBox = res.groundBox;
      if (!wasGrounded || ['air', 'dive', 'pound', 'poundSpin'].includes(this.state)) this.land(res);
      this.coyoteT = MOVE.coyoteTime;
      if (this.grounded && this.state !== 'belly') {
        this.safeTimer -= 1 / 120;
        if (this.safeTimer <= 0 && (!res.groundBox || res.groundBox.safe)) {
          this.safeTimer = 0.4;
          if (this.pos.y > 0.2) this.lastSafe.copy(this.pos);
        }
      }
    } else if (this.grounded) {
      // walked off a ledge
      if (this.state === 'ground' || this.state === 'roll' || this.state === 'slide') {
        this.setState('air', 'fall');
        this.airPeakY = this.pos.y;
        this.jumpCut = true;
        this.diveUsed = false;
        this.airMaxSpeed = Math.max(MOVE.runSpeed, this.horizSpeed());
        this.coyoteT = MOVE.coyoteTime;
      } else if (this.state === 'belly' || this.state === 'poundLand') {
        this.setState('air', 'fall');
        this.airPeakY = this.pos.y;
      }
      this.groundBox = null;
    }
  }

  land(res) {
    const g = this.game;
    const fall = this.airPeakY - this.pos.y;
    const box = res.groundBox;
    if (this.state === 'pound' || this.state === 'poundSpin') {
      this.setState('poundLand');
      this.lastPoundTime = g.time;
      this.landSquash = 1;
      g.onPoundLand(this, box);
      if (box && box.onLand) box.onLand(this, true);
      this.noFallDamage = false;
      return;
    }
    const kind = this.jumpKind;
    const wasDive = this.state === 'dive';
    const dmg = fall > HEALTH.fallDamageHeight && !this.noFallDamage && !wasDive && kind !== 'knock';
    this.noFallDamage = false;
    if (wasDive) {
      this.setState('belly');
      g.particles.dust(this.pos, 5);
    } else {
      this.setState('ground');
      this.speed = this.horizSpeed();
      if (this.speed > 0.5) {
        const vf = Math.atan2(this.vel.x, this.vel.z);
        if (kind === 'backflip') this.speed = 0;
        else this.facing = vf;
      }
      if (['single', 'double', 'triple'].includes(kind)) this.chainT = MOVE.chainWindow;
      if (kind === 'triple' || kind === 'long' || kind === 'backflip') this.speed *= 0.6;
      if (kind === 'knock') this.speed = 0;
    }
    this.landSquash = Math.min(1, 0.3 + fall * 0.12);
    if (fall > 1.2) g.particles.dust(this.pos, Math.min(10, 3 + Math.floor(fall)));
    g.audio.play('land', Math.min(1, fall / 6));
    if (dmg) {
      this.hurt(1, null, true);
      this.speed = 0;
    }
    if (box && box.onLand) box.onLand(this, false);
  }

  // ---- damage ----
  hurt(amount, from, noKnock = false) {
    if (this.invuln > 0 || this.state === 'bubble' || !this.active) return false;
    if (this.game.assist) amount = Math.max(0.5, amount / 2);
    this.health = Math.max(0, this.health - amount);
    this.invuln = HEALTH.invuln;
    this.game.audio.play('hurt');
    if (this.carrying) this.dropCarried();
    if (this.state === 'held' && this.holder) { this.holder.carrying = null; this.holder = null; this.setState('air', 'fall'); }
    if (!noKnock && from && this.state !== 'swim') {
      const d = this.pos.clone().sub(from);
      d.y = 0;
      if (d.lengthSq() < 0.001) d.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      d.normalize();
      this.vel.set(d.x * 6, 7, d.z * 6);
      this.setState('air', 'knock');
      this.airPeakY = this.pos.y;
    }
    if (this.health <= 0) this.down();
    return true;
  }

  down() {
    const o = this.partner;
    if (this.carrying) this.dropCarried();
    if (o && o.alive) {
      this.setState('bubble');
      this.vel.set(0, 0, 0);
      this.game.hud.message(`${this.def.name} is bubbled! Touch them to revive.`);
      this.game.audio.play('bubble');
    } else {
      this.game.allDown();
    }
  }

  // ---- per-frame visuals ----
  animate(dt) {
    const rig = this.rig;
    rig.root.visible = this.active;
    this.shadow.visible = this.active;
    this.marker.visible = this.active && this.game.players.filter((p) => p.active).length > 1;
    if (!this.active) return;
    rig.root.position.copy(this.pos);
    rig.root.rotation.y = this.facing;
    const body = rig.body;
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0.55, 0);
    this.landSquash = Math.max(0, this.landSquash - dt * 4);
    let sy = 1 - 0.28 * this.landSquash, sxz = 1 + 0.18 * this.landSquash;

    const hs = this.horizSpeed();
    this.runPhase += dt * (this.grounded ? Math.max(hs, 0.001) * 2.2 : 6);
    const swing = this.state === 'ground' ? Math.min(1, hs / 5) * 0.9 : 0;
    let legL = Math.sin(this.runPhase) * swing, legR = -legL;
    let armL = -legL * 0.8, armR = -legR * 0.8;
    let armSpread = 0;
    const st = this.state;

    if (st === 'air') {
      const fk = FLIP_KINDS[this.jumpKind];
      if (fk) {
        const t = Math.min(1, this.stateTime / fk);
        const e = 1 - Math.pow(1 - t, 2);
        if (this.jumpKind === 'triple' || this.jumpKind === 'toss' || this.jumpKind === 'boost') body.rotation.x = e * Math.PI * 2;
        else if (this.jumpKind === 'backflip') body.rotation.x = -e * Math.PI * 2;
        else if (this.jumpKind === 'sideflip') body.rotation.z = e * Math.PI * 2;
      }
      if (this.jumpKind === 'long') body.rotation.x = 1.0;
      if (this.jumpKind === 'knock') body.rotation.x = -0.5;
      legL = 0.6; legR = -0.3; armL = -2.4; armR = -2.4;
      if (this.vel.y < 0) { legL = 0.2; legR = 0.2; armL = -1.2; armR = -1.2; }
      if (this.gliding) { armSpread = 1.4; armL = -0.2; armR = -0.2; }
      if (this.vel.y > 3) { sy *= 1.08; sxz *= 0.95; }
    } else if (st === 'poundSpin') {
      body.rotation.y = this.stateTime * 30;
      body.rotation.x = 0.4;
      legL = legR = -1.2; armL = armR = -0.6;
      sy *= 0.85;
    } else if (st === 'pound') {
      legL = legR = -1.4; armL = armR = -2.8;
      sy *= 1.15; sxz *= 0.9;
    } else if (st === 'dive' || st === 'belly') {
      body.rotation.x = Math.PI / 2 * 0.92;
      body.position.y = st === 'belly' ? 0.3 : 0.5;
      armL = armR = -3.0; legL = legR = 0.2;
    } else if (st === 'slide') {
      body.rotation.x = -0.6;
      body.position.y = 0.4;
      legL = legR = -1.2;
    } else if (st === 'roll') {
      body.rotation.x = this.stateTime * 16;
      body.position.y = 0.42;
      sy *= 0.75; sxz *= 0.95;
      legL = legR = -2.2; armL = armR = -2.2;
    } else if (st === 'ledge') {
      body.position.y = 0.5;
      armL = armR = -3.0; legL = 0.2; legR = -0.2;
    } else if (st === 'swim') {
      body.rotation.x = this.swimMode === 'under' ? 1.3 : 0.9;
      const kick = Math.sin(this.runPhase * 2.2) * 0.6;
      legL = kick; legR = -kick; armL = -1.6 + kick; armR = -1.6 - kick;
    } else if (st === 'held') {
      legL = 0.3 + Math.sin(this.game.time * 10) * 0.3; legR = -legL;
      armL = armR = -2.8;
    } else if (st === 'bubble') {
      body.rotation.z = Math.sin(this.game.time * 2) * 0.3;
      legL = legR = 0.4; armL = armR = -0.6;
    } else if (st === 'poundLand') {
      sy *= 0.75; sxz *= 1.15;
    }
    if (this.crouching && st === 'ground') { sy *= 0.72; sxz *= 1.1; }
    if (this.punchT > 0) {
      const t = 1 - this.punchT / ACTION.punchTime;
      armR = -1.6 - Math.sin(t * Math.PI) * 0.4;
      body.rotation.y = Math.sin(t * Math.PI) * 0.4;
    }
    if (this.skidT > 0 && st === 'ground') body.rotation.x = -0.35;

    rig.legL.rotation.x = legL; rig.legR.rotation.x = legR;
    rig.armL.rotation.x = armL; rig.armR.rotation.x = armR;
    rig.armL.rotation.z = -armSpread; rig.armR.rotation.z = armSpread;
    body.scale.set(sxz, sy, sxz);
    if (rig.tail) rig.tail.rotation.y = Math.sin(this.game.time * 6 + this.index) * 0.4;
    if (rig.scarf) rig.scarf.rotation.x = 0.3 + Math.sin(this.game.time * 14) * 0.15 * (0.4 + Math.min(1, hs / 6)) + (this.vel.y < 0 ? 0.4 : 0);

    rig.bubble.visible = st === 'bubble';
    if (st === 'bubble') rig.bubble.scale.setScalar(1 + Math.sin(this.game.time * 4) * 0.05);
    rig.root.visible = !(this.invuln > 0 && st !== 'bubble' && Math.floor(this.invuln * 14) % 2 === 0);

    // blob shadow, always straight down so landings are readable
    const below = this.game.physics.groundBelow(this.pos.x, this.pos.z, this.pos.y + 0.05, 0.05, 0.1);
    const hgt = this.pos.y - below.y;
    this.shadow.position.set(this.pos.x, below.y + 0.04, this.pos.z);
    const k = Math.max(0.25, 1 - hgt / 14);
    this.shadow.scale.setScalar(k);
    this.shadow.material.opacity = 0.5 * k;
    this.shadow.visible = st !== 'swim' && below.y > WATER_LEVEL - 0.1;

    this.marker.position.set(this.pos.x, this.pos.y + 1.75 + Math.sin(this.game.time * 3) * 0.06, this.pos.z);
    this.marker.rotation.y += dt * 2;
  }
}
