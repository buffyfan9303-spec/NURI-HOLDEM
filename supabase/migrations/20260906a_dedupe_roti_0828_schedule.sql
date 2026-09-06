-- ============================================================================
-- 중복 등록된 일정 1건 비공개 처리 (오너 결정 2026-09-06)
--
-- 무엇: '로티 단독 1000만 GTD' 2026-08-28 회차가 두 행으로 등록돼 목록에 같은 날 같은 제목이 두 번 떴다.
--   두 행은 날짜·시작시각(17:00)·매장·참가비(10만)·프라이즈풀(1000만)·블라인드 구조까지 동일하다.
--
-- 어느 쪽이 정본인가(실측 근거, 2026-09-06 조회):
--   · 이 대회는 4회차(8/27·8/28·8/29·8/30) 시리즈다. 8/27·8/29·8/30 세 행은 전부
--     owner_id = 7e435684(= venues.owner_id, 매장 소유 계정)이고 2026-08-26 에 한꺼번에 등록됐으며
--     grade='daily' · address · side_events 를 갖고 있다.
--   · 남길 행 ccad91f4-d748-44e2-a0ae-62bb63cf113a — 그 시리즈와 같다(같은 계정·같은 날 등록·같은 필드 구성).
--   · 내릴 행 71a2cf66-7e87-490a-bd97-79d49df45d4e — owner_id = c8e3734d(매장 소유 계정이 아니고
--     venue_owners 에도 없다), 하루 뒤인 08-27 에 따로 등록됐고 grade·address·side_events 가 비어 있다.
--
-- 딸린 데이터(양쪽 모두 0건이라 손실되는 사용자 기록이 없다):
--   schedule_reservations 0 · schedule_likes 0 · ledger_sessions 0 · comments 0.
--   notifications 링크만 내릴 행을 2건 가리킨다 → 그 알림은 '확인할 수 없습니다'로 안내된다(F09 수정분).
--
-- 왜 DELETE 가 아니라 approved=false 인가:
--   원본 데이터를 지우지 않는다는 보존 원칙(개발 지시서 §1). 공개 목록·탐색·홈에서는 사라지고
--   행은 남아 언제든 되돌릴 수 있다. 조회수 71 을 포함한 모든 값이 보존된다.
--
-- 롤백(같은 관리자 클레임 아래에서):
--   update public.schedules set approved = true where id = '71a2cf66-7e87-490a-bd97-79d49df45d4e';
-- ============================================================================

-- ⚠ schedules.approved 는 트리거 prevent_self_approve_poster 가 **관리자만** 바꾸도록 지키고 있다
--   (비관리자 경로에서는 조용히 old 값으로 되돌린다). 그 가드를 끄거나 우회하지 않고,
--   DB 가 자기 규칙을 관리자 신원으로 평가하도록 클레임을 세운 뒤 실행한다.
--   c8e3734d = profiles.role='admin'(나누리, 이 저장소 오너 계정) — 오너가 2026-09-06 에 이 정리를 승인했다.
-- 알림 부작용 없음: notify_followers_on_poster·notify_on_schedule_approved 는 approved 가 **true 가 될 때만**
--   발화한다(false 로 내리는 이 문장은 알림을 만들지 않는다). 롤백 트랜잭션에서 실측 확인(알림 생성 0건).
select set_config('request.jwt.claims', '{"sub":"c8e3734d-028d-4b69-86c9-a6d75c36601c","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'c8e3734d-028d-4b69-86c9-a6d75c36601c', true);

update public.schedules
   set approved = false,
       updated_at = now()
 where id = '71a2cf66-7e87-490a-bd97-79d49df45d4e'
   and approved = true;
