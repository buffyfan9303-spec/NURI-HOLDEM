// 정적 안내 페이지(서비스 소개·업주 가이드·사용설명서) 계약 — 앱 밖에서 따로 서빙되는 HTML 이라 앱 계약이 닿지 않는다.
//
// 무엇을 보증하나(동작):
//  ① 앱과 같은 글꼴이 **실제로** 적용된다 — 2026-09-30 실측(CDP getPlatformFontsForNode): 세 페이지 모두 맑은 고딕으로 그려졌다.
//     about.html 은 폰트 CSS 를 아예 안 불렀고, guide 두 장은 불렀지만 family 를 'Pretendard' 로 적어
//     CSS 가 정의하는 'Pretendard Variable' 과 이름이 달랐다. 둘 다 소스 한 줄의 문제라 여기서 잠근다.
//  ② 본문 이미지는 width/height 를 적어 자리를 예약한다(CLS 0) · alt 가 있다 · 파일이 실제로 있다.
//  ③ 법정 고지(사업자 5항목 · 만 19세 · 1336)가 페이지 안에 있다.
// 음성 대조: about.html 의 font-family 첫 항목을 'Pretendard' 로 되돌리면 ① 이 실패한다(2026-09-30 실행 확인).
// 실행: npx vitest run src/staticGuidePages.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PUB = resolve(__dirname, '../public');
const read = (p: string) => readFileSync(resolve(PUB, p), 'utf-8');
/** 주석 속 설명문('<img width/height> 로 예약' 등)은 태그가 아니다 */
/** open…close 구간을 앞에서부터 잘라 낸다 — 정규식 한 번 치환은 잘린 자리에서 새 경계가 생기면 남긴다(CodeQL
 *  'incomplete multi-character sanitization'). indexOf 로 한 번 훑으면 남는 조각이 없다. 닫힘이 없으면 끝까지 버린다. */
function cutBlocks(s: string, open: string, close: string): string {
  let out = '';
  for (let i = 0; i < s.length;) {
    const a = s.indexOf(open, i);
    if (a < 0) { out += s.slice(i); break; }
    out += s.slice(i, a);
    const b = s.indexOf(close, a + open.length);
    if (b < 0) break;
    i = b + close.length;
  }
  return out;
}
const stripComments = (s: string) => cutBlocks(cutBlocks(s, '<!--', '-->'), '/*', '*/');
/** 태그를 뺀 글자 — '<' 부터 다음 '>' 까지를 버린다(같은 이유로 indexOf). */
const textOf = (html: string) => cutBlocks(html, '<', '>');

/** 서브셋 CSS 가 정의하는 family — 이름이 다르면 face 가 하나도 안 붙는다. */
const FAMILY = /font-family:\s*'([^']+)'/.exec(read('fonts/pretendard/pretendardvariable-dynamic-subset.css'))![1];

/** ① 의 본체 — 가이드 3장과 법정 문서(gen-legal·gen-licenses 생성본)가 같이 쓴다.
 *  link 는 동기여야 한다: manual 이 media="print" onload 로 비동기 로드하던 동안 첫 페인트에 크기 맞춘 폴백 face 까지 빠져
 *  글꼴이 붙는 순간 목차가 밀렸다(390 첫 방문 CLS 0.251 → 동기 link 0, 2026-10-01 느린 4G 실측). */
function fontContract(html: string) {
  const link = /<link[^>]+href="\/fonts\/pretendard\/pretendardvariable-dynamic-subset\.css"[^>]*>/.exec(html)?.[0];
  expect(link, '폰트 CSS link 가 없다').toBeTruthy();
  expect(link, '비동기(media) 로드 금지 — 첫 페인트에 폴백 face 가 빠진다').not.toMatch(/\smedia=/);
  const body = /(?:^|[\s}])body\s*\{[^}]*font-family:\s*'([^']+)'/.exec(html);
  expect(body?.[1], 'body 에 font-family 가 없다').toBe(FAMILY);
}

