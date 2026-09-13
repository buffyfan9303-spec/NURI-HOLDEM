// UI-01·03·05(2026-09-13) 소스 배선 계약 — 실화면 수치는 e2e(notice-body · post-detail-read · board-view-toggle)가 잰다.
//
// 이 파일이 보는 것:
//   UI-01  NoticeDetailModal 이 본문을 parseNoticeBody 로 구조화해 그리고, 단일 <p whitespace-pre-wrap> 덩어리와
//          dangerouslySetInnerHTML 이 없다(보안 표준 7). 줄 높이 1.75 는 그대로다(§8.1: 키우지 않는다).
//   UI-03  아우라 수평선 유틸 `.divider-aura` 가 index.css 에 있고(다크 accent-200 · 라이트 accent-300, 1px, 양끝 투명),
//          독서 경계 4곳(공지 메타→본문 · 게시글 작성자→본문 · 반응 줄 · 본문→댓글)이 그것을 쓰며,
//          댓글 구역의 full-bleed 검은 띠(-mx-4 … bg-surface-base border-t)가 사라졌다.
//   UI-05  게시판 보기 전환이 h-11 슬롯 두 개 + aria-pressed + 접근 가능한 이름이고 옛 `h-7 w-7` 이 없다. SlidingPill 을 쓰지 않는다.
// 못 보는 것: 문장의 존재만 본다. 합성된 색 대비·inset 수치·프레스 물리는 e2e 몫이다.
// 음성 대조: NoticeDetailModal 의 `parseNoticeBody(` 호출을 지우면 UI-01 이, index.css 의 `.divider-aura` 블록을 지우면 UI-03 이,
//            CommunityTab 버튼의 `aria-pressed=` 를 지우면 UI-05 가 실패한다.
// 실행: npx vitest run src/components/features/readingSurface.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
const NOTICE = strip(readFileSync(join(__dirname, 'NoticeDetailModal.tsx'), 'utf-8'));
const POST = strip(readFileSync(join(__dirname, 'PostDetailModal.tsx'), 'utf-8'));
const COMM = strip(readFileSync(join(__dirname, 'CommunityTab.tsx'), 'utf-8'));
const CSS = readFileSync(join(__dirname, '..', '..', 'index.css'), 'utf-8');

describe('UI-01 · 공지 본문 구조화', () => {
  it('🔴 parseNoticeBody 로 그리고, 단일 pre-wrap <p> 덩어리·HTML 주입이 없다', () => {
    expect(NOTICE).toMatch(/import \{ parseNoticeBody \} from '\.\.\/\.\.\/lib\/noticeBody';/);
    expect(NOTICE).toMatch(/parseNoticeBody\(notice\.body\)/);
    expect(NOTICE).not.toMatch(/<p className="whitespace-pre-wrap break-words text-base leading-\[1\.75\] text-ink-primary">\s*\{notice\.body\}/);
    expect(NOTICE).not.toMatch(/dangerouslySetInnerHTML/);
    // 줄 높이는 그대로 1.75 — 키우지 않는다(§8.1)
    expect(NOTICE).toMatch(/data-notice-body[^>]*leading-\[1\.75\]/);
    // 전역 break-all 로 해결하지 않는다
    expect(NOTICE).not.toMatch(/break-all/);
  });
  it('항목은 원문 번호(marker)를 그대로 그리고 브라우저 자동 번호에 맡기지 않는다', () => {
    expect(NOTICE).toMatch(/list-none/);
    expect(NOTICE).toMatch(/\{it\.marker\}/);
  });
});

