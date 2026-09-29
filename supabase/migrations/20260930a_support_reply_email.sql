-- 20260930a_support_reply_email.sql — 1:1 문의 답변 메일 중복 발송 방지 표식.
-- ⏳ 미적용 초안(2026-09-30, home-team). 적용은 리드 — nuri-migration 절차(MCP execute_sql → 파일 머리 '✅ 적용 완료 + 실측값').
--
-- 무엇: support_inquiries.answer_emailed_for — 메일로 보낸 답변의 판(= 그때의 answered_at).
--   엣지 함수 support-reply-email 이 이 값을 비교-교환(CAS)으로 선점한 뒤 보낸다
--   (update … where id = $1 and answered_at = $2 and answer_emailed_for is not distinct from $prev).
--   · 같은 판을 두 번 보내지 않는다(더블클릭·재시도·동시 호출).
--   · 답변을 수정하면 answered_at 이 바뀌어 새 판을 한 번 보낸다.
--   · 발송 실패면 함수가 이전 값으로 되돌린다.
-- 왜 시계(now())가 아니라 answered_at 의 사본인가: answered_at 은 관리자 브라우저가 적는다(src/api/support.ts answerInquiry).
--   now() 와 크기 비교를 하면 관리자 PC 시계가 늦을 때 수정본이 영영 안 나간다 — 값 동일성만 본다.
--
-- 영향 범위(실측 2026-09-30 라이브 조회):
--   · 기존 행: 새 컬럼 null → 이미 답변된 옛 문의는 '아직 안 보냄' 이다. 함수는 관리자 화면의 **저장 직후**에만 불리므로
--     옛 문의에 메일이 소급 발송되지 않는다(일괄 발송 경로 없음).
--   · 트리거 trg_notify_inquiry_answered(AFTER UPDATE): status 전환·answer 변경일 때만 알림을 만든다 —
--     이 컬럼만 바꾸는 update 로는 알림이 생기지 않는다(함수 본문 확인).
--   · trg_force_nick 은 UPDATE OF user_id 에만 반응 — 무관.
--   · 권한: 테이블 UPDATE 는 RLS support_update(my_role()='admin') 가 막는다. 관리자가 화면 밖에서 이 값을 지우면
--     같은 답변을 한 번 더 보낼 수 있을 뿐이다(관리자 한정, 받는 사람은 여전히 문의자 본인).
--   · realtime publication 에 이 테이블이 있다 — 표식 갱신이 관리자 목록 새로고침 한 번을 더 일으킨다(무해).
--   · 회원 탈퇴 정리(20260925d)는 행 전체 delete — 무관.

alter table public.support_inquiries
  add column if not exists answer_emailed_for timestamptz;

comment on column public.support_inquiries.answer_emailed_for is
  '답변 메일로 보낸 판(그때의 answered_at). support-reply-email 엣지 함수가 CAS 로 선점한다. null = 아직 안 보냄.';

-- R1(2026-09-30 critical-reviewer 보강) — 문의 **접수** 때 답변·발송 표식을 못 채우게 한다.
--   authenticated 는 테이블 단위 INSERT 권한이라 새 컬럼도 자동으로 쓸 수 있고, 기존 WITH CHECK 는 작성자 본인만 봤다
--   → 문의자가 '답변 완료' 행이나 answer_emailed_for 를 채운 행을 스스로 만들 수 있었다(본인에게만 보이는 기존 틈).
--   기존 조건(라이브 pg_policy 실측 2026-09-30: `(user_id = ( SELECT auth.uid() AS uid))`, permissive, roles = PUBLIC)을 그대로 두고 덧붙인다.
--   ALTER POLICY 는 역할·permissive·USING 을 건드리지 않고 WITH CHECK 만 바꾼다.
--   유일한 접수 경로 src/api/support.ts submitInquiry 는 user_id·user_name·category·title·content 만 넣는다 → 기본값(status 'open', 나머지 null)으로 통과.
alter policy support_insert on public.support_inquiries
  with check (
    user_id = (select auth.uid())
    and status = 'open'
    and answer is null
    and answered_at is null
    and answer_emailed_for is null
  );

-- 자가검사
do $$
declare chk text;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'support_inquiries' and column_name = 'answer_emailed_for') then
    raise exception 'answer_emailed_for 컬럼이 없다';
  end if;
  select pg_get_expr(polwithcheck, polrelid) into chk from pg_policy
   where polrelid = 'public.support_inquiries'::regclass and polname = 'support_insert';
  if chk is null or chk not like '%auth.uid()%' or chk not like '%answer_emailed_for IS NULL%' or chk not like '%''open''%' then
    raise exception 'support_insert WITH CHECK 가 기대와 다르다: %', chk;
  end if;
end $$;

-- 리허설(리드용 — begin; … rollback;):
--   begin;
--     <위 alter>;
--     -- CAS 1회차 성공·2회차 0행
--     with t as (select id, answered_at from public.support_inquiries where status='answered' and answered_at is not null limit 1)
--     update public.support_inquiries s set answer_emailed_for = t.answered_at from t
--       where s.id = t.id and s.answered_at = t.answered_at and s.answer_emailed_for is null returning s.id;  -- 1행
--     (같은 문장 다시) -- 0행
--     select count(*) from public.notifications where created_at > now() - interval '1 minute' and type='qna'; -- 0 (알림 트리거 무반응)
--     -- R1: 일반 회원(역할 먼저 조회해서 고를 것)으로 set local role authenticated + request.jwt.claims sub=<uid>
--     insert into public.support_inquiries(user_id, category, title, content) values (<uid>, '기타', 't', 'c');            -- 양성: 통과
--     insert into public.support_inquiries(user_id, category, title, content, status, answer, answered_at)
--       values (<uid>, '기타', 't', 'c', 'answered', 'x', now());                                                         -- 음성: RLS 위반
--     insert into public.support_inquiries(user_id, category, title, content, answer_emailed_for) values (<uid>, '기타', 't', 'c', now()); -- 음성
--     insert into public.support_inquiries(user_id, category, title, content) values (<다른 uid>, '기타', 't', 'c');         -- 음성(기존 조건 보존)
--   rollback;
