import * as THREE from 'three';
import { WATER_LEVEL } from '../config.js';

// Bloomvale Meadow height field. All landmark positions in level.js are
// derived from these feature definitions.
export const FEATURES = {
  spawn: { x: 0, z: 72 },
  summit: { x: 55, z: -45, h: 16, s: 24 },
  pond: { x: -45, z: 26, r: 15 },
  arena: { x: -22, z: -38, r: 19 },
  boundary: 104,
};

const gauss = (dx, dz, s) => Math.exp(-(dx * dx + dz * dz) / (2 * s * s));
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function riverZ(x) {
  return 26 + 9 * Math.sin((x + 45) * 0.075);
}

export function baseHeight(x, z) {
  let h = 1.3
    + 0.8 * Math.sin(x * 0.045) * Math.cos(z * 0.038)
    + 0.45 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.09 + 0.7)
    + 0.2 * Math.sin(x * 0.23 + z * 0.17);
  const S = FEATURES.summit;
  h += S.h * gauss(x - S.x, z - S.z, S.s);
  h += 4.5 * gauss(x + 72, z + 18, 13);
  h += 3.5 * gauss(x - 78, z - 58, 12);
  h += 3 * gauss(x - 40, z - 70, 10);
  return h;
}

export function height(x, z) {
  let h = baseHeight(x, z);
  // flatten spawn and boss arena
  const sp = FEATURES.spawn;
  h = THREE.MathUtils.lerp(h, 1.5, smooth(15, 6, Math.hypot(x - sp.x, z - sp.z)));
  const ar = FEATURES.arena;
  h = THREE.MathUtils.lerp(h, 1.4, smooth(ar.r + 6, ar.r - 2, Math.hypot(x - ar.x, z - ar.z)));
  // pond
  const pd = FEATURES.pond;
  const dp = Math.hypot(x - pd.x, z - pd.z);
  h = THREE.MathUtils.lerp(h, -3.6, smooth(pd.r + 3, pd.r - 5, dp));
  // river flowing west out of the pond
  if (x < pd.x + 4) {
    const dz = Math.abs(z - riverZ(x));
    const fade = smooth(pd.x + 4, pd.x - 2, x);
    h = THREE.MathUtils.lerp(h, -2.3, smooth(6.5, 3.2, dz) * fade);
  }
  // boundary cliffs
  const r = Math.hypot(x, z);
  if (r > FEATURES.boundary - 6) {
    const t = smooth(FEATURES.boundary - 6, FEATURES.boundary + 14, r);
    h += t * (26 + 6 * Math.sin(Math.atan2(z, x) * 7));
  }
  return h;
}

export function slopeAt(x, z) {
  const e = 0.5;
  return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
}

// Dirt paths that lead players between landmarks.
const PATHS = [
  [[0, 72], [0, 40], [-8, 15], [0, 0], [25, -20], [40, -40]],
  [[0, 40], [-25, 38], [-32, 30]],
  [[0, 0], [-15, -20], [-22, -22]],
  [[0, 0], [30, 10], [70, 20]],
  [[-15, -20], [-50, -50], [-62, -57]],
  [[25, -20], [10, -70], [6, -84]],
];

function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

export function pathDistance(x, z) {
  let d = Infinity;
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      d = Math.min(d, distToSegment(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
    }
  }
  return d;
}

export function buildTerrain() {
  const size = 280, seg = 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grassA = new THREE.Color('#5cc94a');
  const grassB = new THREE.Color('#8fdc4f');
  const grassC = new THREE.Color('#3fae55');
  const sand = new THREE.Color('#f1d98f');
  const dirt = new THREE.Color('#d9a35f');
  const rock = new THREE.Color('#c79a6b');
  const rockDark = new THREE.Color('#9a6d4f');
  const deep = new THREE.Color('#2f8f7f');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = height(x, z);
    pos.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.cos(z * 0.17);
    c.copy(grassA).lerp(grassB, n);
    c.lerp(grassC, Math.max(0, Math.sin(x * 0.05 + z * 0.07)) * 0.5);
    const pd = pathDistance(x, z);
    if (pd < 2.6) c.lerp(dirt, smooth(2.6, 1.2, pd) * 0.85);
    const slope = slopeAt(x, z);
    if (slope > 0.9) {
      const band = 0.5 + 0.5 * Math.sin(h * 1.4 + Math.sin(x * 0.1 + z * 0.1) * 1.5);
      c.lerp(rock.clone().lerp(rockDark, band * 0.7), smooth(0.9, 1.5, slope));
    }
    if (h < WATER_LEVEL + 0.7) c.lerp(sand, smooth(WATER_LEVEL + 0.7, WATER_LEVEL + 0.1, h));
    if (h < WATER_LEVEL - 1.2) c.lerp(deep, smooth(-1.2, -3.2, h));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
