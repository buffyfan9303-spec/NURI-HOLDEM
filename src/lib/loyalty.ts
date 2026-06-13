// src/lib/loyalty.ts — 랭킹 허브(충성도): 주간 리그·업적 뱃지·주간 미션·명예의 전당.
// 미션/뱃지는 코드 규칙(서버 검증은 claim_mission RPC), 리그·전당은 집계 조회.
import { supabase, IS_MOCK } from './supabase';

// ── 주간 리그 ────────────────────────────────────────────────────────────────
export interface LeagueRow { userId: string; nickname: string; score: number; checkins: number; placements: number }
export interface LeagueTier { key: string; label: string; emoji: string; min: number }
export const LEAGUE_TIERS: LeagueTier[] = [
  { key: 'diamond',  label: '다이아', emoji: '💎', min: 100 },
  { key: 'platinum', label: '플래티넘', emoji: '🥈', min: 50 },
  { key: 'goldT',    label: '골드', emoji: '🥇', min: 25 },
  { key: 'silver',   label: '실버', emoji: '⚪', min: 10 },
  { key: 'bronze',   label: '브론즈', emoji: '🟤', min: 1 },
];
export function leagueTierOf(score: number): LeagueTier | null {
  return LEAGUE_TIERS.find((t) => score >= t.min) ?? null;
}
export async function getWeeklyLeague(limit = 20): Promise<LeagueRow[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('weekly_league', { p_limit: limit });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    userId: r.user_id, nickname: String(r.nickname ?? '회원'),
    score: Number(r.score) || 0, checkins: Number(r.checkins) || 0, placements: Number(r.placements) || 0,
  }));
}

// ── 주간 미션 ────────────────────────────────────────────────────────────────
export type MissionGoalType = 'checkin' | 'post' | 'moneyin';
export interface Mission { key: string; title: string; goal: number; reward: number; desc: string; type: MissionGoalType }
// 고정 미션은 custom_missions(DB)로 이관됨 — 운영자가 기본 미션까지 전부 수정/중단/삭제 가능.
// (claim_mission RPC의 옛 하드코딩 키 checkin2/post1/moneyin1 분기는 그대로 남아있어도 무해)
export const MISSIONS: Mission[] = [];

