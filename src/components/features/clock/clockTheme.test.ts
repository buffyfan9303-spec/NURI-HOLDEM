// 클락 테마 저장 계약 — 배경 이미지 URL 허용목록이 실제로 잠겨 있는가.
//
// 이 검사가 필요한 이유: clockTheme 은 업주가 자유롭게 쓰는 JSON(venues.page_config) 안에 산다.
// 값 검증이 한 겹이라도 빠지면 임의 외부 URL 이 매장 TV 배경으로 그대로 렌더된다
// (외부 호스트 요청 · CSS url("…") 문자열 탈출). 허용은 우리 스토리지의 clock_bg 경로 하나뿐이다.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  isAllowedClockBgUrl, sanitizeClockTheme, makeClockTheme, themeForPresetChange, clockThemeVars, clockBgObjectPath, clockPresetById,
  publishClockTheme, subscribeClockTheme, subscribeClockAd, publishClockSignal, clockThemeSnapKey, type ClockTheme,
  CLOCK_BG_BUCKET, CLOCK_DEFAULTS, CLOCK_BG_INK, DEFAULT_CLOCK_PRESET_ID, CLOCK_THEME_PRESETS, BLACK_MARBLE_GOLD_BG,
} from './clockTheme';
import { readSnap } from '../../../lib/snapshot';

const BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
const ok = BASE ? `${BASE}/storage/v1/object/public/${CLOCK_BG_BUCKET}/venue-1/1700000000000.webp` : '';

describe('배경 이미지 URL 허용목록', () => {
  it.runIf(!!BASE)('우리 스토리지의 clock_bg 경로만 통과한다', () => {
    expect(isAllowedClockBgUrl(ok)).toBe(true);
    // 다른 버킷 · 다른 호스트 · 프로토콜 장난 · CSS 문자열 탈출 전부 거절
    expect(isAllowedClockBgUrl(`${BASE}/storage/v1/object/public/posters/x.webp`)).toBe(false);
    expect(isAllowedClockBgUrl('https://evil.example.com/x.webp')).toBe(false);
    expect(isAllowedClockBgUrl(`https://evil.example.com/#${BASE}/storage/v1/object/public/${CLOCK_BG_BUCKET}/a.webp`)).toBe(false);
    expect(isAllowedClockBgUrl(`javascript:alert(1)//${BASE}`)).toBe(false);
    expect(isAllowedClockBgUrl(`${BASE}/storage/v1/object/public/${CLOCK_BG_BUCKET}/a.webp"),url(https://evil/x`)).toBe(false);
    expect(isAllowedClockBgUrl(`${BASE}/storage/v1/object/public/${CLOCK_BG_BUCKET}/../posters/x.webp`)).toBe(false);
    expect(isAllowedClockBgUrl(null)).toBe(false);
    expect(isAllowedClockBgUrl(123)).toBe(false);
  });

  it.runIf(!!BASE)('sanitize 는 허용목록 밖 URL 을 조용히 떨어뜨린다(테마 자체는 살린다)', () => {
    const dirty = { version: 1, palette: { preset: 'carbon' }, background: { kind: 'solid', preset: 'carbon', image: 'https://evil.example.com/x.png' } };
    const clean = sanitizeClockTheme(dirty);
    expect(clean?.background?.preset).toBe('carbon');
    expect(clean?.background?.image).toBeUndefined();
  });

  it.runIf(!!BASE)('허용 URL 은 왕복(make → sanitize)에서 보존된다', () => {
    const t = makeClockTheme('carbon', '#FCD535', ok);
    expect(sanitizeClockTheme(t)?.background?.image).toBe(ok);
    expect(clockBgObjectPath(ok)).toBe('venue-1/1700000000000.webp');
  });
});

