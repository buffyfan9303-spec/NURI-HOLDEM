// 범용 깜빡임 계측기 — e2e/flicker-gate.spec.ts 가 쓴다(오너 2026-09-26 "메인은 왜 그런 거야, 재현되지 않게 해").
//
// 무엇을 재나: 화면 이동(콜드 진입·탭 왕복·하위 탭·모달 개폐·홈 복귀) 하나마다 CDP 스크린캐스트 프레임을 받아 **픽셀**로 판정한다.
//   · flat     — 뷰포트 전체 휘도 표준편차 < 2.5 : 판 전체가 한 색(빈 지면 판·검정/흰 판). 옛 tabCover 덮개가 이것이었다.
//   · blink    — 뷰포트 평균 휘도가 시작·끝 범위 밖으로 8 이상 벗어났다가 150ms 안에 복귀 : 한 번 번쩍.
//   · foit     — (콜드·리로드만) 앱 첫 페인트 뒤, 폰트가 아직 로딩 중인데 '잉크 픽셀'이 정착 프레임의 35% 미만 : 글자가 투명한 프레임.
//              앱 첫 페인트 = 정적 셸 DOM 교체 뒤 화면이 실제로 바뀐 첫 프레임(20×N 썸네일 평균 차 > 1.5).
//              DOM 이 바뀌었어도 메인스레드가 붙잡혀 아직 셸이 보이는 프레임은 깜빡임이 아니라 '정지' 라 세지 않는다.
//   · cover/ov — DOM 표본(rAF): 전환용 덮개([data-tab-cover]·[data-sub-cover]) 가 보이는 프레임 · 전면 폴백(fixed inset-0 aria-busy) 프레임.
// 왜 픽셀인가: document.fonts.check() 는 없는 폰트에도 true, computed style 은 FOIT 를 모르고, DOM 표본은 '덮개' 처럼 이름 붙은 것만 본다.
//   픽셀은 다음에 어떤 방식으로 빈 판을 다시 만들어도 잡는다.
// ⚠ 하네스 Chromium 만 본다(삼성 인터넷 GPU·주소창 접힘·느린 네트워크는 재현 못 함 — 재현 못 함 ≠ 없음).
import type { CDPSession, Page } from '@playwright/test';
import sharp from 'sharp';

/** bL·bStd = 본문 영역(헤더 아래 ~ 하단바 위)만의 휘도 평균·표준편차 — Cast.start(crop) 을 줬을 때만. */
export type Frame = { t: number; L: number; std: number; ink: number; th: Float32Array; bL?: number; bStd?: number };
/** 본문 영역(CSS px) — 헤더 아래 ~ 하단바 위. w = 그때 innerWidth(프레임 폭과 CSS px 의 비율). */
export type Crop = { top: number; bottom: number; w: number };
export type Sample = [t: number, busy: number, ov: number, cover: number];
export type Verdict = {
  id: string; frames: number; rafFrames: number; flat: number[]; blink: string[]; foit: number[]; coverFrames: number; ovFrames: number;
  firstApp?: number; fontsAt?: number; lastStd: number; settledInk: number;
};

export const FLAT_STD = 2.5;
export const CAST_W = 260;

