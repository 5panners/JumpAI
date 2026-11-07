import './style.css';
import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const game = new Game(document.getElementById('app'), document.getElementById('hud'), {
  lowfx: params.has('lowfx'),
});
window.__jumpai = game;

document.querySelectorAll('[data-start]').forEach((b) => {
  b.addEventListener('click', () => game.start(Number(b.dataset.start)));
});
document.getElementById('assist').addEventListener('change', (e) => {
  game.assist = e.target.checked;
});
document.getElementById('resume').addEventListener('click', () => {
  game.mode = 'play';
  document.body.classList.remove('paused');
});
document.getElementById('keep-playing').addEventListener('click', () => document.body.classList.remove('won'));

if (params.has('players')) game.start(Number(params.get('players')) || 2);
game.run();
