-- 🔴 버그: send_tournament_reminders 가 type='reminder' 를 INSERT 하지만 notif_type enum 에
-- 그 값이 없어 런칭 후 리마인더가 단 한 건도 발송되지 못했다(크론은 돌지만 매번 실패·롤백).
-- enum 값 추가는 '같은 트랜잭션에서 사용 불가' 제약이 있어 함수 재배선(20260817d)과 분리.
-- (라이브 적용: notif_reminder_enum)
alter type public.notif_type add value if not exists 'reminder';