describe('UI-03 · 아우라 구분선', () => {
  it('🔴 .divider-aura 유틸 — 1px · 양끝 투명 · 다크 accent-200 / 라이트 accent-300', () => {
    const i = CSS.indexOf('.divider-aura {');
    expect(i, '.divider-aura 가 index.css 에 없다').toBeGreaterThan(-1);
    const block = CSS.slice(i, i + 900);
    expect(block).toMatch(/height:\s*1px/);
    expect(block).toMatch(/linear-gradient\(\s*90deg,\s*transparent[^)]*rgb\(var\(--accent-200\) \/ 0\.(2[5-9]|3[0-5])\)[^)]*transparent/);
    expect(block).toMatch(/html\.light \.divider-aura[\s\S]*?rgb\(var\(--accent-300\) \/ 0\.(1[8-9]|2[0-8])\)/);
    // 움직이는 네온·큰 그림자 없음
    expect(block).not.toMatch(/animation|box-shadow:\s*0 0 (1[0-9]|[2-9][0-9])px/);
  });
  it('🔴 독서 경계 4곳이 divider-aura 를 쓰고, 옛 border 선·댓글 검은 띠가 없다', () => {
    expect(NOTICE).toMatch(/<hr className="divider-aura mt-4" aria-hidden="true" \/>/);
    expect(NOTICE).not.toMatch(/border-t border-border-subtle pt-4/);
    const n = (POST.match(/<hr className="divider-aura[^"]*" aria-hidden="true" \/>/g) ?? []).length;
    expect(n, 'PostDetailModal 의 작성자→본문 · 반응 줄 · 본문→댓글 세 곳').toBe(3);
    expect(POST).not.toMatch(/<header className="mt-3 flex items-center gap-2\.5 border-b border-border-default pb-3">/);
    expect(POST).not.toMatch(/mt-3 flex items-center gap-2 border-t border-border-subtle pt-3/);
    const c = POST.match(/<section data-pd-comments className="([^"]*)"/);
    expect(c, '댓글 section 을 찾지 못했다').not.toBeNull();
    expect(c![1]).not.toMatch(/-mx-4|bg-surface-base|border-t/);
  });
  it('입력창·표·focus ring 은 손대지 않는다 — .input 정의는 그대로다', () => {
    expect(CSS).toMatch(/\.input\s*\{/);
    expect((CSS.match(/divider-aura/g) ?? []).length, 'CSS 안 divider-aura 는 정의 2곳(기본·라이트)뿐').toBeLessThanOrEqual(4);
  });
});

