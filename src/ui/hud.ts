import type { CharacterData } from '../data/types.ts';
import type { FightGame } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { guideIndex, skillHTML } from './select.ts';
import { applyTouchIcons } from './touchIcons.ts';
import { CONTROLS, SIDE } from '../game/constants.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const elCache = new Map<string, HTMLElement>();
/** The HUD ids are stable for the page's life; re-resolving ~30 of them per tick was busywork. */
const $m = (id: string): HTMLElement => {
  let el = elCache.get(id);
  if (!el || !el.isConnected) { el = $(id); elCache.set(id, el); }
  return el;
};
/** A text or style write dirties the DOM even when the value is unchanged, and the HUD
 *  ticks at ~14Hz for a whole match, so no-op writes are skipped. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

let hudEl: HTMLElement | null = null;
let touchKeys: HTMLElement[] | null = null;
let touchUlt: HTMLElement | null = null;
/** Rebuilt by setBattleGuide whenever the movelist HTML is replaced. */
let skillRows: HTMLElement[] = [];
let skillCharges: (HTMLElement | null)[] = [];
let cooldownTags: (HTMLElement | null)[] = [];
let guideFighter = 0;
/** Challenge stages swap the ROUND counter for the stage number; empty keeps the round. */
let roundLabel = '';
/** Battle movelist text density (docs/skill-desc-guide.md §1): 1 names only, 2 the standalone
 *  mechanic brief, 3 the nums line plus the same mechanics with their numbers. Cycles 2 → 3 → 1
 *  on the table button; tier 2 is the default because it is the only tier most players read. */
const TIER_LABELS = ['说明：关', '说明：简述', '说明：详述'];
let skillTier = 2;

function paintSkillTier(): void {
  $('battle-skills').dataset.tier = String(skillTier);
  const btn = $('skill-tier');
  btn.setAttribute('aria-label', TIER_LABELS[skillTier - 1] + '，点击切换');
  btn.querySelector('.btn-label')!.textContent = TIER_LABELS[skillTier - 1];
}

export function cycleSkillTier(): void {
  skillTier = skillTier === 3 ? 1 : skillTier + 1;
  paintSkillTier();
}

export function setRoundLabel(text: string): void {
  roundLabel = text;
}

