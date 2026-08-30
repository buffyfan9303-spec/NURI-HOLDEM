// 한글 커버리지 회귀 게이트 — "폰트 비용을 줄였더니 한글이 깨졌다"를 원천 차단한다.
//
// 왜 이 파일이 필요한가:
//   폰트 payload 를 줄이는 가장 흔한 방법은 **글자를 버리는 것**이다(상용 2,350자 정적 서브셋 등).
//   그러면 '가나다'는 멀쩡한데 매장명·닉네임의 희귀 음절(예: 뷁·쒜·촥)만 다른 폰트로 떨어진다.
//   그건 눈으로 홈 화면만 봐서는 절대 안 보이고, 실제 유저 데이터가 들어온 뒤에야 터진다.
//   그래서 사람 눈이 아니라 **픽셀**로 잰다.
//
// 재는 법(e2e/emoji-glyphs.spec.ts 의 선례를 그대로 재사용):
//   ① 두부(□) 판정 — 존재할 수 없는 코드포인트(U+10FFFF)를 같은 폰트로 그린 **픽셀 해시**를
//      기준선으로 삼고, 대상 글자의 해시가 그것과 같으면 .notdef 로 떨어진 것이다.
//      폭만 비교하면 우연히 폭이 같은 진짜 글리프를 오판한다.
//   ② 폴백 누수 판정 — 같은 글자를 (a) Pretendard **단독** 스택과 (b) 존재하지 않는 폰트 스택으로
//      각각 그려 해시를 비교한다. 같으면 Pretendard 가 그 글자를 안 갖고 있어서 브라우저가
//      시스템 폰트로 떨어뜨린 것이다 — 이게 '서브셋을 좁혔을 때' 나타나는 바로 그 증상이다.
//
// ⚠ 왜 앱의 폰트 스택을 그대로 쓰지 않는가(실측으로 알아낸 함정):
//   font-display:optional 은 블록 구간을 놓친 face 를 **그 문서 전체에서 사용 불가**로 만든다.
//   canvas 도 같은 폰트 선택 기계를 쓰므로, 콜드 로드에서는 '가'조차 Pretendard 로 안 그려진다
//   (실측: PRE 해시 == 폴백 해시). 그 상태로 재면 전 글자가 '폴백'으로 나와 테스트가 무의미해진다.
//   그래서 배달 경로를 우회해 **실제로 배포되는 woff2 파일 자체**를 FontFace 로 직접 등록해 잰다.
//   이 테스트가 지키는 것은 '어떻게 배달하는가'가 아니라 '무슨 글자를 담고 있는가'다.
import { test, expect } from '@playwright/test';

/** 라이브 DB 실측 인벤토리(2026-08-30) — 매장명·닉네임·게시글 제목/본문·일정명에 실제로 등장한 글자.
 *  개인 식별 정보를 커밋하지 않으려고 문자열이 아니라 **코드포인트 집합**만 가져왔다. */
const LIVE_CODEPOINTS = [
  0x0028, 0x0029, 0x002e, 0x0030, 0x0031, 0x0032, 0x0035, 0x0038, 0x0044, 0x0045,
  0x0047, 0x0054, 0x005b, 0x005d, 0x005f, 0x0061, 0x0064, 0x006a, 0x006f, 0x0074,
  0xacbd, 0xad73, 0xadf8, 0xb098, 0xb110, 0xb204, 0xb2e8, 0xb364, 0xb3c4, 0xb3c5,
  0xb808, 0xb85c, 0xb864, 0xb9ac, 0xb9cc, 0xbaa8, 0xbbf8, 0xbc31, 0xbd07, 0xbd81,
  0xc2a4, 0xc544, 0xc591, 0xc5c5, 0xc774, 0xc7a5, 0xc8fc, 0xcc2c, 0xcf13, 0xd06c,
  0xd14c, 0xd1a0, 0xd2b8, 0xd2f0, 0xd30c, 0xd38d, 0xd640,
];

