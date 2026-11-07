import * as THREE from 'three';

const MAX = 900;

// Pooled instanced particles: dust, splashes, colour bursts, sparkles.
export class Particles {
  constructor(scene) {
    const geo = new THREE.IcosahedronGeometry(0.1, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.15 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = [];
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, this.color.set('#ffffff'));
  }

  spawn(pos, vel, color, life, size, gravity = 12, drag = 0.5) {
    if (this.items.length >= MAX) this.items.shift();
    this.items.push({ p: pos.clone(), v: vel, c: new THREE.Color(color), life, max: life, size, gravity, drag });
  }

  burst(pos, color, n = 12, speed = 5, size = 1.2) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      this.spawn(pos, v, color, 0.6 + Math.random() * 0.5, size * (0.6 + Math.random() * 0.8));
    }
  }

  paint(pos, n = 24) {
    const cols = ['#ff4d6d', '#ffbe0b', '#3a86ff', '#8338ec', '#06d6a0', '#fb5607'];
    for (let i = 0; i < n; i++) this.burst(pos, cols[i % cols.length], 1, 6, 1.5);
  }

  dust(pos, n = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 2, 0.6 + Math.random(), Math.sin(a) * 2);
      this.spawn(pos.clone().add(new THREE.Vector3(0, 0.1, 0)), v, '#f4e7c8', 0.45, 1.3, 1, 2.5);
    }
  }

  splash(pos, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 2.5, 4 + Math.random() * 3, Math.sin(a) * 2.5);
      this.spawn(pos, v, '#dff8ff', 0.7, 1.1, 14, 0.2);
    }
  }

  sparkle(pos, color = '#fff6a8', n = 2) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5);
      this.spawn(pos, v, color, 0.8, 0.8, 0, 0.3);
    }
  }

  ring(pos, color, radius = 8, n = 40) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * radius * 1.6, 1.5, Math.sin(a) * radius * 1.6);
      this.spawn(pos.clone().add(new THREE.Vector3(0, 0.3, 0)), v, color, 0.55, 1.6, 2, 1.2);
    }
  }

  update(dt) {
    const d = this.dummy;
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) { this.items.splice(i, 1); continue; }
      it.v.y -= it.gravity * dt;
      it.v.multiplyScalar(Math.max(0, 1 - it.drag * dt));
      it.p.addScaledVector(it.v, dt);
    }
    for (const it of this.items) {
      const k = it.life / it.max;
      d.position.copy(it.p);
      d.scale.setScalar(it.size * (0.3 + 0.7 * k));
      d.rotation.set(it.life * 5, it.life * 3, 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.mesh.setColorAt(n, it.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
