# 커뮤니티 심층 조사 — 기능·경합·모션 (community-team, 읽기 전용)

- 요구 키: 오너 채팅 2026-09-29 "커뮤니티까지 기능적인 문제, 모션 등 모든 문제 전부 해결 — 실측까지"
- 기준 코드: HEAD `98b7e55c` + 조사 시작 시점의 미커밋 홈 파일 4개. 조사 중 다른 팀이 `8241385d`·`ed09bbf8` 을 커밋했지만 **커뮤니티 파일은 바뀌지 않았다**(`git diff --stat 98b7e55c HEAD`로 확인)
- 제품 소스 수정 0. 운영 DB 는 읽기 쿼리와 `DO … raise exception` 롤백 리허설 1회만 썼다. 운영 쓰기 0: 하네스가 GET 이 아닌 요청을 전부 목으로 받았다
- 격리 빌드: `scratchpad\cm\wt`(robocopy 사본, `supabase/` 포함, node_modules 는 junction) → `vite build`(exit 0) → `vite preview :4391`(끝낸 뒤 종료함)
- 워크트리 `public/sitemap.xml` 해시: 조사 전후 모두 `5b5953aa…` 로 같다
- 하네스: `scratchpad\cm\*.cjs`
  - `common.cjs`: 스텁 로그인. 프로필은 목으로 주고, 공개 읽기에서는 서명 없는 토큰 헤더를 빼 anon 으로 통과시킨다. 누름은 CDP 터치 홀드로 한다
  - `fake.cjs`: 합성 게시판 80글. PostgREST 커서·검색 필터를 흉내 낸다
- 모바일 390×844 · 412×915(Pixel 계열 UA, 터치)와 PC 1280×900 에서 쟀다. CPU 스로틀은 항목에 따로 적었다

## 반복 수정 이력 (git log, 커뮤니티 4파일 60커밋)

| 부류 | 커밋 수(대략) | 대표 커밋 | 이번 조사에서 |
|---|---|---|---|
| 서브탭 알약 모션·첫 칸 튐 | 7 | 73f51799 · c7ae221c · 4e8a0ab2 · d386a74e · 8459d2c4 | **재발 없음**(아래 통과 표) |
| 실패를 '없음'으로 위장 | 5 | c47bc96c · 6574d98f · efe434f3 · 1516e2ed | **딜러 섹션에 1곳 남음**(C-7) |
| 상세 늦은 응답·경합 | 4 | fca3edac · 2026-09-12 N04/N05 · 189b4d65 | **PC 2단 닉네임 색 1곳 남음**(C-6) |
| 차단·숨김 누수 | 3 | d0697c54 · 2bda7ec6 · 07766a44 | **새 누수 2곳**(C-1, C-3) |
| 게시판 목록·검색 커서 | 3 | 1a043aea · N06 · board-search-race | 커서는 정상. **무한 스크롤이 30건에서 멈춤**(C-2) |
| 상세 레이아웃·밀도·모션 | 10+ | 4f677a9a · 9d3e4af0 · ecfa0fcb · 79f434bd | 번쩍임·스크롤 복원 통과 |

---

## 결함 (심각도순)

### C-1 [중상] 차단한 사람의 글이 목록 끝과 검색 결과에 다시 나온다 — 재발 부류(차단 누수)

- **재현**: 로그인한 상태에서 합성작성자5와 합성작성자70을 차단한다(`user_blocks` 목). 게시판을 끝까지 스크롤한다
- **측정**(`social.cjs`)
  - 첫 화면 15건에는 '합성글 05'가 없다. 로컬 필터는 정상이다
  - 끝까지 내리면 **'합성글 05'가 48번째 자리에 다시 선다**
  - 로컬 50건 밖의 '합성글 70'도 보인다
  - '합성글 70'을 검색하면 그 글이 결과로 나온다
- **원인**
  - `CommunityTab.tsx:116-119` 는 App 이 준 50건(`rawPosts`)에만 차단·숨김 필터를 건다
  - 서버 이어받기(`searchPosts`, `CommunityTab.tsx:761`)로 받은 `serverExtra` 는 `listSource`(`:732-737`)에서 id 중복만 거르고 그대로 붙인다
  - 로컬에서 빠진 차단 글은 '처음 보는 id' 라서 오히려 통과한다
  - 상세의 이전/다음 스냅샷(`items: listSource`)과 `appendPage` 도 같은 목록을 쓰므로, 차단한 사람 글로 이동할 수 있다
