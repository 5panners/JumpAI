import * as THREE from 'three';
import { CAMERA } from './config.js';
import { height } from './world/terrain.js';

function makeState() {
  return { cam: new THREE.PerspectiveCamera(55, 1, 0.1, 2000), pos: new THREE.Vector3(0, 10, 90), yaw: Math.PI, ty: 2, dist: CAMERA.minDist };
}

// Shared co-op camera that splits the screen when the heroes drift apart.
export class CameraRig {
  constructor() {
    this.shared = makeState();
    this.solo = [makeState(), makeState()];
    this.split = false;
  }

  reset(target, yaw = Math.PI) {
    for (const s of [this.shared, ...this.solo]) {
      s.yaw = yaw;
      s.ty = target.y;
      s.pos.set(target.x - Math.sin(yaw) * 10, target.y + 5, target.z - Math.cos(yaw) * 10);
    }
    this.split = false;
  }

  follow(s, target, dist, dt, orbit) {
    const dx = target.x - s.pos.x, dz = target.z - s.pos.z;
    if (Math.hypot(dx, dz) > 0.5) s.yaw = Math.atan2(dx, dz);
    s.yaw += orbit * CAMERA.orbitSpeed * dt;
    const rate = target.y < s.ty ? 6 : 2.5;
    s.ty += (target.y - s.ty) * Math.min(1, dt * rate);
    s.dist += (dist - s.dist) * Math.min(1, dt * 2);
    const cp = Math.cos(CAMERA.pitch), sp = Math.sin(CAMERA.pitch);
    const desired = new THREE.Vector3(
      target.x - Math.sin(s.yaw) * s.dist * cp,
      s.ty + 1.2 + s.dist * sp,
      target.z - Math.cos(s.yaw) * s.dist * cp,
    );
    // orbit input applies instantly, the rest trails
    s.pos.lerp(desired, Math.min(1, dt * (orbit ? 20 : 7)));
    // never sit behind solid geometry: push in toward the hero instead
    if (this.occluder) {
      const look = new THREE.Vector3(target.x, s.ty + 1.0, target.z);
      const hit = this.occluder(look, s.pos);
      if (hit < 1) s.pos.copy(look).lerp(s.pos, Math.max(0.12, hit - 0.06));
    }
    const floor = height(s.pos.x, s.pos.z) + 1.2;
    if (s.pos.y < floor) s.pos.y = floor;
    s.cam.position.copy(s.pos);
    s.cam.lookAt(target.x, s.ty + 1.0, target.z);
  }

  update(dt, players, inputs) {
    const act = players.filter((p) => p.active);
    if (act.length === 0) return;
    const spread = act.length > 1 ? act[0].pos.distanceTo(act[1].pos) : 0;
    const wasSplit = this.split;
    if (act.length < 2) this.split = false;
    else if (!this.split && spread > CAMERA.splitAt) this.split = true;
    else if (this.split && spread < CAMERA.mergeAt) this.split = false;

    if (this.split && !wasSplit) {
      for (const s of this.solo) { s.pos.copy(this.shared.pos); s.yaw = this.shared.yaw; s.ty = this.shared.ty; s.dist = this.shared.dist; }
    }
    if (!this.split && wasSplit) {
      this.shared.pos.copy(this.solo[0].pos).lerp(this.solo[1].pos, 0.5);
      this.shared.ty = (this.solo[0].ty + this.solo[1].ty) / 2;
    }

    if (this.split) {
      players.forEach((p, i) => { if (p.active) this.follow(this.solo[i], p.pos, CAMERA.minDist, dt, inputs[i].camX); });
    } else {
      const c = new THREE.Vector3();
      act.forEach((p) => c.add(p.pos));
      c.multiplyScalar(1 / act.length);
      const dist = THREE.MathUtils.clamp(CAMERA.minDist + spread * 0.55, CAMERA.minDist, CAMERA.maxDist);
      const orbit = THREE.MathUtils.clamp(inputs[0].camX + (act.length > 1 ? inputs[1].camX : 0), -1.5, 1.5);
      this.follow(this.shared, c, dist, dt, orbit);
    }
  }

  yawFor(i) { return this.split ? this.solo[i].yaw : this.shared.yaw; }

  views(W, H) {
    if (this.split) {
      this.solo[0].cam.aspect = (W / 2) / H;
      this.solo[1].cam.aspect = (W / 2) / H;
      this.solo.forEach((s) => s.cam.updateProjectionMatrix());
      return [{ camera: this.solo[0].cam, x: 0, w: 0.5 }, { camera: this.solo[1].cam, x: 0.5, w: 0.5 }];
    }
    this.shared.cam.aspect = W / H;
    this.shared.cam.updateProjectionMatrix();
    return [{ camera: this.shared.cam, x: 0, w: 1 }];
  }

  focus() { return this.split ? this.solo[0].pos.clone().lerp(this.solo[1].pos, 0.5) : this.shared.pos.clone(); }
}
