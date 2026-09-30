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
const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

/** 서브셋 CSS 가 정의하는 family — 이름이 다르면 face 가 하나도 안 붙는다. */
const FAMILY = /font-family:\s*'([^']+)'/.exec(read('fonts/pretendard/pretendardvariable-dynamic-subset.css'))![1];

/** 페이지별 본문 이미지 수 — 0장이 돼도 조용히 통과하지 않게 수로 고정한다(사용설명서는 텍스트판 — 2026-07 오너 요청). */
const PAGES: [string, number][] = [['about.html', 4], ['guide/owner.html', 6], ['guide/manual.html', 0]];

describe.each(PAGES)('%s', (page, imgCount) => {
  const html = stripComments(read(page));

  it('① 폰트 CSS 를 불러오고, body 글꼴 스택의 첫 항목이 그 CSS 의 family 다', () => {
    expect(html).toMatch(/<link[^>]+href="\/fonts\/pretendard\/pretendardvariable-dynamic-subset\.css"/);
    const body = /body\s*\{[^}]*font-family:\s*'([^']+)'/.exec(html);
    expect(body?.[1], 'body 에 font-family 가 없다').toBe(FAMILY);
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

describe.each(['about.html', 'guide/owner.html'])('%s — 법정 고지', (page) => {
  const text = read(page).replace(/<[^>]+>/g, '');
  it('③ 사업자 5항목 · 만 19세 · 1336 이 페이지 안에 있다', () => {
    for (const s of ['엔에이치홀딩스', '525-20-02937', '김윤혜', '다산중앙로82번안길', '070-8098-1727', '만 19세 미만', '1336']) {
      expect(text, s).toContain(s);
    }
  });
});
