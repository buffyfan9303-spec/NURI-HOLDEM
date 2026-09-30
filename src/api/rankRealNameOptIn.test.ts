// 오너 2026-09-30 — "기존 가입자는 기본 실명 비공개. 실명 공개는 본인이 선택" 의 계약.
//
// 잡는 회귀
//   ① 닉네임 없는 옛 순위 행이 실명 일부('홍*동')로 공개면에 나가는 것 → '참가자'
//   ② 실명 공개를 켜고/끈 뒤 '켠 닉네임' 60초 캐시가 옛 답을 들고 있어 끈 뒤에도 실명이 남는 것
//   ③ 열린 순위 화면(subscribeRankings 사용처)이 켜고/끈 것을 다시 읽지 않는 것
//   ④ 서버(20260930c): 공개 순위 RPC 가 옵트인 판정을 비켜 업주가 적은 원문 실명을 비동의자에게 내보내는 것
//   ⑤ (PR #56 후속) 업주가 공개 페이지를 볼 때 원문 → 없으면 옵트인 실명 → 닉네임. 원문(저장값)과 옵트인 실명(표시값)은 다른 열
//   ⑥ (PR #56 후속) 홈 '지난 대회'는 옵트인 실명만 — 업주 원문을 쓰지 않는다
//   ⑦ (critical-reviewer 지적 1) 남이 버린 닉네임을 가져가 켜면 남의 입상에 내 실명이 붙던 것
//   ⑧ (재검토 R1) 판정 시각을 created_at 으로 재면 재저장(delete+insert)·늦은 첫 입력 때 지금 주인으로 판정된다 → 대회 날짜(ranking_date)
//   ⑨ (재검토 R2) 공용 nickname_owner_at 은 빈 틈·얻기 전 날짜를 지금 주인으로 돌린다 → 이 프로필 자신의 이력으로 그날 닉네임 확인
//   ⑩ (3차 F1) profiles.joined_at 은 본인이 바꿀 수 있었다 → 판정은 auth.users.created_at, 가드도 joined_at 을 막는다
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rpcCalls: string[] = [];
// vitest 환경은 node 라 window 가 없다 — 앱 안 신호(EventTarget)만 흉내 낸다. import 보다 먼저 걸려야 모듈 로드 때의 리스너가 붙는다.
vi.hoisted(() => { (globalThis as { window?: EventTarget }).window ??= new EventTarget(); });
vi.mock('../lib/supabase', () => {
  const ch = { on: () => ch, subscribe: () => ch };
  const rankRows = [
    { id: 'a', venue_id: 'v1', ranking_date: '2026-09-01', position: 1, nickname: 'Nick', real_name: '원문이름', prize: null, event_name: '', optin_real_name: null },
    { id: 'b', venue_id: 'v1', ranking_date: '2026-09-01', position: 2, nickname: 'Opt', real_name: null, prize: null, event_name: '', optin_real_name: '인증이름' },
  ];
  return {
    IS_MOCK: false,
    supabase: {
      rpc: (name: string) => {
        rpcCalls.push(name);
        if (name === 'venue_ranking_real_name_optins') return Promise.resolve({ data: [{ nickname_key: 'nick' }], error: null });
        if (name === 'venue_rankings_public') return Promise.resolve({ data: rankRows, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      channel: () => ch,
      removeChannel: () => {},
    },
  };
});

import { rankDisplay, rankingLabel, getVenueRealNameOptIns, subscribeRankings, getRankingsBulk, NAMELESS_RANK_LABEL } from './rankings';
import { setMyRankingNamePref } from './rankingDisplay';

beforeEach(() => { rpcCalls.length = 0; });

describe('닉네임 없는 옛 순위 행', () => {
  it("실명 일부를 보이지 않고 '참가자' 로 쓴다(업무 경로로 실명을 받은 업주 화면이어도)", () => {
    const d = rankDisplay({ nickname: '', realName: '홍길동', optinRealName: '홍길동' });
    expect(d.main).toBe(NAMELESS_RANK_LABEL);
    expect(d.main + d.sub).not.toMatch(/[홍동]/);
    expect(rankingLabel({ position: 1, nickname: '  ', realName: '나리' })).toBe('참가자');
  });
});

describe('표시 이름은 서버가 실어 준 값만 쓴다 — 원문 → 옵트인 실명 → 닉네임', () => {
  it('서버가 이름을 안 주면 닉네임', () => {
    expect(rankDisplay({ nickname: 'Nick', realName: '' })).toEqual({ main: 'Nick', sub: '' });
  });
  it('업주 화면: 원문이 있으면 원문(옵트인 실명보다 먼저)', () => {
    expect(rankDisplay({ nickname: 'Nick', realName: '원문', optinRealName: '인증' })).toEqual({ main: '원문', sub: 'N**k' });
  });
  it('업주 화면: 원문이 없으면 켠 사람의 인증 실명(일반 방문자와 같은 값)', () => {
    expect(rankDisplay({ nickname: 'Nick', realName: '', optinRealName: '인증' })).toEqual({ main: '인증', sub: 'N**k' });
  });
  it('저장값(realName)과 표시값(optinRealName)을 따로 싣는다 — 편집기는 realName 만 다시 저장한다', async () => {
    const byKey = await getRankingsBulk([{ venueId: 'v1', date: '2026-09-01' }]);
    const [nick, opt] = byKey['v1|2026-09-01'];
    expect(nick).toMatchObject({ realName: '원문이름', optinRealName: '' });
    expect(opt).toMatchObject({ realName: '', optinRealName: '인증이름' });
  });
});

describe("홈 '지난 대회' — 켠 사람만 실명", () => {
  const src = readFileSync(join(__dirname, '..', 'components', 'features', 'PastTournaments.tsx'), 'utf-8');
  it('옵트인 실명(optinRealName)만 쓰고, 업주 원문(realName)은 쓰지 않는다', () => {
    expect(src).toMatch(/const pastName = \(e: RankingEntry\) => e\.optinRealName\?\.trim\(\) \|\| e\.nickname;/);
    expect(src).toContain('{pastName(champ)}');
    expect(src).toContain('{pastName(e)}');
    expect(src).not.toMatch(/\.realName\b/);
    expect(src).not.toMatch(/>\{(champ|e)\.nickname\}/); // 화면에 찍는 자리(키 문자열은 제외)
  });
});

describe('켜고/끄면 바로 반영된다', () => {
  it("'실명 켠 닉네임' 캐시를 버리고 다시 묻는다", async () => {
    await getVenueRealNameOptIns('v1');
    await getVenueRealNameOptIns('v1');
    expect(rpcCalls.filter((n) => n === 'venue_ranking_real_name_optins')).toHaveLength(1); // 60초 캐시
    await setMyRankingNamePref('nickname');
    await getVenueRealNameOptIns('v1');
    expect(rpcCalls.filter((n) => n === 'venue_ranking_real_name_optins')).toHaveLength(2);
  });

  it('순위 구독 화면은 같은 신호로 다시 읽고, 구독을 풀면 더 부르지 않는다', async () => {
    const onChange = vi.fn();
    const off = subscribeRankings('v1', onChange);
    await setMyRankingNamePref('real_name');
    expect(onChange).toHaveBeenCalledTimes(1);
    off();
    await setMyRankingNamePref('nickname');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('20260930c — 서버가 판정한다(판정은 _ranking_optin_real_name 한 곳)', () => {
  const SQL = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20260930c_rank_realname_optin.sql'), 'utf-8')
    .replace(/\r\n/g, '\n')
    .split('-- ════')[0]; // 리허설 주석 블록 제외
  const code = SQL.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  const fn = (name: string) => {
    const a = code.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
    expect(a).toBeGreaterThanOrEqual(0);
    return code.slice(a, code.indexOf(`revoke all on function public.${name}(`, a));
  };

  it('판정 함수: 본인 선택·본인인증·활성·제3자 불일치 + **대회 날짜(KST)에 이 프로필이 실제로 그 닉네임이었는가**', () => {
    const body = fn('_ranking_optin_real_name');
    expect(body).toContain('function public._ranking_optin_real_name(p_nickname text, p_date date)');
    for (const s of ["p.ranking_name_pref = 'real_name'", 'p.ci_hash is not null', "= 'active'",
      'is distinct from lower(btrim(p.real_name))',
      // R2: 그날 끝 시각의 **내** 닉네임 = 그 뒤 내 첫 변경의 old_nickname, 없으면(가입이 그날 끝 전일 때만) 지금 닉네임
      'where h.user_id = p.id and h.changed_at >= q.day_end',
      // F1: 계정 생성 시각은 본인이 못 바꾸는 auth.users.created_at 에서
      'case when (select u.created_at from auth.users u where u.id = p.id) < q.day_end then p.nickname end',
      // R1: 그날 KST 하루 안에 이 닉네임을 누가 얻거나 놓았으면 닫는다
      'h.changed_at >= q.day_start and h.changed_at < q.day_end',
      "(p_date::timestamp at time zone 'Asia/Seoul')"]) expect(body).toContain(s);
    expect(body).not.toMatch(/r\.created_at|nickname_owner_at|joined_at/); // 기록 시각·'놓은 기록만 보는' 공용 함수·본인이 바꾸던 가입일로 재지 않는다
    expect(code).toContain('revoke all on function public._ranking_optin_real_name(text, date) from public, anon, authenticated;');
    expect(code).toContain('revoke all on function public._ranking_optin_real_name_span(uuid, text, date, date) from public, anon, authenticated;');
  });

  it('판정을 복제하지 않는다 — 옵트인 조건(ranking_name_pref)은 판정 함수와 선택 저장 RPC 에만 있다', () => {
    const bodies = [...code.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map((m) => m[1]);
    for (const name of bodies) {
      // 가드는 판정이 아니라 프로필 보호 목록(ci_hash 등)이라 제외
      if (name === '_ranking_optin_real_name' || name === 'set_my_ranking_name_pref' || name === 'guard_profile_privileged_cols') continue;
      expect(fn(name), name).not.toMatch(/ranking_name_pref|ci_hash|nickname_owner_at|nickname_history/);
    }
  });

  it('행 단위 호출은 모두 그 행의 대회 날짜(ranking_date)를 넘긴다 — 기록 시각(created_at)은 재저장 때 now() 가 된다', () => {
    const calls = [...code.matchAll(/public\._ranking_optin_real_name\(([^)]*)\)/g)].map((m) => m[1]).filter((x) => !x.includes('text')); // 정의·권한 문장 제외
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) expect(['r.nickname, r.ranking_date', 'p_nickname, (now(']).toContain(args); // 괄호에서 잘린다
    expect(code).not.toMatch(/_ranking_optin_real_name\([^)]*created_at/);
  });

  it('venue_rankings_public: real_name 은 저장값(장부 권한자=원문), optin_real_name 은 누구에게나 같은 옵트인 실명 · DROP 뒤 권한 재부여', () => {
    const body = fn('venue_rankings_public');
    expect(body).toContain('optin_real_name text)');
    expect(body).toContain('case when v.can_see then r.real_name else o.name end as real_name');
    expect(body).toContain('o.name as optin_real_name');
    expect(body).toContain('public._ranking_optin_real_name(r.nickname, r.ranking_date) as name) o');
    expect(code).toMatch(/drop function if exists public\.venue_rankings_public\(uuid\[\], date\[\]\);[\s\S]*grant execute on function public\.venue_rankings_public\(uuid\[\], date\[\]\) to anon, authenticated, service_role;/);
  });

  it.each([
    ['current_season_standings', 's'], ['season_results', 'r'], ['venue_hall_of_fame', 'r'], ['venues_season_leaders', 'l'],
  ])('%s(표시 전용): 장부 권한자는 원문 → 옵트인 실명, 그 밖은 옵트인 실명만', (name, a) => {
    const body = fn(name);
    expect(body).toMatch(new RegExp(`case when public\\._can_see_ranking_real_names\\([^)]*\\)\\s+then coalesce\\(nullif\\(btrim\\(${a}\\.real_name\\), ''\\), `));
    expect(body).toMatch(/else (o\.name|public\._ranking_optin_real_name_span\([^)]*\)) end/);
    expect(body).not.toMatch(/ or public\._ranking_real_name_opted_in/); // 옛 OR 식(옵트인이면 원문 실명) 금지
  });

  it('전국 순위는 옵트인 실명만 싣고(원문 없음), DROP 뒤 권한을 다시 준다', () => {
    const body = fn('global_ranking_totals');
    expect(body).toContain('public._ranking_optin_real_name_span(null, r.nickname, p_since, null)');
    expect(body).not.toMatch(/\br\.real_name\b/);
    expect(code).toMatch(/drop function if exists public\.global_ranking_totals\(date\);[\s\S]*grant execute on function public\.global_ranking_totals\(date\) to anon, authenticated, service_role;/);
  });

  it('실명 공개 선택은 서버도 본인인증 뒤에만 받는다(지적 2)', () => {
    const body = fn('set_my_ranking_name_pref');
    expect(body).toMatch(/if v_pref = 'real_name' and not exists \([\s\S]*p\.ci_hash is not null[\s\S]*raise exception[\s\S]*update public\.profiles/);
    expect(code).toContain('revoke all on function public.set_my_ranking_name_pref(text) from public, anon;');
  });

  it('가드가 본인의 joined_at 변경을 막는다(3차 F1) — 라이브 본문 md5 게이트 뒤에 교체', () => {
    const body = fn('guard_profile_privileged_cols');
    expect(body).toContain('or new.joined_at is distinct from old.joined_at');
    expect(code).toMatch(/md5\(v_def\) <> 'c7e07691e719bcc27b0feb312c8aac62'[\s\S]*create or replace function public\.guard_profile_privileged_cols\(\)/);
    expect(code).toContain('revoke all on function public.guard_profile_privileged_cols() from public, anon, authenticated;');
  });

  it('닉네임 식 인덱스(지적 3)', () => {
    expect(code).toContain('create index if not exists idx_vr_nickname_ci on public.venue_rankings (lower(btrim(nickname)));');
  });
});