describe('clockThemeVars · 배경 유무에 따른 변수', () => {
  it('테마 없음 = 현행 하드코딩 값 1:1(픽셀 변화 0)', () => {
    const v = clockThemeVars(null);
    expect(v['--clk-bg']).toBe(CLOCK_DEFAULTS.bg);
    expect(v['--clk-timer']).toBe(CLOCK_DEFAULTS.timer); // 2026-09-02 아우라 골드: 타이머는 순백, accent 는 골드
    expect(v['--clk-ink-dim']).toBe(CLOCK_DEFAULTS.inkDim);
    expect(v['--clk-ink-soft']).toBe(CLOCK_DEFAULTS.inkSoft);
    // 긴급·브레이크는 어떤 테마도 덮지 못하는 잠금값
    expect(v['--clk-timer-urgent']).toBe(CLOCK_DEFAULTS.timerUrgent);
    expect(v['--clk-timer-break']).toBe(CLOCK_DEFAULTS.timerBreak);
  });

  it('프리셋만 지정하면 배경은 단일 레이어 그대로(이미지 합성 없음)', () => {
    const v = clockThemeVars(makeClockTheme(DEFAULT_CLOCK_PRESET_ID));
    expect(v['--clk-bg']).toBe(CLOCK_DEFAULTS.bg);
    expect(v['--clk-bg']).not.toContain('url(');
  });

  it.runIf(!!BASE)('배경 이미지가 있으면 스크림→사진→프리셋색 3층 + 보조라벨 상향', () => {
    const v = clockThemeVars(makeClockTheme('carbon', undefined, ok));
    const layers = v['--clk-bg'];
    expect(layers.indexOf('linear-gradient')).toBeLessThan(layers.indexOf('url('));
    expect(layers.indexOf('url(')).toBeLessThan(layers.indexOf('#000000')); // 색은 마지막 레이어에만 올 수 있다
    expect(layers).toContain(`url("${ok}") center/cover no-repeat`);
    expect(v['--clk-ink-dim']).toBe(CLOCK_BG_INK.dim);
    expect(v['--clk-ink-soft']).toBe(CLOCK_BG_INK.soft);
  });
});

// ── CT-03 · 옛 번들이 모르는 프리셋 id ─────────────────────────────────────────
// 새 프리셋을 배포하는 창에서 매장 TV·다른 운영자 세션은 며칠째 열린 **옛 번들**이다.
// 미지 id 를 만나면 테마 전체를 버리던 것(업로드 사진·강조색까지 소실 · 옛 패널이 다음 클릭에 DB 를 기본으로 덮어씀)이
// 결함이었다 — id 는 보존하고 룩만 기본으로 그린다.
describe('미지의 프리셋 id — 테마를 버리지 않는다', () => {
  it('알 수 없는 id 라도 사진·강조색은 살고 id 는 그대로 왕복한다', () => {
    const raw = {
      version: 1,
      palette: { preset: 'future-theme', accent: '#FCD535' },
      background: { kind: 'gradient', preset: 'future-theme', image: ok },
    };
    const t = sanitizeClockTheme(raw);
    expect(t?.background?.preset).toBe('future-theme');
    expect(t?.palette?.preset).toBe('future-theme');
    expect(t?.palette?.accent).toBe('#FCD535');
    if (BASE) expect(t?.background?.image).toBe(ok);
    // 옛 패널이 강조색을 바꿔 저장해도(makeClockTheme(curPresetId, …)) 새 id 가 'aura' 로 되돌아가지 않는다
    expect(makeClockTheme('future-theme', '#38BDF8', null).palette?.preset).toBe('future-theme');
  });

  it.runIf(!!BASE)('미지 id 여도 배경 사진·스크림 합성과 고른 강조색은 유지되고 배경만 기본 프리셋으로 떨어진다', () => {
    const v = clockThemeVars(makeClockTheme('future-theme', '#FCD535', ok));
    expect(v['--clk-bg']).toContain('url(');
    expect(v['--clk-bg'].endsWith(CLOCK_DEFAULTS.bg)).toBe(true); // 맨 아래 층 = 기본 룩
    expect(v['--clk-accent']).toBe('#FCD535');
  });

  it('id 모양이 아닌 값(CSS 탈출·숫자·빈 문자열)은 통째로 거절한다', () => {
    expect(sanitizeClockTheme({ version: 1, palette: { preset: 'x"); url(https://evil' } })).toBeNull();
    expect(sanitizeClockTheme({ version: 1, palette: { preset: 123 } })).toBeNull();
    expect(sanitizeClockTheme({ version: 1, palette: { preset: '' } })).toBeNull();
    // makeClockTheme 에 잘못된 모양이 오면 기본 프리셋으로(저장값이 빈 id 로 굳는 일이 없게)
    expect(makeClockTheme('').palette?.preset).toBe(CLOCK_THEME_PRESETS[0].id);
  });
});

