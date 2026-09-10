// 클락 테마 저장 계약 — 배경 이미지 URL 허용목록이 실제로 잠겨 있는가.
//
// 이 검사가 필요한 이유: clockTheme 은 업주가 자유롭게 쓰는 JSON(venues.page_config) 안에 산다.
// 값 검증이 한 겹이라도 빠지면 임의 외부 URL 이 매장 TV 배경으로 그대로 렌더된다
// (외부 호스트 요청 · CSS url("…") 문자열 탈출). 허용은 우리 스토리지의 clock_bg 경로 하나뿐이다.
import { describe, it, expect } from 'vitest';
import {
  isAllowedClockBgUrl, sanitizeClockTheme, makeClockTheme, clockThemeVars, clockBgObjectPath, clockPresetById,
  CLOCK_BG_BUCKET, CLOCK_DEFAULTS, CLOCK_BG_INK, DEFAULT_CLOCK_PRESET_ID, CLOCK_THEME_PRESETS, BLACK_MARBLE_GOLD_BG,
} from './clockTheme';

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
