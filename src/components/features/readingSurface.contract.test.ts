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
const MODAL = strip(readFileSync(join(__dirname, '..', 'atoms', 'Modal.tsx'), 'utf-8'));
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
  it('🔴 공지 독서 경계는 divider-aura, 옛 border 선이 없다(NOTICE 전용 — divider-aura 는 공용이라 손대지 않았다)', () => {
    expect(NOTICE).toMatch(/<hr className="divider-aura mt-4" aria-hidden="true" \/>/);
    expect(NOTICE).not.toMatch(/border-t border-border-subtle pt-4/);
  });
  // UI-Aura(2026-09-14, design 실측): divider-aura peak 1.89:1·양끝 0 이라 PostDetailModal 에서는 사실상 안 보였다.
  // index.css 는 공용(NoticeDetailModal 도 쓰고 home-team 이 동시 편집 중)이라 전역 alpha 대신
  // 이 화면 세 곳만 국소적으로 border-strong 실선(mid 위 2.71:1)으로 바꿨다 — 그래서 PostDetailModal 은
  // 더 이상 divider-aura 를 쓰지 않는다(NOTICE 는 그대로 위 테스트가 지킨다).
  it('🔴 PostDetailModal 독서 경계 3곳은 border-strong 실선이고, 옛 border-b/border-subtle·divider-aura 가 없다', () => {
    const n = (POST.match(/<hr className="border-t border-border-strong[^"]*" aria-hidden="true" \/>/g) ?? []).length;
    expect(n, 'PostDetailModal 의 작성자→본문 · 반응 줄 · 본문→댓글 세 곳').toBe(3);
    expect(POST).not.toMatch(/<hr className="divider-aura/);
    expect(POST).not.toMatch(/<header className="mt-3 flex items-center gap-2\.5 border-b border-border-default pb-3">/);
    expect(POST).not.toMatch(/mt-3 flex items-center gap-2 border-t border-border-subtle pt-3/);
  });
  // UI-Aura(2026-09-14, design 실측): compact 셸을 surface-mid 로 고친 뒤 재보니 article·본문·댓글가 전부 투명이라
  // 인접 면 대비가 1.00(구분 자체가 없음)이었다 — 그래서 댓글 section 에 **테두리 있는 우물**(article 좌우 여백
  // 안에 갇힌 카드, 창 폭을 꽉 채우지 않는다)을 다시 넣는다. §5-1 이 겪은 "화면을 가로지르는 검은 띠"는
  // full-bleed 음수 마진(-mx-4)이 원인이었다 — 그 마진만 없으면 같은 결함이 아니다(그래서 그것만 금지한다).
  it('🔴 댓글 section 은 border-strong 테두리의 우물(bg-surface-base)이고, full-bleed 음수 마진은 없다', () => {
    const c = POST.match(/<section data-pd-comments className="([^"]*)"/);
    expect(c, '댓글 section 을 찾지 못했다').not.toBeNull();
    expect(c![1]).toMatch(/rounded-card border border-border-strong bg-surface-base p-3/);
    expect(c![1]).toMatch(/\bring-aura\b/);
    expect(c![1]).not.toMatch(/-mx-4/);
  });
  it('입력창·표·focus ring 은 손대지 않는다 — .input 정의는 그대로다', () => {
    expect(CSS).toMatch(/\.input\s*\{/);
    expect((CSS.match(/divider-aura/g) ?? []).length, 'CSS 안 divider-aura 는 정의 2곳(기본·라이트)뿐').toBeLessThanOrEqual(4);
  });
});

// UI-Aura 장식(2026-09-14, design 최종 스펙) — 색·간격이 아니라 "장식이 상태를 따라가는가"만 본다.
// 잘못되면 실제 버그가 되는 두 곳만 계약으로 잠근다: 비활성 버튼에 글로우가 붙거나, 안 누른 알약이 켜진 것처럼 보이면
// "지금 이걸 눌렀다"는 거짓 신호가 된다. 나머지(아바타·묶음 링·이전/다음 카드)는 순수 장식이라 계약을 걸지 않는다.
describe('UI-Aura(2026-09-14) · 장식이 상태를 거짓말하지 않는다', () => {
  it('🔴 응원 버튼의 ring-aura-glow 는 비활성(cheerDisabled)일 때 빠진다', () => {
    const i = POST.indexOf('const cheerDisabled = cheerBusy || cheerPrice === null;');
    expect(i, 'cheerDisabled 판정을 찾지 못했다').toBeGreaterThan(-1);
    const block = POST.slice(i, i + 500);
    expect(block).toMatch(/cheerDisabled \? '' : 'ring-aura-glow'/);
  });
  it('🔴 반응 알약 3개는 각자의 active 조건일 때만 data-aura 를 켠다(상시 on 이 아니다)', () => {
    expect(POST).toMatch(/data-aura=\{post\.liked \|\| undefined\}/);
    expect(POST).toMatch(/data-aura=\{myReaction === 'goodrun' \|\| undefined\}/);
    expect(POST).toMatch(/data-aura=\{myReaction === 'badbeat' \|\| undefined\}/);
    // 셋 다 조건 없는 상시 data-aura(문자열 리터럴)로 되돌아오지 않았는지 — data-aura-level 은 별개 속성이라 제외
    expect(POST).not.toMatch(/<button[^>]*\bdata-aura(?![-=])/);
  });
});