- **최소 수정**: `listSource` 를 만들 때 serverExtra 에도 같은 판정을 건다. 판정 함수는 한 벌만 두어 FeedSection 에 prop 으로 넘긴다(`!isBlocked(p.userId) && !isPostHidden(p, user)`). 상세 `neighborsOf` 의 필터에도 isBlocked 를 더한다
- **참고**: 숨김(blinded) 글은 운영 RLS 가 남에게 주지 않아서 실제로는 새지 않는다(목에서만 재현). 차단은 클라이언트 필터가 유일한 방어라 실제로 샌다

### C-2 [중상·잠재] 게시판 무한 스크롤이 30건에서 멈춘다 — '불러오는 중…'이 영원히 떠 있다

- **재현**: 글이 31건 이상일 때 게시판을 끝까지 스크롤한다. 운영 글은 7건(숨김 3건)이라 **지금은 안 보이지만**, 글이 16건을 넘으면 바로 나타난다
- **측정**(`paging2.cjs`, 390)
  - 한 번 더 불러와 31행이 된다
  - 이후 6회 연속 끝까지 스크롤해도 31행 그대로다
  - 센티넬 버튼은 화면 안 top=249 에 '불러오는 중… (20개 남음)' 으로 계속 떠 있다
  - 손으로 버튼을 누르면 더 불러온다
- **원인**: `CommunityTab.tsx:1041-1046`
  - IntersectionObserver 가 `[onMore]` 에만 묶여 있다. onMore 는 `useCallback([])` 이라 한 번 만든 관찰자를 끝까지 쓴다
  - 더 불러온 뒤에도 센티넬이 rootMargin 200px 안에 머물면 '교차 시작' 이벤트가 다시 오지 않는다. 푸터가 길어서 스크롤을 끝까지 내리면 늘 이 상태가 된다
- **최소 수정**: 의존성에 `remain` 을 넣는다(`}, [onMore, remain]);`). 관찰자를 새로 만들면 첫 콜백이 현재 교차 상태로 한 번 오므로 연쇄 로드가 된다. 라벨도 실제 동작에 맞게 '더 보기'로 바꾸는 편이 정직하다
- 검색 서버 커서와 타이핑 경합은 정상이다(아래 통과 표)

### C-3 [중] 실시간 한 줄(live_wall)에 차단한 사람의 줄이 그대로 보인다

- **측정**(`live.cjs`): 합성작성자5를 차단해도 `한줄 5` 가 목록에 남는다
- **원인**: `CommunityTab.tsx:1467-` `LiveWallSection` 에 `useBlocks` 가 없다. 게시글·댓글·장터에는 차단 필터가 있다
- **최소 수정**: 렌더 직전에 `messages.filter(m => m.userId === user?.id || !isBlocked(m.userId))` 를 건다. 본인 줄은 숨기지 않는다(CommentThread 규칙과 같다)
- **같은 부류(측정 안 함, 코드만 확인)**: `DealerCommunity.tsx`·`GroupPage.tsx`·`CommunityShoutBar.tsx` 에도 `useBlocks` 호출이 0곳이다

### C-4 [중] 서버가 거절한 이유(12초 제한·제재·금칙어)가 글쓰기·한 줄·신고·딜러 글에서 '실패했습니다' 한 줄로 바뀐다

- **측정**
  - 글쓰기(`write.cjs`): 서버가 `P0001 게시글은 12초에 한 번만…` 을 돌려주는데 토스트는 **'게시글 등록에 실패했습니다'** 가 뜬다. 입력은 남는다(보존은 정상)
  - 한 줄(`live.cjs`): `P0001 …5초에 한 번만…` → 토스트는 **'전송에 실패했습니다'**
  - 대조군 댓글(`social.cjs`): 같은 P0001 이 **'댓글은 5초에 한 번만 작성할 수 있습니다.'** 로 그대로 나온다. api 가 `new Error` 로 감싸기 때문이다(`community.ts:373`)
