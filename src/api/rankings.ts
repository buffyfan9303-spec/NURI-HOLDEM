// src/api/rankings.ts — 매장 일일 손님 순위
import { supabase, IS_MOCK } from '../lib/supabase';

/** 매장 순위 변경 실시간 구독 — 순위 입력/수정 시 공개 표시에 자동 반영 */
export function subscribeRankings(venueId: string, onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel(`rankings:${venueId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_rankings', filter: `venue_id=eq.${venueId}` }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export interface RankingEntry {
  position: number;
  nickname: string;
  realName: string;
  prize?: string;
}

// 실명 마스킹: 홍길동 → 홍*동, 나리 → 나*, 남궁민수 → 남**수
export function maskRealName(name: string): string {
  const n = (name ?? '').trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${'*'.repeat(n.length - 2)}${n[n.length - 1]}`;
}

// 공개 표시 문자열: 닉네임(마스킹실명) — 예: 도토리(나*리)
export function rankingLabel(e: RankingEntry): string {
  const masked = maskRealName(e.realName);
  return masked ? `${e.nickname}(${masked})` : e.nickname;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(r: any): RankingEntry {
  return { position: r.position, nickname: r.nickname, realName: r.real_name ?? '', prize: r.prize ?? undefined };
}

export async function getLatestRankingDate(venueId: string): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase
    .from('venue_rankings').select('ranking_date')
    .eq('venue_id', venueId).order('ranking_date', { ascending: false }).limit(1);
  if (error) throw error;
  return data && data.length ? (data[0] as { ranking_date: string }).ranking_date : null;
}

export async function getVenueRankings(
  venueId: string,
  date?: string,
): Promise<{ date: string | null; entries: RankingEntry[] }> {
  if (IS_MOCK) return { date: null, entries: [] };
  const d = date ?? (await getLatestRankingDate(venueId));
  if (!d) return { date: null, entries: [] };
  const { data, error } = await supabase
    .from('venue_rankings').select('*')
    .eq('venue_id', venueId).eq('ranking_date', d)
    .order('position', { ascending: true });
  if (error) throw error;
  return { date: d, entries: (data ?? []).map(rowToEntry) };
}

// ── 매장 커뮤니티 누적 순위 ────────────────────────────────────────────────────
// 머니인 순위 = 순위(등수) 점수 누적, 프라이즈 순위 = 누적 프라이즈 금액(만원)
export interface RankingTotal {
  nickname: string;
  realName: string;
  moneyPoints: number; // 머니인(순위점수) 누적
  prizeMan: number;    // 프라이즈 누적(만원)
  appearances: number; // 등록 횟수
  bestPosition: number;
}

// 등수별 순위점수 — save_venue_rankings(회원 활동점수)와 동일 차등
export function placementPoints(position: number): number {
  switch (position) {
    case 1: return 10; case 2: return 7; case 3: return 5;
    case 4: return 3;  case 5: return 2; default: return 1;
  }
}

// 프라이즈 텍스트 → 만원 숫자(만원 단위 입력 기준, 콤마/단위 제거 후 첫 숫자)
export function parsePrizeMan(prize?: string | null): number {
  if (!prize) return 0;
  const m = String(prize).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? Math.round(parseFloat(m[0])) : 0;
}

export async function getVenueRankingTotals(venueId: string): Promise<RankingTotal[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('venue_rankings').select('nickname, real_name, position, prize, ranking_date')
    .eq('venue_id', venueId);
  if (error) throw error;
  const map = new Map<string, RankingTotal & { _lastDate: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const nick = String(r.nickname ?? '').trim();
    if (!nick) continue;
    const key = nick.toLowerCase();
    const cur = map.get(key) ?? {
      nickname: nick, realName: '', moneyPoints: 0, prizeMan: 0, appearances: 0, bestPosition: 9999, _lastDate: '',
    };
    cur.moneyPoints += placementPoints(r.position);
    cur.prizeMan += parsePrizeMan(r.prize);
    cur.appearances += 1;
    cur.bestPosition = Math.min(cur.bestPosition, r.position);
    const d = String(r.ranking_date ?? '');
    if (r.real_name && d >= cur._lastDate) { cur.realName = r.real_name; cur._lastDate = d; }
    map.set(key, cur);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return [...map.values()].map(({ _lastDate, ...rest }) => rest);
}

export async function saveVenueRankings(
  venueId: string,
  date: string,
  entries: { nickname: string; realName: string; prize?: string }[],
): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('save_venue_rankings', {
    p_venue_id: venueId,
    p_date: date,
    p_entries: entries.map((e) => ({ nickname: e.nickname, realName: e.realName, prize: e.prize ?? '' })),
  });
  if (error) throw error;
}
