// src/api/rankingConsent.ts — 랭킹 공개 동의로 게이트된 조회.
//
// 오너 #12: 메인 '이번 주 머니인 킹' 의 닉네임 옆에 '가장 자주 방문한 매장' 을 붙인다.
// 다만 "이 사람은 주로 여기 다닌다"는 이동·행동 패턴이라 닉네임 하나만 공개하던 것과
// 성격이 다르다 → profiles.public_ranking_consent 에 동의한 회원만 서버가 돌려준다.
// 규칙(방문의 정의·동률·기록없음)은 전부 서버 RPC 한 곳에만 있다:
//   supabase/migrations/20260829g_public_ranking_consent.sql · public.ranking_top_venues()
// 여기서 재계산하지 않는다 — 규칙이 둘로 갈리면 화면과 DB 가 다른 매장을 말하게 된다.
//
// 왜 rankings.ts 가 아니라 새 파일인가: 같은 웨이브의 다른 작업이 rankings.ts 를
// 수정 중이라 충돌 면적을 만들지 않으려고 분리했다. 안정되면 rankings.ts 로 합쳐도 된다.
import { supabase, IS_MOCK } from '../lib/supabase';

/**
 * 닉네임 → 가장 자주 방문한 매장명. 아래는 전부 '없음'으로 취급해 빈 Map 을 돌려준다:
 *   비로그인(RPC 는 authenticated 전용) · 미동의 · 체크인 기록 없음 · 동명이인.
 * 호출부는 값이 없으면 매장명을 아예 그리지 않는다(빈 괄호 금지).
 */
export async function getRankingTopVenues(nicknames: string[]): Promise<Map<string, string>> {
  const list = [...new Set(nicknames.map((n) => n.trim()).filter(Boolean))].slice(0, 20);
  if (IS_MOCK || list.length === 0) return new Map();
  const { data, error } = await supabase.rpc('ranking_top_venues', { p_nicknames: list });
  if (error) return new Map(); // 403(비로그인)·RPC 미배포 모두 조용히 '표기 없음'
  const out = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const nick = String(r.nickname ?? '').trim();
    const venue = String(r.venue_name ?? '').trim();
    if (nick && venue) out.set(nick, venue);
  }
  return out;
}
