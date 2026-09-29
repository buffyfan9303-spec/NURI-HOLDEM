// #15(2026-09-29) 차단 목록 조회 실패를 '빈 목록' 으로 돌리지 않는다 — 빈 집합을 받으면 BlockContext 가
// 이미 받은 목록을 덮어 차단이 조용히 풀렸다(blocks.ts:22). 던지면 BlockContext.reload 가 직전 목록을 유지한다.
// 실행: npx vitest run src/api/blocks.error.test.ts
import { describe, it, expect, vi } from 'vitest';

// supabase `{error}` 는 Error 가 아닌 평범한 객체다(postgrest-js 비-throw 경로)
const chain: Record<string, unknown> = {};
for (const k of ['from', 'select', 'order']) chain[k] = () => chain;
chain.then = (res: (v: unknown) => void) => res({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });

vi.mock('../lib/supabase', () => ({ IS_MOCK: false, supabase: chain }));
vi.mock('./_session', () => ({ currentUser: async () => ({ id: 'A' }) }));

const { getMyBlockedIds, listMyBlocks } = await import('./blocks');

describe('차단 목록 조회 실패', () => {
  it('🔴 getMyBlockedIds 는 빈 집합이 아니라 오류를 던진다', async () => {
    await expect(getMyBlockedIds()).rejects.toBeInstanceOf(Error);
  });
  it('🔴 listMyBlocks 도 빈 배열이 아니라 오류를 던진다', async () => {
    await expect(listMyBlocks()).rejects.toBeInstanceOf(Error);
  });
});
