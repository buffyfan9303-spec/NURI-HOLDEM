-- 20260926d — 매장 급여 계산 설정(PAYROLL-LAW 2026-09-26).
-- ✅ 적용 완료 2026-09-26 (nuri-lead, MCP execute_sql). 적용 후: anon select 불가·authenticated delete 불가·RLS 켜짐.
--    리허설(store-team·critical-reviewer, 롤백): 업주 읽기/쓰기 1행, 타 매장·미승인 직원 0행/42501, anon 42501, 삭제 42501, 기본값 전부 f.
--
-- 무엇: 급여 정산·대시보드·딜러 급여가 쓰는 계산 스위치 4개를 매장별로 저장한다.
--   early_credit   조기 출근 인정(기본 끔 — 지휘·감독 없는 조기 출근은 근로시간 아님)
--   auto_break     휴게 자동 공제(기본 끔 — 오너 결정 2026-09-26. 켜면 근로기준법 제54조 최소치 공제)
--   five_plus      상시 5인 이상(기본 끔 — 제11조·제56조 가산은 5인 이상만)
--   weekly_holiday 주휴수당 계산(기본 끔 — 오너 2026-09-26 '전부 비정규직'. 켜면 제55조, 판정 불가 주는 '확인 필요')
-- 클라이언트: src/api/payrollRules.ts(usePayRules) · 계산: src/lib/staffPay.ts.
--   적용 전에는 클라이언트가 PGRST205/42P01 을 '설정 없음' 으로 읽어 기본값으로 계산하고 저장만 막는다.
-- 권한: 읽기·쓰기 모두 can_manage_pos(venue_id) — staff_wage·dealer_shifts 와 같은 경계(급여는 업주 화면만).
--   삭제 정책 없음(끄려면 false 로 저장). anon 은 모든 권한 회수.
-- 롤백: drop table public.venue_payroll_rules; (행이 생긴 뒤라면 백업 먼저)

create table if not exists public.venue_payroll_rules (
  venue_id       uuid primary key references public.venues(id) on delete cascade,
  early_credit   boolean not null default false,
  auto_break     boolean not null default false,
  five_plus      boolean not null default false,
  weekly_holiday boolean not null default false,
  updated_at     timestamptz not null default now()
);
comment on table public.venue_payroll_rules is
  '매장 급여 계산 설정(PAYROLL-LAW 2026-09-26). 행이 없으면 클라이언트 기본값(early_credit=f, auto_break=f, five_plus=f, weekly_holiday=f). '
  '법률 판단 대행이 아니라 업주가 신고한 사실(5인 이상 여부 등)에 따른 참고 계산 스위치다.';

alter table public.venue_payroll_rules enable row level security;
revoke all on public.venue_payroll_rules from public, anon;
revoke all on public.venue_payroll_rules from authenticated;
grant select, insert, update on public.venue_payroll_rules to authenticated;

drop policy if exists vpr_select on public.venue_payroll_rules;
create policy vpr_select on public.venue_payroll_rules for select to authenticated
  using (public.can_manage_pos(venue_id));
drop policy if exists vpr_insert on public.venue_payroll_rules;
create policy vpr_insert on public.venue_payroll_rules for insert to authenticated
  with check (public.can_manage_pos(venue_id));
drop policy if exists vpr_update on public.venue_payroll_rules;
create policy vpr_update on public.venue_payroll_rules for update to authenticated
  using (public.can_manage_pos(venue_id)) with check (public.can_manage_pos(venue_id));
