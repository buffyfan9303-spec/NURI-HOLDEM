// N-2·L1-7·N-1(2026-10-03 재점검 1회차) — 클락 매장 이미지 표시 방식 · 업로드 형식 · 세로 상금 띠 규격의 순수 계약.
// 실행: npx vitest run src/components/features/clock/clockBgDisplay.test.ts
import { describe, it, expect, vi, beforeAll } from 'vitest';

// clockBgImage 가 supabase 클라이언트를 import 한다 — CI 는 실 env 라 진짜 클라이언트가 생기지 않게 막는다.
vi.mock('../../../lib/supabase', () => ({ IS_MOCK: false, supabase: { storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn(), remove: vi.fn() }) } } }));

const BASE = 'https://unit-test.supabase.co';
type ThemeMod = typeof import('./clockTheme');
let T: ThemeMod;
let url: (name: string) => string;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', BASE);   // 허용 URL 접두사는 모듈 로드 때 정해진다 — 먼저 심고 불러온다
  vi.resetModules();
  T = await import('./clockTheme');
  url = (name) => `${BASE}/storage/v1/object/public/${T.CLOCK_BG_BUCKET}/venue-1/${name}`;
});

const lin = (u: number) => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

describe('N-2 표시 방식 — 기본값은 종전 화면 그대로', () => {
  it('옛 테마(표시 키 없음)는 --clk-bg 문자열이 종전 합성과 한 글자도 다르지 않다', () => {
    const img = url('1700000000000.webp');
    const v = T.clockThemeVars(T.makeClockTheme('carbon', undefined, img));
    const base = T.clockPresetById('carbon')!.bg;
    expect(v['--clk-bg']).toBe(`${T.CLOCK_BG_SCRIM}, url("${img}") center/cover no-repeat, ${base}`);
    expect(v['--clk-plate']).toBeUndefined();
    expect(v['--clk-logo']).toBeUndefined();
  });
  it('기본값은 저장하지 않는다 — 객체 모양이 종전과 같다', () => {
    const img = url('a.webp');
    expect(T.makeClockTheme('carbon', undefined, img, { fit: 'cover', pos: 'center', size: 2, shade: 0 }).background)
      .toEqual({ kind: T.clockPresetById('carbon')!.kind, preset: 'carbon', image: img });
  });
  it('화이트리스트 밖 값은 버린다(문자열 주입·큰 수)', () => {
    const raw = { version: 1, palette: { preset: 'carbon' }, background: { kind: 'solid', preset: 'carbon', image: url('a.webp'), fit: 'url(x)', pos: 'left', size: 9, shade: 7 } };
    const t = T.sanitizeClockTheme(raw)!;
    expect(T.clockBgDisplayOf(t)).toEqual({ fit: 'cover', pos: 'center', size: 2, shade: 0, plate: 1 });
  });
  it('왕복(make → sanitize)·프리셋 전환에서 표시 설정이 산다', () => {
    const t = T.makeClockTheme('carbon', undefined, url('a.webp'), { fit: 'center', pos: 'top', size: 3 });
    expect(T.clockBgDisplayOf(T.sanitizeClockTheme(t))).toEqual({ fit: 'center', pos: 'top', size: 3, shade: 0, plate: 1 });
    expect(T.clockBgDisplayOf(T.themeForPresetChange('aura-gold', t))).toMatchObject({ fit: 'center', pos: 'top', size: 3 });
  });
  it('이미지가 없으면 표시 설정도 남지 않는다', () => {
    expect(T.makeClockTheme('carbon', undefined, null, { fit: 'center' }).background).toEqual({ kind: T.clockPresetById('carbon')!.kind, preset: 'carbon' });
  });
});

