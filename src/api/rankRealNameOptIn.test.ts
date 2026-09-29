// 오너 2026-09-30 — "기존 가입자는 기본 실명 비공개. 실명 공개는 본인이 선택" 의 계약.
//
// 잡는 회귀
//   ① 닉네임 없는 옛 순위 행이 실명 일부('홍*동')로 공개면에 나가는 것 → '참가자'
//   ② 실명 공개를 켜고/끈 뒤 '켠 닉네임' 60초 캐시가 옛 답을 들고 있어 끈 뒤에도 실명이 남는 것
//   ③ 열린 순위 화면(subscribeRankings 사용처)이 켜고/끈 것을 다시 읽지 않는 것
//   ④ 서버(20260930c): 공개 순위 RPC 가 옵트인 판정을 비켜 업주가 적은 원문 실명을 비동의자에게 내보내는 것
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rpcCalls: string[] = [];
// vitest 환경은 node 라 window 가 없다 — 앱 안 신호(EventTarget)만 흉내 낸다. import 보다 먼저 걸려야 모듈 로드 때의 리스너가 붙는다.
vi.hoisted(() => { (globalThis as { window?: EventTarget }).window ??= new EventTarget(); });
vi.mock('../lib/supabase', () => {
  const ch = { on: () => ch, subscribe: () => ch };
  return {
    IS_MOCK: false,
    supabase: {
      rpc: (name: string) => {
        rpcCalls.push(name);
        return Promise.resolve(name === 'venue_ranking_real_name_optins' ? { data: [{ nickname_key: 'nick' }], error: null } : { data: null, error: null });
      },
      channel: () => ch,
      removeChannel: () => {},
    },
  };
});

import { rankDisplay, rankingLabel, getVenueRealNameOptIns, subscribeRankings, NAMELESS_RANK_LABEL } from './rankings';
import { setMyRankingNamePref } from './rankingDisplay';

beforeEach(() => { rpcCalls.length = 0; });

describe('닉네임 없는 옛 순위 행', () => {
  it("실명 일부를 보이지 않고 '참가자' 로 쓴다(업무 경로로 실명을 받은 업주 화면이어도)", () => {
    const d = rankDisplay({ nickname: '', realName: '홍길동' }, new Set(['홍길동']));
    expect(d.main).toBe(NAMELESS_RANK_LABEL);
    expect(d.main + d.sub).not.toMatch(/[홍동]/);
    expect(rankingLabel({ position: 1, nickname: '  ', realName: '나리' })).toBe('참가자');
  });
  it('닉네임이 있으면 옵트인 전엔 닉네임만, 옵트인이면 실명(+가린 닉네임)', () => {
    expect(rankDisplay({ nickname: 'Nick', realName: '홍길동' })).toEqual({ main: 'Nick', sub: '' });
    expect(rankDisplay({ nickname: 'Nick', realName: '홍길동' }, new Set(['nick']))).toEqual({ main: '홍길동', sub: 'N**k' });
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

describe('20260930c — 서버가 판정한다', () => {
  const SQL = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20260930c_rank_realname_optin.sql'), 'utf-8')
    .split('-- ════')[0]; // 리허설 주석 블록 제외
  const fn = (name: string) => {
    const a = SQL.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
    return SQL.slice(a, SQL.indexOf(`revoke all on function public.${name}(`, a));
  };

  it.each(['venue_rankings_public', 'current_season_standings', 'season_results', 'venue_hall_of_fame', 'venues_season_leaders'])(
    '%s: 원문 실명은 장부 권한자만, 그 밖은 옵트인 실명만', (name) => {
      const body = fn(name);
      expect(body).toMatch(/case when (v\.can_see|public\._can_see_ranking_real_names\([^)]*\)) then \w+\.real_name\s+else public\._ranking_optin_real_name\(/);
      expect(body).not.toMatch(/ or public\._ranking_real_name_opted_in/); // 옛 OR 식(옵트인이면 원문 실명) 금지
    });

  it('전국 순위는 옵트인 실명만 싣고, DROP 뒤 권한을 다시 준다', () => {
    const body = fn('global_ranking_totals');
    expect(body).toContain('public._ranking_optin_real_name(r.nickname)');
    expect(body).not.toMatch(/\br\.real_name\b/);
    expect(SQL).toMatch(/drop function if exists public\.global_ranking_totals\(date\);[\s\S]*grant execute on function public\.global_ranking_totals\(date\) to anon, authenticated, service_role;/);
  });

  it('옵트인 판정은 본인인증·활성·제3자 불일치 검사를 모두 갖고, 내부 함수는 anon/authenticated 에 닫혀 있다', () => {
    const body = fn('_ranking_optin_real_name');
    for (const s of ["p.ranking_name_pref = 'real_name'", 'p.ci_hash is not null', "= 'active'", 'is distinct from lower(btrim(p.real_name))']) expect(body).toContain(s);
    expect(SQL).toContain('revoke all on function public._ranking_optin_real_name(text) from public, anon, authenticated;');
  });
});
