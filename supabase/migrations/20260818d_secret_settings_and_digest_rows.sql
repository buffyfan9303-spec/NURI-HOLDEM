-- 서버 전용 시크릿 저장소 + 이메일 다이제스트 집계. (라이브 적용: secret_settings_and_digest_rows)
-- ⚠ app_settings 는 read=true(전체 공개)라 API 키를 둘 수 없다 — RLS ON + 정책 0개(전면 차단),
--   service_role(엣지 함수)만 접근. 실제 키 값(RESEND_API_KEY·RESEND_FROM)은 라이브에만 INSERT
--   되어 있고 리포에는 커밋하지 않는다(재구축 시 수동 입력).
create table if not exists public.secret_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.secret_settings enable row level security;
revoke all on table public.secret_settings from anon, authenticated;

-- 이메일 다이제스트 대상 집계 — 주간 팔로우 다이제스트(알림판)와 동일 로직 + 이메일 보유자만.
-- 서비스 롤 전용(엣지 함수 weekly-email-digest 가 호출). 대회 0개면 행이 없어 발송 자체가 없다.
create or replace function public.weekly_email_digest_rows()
returns table(email text, nickname text, vname text, vn integer, n integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  select p.email, p.nickname, f.vname, f.vn, f.n
  from (
    select vf.user_id, count(*)::int as n, count(distinct s.venue_id)::int as vn, min(v.name) as vname
    from public.venue_follows vf
    join public.schedules s on s.venue_id = vf.venue_id
     and s.approved = true
     and s.date >= (now() at time zone 'Asia/Seoul')::date
     and s.date <  (now() at time zone 'Asia/Seoul')::date + 7
    join public.venues v on v.id = s.venue_id
    group by vf.user_id
  ) f
  join public.profiles p on p.id = f.user_id
   and coalesce(p.status::text, 'active') = 'active'
   and p.email is not null and btrim(p.email) <> '';
$function$;
revoke all on function public.weekly_email_digest_rows() from public, anon, authenticated;
grant execute on function public.weekly_email_digest_rows() to service_role;
