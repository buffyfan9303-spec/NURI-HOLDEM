-- 20260925a — 오너 2026-09-25 결정 2건 (✅ 운영 적용 완료, nuri-lead)
--
-- ① 카카오디벨로퍼스 재심사 대비: 로티아레나 출석 이벤트를 **일시 숨김**(삭제 아님).
--    오너 조건: "내가 살리라고 하면 바로 다시 살려야 해" → 아래 [복구] 두 줄이면 즉시 원상태.
--    - event_campaigns 07f905c7…: 관리자 RPC admin_set_event_campaign_hidden(true) 로 숨김(비로그인 event_board = null 확인).
--    - home_banners 56f96b08…(홈 첫 배너 '로티아레나 출석 이벤트'): active=false (라이브 홈에서 사라진 것 확인).
--    친구 초대 문구('이벤트 참여권 1장씩', 내 정보 안)는 건드리지 않았다.
--
-- ② 연합 리그 초대 알림 끔: 안내하는 화면('내 매장 → 연합 리그')이 2026-08-26 제거됐다(league_members 0행).
--    트리거를 지우지 않고 **비활성화**만 한다 — 리그를 다시 열 때 enable 로 되살린다.

-- 이 파일은 이미 적용된 조치의 기록이다. 다시 실행해도 결과는 같다.
alter table public.league_members disable trigger trg_league_invite;
update public.home_banners set active = false, updated_at = now() where id = '56f96b08-4c3c-4794-baf2-be82325b6739';
update public.event_campaigns
   set hidden_at = coalesce(hidden_at, now()),
       hidden_reason = coalesce(hidden_reason, '카카오디벨로퍼스 재심사 대비 일시 숨김 — 오너 2026-09-25 지시, 요청 시 즉시 복구')
 where id = '07f905c7-c931-435a-82a2-d32a77fe5ac5';

-- [복구 — 오너가 "살려" 하면]
--   update public.home_banners set active = true, updated_at = now() where id = '56f96b08-4c3c-4794-baf2-be82325b6739';
--   update public.event_campaigns set hidden_at = null, hidden_reason = null, hidden_by = null where id = '07f905c7-c931-435a-82a2-d32a77fe5ac5';
--   (관리자 화면에서 켜도 된다: admin_set_event_campaign_hidden(id, false, …))
-- [리그 알림 되살리기]  alter table public.league_members enable trigger trg_league_invite;
