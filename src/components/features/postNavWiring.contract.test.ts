// UI-02·UI-04 배선 계약 (2026-09-13) — 실화면·동작은 e2e/post-nav.spec.ts · lib/postNav.test.ts · atoms/modalBodyDrag.test.ts 가 잰다. 여기는 배선만.
//
// 이 파일이 보는 것
//   1. PostDetailModal 이 page 셸 + read 폭 + dragToClose={false} + compact 로 열리고, `inline ? 'sheet' : 'page'` 분기가 없다.
//   2. Modal 의 page 그립은 bodyDrag 일 때만 그린다.
//   3. §7.4 순서 의존 쌍: cheer/bump 의 finally stale 가드와 리셋 effect 의 setCheerBusy(false)/setBumpBusy(false) 가 **둘 다** 있다
//      (하나만 있으면 유료 버튼 2종이 영구 disabled 로 굳는다).
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
  it('🔴 PostDetailModal: page + read 폭 + dragToClose=false + compact, inline 분기 없음', () => {
    expect(PD).toMatch(/<Modal open=\{open\} onClose=\{onClose\} title="커뮤니티 게시판" maxWidth=\{inline \? '2xl' : 'read'\} variant="page" inline=\{inline\} density="compact" dragToClose=\{false\}>/);
    expect(PD).not.toMatch(/inline \? 'sheet' : 'page'/);
  });
  it('🔴 Modal: read 폭이 문자열 리터럴이고, page 그립은 bodyDrag 일 때만 그린다', () => {
    expect(MODAL).toMatch(/read: 'max-w-\[46rem\]'/);
    expect(MODAL).toMatch(/\{bodyDrag && \(\s*<div aria-hidden className="lg:hidden absolute top-1\.5/);
    expect(MODAL).toMatch(/const bodyDrag = resolveBodyDrag\(variant, dragToClose\);/);
    expect(MODAL).not.toMatch(/dragToClose = false, density/);
    // page 헤더가 compact 를 읽는다(sheet compact 와 같은 문법)
    const i = MODAL.indexOf("if (variant === 'page') {");
    expect(MODAL.slice(i, i + 3000)).toMatch(/compact \? 'px-3 py-1' : 'px-4 h-header-h'/);
  });
});

describe('UI-04 · 이전/다음 배선', () => {
  it('🔴 §7.4 순서 의존 쌍 — finally stale 가드 + 리셋 effect 의 busy 해제가 둘 다 있다', () => {
    expect(PD).toMatch(/finally \{ if \(currentPostIdRef\.current === startId\) setCheerBusy\(false\); \}/);
    expect(PD).toMatch(/finally \{ if \(currentPostIdRef\.current === startId\) setBumpBusy\(false\); \}/);
    expect(PD).toMatch(/setCheerBusy\(false\); setBumpBusy\(false\); setNavBusy\(false\); setNavErr\(null\);/);
    // 응답 적용도 현재 글 대조 뒤에
    expect((PD.match(/if \(currentPostIdRef\.current !== startId\) return;/g) ?? []).length).toBeGreaterThanOrEqual(3);
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
    expect(APP).toMatch(/const closePost = useCallback\(\(\) => \{ setOpenPost\(null\); setPostNav\(null\); \}, \[\]\);/);
    expect(APP).toMatch(/useBackClose\(openPost !== null, closePost, ADOPT\);/);
    expect(APP).toMatch(/nav=\{postNav\}\s+onNavigate=\{openPostWithNav\}\s+onClose=\{closePost\}/);
  });
});
