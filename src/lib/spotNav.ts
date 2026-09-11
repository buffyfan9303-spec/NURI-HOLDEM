// src/lib/spotNav.ts — 스팟에서 게시판으로 건너가는 길
//
// 오너 지시(2026-09-11): "스팟 토론은 커뮤니티 게시판 쪽으로 보내 게시판 글이 더 많을 수 있도록",
// "스팟 공유하면 이걸 게시판으로 넘어가게".
//
// ⚠ 이벤트 이름을 지어내면 안 된다. 앱이 실제로 듣는 것만 쓴다:
//     nuri:goto-tab          App.tsx            탭 전환
//     nuri:community-section CommunityTab.tsx   서브탭(게시판) 지정
//     nuri:open-post         App.tsx            글 상세 열기(pendingPostId)
//   예전 코드가 쏘던 'nuri:open-tab' 은 **리스너가 없어 버튼이 죽어 있었다**(2026-09-11 grep 확인).
//   새 이름을 추가할 때는 반드시 App 쪽 리스너를 같은 커밋에서 만든다.

/** 도구 겹을 닫고 커뮤니티 → 게시판까지 데려간다. */
export function gotoBoard(): void {
  const go = () => {
    window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'community' }));
    window.dispatchEvent(new CustomEvent('nuri:community-section', { detail: 'board' }));
  };
  // 도구 겹이 안 떠 있으면 그냥 간다.
  if (!window.location.hash.startsWith('#tool=')) { go(); return; }

  // 도구 겹을 먼저 닫는다 — 안 닫으면 tools pane 이 display:none 으로 숨겨질 뿐
  // 모달이 그대로 살아 있어, 도구 탭으로 돌아왔을 때 남은 겹이 튀어나온다.
  //
  // ⚠ 예전 판은 history.back() 을 쏘고 **다음 rAF** 에 탭을 옮겼다. 그런데 rAF 한 프레임은
  //   popstate 보다 먼저 올 수 있다 — 부하가 걸리면 실제로 그랬다(병렬 e2e 에서 재현).
  //   그러면 뒤늦게 도착한 popstate 가 방금 만든 탭 이동을 되감아, 사용자에겐
  //   '공유했는데 아무 일도 안 일어남' 으로 보인다. 그래서 **popstate 를 기다린다**.
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', fire);
    requestAnimationFrame(go);   // 겹이 닫히는 커밋까지 끝낸 뒤에 옮긴다
  };
  window.addEventListener('popstate', fire);
  window.setTimeout(fire, 400);  // popstate 가 끝내 안 오는 환경 대비(멈추지는 않게)
  history.back();
}

/**
 * 공유 직후 — 게시판으로 넘어가 **방금 올린 글**을 연다.
 *
 * 토스트만 띄우고 도구에 남아 있으면 사용자는 자기 글을 끝내 보지 못하고,
 * 글이 정말 올라갔는지도 알 수 없다(실제로 그랬다).
 *
 * 글 여는 일은 App 의 pendingPostId 경로를 그대로 탄다 — 그 경로에는 목록(최근 50건)에
 * 없을 때 단건 조회로 살리는 폴백이 이미 있고, 방금 만든 글이 바로 그 경우다.
 */
export function gotoBoardPost(postId: string | null): void {
  gotoBoard();
  if (!postId) return;
  // 탭이 붙고 목록이 도착할 시간을 준다 — pendingPostId 는 posts 가 빌 때 한 번 쉬고
  // 다음 렌더에서 다시 본다(App.tsx). 너무 일찍 쏘면 그 한 번을 놓친다.
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('nuri:open-post', { detail: postId }));
  }, 120);
}
