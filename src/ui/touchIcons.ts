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

/** Skill buttons follow the fighter's move types. The ultimate is per character. */
export function applyTouchIcons(c: CharacterData): void {
  const pad = document.getElementById('touchpad');
  if (!pad) return;
  const put = (sel: string, src: string, label?: string) => {
    const el = pad.querySelector<HTMLElement>(sel);
    const img = el?.querySelector('img');
    if (img) img.src = src;
    if (label && el) el.setAttribute('aria-label', label);
  };
  put('[data-pad="s1"]', typeIcon[c.skills[2].type], c.skills[2].name);
  put('[data-pad="s2"]', typeIcon[c.skills[3].type], c.skills[3].name);
  put('[data-pad="s3"]', typeIcon[c.skills[4].type], c.skills[4].name);
  put('[data-pad="ult"]', `/icons/ult-${c.id}.png`, c.skills[5].name);
  pad.querySelector<HTMLElement>('[data-pad="ult"]')?.style.setProperty('--ico', `url("/icons/ult-${c.id}.png")`);
  put('[data-pad="atk"]', typeIcon.light);
}