describe('N08 · 게시판 보기 기본값은 compact — 읽기·쓰기가 lib/boardView 한 벌', () => {
  it('🔴 CommunityTab 이 readBoardView/writeBoardView 를 쓰고, 옛 인라인 localStorage 판정이 없다', () => {
    expect(COMM).toMatch(/import \{ readBoardView, writeBoardView \} from '\.\.\/\.\.\/lib\/boardView';/);
    expect(COMM).toMatch(/useState<'compact' \| 'feed'>\(readBoardView\)/);
    expect(COMM).toMatch(/const switchView = \(v: 'compact' \| 'feed'\) => \{ setView\(v\); writeBoardView\(v\); \};/);
    expect(COMM).not.toMatch(/localStorage\.getItem\('nuri:board-view'\)/);
    // 자동 저장 경로가 없다 — 쓰기는 switchView 한 곳뿐
    expect((COMM.match(/writeBoardView\(/g) ?? []).length).toBe(1);
  });
});

describe('N07 · 공지 섹션은 접힌 한 줄 바', () => {
  const NS = strip(readFileSync(join(__dirname, 'NoticeSection.tsx'), 'utf-8'));
  const DC = strip(readFileSync(join(__dirname, 'DealerCommunity.tsx'), 'utf-8'));
  it('🔴 외곽이 큰 카드(card-aura)가 아니라 낮은 바이고, 대표 제목 행과 펼치기가 별개 버튼(중첩 없음)이다', () => {
    const i = NS.indexOf('export default function NoticeSection(');
    const S = NS.slice(i);
    expect(S).toMatch(/<section data-notice-bar/);
    expect(S).not.toMatch(/card-aura/);
    expect(S).not.toMatch(/border-b border-border-subtle pb-1\.5/);   // 옛 카드 헤더
    expect(S).toMatch(/aria-expanded=\{open\}/);
    expect(S).toMatch(/aria-controls=\{listId\}/);
    // 대표 행은 NoticeRow(자기 <li><button>) — 펼치기 버튼은 그 형제다
    expect(S).toMatch(/<NoticeRow key=\{top\.id\} notice=\{top\}/);
    expect(S).not.toMatch(/<button[^>]*>\s*<NoticeRow/);
    // 정적 — 전광판·회전 transform 없음(notice-static 취지)
    expect(S).not.toMatch(/marquee|rotate-/);
  });
  it('🔴 sortOrder 1차 키 정렬은 그대로이고, 펼친 목록은 limit 없이 전부 보인다', () => {
    expect(NS).toMatch(/\(\(b\.sortOrder \?\? 0\) - \(a\.sortOrder \?\? 0\)\)/);
    expect(NS).not.toMatch(/limit\b/);
    expect(DC).not.toMatch(/limit=\{5\}/);
  });
  it('🔴 App → CommunityTab·MarketplaceTab 로 공지 오류가 내려간다(리드 승인 2026-09-13, App.tsx 최소 변경)', () => {
    const APP = strip(readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf-8'));
    const MT = strip(readFileSync(join(__dirname, 'MarketplaceTab.tsx'), 'utf-8'));
    expect(APP).toMatch(/const \[noticesErr,\s+setNoticesErr\]\s+= useState<unknown>\(null\);/);
    expect(APP).not.toMatch(/getNotices\(\)\.then\(\(v\) => \{ setNotices\(v\); writeSnap\('notices', v\); setNoticesLoaded\(true\); \}\)\.catch\(\(\) => \{\}\)/);
    expect(APP).toMatch(/\.catch\(\(e: unknown\) => setNoticesErr\(e\)\)/);
    expect(APP).toMatch(/else setNoticesErr\(nr\.reason\);/);
    expect((APP.match(/noticesError=\{noticesErr\} onRetryNotices=\{reloadNotices\}/g) ?? []).length, 'CommunityTab·MarketplaceTab 두 곳').toBe(2);
    expect(COMM).toMatch(/error=\{noticesError\} onRetry=\{onRetryNotices\}/);
    expect(COMM).toMatch(/\|\| noticesError != null\) && \(/);
    expect(MT).toMatch(/error=\{noticesError\}\s+onRetry=\{onRetryNotices\}/);
    expect(MT).toMatch(/\|\| noticesError != null\) && \(/);
  });

  it('🔴 조회 실패는 없음과 분리한다 — error/onRetry 프롭 + DealerCommunity 가 catch 를 삼키지 않는다', () => {
    expect(NS).toMatch(/error\?: unknown; onRetry\?: \(\) => void;/);
    expect(NS).toMatch(/<LoadErrorCard what="공지" error=\{error\} onRetry=\{onRetry\} compact \/>/);
    expect(DC).toMatch(/const \[noticesErr, setNoticesErr\] = useState<unknown>\(null\);/);
    expect(DC).not.toMatch(/getNotices\(\)[\s\S]{0,300}\.catch\(\(\) => \{\}\)/);
    expect(DC).toMatch(/error=\{noticesErr\} onRetry=\{reloadNotices\}/);
  });
});

describe('UI-05 · 보기 전환 두 슬롯', () => {
  const i = COMM.indexOf('data-board-view-toggle');
  it('🔴 트랙에 data-board-view-toggle + 그룹 이름, 버튼 두 개가 h-11 w-11 슬롯이고 aria-pressed 를 가진다', () => {
    expect(i, 'data-board-view-toggle 이 없다').toBeGreaterThan(-1);
    const T = COMM.slice(i, i + 2200);
    expect(T).toMatch(/role="group" aria-label="보기 방식"/);
    // 두 슬롯은 같은 map 한 벌에서 나온다 — 한쪽만 radius·보더·크기가 달라질 수 없다(§6-4)
    expect(T).toMatch(/\{ v: 'feed' as const, label: '카드 보기'/);
    expect(T).toMatch(/\{ v: 'compact' as const, label: '한 줄 목록'/);
    expect(T).toMatch(/<button key=\{v\} type="button" aria-label=\{label\} title=\{label\} aria-pressed=\{view === v\}/);
    expect(T).toMatch(/relative flex h-11 w-11 items-center justify-center/);
    expect(T).not.toMatch(/h-7 w-7/);
    // 선택 배경은 슬롯 안 inset 3px 의 별도 면 — 아이콘과 같은 버튼 안에서 함께 움직인다
    expect(T).toMatch(/absolute inset-\[3px\] rounded-\[6px\]/);
    expect((T.match(/width="18" height="18"/g) ?? []).length).toBe(2);
    // 트랙에 p-0.5 같은 안쪽 여백이 없다 — 버튼이 슬롯을 꽉 채운다(빈틈 0)
    expect(T).toMatch(/^data-board-view-toggle role="group" aria-label="보기 방식"\s+className="flex h-11 shrink-0 items-center rounded-input border border-border-default bg-surface-high"/);
    expect(T).not.toMatch(/SlidingPill/);
  });
});
