import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import './wordmarkIntro.css';

// 首頁字標開場：名字是「EVENT in NTOU, TO U」縮成的
//   1 整句 → 2 拿掉 in，EVENT 與 NTOU 上下排、共用 NT → 3 合成 EVENTOU（上線 EVENT、下線 NTOU）
//   → 4 上線縮到 EVEN、下線移到 TO：EVEN・TO・U → 回到 3，換成靜態字標
// 最後一格的位置量自頁面上的靜態字標，結束時切換不會跳動。每次進首頁都播，點字標可重播；
// 系統設定減少動態效果時不播。

export type IntroPhase = 'sentence' | 'merged' | 'done';

const TOKENS: [string, string][] = [
  ['E1', 'E'], ['V1', 'V'], ['E2', 'E'], ['N1', 'N'], ['T1', 'T'], ['sp1', ' '],
  ['i', 'i'], ['n', 'n'], ['sp2', ' '],
  ['N2', 'N'], ['T2', 'T'], ['O2', 'O'], ['U2', 'U'], ['cm', ','], ['sp3', ' '],
  ['T3', 'T'], ['O3', 'O'], ['sp4', ' '], ['U3', 'U'],
]; // prettier-ignore
const STATIC_IDS = ['E1', 'V1', 'E2', 'N1', 'T1', 'O2', 'U2'];
const ORANGE = new Set(['N1', 'T1', 'N2', 'T2']);
const DIM = new Set(['i', 'n', 'cm']);
// 各格出現的時間（毫秒）：句子、上下排、合成、TO U、回到合成、換成靜態字標
const TIMELINE: [number, number][] = [
  [60, 0],
  [1800, 1],
  [3300, 2],
  [4900, 3],
  [6600, 2],
];
const END_MS = 7500;

interface Glyph {
  x: number;
  y: number;
  s: number;
  o: number;
  c: string;
}
interface Rule {
  x: number;
  w: number;
  y: number;
  c: string;
  on: boolean;
}
interface Frame {
  glyphs: Record<string, Glyph>;
  top: Rule;
  bottom: Rule;
}