- **원인**
  - supabase-js 가 돌려주는 `{error}` 는 `Error` 인스턴스가 아닌 평범한 객체다. 번들의 `PostgrestError extends Error` 는 throwOnError 경로에서만 쓰인다
  - 그래서 `throw error` 를 받은 호출부의 `err instanceof Error` 판정이 거짓이 되어 기본 문구로 떨어진다
  - 해당 자리: `community.ts:461`(addPost) · `:531`(addLiveMessage) · `:904`(createDealerPost) · `reports.ts:29`(신고, `신고는 10초에 한 번만` 이 사라진다)
  - `community.ts` 전체에 `throw error` 류가 47곳 있다. 제재 트리거 `require_active_author` 가 posts·live_wall·dealer_posts·group_posts 에 걸려 있어서, **정지된 회원은 왜 막혔는지 모른 채 재시도한다**(20-team-community.mdc 함정 4번과 같은 결과)
- **최소 수정**: 댓글과 같은 판정을 api 한 곳의 헬퍼로 뽑는다. 예: `toUserError(error, fallback)` 은 `code==='P0001'` 이면 서버 문장을, 아니면 기본 문구를 쓴 `Error` 를 만든다. 위 네 곳의 `throw error` 를 이것으로 바꾼다. 호출부는 건드리지 않는다
- **부수 관찰**
  - `togglePostLike`(`community.ts:473`)는 반대로 `new Error(error.message)` 라서 **모든 서버 원문이 그대로 토스트된다**. 목으로 'boom' 을 넣으면 그대로 보인다(보안표준 6에 주의)
  - 사진을 올린 뒤 본문 저장이 실패하면 업로드 1건이 고아로 남는다. 다시 누르면 또 올린다(`write.cjs` photoFail: uploads 1, 본문 실패)

### C-5 [중] 좋아요 연타 — 화면과 서버가 어긋난 채 남고, 되돌림 깜빡임이 보인다

- **측정**(`like.cjs`, 카드 보기, 60ms 간격 2연타, `toggle_post_like` 는 상태를 가진 목)

  | 시나리오 | 화면 궤적 | 최종 화면 | 서버 최종 |
  |---|---|---|---|
  | 응답 역순(900/100ms) | F1→T2→F1→**T2**(1072ms) | **true/2** | **false/1** ← 불일치 |
  | 순서대로(400/400) | F1→T2→F1→T2→F1 | false/1 | false/1(두 번 되돌림 깜빡임) |
  | 첫 요청 실패 | F1→T2→F1→T2 | true/2 | true/2(두 번 눌렀는데 '좋아요' 로 끝남) + 서버 원문 토스트 |
- **원인**
  - `App.tsx:3384-3396` `handleLikePost` 는 서버 토글(비멱등)을 비행 중 가드 없이 보낸다
  - 응답이 올 때마다 '서버 권위값'으로 덮어쓰는데, 먼저 보낸 요청의 늦은 응답이 최신 상태를 덮는다
  - 실패하면 `apply(flip)` 이 **현재** 상태를 뒤집어서 스냅샷 복원이 아니다
- **최소 수정**: 글마다 요청 번호를 둔다(`likeSeqRef[postId]`). 가장 마지막 요청의 응답만 반영한다. 실패하면 그 글만 서버에서 다시 읽거나, 누르기 전 스냅샷으로 되돌린다. 연타를 막으려면 비행 중에는 누름을 무시한다
- 추천/비추천(`PostDetailModal.tsx` `react`)은 upsert/delete 가 멱등이라 응답 역순에서도 화면이 맞았다(`detail.cjs`: F0→T1→F0→F0). 대신 가드도 없다

### C-6 [하~중] PC 2단 상세에서 글 A 작성자의 닉네임 색이 글 B 작성자에게 칠해진다(늦은 응답)

- **재현**(`detail.cjs`, 1280)
  1. A 를 누르고 150ms 안에 B 를 누른다
  2. A 작성자의 `get_nick_colors` 응답이 1.5초 늦게 도착한다(`rose`)
- **측정**: B 작성자 이름의 색이 처음엔 기본색 rgb(244,246,250)이었다가, 2.2초 뒤 **rgb(255,122,138) rose** 로 바뀐다
- 모바일(열고 닫고 다시 열기)에서는 재현되지 않았다. 댓글은 `active` 가드가 있어서 B 댓글만 보였다(통과)
- **원인**: `PostDetailModal.tsx:260-267` 이펙트에 `active` 가드가 없다. `getEquippedMarks`(마크 이모지)도 같은 자리에 있어 같은 부류다
- **최소 수정**: 같은 이펙트에 `let active = true; … return () => { active = false; }` 를 넣는다(바로 아래 댓글 이펙트와 같은 모양)