describe('N-2 렌더 변수', () => {
  it('cover — 이름표 밝기 상한(d)과 어둡게 단계가 검은 층 하나로 합성된다(상한을 풀지 않는다)', () => {
    const img = url('1700-d40-t0a0b0c.webp');
    const a = (shade: 0 | 1 | 2) => {
      const bg = T.clockThemeVars(T.makeClockTheme('carbon', undefined, img, { shade }))['--clk-bg'];
      return Number(/linear-gradient\(rgba\(0,0,0,([\d.]+)\), rgba/.exec(bg)![1]);
    };
    expect(a(0)).toBeCloseTo(0.4, 3);
    expect(a(1)).toBeGreaterThan(a(0));
    expect(a(2)).toBeGreaterThan(a(1));
  });
  it('contain — 잘림 없는 contain + 위치 + 대표색 바탕, 판 변수가 켜진다', () => {
    const img = url('1700-d40-t0a0b0c.webp');
    const v = T.clockThemeVars(T.makeClockTheme('carbon', undefined, img, { fit: 'contain', pos: 'bottom' }));
    expect(v['--clk-bg']).toBe(`url("${img}") center bottom/contain no-repeat, #0a0b0c`);
    expect(v['--clk-bg']).not.toContain('rgba(0,0,0');   // 이미지를 누르지 않는다
    expect(v['--clk-plate']).toBe(T.CLOCK_PLATE);
  });
  it('로고로 넣기 — 루트 배경은 테마 바탕 그대로, 로고 칸 크기 변수만(글자 판 없음 — 로고는 겹치지 않는 자기 칸)', () => {
    const img = url('logo.webp');
    const v = T.clockThemeVars(T.makeClockTheme('carbon', undefined, img, { fit: 'center', size: 1, pos: 'top' }));
    expect(v['--clk-bg']).toBe(T.clockPresetById('carbon')!.bg);
    expect(v).toMatchObject({ '--clk-logo': img, '--clk-logo-head': '5cqmin', '--clk-logo-tall': '20cqmin' });
    expect(v['--clk-plate']).toBeUndefined();
    expect(v['--clk-logo-plate']).toBeUndefined();   // 밝은 로고는 받침 없음
  });
  it('중-3 어두운 로고(-k) — 로고는 밝은 받침, 맞추기는 밝은 중립 바탕 · 받침 끄기(plate 0)면 둘 다 없음', () => {
    const img = url('1-d0-t111111-k.webp');
    const logo = T.clockThemeVars(T.makeClockTheme('carbon', undefined, img, { fit: 'center' }));
    expect(logo['--clk-logo-plate']).toBe(T.CLOCK_LOGO_PLATE);
    const fit = T.clockThemeVars(T.makeClockTheme('carbon', undefined, img, { fit: 'contain' }));
    expect(fit['--clk-bg']).toContain(T.CLOCK_LIGHT_NEUTRAL);
    const off = T.makeClockTheme('carbon', undefined, img, { fit: 'center', plate: 0 });
    expect(off.background).toMatchObject({ plate: 0 });
    expect(T.clockThemeVars(off)['--clk-logo-plate']).toBeUndefined();
    expect(T.clockThemeVars(T.makeClockTheme('carbon', undefined, img, { fit: 'contain', plate: 0 }))['--clk-bg']).toContain('#111111');
    // 받침/바탕과 로고(검정) 대비 3:1 이상
    const plate = [236, 239, 245].map((c) => 0.9 * c + 0.1 * 6);
    expect(ratio(lum([0, 0, 0]), lum(plate))).toBeGreaterThanOrEqual(3);
    expect(ratio(lum([0, 0, 0]), lum([0xd9, 0xdd, 0xe5]))).toBeGreaterThanOrEqual(3);
  });
  it('이름표 해석 — 없는 이름표는 d=0(옛 파일은 이미 구웠다) · 범위 밖은 95 로 막는다', () => {
    expect(T.clockBgMetaOf(url('1700000000000.webp'))).toEqual({ dim: 0, tint: null, plate: 'none', ar: null });
    expect(T.clockBgMetaOf(url('1-d37-tabcdef.webp'))).toEqual({ dim: 0.37, tint: '#abcdef', plate: 'none', ar: null });
    expect(T.clockBgMetaOf(url('1-d0-t111111-k.webp'))).toEqual({ dim: 0, tint: '#111111', plate: 'light', ar: null });
    expect(T.clockBgMetaOf(url('1-m-d0-t350e14.webp'))).toEqual({ dim: 0, tint: '#350e14', plate: 'dark', ar: null });
    expect(T.clockBgMetaOf(url('1-a36-m-d0-t350e14.webp'))).toEqual({ dim: 0, tint: '#350e14', plate: 'dark', ar: 0.36 });
    expect(T.clockThemeVars(T.makeClockTheme('carbon', undefined, url('1-a36-d0-t000000.webp'), { fit: 'center' }))['--clk-logo-ar']).toBe('0.36');
    expect(T.clockBgMetaOf(url('1-d99.webp')).dim).toBe(0.95);
  });
  it('하-A 옛 번들 호환 — -m 이 붙어도 옛 정규식은 d·t 를 그대로 읽는다', () => {
    const old = /-d(\d{1,2})(?:-t([0-9a-f]{6}))?(-k)?\.(?:webp|jpe?g|png)$/.exec(url('1-m-d37-t350e14.webp'));
    expect(old?.slice(1, 3)).toEqual(['37', '350e14']);
  });
  it('하-A 중간 밝기 로고(-m) — 로고·맞추기 모두 검은 받침 · 받침 끄기면 없음', () => {
    const img = url('1-m-d0-t350e14.webp');
    expect(T.clockThemeVars(T.makeClockTheme('nuri-signature', undefined, img, { fit: 'center' }))['--clk-logo-plate']).toBe(T.CLOCK_LOGO_PLATE_DARK);
    expect(T.clockThemeVars(T.makeClockTheme('nuri-signature', undefined, img, { fit: 'contain' }))['--clk-bg']).toMatch(/, #000000$/);
    expect(T.clockThemeVars(T.makeClockTheme('nuri-signature', undefined, img, { fit: 'center', plate: 0 }))['--clk-logo-plate']).toBeUndefined();
    expect(T.clockThemeVars(T.makeClockTheme('nuri-signature', undefined, img, { fit: 'contain', plate: 0 }))['--clk-bg']).toMatch(/, #350e14$/);
  });
  it('글자 판 계산 — 판 뒤가 순백이어도 흰 글자 4.5:1·가장 어두운 강조색 3:1(대형) 이상', () => {
    const a = T.CLOCK_PLATE_ALPHA;
    const comp = [6, 8, 15].map((c) => (1 - a) * 255 + a * c);
    const L = lum(comp);
    expect(ratio(lum([255, 255, 255]), L)).toBeGreaterThanOrEqual(4.5);
    // 보조 라벨(흰 .62 over 판)
    const dim = comp.map((c) => 0.62 * 255 + 0.38 * c);
    expect(ratio(lum(dim), L)).toBeGreaterThanOrEqual(4.5);
    // 가장 어두운 스와치 #5E6AD2 — 배경 없는 기본 바탕(4.27)·종전 사진 상한(3.05)과 같은 대형 글자 기준
    expect(ratio(lum([0x5e, 0x6a, 0xd2]), L)).toBeGreaterThanOrEqual(3);
  });
});

describe('중-3·하-A 로고 받침 판정(업로드 이름표 -k·-m) — 실제 바탕(CLOCK_LOGO_BG_LUM) 기준 3:1', () => {
  // 픽셀 휘도 묶음: [색, 개수] — 재점검 시험 그림과 같은 구성(빨강 판 + 흰 글자 15% 등)
  const px = (...parts: [number[], number][]) => parts.flatMap(([c, n]) => Array<number>(n).fill(lum(c)));
  const RED = px([[0xc8, 0x10, 0x2e], 85], [[255, 255, 255], 15]);
  const BLUE = px([[0x1e, 0x88, 0xe5], 85], [[255, 255, 255], 15]);
  const GOLD = px([[0xd4, 0xaf, 0x37], 92], [[0x7a, 0x5a, 0x10], 4], [[0x3b, 0x1f, 0x00], 4]);
  const BLACK = px([[0x11, 0x11, 0x11], 100]);
  const WHITE = px([[255, 255, 255], 100]);
  const LIGHT = [236, 239, 245].map((c) => 0.9 * c + 0.1 * 30);   // 밝은 받침(0.9) — 뒤가 바탕(≈#1e)일 때
  /** 하위 10% 픽셀(판정과 같은 자리)과 받침/바탕의 대비 */
  const worst = (ls: number[], bgL: number) => { const l = [...ls].sort((a, b) => a - b)[Math.floor(ls.length * 0.1)]; return (Math.max(l, bgL) + 0.05) / (Math.min(l, bgL) + 0.05); };
  it('빨강은 검은 받침, 검정은 밝은 받침, 파랑·금색·흰색은 받침 없음', () => {
    expect(T.clockLogoPlateKind(RED)).toBe('dark');
    expect(T.clockLogoPlateKind(BLACK)).toBe('light');
    expect(T.clockLogoPlateKind(BLUE)).toBe('none');
    expect(T.clockLogoPlateKind(GOLD)).toBe('none');
    expect(T.clockLogoPlateKind(WHITE)).toBe('none');
    expect(T.clockLogoPlateKind([])).toBe('none');
  });
  it('검토 중-1 — 판정은 가장자리만: 안쪽 갈색 글자가 많아도 가장자리가 금색이면 받침 없음', () => {
    const goldEdge = px([[0xd4, 0xaf, 0x37], 100]);
    const goldAll = px([[0xd4, 0xaf, 0x37], 60], [[0x3b, 0x1f, 0x00], 40]);
    expect(T.clockLogoPlateKind(goldEdge, goldAll)).toBe('none');
    expect(T.clockLogoPlateKind(goldAll)).toBe('light');   // 전체로 판정하면 잘못 받침이 붙는다
  });
  it('검토 중-2 — 흰 글자+검은 테두리: 가장자리는 검정이지만 밝은 면이 15% 를 넘어 밝은 받침 금지(받침 없음)', () => {
    const outEdge = px([[0, 0, 0], 100]);
    const outAll = px([[0, 0, 0], 50], [[255, 255, 255], 50]);
    expect(T.clockLogoPlateKind(outEdge, outAll)).toBe('none');
    expect(T.clockLogoPlateKind(BLACK, BLACK)).toBe('light');   // 검은 글자만인 로고는 그대로 밝은 받침
  });
  it('5종 모두 고른 받침(또는 실제 바탕) 위에서 3:1 이상 · 빨강은 받침 없이는 3:1 미만이었다', () => {
    const bgOf = (k: string) => (k === 'dark' ? 0 : k === 'light' ? lum(LIGHT) : T.CLOCK_LOGO_BG_LUM);
    for (const ls of [RED, BLUE, GOLD, BLACK, WHITE]) expect(worst(ls, bgOf(T.clockLogoPlateKind(ls)))).toBeGreaterThanOrEqual(3);
    expect(worst(RED, T.CLOCK_LOGO_BG_LUM)).toBeLessThan(3);
    // 기본 테마 머리줄 실측 0.0165 가 상한 안에 있다(상한을 낮추면 빨강이 다시 받침 없이 나간다)
    expect(T.CLOCK_LOGO_BG_LUM).toBeGreaterThanOrEqual(0.0177);
  });
});

describe('L1-7 업로드 형식 — accept 와 같은 3종만', () => {
  it('GIF·SVG 는 업로드 전에 거절한다', async () => {
    const { uploadClockBg, CLOCK_BG_ACCEPT } = await import('./clockBgImage');
    expect([...CLOCK_BG_ACCEPT]).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    for (const type of ['image/gif', 'image/svg+xml', 'image/bmp', 'text/plain']) {
      await expect(uploadClockBg('v', new File(['x'], 'x', { type }))).rejects.toThrow('JPG·PNG·WebP');
    }
  });
});

describe('N-1 세로 상금 띠 규격 — 10자리 금액 × 200등까지 넘치지 않는다', () => {
  it('띠 예산(72cqmin) 안에서 2단이 되거나, 안 되면 1단(10줄씩)으로 떨어진다', async () => {
    const F = await import('./prizeFit');
    for (const n of [3, 10, 11, 15, 20, 60, 200]) {
      for (const amt of [1_000_000, 99_999_999, 9_999_999_999]) {
        const rows = Array.from({ length: n }, (_, i) => ({ place: String(i + 1), amount: amt }));
        const L = F.pickPrizeLayout(rows, F.PRIZE_BAND_CQ, F.PRIZE_LEFT_ROWS);
        const w = F.prizeWorst(rows);
        const per = L.twoCol ? F.prizeRowCq(L.spec, w.placeFactor, w.amountChars, false) * 2 + F.PRIZE_GUTTER_CQ
          : F.prizeRowCq(L.spec, w.placeFactor, w.amountChars, false);
        expect(per, `${n}줄 · ${amt}`).toBeLessThanOrEqual(F.PRIZE_BAND_CQ);
        if (n <= 10) expect(L.twoCol).toBe(false);
      }
    }
  });
});