// 운영자 커스텀 미션(custom_missions) — 활성만 미션 보드에 병합. key는 'c<id>'.
const GOAL_TYPE_LABEL: Record<MissionGoalType, (n: number) => string> = {
  checkin: (n) => `이번 주에 매장 QR 체크인을 ${n}번 하세요`,
  post: (n) => `이번 주에 커뮤니티 글을 ${n}개 쓰세요`,
  moneyin: (n) => `이번 주에 대회 순위(머니인)에 ${n}번 들어보세요`,
};
export interface CustomMissionRow { id: number; title: string; goal_type: MissionGoalType; goal: number; reward: number; active: boolean }
export async function getActiveMissions(): Promise<Mission[]> {
  if (IS_MOCK) return MISSIONS;
  const { data } = await supabase.from('custom_missions').select('*').eq('active', true).order('id');
  const customs: Mission[] = ((data ?? []) as CustomMissionRow[]).map((r) => ({
    key: `c${r.id}`, title: r.title, goal: r.goal, reward: r.reward,
    desc: GOAL_TYPE_LABEL[r.goal_type]?.(r.goal) ?? '', type: r.goal_type,
  }));
  return [...MISSIONS, ...customs];
}
// 관리자용 CRUD(전체 조회·저장·삭제) — RLS가 admin만 쓰기 허용
export async function adminListCustomMissions(): Promise<CustomMissionRow[]> {
  const { data, error } = await supabase.from('custom_missions').select('*').order('id');
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomMissionRow[];
}
export async function adminSaveCustomMission(m: Partial<CustomMissionRow> & Pick<CustomMissionRow, 'title' | 'goal_type' | 'goal' | 'reward'>): Promise<void> {
  const row = { title: m.title.trim(), goal_type: m.goal_type, goal: m.goal, reward: m.reward, active: m.active ?? true };
  const q = m.id
    ? supabase.from('custom_missions').update(row).eq('id', m.id)
    : supabase.from('custom_missions').insert(row);
  const { error } = await q;
  if (error) throw new Error(error.message);
}
export async function adminDeleteCustomMission(id: number): Promise<void> {
  const { error } = await supabase.from('custom_missions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
function weekStartStr(): string {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return mon.toLocaleDateString('en-CA');
}
export interface MissionProgress { key: string; current: number; claimed: boolean }
export async function getMissionProgress(nickname: string | null, missions: Mission[] = MISSIONS): Promise<MissionProgress[]> {
  if (IS_MOCK) return missions.map((m) => ({ key: m.key, current: 0, claimed: false }));
  const ws = weekStartStr();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return missions.map((m) => ({ key: m.key, current: 0, claimed: false }));
  const wsIso = new Date(`${ws}T00:00:00`).toISOString();
  const [ck, po, mo, cl] = await Promise.all([
    supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', wsIso),
    supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', wsIso),
    nickname
      ? supabase.from('venue_rankings').select('id', { count: 'exact', head: true }).ilike('nickname', nickname).gte('ranking_date', ws)
      : Promise.resolve({ count: 0 } as { count: number | null }),
    supabase.from('mission_claims').select('mission_key').eq('user_id', uid).eq('week_start', ws),
  ]);
  const claimed = new Set(((cl as { data?: { mission_key: string }[] }).data ?? []).map((r) => r.mission_key));
  // 유형별 주간 카운트 — 고정·커스텀 미션이 같은 카운트를 공유(목표만 다름)
  const byType: Record<MissionGoalType, number> = {
    checkin: (ck as { count: number | null }).count ?? 0,
    post: (po as { count: number | null }).count ?? 0,
    moneyin: (mo as { count: number | null }).count ?? 0,
  };
  return missions.map((m) => ({ key: m.key, current: byType[m.type] ?? 0, claimed: claimed.has(m.key) }));
}
export async function claimMission(key: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_mission', { p_key: key });
  if (error) throw new Error(error.message);
  return (data as string) ?? '보상 지급 완료!';
}

// ── 업적 뱃지(자동 산출 — 조건 충족 시 즉시 표시) ─────────────────────────────
export interface BadgeDef { key: string; emoji: string; label: string; desc: string; check: (s: BadgeStats) => boolean }
export interface BadgeStats { moneyin: number; bestPosition: number; visits: number; streak: number; points: number }
export const BADGES: BadgeDef[] = [
  { key: 'first_moneyin', emoji: '🎯', label: '첫 머니인', desc: '대회 순위에 처음 입상', check: (s) => s.moneyin >= 1 },
  { key: 'moneyin5', emoji: '🔥', label: '머니인 5회', desc: '입상 5회 달성', check: (s) => s.moneyin >= 5 },
  { key: 'moneyin20', emoji: '⚡', label: '머니인 20회', desc: '입상 20회 달성', check: (s) => s.moneyin >= 20 },
  { key: 'champion', emoji: '👑', label: '챔피언', desc: '대회 우승(1위) 경험', check: (s) => s.bestPosition === 1 },
  { key: 'visit5', emoji: '🚪', label: '단골 입문', desc: '매장 체크인 5회', check: (s) => s.visits >= 5 },
  { key: 'visit20', emoji: '🏠', label: '진성 단골', desc: '매장 체크인 20회', check: (s) => s.visits >= 20 },
  { key: 'visit50', emoji: '🏆', label: '매장의 기둥', desc: '매장 체크인 50회', check: (s) => s.visits >= 50 },
  { key: 'streak7', emoji: '🔥', label: '7일 개근', desc: '7일 연속 체크인', check: (s) => s.streak >= 7 },
  { key: 'streak30', emoji: '🌋', label: '한 달 개근', desc: '30일 연속 체크인', check: (s) => s.streak >= 30 },
  { key: 'pts1000', emoji: '⭐', label: '활동가', desc: '활동점수 1,000점', check: (s) => s.points >= 1000 },
  { key: 'pts5000', emoji: '🌟', label: '헤비유저', desc: '활동점수 5,000점', check: (s) => s.points >= 5000 },
  { key: 'pts14000', emoji: '💫', label: '레전드', desc: '활동점수 14,000점(K)', check: (s) => s.points >= 14000 },
];
export async function getMyBadgeStats(nickname: string | null, points: number): Promise<BadgeStats> {
  const empty: BadgeStats = { moneyin: 0, bestPosition: 9999, visits: 0, streak: 0, points };
  if (IS_MOCK) return empty;
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return empty;
  const [vr, ck, pf] = await Promise.all([
    nickname
      ? supabase.from('venue_rankings').select('position').ilike('nickname', nickname)
      : Promise.resolve({ data: [] as { position: number }[] }),
    supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    supabase.from('profiles').select('checkin_streak').eq('id', uid).single(),
  ]);
  const positions = ((vr as { data?: { position: number }[] }).data ?? []).map((r) => r.position);
  return {
    moneyin: positions.length,
    bestPosition: positions.length ? Math.min(...positions) : 9999,
    visits: (ck as { count: number | null }).count ?? 0,
    streak: (pf as { data?: { checkin_streak?: number } }).data?.checkin_streak ?? 0,
    points,
  };
}

// ── 월간 명예의 전당(지난달 입상 점수 TOP3) ──────────────────────────────────
export interface HallRow { nickname: string; pts: number; wins: number }
export async function getMonthlyHall(): Promise<{ label: string; rows: HallRow[] }> {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const start = lastMonth.toLocaleDateString('en-CA');
  const end = new Date(now.getFullYear(), now.getMonth(), 0).toLocaleDateString('en-CA');
  const label = `${lastMonth.getMonth() + 1}월`;
  if (IS_MOCK) return { label, rows: [] };
  const { data } = await supabase.from('venue_rankings').select('nickname, position')
    .gte('ranking_date', start).lte('ranking_date', end);
  const map = new Map<string, HallRow>();
  for (const r of (data ?? []) as { nickname: string | null; position: number }[]) {
    const nick = (r.nickname ?? '').trim();
    if (!nick) continue;
    const key = nick.toLowerCase();
    const cur = map.get(key) ?? { nickname: nick, pts: 0, wins: 0 };
    cur.pts += r.position === 1 ? 10 : r.position === 2 ? 7 : r.position === 3 ? 5 : 3;
    if (r.position === 1) cur.wins += 1;
    map.set(key, cur);
  }
  return { label, rows: [...map.values()].sort((a, b) => b.pts - a.pts || b.wins - a.wins).slice(0, 3) };
}

// ── 포인트 상점(코스메틱 마크) — 활동점수 '도달'로 해금(차감 없음 → 등급 영향 없음) ──
export interface ShopMark { key: string; emoji: string; name: string; need: number; desc: string }
export const SHOP_MARKS: ShopMark[] = [
  { key: 'spade_white', emoji: '♤', name: '화이트 스페이드', need: 100,   desc: '첫 걸음 — 100점 도달' },
  { key: 'club_green',  emoji: '♧', name: '그린 클로버',     need: 500,   desc: '단골의 증표 — 500점' },
  { key: 'heart_red',   emoji: '♥', name: '레드 하트',       need: 1500,  desc: '열정의 증표 — 1,500점' },
  { key: 'diamond_blue',emoji: '♦', name: '블루 다이아',     need: 4000,  desc: '상위권 — 4,000점' },
  { key: 'spade_gold',  emoji: '♠', name: '골든 스페이드',   need: 8000,  desc: '고수의 상징 — 8,000점' },
  { key: 'crown',       emoji: '👑', name: '크라운',          need: 14000, desc: 'KK 등극 — 14,000점' },
];

/** 내가 장착한 마크 키 조회 */
export async function getMyEquippedMark(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return null;
  const { data } = await supabase.from('profiles').select('equipped_mark').eq('id', uid).single();
  return (data?.equipped_mark as string | null) ?? null;
}

/** 마크 장착/해제(null) — 본인 프로필만(RLS) */
export async function setEquippedMark(key: string | null): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('profiles').update({ equipped_mark: key }).eq('id', uid);
  if (error) throw new Error(error.message);
}

/** 마크 키 → 이모지(없으면 빈 문자열) */
export const markEmojiOf = (key?: string | null): string =>
  key ? (SHOP_MARKS.find((m) => m.key === key)?.emoji ?? '') : '';
