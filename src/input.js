// Two-player input: keyboard halves plus up to two gamepads (standard mapping).
const KEYMAPS = [
  {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    jump: ['Space'], crouch: ['ShiftLeft', 'KeyC'], attack: ['KeyF'], grab: ['KeyG'],
    camLeft: ['KeyQ'], camRight: ['KeyE'],
  },
  {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    jump: ['Enter', 'NumpadEnter', 'Numpad0'], crouch: ['ShiftRight', 'Numpad1'],
    attack: ['Slash', 'Numpad2'], grab: ['Period', 'Numpad3'],
    camLeft: ['BracketLeft'], camRight: ['BracketRight'],
  },
];

const BUTTONS = ['jump', 'crouch', 'attack', 'grab'];

export class Input {
  constructor() {
    this.down = new Set();
    this.pressedKeys = new Set();
    this.menuKeys = new Set();
    this.mouseDX = 0;
    this.dragging = false;
    this.prev = [{}, {}];
    this.states = [this.blank(), this.blank()];
    this.anyPressed = false;
    this.lastPressed = null;

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Enter'].includes(e.code)) e.preventDefault();
      if (!e.repeat) { this.pressedKeys.add(e.code); this.menuKeys.add(e.code); this.lastPressed = e.code; }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousedown', () => { this.dragging = true; });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => { if (this.dragging) this.mouseDX += e.movementX; });
  }

  blank() {
    return {
      moveX: 0, moveY: 0, camX: 0,
      jump: false, crouch: false, attack: false, grab: false,
      jumpPressed: false, crouchPressed: false, attackPressed: false, grabPressed: false,
      jumpReleased: false, active: false,
    };
  }

  keyHeld(list) { return list.some((k) => this.down.has(k)); }

  consumeKey(code) {
    const had = this.menuKeys.has(code);
    this.menuKeys.delete(code);
    return had;
  }

  endFrame() {
    this.menuKeys.clear();
  }

  // Call once per rendered frame.
  poll() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    this.anyPressed = this.pressedKeys.size > 0;
    for (let i = 0; i < 2; i++) {
      const km = KEYMAPS[i];
      const s = this.blank();
      s.moveX = (this.keyHeld(km.right) ? 1 : 0) - (this.keyHeld(km.left) ? 1 : 0);
      s.moveY = (this.keyHeld(km.up) ? 1 : 0) - (this.keyHeld(km.down) ? 1 : 0);
      s.camX = (this.keyHeld(km.camRight) ? 1 : 0) - (this.keyHeld(km.camLeft) ? 1 : 0);
      for (const b of BUTTONS) s[b] = this.keyHeld(km[b]);

      const pad = pads[i];
      if (pad) {
        const dz = (a) => (Math.abs(a) < 0.18 ? 0 : a);
        const ax = dz(pad.axes[0] || 0), ay = dz(pad.axes[1] || 0);
        if (Math.abs(ax) + Math.abs(ay) > 0) { s.moveX = ax; s.moveY = -ay; }
        const cx = dz(pad.axes[2] || 0);
        if (cx) s.camX = cx;
        const btn = (n) => !!(pad.buttons[n] && pad.buttons[n].pressed);
        s.jump = s.jump || btn(0);
        s.crouch = s.crouch || btn(1) || btn(6);
        s.attack = s.attack || btn(2);
        s.grab = s.grab || btn(3) || btn(7);
        if (btn(0) || btn(9)) this.anyPressed = this.anyPressed || !this.prev[i].padStart;
        this.prev[i].padStart = btn(0) || btn(9);
      }
      const len = Math.hypot(s.moveX, s.moveY);
      if (len > 1) { s.moveX /= len; s.moveY /= len; }

      const p = this.prev[i];
      for (const b of BUTTONS) {
        s[b + 'Pressed'] = s[b] && !p[b];
        p[b] = s[b];
      }
      s.jumpReleased = !s.jump && p.jumpWas;
      p.jumpWas = s.jump;
      s.active = len > 0.01 || BUTTONS.some((b) => s[b]);
      this.states[i] = s;
    }
    if (this.mouseDX) { this.states[0].camX += this.mouseDX * 0.15; this.mouseDX = 0; }
    this.pressedKeys.clear();
    return this.states;
  }
}