export function updateHUD(g: FightGame): void {
  const team = g.mode === 'team';
  const challenge = g.mode === 'challenge';
  // 无尽激战 only: a 1v1 闯关 keeps the standard duo HUD even when a summon pads the roster.
  const pair = challenge && g.fighters.filter(f => !f.minion).length > 2;
  hudEl ??= document.querySelector<HTMLElement>('.hud');
  hudEl?.classList.toggle('team', team);
  hudEl?.classList.toggle('challenge', pair);
  $('hud-ally').hidden = !team;
  $('hud-enemy2').hidden = !(team || pair);
  const bars: { f: Fighter; n: number; score: boolean }[] = team
    ? [
        { f: g.fighters[0], n: 1, score: true },
        { f: g.fighters[1], n: 3, score: false },
        { f: g.fighters[2], n: 2, score: true },
        { f: g.fighters[3], n: 4, score: false },
      ]
    : pair
      ? [
          { f: g.fighters[0], n: 1, score: false },
          { f: g.fighters[1], n: 2, score: false },
          { f: g.fighters[2], n: 4, score: false },
        ]
      : challenge
        ? [
            { f: g.fighters[0], n: 1, score: false },
            { f: g.fighters[1], n: 2, score: false },
          ]
        : [
            { f: g.fighters[0], n: 1, score: true },
            { f: g.fighters[1], n: 2, score: true },
          ];
  for (const { f, n, score } of bars) {
    setText($m('hud-name' + n), f.data.name);
    const hp = $m('hp' + n);
    const hpPct = (f.hp / f.data.hp * 100) + '%';
    if (hp.style.width !== hpPct) hp.style.width = hpPct;
    // The bar already shows health; raw numbers only matter in training. Guard has no bar, so it stays.
    const guard = `防御 ${Math.ceil(f.guard)}%`;
    setText($m('health' + n), f.hp <= 0 ? 'K.O.' : g.mode === 'training' ? `${Math.ceil(f.hp)} / ${f.data.hp}  ·  ${guard}` : guard);
    const mp = $m('mp' + n);
    const mpPct = f.energy + '%';
    if (mp.style.width !== mpPct) mp.style.width = mpPct;
    const mpBg = f.energy >= 100 ? SIDE[f.team] : '#76e7ff';
    if (mp.style.background !== mpBg) mp.style.background = mpBg;
    if (score) setText($m('score' + n), g.mode === 'training' ? '' : '●'.repeat(g.wins[f.team]) + '○'.repeat(2 - g.wins[f.team]));
  }
  // A challenge run has no round score; stale dots from a previous match must not linger.
  if (challenge) { setText($m('score1'), ''); setText($m('score2'), ''); }
  setText($m('timer'), g.mode === 'training' ? '∞' : String(Math.max(0, Math.ceil(g.time))));
  setText($m('round'), roundLabel || 'ROUND ' + g.round);
  const me = g.fighters[guideFighter] ?? g.fighters[0];
  const cdMsg = (i: number) => {
    const cd = me.cooldowns[i];
    return cd > 0 ? cd.toFixed(1) : i === 5 && me.energy < 100 ? Math.floor(me.energy) + ' / 100' : '';
  };
  const paintCd = (b: HTMLElement, cd: number) => {
    if (!(cd > 0)) {
      b.classList.remove('cooling');
      b.style.removeProperty('--cd');
      delete b.dataset.cdMax;
      return;
    }
    // The first frame of a cooldown is the full clock. Later frames only shrink, unless a channel extends it.
    const prev = Number(b.dataset.cdMax);
    const max = Math.max(cd, prev > 0 ? prev : 0);
    b.dataset.cdMax = String(max);
    b.style.setProperty('--cd', max > 0 ? String(1 - cd / max) : '0');
    b.classList.add('cooling');
  };
  // The pad is display:none on plain desktop, so body.touch gates the whole block out for free.
  // Wide mode shows the same pad as cooldown indicators, so it rides the same updates.
  if (document.body.classList.contains('touch') || document.body.classList.contains('wide')) {
    touchKeys ??= [...$m('touchpad').querySelectorAll<HTMLElement>('.tp-actions [data-key]')];
    for (const b of touchKeys) {
      if (b.classList.contains('ult')) continue;
      const i = CONTROLS[0].attacks.indexOf(b.dataset.key!);
      paintCd(b, i >= 0 ? me.cooldowns[i] : 0);
    }
    touchUlt ??= $m('touchpad').querySelector<HTMLElement>('.ult');
    if (touchUlt) {
      const ready = me.energy >= 100;
      touchUlt.style.setProperty('--p', String(Math.min(1, me.energy / 100)));
      touchUlt.classList.toggle('ready', ready);
    }
  }
  for (let i = 0; i < skillRows.length; i++) {
    const el = skillRows[i];
    const charge = i === 5 ? skillCharges[i] : null;
    if (charge) {
      const h = Math.min(100, me.energy) + '%';
      if (charge.style.height !== h) charge.style.height = h;
      continue;
    }
    const msg = cdMsg(i);
    let tag = cooldownTags[i] ?? null;
    if (msg) {
      if (!tag) { tag = document.createElement('span'); tag.className = 'cooldown'; el.append(tag); cooldownTags[i] = tag; }
      setText(tag, msg);
    } else if (tag) {
      tag.remove();
      cooldownTags[i] = null;
    }
  }
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
  // The movelist was just rebuilt: re-index its rows so the 14Hz loop stops re-querying.
  skillRows = [...document.querySelectorAll<HTMLElement>('#battle-skills .skill')];
  skillCharges = skillRows.map(el => el.querySelector<HTMLElement>('.charge i'));
  cooldownTags = skillRows.map(() => null);
  // Every match opens on the compact tier; the button is there when someone reaches for detail.
  skillTier = 2;
  paintSkillTier();
}
