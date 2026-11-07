// DOM overlay: health, collectibles, messages, sign hints, timers, boss bar.
export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="panel p1"><div class="name">Tali</div><div class="hearts"></div><div class="airbar"><div></div></div></div>
      <div class="panel p2"><div class="name">Bram</div><div class="hearts"></div><div class="airbar"><div></div></div></div>
      <div class="counts"><span class="prisms"></span><span class="drops"></span><span class="berries"></span></div>
      <div class="timer"></div>
      <div class="boss"><div class="label">Thistlequeen</div><div class="bar"><div></div></div></div>
      <div class="message"></div>
      <div class="hint"></div>
      <div class="divider"></div>`;
    this.el = (s) => root.querySelector(s);
    this.msgT = 0;
    this.lastHint = null;
    this.panels = [this.el('.p1'), this.el('.p2')];
    for (const p of this.panels) {
      const h = p.querySelector('.hearts');
      for (let i = 0; i < 6; i++) h.appendChild(document.createElement('i'));
    }
  }

  message(text, dur = 2.5) {
    const m = this.el('.message');
    m.textContent = text;
    m.classList.add('show');
    this.msgT = dur;
  }

  hint(text) {
    if (text === this.lastHint) return;
    this.lastHint = text;
    const h = this.el('.hint');
    h.textContent = text || '';
    h.classList.toggle('show', !!text);
  }

  timer(t) {
    const el = this.el('.timer');
    if (t === null) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.textContent = Math.max(0, t).toFixed(1) + ' s';
    el.classList.toggle('low', t < 5);
  }

  bossBar(show, hits = 0) {
    const b = this.el('.boss');
    b.classList.toggle('show', show);
    b.querySelector('.bar div').style.width = `${((3 - hits) / 3) * 100}%`;
  }

  setSplit(split) { this.el('.divider').classList.toggle('show', split); }

  update(dt, game) {
    this.msgT -= dt;
    if (this.msgT <= 0) this.el('.message').classList.remove('show');
    game.players.forEach((p, i) => {
      const panel = this.panels[i];
      panel.style.display = p.active ? '' : 'none';
      panel.querySelector('.name').textContent = p.def.name + (p.state === 'bubble' ? ' (bubbled)' : '');
      const hearts = panel.querySelectorAll('.hearts i');
      hearts.forEach((h, k) => {
        h.className = p.health >= k + 1 ? 'full' : p.health > k ? 'half' : '';
      });
      const air = panel.querySelector('.airbar');
      const under = p.state === 'swim' && p.swimMode === 'under';
      air.classList.toggle('show', under || p.air < 29.9);
      air.querySelector('div').style.width = `${(p.air / 30) * 100}%`;
    });
    const s = game.stats;
    this.el('.prisms').textContent = `Prisms ${s.prisms} / 7`;
    this.el('.drops').textContent = `Paint ${game.level.paintFound} / ${game.level.drops.length}`;
    this.el('.berries').textContent = `Berries ${s.berries}`;
  }
}
