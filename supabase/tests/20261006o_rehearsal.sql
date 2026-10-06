-- 20261006o 라이브 롤백 리허설 (home-team 2026-10-06) — 오너 결정: 위치기반서비스 이용약관 제3판 시행 = 정식 오픈일(2026-10-08 00:00 KST)
-- 실행: node ../geo-notice-1005/rehearse-geo.mjs chain_o.sql 20261006o_rehearsal.sql   (chain_o = r0 + 20261006o)
--   음성 대조: r0 만(chain_o_neg) + 이 파일 = 지금 라이브(2026-11-05) → G1 FAIL 이어야 한다.

create table public._probe_20261006o (x int);

do $rehearsal$
declare t text; out text := ''; fails int := 0; total int := 0;
begin
  -- G1 거부 시작 시각 = 2026-10-08 00:00 KST · 내부 함수(anon·authenticated 불가) · 그 1초 전/뒤 판정
  total := total + 1;
  begin
    t := 'from=' || to_char(public._checkin_geo_required_from() at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI');
    t := t || ' acl=' || has_function_privilege('anon', 'public._checkin_geo_required_from()', 'execute')::text
               || '/' || has_function_privilege('authenticated', 'public._checkin_geo_required_from()', 'execute')::text;
    t := t || ' before=' || (timestamptz '2026-10-07 23:59:59+09' >= public._checkin_geo_required_from())::text
           || ' at=' || (timestamptz '2026-10-08 00:00:00+09' >= public._checkin_geo_required_from())::text;
    raise exception using errcode = 'ZZ001', message = t;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'from=2026-10-08 00:00 acl=false/false before=false at=true' then out := out || 'G1 PASS; ';
      else fails := fails + 1; out := out || 'G1 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'G1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
