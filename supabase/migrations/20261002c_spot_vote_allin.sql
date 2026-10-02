-- ✅ 적용 완료 2026-10-02 (리드, Management API) — 리허설 rollback 자가검사 통과 · md5(prosrc) eb611bc04c0092483c6345450a1816e6 · ACL postgres/service_role 만 · advisors ERROR 0
-- (원래 머리줄) ⏳ 미적용 — 초안(community-team 2026-10-02). 적용은 리드만 한다(nuri-migration). 라이브에는 쓰기 0 — 아래 §R 은 읽기 전용 SELECT 대조만 했다.
-- 20261002c — SPOT 공유 투표 보기: 레이즈를 받을 수 없는 자리(상대 올인 · 내 스택을 덮는 벳)면 '폴드·콜' 만.
--   요구 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\review-share-a3-1002.md §2(투표 보기 FAIL v4~v6).
--   지금(라이브 20261001o, _spot_vote_choices md5(prosrc) cc4f9b92bccce337cdf00e82ae49f93c): '결정 스트리트에 bet·raise 가 있는가' 만 본다.
--     → BTN 2.5 오픈에 BB 가 100BB 전부를 넣어도(v4) · 플랍 97.5 올인(v5) · 내 스택 40 에 60 벳(v6) 이어도 '폴드·콜·레이즈'.
--
-- 바꾸는 것: §1 _spot_vote_choices(jsonb) 본문 하나(create or replace · 같은 서명·반환형 → ACL 보존, REVOKE 재기재).
--   share_spot_post 는 손대지 않는다(이미 이 함수를 부른다 — 20261001o §2).
--   규칙 — 화면 src/components/features/community/spotShare/shareView.ts 의 voteChoices 와 **같다**(한쪽을 바꾸면 둘 다):
--     기본 보기는 20261001o 그대로(벳·레이즈를 마주함 → 폴드·콜·레이즈 / 프리플랍 BB 림프만 → 체크·레이즈 / 포스트플랍 무벳 → 체크·벳).
--     기본이 폴드·콜·레이즈일 때 다음 중 하나면 폴드·콜:
--       ⓐ 콜할 금액 ≥ 내 남은 스택.  콜할 금액 = max(프리플랍이면 1, 팟에 남은 상대의 이번 스트리트 투입) − 내 이번 스트리트 투입
--          남은 스택 = 내 스택 − 내 누적 투입(블라인드·BB앤티 포함 = spot.ts committedBb, validateSpot G1 과 같은 셈)
--       ⓑ 팟에 남은 상대(마지막 액션이 폴드가 아닌 Villain A~E)가 전원 칩 0(올인).
--     스택: 두 스택(heroStackBb·villainStackBb)이 다 양수면 나·Villain A 는 그 값, 유효 스택은 둘의 min. 아니면 모두 effectiveBb.
--           Villain B~E 는 스택을 따로 적지 않으므로 유효 스택으로 본다.
--     입력 정규화는 화면의 fromJSON 과 같다(모르는 자리·스트리트·액션은 기본값/버림, 숫자가 아니면 기본값, v<2 앤티 × 인원).
--     ⚠ 'extra' 키(메모리 스냅샷 모양)는 보지 않는다 — share_spot_post 가 그 키를 SPOT_WIRE_INVALID 로 거부한다.
-- 바꾸지 않는 것: 이미 올라간 글의 보기·표(post_poll_options 무변경). 옛 글은 화면 fitPollOptions 가 표 0 인 '레이즈' 를 숨긴다.
--   보기 2개(폴드·콜)는 post_poll_options 제약(2~6개)을 만족한다(20261001o §R 에서 2개 INSERT 실측).
-- 되돌리기: §1 을 20261001o §1 본문으로 create or replace.

-- §0 적용 전 본문 게이트 — 2026-10-02 라이브 실측 md5(prosrc). 이미 이 파일 본문이면 통과(재적용 가능).
do $pre$
declare s text;
begin
  select p.prosrc into s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_spot_vote_choices' and pg_get_function_identity_arguments(p.oid) = 'p_spot jsonb';
  if s is null then
    raise exception '20261002c 게이트: _spot_vote_choices(jsonb) 가 없습니다 — 20261001o 가 먼저 적용돼야 합니다';
  end if;
  if md5(s) <> 'cc4f9b92bccce337cdf00e82ae49f93c' and s not like '%20261002c%' then
    raise exception '20261002c 게이트: 라이브 본문이 초안 작성 때(md5 cc4f9b92…)와 다릅니다 — 다시 읽고 초안을 갱신하세요 (지금 md5 %)', md5(s);
  end if;
end
$pre$;

