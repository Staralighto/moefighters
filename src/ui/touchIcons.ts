import { applyImageUrl, assignImage } from '../assets/loader.ts';
import type { CharacterData, SkillType } from '../data/types.ts';

/** Phosphor fill icons, MIT. See public/icons/LICENSE-phosphor.txt. */
const typeIcon: Record<SkillType, string> = {
  light: '/icons/light.png',
  heavy: '/icons/heavy.png',
  dash: '/icons/dash.png',
  projectile: '/icons/projectile.png',
  grab: '/icons/grab.png',
  upper: '/icons/upper.png',
  sweep: '/icons/sweep.png',
  endure: '/icons/endure.png',
  launch: '/icons/launch.png',
};

export function atkIcon(heavy: boolean): string {
  return heavy ? typeIcon.heavy : typeIcon.light;
}

/** Fighters with their own ultimate drawing. Anyone else gets the shared mark. */
const ultArt = new Set(['gale', 'ember', 'boulder', 'sakiko', 'mutsumi', 'uika', 'umiri', 'nyamu', 'anon']);

/** Phosphor fill lightning, MIT. public/icons/ult.svg */
export const DEFAULT_ULT_ICON = '/icons/ult.svg';

export function ultIcon(id: string): string {
  return ultArt.has(id) ? `/icons/ult-${id}.png` : DEFAULT_ULT_ICON;
}

/** Skill buttons follow the fighter's move types. The ultimate is per character. */
export function applyTouchIcons(c: CharacterData): void {
  const pad = document.getElementById('touchpad');
  if (!pad) return;
  const put = (sel: string, src: string, label?: string) => {
    const el = pad.querySelector<HTMLElement>(sel);
    const img = el?.querySelector('img');
    if (img) assignImage(img, src);
    if (label && el) el.setAttribute('aria-label', label);
  };
  put('[data-pad="s1"]', typeIcon[c.skills[2].type], c.skills[2].name);
  put('[data-pad="s2"]', typeIcon[c.skills[3].type], c.skills[3].name);
  put('[data-pad="s3"]', typeIcon[c.skills[4].type], c.skills[4].name);
  const ult = ultIcon(c.id);
  put('[data-pad="ult"]', ult, c.skills[5].name);
  const ultEl = pad.querySelector<HTMLElement>('[data-pad="ult"]');
  if (ultEl) {
    ultEl.dataset.ico = ult;
    applyImageUrl(ult, url => {
      if (ultEl.dataset.ico !== ult) return;
      ultEl.style.setProperty('--ico', `url("${url}")`);
    });
  }
  put('[data-pad="atk"]', typeIcon.light);
}
