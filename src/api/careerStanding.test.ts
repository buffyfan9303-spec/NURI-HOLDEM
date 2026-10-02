// L-09 (audit-link-1002.md#L-09) — '전국 상위 N%' 는 서버가 센 (내 등수, 모집단) 을 쓴다.
//
// 잡는 회귀
//   ① 화면이 보드(global_ranking_totals)를 받아 **지금 닉네임으로 찾던** 옛 방식으로 돌아가는 것
//      → 닉네임을 바꾼 사람의 옛 입상이 빠져 백분위가 틀리거나(0건이면) 아예 안 뜬다
//   ② 0 이하·NaN·null 이 '상위 0%'·'상위 100%' 같은 거짓 숫자가 되는 것
//   ③ 서버(20261003c)가 my_career_standing 을 anon 에 열거나 묶음 키를 원문으로 되돌리는 것
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: { name: string; args: unknown }[] = [];
let reply: { data: unknown; error: unknown } = { data: [], error: null };
vi.hoisted(() => { (globalThis as { window?: EventTarget }).window ??= new EventTarget(); });
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { rpc: (name: string, args: unknown) => { calls.push({ name, args }); return Promise.resolve(reply); } },
}));

import { careerPercentile, getMyCareerStanding } from './rankings';

beforeEach(() => { calls.length = 0; reply = { data: [], error: null }; });

describe('careerPercentile — 등수/모집단 → 상위 N%', () => {
  it('1/3 → 33%', () => { expect(careerPercentile({ rank: 1, population: 3 })).toBe(33); });
  it('꼴찌는 100%, 1등이 모집단 1000 이면 최소 1%(0% 를 만들지 않는다)', () => {
    expect(careerPercentile({ rank: 7, population: 7 })).toBe(100);
    expect(careerPercentile({ rank: 1, population: 1000 })).toBe(1);
  });
  it('값이 없거나 0 이하면 null = 표시 안 함', () => {
    expect(careerPercentile(null)).toBeNull();
    expect(careerPercentile(undefined)).toBeNull();
    expect(careerPercentile({ rank: 0, population: 3 })).toBeNull();
    expect(careerPercentile({ rank: 2, population: 0 })).toBeNull();
    expect(careerPercentile({ rank: -1, population: 3 })).toBeNull();
  });
});

describe('getMyCareerStanding — RPC 연결', () => {
  it("my_career_standing 을 기간의 p_since 로 부른다('all' → null)", async () => {
    reply = { data: [{ my_rank: 1, population: 3 }], error: null };
    expect(await getMyCareerStanding('all')).toEqual({ rank: 1, population: 3 });
    expect(calls).toEqual([{ name: 'my_career_standing', args: { p_since: null } }]);
  });
  it('행이 없으면(입상 0건) null — 거짓 백분위를 만들지 않는다', async () => {
    reply = { data: [], error: null };
    expect(await getMyCareerStanding()).toBeNull();
    reply = { data: null, error: null };
    expect(await getMyCareerStanding()).toBeNull();
  });
  it('숫자가 아니거나 0 인 열은 null', async () => {
    reply = { data: [{ my_rank: 'x', population: 3 }], error: null };
    expect(await getMyCareerStanding()).toBeNull();
    reply = { data: [{ my_rank: 0, population: 0 }], error: null };
    expect(await getMyCareerStanding()).toBeNull();
  });
  it('서버 오류는 삼키지 않고 던진다(호출부가 실패 = 백분위 숨김 을 정한다)', async () => {
    reply = { data: null, error: new Error('boom') };
    await expect(getMyCareerStanding()).rejects.toThrow('boom');
  });
});

describe('화면 배선 — 보드에서 닉네임으로 찾지 않는다', () => {
  const dash = readFileSync(join(__dirname, '..', 'components', 'features', 'CustomerDashboardPage.tsx'), 'utf-8');
  it('CustomerDashboardPage 는 getMyCareerStanding 을 쓰고 getGlobalRankingTotals 는 쓰지 않는다', () => {
    expect(dash).toContain("getMyCareerStanding('all')");
    expect(dash).toContain('careerPercentile(');
    expect(dash).not.toContain('getGlobalRankingTotals');
  });
});

describe('20261003c — 서버 계약(SQL 텍스트)', () => {
  const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261003c_l09_career_grouping.sql'), 'utf-8');
  it('묶음 키는 lower(btrim(nickname)) — 원문 nickname 으로 되돌리지 않는다', () => {
    expect(sql).toContain('group by lower(btrim(r.nickname))');
  });
  it('my_career_standing 은 로그인만(anon·PUBLIC 회수, authenticated 허용) · DEFINER + search_path 고정', () => {
    expect(sql).toMatch(/revoke all on function public\.my_career_standing\(date\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.my_career_standing\(date\) to authenticated, service_role;/);
    expect(sql).toContain('set search_path = public, pg_temp');
    expect(sql).toContain('auth.uid() is not null');
  });
});