-- §1 판정 규칙(내부) — 본문 첫 줄 주석의 '20261002c' 가 §0 재적용 표지다.
create or replace function public._spot_vote_choices(p_spot jsonb)
 returns text[]
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  -- 20261002c: 올인·스택을 덮는 벳이면 폴드·콜 (화면 shareView.voteChoices 와 같은 규칙)
  with raw as (
    select
      case when jsonb_typeof(p_spot -> 'v') = 'number' then (p_spot ->> 'v')::numeric else 1 end as ver,
      case when jsonb_typeof(p_spot -> 'tableSize') = 'number' then (p_spot ->> 'tableSize')::numeric else 6 end as ts,
      case when jsonb_typeof(p_spot -> 'sbBb') = 'number' then (p_spot ->> 'sbBb')::numeric else 0.5 end as sb,
      case when jsonb_typeof(p_spot -> 'anteBb') = 'number' then (p_spot ->> 'anteBb')::numeric else 0 end as ante,
      case when jsonb_typeof(p_spot -> 'effectiveBb') = 'number' then (p_spot ->> 'effectiveBb')::numeric else 100 end as eff,
      case when jsonb_typeof(p_spot -> 'heroStackBb') = 'number' then (p_spot ->> 'heroStackBb')::numeric end as hs,
      case when jsonb_typeof(p_spot -> 'villainStackBb') = 'number' then (p_spot ->> 'villainStackBb')::numeric end as vs
  ), s as (
    select
      case when p_spot ->> 'street' in ('preflop', 'flop', 'turn', 'river') then p_spot ->> 'street' else 'preflop' end as street,
      case when p_spot ->> 'heroPos' in ('UTG', 'UTG1', 'UTG2', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB') then p_spot ->> 'heroPos' else 'BTN' end as hero,
      case when p_spot ->> 'villainPos' in ('UTG', 'UTG1', 'UTG2', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB') then p_spot ->> 'villainPos' else 'BB' end as vpos,
      r.sb,
      case when r.ver < 2 then round(r.ante * greatest(r.ts, 0), 2) else r.ante end as ante,
      coalesce(r.hs > 0 and r.vs > 0, false) as pair,
      case when coalesce(r.hs > 0 and r.vs > 0, false) then least(r.hs, r.vs) else r.eff end as eff,
      case when coalesce(r.hs > 0 and r.vs > 0, false) then r.hs else r.eff end as hstack,
      case when coalesce(r.hs > 0 and r.vs > 0, false) then r.vs else r.eff end as vstack
    from raw r
  ), acts as (
    select o.n,
      a ->> 'street' as street,
      a ->> 'type' as type,
      coalesce(a ->> 'actor' = 'villain', false) as is_v,
      case when a ->> 'actor' = 'villain'
        then coalesce(case when a ->> 'pos' in ('UTG', 'UTG1', 'UTG2', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB') then a ->> 'pos' end, s.vpos)
        else s.hero end as pos,
      case when a ->> 'type' in ('call', 'bet', 'raise') and jsonb_typeof(a -> 'sizeBb') = 'number' then (a ->> 'sizeBb')::numeric else 0 end as size
    from s, jsonb_array_elements(case when jsonb_typeof(p_spot -> 'actions') = 'array' then p_spot -> 'actions' else '[]'::jsonb end) with ordinality o(a, n)
    where jsonb_typeof(o.a) = 'object'
      and o.a ->> 'street' in ('preflop', 'flop', 'turn', 'river')
      and o.a ->> 'type' in ('fold', 'check', 'call', 'bet', 'raise')
  ), vil as (
    select s.vpos as pos from s
    union all
    select x.p from (
      select e.p from jsonb_array_elements_text(case when jsonb_typeof(p_spot -> 'extraPos') = 'array' then p_spot -> 'extraPos' else '[]'::jsonb end) with ordinality e(p, n)
       where e.p in ('UTG', 'UTG1', 'UTG2', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB')
       order by e.n limit 4) x
  ), live as (
    select v.pos from vil v
     where coalesce((select a.type from acts a where a.is_v and a.pos = v.pos order by a.n desc limit 1), '') <> 'fold'
  ), put as (
    -- 자리별 누적 투입(블라인드 + BB앤티 + 증분) · 이번 스트리트 투입(프리플랍 블라인드만, 앤티 제외)
    select p.pos,
      case p.pos when 'BB' then 1 + s.ante when 'SB' then s.sb else 0 end
        + (select coalesce(sum(a.size), 0) from acts a where a.pos = p.pos) as total,
      case when s.street = 'preflop' then case p.pos when 'BB' then 1 when 'SB' then s.sb else 0 end else 0 end
        + (select coalesce(sum(a.size), 0) from acts a where a.pos = p.pos and a.street = s.street) as street_in
    from s, (select s.hero as pos from s union select l.pos from live l) p
  ), base as (
    select case
      when exists (select 1 from acts a where a.street = s.street and a.type in ('bet', 'raise')) then array['폴드', '콜', '레이즈']
      when s.street = 'preflop' then case when s.hero = 'BB' then array['체크', '레이즈'] else array['폴드', '콜', '레이즈'] end
      else array['체크', '벳']
    end as choices
    from s
  )
  select case
    when b.choices <> array['폴드', '콜', '레이즈'] then b.choices
    when greatest(case when s.street = 'preflop' then 1 else 0 end,
                  (select max(u.street_in) from put u join live l on l.pos = u.pos))
           - (select u.street_in from put u where u.pos = s.hero)
         >= s.hstack - (select u.total from put u where u.pos = s.hero) - 1e-9
      then array['폴드', '콜']
    when not exists (
      select 1 from live l join put u on u.pos = l.pos
       where (case when l.pos = s.vpos then s.vstack else s.eff end) - u.total > 1e-9)
      then array['폴드', '콜']
    else b.choices
  end
  from s, base b
$function$;
revoke all on function public._spot_vote_choices(jsonb) from public, anon, authenticated;

-- §3 자가검사 — 사례표는 화면 쪽 시험(shareView.test.ts '서버 사례표')이 이 파일에서 그대로 읽어 voteChoices 로 다시 돌린다.
--   한 줄에 사례 하나: ('<spot json>'::jsonb, array[기대 보기]) — 형식을 바꾸면 그 시험의 파서도 바꿔라.
do $self$
declare r record; got text[];
begin
  if pg_get_functiondef('public._spot_vote_choices(jsonb)'::regprocedure) not like '%20261002c%' then
    raise exception '20261002c 자가검사: _spot_vote_choices 본문이 바뀌지 않았습니다';
  end if;
  if has_function_privilege('anon', 'public._spot_vote_choices(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._spot_vote_choices(jsonb)', 'execute') then
    raise exception '20261002c 자가검사: 내부 함수 _spot_vote_choices 가 열려 있습니다';
  end if;
  for r in select * from (values
    -- 20261001o 의 네 사례(금액 없음) — 규칙이 그대로인지
    ('{"street":"flop","heroPos":"CO","actions":[{"street":"flop","actor":"villain","type":"check"}]}'::jsonb, array['체크','벳']),
    ('{"street":"flop","heroPos":"CO","actions":[{"street":"flop","actor":"villain","type":"bet"}]}'::jsonb, array['폴드','콜','레이즈']),
    ('{"street":"preflop","heroPos":"BTN","actions":[]}'::jsonb, array['폴드','콜','레이즈']),
    ('{"street":"preflop","heroPos":"BB","actions":[{"street":"preflop","actor":"villain","type":"call"}]}'::jsonb, array['체크','레이즈']),
    -- 검토 보고서 v1~v6 (review-share-a3-1002.md §2) — 보드·카드는 판정과 무관해 뺐다
    ('{"v":3,"tableSize":6,"sbBb":0.5,"anteBb":0,"effectiveBb":100,"heroPos":"BTN","villainPos":"BB","street":"flop","actions":[{"street":"preflop","actor":"hero","type":"raise","sizeBb":2.5},{"street":"preflop","actor":"villain","type":"call","sizeBb":1.5},{"street":"flop","actor":"villain","type":"check"}]}'::jsonb, array['체크','벳']),
    ('{"v":3,"tableSize":6,"sbBb":0.5,"anteBb":0,"effectiveBb":100,"heroPos":"BTN","villainPos":"BB","street":"flop","actions":[{"street":"preflop","actor":"hero","type":"raise","sizeBb":2.5},{"street":"preflop","actor":"villain","type":"call","sizeBb":1.5},{"street":"flop","actor":"villain","type":"bet","sizeBb":3}]}'::jsonb, array['폴드','콜','레이즈']),
    ('{"v":3,"tableSize":6,"sbBb":0.5,"anteBb":0,"effectiveBb":100,"heroPos":"BB","villainPos":"SB","street":"preflop","actions":[{"street":"preflop","actor":"villain","type":"call","sizeBb":0.5}]}'::jsonb, array['체크','레이즈']),
    ('{"v":3,"tableSize":6,"sbBb":0.5,"anteBb":0,"effectiveBb":100,"heroPos":"BTN","villainPos":"BB","street":"preflop","actions":[{"street":"preflop","actor":"hero","type":"raise","sizeBb":2.5},{"street":"preflop","actor":"villain","type":"raise","sizeBb":99}]}'::jsonb, array['폴드','콜']),
    ('{"v":3,"tableSize":6,"sbBb":0.5,"anteBb":0,"effectiveBb":100,"heroPos":"BTN","villainPos":"BB","street":"flop","actions":[{"street":"preflop","actor":"hero","type":"raise","sizeBb":2.5},{"street":"preflop","actor":"villain","type":"call","sizeBb":1.5},{"street":"flop","actor":"villain","type":"bet","sizeBb":97.5}]}'::jsonb, array['폴드','콜']),
    ('{"v":3,"tableSize":6,"sbBb":0.5,"anteBb":0,"effectiveBb":40,"heroStackBb":40,"villainStackBb":120,"heroPos":"CO","villainPos":"BB","street":"turn","actions":[{"street":"preflop","actor":"hero","type":"raise","sizeBb":2.5},{"street":"preflop","actor":"villain","type":"call","sizeBb":1.5},{"street":"turn","actor":"villain","type":"bet","sizeBb":60}]}'::jsonb, array['폴드','콜']),
    -- ⓑ 상대가 짧아 올인(내 남은 스택은 넉넉) → 폴드·콜
    ('{"v":3,"tableSize":6,"sbBb":0.5,"anteBb":0,"effectiveBb":40,"heroStackBb":120,"villainStackBb":40,"heroPos":"BTN","villainPos":"BB","street":"preflop","actions":[{"street":"preflop","actor":"hero","type":"raise","sizeBb":2.5},{"street":"preflop","actor":"villain","type":"raise","sizeBb":39}]}'::jsonb, array['폴드','콜']),
    -- 멀티웨이 양성 대조: Villain A 는 올인이지만 Villain B(CO)는 칩이 남았다 → 레이즈 있음
    ('{"v":3,"tableSize":6,"sbBb":0.5,"anteBb":0,"effectiveBb":50,"heroStackBb":200,"villainStackBb":50,"heroPos":"BTN","villainPos":"BB","extraPos":["CO"],"street":"preflop","actions":[{"street":"preflop","actor":"villain","pos":"CO","type":"raise","sizeBb":2.5},{"street":"preflop","actor":"hero","type":"call","sizeBb":2.5},{"street":"preflop","actor":"villain","type":"raise","sizeBb":49}]}'::jsonb, array['폴드','콜','레이즈']),
    -- 같은 판에서 Villain B 가 폴드했으면 남은 상대가 전원 올인 → 폴드·콜
    ('{"v":3,"tableSize":6,"sbBb":0.5,"anteBb":0,"effectiveBb":50,"heroStackBb":200,"villainStackBb":50,"heroPos":"BTN","villainPos":"BB","extraPos":["CO"],"street":"preflop","actions":[{"street":"preflop","actor":"villain","pos":"CO","type":"raise","sizeBb":2.5},{"street":"preflop","actor":"hero","type":"call","sizeBb":2.5},{"street":"preflop","actor":"villain","type":"raise","sizeBb":49},{"street":"preflop","actor":"villain","pos":"CO","type":"fold"}]}'::jsonb, array['폴드','콜']),
    -- BB앤티는 남은 스택에서 빠진다: 내가 BB(앤티 1 포함 2 투입) · 스택 20 · BTN 이 20 올인 → 콜 19 ≥ 남은 18 → 폴드·콜
    ('{"v":3,"tableSize":8,"sbBb":0.5,"anteBb":1,"effectiveBb":20,"heroPos":"BB","villainPos":"BTN","street":"preflop","actions":[{"street":"preflop","actor":"villain","type":"raise","sizeBb":20}]}'::jsonb, array['폴드','콜'])
  ) t(spot, want) loop
    got := public._spot_vote_choices(r.spot);
    if got is distinct from r.want then
      raise exception '20261002c 자가검사: % → % (기대 %)', r.spot, got, r.want;
    end if;
  end loop;
end
$self$;

-- §R 읽기 전용 대조 기록(2026-10-02 · community-team · 라이브 쓰기 0 — DDL·begin/rollback 도 안 했다)
--    라이브 PostgreSQL 17.6. 함수를 만들지 않고 §1 본문을 그대로 스칼라 부분질의로 감싸 §3 사례 14건을 SELECT 로 넣었다
--      (select … from (values (i, '<spot>'::jsonb, array[기대])) t(i, p_spot, want), lateral (select (<§1 본문>) as got) g).
--    결과: 14/14 기대와 같음.
--    같은 14건을 지금 라이브 함수 public._spot_vote_choices(20261001o)에 넣으면 8/14 — 사례 8~11·13·14(올인·덮는 벳)가 폴드·콜·레이즈.
--    화면 쪽(shareView.voteChoices)은 이 사례표를 shareView.test.ts 가 읽어 14/14. 화면 규칙을 되돌리면 사례 6건 + 옛 글 레이즈 숨김·shareView 2건 = 8건이 빨개진다(음성 대조).
--    라이브 _spot_vote_choices md5(prosrc) cc4f9b92bccce337cdf00e82ae49f93c · ACL {postgres, service_role} 만 · post_spots 0행(지금 올라간 SPOT 글 없음).
