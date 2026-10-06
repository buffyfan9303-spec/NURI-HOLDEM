select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- 20261006m — 이용 제한(정지·영구정지) 중인 회원의 본인 탈퇴 허용 · home-team 2026-10-06
-- ⏳ 미적용(작성·라이브 롤백 리허설만). 적용은 리드가 한다 — 적용 후 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다.
--
-- 요구: 오너 2026-10-06 "계정 탈퇴도 만들어" → security-1006/legal.md P2-8 초안 ②(리드 결정).
--   개인정보 보호법 §36(삭제)·§37(처리정지) — 제재 중이라는 이유만으로 탈퇴(파기 요구)를 막을 근거가 약하다.
--   제재 회피 재가입은 CI 변환값(withdrawn_identities)으로 계속 막는다. PR #188 반증(pr188-review.md P2-A) 뒤 리드 결정 (b):
--     · 영구정지(banned) 중 탈퇴 → reason='banned'(tombstone_banned_ci 가 영구정지 때 쓰는 값) · **5년 보관 뒤 파기**
--       (탈퇴가 profiles.ci_hash 를 지우므로, 6개월 파기면 영구정지가 6개월 정지로 바뀐다 — 반증 X1).
--     · 기간 정지(suspended) 중 탈퇴 → 일반 탈퇴와 **같다**(reason='withdrawn', 6개월, 재가입 차단 없음 — 리드 결정 2026-10-06:
--       3일 정지가 6개월 재가입 불가가 되는 것은 과하다). 정지 기간이 끝났든 아니든 같으므로 만료 판정(P3-2)이 따로 필요 없다.
--   그래서 _purge_withdrawn_identities 만 사유별 기간으로 바꾼다(verify_identity_commit 은 그대로 — 'banned' 는 이미 거절 목록에 있다).
--   ('banned' 5년은 영구정지 처분 때 남기는 행에도 같이 적용된다 — 해제(active)되면 tombstone_banned_ci 가 즉시 지우는 것은 그대로.)
--   개정 방식: 5년은 새 보유기간(이용자에게 불리)이라 처리방침 **제3판**(공지 2026-10-06 · 시행 2026-10-13)으로 공지한다(src/lib/legalVersion.ts).
--     이 파일이 시행일보다 먼저 적용돼도 실질 영향은 없다 — 서비스 개시가 2026-06-15 라 어떤 행도 2026-12-15 전에는
--     6개월 파기 대상이 될 수 없고(2026-10-06 실측 withdrawn_identities 0행), 5년 규칙이 6개월 규칙과 처음 갈리는 날이 시행일 뒤다.
-- 기준: **20261006s2(PR #187, 탈퇴 파일 큐) 적용 후** withdraw_my_account 정의 — 첫 분기와 CI 행 reason 만 바꿨다.
--   적용 순서(리드 결정): 20261006s1 → 20261006s2 → 20261006l → 20261006m. s2 의 큐 넣기 호출을 지우지 않는다.
--   admin_withdraw_user 는 건드리지 않는다(s2 정의 그대로).
--
-- legal.md P2-4(탈퇴 후 profiles.name 잔존): 고치지 않는다 — 라이브 BEFORE 트리거 profiles_nickname_rules 가
--   모든 INSERT/UPDATE 에서 name := nickname 으로 맞추므로 탈퇴(nickname='탈퇴회원_…')와 함께 name 도 바뀐다.
--   리허설 W1·W3(본인·관리자 탈퇴)이 name 을 직접 단언해 이 사실을 잠근다.
--
-- 리허설: Documents/누리홀덤_영상분석_0930/security-1006/legal-fix/20261006m_rehearsal.sql (rehearse-geo.mjs 로 롤백 전용)

-- 출발점 게이트: withdraw_my_account 는 s2 적용 후 정의(2026-10-06 롤백 리허설에서 s1+s2 를 얹고 잰 md5),
--   _purge_withdrawn_identities 는 라이브 정의(2026-10-06 ro.mjs md5).
--   s2 없이 이 파일만 적용하거나 그 사이 다른 PR 이 바꿨으면 조용히 덮지 않고 멈춘다.
do $gate$
begin
  if md5(pg_get_functiondef('public.withdraw_my_account()'::regprocedure)) is distinct from '570a3eb5aa675e0baf61781abc4c0281' then
    raise exception '20261006m 게이트: withdraw_my_account 가 20261006s2 적용 후 정의와 다르다 — s2 를 먼저 적용하거나 라이브 정의를 다시 떠서 합쳐라';
  end if;
  if md5(pg_get_functiondef('public._purge_withdrawn_identities()'::regprocedure)) is distinct from '30d607f8606ef789887ca84ca5789d99' then
    raise exception '20261006m 게이트: _purge_withdrawn_identities 가 작성 때(2026-10-06)와 다르다 — 라이브 정의를 다시 떠서 합쳐라';
  end if;
end $gate$;

create or replace function public.withdraw_my_account()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_suffix text; v_status text; v_hash text; v_anon_email text; v_kind text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select status, ci_hash into v_status, v_hash from public.profiles where id = v_uid;
  -- 20261006m: 제재(정지·영구정지) 중에도 본인 탈퇴를 받는다.
  --   영구정지만 CI 변환값 'banned'(재가입 거절 · 5년 보관), 기간 정지는 일반 탈퇴와 같다('withdrawn' · 6개월 · 재가입 표시만).
  v_kind := case when v_status = 'banned' then 'banned' else 'withdrawn' end;
  if v_status = 'withdrawn' then
    raise exception '이미 탈퇴한 계정입니다';
  end if;
  if exists (select 1 from public.venues where owner_id = v_uid) then
    raise exception '매장 대표는 매장을 먼저 정리(삭제 또는 대표 양도)한 뒤 탈퇴할 수 있습니다';
  end if;
  if v_hash is not null then
    insert into public.withdrawn_identities(ci_hash, reason)
    values (v_hash, v_kind)
    on conflict (ci_hash) do update set reason = excluded.reason, created_at = now();
  end if;
  v_suffix := substr(replace(v_uid::text, '-', ''), 1, 12);
  v_anon_email := 'withdrawn_' || v_suffix || '@deleted.invalid';
  update public.profiles set
    status='withdrawn', nickname='탈퇴회원_'||v_suffix, email=v_anon_email,
    real_name=null, phone=null, ci_hash=null, verified_at=null,
    birth_date=null, gender=null, carrier=null,
    venue_id=null, sanction_reason='본인 탈퇴', avatar_url=null
  where id = v_uid;
  delete from public.venue_staff  where user_id = v_uid;
  delete from public.venue_owners where user_id = v_uid;
  update auth.users set email = v_anon_email, phone = null, raw_user_meta_data = '{}'::jsonb
  where id = v_uid;
  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;
  delete from auth.one_time_tokens where user_id = v_uid;
  delete from public.push_subscriptions where user_id = v_uid;
  perform public._purge_private_records(v_uid);  -- 20260925d
  -- 20261006s2: SQL 로 storage.objects 를 지우면 파일이 버킷에 고아로 남는다(Supabase 공식 문서) → 큐에 넣고
  --   storage-purge 엣지 함수가 Storage API 로 지운다. 프로필 사진(avatars)에 순위 인증 신분증·증빙(verifications)까지.
  perform public._enqueue_user_storage_purge(v_uid, 'withdraw_self');
end $function$;
revoke all on function public.withdraw_my_account() from public, anon;
grant execute on function public.withdraw_my_account() to authenticated, service_role;


-- ── 보관 기간: 영구정지(banned) 5년 · 그 밖(기간 정지 중 탈퇴·일반 탈퇴·강제 탈퇴) 6개월 — 처리방침 제3판 제3조.
create or replace function public._purge_withdrawn_identities()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare n integer;
begin
  -- 20261006m: 영구정지 행은 부정 재가입 방지를 위해 5년 보관(리드 결정 (b), pr188-review P2-A).
  delete from public.withdrawn_identities
   where created_at < now() - case when reason = 'banned' then interval '5 years' else interval '6 months' end;
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function public._purge_withdrawn_identities() from public, anon, authenticated;
grant execute on function public._purge_withdrawn_identities() to service_role;
