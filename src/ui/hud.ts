import type { CharacterData } from '../data/types.ts';
import type { FightGame } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { skillHTML } from './select.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

export function updateHUD(g: FightGame): void {
  g.fighters.forEach((f, i) => {
    const n = i + 1;
    $('hud-name' + n).textContent = f.data.name;
    $('hp' + n).style.width = (f.hp / f.data.hp * 100) + '%';
    $('health' + n).textContent = f.hp <= 0 ? 'K.O.' : `${Math.ceil(f.hp)} / ${f.data.hp}  ·  防御 ${Math.ceil(f.guard)}%`;
    $('mp' + n).style.width = f.energy + '%';
    $('mp' + n).style.background = f.energy >= 100 ? '#d8ff62' : '#76e7ff';
    $('score' + n).textContent = g.mode === 'training' ? '' : '●'.repeat(g.wins[f.team]) + '○'.repeat(2 - g.wins[f.team]);
  });
  $('timer').textContent = g.mode === 'training' ? '∞' : String(Math.max(0, Math.ceil(g.time)));
  $('round').textContent = 'ROUND ' + g.round;
  const me = g.fighters[0];
  $('battle-skills').querySelectorAll<HTMLElement>('.skill').forEach((el, i) => {
    const cd = me.cooldowns[i];
    const msg = cd > 0 ? cd.toFixed(1) : i === 5 && me.energy < 100 ? Math.floor(me.energy) + ' / 100' : '';
    let tag = el.querySelector<HTMLElement>('.cooldown');
    if (msg) {
      if (!tag) { tag = document.createElement('span'); tag.className = 'cooldown'; el.append(tag); }
      tag.textContent = msg;
    } else tag?.remove();
  });
}

export function showBanner(title: string, sub = ''): void {
  $('banner-text').textContent = title;
  $('banner-sub').textContent = sub;
  $('banner').classList.toggle('super-call', sub.includes('SUPER'));
}

export function showEnd(winner: Fighter, stats: string): void {
  $('end').hidden = false;
  $('end-title').textContent = winner.data.name + ' 获胜';
  $('end-info').textContent = stats;
  showBanner('');
}

export function hideEnd(): void { $('end').hidden = true; }

export function setBattleGuide(c: CharacterData): void { $('battle-skills').innerHTML = skillHTML(c); }