function motionAllowed(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 量靜態字標，算出四格的位置 */
function buildFrames(wrap: HTMLElement, mark: HTMLElement): Frame[] {
  const origin = wrap.getBoundingClientRect();
  const style = getComputedStyle(mark);
  const F = parseFloat(style.fontSize);
  const spans = [...mark.children] as HTMLElement[];

  // 靜態字標每個字母的位置與寬度
  const at: Record<string, { x: number; w: number }> = {};
  let k = 0;
  for (const span of spans) {
    const text = span.firstChild;
    if (!text) continue;
    for (let i = 0; i < (text.textContent ?? '').length; i++) {
      const range = document.createRange();
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      const r = range.getBoundingClientRect();
      at[STATIC_IDS[k++]] = { x: r.left - origin.left, w: r.width };
    }
  }
  const box = spans[0].getBoundingClientRect();
  const y0 = box.top - origin.top + parseFloat(getComputedStyle(spans[0]).paddingTop);

  // 其他字母（句子裡才有的）用同字型量寬度
  const ctx = document.createElement('canvas').getContext('2d');
  const ls = parseFloat(style.letterSpacing) || F * 0.02;
  const W: Record<string, number> = {};
  if (ctx) ctx.font = `${style.fontWeight} ${F}px ${style.fontFamily}`;
  for (const [id, c] of TOKENS)
    W[id] = at[id]?.w ?? (ctx ? ctx.measureText(c).width + ls : F * 0.6);
  const ink = 'var(--color-text)';
  const accent = 'var(--color-accent)';
  const dim = 'color-mix(in srgb, var(--color-text) 28%, transparent)';
  const x0 = at.E1.x;
  const g = (x: number, y: number, s = 1, o = 1, c = ink): Glyph => ({ x, y, s, o, c });

  // 1 句子：縮到放得下
  const maxW = (wrap.closest('.cover-main')?.clientWidth ?? wrap.clientWidth) - x0;
  const total = TOKENS.reduce((sum, [id]) => sum + W[id], 0);
  const s1 = Math.min(0.62, (maxW * 0.98) / total);
  const f1: Frame['glyphs'] = {};
  let x = x0;
  for (const [id] of TOKENS) {
    f1[id] = g(x, y0 + (F * (1 - s1)) / 2, s1, 1, DIM.has(id) ? dim : ink);
    x += W[id] * s1;
  }

  // 2 上下排：EVENT 在上、NTOU 在下，N 對齊
  const yT = y0 - F * 0.54;
  const yB = y0 + F * 0.54;
  const f2: Frame['glyphs'] = {};
  x = x0;
  for (const id of ['E1', 'V1', 'E2', 'N1', 'T1']) {
    f2[id] = g(x, yT, 1, 1, ORANGE.has(id) ? accent : ink);
    x += W[id];
  }
  x = f2.N1.x;
  for (const id of ['N2', 'T2', 'O2', 'U2']) {
    f2[id] = g(x, yB, 1, 1, ORANGE.has(id) ? accent : ink);
    x += W[id];
  }
  f2.T3 = { ...f2.T2, o: 0 };
  f2.O3 = { ...f2.O2, o: 0 };
  f2.U3 = { ...f2.U2, o: 0 };
  for (const id of ['i', 'n', 'cm', 'sp1', 'sp2', 'sp3', 'sp4']) f2[id] = g(f2.N1.x, y0, 0.3, 0);

  // 3 合成一行：位置就是靜態字標
  const f3: Frame['glyphs'] = { ...f2 };
  for (const id of STATIC_IDS) f3[id] = { ...f2[id], x: at[id].x, y: y0 };
  f3.N2 = { ...f3.N1, o: 0 };
  f3.T2 = { ...f3.T1, o: 0 };
  f3.T3 = { ...f3.T1, o: 0, c: ink };
  f3.O3 = { ...f3.O2, o: 0 };
  f3.U3 = { ...f3.U2, o: 0 };

  const end = (id: string) => at[id].x + at[id].w;
  const rule = 3;
  const topY = box.top - origin.top;
  const bottomY = box.bottom - origin.top - rule;
  const top3: Rule = { x: x0, w: end('T1') - x0, y: topY, c: ink, on: true };
  const bottom3: Rule = { x: at.N1.x, w: end('U2') - at.N1.x, y: bottomY, c: ink, on: true };
  const off = (r: Rule): Rule => ({ ...r, on: false });

  return [
    { glyphs: f1, top: off(top3), bottom: off(bottom3) },
    { glyphs: f2, top: off(top3), bottom: off(bottom3) },
    { glyphs: f3, top: top3, bottom: bottom3 },
    {
      // 4 上線縮到 EVEN，下線移到 TO
      glyphs: f3,
      top: { ...top3, w: end('N1') - x0 },
      bottom: { ...bottom3, x: at.T1.x, w: end('O2') - at.T1.x, c: accent },
    },
  ];
}

export function WordmarkIntro({ onPhase }: { onPhase?: (phase: IntroPhase) => void }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const [motionOk] = useState(motionAllowed);
  const [playing, setPlaying] = useState(motionOk);
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [step, setStep] = useState(-1);
  const onPhaseRef = useRef(onPhase);

  useLayoutEffect(() => {
    onPhaseRef.current = onPhase;
  });

  // 第一次繪製前就通知外層，避免小標與副標先出現再藏起來
  useLayoutEffect(() => {
    onPhaseRef.current?.(motionOk ? 'sentence' : 'done');
  }, [motionOk]);

  const replay = () => {
    if (!motionOk || playing) return;
    setFrames(null);
    setStep(-1);
    setPlaying(true);
    onPhaseRef.current?.('sentence');
  };

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = () => {
      timers.forEach(clearTimeout);
      setPlaying(false);
      onPhaseRef.current?.('done');
    };
    document.fonts.ready.then(() => {
      if (cancelled || !wrapRef.current || !markRef.current) return;
      setFrames(buildFrames(wrapRef.current, markRef.current));
      for (const [ms, i] of TIMELINE) {
        timers.push(
          setTimeout(() => {
            setStep(i);
            if (i === 2) onPhaseRef.current?.('merged');
          }, ms),
        );
      }
      timers.push(setTimeout(finish, END_MS));
    });
    // 視窗大小改變時位置會跑掉，直接結束
    window.addEventListener('resize', finish);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', finish);
    };
  }, [playing]);

  const frame = frames && step >= 0 ? frames[step] : null;
  const ruleStyle = (r: Rule): CSSProperties => ({
    width: r.w,
    background: r.c,
    opacity: r.on ? 1 : 0,
    transform: `translate(${r.x}px, ${r.y}px) scaleX(${r.on ? 1 : 0})`,
  });

  return (
    <span ref={wrapRef} className="wordmark-intro-wrap" data-intro={motionOk || undefined}>
      {/* 點字標重播開場 */}
      <button
        type="button"
        className="wordmark-replay"
        title={motionOk ? '再播一次' : undefined}
        onClick={replay}
      >
        {/* 字標：EVENT 上方、NTOU 下方各一條線，兩者在 NT 重疊；報讀器只唸一次 EVENTOU */}
        <span
          ref={markRef}
          className="cover-wordmark"
          role="img"
          aria-label="EVENTOU"
          style={playing ? { visibility: 'hidden' } : undefined}
        >
          <span className="wordmark-event">EVE</span>
          <span className="wordmark-shared">NT</span>
          <span className="wordmark-ntou">OU</span>
        </span>
      </button>
      {playing && (
        <span className="wordmark-intro" aria-hidden="true" data-step={step}>
          {TOKENS.map(([id, c]) => {
            const p = frame?.glyphs[id];
            return (
              <span
                key={id}
                className="wordmark-intro-glyph"
                style={
                  p
                    ? {
                        opacity: p.o,
                        color: p.c,
                        transform: `translate(${p.x}px, ${p.y}px) scale(${p.s})`,
                      }
                    : { opacity: 0 }
                }
              >
                {c}
              </span>
            );
          })}
          {frame && (
            <>
              <span className="wordmark-intro-rule" style={ruleStyle(frame.top)} />
              <span className="wordmark-intro-rule" style={ruleStyle(frame.bottom)} />
            </>
          )}
        </span>
      )}
    </span>
  );
}