/** 한글 음절 U+AC00–U+D7A3(11,172자) 전 구간 층화 표본 — 11칸마다 1자(=1,016자).
 *  '상용 2,350자' 류로 서브셋을 좁히면 이 표본의 상당수가 폴백으로 떨어져 즉시 잡힌다. */
const HANGUL_STRIDE = 11;

/** 앱 UI 가 실제로 쓰는 구두점·기호 — Pretendard 가 직접 그려야 한다(본문과 같은 서체여야 하니까). */
const TEXT_SYMBOLS = ['·', '›', '–', '—', '…', '₩', '%', '~', '“', '”'];

/** 카드 수트 — 도메인 기호라 이모지 규약의 명시적 예외이고, **Pretendard 에 없는 게 정상**이다
 *  (실측: ♥ 만 있고 ♠♦♣ 는 시스템 폰트가 그린다). 그래서 '두부만 아니면 된다'로만 검사하고,
 *  '어느 폰트가 그렸는가'는 e2e/emoji-glyphs.spec.ts 가 이미 따로 못 박고 있다(중복 규정 금지). */
const SUITS = ['♠', '♥', '♦', '♣'];

test.describe('폰트 커버리지 — 한글이 깨지지 않는다', () => {
  test('🔴 한글·기호가 두부(□)로 떨어지지 않고, Pretendard 자신이 그린다', async ({ page }) => {
    test.setTimeout(120_000); // 서브셋 92개를 실제로 내려받아 재는 테스트라 기본 30s 로는 모자라다
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // ⚠ 2026-08-30: 여기서 `link[data-nuri-font]` 를 기다리지 않는다.
    //   그 속성은 FONT-3 **지연 주입 구현이 만든 마커**라, 나중에 누가 배달 방식을
    //   평범한 <link> 나 SSR/프리로드로 되돌리면 **서브셋은 멀쩡한데 이 테스트만 타임아웃**한다.
    //   이 스펙이 지키는 것은 '어떻게 배달하는가' 가 아니라 **'무슨 글자를 담고 있는가'** 다.
    //   아래 evaluate 는 CSS 를 직접 fetch 해 FontFace 로 등록하므로 링크 부착 여부와 무관하다.
    //   (지연 주입이 실제로 일어나는지는 배달 회귀로 따로 봐야 할 별건이다.)

    const res = await page.evaluate(async (cfg: { live: number[]; stride: number; symbols: string[]; suits: string[] }) => {
      const cps: number[] = [...cfg.live];
      for (let cp = 0xac00; cp <= 0xd7a3; cp += cfg.stride) cps.push(cp);
      for (let cp = 0x3131; cp <= 0x3163; cp++) cps.push(cp); // 호환 자모 ㄱ~ㅣ
      for (const s of cfg.symbols) cps.push(s.codePointAt(0)!);
      const suitCps = new Set(cfg.suits.map((s) => s.codePointAt(0)!));
      const uniq = [...new Set([...cps, ...suitCps])];
      const text = uniq.map((c) => String.fromCodePoint(c)).join('');

      // 배포되는 서브셋 CSS 를 그대로 읽어 woff2 를 'NuriProbe' 라는 별도 family 로 재등록한다.
      // FontFace 로 직접 만들면 font-display 규칙 바깥이라 콜드 로드에서도 확실히 사용 가능해진다.
      const CSS = '/fonts/pretendard/pretendardvariable-dynamic-subset.css';
      const css = await (await fetch(CSS)).text();
      const base = CSS.replace(/[^/]+$/, '');
      const faces: FontFace[] = [];
      for (const block of css.match(/@font-face\s*\{[^}]*\}/g) || []) {
        const url = /url\(\s*\.?\/?([^)\s]+?)\s*\)/.exec(block)?.[1];
        const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1]?.trim();
        if (!url) continue;
        const f = new FontFace('NuriProbe', `url(${base}${url.replace(/^\.\//, '')})`, {
          weight: '45 920', ...(range ? { unicodeRange: range } : {}),
        });
        faces.push(f);
        document.fonts.add(f);
      }
      await Promise.all(faces.map((f) => f.load().catch(() => null)));
      void text;

      const W = 48, H = 48;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      const hash = (s: string, font: string) => {
        ctx.clearRect(0, 0, W, H);
        ctx.font = font;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#000';
        ctx.fillText(s, 4, 38);
        const d = ctx.getImageData(0, 0, W, H).data;
        let h = 2166136261, ink = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 8) ink++;
          h = Math.imul(h ^ (d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11), 16777619) >>> 0;
        }
        return { h, ink };
      };
      // (a) 배포 woff2 단독(NuriProbe) — 없는 글자는 브라우저 기본 폰트로 떨어진다.
      // (b) 존재하지 않는 폰트 — 항상 브라우저 기본 폰트.
      const PRE = '32px "NuriProbe"';
      const FB = '32px "__nuri_no_such_font__"';
      const loadedFaces = faces.filter((f) => f.status === 'loaded').length;

      const notdef = hash('\u{10FFFF}', PRE);
      const tofu: number[] = [];
      const fellBack: number[] = [];
      for (const cp of uniq) {
        const s = String.fromCodePoint(cp);
        const a = hash(s, PRE);
        if (a.ink === 0 || a.h === notdef.h) { tofu.push(cp); continue; }
        if (suitCps.has(cp)) continue;                 // 수트는 '두부 아님'까지만 본다(위 주석 참고)
        if (a.h === hash(s, FB).h) fellBack.push(cp);
      }

      // 계측기 자체의 유효성 — 양방향으로 검증한다(재는 도구가 고장 나면 '이상 없음'이 거짓이 된다).
      const known = hash('가', PRE).h !== hash('가', FB).h;          // Pretendard 가 가진 글자 → 달라야 한다
      const absent = hash('क', PRE).h === hash('क', FB).h; // 데바나가리 क → Pretendard 에 없음 → 같아야 한다
      return { total: uniq.length, tofu, fellBack, notdefInk: notdef.ink, known, absent, faces: faces.length, loadedFaces };
    }, { live: LIVE_CODEPOINTS, stride: HANGUL_STRIDE, symbols: TEXT_SYMBOLS, suits: SUITS });

    const hex = (cp: number) => `${String.fromCodePoint(cp)}(U+${cp.toString(16).toUpperCase().padStart(4, '0')})`;

    // 프로브 유효성 먼저 — 이게 깨지면 아래 '이상 없음'은 아무 의미가 없다.
    expect(res.notdefInk, '두부 기준선이 아무것도 안 그렸다 — 프로브 무효').toBeGreaterThan(0);
    // ⚠ 여기서 'face 개수'로 문턱을 걸면 안 된다 — 단일 정적 서브셋 1파일로 바꾸는
    //   정당한 변경까지 잡아버린다. 이 테스트가 지켜야 할 건 개수가 아니라 **글자**다.
    expect(res.loadedFaces, `폰트 자산이 하나도 로드되지 않았다(선언 ${res.faces}개) — 프로브 무효`).toBeGreaterThan(0);
    expect(res.known, "'가'가 Pretendard 와 폴백에서 똑같이 그려졌다 — 폰트가 아예 안 실렸다(프로브 무효)").toBe(true);
    expect(res.absent, 'Pretendard 에 없는 글자(데바나가리)가 폴백과 다르게 그려졌다 — 프로브 무효').toBe(true);
    expect(res.total, '표본이 비었다 — 프로브 무효').toBeGreaterThan(1000);

    expect(
      res.tofu.map(hex).join(', '),
      '한글/기호가 두부(□)로 떨어진다 — 이 앱은 한국어 서비스다. 폰트 서브셋 변경을 되돌려라.',
    ).toBe('');

    expect(
      res.fellBack.slice(0, 40).map(hex).join(', ') + (res.fellBack.length > 40 ? ` 외 ${res.fellBack.length - 40}자` : ''),
      'Pretendard 가 못 가진 글자가 시스템 폰트로 떨어졌다 — 서브셋을 좁힌 결과다.\n'
      + '매장명·닉네임의 희귀 음절만 다른 서체로 뜨는 증상이라 홈 화면만 봐서는 안 보인다.',
    ).toBe('');
  });
});
