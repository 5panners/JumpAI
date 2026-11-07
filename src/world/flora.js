import * as THREE from 'three';
import { height, slopeAt, pathDistance, FEATURES } from './terrain.js';
import { WATER_LEVEL } from '../config.js';

// Canopies that fade out when they block a camera's view of a hero.
export const FOLIAGE = [];

const _seg = new THREE.Vector3();
const _rel = new THREE.Vector3();
function segDist(a, b, p) {
  _seg.subVectors(b, a);
  const t = Math.max(0, Math.min(1, _rel.subVectors(p, a).dot(_seg) / _seg.lengthSq()));
  return _rel.subVectors(p, a).addScaledVector(_seg, -t).length();
}

export function fadeFoliage(segments, dt) {
  for (const f of FOLIAGE) {
    f.mesh.getWorldPosition(f.c);
    const blocked = segments.some(([a, b]) => segDist(a, b, f.c) < f.r * 1.05);
    const target = blocked ? 0.22 : 1;
    const m = f.mesh.material;
    m.opacity += (target - m.opacity) * Math.min(1, dt * 8);
    const fade = m.opacity < 0.99;
    if (m.transparent !== fade) { m.transparent = fade; m.depthWrite = !fade; m.needsUpdate = true; }
  }
}

export function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// Grass that sways in the wind and parts around the heroes.
function grass(scene, rng, uniforms) {
  const blades = [];
  const pos = [], col = [];
  const base = new THREE.Color('#2f8f3a'), tip = new THREE.Color('#b8f06a');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng();
    const ox = Math.cos(a) * 0.12, oz = Math.sin(a) * 0.12;
    const h = 0.22 + rng() * 0.2, w = 0.04;
    const tx = Math.cos(a) * 0.18, tz = Math.sin(a) * 0.18;
    pos.push(ox - w * Math.sin(a), 0, oz + w * Math.cos(a), ox + w * Math.sin(a), 0, oz - w * Math.cos(a), ox + tx, h, oz + tz);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const n = [];
  for (let i = 0; i < pos.length / 3; i++) n.push(0, 1, 0);
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uPlayers = uniforms.uPlayers;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uPlayers[2];')
      .replace('#include <project_vertex>', `
        vec4 wPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        float hgt = transformed.y;
        wPos.x += sin(uTime * 2.1 + wPos.x * 0.35 + wPos.z * 0.22) * 0.16 * hgt;
        wPos.z += cos(uTime * 1.7 + wPos.x * 0.2 + wPos.z * 0.31) * 0.1 * hgt;
        for (int i = 0; i < 2; i++) {
          vec2 d = wPos.xz - uPlayers[i].xz;
          float L = length(d);
          float f = clamp(1.0 - L / 1.3, 0.0, 1.0) * step(abs(wPos.y - uPlayers[i].y), 1.2);
          wPos.xz += normalize(d + 0.0001) * f * 0.9 * hgt;
          wPos.y -= f * 0.5 * hgt;
        }
        vec4 mvPosition = viewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  const count = 22000;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D();
  let k = 0;
  for (let tries = 0; tries < count * 4 && k < count; tries++) {
    const x = (rng() - 0.5) * 200, z = (rng() - 0.5) * 200;
    if (Math.hypot(x, z) > FEATURES.boundary - 6) continue;
    const h = height(x, z);
    if (h < WATER_LEVEL + 0.5 || slopeAt(x, z) > 0.8 || pathDistance(x, z) < 1.6) continue;
    d.position.set(x, h - 0.02, z);
    d.rotation.set(0, rng() * Math.PI * 2, 0);
    d.scale.setScalar(0.7 + rng() * 0.6);
    d.updateMatrix();
    mesh.setMatrixAt(k++, d.matrix);
  }
  mesh.count = k;
  mesh.receiveShadow = true;
  scene.add(mesh);
  blades.push(mesh);
  return mesh;
}

function flowers(scene, rng) {
  const geo = new THREE.IcosahedronGeometry(0.13, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.08 });
  const count = 3200;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const palette = ['#ff5fa2', '#ffd23f', '#ffffff', '#b07cff', '#ff7b39', '#5ad1ff'].map((c) => new THREE.Color(c));
  const d = new THREE.Object3D();
  let k = 0;
  const patches = [];
  for (let i = 0; i < 70; i++) patches.push([(rng() - 0.5) * 180, (rng() - 0.5) * 180, palette[Math.floor(rng() * palette.length)]]);
  for (let tries = 0; tries < count * 5 && k < count; tries++) {
    const p = patches[Math.floor(rng() * patches.length)];
    const x = p[0] + (rng() - 0.5) * 14, z = p[1] + (rng() - 0.5) * 14;
    if (Math.hypot(x, z) > FEATURES.boundary - 8) continue;
    const h = height(x, z);
    if (h < WATER_LEVEL + 0.6 || slopeAt(x, z) > 0.7 || pathDistance(x, z) < 1.8) continue;
    d.position.set(x, h + 0.3 + rng() * 0.15, z);
    d.rotation.set(rng(), rng(), rng());
    d.scale.setScalar(0.7 + rng() * 0.7);
    d.updateMatrix();
    mesh.setMatrixAt(k, d.matrix);
    mesh.setColorAt(k, rng() < 0.2 ? palette[Math.floor(rng() * palette.length)] : p[2]);
    k++;
  }
  mesh.count = k;
  scene.add(mesh);
  return patches;
}

export function addTree(scene, physics, x, z, rng, scale = 1) {
  const h = height(x, z);
  const g = new THREE.Group();
  const trunkH = (3.5 + rng() * 2) * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.5 * scale, trunkH, 8), new THREE.MeshStandardMaterial({ color: '#8a5a3b', roughness: 1 }));
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const greens = ['#3cbf4a', '#5fd35b', '#2ea44f', '#8be05a'];
  const blossom = rng() < 0.3;
  for (let i = 0; i < 3; i++) {
    const r = (1.8 + rng() * 1.2) * scale;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color: blossom ? ['#ffa6d1', '#ffc4e1', '#ff8fc5'][i] : greens[Math.floor(rng() * greens.length)], flatShading: true, roughness: 0.8 }));
    leaf.position.set((rng() - 0.5) * 1.6 * scale, trunkH + (i - 0.5) * 0.9 * scale, (rng() - 0.5) * 1.6 * scale);
    leaf.castShadow = true;
    g.add(leaf);
    FOLIAGE.push({ mesh: leaf, r, c: new THREE.Vector3() });
  }
  g.position.set(x, h - 0.1, z);
  scene.add(g);
  physics.addBox(x, h + trunkH / 2, z, 0.8 * scale, trunkH, 0.8 * scale, { noLedge: true });
  return g;
}

// Giant tulip: a tall stem with a cup the heroes can stand on.
export function addTulip(scene, physics, x, z, cupTop, color) {
  const h = height(x, z);
  const g = new THREE.Group();
  const stemH = cupTop - h - 0.6;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, stemH, 8), new THREE.MeshStandardMaterial({ color: '#3aa845' }));
  stem.position.y = stemH / 2;
  stem.castShadow = true;
  g.add(stem);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color: '#46c150' }));
  leaf.scale.set(0.3, 1.6, 0.7); leaf.position.set(0.6, 1.4, 0); leaf.rotation.z = -0.5;
  g.add(leaf);
  const petalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI), petalMat);
    petal.scale.set(0.75, 1.15, 0.45);
    petal.position.set(Math.cos(a) * 0.85, stemH + 0.55, Math.sin(a) * 0.85);
    petal.rotation.y = -a + Math.PI / 2;
    petal.rotation.x = -0.25;
    petal.castShadow = true;
    g.add(petal);
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.6, 0.4, 12), new THREE.MeshStandardMaterial({ color: '#ffe36e', emissive: '#ffcf3a', emissiveIntensity: 0.3 }));
  disc.position.y = stemH + 0.4;
  g.add(disc);
  g.position.set(x, h, z);
  scene.add(g);
  physics.addPlatform(x, cupTop, z, 2.4, 0.5, 2.4, { safe: true });
  physics.addBox(x, h + stemH / 2, z, 0.5, stemH, 0.5, { noLedge: true });
  return g;
}

export function addRock(scene, physics, x, z, s, solid = true) {
  const h = height(x, z);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), new THREE.MeshStandardMaterial({ color: '#a99cc0', flatShading: true, roughness: 0.95 }));
  rock.position.set(x, h + s * 0.35, z);
  rock.scale.y = 0.7;
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true; rock.receiveShadow = true;
  scene.add(rock);
  if (solid) physics.addPlatform(x, h + s * 0.85, z, s * 1.3, s * 1.2, s * 1.3, { safe: true });
  return rock;
}

function dandelions(scene, rng) {
  const group = new THREE.Group();
  const seedMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 26; i++) {
    const x = (rng() - 0.5) * 170, z = (rng() - 0.5) * 170;
    const h = height(x, z);
    if (h < 0.6 || Math.hypot(x, z) > 90) continue;
    const stemH = 1.2 + rng() * 1.6;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, stemH, 5), new THREE.MeshStandardMaterial({ color: '#5bbf4f' }));
    stem.position.set(x, h + stemH / 2, z);
    group.add(stem);
    const pts = [];
    for (let k = 0; k < 120; k++) {
      const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(0.45);
      pts.push(v.x, v.y, v.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const ball = new THREE.Points(g, seedMat);
    ball.position.set(x, h + stemH + 0.3, z);
    group.add(ball);
  }
  scene.add(group);
}

export function buildFlora(scene, physics) {
  const rng = makeRng(42);
  const uniforms = { uTime: { value: 0 }, uPlayers: { value: [new THREE.Vector3(999, 0, 999), new THREE.Vector3(999, 0, 999)] } };
  grass(scene, rng, uniforms);
  const patches = flowers(scene, rng);
  dandelions(scene, rng);
  return {
    patches,
    update(t, players) {
      uniforms.uTime.value = t;
      players.forEach((p, i) => { if (p.active) uniforms.uPlayers.value[i].copy(p.pos); else uniforms.uPlayers.value[i].set(999, 0, 999); });
    },
  };
}
