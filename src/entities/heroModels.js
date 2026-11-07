import * as THREE from 'three';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...opts });

function eye(x) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), mat('#ffffff', { roughness: 0.3 }));
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat('#1b1630', { roughness: 0.2 }));
  pupil.position.z = 0.045;
  g.add(white, pupil);
  g.position.set(x, 0.05, 0.19);
  return g;
}

function limb(color, len, rad) {
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 4, 8), mat(color));
  m.position.y = -len / 2 - rad * 0.5;
  m.castShadow = true;
  pivot.add(m);
  return pivot;
}

// Returns { root, rig } where rig holds the animated parts.
export function buildHero(kind) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // pivot at the hero's centre for flips
  body.position.y = 0.55;
  root.add(body);
  const rig = { root, body };

  if (kind === 'tali') {
    const fur = '#ff8a3d', cream = '#fff1dc', scarf = '#2bb7ff';
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.26, 6, 12), mat(fur));
    torso.castShadow = true;
    body.add(torso);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), mat(cream));
    belly.scale.set(1, 1.2, 0.6); belly.position.set(0, -0.02, 0.14);
    body.add(belly);
    const head = new THREE.Group(); head.position.y = 0.42; body.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), mat(fur));
    skull.castShadow = true; head.add(skull);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 12), mat(cream));
    snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.06, 0.25); head.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat('#2a1a1a'));
    nose.position.set(0, -0.06, 0.38); head.add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 4), mat(fur));
      ear.position.set(0.14 * s, 0.25, -0.02); ear.rotation.z = -0.3 * s; head.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), mat('#ffd0b5'));
      inner.position.set(0.14 * s, 0.23, 0.02); inner.rotation.z = -0.3 * s; head.add(inner);
    }
    head.add(eye(-0.09), eye(0.09));
    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 16), mat(scarf, { roughness: 0.8 }));
    scarfRing.rotation.x = Math.PI / 2; scarfRing.position.y = 0.24; body.add(scarfRing);
    const tailPivot = new THREE.Group(); tailPivot.position.set(0, -0.15, -0.2); body.add(tailPivot);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 8), mat(fur));
    tail.position.set(0, 0.1, -0.2); tail.rotation.x = -1.0; tail.castShadow = true; tailPivot.add(tail);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(cream));
    tip.position.set(0, 0.28, -0.36); tailPivot.add(tip);
    const scarfTail = new THREE.Group(); scarfTail.position.set(0.08, 0.24, -0.18); body.add(scarfTail);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.42), mat(scarf, { roughness: 0.8 }));
    st.position.z = -0.21; st.castShadow = true; scarfTail.add(st);
    rig.tail = tailPivot; rig.scarf = scarfTail; rig.head = head;
    rig.legL = limb(fur, 0.16, 0.07); rig.legR = limb(fur, 0.16, 0.07);
    rig.armL = limb(fur, 0.14, 0.06); rig.armR = limb(fur, 0.14, 0.06);
  } else {
    const shell = '#a9743f', skin = '#f0c98f', brass = '#e0b13a';
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), mat(skin));
    torso.scale.set(1, 1.05, 1); torso.castShadow = true; body.add(torso);
    // overlapping shell plates
    for (let i = 0; i < 4; i++) {
      const plate = new THREE.Mesh(new THREE.SphereGeometry(0.35 - i * 0.015, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        mat(shell, { roughness: 0.5, flatShading: true }));
      plate.rotation.x = -0.9 - i * 0.12;
      plate.position.set(0, 0.06 - i * 0.07, -0.02 - i * 0.03);
      plate.castShadow = true;
      body.add(plate);
    }
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.16), mat(brass, { metalness: 0.7, roughness: 0.35 }));
    pack.position.set(0, 0.05, -0.36); pack.castShadow = true; body.add(pack);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), mat(brass, { metalness: 0.7, roughness: 0.3 }));
    pipe.position.set(0.12, 0.3, -0.38); body.add(pipe);
    const head = new THREE.Group(); head.position.set(0, 0.34, 0.12); body.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), mat(skin));
    skull.castShadow = true; head.add(skull);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), mat(shell, { flatShading: true }));
    cap.rotation.x = -0.4; head.add(cap);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 10), mat(skin));
    snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.06, 0.22); head.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat('#4a2c1a'));
    nose.position.set(0, -0.06, 0.33); head.add(nose);
    head.add(eye(-0.08), eye(0.08));
    const goggles = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), mat('#5a4a3a'));
    goggles.position.y = 0.06; goggles.rotation.x = Math.PI / 2 - 0.2; head.add(goggles);
    const tailPivot = new THREE.Group(); tailPivot.position.set(0, -0.2, -0.25); body.add(tailPivot);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 8), mat(shell, { flatShading: true }));
    tail.rotation.x = -2.2; tail.position.set(0, -0.05, -0.18); tail.castShadow = true; tailPivot.add(tail);
    rig.tail = tailPivot; rig.head = head;
    rig.legL = limb(skin, 0.12, 0.09); rig.legR = limb(skin, 0.12, 0.09);
    rig.armL = limb(skin, 0.12, 0.07); rig.armR = limb(skin, 0.12, 0.07);
  }

  rig.legL.position.set(-0.13, -0.2, 0); rig.legR.position.set(0.13, -0.2, 0);
  rig.armL.position.set(-0.28, 0.12, 0); rig.armR.position.set(0.28, 0.12, 0);
  body.add(rig.legL, rig.legR, rig.armL, rig.armR);

  // revive bubble
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 24, 16),
    new THREE.MeshStandardMaterial({ color: '#bfefff', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2, emissive: '#5fc8ff', emissiveIntensity: 0.25 }),
  );
  bubble.position.y = 0.55; bubble.visible = false;
  root.add(bubble);
  rig.bubble = bubble;
  return rig;
}
