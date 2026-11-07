import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(0.55, 0.75, 0.38).normalize();
export const FOG_COLOR = new THREE.Color('#bfe3f2');

export function buildSkyMesh() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#3f8fe8') },
      mid: { value: new THREE.Color('#8fd0f5') },
      horizon: { value: FOG_COLOR.clone() },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.18, h));
        c = mix(c, top, smoothstep(0.18, 0.8, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0,0.92,0.7) * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

function ridgeRing(radius, base, amp, freqs, color, topColor, seed) {
  const n = 220;
  const pos = [], col = [], idx = [];
  const c0 = new THREE.Color(color), c1 = new THREE.Color(topColor);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    let h = base;
    freqs.forEach((f, k) => { h += amp * Math.abs(Math.sin(a * f + seed * (k + 1))) / (k + 1); });
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    pos.push(x, -40, z, x, h, z);
    col.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
    if (i < n) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
  return m;
}

function cloud(rng) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 1, flatShading: true });
  const n = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + rng() * 6, 1), mat);
    s.position.set((i - n / 2) * 7 + rng() * 3, rng() * 4, rng() * 6);
    s.scale.y = 0.6;
    g.add(s);
  }
  return g;
}

function floatingIsland(rng) {
  const g = new THREE.Group();
  const r = 6 + rng() * 8;
  const rock = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.6, 7), new THREE.MeshStandardMaterial({ color: '#a58fc4', flatShading: true, roughness: 1 }));
  rock.rotation.x = Math.PI; rock.position.y = -r * 0.8;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, 1.6, 7), new THREE.MeshStandardMaterial({ color: '#6fd35a', flatShading: true }));
  g.add(rock, top);
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + rng() * 1.5, 0), new THREE.MeshStandardMaterial({ color: ['#2fa84f', '#ff86c8', '#ffd447'][i % 3], flatShading: true }));
    t.position.set((rng() - 0.5) * r, 2.5, (rng() - 0.5) * r);
    g.add(t);
  }
  // little waterfall streak
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.4, r * 2.2), new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.55 }));
  fall.position.set(r * 0.9, -r * 1.0, 0); fall.rotation.y = Math.PI / 2;
  g.add(fall);
  return g;
}

function hushedCrown() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#7d7a86', roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#4d4a57', roughness: 0.9, flatShading: true });
  const base = new THREE.Mesh(new THREE.ConeGeometry(38, 70, 8), dark);
  base.rotation.x = Math.PI; base.position.y = -35;
  g.add(base);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(38, 38, 6, 8), stone);
  g.add(plat);
  const towers = [[0, 0, 12, 60], [-22, 8, 7, 38], [22, -6, 7, 42], [10, 22, 6, 30], [-12, -22, 6, 34], [26, 16, 5, 26]];
  for (const [x, z, r, h] of towers) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 8), stone);
    t.position.set(x, h / 2, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.15, r * 2.4, 8), dark);
    roof.position.set(x, h + r * 1.2, z);
    g.add(t, roof);
  }
  // crown points
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(2.2, 14, 4), stone);
    spike.position.set(Math.cos(a) * 9, 66 + 7, Math.sin(a) * 9);
    g.add(spike);
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshStandardMaterial({ color: '#c9b8ff', emissive: '#a48cff', emissiveIntensity: 1.6 }));
  glow.position.y = 80;
  g.add(glow);
  return g;
}

export function buildBackdrop(scene) {
  let s = 7;
  const rng = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const group = new THREE.Group();
  scene.add(group);

  // Depth layers: near hills, blue mountains, pale peaks (fog does the rest).
  const near = ridgeRing(230, 14, 22, [3, 7, 13], '#4fae63', '#86d46b', 1.3);
  const mid = ridgeRing(380, 30, 55, [4, 9, 17], '#5c86c4', '#8db4e6', 2.1);
  const far = ridgeRing(620, 70, 110, [2, 5, 11], '#9fb8e0', '#f2f6ff', 3.7);
  group.add(near, mid);
  scene.add(far); // follows the camera for a sense of infinite depth

  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const c = cloud(rng);
    const a = rng() * Math.PI * 2, r = 160 + rng() * 380;
    c.position.set(Math.cos(a) * r, 70 + rng() * 70, Math.sin(a) * r);
    c.rotation.y = rng() * Math.PI;
    c.userData = { a, r, speed: 0.004 + rng() * 0.006 };
    group.add(c);
    clouds.push(c);
  }

  const islands = [];
  const islandSpots = [[-0.3, 170, 46], [0.9, 190, 60], [2.2, 160, 38], [3.4, 200, 70], [4.6, 175, 52], [5.6, 210, 40]];
  for (const [a, r, y] of islandSpots) {
    const isl = floatingIsland(rng);
    isl.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    isl.userData = { y, phase: rng() * 6 };
    group.add(isl);
    islands.push(isl);
  }

  const crown = hushedCrown();
  crown.position.set(-60, 150, -470);
  crown.scale.setScalar(1.3);
  group.add(crown);

  // a flock of birds circling high above
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 0, 0, 0.6, 0, 0, -0.2, 0, 0, 0.6, 1, 0, 0, 0, 0, -0.2], 3));
  birdGeo.computeVertexNormals();
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: '#334155', side: THREE.DoubleSide }), 14);
  birds.frustumCulled = false;
  group.add(birds);
  const dummy = new THREE.Object3D();

  return {
    update(dt, t, camPos) {
      far.position.set(camPos.x * 0.9, 0, camPos.z * 0.9);
      for (const c of clouds) {
        c.userData.a += c.userData.speed * dt;
        c.position.x = Math.cos(c.userData.a) * c.userData.r;
        c.position.z = Math.sin(c.userData.a) * c.userData.r;
      }
      for (const isl of islands) isl.position.y = isl.userData.y + Math.sin(t * 0.3 + isl.userData.phase) * 2;
      crown.position.y = 150 + Math.sin(t * 0.15) * 4;
      crown.rotation.y = t * 0.01;
      for (let i = 0; i < 14; i++) {
        const a = t * 0.12 + i * 0.25;
        dummy.position.set(30 + Math.cos(a) * 70 + Math.sin(i) * 6, 60 + Math.sin(i * 1.7) * 5, -20 + Math.sin(a) * 70 + Math.cos(i) * 6);
        dummy.rotation.set(0, -a, Math.sin(t * 8 + i) * 0.5);
        dummy.scale.setScalar(1.2);
        dummy.updateMatrix();
        birds.setMatrixAt(i, dummy.matrix);
      }
      birds.instanceMatrix.needsUpdate = true;
    },
    setColorRestored(k) {
      crown.children.forEach((m) => { if (m.material && m.material.emissive) m.material.emissiveIntensity = 1.6 - k; });
    },
  };
}
