import { assetUrl } from '../assets/loader.ts';
import type { SfxKind } from '../game/game.ts';

/* Synthesised arcade blips. No sample files to ship — except the horn, see whistle(). */
const TONES: Record<Exclude<SfxKind, `blood-${string}` | `finale-${string}`>, [number, number]> = {
  light: [380, .07], heavy: [140, .18], hit: [180, .1], block: [680, .055], parry: [430, .1], super: [780, .55],
  select: [650, .06], jump: [260, .12], ko: [105, .65], cast: [470, .17], key: [880, .05],
  whistle: [310, .55], slam: [95, .16], engine: [60, 1], 'engine-rev': [60, 1.5],
};

/** MASKING's bike, kept under the fight: a quiet rumble, felt more than heard. */
const ENGINE_GAIN = .035;
/** Engine pitch over the sound, [seconds, Hz]: the kick start, a blip, then pulling away. The rev
 *  version blips twice before it goes, timed to the 0.5 s rev of 银河流星踢. */
const ENGINE_CURVE: Record<'engine' | 'engine-rev', readonly (readonly [number, number])[]> = {
  engine: [[0, 34], [.1, 68], [.2, 50], [.32, 92], [.95, 122]],
  'engine-rev': [[0, 32], [.12, 74], [.24, 48], [.36, 88], [.48, 56], [.6, 104], [1.5, 132]],
};

/** 微笑号的汽笛: a real recording, not a synth — qubodup's "Fog Horn" from Freesound,
 *  CC0, trimmed to the first blast with a fade-out. */
const HORN_SRC = '/sfx/ship-horn.mp3';
const HORN_GAIN = .15;

/** 血月的奏鸣: the sixteen notes, four rising or falling arpeggios over Dm, B♭, Gm, A (Hz).
 *  An original phrase written for this move. */
const BLOOD_PHRASE = [
  293.66, 349.23, 440, 587.33,
  587.33, 466.16, 349.23, 293.66,
  392, 466.16, 587.33, 783.99,
  440, 554.37, 659.25, 880,
];
/** The bass under each chord: D2, B♭2, G2, A2. */
/** Overall level of the 血月的奏鸣 music, about −12 dB under the note gains below: felt more than heard. */
const BLOOD_LEVEL = .25;
const BLOOD_BASS = [73.42, 116.54, 98, 110];
/** 终幕 cues' overall level: under the BGM's loudest moments, over the frozen fight. */
const FINALE_LEVEL = .55;
/** 终幕 recorded cues, all Freesound CC0 (free for commercial use, no credit required), cut from their
 *  HQ previews to just the slice that plays (mono 112 kbps, ~200 KB together; cut points in
 *  public/sfx/CREDITS.txt). `at` / `dur` can still pick a slice, `gain` sets it against the rest (peaks
 *  sit near 0 dB, so level × gain stays under 1).
 *  Until a file has loaded (or if it fails) the synthesised cue in finale() plays instead.
 *    shatter  "Glass Break"                        unfa            freesound.org/s/221528
 *  The other seven recorded cues are archived with their credits in 素材/finale-sfx/. */
const FINALE_SAMPLES: Partial<Record<SfxKind, { src: string; at: number; dur: number; gain: number; fadeIn?: number; fadeOut?: number; lowpass?: number }>> = {
  // A decoration, not an event: well under the music, the brittle top rolled off so it never stings.
  'finale-shatter': { src: '/sfx/finale/shatter.mp3', at: 0, dur: 1.6, gain: .45, fadeOut: .5, lowpass: 4200 },
};

/** Select-screen cues. Not SfxKind: the match never plays these. */
export type UiSound = 'hover' | 'swish' | 'confirm' | 'deny' | 'land' | 'whoosh' | 'vs'
  /* 手机后台页（ui/mobile.ts，只在触屏发声）：都很轻、很短，是装饰不是主角。 */
  | 'tap' | 'tab' | 'tick' | 'open' | 'back' | 'buy' | 'coin' | 'chime' | 'cancel';

const VOLUME_KEY = 'mf-sfx-volume';
function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch { return 1; }
}

/** 音浪无双的声音（导演排、HUD 交过来；见 musou/director.ts 的 MuSound）。 */
export type MusouSound = 'hit' | 'kill' | 'perfect' | 'heatUp' | 'heatDown' | 'cardIn' | 'cardPick' | 'riser' | 'fever' | 'ultCast' | 'ultDrop'
  | 'tick' | 'ding' | 'supply' | 'boom' | 'warn' | 'rush' | 'break' | 'squeeze' | 'hurt' | 'slam'
  | 'milestone' | 'grab' | 'escape' | 'dash' | 'slow' | 'pop' | 'crowd'
  | 'slam' | 'slamHeavy' | 'jump2' | 'charge' | 'bowl' | 'pip' | 'pipBreak' | 'armor' | 'shieldUp'
  | 'giantLand' | 'giantBreak' | 'liftUp' | 'liftDown' | 'rare' | 'rareEnd'
  | 'laser' | 'feedback' | 'zap' | 'anomaly' | 'ball' | 'pad' | 'grooveUp' | 'scratch';