// ── 블랙 마블 골드 프리셋 ───────────────────────────────────────────────────────
describe('black-marble-gold 프리셋', () => {
  it('목록에 1항목으로 존재하고 왕복(make → sanitize → vars)에서 그 배경을 쓴다', () => {
    const p = clockPresetById('black-marble-gold');
    expect(p?.label).toBe('블랙 마블 골드');
    expect(p?.timer).toBe('#FFFFFF');          // 타이머 순백(레퍼런스 위계: 시간이 먼저)
    const v = clockThemeVars(sanitizeClockTheme(makeClockTheme('black-marble-gold')));
    expect(v['--clk-bg']).toBe(BLACK_MARBLE_GOLD_BG);
    expect(v['--clk-accent']).toBe(p?.accent);
    expect(v['--clk-timer']).toBe('#FFFFFF');
  });

  it('CSS 만으로 만든다 — url() 0 · 색은 마지막 레이어에만(사진 아래에 그대로 이어 붙일 수 있게)', () => {
    expect(BLACK_MARBLE_GOLD_BG).not.toContain('url(');
    // 괄호 깊이 0 인 콤마로만 자른다(gradient 안의 색 정지점 콤마는 건너뛴다)
    const layers: string[] = [];
    let depth = 0, cur = '';
    for (const ch of BLACK_MARBLE_GOLD_BG) {
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { layers.push(cur.trim()); cur = ''; } else cur += ch;
    }
    layers.push(cur.trim());
    expect(layers.length).toBeGreaterThan(10);
    expect(layers.at(-1)).toMatch(/^#[0-9a-f]{6}$/i);
    for (const l of layers.slice(0, -1)) expect(l).toMatch(/^(radial|linear)-gradient\(/);
    // 사진이 올라와도 규칙이 깨지지 않는다: 스크림 → 사진 → 마블 층 순서
    if (BASE) {
      const v = clockThemeVars(makeClockTheme('black-marble-gold', undefined, ok))['--clk-bg'];
      expect(v.indexOf('url(')).toBeLessThan(v.indexOf(BLACK_MARBLE_GOLD_BG));
    }
  });
});

// ── 색 역할 분리 계약 (오너 지시 2026-09-11) ─────────────────────────────────
//
// 재현했던 결함: 테마를 고르면 **타이머와 여러 숫자가 프리셋 색을 따라갔다**.
//   원인 ① clockThemeVars 의 `customAccent ?? …` — 강조색이 --clk-timer 까지 덮었다.
//   원인 ② `p.timer ?? p.accent` — timer 를 명시한 프리셋이 3개뿐이라 나머지 6종은 타이머 = accent.
// 기존 11개 테스트는 이 동작을 **한 줄도 잠그지 않아** 결함이 그대로 살아남았다. 여기서 못박는다.
describe('색 역할 분리 — 강조색이 덮을 수 있는 것과 없는 것', () => {
  const VIOLET = '#A78BFA';   // 스와치의 바이올렛 — 오너가 보고한 '전부 보라색'의 그 색
  const vars = (preset: string, accent?: string) => clockThemeVars(makeClockTheme(preset, accent, null));

  it('1~3. 아우라 기본 · 아우라 골드 · 블랙 마블 골드 — 메인 타이머는 흰색', () => {
    for (const id of ['aura', 'aura-gold', 'black-marble-gold']) {
      expect(vars(id)['--clk-timer'], id).toBe('#FFFFFF');
    }
  });

  it('🔴 프리셋 9종 **전부** 메인 타이머가 흰색 — timer 미지정 프리셋이 accent 로 새지 않는다', () => {
    for (const p of CLOCK_THEME_PRESETS) {
      expect(vars(p.id)['--clk-timer'], p.label).toBe('#FFFFFF');
    }
  });

  it('4. custom violet accent 를 적용해도 --clk-timer 는 흰색', () => {
    for (const p of CLOCK_THEME_PRESETS) {
      expect(vars(p.id, VIOLET)['--clk-timer'], p.label).toBe('#FFFFFF');
    }
  });

  it('5. custom accent 는 --clk-accent 와 프레임 역할만 바꾼다', () => {
    const before = vars('aura-gold');
    const after = vars('aura-gold', VIOLET);
    expect(before['--clk-accent']).toBe('#E0A94E');      // 프리셋 기본(샴페인 골드)
    expect(after['--clk-accent']).toBe(VIOLET);           // 강조색만 따라간다
    expect(after['--clk-frame']).toContain(VIOLET);       // 프레임은 accent 파생이라 함께 움직인다
    expect(after['--clk-frame-soft']).toContain(VIOLET);
    // 나머지 역할은 전부 그대로
    for (const k of ['--clk-timer', '--clk-prize', '--clk-timer-urgent', '--clk-timer-break', '--clk-ink', '--clk-bg']) {
      expect(after[k], k).toBe(before[k]);
    }
  });

  it('6~8. --clk-prize 는 금색 · urgent 는 rose · break 는 sky 로 잠긴다', () => {
    for (const p of CLOCK_THEME_PRESETS) {
      const v = vars(p.id, VIOLET);
      expect(v['--clk-prize'], p.label).toBe(CLOCK_DEFAULTS.prize);
      expect(v['--clk-timer-urgent'], p.label).toBe(CLOCK_DEFAULTS.timerUrgent);
      expect(v['--clk-timer-break'], p.label).toBe(CLOCK_DEFAULTS.timerBreak);
      expect(v['--clk-ink'], p.label).toBe('#FFFFFF');    // 일반 핵심 숫자
    }
  });

  it('🔴 프리셋마다 --clk-accent 가 실제로 다르다 — 전부 보라로 보이면 실패', () => {
    const accents = CLOCK_THEME_PRESETS.map((p) => vars(p.id)['--clk-accent']);
    // 9종 중 중복이 있어도 좋지만(골드 계열 3종), 한 색으로 뭉치면 프리셋의 의미가 없다
    expect(new Set(accents).size).toBeGreaterThanOrEqual(6);
    expect(accents.filter((a) => a === '#A78BFA')).toHaveLength(0);  // 어떤 프리셋도 기본이 바이올렛이 아니다
  });

  it('12~13. 허용목록 밖 accent · 배경 URL 은 차단되고 기본값으로 떨어진다', () => {
    const bad = clockThemeVars(makeClockTheme('aura', 'javascript:alert(1)', 'https://evil.example.com/x.png'));
    expect(bad['--clk-accent']).toBe(CLOCK_DEFAULTS.accent);   // 스와치에 없는 값 → 프리셋 기본
    expect(bad['--clk-bg']).not.toContain('evil.example.com'); // 외부 URL 은 배경에 들어가지 않는다
    expect(bad['--clk-bg']).not.toContain('javascript:');
  });
});

describe('프리셋 전환 — 이전 강조색은 버리고 배경 사진은 지킨다', () => {
  it.runIf(!!BASE)('9~10. 새 프리셋을 고르면 이전 custom accent 가 사라지고 배경 이미지는 보존된다', () => {
    // 바이올렛을 골라 둔 '아우라' 매장이 '아우라 골드'로 갈아탄다 — 오너가 보고한 그 경로
    const prev = makeClockTheme('aura', '#A78BFA', ok);
    expect(prev.palette?.accent).toBe('#A78BFA');

    const next = themeForPresetChange('aura-gold', prev);
    expect(next.palette?.preset).toBe('aura-gold');
    expect(next.palette?.accent).toBeUndefined();          // 이월 없음
    expect(next.background?.image).toBe(ok);               // 사진은 그대로

    const v = clockThemeVars(next);
    expect(v['--clk-accent']).toBe('#E0A94E');             // 아우라 골드의 기본 샴페인 골드
    expect(v['--clk-accent']).not.toBe('#A78BFA');         // 보라가 따라오지 않는다
    expect(v['--clk-timer']).toBe('#FFFFFF');              // 타이머는 어느 경로에서도 흰색
  });

  it('배경 사진이 없던 매장은 전환 후에도 없다(없는 것을 만들지 않는다)', () => {
    const next = themeForPresetChange('carbon', makeClockTheme('neon-night', '#22D3EE', null));
    expect(next.background?.image).toBeUndefined();
    expect(next.palette?.accent).toBeUndefined();
  });
});

// ── 저장 → 전파 계약 (오너 보고 2026-09-11 "테마가 실제로 선택해도 적용이 잘 안돼") ──────
//
// 결함: 패널은 DB(page_config)에만 썼고, ClockDisplay·운영자 미리보기는 마운트 때 한 번만 읽었다.
//   → 테마를 골라도 **열려 있는 화면은 그대로**. TV 는 보통 window.open 한 별도 창이라 더 티가 났다.
//   같은 부류가 스폰서 광고(app_settings)에도 있었다 — 그쪽도 `useEffect(..., [])` 였다.
describe('테마 저장은 열려 있는 화면에 전파된다', () => {
  // vitest 환경이 'node' 라 window·localStorage 가 없다(jsdom 미설치 — 새 의존성을 들이지 않는다).
  // 전파는 이벤트 + localStorage 두 축이므로 **그 둘만** 최소로 세운다. Node 24 는 EventTarget·CustomEvent 를 이미 갖고 있다.
  beforeAll(() => {
    const bus = new EventTarget();
    const mem = new Map<string, string>();
    vi.stubGlobal('window', {
      addEventListener: bus.addEventListener.bind(bus),
      removeEventListener: bus.removeEventListener.bind(bus),
      dispatchEvent: bus.dispatchEvent.bind(bus),
    });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('🔴 publish 하면 같은 매장 구독자가 새 테마를 받는다', () => {
    const V = 'venue-1';
    const got: (ClockTheme | null)[] = [];
    const off = subscribeClockTheme(V, (t) => got.push(t));
    publishClockTheme(V, makeClockTheme('black-marble-gold', undefined, null));
    off();
    expect(got, '구독자가 한 번도 불리지 않았다 — 저장해도 화면이 안 바뀐다').toHaveLength(1);
    expect(got[0]?.palette?.preset).toBe('black-marble-gold');
  });

  it('publish 는 스냅샷도 갱신한다 — 다음에 새로 여는 화면이 옛 테마를 먼저 그리지 않는다', () => {
    const V = 'venue-2';
    publishClockTheme(V, makeClockTheme('neon-night', undefined, null));
    const snap = readSnap<ClockTheme | null>(clockThemeSnapKey(V));
    expect(snap?.palette?.preset).toBe('neon-night');
  });

  it('다른 매장의 저장에는 반응하지 않는다', () => {
    let n = 0;
    const off = subscribeClockTheme('venue-A', () => { n += 1; });
    publishClockTheme('venue-B', makeClockTheme('carbon', undefined, null));
    off();
    expect(n).toBe(0);
  });

  it('구독 해제 후에는 더 이상 받지 않는다(리스너 누수 없음)', () => {
    let n = 0;
    const off = subscribeClockTheme('venue-3', () => { n += 1; });
    off();
    publishClockTheme('venue-3', makeClockTheme('aura', undefined, null));
    expect(n).toBe(0);
  });

  it('🔴 광고 신호와 테마 신호가 서로 섞이지 않는다', () => {
    let themeHits = 0, adHits = 0;
    const offT = subscribeClockTheme('venue-4', () => { themeHits += 1; });
    const offA = subscribeClockAd(() => { adHits += 1; });
    publishClockSignal('ad');                                        // 광고만 바뀐 상황
    expect(themeHits, '광고를 바꿨는데 테마를 다시 읽는다').toBe(0);
    expect(adHits).toBe(1);
    publishClockTheme('venue-4', makeClockTheme('aura-gold', undefined, null));  // 테마만
    expect(adHits, '테마를 바꿨는데 광고를 다시 받아온다').toBe(1);
    expect(themeHits).toBe(1);
    offT(); offA();
  });
});