### C-7 [중] 딜러 섹션 목록 조회가 실패하면 '아직 글이 없습니다'가 뜬다 — 재발 부류(실패 위장)

- **측정**(`dealer.cjs`): `GET dealer_posts` 가 500 을 돌려주면 판에 '아직 글이 없습니다. 첫 구인·구직 글을 남겨보세요.' 가 뜨고 재시도 버튼이 없다
- **원인**: `DealerCommunity.tsx:75` `getDealerPosts().then(setPosts).catch(() => {})`. api 는 제대로 던지는데(`community.ts:878`) 컴포넌트가 삼킨다
- **최소 수정**: 공지와 같은 모양으로 한다(`:57` noticesErr). `postsErr` 상태를 두고 `LoadErrorCard` 와 재시도를 보여 준다
- 같은 부류(코드만 확인): `BlockContext` → `getMyBlockedIds` 가 조회 실패 시 빈 집합을 돌려준다(`blocks.ts:22`). 이때는 조용히 차단이 풀린다

### C-8 [하] 섹션을 오갈 때마다 실시간 한 줄을 다시 조회한다(숨길 때도)

- **측정**(`live.cjs`): 게시판→실시간 한 번 왕복에 `GET live_wall` 이 2번 나간다(총 4번)
- **원인**: `CommunityTab.tsx:1477-1489` 이펙트가 `[visible]` 에 묶여 있어서 숨길 때도 전체를 다시 조회한다. 그 응답이 도착하면 목록을 통째로 교체하므로, 그 사이 실시간으로 받은 줄을 덮을 수 있는 틈이 있다(운영에서는 좁다)
- **최소 수정**: 조회는 마운트 때 1회만 하고, `visible` 에는 구독만 묶는다. 다시 보일 때 받아 오는 것이 필요하면 받은 결과를 병합한다(id 로 중복 제거)

### C-9 [하] 헤더가 접힌 뒤 섹션 탭 누름 높이가 39px

- **측정**(`hit.cjs`, 390): 스크롤 0 에서는 6칸 모두 44/44px 가 이 버튼에 닿는다. 스크롤 400(헤더 60.5→47.8 접힘)에서는 **39/44px**. 위쪽 5px 를 헤더가 덮는다
- **원인**: `CommunityTab.tsx:371` 서브바 sticky top 이 `header-now - 0.5rem` 이라 버튼 위쪽이 헤더 밑으로 들어간다. 시각 알약(32px)은 온전하다
- **최소 수정**: 버튼 윗부분이 헤더와 겹치지 않게 한다. sticky 오프셋을 −0.5rem 대신 −(pt) 만큼으로 하거나, 버튼 위쪽 여백을 줄여 겹친 만큼 돌려준다. 칩 44px 기억(2026-09-21 "헤더가 덮는다 z-10")과 같은 부류다

### C-10 [하] 섹션 탭에 선택 상태가 없고 포커스 표시가 지워져 있다

- **측정**(`rapid.cjs`): 선택된 섹션 버튼에 `aria-pressed`·`aria-selected`·`aria-current` 가 **하나도 없다**. 스크린리더는 지금 어느 섹션인지 모른다
- **원인**: `CommunityTab.tsx:517-553` `SectionTab`. `focus-visible:ring-0 focus:outline-hidden` 이라 PC 키보드 포커스도 보이지 않는다
- **최소 수정**: `aria-pressed={active}` 한 줄을 넣는다. 포커스는 span 알약에 `group-focus-visible` 링을 둔다

### C-11 [하·문구] 쪽지 실패 안내가 아직 "본인인증을 완료했는지" 라고 말한다

- 운영 `_can_message` 에는 본인인증 조건이 **없다**(쿼리로 확인: 로그인·자기 아님·수신자 active·차단 없음). 오늘 커밋 `8241385d` 의 서버 해제와 맞다
- 화면 문구 `NotificationPanel.tsx:227` 만 옛 조건을 말한다. 실제 거절 사유(상대가 탈퇴·정지, 차단 관계)로 바꿔야 한다. home-team 소유 파일이라 **보고만 한다**