describe('UI-Aura(2026-09-14) · Modal page 셸 — compact(게시글 상세)만 surface-mid', () => {
  // 재현했던 결함: PostDetailModal 은 article/헤더에 자체 배경이 없어(위 divider-aura 검사가 이미 확인)
  // Modal 의 page 셸 색이 곧 화면 전체 지면이다. 셸이 무조건 surface-base(다크 #06080F, 거의 검정)면
  // "단색 검정 한 장"이 된다 — density를 받으면서도 셸 색은 분기가 없던 것이 근본 원인(오너 2026-09-14 스크린샷).
  // 음성 대조: 아래 삼항연산자를 `'bg-surface-base'` 상수 하나로 되돌리면 이 두 단언이 즉시 실패한다(직접 확인함).
  it('🔴 page 전체화면 셸: compact 는 surface-mid, 그 외 5곳(캘린더/매장 도구·GTO·일정)은 surface-base 그대로', () => {
    expect(MODAL).toMatch(/className=\{\['fixed inset-0 z-\[55\] flex flex-col pt-\[env\(safe-area-inset-top\)\]',\s*\n\s*compact \? 'bg-surface-mid' : 'bg-surface-base',/);
    // 옛 무조건 surface-base(분기 없음) 패턴이 되돌아오지 않았는지 — 같은 class 문자열 안에 bg-surface-base 가 고정으로 붙어 있으면 실패
    expect(MODAL).not.toMatch(/\['fixed inset-0 z-\[55\] bg-surface-base /);
  });
  it('🔴 page 헤더: compact 는 surface-mid(본문과 같은 지면), 그 외는 surface-base — border-strong 구분선은 공통', () => {
    expect(MODAL).toMatch(/<header className=\{\['shrink-0 flex items-center justify-between border-b border-border-strong',\s*\n\s*compact \? 'px-3 py-1 bg-surface-mid' : 'px-4 h-header-h bg-surface-base'\]/);
    expect(MODAL).not.toMatch(/justify-between border-b border-border-strong bg-surface-base',\s*\n\s*compact \? 'px-3 py-1'/);
  });
});

describe('UI-Aura(2026-09-14) · 제목→본문 간격 — design 실측 84.8px 과다분만 줄인다', () => {
  // line-height 는 실측상 정상(본문 1.7·제목 1.375·댓글 1.625)이라 어느 것도 건드리지 않는다 — 아래는 여백만 본다.
  it('🔴 작성자 헤더 pb-2 · 본문 래퍼 mt-3 — 옛 pb-3/mt-4 로 되돌아오지 않았다', () => {
    expect(POST).toMatch(/<header className="mt-3 flex items-center gap-2\.5 pb-2">/);
    expect(POST).not.toMatch(/<header className="mt-3 flex items-center gap-2\.5 pb-3">/);
    expect(POST).toMatch(/<div className="mt-3 space-y-3">/);
    expect(POST).not.toMatch(/<div className="mt-4 space-y-3">/);
    // leading-* 유틸은 이번 변경과 무관 — 실측상 정상이라 그대로다
    expect(POST).toMatch(/leading-snug/);
    expect(POST).toMatch(/leading-\[1\.7\]/);
  });
});

// AI 문구 정리(2026-09-14): CommentThread 와 같은 판단 — 로그인(=위 '글쓰기' 바 렌더) 상태에서 목록이
// 정말 비었으면 emptyText 박스를 생략한다(3단 중복 제거). 검색 결과 0건은 새 정보라 그대로 둔다.
describe('AI 문구 정리(2026-09-14) · 게시글 목록 빈 안내도 입력 바와 중복되지 않는다', () => {
  it('🔴 posts.length===0 분기가 user 유무로 갈린다 — 로그인+글 없음은 null, 그 외는 emptyText/검색결과없음', () => {
    const i = COMM.indexOf("serverErr != null ? (\n            <LoadErrorCard error={serverErr} what=\"검색 결과\" onRetry={loadMore} />\n          ) : user && posts.length === 0 ? (");
    expect(i, 'user && posts.length===0 분기를 찾지 못했다').toBeGreaterThan(-1);
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