/** 페이지별 본문 이미지 수 — 0장이 돼도 조용히 통과하지 않게 수로 고정한다(사용설명서는 텍스트판 — 2026-07 오너 요청). */
const PAGES: [string, number][] = [['about.html', 4], ['guide/owner.html', 10], ['guide/manual.html', 0]];

describe.each(PAGES)('%s', (page, imgCount) => {
  const html = stripComments(read(page));

  it('① 폰트 CSS 를 불러오고, body 글꼴 스택의 첫 항목이 그 CSS 의 family 다', () => fontContract(html));

  it('④ 부드러운 스크롤은 움직임 줄이기 설정을 따른다', () => {
    // 2026-10-01 §2-9 — html{scroll-behavior:smooth} 를 무조건 걸면 '동작 줄이기'를 켠 사용자에게도 목차 이동이 미끄러진다.
    const bare = html.replace(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^{}]*\{[^}]*\}\s*\}/g, '');
    expect(bare).not.toMatch(/scroll-behavior:\s*smooth/);
  });

  it('② 이미지는 width·height·alt 를 갖고, 가리키는 파일이 존재한다', () => {
    const tags = html.match(/<img\b[^>]*>/g) ?? [];
    expect(tags).toHaveLength(imgCount);
    for (const tag of tags) {
      expect(tag, tag).toMatch(/\swidth="\d+"/);
      expect(tag, tag).toMatch(/\sheight="\d+"/);
      expect(tag, tag).toMatch(/\salt="[^"]{4,}"/);
      const src = /\ssrc="([^"]+)"/.exec(tag)![1];
      expect(existsSync(resolve(PUB, src.replace(/^\//, ''))), `없는 이미지: ${src}`).toBe(true);
    }
  });
});

// ③ 값은 앱 BusinessFooter(BIZ_REQUIRED·BIZ_EXTRA·AGE_HELPLINE)와 같아야 한다 — 문자열을 여기 베끼지 않고 소스에서 읽는다.
const FOOTER_SRC = readFileSync(resolve(__dirname, 'components/features/BusinessFooter.tsx'), 'utf-8');
const BIZ_VALUES = [...FOOTER_SRC.matchAll(/\['(?:상호|사업자등록번호|대표자|사업장 주소|전화번호|고객센터)', '([^']+)'\]/g)].map((m) => m[1]);

describe.each(['about.html', 'guide/owner.html', 'guide/manual.html'])('%s — 법정 고지', (page) => {
  const text = textOf(read(page)).replace(/\s+/g, ' ');
  it('③ 사업자 정보(앱 푸터와 같은 값) · 만 19세 · 1336 이 페이지 안에 있다', () => {
    expect(BIZ_VALUES, 'BusinessFooter 에서 사업자 값 6개를 읽지 못했다').toHaveLength(6);
    for (const s of [...BIZ_VALUES, '만 19세 미만은 이용할 수 없습니다', '도박문제 상담', '1336(24시간·무료)']) {
      expect(text, s).toContain(s);
    }
    // 개인 메일(2026-07 구판 PDF)은 공식 창구가 아니다
    expect(text).not.toMatch(/@gmail\.com/);
  });
  it('⑤ 개인정보처리방침 링크는 실제 문서로 간다', () => {
    const a = /<a[^>]+href="([^"]+)"[^>]*>개인정보처리방침<\/a>/.exec(read(page));
    expect(a?.[1]).toBe('/legal/privacy.html');
    expect(existsSync(resolve(PUB, 'legal/privacy.html'))).toBe(true);
  });
});

// 법정 문서(생성본)도 같은 글꼴 결함이 있었다 — 2026-09-30 기록, 10-01 생성기(scripts/gen-legal.mjs·gen-licenses.mjs) 수정.
describe.each(['terms', 'privacy', 'anti-gambling', 'marketing', 'refund', 'delete-account', 'licenses'])('legal/%s.html', (slug) => {
  it('① 폰트 CSS 를 불러오고, body 글꼴 스택의 첫 항목이 그 CSS 의 family 다', () => fontContract(read(`legal/${slug}.html`)));
});