### C-12 [하·테스트] `community.searchPosts.test.ts` 5건 실패는 제품 결함이 아니라 테스트 결함이다 — `.env` 부재 탓으로 확정

- 워크트리에서 그냥 돌리면 5 실패 / 2 통과. 더미 값(`VITE_SUPABASE_URL=http://x.invalid VITE_SUPABASE_ANON_KEY=dummy`)만 주면 **7/7 통과**
- **원인**: `searchPosts` 가 `import.meta.env.VITE_SUPABASE_URL` 이 없으면 목 분기로 간다(`community.ts:650`). 테스트가 `vi.stubEnv` 를 하지 않는다
- 이웃 테스트 `community.getPostById.test.ts:8-9`·`mockReads.test.ts:38` 은 stubEnv 를 한다. CI 는 시크릿이 주입돼서 통과해 왔다
- **최소 수정**: 테스트 머리에 `vi.stubEnv('VITE_SUPABASE_URL','https://example.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY','anon');` 두 줄을 넣는다(import 전에)

### 관찰(결함 아님, 기록)

- **섹션 첫 방문 반응 지연**: CPU×4 에서 '게시판'을 처음 누르면 알약이 **touchStart 뒤 721ms**(손 뗀 뒤 약 560ms)에 움직이기 시작한다. 재방문은 290~400ms 다. 첫 FeedSection 마운트 비용으로 보인다
- **Modal 주석과 실제 동작이 다르다**: `Modal.tsx:95-101` 주석은 "게시글만 dragToClose=false" 라고 하는데, `PostDetailModal.tsx:504` 는 dragToClose 를 넘기지 않아서 **끌어 닫기가 켜져 있다**. 동작 자체는 안전하다: 본문이 스크롤된 상태에서 아래로 끌면 닫히지 않고 본문이 스크롤된다(아래 통과). 주석을 고치거나 의도를 오너 결정에 올린다
- **iOS Safari 에는 스크롤 앵커링이 없다**: 실시간 새 글이 들어오면 Chrome 은 앵커 행을 제자리에 두지만(아래 통과), Safari 에서는 새 글 높이만큼(3건 ≈ 132px) 목록이 밀릴 것으로 **추정한다. 재지 못했다**

---

## 통과 (수치)

