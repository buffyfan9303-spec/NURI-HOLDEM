// UI-02·UI-04 배선 계약 (2026-09-13) — 실화면·동작은 e2e/post-nav.spec.ts · lib/postNav.test.ts · atoms/modalBodyDrag.test.ts 가 잰다. 여기는 배선만.
//
// 이 파일이 보는 것
//   1. PostDetailModal 이 page 셸 + read 폭 + dragToClose={false} + compact 로 열리고, `inline ? 'sheet' : 'page'` 분기가 없다.
//   2. Modal 의 page 그립은 bodyDrag 일 때만 그린다.
//   3. §7.4 순서 의존 쌍: bump 의 finally stale 가드와 리셋 effect 의 setBumpBusy(false) 가 **둘 다** 있다
//      (하나만 있으면 유료 버튼이 영구 disabled 로 굳는다).
//      2026-09-15: 오너 지시로 응원(cheer)을 전량 삭제해 이 쌍의 한 축이 사라졌다 — 남은 끌올만 본다.
//   4. CommunityTab 이 실제 화면 배열(listSource)·서버 커서·done 을 스냅샷으로 넘기고, 2-pane 도 같은 스냅샷을 쓴다.
//   5. App 은 삭제 시 스냅샷에서 그 글만 빼며(무조건 null 금지 — realtime 남의 글 삭제), 닫을 때 맥락을 비운다.
// 음성 대조: PostDetailModal 의 `variant="page"` 를 `variant="sheet"` 로, App 의 `dropFromCtx(n, id)` 를 `null` 로 되돌리면 각각 실패한다.
// 실행: npx vitest run src/components/features/postNavWiring.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
const PD = strip(readFileSync(join(__dirname, 'PostDetailModal.tsx'), 'utf-8'));
const MODAL = strip(readFileSync(join(__dirname, '..', 'atoms', 'Modal.tsx'), 'utf-8'));
const COMM = strip(readFileSync(join(__dirname, 'CommunityTab.tsx'), 'utf-8'));
const APP = strip(readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf-8'));

describe('UI-02 · 전체화면 셸', () => {
  it('🔴 PostDetailModal: page + read 폭 + compact + 스와이프 닫기, keepViewport 는 **쓰지 않는다**', () => {
    // 🔴 2026-09-19 — 이 계약을 **두 번 뒤집었다.** 두 번째가 지금 값이다.
    //   ① "창이 내려가는 모션 살려줘" → `dragToClose={false}` 제거(page 변형의 기본값이 켜짐). 그대로다.
    //   ② 같은 날 아침 "밑으로 쭉 내려갔다 버벅이며 올라가" 를 `keepViewport` 로 고쳤다고 적었는데,
    //      **그게 원인이 아니었다.** 진짜 원인은 `SpotPostCard` 의 로딩 스켈레톤(144.75px)이
    //      모든 글에 떴다 사라지며 아래가 −145px 튄 것이다(LayoutShift 0.0806).
    //   ③ 그리고 `keepViewport` 는 **얻는 것 없이 흔들림만 더했다.** 같은 조건 실측(390×844):
    //        keepViewport 켬 → 열 때 layout-shift **0.0153** · 닫을 때 스크롤 손실 0
    //        keepViewport 끔 → 열 때 layout-shift **0**      · 닫을 때 스크롤 손실 **0**
    //      문서를 접어 scrollY 를 0 으로 만드는 바람에 헤더 축소가 풀리고(47.75→60.5) 배경이 밀렸다.
    //      짧은 문서에서는 0.0753 까지 나왔다.
    //   ⚠ 주소창 가설은 하네스에 주소창이 없어 **영원히 검증 불가**다. 다만 두 모드 모두 문서를
    //      스크롤 불가로 만든다는 것이 실측됐으므로(docH == innerHeight), 그 가설은 두 모드를
    //      구별하지 못한다 — 즉 keepViewport 를 정당화하지 못한다.
    //   ⇒ 되돌렸다. **다시 켜려면 위 숫자부터 다시 재라.** 근거 없이 켜지 마라.
    expect(PD).toMatch(/<Modal open=\{open\} onClose=\{onClose\} title="커뮤니티 게시판" maxWidth=\{inline \? '2xl' : 'read'\} variant="page" inline=\{inline\} density="compact">/);
    expect(PD, 'keepViewport 를 근거 없이 다시 켰다 — 실측으로 0.0153 의 흔들림만 더한다(위 주석)')
      .not.toMatch(/keepViewport/);
    expect(PD, '스와이프 닫기를 다시 껐다 — 오너가 살리라고 한 모션이다').not.toMatch(/dragToClose=\{false\}/);
    expect(PD).not.toMatch(/inline \? 'sheet' : 'page'/);
  });
  it('🔴 Modal: read 폭이 문자열 리터럴이고, page 그립은 bodyDrag 일 때만 그린다', () => {
    expect(MODAL).toMatch(/read: 'max-w-\[46rem\]'/);
    expect(MODAL).toMatch(/\{bodyDrag && \(\s*<div aria-hidden className="lg:hidden absolute top-1\.5/);
    expect(MODAL).toMatch(/const bodyDrag = resolveBodyDrag\(variant, dragToClose\);/);
    expect(MODAL).not.toMatch(/dragToClose = false, density/);
    // page 헤더가 compact 를 읽는다(sheet compact 와 같은 문법)
    // UI-Aura(2026-09-14): compact 헤더는 surface-mid, 그 외는 surface-base — 값 자체는 readingSurface.contract.test.ts 가 본다.
    const i = MODAL.indexOf("if (variant === 'page') {");
    expect(MODAL.slice(i, i + 3000)).toMatch(/compact \? 'px-3 py-1 bg-surface-mid' : 'px-4 h-header-h bg-surface-base'/);
  });
});

describe('UI-04 · 이전/다음 배선', () => {
  it('🔴 §7.4 순서 의존 쌍 — finally stale 가드 + 리셋 effect 의 busy 해제가 둘 다 있다', () => {
    expect(PD).toMatch(/finally \{ if \(currentPostIdRef\.current === startId\) setBumpBusy\(false\); \}/);
    expect(PD).toMatch(/setBumpBusy\(false\); setNavBusy\(false\); setNavErr\(null\);/);
    // 응원 삭제(2026-09-15) 뒤에도 끌올·이동 두 갈래는 남는다 — 응답 적용도 현재 글 대조 뒤에.
    expect((PD.match(/if \(currentPostIdRef\.current !== startId\) return;/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // 삭제한 기능이 되살아나면 이 계약이 먼저 말한다(되살리려면 위 쌍도 같이 되살려야 한다).
    expect(PD).not.toMatch(/setCheerBusy|sendCheer|getCheerState/);
  });
  it('🔴 훅은 `if (!post) return null` 위에 있고, 이동 뒤 늘어난 ctx 를 onNavigate 로 올린다(라이브락 방지)', () => {
    expect(PD.indexOf('const neighbors = useMemo(')).toBeLessThan(PD.indexOf('if (!post) return null;'));
    expect(PD.indexOf('const [navBusy, setNavBusy]')).toBeLessThan(PD.indexOf('if (!post) return null;'));
    expect(PD).toMatch(/const grown = appendPage\(nav, page\);[\s\S]{0,300}onNavigate\(n2\.next\.post, grown\)/);
    expect(PD).toMatch(/if \(dir !== 'next' \|\| side\.edge !== 'more' \|\| !canExtend\(nav\)\) return;/);
    expect(PD).toMatch(/<CommentThread\s+key=\{post\.id\}/);
  });
  it('🔴 CommunityTab: 실제 화면 배열·커서·done 스냅샷을 넘기고 광고 클릭도 같은 경로, 2-pane 도 같은 스냅샷', () => {
    expect(COMM).toMatch(/const openWithNav = \(p: CommunityPost\) => onSelectPost\(p, \{[\s\S]{0,200}items: listSource, cursor: serverCursor, done: serverDone,/);
    expect(COMM).not.toMatch(/onClick=\{\(\) => onSelectPost\(/);
    expect((COMM.match(/onClick=\{\(\) => openWithNav\(/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(COMM).toMatch(/onSelectPost=\{isDesktop \? selectBoard : onSelectPost\}/);
    expect(COMM).toMatch(/nav=\{boardNav\}\s+onNavigate=\{selectBoard\}/);
  });
  it('🔴 App: 삭제는 스냅샷에서 그 글만 빼고(무조건 null 금지), 닫을 때 맥락을 비운다', () => {
    expect(APP).toMatch(/setOpenPost\(\(cur\) => \(cur\?\.id === id \? null : cur\)\);\s*setPostNav\(\(n\) => dropFromCtx\(n, id\)\);/);
    expect(APP).not.toMatch(/setOpenPost\(\(cur\) => \(cur\?\.id === id \? null : cur\)\);\s*setPostNav\(null\)/);
    // 2026-09-17 연결 감사 C: closePost 가 '내 정보' 복귀(postMeReturnRef)를 얻었다 — 맥락 비우기는 그대로 한 문장이다.
    expect(APP).toMatch(/const closePost = useCallback\(\(\) => \{[\s\S]{0,200}?setOpenPost\(null\); setPostNav\(null\);[\s\S]{0,120}?\}, \[\]\);/);
    expect(APP).toMatch(/useBackClose\(openPost !== null, closePost, ADOPT\);/);
    expect(APP).toMatch(/nav=\{postNav\}\s+onNavigate=\{openPostWithNav\}\s+onClose=\{closePost\}/);
  });
});
