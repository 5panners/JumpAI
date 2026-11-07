import * as THREE from 'three';
import { height } from '../world/terrain.js';
import { makeRng } from '../world/flora.js';
import { WATER_LEVEL } from '../config.js';

// Ambient, non-hostile wildlife that reacts to the heroes.
export function buildFauna(scene, patches) {
  const rng = makeRng(99);
  const dummy = new THREE.Object3D();
  const nearestPlayer = (players, p) => {
    let best = null, bd = Infinity;
    for (const pl of players) {
      if (!pl.active) continue;
      const d = pl.pos.distanceTo(p);
      if (d < bd) { bd = d; best = pl; }
    }
    return { p: best, d: bd };
  };

  // ---- butterflies ----
  const wingGeo = new THREE.PlaneGeometry(0.28, 0.22);
  wingGeo.translate(0.14, 0, 0);
  const wingMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.15 });
  const NB = 70;
  const wingsL = new THREE.InstancedMesh(wingGeo, wingMat, NB);
  const wingsR = new THREE.InstancedMesh(wingGeo, wingMat, NB);
  const bcol = ['#ff7ad9', '#ffd23f', '#5ad1ff', '#ffffff', '#ff8a3d', '#b07cff'].map((c) => new THREE.Color(c));
  const flies = [];
  for (let i = 0; i < NB; i++) {
    const p = patches[i % patches.length];
    const home = new THREE.Vector3(p[0], 0, p[1]);
    home.y = height(home.x, home.z) + 1;
    flies.push({ pos: home.clone().add(new THREE.Vector3((rng() - 0.5) * 6, rng(), (rng() - 0.5) * 6)), home, vel: new THREE.Vector3(), phase: rng() * 10, flee: 0 });
    const c = bcol[Math.floor(rng() * bcol.length)];
    wingsL.setColorAt(i, c); wingsR.setColorAt(i, c);
  }
  wingsL.frustumCulled = wingsR.frustumCulled = false;
  scene.add(wingsL, wingsR);

  // ---- bees ----
  const NBEE = 18;
  const beeBody = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffcc1a', roughness: 0.5 }), NBEE);
  beeBody.frustumCulled = false;
  scene.add(beeBody);
  const bees = [];
  for (let i = 0; i < NBEE; i++) {
    const c = new THREE.Vector3((rng() - 0.5) * 40, 0, (rng() - 0.5) * 40 + 10);
    c.y = height(c.x, c.z) + 1.2;
    bees.push({ c, phase: rng() * 10, r: 1 + rng() * 2 });
  }

  // ---- woolly hill-goats ----
  const goats = [];
  const wool = new THREE.MeshStandardMaterial({ color: '#f7f3ea', roughness: 1, flatShading: true });
  const face = new THREE.MeshStandardMaterial({ color: '#5a4636' });
  const horn = new THREE.MeshStandardMaterial({ color: '#e8d3a8' });
  const goatSpots = [[35, -55], [70, -40], [60, -20], [45, -70], [-70, -25], [-78, -12]];
  for (const [x, z] of goatSpots) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), wool);
    body.scale.set(1, 0.8, 1.3); body.position.y = 1.0; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.5), face);
    head.position.set(0, 1.35, 1.0);
    const legs = [];
    for (const [lx, lz] of [[-0.35, 0.5], [0.35, 0.5], [-0.35, -0.5], [0.35, -0.5]]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6), face);
      l.position.set(lx, 0.3, lz);
      g.add(l); legs.push(l);
    }
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 6, 10, Math.PI * 1.3), horn);
      h.position.set(0.15 * s, 1.6, 0.9); h.rotation.y = Math.PI / 2;
      g.add(h);
    }
    g.add(body, head);
    scene.add(g);
    const home = new THREE.Vector3(x, 0, z);
    goats.push({ g, legs, head, pos: home.clone(), home, target: home.clone(), timer: 0, speed: 0, facing: rng() * 6, graze: 0 });
  }

  // ---- fish in the pond ----
  const NF = 16;
  const fishGeo = new THREE.ConeGeometry(0.15, 0.6, 6);
  fishGeo.rotateX(Math.PI / 2);
  const fishMesh = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ color: '#ff9f43', roughness: 0.4, emissive: '#ff6b00', emissiveIntensity: 0.15 }), NF);
  fishMesh.frustumCulled = false;
  scene.add(fishMesh);
  const fish = [];
  for (let i = 0; i < NF; i++) fish.push({ a: rng() * Math.PI * 2, r: 3 + rng() * 9, y: -1 - rng() * 2, speed: 0.4 + rng() * 0.4, scatter: 0 });

  return {
    update(dt, t, players) {
      // butterflies flutter round their flowers and scatter when someone runs through
      for (let i = 0; i < NB; i++) {
        const f = flies[i];
        const n = nearestPlayer(players, f.pos);
        if (n.p && n.d < 3) {
          const away = f.pos.clone().sub(n.p.pos).normalize();
          f.vel.addScaledVector(away, 12 * dt);
          f.vel.y += 6 * dt;
          f.flee = 2;
        }
        f.flee -= dt;
        const toHome = f.home.clone().sub(f.pos);
        f.vel.addScaledVector(toHome, (f.flee > 0 ? 0.2 : 0.8) * dt);
        f.vel.x += Math.sin(t * 1.7 + f.phase) * 1.5 * dt;
        f.vel.z += Math.cos(t * 1.3 + f.phase * 2) * 1.5 * dt;
        f.vel.y += Math.sin(t * 3 + f.phase) * 1.2 * dt;
        f.vel.multiplyScalar(1 - 1.2 * dt);
        f.pos.addScaledVector(f.vel, dt);
        const gy = height(f.pos.x, f.pos.z);
        if (f.pos.y < gy + 0.4) f.pos.y = gy + 0.4;
        const flap = Math.sin(t * 22 + f.phase) * 1.1;
        const yaw = Math.atan2(f.vel.x, f.vel.z);
        dummy.position.copy(f.pos);
        dummy.rotation.set(0, yaw - Math.PI / 2, 0);
        dummy.rotateX(flap * 0.2);
        dummy.rotateZ(Math.PI / 2 - 0.2 + flap);
        dummy.updateMatrix();
        wingsL.setMatrixAt(i, dummy.matrix);
        dummy.rotation.set(0, yaw + Math.PI / 2, 0);
        dummy.rotateZ(Math.PI / 2 - 0.2 + flap);
        dummy.updateMatrix();
        wingsR.setMatrixAt(i, dummy.matrix);
      }
      wingsL.instanceMatrix.needsUpdate = wingsR.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < NBEE; i++) {
        const b = bees[i];
        const a = t * 2 + b.phase;
        dummy.position.set(b.c.x + Math.cos(a) * b.r + Math.sin(t * 7 + i) * 0.2, b.c.y + Math.sin(t * 3 + i) * 0.3, b.c.z + Math.sin(a * 1.3) * b.r);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1.4);
        dummy.updateMatrix();
        beeBody.setMatrixAt(i, dummy.matrix);
      }
      beeBody.instanceMatrix.needsUpdate = true;

      for (const gt of goats) {
        const n = nearestPlayer(players, gt.pos);
        gt.timer -= dt;
        if (n.p && n.d < 5) {
          const away = gt.pos.clone().sub(n.p.pos); away.y = 0; away.normalize();
          gt.target.copy(gt.pos).addScaledVector(away, 6);
          gt.speed = 5;
          gt.timer = 2;
        } else if (gt.timer <= 0) {
          gt.timer = 3 + rng() * 5;
          gt.target.set(gt.home.x + (rng() - 0.5) * 14, 0, gt.home.z + (rng() - 0.5) * 14);
          gt.speed = rng() < 0.4 ? 0 : 1.2;
        }
        const d = gt.target.clone().sub(gt.pos); d.y = 0;
        if (d.length() > 0.3 && gt.speed > 0) {
          gt.facing = Math.atan2(d.x, d.z);
          gt.pos.addScaledVector(d.normalize(), gt.speed * dt);
        } else {
          gt.speed = Math.max(0, gt.speed - dt * 2);
        }
        gt.pos.y = height(gt.pos.x, gt.pos.z);
        if (gt.pos.y < 0.3) { gt.target.copy(gt.home); }
        gt.g.position.copy(gt.pos);
        gt.g.rotation.y = gt.facing;
        const step = Math.sin(t * gt.speed * 4) * 0.4 * Math.min(1, gt.speed);
        gt.legs.forEach((l, k) => { l.rotation.x = k % 2 ? step : -step; });
        gt.head.position.y = gt.speed < 0.1 ? 1.0 + Math.sin(t * 2) * 0.05 : 1.35;
      }

      const pondX = -45, pondZ = 26;
      for (let i = 0; i < NF; i++) {
        const fsh = fish[i];
        const p = new THREE.Vector3(pondX + Math.cos(fsh.a) * fsh.r, fsh.y, pondZ + Math.sin(fsh.a) * fsh.r);
        const n = nearestPlayer(players, p);
        if (n.p && n.d < 3 && n.p.state === 'swim') fsh.scatter = 1.5;
        fsh.scatter -= dt;
        fsh.a += dt * fsh.speed * (fsh.scatter > 0 ? 4 : 1);
        dummy.position.copy(p);
        dummy.position.y = Math.min(WATER_LEVEL - 0.4, fsh.y + Math.sin(t + i) * 0.3);
        dummy.rotation.set(0, -fsh.a, Math.sin(t * 10 + i) * 0.2);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        fishMesh.setMatrixAt(i, dummy.matrix);
      }
      fishMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