| 항목 | 조건 | 결과 |
|---|---|---|
| 글쓰기 로그인만(본인인증 미요구) — 화면 | 스텁 로그인·`verified_at=null` | 글쓰기 시트가 바로 열린다. `App.tsx:3877` 은 `ensureLogin` 만 부른다 |
| 글쓰기 로그인만 — 서버 | 운영 `posts_insert` 정책 · 트리거 7종 | `auth.uid() is not null and user_id=auth.uid()`. 트리거에 verified/ci_hash 조건 0곳(`prosrc` 검색) |
| 등록 연타 | 40ms 간격 2회 | POST 1건 |
| 실패 시 입력 보존 | 12초 제한 거절 | 제목·본문이 남고 시트가 유지된다 |
| 댓글·답글 | 목 저장 | 댓글·답글 모두 즉시 뜬다. `parent_id` 가 실려 간다. P0001 거절은 서버 문장 토스트 + 입력 보존 |
| 신고→자동 숨김(서버) | 운영 롤백 리허설: 서로 다른 신고자 3명 | `before=false → after=true`, 신고자에게 보이는 행 0. 예외로 롤백해 운영 변경 0 |
| 검색 서버 커서 | 합성 80글, '합성글 7' | 로컬 50건 밖의 70~79 10건을 찾는다 |
| 검색 타이핑 경합 | 짧은 검색어 응답을 1.5초 늦춤, 60ms 간격 5타 | 최종 '합성글 6' 결과 60~69 만 남는다. 옛 응답이 덮지 않는다. 상태 `done` |
| 상세 A→B(모바일) | A 댓글 1.5초 지연 | B 댓글만 보인다(늦은 A 응답 무시) |
| 섹션 알약(CDP 터치 홀드 160ms) | 390·412, CPU×4, 스크롤 0·250, 9회 이동 × 3조건 | **궤적 이탈 0프레임**(첫 칸 튐 재발 없음). 정착 오차 −0.5~+0.2px, 폭 오차 ≤0.3px |
| 섹션 연타 | 60·150ms 간격, 2~4연속 × 4세트 | 8/8 마지막 탭에 도착. 보이는 판 1개, 알약이 그 탭 위. history 증가 0 |
| 상세 열기/닫기 번쩍임 | 390, CPU×4, screencast 휘도 | 열기 과도 0 · 닫기(X·뒤로가기·끌기) 과도 최대 −1.51(기준 ±8) |
| 닫기 3경로 + 끌어 닫기 후 목록 위치 | 목록 scrollY 700 | X·뒤로가기·끌기 모두 700 → 700 |
| 본문 스크롤 중 끌기 | 긴 본문 scrollTop 150 에서 아래로 300px | 닫히지 않고 본문만 0 으로 스크롤 |
| 실시간 새 글 도착(Chrome) | 가짜 Realtime 소켓으로 INSERT 주입, scrollY 700 | 700ms 디바운스 뒤 재조회. 앵커 행 위치 변화 **0px**(scrollY 700→832 로 브라우저가 보정) |
| 헤더 접힘과 스크롤 | 20px씩 40회 내렸다 올림 | scrollY 역행 0 · 헤더 높이 진동 0 · 레일 점프 0. 헤더 60.5→47.8 한 번에 접힌다 |
| 섹션 스모크 | 390·1280, 운영 읽기 | 6섹션 오류 카드 0 · pageerror 0 · 가로 넘침 0. 가로챈 쓰기는 일일 점수 RPC 2종뿐 |
| 기존 e2e 10종 | 격리 빌드 :4391 | **47 통과 · 12 건너뜀 · 0 실패**. 대상: community-ads · shout-queue · nuri-spot-board · ad-click-paths · drag-close · post-nav · board-search-race · pill-press · subtab-motion · write-guard |

## NOT_RUN

- **실제 로그인 쓰기**(운영 금지): 모든 쓰기는 목으로 재현했다. 서버 판정은 정책·트리거 읽기와 롤백 리허설 1회로만 확인했다
- **그룹 페이지**(채팅·게시판·활동순위): 운영에 공개 그룹 데이터가 없고 합성 목도 만들지 않았다. 차단 필터 없음은 코드로만 확인했다
- **외치기 구매·스팟 공유**: 기존 e2e(shout-queue 3건, nuri-spot-board 7건)가 목으로 통과했다. 이번에 새로 재지는 않았다
- **쪽지 전송**: 서버 정책은 확인했다(C-11). 화면 전송은 측정하지 않았다
- **사진 업로드 실제 저장소**: 목 업로드만 했다(업로드 1건 → 본문 실패 → 고아 파일)
- **iOS Safari·삼성 인터넷 실기기**: 스크롤 앵커링 부재와 합성층 번쩍임은 headless 로 재현할 수 없다. 재현 못 함 ≠ 없음
- **CDP `synthesizeScrollGesture`(touch)**: headless 에서 스크롤이 일어나지 않아 JS 스크롤로 대신했다
- **12건 건너뜀 e2e**: 로그인 계정이 필요한 스펙(E2E 계정 은퇴)

## 다음 한 단계 (제안 · 리드 배정용)

1. C-1·C-3(차단 누수)과 C-2(무한 스크롤)는 **CommunityTab.tsx 한 파일**이다
   - 편집자 1명(community-team, Sonnet 충분)이 맡는다
   - 음성 대조: `social.cjs`(idx05=-1 기대)와 `paging2.cjs`(80행 도달 기대)를 수정 전후로 돌린다
2. C-4(서버 거절 사유)는 `src/api/community.ts`(공용 파일)와 `reports.ts` 라서 **리드의 영향 분석 뒤** 편집한다. `write.cjs`·`live.cjs` 토스트 문장으로 확인한다
3. C-5(좋아요)는 `App.tsx`(home-team 공용)다. 리드가 편집자를 지정한다. `like.cjs` reorder 에서 finalUi 가 서버와 같아지는지로 확인한다
4. C-6·C-7·C-8·C-10·C-12 는 각 한두 줄짜리 수정이다. C-11 은 home-team 에 넘긴다
