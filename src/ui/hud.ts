import type { CharacterData } from '../data/types.ts';
import type { FightGame } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { guideIndex, skillHTML } from './select.ts';
import { applyTouchIcons } from './touchIcons.ts';
import { CONTROLS, SIDE } from '../game/constants.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
let guideFighter = 0;

export function updateHUD(g: FightGame): void {
  const team = g.mode === 'team';
  document.querySelector('.hud')?.classList.toggle('team', team);
  $('hud-ally').hidden = !team;
  $('hud-enemy2').hidden = !team;
  const bars: { f: Fighter; n: number; score: boolean }[] = team
    ? [
        { f: g.fighters[0], n: 1, score: true },
        { f: g.fighters[1], n: 3, score: false },
        { f: g.fighters[2], n: 2, score: true },
        { f: g.fighters[3], n: 4, score: false },
      ]
    : [
        { f: g.fighters[0], n: 1, score: true },
        { f: g.fighters[1], n: 2, score: true },
      ];
  for (const { f, n, score } of bars) {
    $('hud-name' + n).textContent = f.data.name;
    $('hp' + n).style.width = (f.hp / f.data.hp * 100) + '%';
    $('health' + n).textContent = f.hp <= 0 ? 'K.O.' : `${Math.ceil(f.hp)} / ${f.data.hp}  ·  防御 ${Math.ceil(f.guard)}%`;
    $('mp' + n).style.width = f.energy + '%';
    $('mp' + n).style.background = f.energy >= 100 ? SIDE[f.team] : '#76e7ff';
    if (score) $('score' + n).textContent = g.mode === 'training' ? '' : '●'.repeat(g.wins[f.team]) + '○'.repeat(2 - g.wins[f.team]);
  }
  $('timer').textContent = g.mode === 'training' ? '∞' : String(Math.max(0, Math.ceil(g.time)));
  $('round').textContent = 'ROUND ' + g.round;
  const me = g.fighters[guideFighter] ?? g.fighters[0];
  const cdMsg = (i: number) => {
    const cd = me.cooldowns[i];
    return cd > 0 ? cd.toFixed(1) : i === 5 && me.energy < 100 ? Math.floor(me.energy) + ' / 100' : '';
  };
  $('touchpad').querySelectorAll<HTMLElement>('.tp-actions [data-key]').forEach(b => {
    if (b.classList.contains('ult')) return;
    const msg = cdMsg(CONTROLS[0].attacks.indexOf(b.dataset.key!));
    if (msg) b.dataset.cd = msg; else delete b.dataset.cd;
  });
  const ult = $('touchpad').querySelector<HTMLElement>('.tp-actions .ult');
  if (ult) {
    const ready = me.energy >= 100;
    ult.style.setProperty('--p', String(Math.min(1, me.energy / 100)));
    ult.classList.toggle('ready', ready);
    delete ult.dataset.cd;
  }
  const atkBtn = $('touchpad').querySelector<HTMLElement>('.tp-actions .atk');
  if (atkBtn) {
    const n = me.cooldowns[0] > 0 ? me.cooldowns[0] : me.cooldowns[1];
    if (n > 0) atkBtn.dataset.cd = n.toFixed(1); else delete atkBtn.dataset.cd;
  }
  $('battle-skills').querySelectorAll<HTMLElement>('.skill').forEach((el, i) => {
    const charge = i === 5 ? el.querySelector<HTMLElement>('.charge i') : null;
    if (charge) { charge.style.height = Math.min(100, me.energy) + '%'; return; }
    const msg = cdMsg(i);
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

export function showEnd(title: string, stats: string): void {
  $('end').hidden = false;
  $('end-title').textContent = title;
  $('end-info').textContent = stats;
  showBanner('');
}

export function hideEnd(): void { $('end').hidden = true; }

export function setBattleGuide(characters: CharacterData[], controllers: (number | null)[]): void {
  guideFighter = Math.min(guideIndex(controllers), Math.max(0, characters.length - 1));
  $('battle-skills').innerHTML = skillHTML(characters[guideFighter], controllers[guideFighter] ?? 0);
  applyTouchIcons(characters[guideFighter]);
}
