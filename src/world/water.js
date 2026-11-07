import * as THREE from 'three';
import { WATER_LEVEL } from '../config.js';

function noiseTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  // tileable normal map from summed sines
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      const dx = Math.cos(u * 3 + Math.sin(v * 2)) * 0.5 + Math.cos(u * 7 + v * 3) * 0.3 + Math.cos(u * 13 - v * 5) * 0.2;
      const dy = Math.cos(v * 4 + Math.sin(u * 3)) * 0.5 + Math.cos(v * 6 - u * 2) * 0.3 + Math.cos(v * 11 + u * 7) * 0.2;
      const i = (y * size + x) * 4;
      img.data[i] = 128 + dx * 60;
      img.data[i + 1] = 128 + dy * 60;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(220,245,255,0.55)';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 20 + Math.random() * 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildWater(scene) {
  const normal = noiseTexture();
  normal.repeat.set(30, 30);
  const normal2 = normal.clone();
  const mat = new THREE.MeshStandardMaterial({
    color: '#27c3d6',
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.78,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 1.2,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(280, 280, 1, 1), mat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  water.receiveShadow = true;
  water.renderOrder = 1;
  scene.add(water);

  // shallow caustic shimmer on the pond bed
  const caustic = new THREE.Mesh(
    new THREE.PlaneGeometry(280, 280),
    new THREE.MeshBasicMaterial({ map: normal2, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, color: '#bff7ff' }),
  );
  normal2.repeat.set(45, 45);
  caustic.rotation.x = -Math.PI / 2;
  caustic.position.y = WATER_LEVEL - 0.08;
  scene.add(caustic);

  const falls = [];
  return {
    mesh: water,
    addWaterfall(x, yTop, yBottom, z, width, facing = 0) {
      const tex = streakTexture();
      tex.repeat.set(width / 3, (yTop - yBottom) / 6);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(width, yTop - yBottom),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      m.position.set(x, (yTop + yBottom) / 2, z);
      m.rotation.y = facing;
      m.renderOrder = 3;
      scene.add(m);
      // rainbow arc in the mist
      const arcGeo = new THREE.TorusGeometry(width * 1.3, 0.5, 8, 48, Math.PI);
      const cols = [];
      const pos = arcGeo.attributes.position;
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), 0);
        const r = (v.length() - (width * 1.3 - 0.5)) / 1.0;
        c.setHSL(Math.max(0, Math.min(0.8, r * 0.8)), 1, 0.6);
        cols.push(c.r, c.g, c.b);
      }
      arcGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      arc.position.set(x, yBottom + 0.2, z + Math.cos(facing) * 4);
      arc.rotation.y = facing;
      scene.add(arc);
      falls.push({ tex, x, z, yBottom, width, facing });
      return m;
    },
    update(dt, t, particles) {
      normal.offset.set(t * 0.01, t * 0.017);
      normal2.offset.set(-t * 0.02, t * 0.012);
      for (const f of falls) {
        f.tex.offset.y = t * 1.6;
        if (Math.random() < dt * 30) {
          const px = f.x + (Math.random() - 0.5) * f.width;
          particles.spawn(new THREE.Vector3(px, f.yBottom + 0.2, f.z + Math.cos(f.facing) * 0.6), new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 1.5, Math.cos(f.facing) * (0.5 + Math.random())), '#f2fbff', 1.1, 1.8, 0.5, 0.8);
        }
      }
    },
  };
}