/** 페이지 안 기록기 — rAF 표본(덮개·전면 폴백), 정적 셸 교체 시각, 폰트 로딩 완료 시각. addInitScript 로 문서마다 붙는다. */
export const RECORDER = () => {
  if (window.top !== window) return;
  const R = ((window as unknown as { __fk: { on: boolean; f: Sample[]; shellAt: number; fontsAt: number } }).__fk = { on: false, f: [] as Sample[], shellAt: 0, fontsAt: 0 });
  try { document.fonts.ready.then(() => { if (!R.fontsAt) R.fontsAt = performance.timeOrigin + performance.now(); }); document.fonts.addEventListener('loadingdone', () => { R.fontsAt = performance.timeOrigin + performance.now(); }); } catch { /* 미지원 */ }
  const hook = () => {
    const root = document.getElementById('root'); if (!root) return;
    const shell = root.firstElementChild;
    const mo = new MutationObserver(() => { if (shell && !root.contains(shell)) { R.shellAt = performance.timeOrigin + performance.now(); mo.disconnect(); } });
    mo.observe(root, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  const vis = (el: Element) => el.getClientRects().length > 0;
  const loop = () => {
    if (R.on) {
      let busy = 0, ov = 0;
      for (const el of document.querySelectorAll('[aria-busy="true"]')) if (vis(el)) { busy++; if (el.classList.contains('fixed') && el.classList.contains('inset-0')) ov++; }
      const cov = document.querySelector('[data-tab-cover],[data-sub-cover]');
      const co = cov ? getComputedStyle(cov) : null;
      R.f.push([performance.timeOrigin + performance.now(), busy, ov, co && co.display !== 'none' && vis(cov!) ? Number(co.opacity) : 0]);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

/** 스크린캐스트 한 장 → 휘도 통계(sharp raw). */
async function stats(t: number, b64: string, crop?: Crop): Promise<Frame> {
  const { data, info } = await sharp(Buffer.from(b64, 'base64')).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info; const n = w * h;
  const L = new Float32Array(n); let sum = 0;
  for (let i = 0; i < n; i++) { const p = i * ch; const l = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]; L[i] = l; sum += l; }
  const mean = sum / n; let s2 = 0, ink = 0;
  for (let i = 0; i < n; i++) { const d = L[i] - mean; s2 += d * d; if (Math.abs(d) > 40) ink++; }
  const TW = 20, TH = Math.max(1, Math.round((h / w) * TW)), th = new Float32Array(TW * TH);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    let a = 0, k = 0;
    for (let y = Math.floor(ty * h / TH); y < Math.floor((ty + 1) * h / TH); y++) for (let x = Math.floor(tx * w / TW); x < Math.floor((tx + 1) * w / TW); x++) { a += L[y * w + x]; k++; }
    th[ty * TW + tx] = k ? a / k : 0;
  }
  let body: { bL: number; bStd: number } | undefined;
  if (crop) {
    const k = w / crop.w, y0 = Math.max(0, Math.round(crop.top * k)), y1 = Math.min(h, Math.round(crop.bottom * k));
    let bs = 0, bn = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { bs += L[y * w + x]; bn++; }
    const bm = bn ? bs / bn : 0; let b2 = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { const d = L[y * w + x] - bm; b2 += d * d; }
    body = { bL: bm, bStd: bn ? Math.sqrt(b2 / bn) : 0 };
  }
  return { t, L: mean, std: Math.sqrt(s2 / n), ink, th, ...body };
}

export class Cast {
  private raw: { t: number; data: string }[] = [];
  private crop?: Crop;
  private handler = (ev: { sessionId: number; data: string; metadata: { timestamp?: number } }) => {
    this.cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    this.raw.push({ t: (ev.metadata.timestamp ?? 0) * 1000, data: ev.data });
  };
  // erasableSyntaxOnly — 매개변수 속성(private cdp) 대신 필드 + 대입(타입만 정리, 동작 동일)
  private cdp: CDPSession;
  constructor(cdp: CDPSession) { this.cdp = cdp; }
  async start(crop?: Crop) { this.raw = []; this.crop = crop; this.cdp.on('Page.screencastFrame', this.handler); await this.cdp.send('Page.startScreencast', { format: 'png', maxWidth: CAST_W, maxHeight: 900, everyNthFrame: 1 }); }
  async stop(): Promise<Frame[]> {
    await this.cdp.send('Page.stopScreencast').catch(() => {});
    this.cdp.off('Page.screencastFrame', this.handler);
    const out: Frame[] = [];
    for (const r of this.raw) { try { out.push(await stats(r.t, r.data, this.crop)); } catch { /* 깨진 프레임은 버린다 */ } }
    return out;
  }
}

const diff = (a: Frame, b: Frame) => { let d = 0; for (let i = 0; i < a.th.length; i++) d += Math.abs(a.th[i] - b.th[i]); return d / a.th.length; };

/** 한 이동의 프레임·DOM 표본을 판정으로 바꾼다. shellAt/fontsAt 은 콜드 진입일 때만 준다(FOIT 판정). */
export function analyze(id: string, cast: Frame[], f: Sample[], t0: number, tEnd: number, shellAt = 0, fontsAt = 0): Verdict {
  const c = cast.filter((x) => x.t >= t0 && x.t <= tEnd);
  const ff = f.filter((x) => x[0] >= t0 && x[0] <= tEnd);
  const empty: Verdict = { id, frames: c.length, rafFrames: ff.length, flat: [], blink: [], foit: [], coverFrames: ff.filter((x) => x[3] > 0.05).length, ovFrames: ff.filter((x) => x[2] > 0).length, lastStd: -1, settledInk: 0 };
  if (c.length < 3) return empty;
  const tail = c.slice(-5); const settled = tail.map((x) => x.ink).sort((a, b) => a - b)[Math.floor(tail.length / 2)];
  let from = shellAt || t0; let firstApp: number | undefined;
  if (shellAt) { const i0 = c.findIndex((x) => x.t >= shellAt); for (let i = Math.max(1, i0); i < c.length; i++) if (diff(c[i], c[i - 1]) > 1.5) { firstApp = Math.round(c[i].t - t0); from = c[i].t; break; } }
  const after = c.filter((x) => x.t >= from);
  const flat = after.filter((x) => x.std < FLAT_STD).map((x) => Math.round(x.t - t0));
  const foit = shellAt && firstApp !== undefined ? after.filter((x) => x.std >= FLAT_STD && x.ink < settled * 0.35 && (!fontsAt || x.t < fontsAt)).map((x) => Math.round(x.t - t0)) : [];
  const lo = Math.min(c[0].L, c[c.length - 1].L), hi = Math.max(c[0].L, c[c.length - 1].L);
  const blink: string[] = [];
  for (let i = 0; i < c.length; i++) {
    const ex = Math.max(lo - c[i].L, c[i].L - hi); if (ex < 8) continue;
    let j = i; while (j < c.length && Math.max(lo - c[j].L, c[j].L - hi) >= 8) j++;
    const dur = c[Math.min(j, c.length - 1)].t - c[i].t;
    if (j < c.length && dur <= 150) blink.push(`${Math.round(c[i].t - t0)}ms ${c[i].L < lo ? '-' : '+'}${ex.toFixed(0)} (${Math.round(dur)}ms)`);
    i = j;
  }
  return { ...empty, flat, blink, foit, firstApp, fontsAt: fontsAt ? Math.round(fontsAt - t0) : undefined, lastStd: c[c.length - 1].std, settledInk: settled };
}

/** 실제 손가락/마우스 — Playwright click 은 누름이 0ms 라 :active·transform 부류를 못 잰다(CLAUDE.md). */
export async function press(page: Page, cdp: CDPSession, x: number, y: number, mobile: boolean) {
  if (mobile) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
    await page.waitForTimeout(110);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
  }
}

/** 찾을 요소 — CSS 셀렉터 + (선택) 글자 포함 조건. 마지막 것을 고르려면 last. */
export type Finder = { sel: string; text?: string; exact?: boolean; last?: boolean; notIn?: string };
/** 요소를 찾아 화면에 들여 놓고 중심 좌표를 준다. 없으면 null — 호출부가 단언한다(0개 초록 금지). */
export async function center(page: Page, f: Finder): Promise<{ x: number; y: number; label: string } | null> {
  return page.evaluate((f) => {
    const norm = (s: string) => s.replace(/\s+/g, '');
    const all = [...document.querySelectorAll<HTMLElement>(f.sel)].filter((e) => e.getClientRects().length > 0 && (!f.text || (f.exact ? norm(e.textContent || '') === norm(f.text) : (norm(e.getAttribute('aria-label') || '').includes(norm(f.text)) || norm(e.textContent || '').includes(norm(f.text))))) && (!f.notIn || !e.closest(f.notIn)));
    const el = f.last ? all[all.length - 1] : all[0]; if (!el) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const b = el.getBoundingClientRect(); if (!b.width || !b.height) return null;
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20) };
  }, f);
}

export function describe(v: Verdict): string {
  return `${v.id}: frames=${v.frames} raf=${v.rafFrames} flat=${v.flat.length}${v.flat.length ? '@' + v.flat.slice(0, 3).join(',') : ''} blink=${v.blink.join('|') || 0} foit=${v.foit.length}${v.foit.length ? '@' + v.foit.slice(0, 3).join(',') : ''} cover=${v.coverFrames} ov=${v.ovFrames}${v.firstApp !== undefined ? ` app@${v.firstApp}` : ''}${v.fontsAt ? ` fonts@${v.fontsAt}` : ''} lastStd=${v.lastStd.toFixed(1)}`;
}
