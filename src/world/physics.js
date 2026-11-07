import * as THREE from 'three';
import { height as terrainHeight, FEATURES } from './terrain.js';

// Kinematic collision against axis-aligned boxes plus the terrain height field.
// Bodies are treated as upright boxes (radius r, height h) with feet at pos.y.
export class Physics {
  constructor() {
    this.boxes = [];
  }

  addBox(cx, cy, cz, sx, sy, sz, opts = {}) {
    const b = {
      min: new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      max: new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
      delta: new THREE.Vector3(),
      enabled: true,
      ...opts,
    };
    this.boxes.push(b);
    return b;
  }

  // Box whose top surface sits at `top`.
  addPlatform(cx, top, cz, sx, sy, sz, opts) {
    return this.addBox(cx, top - sy / 2, cz, sx, sy, sz, opts);
  }

  moveBox(b, dx, dy, dz) {
    b.min.x += dx; b.min.y += dy; b.min.z += dz;
    b.max.x += dx; b.max.y += dy; b.max.z += dz;
    b.delta.set(dx, dy, dz);
  }

  terrain(x, z) {
    return terrainHeight(x, z);
  }

  // Highest walkable surface at (x,z) that is not above y + step.
  groundBelow(x, z, y, r = 0.3, step = 0.3) {
    let best = terrainHeight(x, z);
    let box = null;
    for (const b of this.boxes) {
      if (!b.enabled || b.ghost) continue;
      if (x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z) continue;
      if (b.max.y <= y + step && b.max.y > best) { best = b.max.y; box = b; }
    }
    return { y: best, box };
  }

  // Is any solid box occupying this point?
  pointBlocked(x, y, z) {
    for (const b of this.boxes) {
      if (!b.enabled || b.ghost) continue;
      if (x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z) return b;
    }
    return null;
  }

  // First hit along segment a->b against solid boxes, as a fraction of its length.
  segmentHit(a, b) {
    let best = 1;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const bx of this.boxes) {
      if (!bx.enabled || bx.ghost) continue;
      if (a.x > bx.min.x && a.x < bx.max.x && a.y > bx.min.y && a.y < bx.max.y && a.z > bx.min.z && a.z < bx.max.z) continue;
      let t0 = 0, t1 = best;
      let ok = true;
      for (const [o, d, mn, mx] of [[a.x, dx, bx.min.x, bx.max.x], [a.y, dy, bx.min.y, bx.max.y], [a.z, dz, bx.min.z, bx.max.z]]) {
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } continue; }
        let ta = (mn - o) / d, tb = (mx - o) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best) best = t0;
    }
    return best;
  }

  resolve(body, prev) {
    const { pos, vel } = body;
    const r = body.radius, h = body.height;
    const out = { grounded: false, groundBox: null, ceiling: false, wall: null, wallBox: null, wallSpeed: 0 };
    for (const b of this.boxes) {
      if (!b.enabled || b.ghost) continue;
      const minX = pos.x - r, maxX = pos.x + r;
      const minZ = pos.z - r, maxZ = pos.z + r;
      const minY = pos.y - 0.02, maxY = pos.y + h;
      if (maxX <= b.min.x || minX >= b.max.x || maxZ <= b.min.z || minZ >= b.max.z || maxY <= b.min.y || minY >= b.max.y) continue;
      const fromAbove = prev.y >= b.max.y - 0.06 - Math.max(0, b.delta.y);
      const stepUp = vel.y <= 0.01 && b.max.y - pos.y < 0.32 && b.max.y - pos.y > -0.05;
      if ((fromAbove || stepUp) && vel.y <= 0.01) {
        pos.y = b.max.y;
        if (vel.y < 0) vel.y = 0;
        out.grounded = true;
        out.groundBox = b;
        continue;
      }
      if (prev.y + h <= b.min.y + 0.08 && vel.y > 0) {
        pos.y = b.min.y - h;
        vel.y = 0;
        out.ceiling = true;
        continue;
      }
      const penX = Math.min(maxX - b.min.x, b.max.x - minX);
      const penZ = Math.min(maxZ - b.min.z, b.max.z - minZ);
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      const n = new THREE.Vector3();
      if (penX < penZ) {
        if (pos.x < cx) { pos.x -= maxX - b.min.x; n.set(-1, 0, 0); } else { pos.x += b.max.x - minX; n.set(1, 0, 0); }
      } else {
        if (pos.z < cz) { pos.z -= maxZ - b.min.z; n.set(0, 0, -1); } else { pos.z += b.max.z - minZ; n.set(0, 0, 1); }
      }
      const into = -(vel.x * n.x + vel.z * n.z);
      if (into > 0) {
        out.wallSpeed = Math.max(out.wallSpeed, into);
        vel.x += n.x * into;
        vel.z += n.z * into;
      }
      out.wall = n;
      out.wallBox = b;
    }

    const g = terrainHeight(pos.x, pos.z);
    if (pos.y <= g) {
      pos.y = g;
      if (vel.y < 0) vel.y = 0;
      out.grounded = true;
      out.groundBox = null;
    }

    // keep everyone inside the meadow
    const R = FEATURES.boundary - 2;
    const d = Math.hypot(pos.x, pos.z);
    if (d > R) {
      pos.x *= R / d;
      pos.z *= R / d;
    }
    return out;
  }
}
