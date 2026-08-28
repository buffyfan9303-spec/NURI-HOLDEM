// 클락 테마 저장 계약 — 배경 이미지 URL 허용목록이 실제로 잠겨 있는가.
//
// 이 검사가 필요한 이유: clockTheme 은 업주가 자유롭게 쓰는 JSON(venues.page_config) 안에 산다.
// 값 검증이 한 겹이라도 빠지면 임의 외부 URL 이 매장 TV 배경으로 그대로 렌더된다
// (외부 호스트 요청 · CSS url("…") 문자열 탈출). 허용은 우리 스토리지의 clock_bg 경로 하나뿐이다.
import { describe, it, expect } from 'vitest';
import {
  isAllowedClockBgUrl, sanitizeClockTheme, makeClockTheme, clockThemeVars, clockBgObjectPath,
  CLOCK_BG_BUCKET, CLOCK_DEFAULTS, CLOCK_BG_INK, DEFAULT_CLOCK_PRESET_ID,
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

describe('clockThemeVars — 배경 유무에 따른 변수', () => {
  it('테마 없음 = 현행 하드코딩 값 1:1(픽셀 변화 0)', () => {
    const v = clockThemeVars(null);
    expect(v['--clk-bg']).toBe(CLOCK_DEFAULTS.bg);
    expect(v['--clk-timer']).toBe(CLOCK_DEFAULTS.accent);
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
