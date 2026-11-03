/**
 * 设备能力的唯一裁决处，产出互斥的 body.touch / body.keys。
 * CSS 只按视口和布局类排版，玩法开关由 main.ts 写，规则见 docs/device-adaptation.md。
 *
 * 先认标准主指针 / 无悬停粗指针，再用触屏硬件回退：短边 < 768，或没有正向细指针。
 * 大屏混合设备起步仍可用键鼠；真正发生过触摸后，本次访问锁定触屏优先，
 * 不允许桌面 UA、谎报的 screen、外接鼠标或转屏重新收走摇杆。
 * 没有任何可信触屏信号时仍保持键鼠默认，不靠 UA 品牌表猜设备。
 */
import { onMediaChange } from './media.ts';

const coarse = matchMedia('(hover: none) and (pointer: coarse)');
const touchOnly = matchMedia('(any-hover: none) and (any-pointer: coarse)');
const anyPointer = matchMedia('(any-pointer: coarse)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
// A real contact is stronger evidence than screen dimensions or a desktop-mode media query.
let touchUsed = false;

function shortSide(): number {
  const side = Math.min(screen.width, screen.height);
  return Number.isFinite(side) && side > 0 ? side : 0;
}

export function touchDevice(): boolean {
  if (touchUsed || coarse.matches || touchOnly.matches) return true;
  const hardware = navigator.maxTouchPoints > 0
    || 'ontouchstart' in window
    || 'ontouchstart' in document.documentElement
    || anyPointer.matches;
  return hardware && (!fine.matches || shortSide() < 768);
}

/** 正向键鼠。宽屏收杆只认这个，不认「没有 touch」。 */
export function keysDevice(): boolean {
  return !touchDevice() && fine.matches && shortSide() >= 768;
}

/** 把当前裁决写进 body。touch 与 keys 互斥。 */
export function applyTouchDevice(): void {
  const touch = touchDevice();
  for (const [name, on] of [['touch', touch], ['keys', !touch && keysDevice()]] as const) {
    if (document.body.classList.contains(name) !== on) document.body.classList.toggle(name, on);
  }
}

/**
 * 能力变化通知。回调触发时 body 类已是最新；没变化不回调。
 * 主指针、any-hover / any-pointer、resize、转屏都会重算：折叠屏跨过 768、晚到的 screen 尺寸靠这个。
 * 窗口变窄不改 screen 短边；真实触摸是会话内更强的证据。
 */
export function watchTouch(onChange: () => void): void {
  const fire = () => {
    const before = document.body.classList.contains('touch') ? 't' : document.body.classList.contains('keys') ? 'k' : '';
    applyTouchDevice();
    const after = document.body.classList.contains('touch') ? 't' : document.body.classList.contains('keys') ? 'k' : '';
    if (after !== before) onChange();
  };
  const contact = () => {
    if (touchUsed) return;
    touchUsed = true;
    fire();
  };
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') contact(); }, { capture: true, passive: true });
  window.addEventListener('touchstart', contact, { capture: true, passive: true });
  for (const q of [coarse, touchOnly, anyPointer, fine]) onMediaChange(q, fire);
  window.addEventListener('resize', fire);
  window.addEventListener('orientationchange', fire);
  window.addEventListener('pageshow', fire);
}