export type StorySound = 'blip' | 'pop' | 'boing' | 'sparkle' | 'step' | 'flip' | 'thud' | 'curtain' | 'bell' | 'glitch' | 'nod' | 'stomp';

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  /** 所有音效都经过这一个总音量，设置里的「音效音量」只动它。 */
  private out: GainNode | null = null;
  private vol = readVolume();
  private saveTimer = 0;

  /** 0–1。存在本地，下次打开还是这个音量。 */
  get volume(): number { return this.vol; }
  set volume(v: number) {
    this.vol = Math.min(1, Math.max(0, v));
    // 拖滑条时每个 input 事件都会进来：存档合并到停手后再写一次。
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try { localStorage.setItem(VOLUME_KEY, String(this.vol)); } catch { /* private mode */ }
    }, 250);
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.vol, this.ctx.currentTime, .02);
  }

  private dest(): AudioNode {
    const ctx = this.ctx!;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = this.vol;
      this.out.connect(ctx.destination);
    }
    return this.out;
  }
  private horn: AudioBuffer | null = null;
  private hornBroken = false;

  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        fetch(assetUrl(HORN_SRC))
          .then(r => { if (!r.ok) throw new Error('horn fetch ' + r.status); return r.arrayBuffer(); })
          .then(ab => this.ctx!.decodeAudioData(ab))
          .then(buf => { this.horn = buf; })
          .catch(() => { this.hornBroken = true; });
      }
      void this.ctx.resume();
    } catch { /* no audio on this device */ }
  }

  /** 终幕: fetch and decode the recorded cues. Called when a match has a character with a cut-in,
   *  so nobody else downloads them. Safe to call again. */
  private finaleBufs = new Map<string, AudioBuffer | null>();
  preloadFinale(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const spec of Object.values(FINALE_SAMPLES)) {
      if (!spec || this.finaleBufs.has(spec.src)) continue;
      this.finaleBufs.set(spec.src, null);
      fetch(assetUrl(spec.src))
        .then(r => { if (!r.ok) throw new Error(spec.src + ' ' + r.status); return r.arrayBuffer(); })
        .then(ab => ctx.decodeAudioData(ab))
        .then(buf => { this.finaleBufs.set(spec.src, buf); })
        .catch(() => { this.finaleBufs.delete(spec.src); });
    }
  }

  /** Play the recorded slice for a cut-in cue; false when it is not loaded (the synth plays instead). */
  private finaleSample(kind: SfxKind): boolean {
    const spec = FINALE_SAMPLES[kind];
    const buf = spec && this.finaleBufs.get(spec.src);
    if (!spec || !buf) return false;
    const ctx = this.ctx!, t = ctx.currentTime;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    const level = FINALE_LEVEL * spec.gain;
    const dur = Math.min(spec.dur, buf.duration - spec.at);
    g.gain.setValueAtTime(spec.fadeIn ? .0001 : level, t);
    if (spec.fadeIn) g.gain.exponentialRampToValueAtTime(level, t + spec.fadeIn);
    if (spec.fadeOut) { g.gain.setValueAtTime(level, t + Math.max(0, dur - spec.fadeOut)); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
    let head: AudioNode = src;
    if (spec.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = spec.lowpass;
      head = src.connect(lp);
    }
    head.connect(g).connect(this.dest());
    src.start(t, spec.at, dur);
    return true;
  }

  play(kind: SfxKind): void {
    if (this.muted || !this.ctx) return;
    if (kind.startsWith('blood-')) { this.blood(kind); return; }
    if (kind.startsWith('finale-')) { if (!this.finaleSample(kind)) this.finale(kind); return; }
    if (kind === 'whistle') { this.whistle(); return; }
    if (kind === 'slam') { this.slam(); return; }
    if (kind === 'engine' || kind === 'engine-rev') { this.engine(kind); return; }
    if (kind === 'parry') { this.parry(); return; }
    const [freq, duration] = TONES[kind as keyof typeof TONES];
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(35, freq / 3), t + duration);
    g.gain.setValueAtTime(.06, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    o.connect(g).connect(this.dest());
    o.start(t);
    o.stop(t + duration);
  }

  /** Select-screen sounds. Kept apart from SfxKind: the fight, the net relay and the lockstep
   *  replay never see these, so nothing on the wire changes. */
  /* 界面音的强度表（从轻到重，同一级的操作共用同一个声音；越常按的越轻，免得熟手听烦）：
     tick 横滑经过 < cancel 滑开取消 < tap 普通点按 < tab 切分类 / 单选 < back / open 退一层 / 进一层
     < deny 不可用（温和的低音，不刺耳） < buy / coin / chime 买下、领取、演出落定（最重，偶尔才有）。
     高频的 tap / tab / tick / back / open 每次随机偏 ±3% 音高，连点不像机关枪。 */
  ui(kind: UiSound, step = 0): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const jit = kind === 'tap' || kind === 'tab' || kind === 'tick' || kind === 'back' || kind === 'open' || kind === 'cancel'
      ? 2 ** ((Math.random() * 2 - 1) * .5 / 12) : 1;
    const tone = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, gain: number, lowpass = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      f0 *= jit; f1 *= jit;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dur);
      g.gain.setValueAtTime(.0001, t + at);
      g.gain.exponentialRampToValueAtTime(gain, t + at + Math.min(.012, dur / 4));
      g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
      let head: AudioNode = o;
      if (lowpass) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lowpass;
        head = o.connect(lp);
      }
      head.connect(g).connect(this.dest());
      o.start(t + at);
      o.stop(t + at + dur + .02);
    };
    const noise = (at: number, dur: number, gain: number, f0: number, f1: number, q = .8) => {
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this.noiseBuffer();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t + at);
      bp.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(.0001, t + at);
      g.gain.exponentialRampToValueAtTime(gain, t + at + dur * .35);
      g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
      n.connect(bp).connect(g).connect(this.dest());
      n.start(t + at);
      n.stop(t + at + dur + .02);
    };
    switch (kind) {
      case 'hover': tone('sine', 2300, 1900, 0, .03, .016); break;
      case 'swish': noise(0, .2, .07, 700, 3400); break;
      case 'confirm': tone('triangle', 660, 640, 0, .08, .06); tone('triangle', 990, 980, .055, .12, .06); break;
      /* 不可用：两下温和的低音（三角波 + 低通），听得出「不行」但不刺耳。 */
      case 'deny': tone('triangle', 220, 170, 0, .08, .05, 900); tone('triangle', 196, 150, .09, .1, .045, 900); break;
      /* 滑开取消：比 tap 更短更暗、往下走的一下，「没算」。 */
      case 'cancel': tone('sine', 820, 620, 0, .04, .012); break;
      case 'land': tone('sine', 130, 42, 0, .17, .13); noise(0, .1, .05, 900, 300, .6); break;
      case 'whoosh': noise(0, .38, .09, 400, 2600, .6); break;
      /* 轻点：一粒很短的木质高音。 */
      case 'tap': tone('sine', 1250, 900, 0, .035, .028); break;
      /* 切分类：上行两音，比 tap 亮一点。 */
      case 'tab': tone('triangle', 880, 870, 0, .045, .032); tone('triangle', 1320, 1310, .04, .07, .028); break;
      /* 横滑经过一格：几乎听不见的一下拨片。 */
      case 'tick': tone('sine', 2200, 1700, 0, .016, .01); break;
      /* 进页 / 返回：一口气息 + 一个往上 / 往下的音。 */
      case 'open': noise(0, .24, .04, 500, 2400, .7); tone('sine', 520, 820, .02, .16, .026); break;
      case 'back': noise(0, .2, .035, 2200, 600, .7); tone('sine', 720, 460, 0, .12, .024); break;
      /* 买下：收银台的两声「叮」。 */
      case 'buy': tone('triangle', 1046, 1040, 0, .07, .045); tone('triangle', 1568, 1560, .07, .2, .04); noise(0, .05, .02, 4200, 3000, 1.5); break;
      /* 碎片落下：每颗高一个音（step 0..），到一个八度封顶后循环。 */
      case 'coin': {
        const f = 1175 * 2 ** ((step % 12) / 12);
        tone('sine', f, f * .99, 0, .07, .022);
        tone('triangle', f * 2, f * 1.98, 0, .04, .008);
        break;
      }
      /* 演出落定：三音和弦慢慢散开。 */
      case 'chime': tone('sine', 784, 782, 0, .55, .035); tone('sine', 1175, 1172, .06, .6, .03); tone('sine', 1568, 1565, .12, .7, .024); break;
      case 'vs':
        tone('sine', 96, 30, 0, .6, .2);
        tone('square', 240, 70, 0, .14, .05, 1200);
        noise(0, .32, .12, 2400, 380, .5);
        break;
    }
  }

  /** 剧情演出（src/story/theatre.ts）的音：全部现场合成，走同一个总音量。
   *  blip 是打字音：每个角色一个音高和音色（voice），广播加一点失真。 */
  story(kind: StorySound, o: { pitch?: number; wave?: OscillatorType; fuzz?: boolean; soft?: boolean } = {}): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const tone = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, gain: number, lowpass = 0) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t + at);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dur);
      g.gain.setValueAtTime(.0001, t + at);
      g.gain.exponentialRampToValueAtTime(gain, t + at + Math.min(.008, dur / 4));
      g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
      let head: AudioNode = osc;
      if (lowpass) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lowpass; head = osc.connect(lp); }
      head.connect(g).connect(this.dest());
      osc.start(t + at);
      osc.stop(t + at + dur + .02);
    };
    const hiss = (at: number, dur: number, gain: number, f0: number, f1: number, q = .8) => {
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this.noiseBuffer();
      bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t + at);
      bp.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(.0001, t + at);
      g.gain.exponentialRampToValueAtTime(gain, t + at + dur * .3);
      g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
      n.connect(bp).connect(g).connect(this.dest());
      n.start(t + at, Math.random() * .3);
      n.stop(t + at + dur + .02);
    };
    switch (kind) {
      case 'blip': {
        const f = (o.pitch ?? 480) * 2 ** ((Math.random() * 2 - 1) * .6 / 12);
        tone(o.wave ?? 'square', f, f * .97, 0, .045, o.soft ? .018 : .03, o.wave === 'sine' ? 0 : 3200);
        if (o.fuzz) hiss(0, .05, .012, 2400, 1800, 2);
        break;
      }
      case 'pop': tone('sine', 520, 1180, 0, .09, .07); tone('triangle', 1180, 1400, .05, .06, .03); break;
      case 'boing': tone('triangle', 260, 620, 0, .12, .07); tone('sine', 620, 380, .1, .12, .04); break;
      case 'sparkle': for (let i = 0; i < 3; i++) tone('sine', 1320 * 2 ** (i * 4 / 12), 1320 * 2 ** (i * 4 / 12), i * .06, .12, .035); break;
      case 'step': hiss(0, .05, .05, 1400, 900, 1.6); tone('sine', 160, 110, 0, .05, .03); break;
      case 'flip': hiss(0, .16, .07, 900, 3600, .9); break;
      case 'thud': tone('sine', 90, 42, 0, .45, .22); hiss(0, .2, .05, 300, 120, 1); break;
      case 'curtain': hiss(0, .9, .06, 380, 1500, .6); break;
      case 'bell': for (const [f, at] of [[880, 0], [1320, .16]] as const) { tone('sine', f, f, at, 1.1, .06); tone('sine', f * 2.01, f * 2.01, at, .5, .015); } break;
      case 'glitch': for (let i = 0; i < 6; i++) tone('sawtooth', 120 + Math.random() * 300, 60 + Math.random() * 90, i * .05, .07, .035, 1400); hiss(0, .4, .04, 2000, 400, 3); break;
      case 'nod': tone('triangle', 420, 380, 0, .06, .025); break;
      case 'stomp': tone('sine', 140, 70, 0, .12, .09); hiss(0, .08, .04, 800, 400, 1.2); break;
    }
  }

  /* ---- 音浪无双：合成音效 ----
     原则：装饰，不抢背景音乐；同类限发声数、音高随机偏一点，一招打中一片也不会糊成噪音；
     击破、完美按五声音阶往上爬（连击越长越高）；大的落点由导演对齐到半拍上（at）。 */
  private muBus: GainNode | null = null;
  private muVoices = new Map<string, number[]>();
  musou(kind: MusouSound, n = 0, at = 0): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // 同类最多同时几个声音在响。
    const cap = kind === 'hit' ? 3 : kind === 'kill' ? 4 : kind === 'tick' ? 2 : 2;
    const live = (this.muVoices.get(kind) ?? []).filter(e => e > now);
    if (live.length >= cap) return;
    if (!this.muBus) { this.muBus = ctx.createGain(); this.muBus.gain.value = .9; this.muBus.connect(this.dest()); }
    const bus = this.muBus;
    const t0 = now + Math.max(0, Math.min(.2, at));
    const jit = 2 ** ((Math.random() * 2 - 1) * .6 / 12);
    let end = t0;
    const tone = (type: OscillatorType, f0: number, f1: number, a: number, dur: number, gain: number, lowpass = 0, attack = .006) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0 + a);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + a + dur);
      g.gain.setValueAtTime(.0001, t0 + a);
      g.gain.exponentialRampToValueAtTime(gain, t0 + a + Math.min(attack, dur / 3));
      g.gain.exponentialRampToValueAtTime(.0001, t0 + a + dur);
      let head: AudioNode = o;
      if (lowpass) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lowpass; head = o.connect(lp); }
      head.connect(g).connect(bus);
      o.start(t0 + a); o.stop(t0 + a + dur + .02);
      end = Math.max(end, t0 + a + dur);
    };
    const hiss = (a: number, dur: number, gain: number, f0: number, f1: number, q = .8, attack = .3) => {
      const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noiseBuffer();
      src.loop = true;
      bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t0 + a);
      bp.frequency.exponentialRampToValueAtTime(f1, t0 + a + dur);
      g.gain.setValueAtTime(.0001, t0 + a);
      g.gain.exponentialRampToValueAtTime(gain, t0 + a + Math.max(.004, dur * attack));
      g.gain.exponentialRampToValueAtTime(.0001, t0 + a + dur);
      src.connect(bp).connect(g).connect(bus);
      src.start(t0 + a); src.stop(t0 + a + dur + .02);
      end = Math.max(end, t0 + a + dur);
    };
    // 五声音阶（C 大调五声）从 C6 往上爬，两个八度循环。
    const PENTA = [0, 2, 4, 7, 9];
    const ladder = (i: number, base = 1046.5) => { const k = Math.max(0, i) % 10; return base * 2 ** ((PENTA[k % 5] + 12 * Math.floor(k / 5)) / 12); };
    switch (kind) {
      case 'hit':
        if (n) { tone('sine', 150 * jit, 46, 0, .14, .16); hiss(0, .09, .07, 1400, 300, .7, .1); }
        else { tone('sine', 210 * jit, 72, 0, .075, .1); hiss(0, .05, .045, 2600 * jit, 900, .8, .1); }
        break;
      case 'kill':
        tone('triangle', ladder(n - 1, 880) * jit, ladder(n - 1, 880) * 1.02, 0, .07, .022, 5200, .003);
        hiss(0, .025, .018, 5200, 3000, 1.4, .1);
        break;
      case 'perfect': {
        const f = ladder(n - 1);
        tone('sine', f, f, 0, .32, .05, 0, .004);
        tone('sine', f * 2, f * 2, .01, .18, .018, 0, .004);
        hiss(0, .03, .03, 6000, 4000, 2, .1);
        break;
      }
      case 'heatUp': {
        const b = 523.25 * 2 ** ((n * 2) / 12);
        [0, 4, 7, 12].forEach((s, i) => tone('triangle', b * 2 ** (s / 12), b * 2 ** (s / 12), i * .055, .2, .032, 4800));
        break;
      }
      case 'heatDown':
        tone('sine', 523, 440, 0, .14, .035, 1800); tone('sine', 392, 330, .09, .2, .03, 1500);
        break;
      case 'cardIn':
        hiss(0, .28, .035, 700, 3200, .7, .5);
        for (let i = 0; i < (n ? 4 : 3); i++) tone('sine', 1568 * 2 ** (i * 4 / 12), 1568 * 2 ** (i * 4 / 12), .06 + i * .045, .14, .018);
        break;
      case 'cardPick':
        // 盖章：一声闷的「咚」+ 纸面的「咔」，稀有度越高后面跟的和弦越亮。
        tone('sine', 150, 58, 0, .13, .16); hiss(0, .035, .06, 2400, 1600, 1.2, .1);
        if (n >= 1) [0, 4, 7].forEach((s, i) => tone('triangle', 784 * 2 ** (s / 12), 784 * 2 ** (s / 12), .05 + i * .04, .3, .03, 5000));
        if (n >= 2) [12, 16, 19, 24].forEach((s, i) => tone('sine', 784 * 2 ** (s / 12), 784 * 2 ** (s / 12), .2 + i * .05, .6, .025));
        break;
      case 'riser':
        hiss(0, 1.2, .05, 300, 7000, .9, .95);
        tone('sine', 220, 880, 0, 1.2, .018, 0, 1.1);
        break;
      case 'fever':
        // 镲片 + 底鼓 + 一个亮的和弦，落在副歌第一拍。
        hiss(0, 1.3, .075, 7500, 3600, .5, .01);
        tone('sine', 90, 38, 0, .55, .22);
        [0, 4, 7, 12].forEach(s => tone('triangle', 523.25 * 2 ** (s / 12), 523.25 * 2 ** (s / 12), 0, n ? .9 : .6, .02, 4000));
        break;
      case 'ultCast':
        tone('sine', 55, 95, 0, .6, .12, 0, .3); hiss(0, .6, .04, 400, 2600, .7, .9);
        break;
      case 'ultDrop':
        tone('sine', 120, 30, 0, .9, .26); hiss(0, 1.1, .07, 3600, 300, .5, .02);
        [0, 7, 12].forEach(s => tone('sine', 1046.5 * 2 ** (s / 12), 1046.5 * 2 ** (s / 12), .05, 1.1, .018));
        break;
      case 'tick':
        tone('sine', 1500 + n * 90, 1300 + n * 90, 0, .028, .03);
        break;
      case 'ding':
        tone('sine', 1318.5, 1318.5, 0, 1.2, .06, 0, .003); tone('sine', 2637, 2637, 0, .5, .015, 0, .003);
        if (n) tone('sine', 1975.5, 1975.5, .08, 1.1, .04, 0, .003);
        break;
      case 'supply':
        if (n === 0) { tone('sine', 660, 1320, 0, .1, .05); tone('sine', 1320, 1320, .08, .12, .03); }
        else if (n === 1) { for (let i = 0; i < 3; i++) tone('sine', 500 + i * 160, 900 + i * 160, i * .05, .07, .035); }
        else if (n === 2) { tone('triangle', 330, 1320, 0, .3, .04, 3000); hiss(0, .3, .03, 800, 4000, .8, .7); }
        else { [0, 4, 7, 11].forEach((s, i) => tone('sine', 1046.5 * 2 ** (s / 12), 1046.5 * 2 ** (s / 12), i * .04, .5, .025)); }
        break;
      case 'boom':
        tone('sine', 110, 36, 0, .55, .24); hiss(0, .5, .08, 2200, 250, .6, .02);
        break;
      case 'warn':
        // 提醒，不是警报：两声柔和的下行，压了高频。
        tone('triangle', 880, 860, 0, .12, .04, 2600); tone('triangle', 660, 650, .14, .16, .04, 2400);
        break;
      case 'rush':
        hiss(0, .7, .07, 350, 2400, .7, .6); tone('sine', 70, 110, 0, .7, .06, 0, .4);
        break;
      case 'break':
        // 撕开 / 破圈：一声撕裂的噪音 + 下沉的闷响，n=1（横幅）更脆。
        hiss(0, .22, .08, n ? 3200 : 2000, 500, 1.1, .05); tone('sine', 140, 50, 0, .22, .17);
        tone('triangle', 784, 1568, .03, .18, .03, 5000);
        break;
      case 'squeeze':
        tone('sine', 95, 52, 0, .16, .08, 600);
        break;
      case 'hurt':
        tone('sine', 170, 62, 0, .11, .1, 900); hiss(0, .07, .04, 700, 260, .8, .1);
        break;
      case 'slam':
        // 精英砸地（n 不用）和主角轻砸共用：一声短促的「咚」。
        tone('sine', 95, 36, 0, .3, .2); hiss(0, .2, .06, 900, 200, .8, .05);
        break;
      case 'milestone':
        // 盖章：一声闷响 + 一个上扬的三度，越往后的百位越高一点。
        tone('sine', 130, 55, 0, .16, .18); hiss(0, .04, .06, 2600, 1800, 1.2, .1);
        { const b = 659.25 * 2 ** (Math.min(10, n) / 24); tone('triangle', b, b, .06, .22, .035, 5000); tone('triangle', b * 1.26, b * 1.26, .13, .32, .035, 5000); }
        break;
      case 'grab':
        tone('sine', 220, 120, 0, .18, .12, 1200); hiss(0, .12, .06, 900, 400, .9, .1);
        break;
      case 'escape':
        hiss(0, .2, .06, 1500, 5000, .8, .2); tone('triangle', 660, 1320, 0, .16, .04, 5000);
        break;
      case 'dash':
        hiss(0, .45, .07, 500, 3000, .7, .3); tone('sawtooth', 70, 140, 0, .45, .03, 400, .1);
        break;
      case 'slow':
        // 慢动作：一声往下沉的「呜——」，像磁带被按慢了。
        tone('sine', 520, 180, 0, .5, .04, 2000, .05); hiss(0, .5, .03, 3000, 600, .6, .1);
        break;
      case 'pop':
        // 音箱怪炸开：n=1 是被打飞落地的（更亮、更脆，连锁时一串）。
        tone('sine', 140 * jit, 50, 0, .2, n ? .14 : .11); hiss(0, .18, n ? .07 : .05, n ? 3000 : 1800, 400, .8, .05);
        if (n) tone('triangle', 880 * jit, 1760, 0, .08, .02, 6000);
        break;
      case 'slamHeavy': {
        // 重砸：一声很低的「咚」压底 + 碎裂的噪音 + 一个按连砸往上爬的音（五声音阶），像砸出一小段旋律。
        const f = ladder(Math.max(0, n - 1) * 2, 523.25);
        tone('sine', 120, 30, 0, .5, .28); hiss(0, .32, .09, 2600, 300, .7, .02);
        tone('triangle', f, f, .01, .3, .04, 5000, .003); tone('sine', f * 2, f * 2, .02, .18, .015);
        if (n >= 4) hiss(0, .9, .05, 6000, 2000, .5, .01);
        break;
      }
      case 'jump2':
        hiss(0, .14, .04, 1200, 4200, .9, .3); tone('sine', 520, 880, 0, .12, .03);
        break;
      case 'charge':
        // 冲锋：一道快速的风声 + 低频推进，踩拍时多一个亮音。
        hiss(0, .28, .07, 700, 3800, .7, .15); tone('sine', 90, 160, 0, .22, .1);
        if (n) tone('triangle', 1318.5, 1318.5, 0, .2, .03, 6000, .003);
        break;
      case 'bowl':
        tone('sine', 180 * jit, 70, 0, .08, .08); hiss(0, .05, .04, 2200, 1200, 1, .1);
        break;
      case 'pip':
        tone('triangle', 1760 * jit, 1700, 0, .05, .025, 7000, .002);
        break;
      case 'pipBreak':
        hiss(0, .2, .05, 6000, 2500, 1.2, .05); tone('triangle', 2093, 1568, 0, .16, .03, 8000, .002);
        break;
      case 'armor':
        // 打在厚甲上：一声发闷的「当」，不刺耳。n=1 是打在巨型障碍物上。
        tone('triangle', n ? 220 : 440 * jit, n ? 180 : 400, 0, .1, .04, 2400, .002); hiss(0, .05, .02, 3000, 1500, 1.5, .1);
        break;
      case 'shieldUp':
        tone('sine', 660, 990, 0, .3, .03, 0, .05); tone('sine', 990, 1320, .08, .3, .02);
        break;
      case 'giantLand':
        tone('sine', 70, 28, 0, .8, .3); hiss(0, .6, .1, 900, 120, .6, .02);
        break;
      case 'giantBreak':
        tone('sine', 110, 35, 0, .7, .26); hiss(0, .7, .09, 3200, 300, .6, .02);
        [0, 4, 7, 12, 16].forEach((s, i) => tone('triangle', 784 * 2 ** (s / 12), 784 * 2 ** (s / 12), .08 + i * .05, .35, .028, 6000));
        break;
      case 'liftUp':
        tone('sine', 160, 320, 0, .5, .06, 0, .2); hiss(0, .5, .03, 600, 2400, .8, .6);
        break;
      case 'liftDown':
        tone('sine', 320, 140, 0, .5, .05, 0, .05);
        break;
      case 'rare':
        // 吃到稀有道具：一串往上冲的琶音 + 闪光的高频。
        [0, 4, 7, 11, 14].forEach((s, i) => tone('triangle', 659.25 * 2 ** ((s + n) / 12), 659.25 * 2 ** ((s + n) / 12), i * .045, .3, .035, 7000, .003));
        hiss(.1, .4, .03, 8000, 5000, 1, .3);
        break;
      case 'rareEnd':
        tone('sine', 880, 440, 0, .3, .03, 3000);
        break;
      case 'crowd':
        // 一招打中一大片：一层很快的「嚓」叠在打击声后面，打中越多越厚。
        hiss(0, .16, Math.min(.07, .02 + n * .002), 4200, 1500, .6, .05);
        tone('sine', 95, 45, 0, .14, Math.min(.16, .06 + n * .004));
        break;
      case 'laser':
        tone('sawtooth', 320, 640, 0, .18, .04, 2400, .01);
        hiss(0, .25, .04, 3800, 1400, .8, .02);
        tone('sine', 110, 75, 0, .22, .12);
        break;
      case 'feedback':
        tone('sine', 62, 128, 0, .38, .1, 0, .04);
        tone('triangle', 248, 370, .04, .28, .025, 1600, .04);
        break;
      case 'zap':
        hiss(0, .12, .05, 5200, 1800, 1.2, .01);
        tone('triangle', 980 * jit, 420, 0, .11, .035, 5000, .002);
        break;
      case 'anomaly':
        // 天地异象降临：暖色低频铺底滑音 + 明亮大调泛音 + 渐入暖风。
        tone('sine', 110, 165, 0, .95, .12, 600, .25);
        [0, 7, 12, 16].forEach((s, i) => tone('triangle', 523.25 * 2 ** (s / 12), 523.25 * 2 ** (s / 12), .06 + i * .07, .65, .026, 4800, .12));
        hiss(0, 1.0, .04, 400, 2200, .7, .6);
        break;
      case 'ball':
        if (n < 0) {
          tone('triangle', 420 * jit, 290, 0, .08, .045, 3200);
        } else {
          const f = ladder(n, 659.25);
          tone('sine', 170 * jit, 72, 0, .12, .13);
          tone('triangle', f, f * 1.03, 0, .18, .042, 5600, .003);
          if (n >= 3) {
            tone('sine', f * 2, f * 2, .02, .16, .022, 0, .003);
            hiss(0, .1, .03, 5200, 2800, 1.2, .05);
          }
        }
        break;
      case 'pad': {
        const f = ladder(Math.max(0, n) * 2, 784);
        tone('triangle', f, f, 0, .26, .045, 6200, .003);
        tone('sine', f * 1.5, f * 1.5, .02, .18, .02, 0, .004);
        if (n >= 3) {
          tone('sine', 110, 48, 0, .42, .18);
          hiss(0, .55, .045, 6400, 2600, .6, .02);
          [0, 4, 7, 12].forEach((s, i) => tone('sine', 784 * 2 ** (s / 12), 784 * 2 ** (s / 12), i * .035, .4, .024, 0, .003));
        }
        break;
      }
      case 'grooveUp': {
        const b = 587.33 * 2 ** ((Math.min(5, Math.max(1, n)) - 1) * 2 / 12);
        [0, 4, 7, 12].forEach((s, i) => tone('triangle', b * 2 ** (s / 12), b * 2 ** (s / 12), i * .04, .22, .028, 5400, .003));
        if (n >= 5) hiss(.04, .35, .035, 7000, 3200, .7, .02);
        break;
      }
      case 'scratch':
        tone('triangle', 680 * jit, 240, 0, .06, .028, 1900, .002);
        tone('triangle', 260, 520, .055, .055, .024, 1900, .002);
        hiss(0, .1, .02, 2200, 900, 1.4, .1);
        break;
    }
    live.push(end);
    this.muVoices.set(kind, live);
  }

  private noise?: AudioBuffer;
  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .6), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return this.noise = buf;
  }

  /** 完美格挡: the block blip pitched down and muffled through a lowpass, over a short low thud —
   *  a shield taking the blow, heavier and duller than the plain block. */
  private parry(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const blip = ctx.createOscillator(), lp = ctx.createBiquadFilter(), gb = ctx.createGain();
    blip.type = 'square';
    blip.frequency.setValueAtTime(430, t);
    blip.frequency.exponentialRampToValueAtTime(140, t + .09);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + .09);
    lp.Q.value = .7;
    gb.gain.setValueAtTime(.075, t);
    gb.gain.exponentialRampToValueAtTime(.0001, t + .1);
    blip.connect(lp).connect(gb).connect(this.dest());
    blip.start(t); blip.stop(t + .1);
    const body = ctx.createOscillator(), gt = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(150, t);
    body.frequency.exponentialRampToValueAtTime(60, t + .12);
    gt.gain.setValueAtTime(.11, t);
    gt.gain.exponentialRampToValueAtTime(.0001, t + .13);
    body.connect(gt).connect(this.dest());
    body.start(t); body.stop(t + .13);
  }

  /** 燃尽: a click over a dropping thud, so the impact does not sound like the cast swoop. */
  /** MASKING's bike: a sawtooth and a square an octave down, chopped by a firing-rate pulse, through a
   *  resonant low-pass, with a breath of filtered noise for the exhaust. Self-scheduled; no state. */
  private engine(kind: 'engine' | 'engine-rev'): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const curve = ENGINE_CURVE[kind];
    const dur = curve[curve.length - 1][0];
    // Louder as it revs: each pitch point carries its own level, idle about half of full throttle.
    const lo = Math.min(...curve.map(c => c[1])), hi = Math.max(...curve.map(c => c[1]));
    const level = (hz: number) => ENGINE_GAIN * (.5 + .5 * (hz - lo) / Math.max(1, hi - lo));
    const out = ctx.createGain();
    out.gain.setValueAtTime(.0001, t);
    out.gain.exponentialRampToValueAtTime(level(curve[0][1]), t + .05);
    for (const [at, hz] of curve) if (at > .05 && at < dur - .4) out.gain.linearRampToValueAtTime(level(hz), t + at);
    out.gain.linearRampToValueAtTime(ENGINE_GAIN, t + dur - .4);
    out.gain.exponentialRampToValueAtTime(.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    const pulse = ctx.createGain();
    pulse.gain.value = .55;
    const depth = ctx.createGain();
    depth.gain.value = .45;
    const body = ctx.createOscillator(), sub = ctx.createOscillator(), fire = ctx.createOscillator();
    body.type = 'sawtooth';
    sub.type = 'square';
    fire.type = 'square';
    const subGain = ctx.createGain();
    subGain.gain.value = .5;
    for (const [at, hz] of curve) {
      const when = t + at;
      if (at === 0) {
        body.frequency.setValueAtTime(hz, when);
        sub.frequency.setValueAtTime(hz / 2, when);
        fire.frequency.setValueAtTime(hz / 2, when);
        lp.frequency.setValueAtTime(hz * 6, when);
      } else {
        body.frequency.linearRampToValueAtTime(hz, when);
        sub.frequency.linearRampToValueAtTime(hz / 2, when);
        fire.frequency.linearRampToValueAtTime(hz / 2, when);
        lp.frequency.linearRampToValueAtTime(hz * 6, when);
      }
    }
    fire.connect(depth).connect(pulse.gain);
    body.connect(pulse);
    sub.connect(subGain).connect(pulse);
    pulse.connect(lp).connect(out).connect(this.dest());
    // Exhaust breath: band-passed noise riding the same envelope, a little quieter.
    // The shared 0.6 s noise, looped: no new buffer per rev.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260;
    bp.Q.value = .8;
    const ng = ctx.createGain();
    ng.gain.value = .35;
    noise.connect(bp).connect(ng).connect(out);
    for (const o of [body, sub, fire]) { o.start(t); o.stop(t + dur); }
    noise.start(t); noise.stop(t + dur);
  }

  private slam(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const body = ctx.createOscillator(), click = ctx.createOscillator();
    const gb = ctx.createGain(), gc = ctx.createGain();
    body.type = 'square';
    body.frequency.setValueAtTime(160, t);
    body.frequency.exponentialRampToValueAtTime(42, t + .14);
    gb.gain.setValueAtTime(.09, t);
    gb.gain.exponentialRampToValueAtTime(.0001, t + .16);
    click.type = 'square';
    click.frequency.setValueAtTime(980, t);
    click.frequency.exponentialRampToValueAtTime(180, t + .04);
    gc.gain.setValueAtTime(.05, t);
    gc.gain.exponentialRampToValueAtTime(.0001, t + .045);
    body.connect(gb).connect(this.dest());
    click.connect(gc).connect(this.dest());
    body.start(t); body.stop(t + .16);
    click.start(t); click.stop(t + .05);
  }

  /** 血月的奏鸣 played as music: a synth keyboard (a triangle body, a soft octave and a filtered square
   *  for the hammer bite) through a short echo, so the notes ring like a hall. The phrase is an
   *  original D-minor arpeggio over i–VI–iv–V, one note per shot, resolving on a full D-minor chord;
   *  an organ pedal on D holds under it. Each sound is self-scheduled, so nothing here keeps state. */
  private blood(kind: SfxKind): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const out = this.hall();
    if (kind === 'blood-intro') {
      for (const [hz, gain] of [[73.42, .05], [146.83, .03], [220, .012]] as const) this.organ(hz, t, 2.9, gain, out);
      return;
    }
    if (kind === 'blood-end') {
      const at = t + .13;
      for (const [hz, gain] of [[73.42, .04], [146.83, .035], [220, .03], [293.66, .03], [349.23, .026], [440, .026], [587.33, .022]] as const) {
        this.key(hz, at, 1.8, gain, out);
      }
      this.organ(73.42, at, 1.6, .05, out);
      return;
    }
    const i = Number(kind.slice(6));
    const hz = BLOOD_PHRASE[Math.max(0, Math.min(BLOOD_PHRASE.length - 1, i | 0))];
    this.key(hz, t, .9, .04, out);
    // Every chord's first note carries its bass an octave and a fifth down, so the harmony moves.
    if (i % 4 === 0) this.key(BLOOD_BASS[(i / 4) | 0] ?? 73.42, t, 1.1, .028, out);
  }

  /** 终幕: the cut-in's sound. Freeze is a sub drop under a reversed swell and a single bell (time
   *  stops); the eye opening brings a D-minor organ and a rising shimmer; three heartbeats; the glass
   *  creaks, then shatters over a deep hit and a D-minor stab; the name lands on a drum and a ring;
   *  the slash is a fast swish into a thud. Synthesised fallbacks for the recorded cues (FINALE_SAMPLES). */
  private finale(kind: SfxKind): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = FINALE_LEVEL;
    out.connect(this.dest());
    const tone = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, gain: number, to: AudioNode = out) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dur);
      g.gain.setValueAtTime(.0001, t + at);
      g.gain.exponentialRampToValueAtTime(gain, t + at + Math.min(.01, dur / 4));
      g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
      o.connect(g).connect(to);
      o.start(t + at);
      o.stop(t + at + dur + .02);
    };
    const noise = (at: number, dur: number, gain: number, type: BiquadFilterType, f0: number, f1: number, swell = false) => {
      const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this.noiseBuffer();
      n.loop = true;
      f.type = type;
      f.Q.value = .7;
      f.frequency.setValueAtTime(f0, t + at);
      f.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(.0001, t + at);
      if (swell) { g.gain.exponentialRampToValueAtTime(gain, t + at + dur * .92); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur); }
      else { g.gain.exponentialRampToValueAtTime(gain, t + at + .008); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur); }
      n.connect(f).connect(g).connect(out);
      n.start(t + at);
      n.stop(t + at + dur + .02);
    };
    switch (kind) {
      case 'finale-whoosh': {
        // 爱音's meteor: a rush of air that comes in close and bright from the left, sweeps across and
        // drops away as the light recedes to the right, then swirls faster and fainter as it spirals
        // round her face and dies into the gathering (~1.6 s). Noise through a moving band, panned with it.
        const hall = this.hall();
        const pan = ctx.createStereoPanner();
        pan.pan.setValueAtTime(-.85, t);
        pan.pan.linearRampToValueAtTime(.35, t + .7);
        pan.connect(out);
        pan.connect(hall);
        const air = (type: BiquadFilterType, q: number, f: (p: AudioParam) => void, g: (p: AudioParam) => void): void => {
          const n = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), gn = ctx.createGain();
          n.buffer = this.noiseBuffer();
          n.loop = true;
          fl.type = type;
          fl.Q.value = q;
          f(fl.frequency);
          gn.gain.setValueAtTime(.0001, t);
          g(gn.gain);
          n.connect(fl).connect(gn).connect(pan);
          n.start(t);
          n.stop(t + 1.75);
        };
        // The body: bright and loud as it passes close, lower and softer as it goes deep.
        air('bandpass', 1.1, p => {
          p.setValueAtTime(3400, t);
          p.exponentialRampToValueAtTime(1100, t + .7);
          p.exponentialRampToValueAtTime(1500, t + 1.6);
        }, p => {
          p.exponentialRampToValueAtTime(.12, t + .06);
          p.exponentialRampToValueAtTime(.045, t + .7);
          p.setValueAtTime(.045, t + 1.1);
          p.exponentialRampToValueAtTime(.0001, t + 1.65);
        });
        // The edge: thin high air that makes it read as fast.
        air('highpass', .7, p => {
          p.setValueAtTime(7000, t);
          p.exponentialRampToValueAtTime(4500, t + .7);
        }, p => {
          p.exponentialRampToValueAtTime(.035, t + .04);
          p.exponentialRampToValueAtTime(.006, t + .6);
          p.exponentialRampToValueAtTime(.0001, t + 1.2);
        });
        // The spiral: the sound wobbles side to side, faster as the turns tighten.
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.setValueAtTime(3, t + .7);
        lfo.frequency.exponentialRampToValueAtTime(11, t + 1.6);
        depth.gain.setValueAtTime(0, t);
        depth.gain.setValueAtTime(0, t + .7);
        depth.gain.linearRampToValueAtTime(.35, t + .9);
        lfo.connect(depth).connect(pan.pan);
        lfo.start(t);
        lfo.stop(t + 1.75);
        break;
      }
      case 'finale-shimmer': {
        // 爱音's light wave: a quick rising run of soft bells over an airy swell, landing on a high,
        // ringing pair. Bright but quiet; the room carries the tail.
        const hall = this.hall();
        noise(0, .5, .04, 'highpass', 1800, 9000, true);
        [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093].forEach((hz, i) => {
          tone('sine', hz, hz, .045 * i, 1.1, .03, hall);
          tone('triangle', hz * 2, hz * 2, .045 * i + .005, .5, .008, hall);
        });
        tone('sine', 2093, 2093, .34, 1.8, .028, hall);
        tone('sine', 2637.02, 2637.02, .38, 1.6, .02, hall);
        break;
      }
      case 'finale-freeze':
        tone('sine', 90, 28, 0, .7, .35);
        noise(0, .4, .09, 'bandpass', 300, 3200, true);
        tone('sine', 1318.5, 1318.5, .02, 1.6, .05, this.hall());
        tone('sine', 2637, 2637, .02, 1, .02, this.hall());
        break;
      case 'finale-rise':
        // One long organ chord (D minor, low and open) under the moon's opening, ending on the break.
        for (const [hz, gain] of [[36.71, .05], [73.42, .07], [110, .04], [146.83, .045], [174.61, .025], [220, .02]] as const) this.organ(hz, t, 2.3, gain, this.hall());
        break;
      case 'finale-beat':
        tone('sine', 62, 34, 0, .2, .4);
        tone('sine', 58, 32, .15, .22, .28);
        break;
      case 'finale-crack':
        for (let i = 0; i < 7; i++) noise(i * .045 + Math.random() * .02, .035, .14, 'highpass', 2500, 5000);
        tone('sawtooth', 180, 900, 0, .35, .02);
        break;
      case 'finale-shatter': {
        noise(0, .55, .26, 'highpass', 2600, 7000);
        noise(0, .2, .18, 'bandpass', 900, 300);
        tone('sine', 110, 26, 0, 1, .5);
        for (let i = 0; i < 14; i++) {
          const hz = 2200 + Math.random() * 4200;
          tone('sine', hz, hz * .98, .02 + Math.random() * .4, .12 + Math.random() * .15, .03);
        }
        const hall = this.hall();
        // The chord the silence rings on.
        for (const [hz, gain] of [[146.83, .05], [220, .045], [293.66, .045], [349.23, .04], [440, .04], [587.33, .035]] as const) this.key(hz, t + .02, 3, gain, hall);
        break;
      }
      case 'finale-bloom':
        // Moonlight reaching her: a high, slow D-minor swell with a soft shimmer, then air.
        for (const [hz, gain] of [[587.33, .02], [698.46, .016], [880, .014], [1174.66, .008]] as const) this.organ(hz, t, 2.6, gain, this.hall());
        noise(0, 1.8, .02, 'highpass', 6000, 9000, true);
        break;
      case 'finale-stamp':
        // The name writing itself in: three soft bell tones, no drum.
        tone('sine', 1174.66, 1174.66, 0, 1.4, .03, this.hall());
        tone('sine', 1396.91, 1396.91, .18, 1.3, .025, this.hall());
        tone('sine', 1760, 1760, .36, 1.6, .025, this.hall());
        break;
      case 'finale-slash':
        noise(0, .22, .22, 'bandpass', 700, 6000);
        tone('sine', 95, 35, .16, .4, .35);
        noise(.16, .15, .1, 'lowpass', 1200, 300);
        break;
    }
  }

  /** One keyboard note. */
  private key(hz: number, at: number, dur: number, gain: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + .006);
    g.gain.exponentialRampToValueAtTime(gain * .35, at + .22);
    g.gain.exponentialRampToValueAtTime(.0001, at + dur);
    g.connect(out);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, hz * 9), at);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, hz * 2), at + dur * .6);
    lp.connect(g);
    for (const [type, mul, level] of [['triangle', 1, 1], ['sine', 2, .35], ['square', 1, .12]] as const) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(hz * mul, at);
      o.detune.setValueAtTime(type === 'square' ? 6 : 0, at);
      og.gain.value = level;
      o.connect(og).connect(lp);
      o.start(at);
      o.stop(at + dur + .02);
    }
  }

  /** A held organ tone that swells in and dies out. */
  private organ(hz: number, at: number, dur: number, gain: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + .35);
    g.gain.setValueAtTime(gain, at + dur - .5);
    g.gain.exponentialRampToValueAtTime(.0001, at + dur);
    g.connect(out);
    for (const [mul, level] of [[1, 1], [2, .5], [3, .25], [4, .12]] as const) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = hz * mul;
      og.gain.value = level;
      o.connect(og).connect(g);
      o.start(at);
      o.stop(at + dur + .02);
    }
  }

  /** The room: dry plus a short feedback echo, built once per context. Its input gain is the whole
   *  music's level: a low-key detail under the BGM and the hit sounds, never on top of them. */
  private hallIn?: AudioNode;
  private hall(): AudioNode {
    if (this.hallIn) return this.hallIn;
    const ctx = this.ctx!;
    const input = ctx.createGain();
    input.gain.value = BLOOD_LEVEL;
    const delay = ctx.createDelay(1);
    const fb = ctx.createGain(), wet = ctx.createGain(), damp = ctx.createBiquadFilter();
    delay.delayTime.value = .19;
    fb.gain.value = .32;
    wet.gain.value = .22;
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    input.connect(this.dest());
    input.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(wet).connect(this.dest());
    return this.hallIn = input;
  }

  /** The recorded horn when it is on hand — the sample loads in the background after the
   *  first unlock, and until it lands (or if it never does) the synth horn below stands in. */
  private whistle(): void {
    const ctx = this.ctx!;
    if (this.horn) {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = this.horn;
      g.gain.value = HORN_GAIN;
      src.connect(g).connect(this.dest());
      src.start();
      return;
    }
    // Synth stand-in while the sample is still loading, or forever if it never lands.
    const t = ctx.currentTime, dur = TONES.whistle[1];
    for (const [freq, gain, type] of [[310, .075, 'square'], [466, .045, 'sawtooth']] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq * .78, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + .09);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + .07);
      g.gain.setValueAtTime(gain, t + dur - .14);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(this.dest());
      o.start(t);
      o.stop(t + dur);
    }
  }
}
