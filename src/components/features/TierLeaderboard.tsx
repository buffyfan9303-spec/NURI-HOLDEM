// src/components/features/TierLeaderboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { getDomesticRankings, myRankVerifications, submitRankVerification, type RankVerification } from '../../api/rankverify';
import { useAuth } from '../../contexts/AuthContext';
import TierBadge, { tierOf, tierProgress, allTiers, isAceRank, ACE_TOP_RANK, ACE_MIN_POINTS } from '../atoms/TierBadge';
import { getActivityLeaderboard, type LeaderboardEntry } from '../../api/community';
import { getGlobalRankingTotals, type GlobalRankingTotal } from '../../api/rankings';
import { useToast } from '../atoms/Toast';
import CountUp from '../atoms/CountUp';
import {
  getWeeklyLeague, leagueTierOf, LEAGUE_TIERS, type LeagueRow,
  MISSIONS, getActiveMissions, getMissionProgress, claimMission, type Mission, type MissionProgress,
  BADGES, getMyBadgeStats, type BadgeStats,
  SHOP_MARKS, getMyEquippedMark, setEquippedMark as saveEquippedMark,
  getMonthlyHall, type HallRow,
} from '../../lib/loyalty';

// 통합 랭킹 허브 — 활동/머니인/프라이즈 + 주간 리그·업적·미션·명예의 전당(충성도)
type Board = 'activity' | 'moneyin' | 'prize' | 'league' | 'badges' | 'missions' | 'hall' | 'shop' | 'domestic' | 'verify';
const BOARD_LABEL: Record<Board, string> = {
  activity: '활동 순위', moneyin: '머니인', prize: '프라이즈', shop: '상점', domestic: '국내 순위', verify: '순위 인증',
  league: '주간 리그', badges: '업적', missions: '미션', hall: '명예의 전당',
};
const BOARD_DESC: Record<Board, string> = {
  domestic: '외부 대회 입상을 인증한 회원들의 누적 머니인 랭킹 — 순위 인증 탭에서 신청하세요.',
  verify: '대회 입상 증빙 2장(머니인·신분증)을 올려 운영자 승인을 받으면 국내 순위에 합산됩니다.',
  shop: '활동점수 도달로 해금되는 마크 — 장착하면 닉네임 옆에 표시됩니다(점수 차감·금전 가치 없음).',
  activity: '접속·글쓰기·댓글 활동 점수 — 등급(2·3~AA)과 연동. 아래 주간 미션을 달성하면 점수를 바로 받아요.',
  moneyin: '전국 매장 순위 등록(입상) 횟수 합산 — 가장 많이 머니인한 플레이어.',
  prize: '전국 매장 프라이즈 점수 합산(금전적 가치 없음).',
  league: '이번 주 활약(체크인 ×3 + 입상 점수) — 월요일마다 새로 시작! 티어를 지켜내세요.',
  badges: '조건을 달성하면 자동으로 열리는 업적 뱃지 — 모아서 프로필을 채우세요.',
  missions: '이번 주 미션 — 달성하면 활동점수 보상을 바로 받아요. 월요일 리셋.',
  hall: '지난달 가장 빛난 플레이어 TOP3 — 매월 1일 갱신되는 명예의 전당.',
};

function RankNum({ n }: { n: number }) {
  const top = n <= 3;
  const colors = ['#FFD100', '#C0C8D8', '#E0945A'];
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-2xs font-extrabold tabular-nums shrink-0"
      style={
        top
          ? { background: colors[n - 1], color: '#0a0c0f' }
          : { background: 'transparent', color: '#7C8696', border: '1px solid #2a2f3a' }
      }
    >
      {n}
    </span>
  );
}

export default function TierLeaderboard() {
  const { user, refreshProfile } = useAuth();
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLadder, setShowLadder] = useState(false);
  const [board, setBoard] = useState<Board>('activity');
  const [global, setGlobal] = useState<GlobalRankingTotal[]>([]);
  const [globalLoaded, setGlobalLoaded] = useState(false);
  // 충성도 허브 — 주간 리그/업적/미션/명예의 전당(보드 진입 시 1회 로드)
  const toast = useToast();
  const [league, setLeague] = useState<LeagueRow[] | null>(null);
  const [badgeStats, setBadgeStats] = useState<BadgeStats | null>(null);
  const [equippedMark, setEquippedMark] = useState<string | null | undefined>(undefined); // 상점: 장착 마크(undefined=미로드)
  const [equipBusy, setEquipBusy] = useState<string | null>(null);
  const [domestic, setDomestic] = useState<{ nickname: string; totalWon: number; wins: number }[] | null>(null);
  const [myVerifs, setMyVerifs] = useState<RankVerification[] | null>(null);
  const [vForm, setVForm] = useState({ event: '', amount: '' });
  const [vProof, setVProof] = useState<File | null>(null);
  const [vIdCard, setVIdCard] = useState<File | null>(null);
  const [vBusy, setVBusy] = useState(false);
  // 행 닉네임 앞 장착 마크 — equippedMark 없는 행 타입(주간 리그 등)도 안전
  const markPrefix = (r: unknown): string => {
    const k = (r as { equippedMark?: string | null }).equippedMark;
    return k ? ((SHOP_MARKS.find((m) => m.key === k)?.emoji ?? '') + ' ') : '';
  };
  const submitVerify = async () => {
    if (!user || vBusy) return;
    if (!vForm.event.trim() || !vForm.amount || !vProof || !vIdCard) return;
    setVBusy(true);
    try {
      await submitRankVerification({
        nickname: user.nickname ?? user.name ?? '회원',
        eventName: vForm.event, amountWon: Number(vForm.amount.replace(/[^\d]/g, '')) || 0,
        proof: vProof, idCard: vIdCard,
      });
      setVForm({ event: '', amount: '' }); setVProof(null); setVIdCard(null);
      setMyVerifs(null); myRankVerifications().then(setMyVerifs).catch(() => {});
    } catch { /* 실패 시 입력 유지 */ }
    finally { setVBusy(false); }
  };
  const handleEquip = async (key: string | null) => {
    if (equipBusy !== null) return;
    setEquipBusy(key ?? '');
    try {
      await saveEquippedMark(key);
      setEquippedMark(key);
    } catch { /* 실패 시 기존 유지 */ }
    finally { setEquipBusy(null); }
  };
  const [missions, setMissions] = useState<MissionProgress[] | null>(null);
  const [missionDefs, setMissionDefs] = useState<Mission[]>(MISSIONS);
  const [hall, setHall] = useState<{ label: string; rows: HallRow[] } | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  useEffect(() => {
    if (board === 'league' && league === null) getWeeklyLeague(20).then(setLeague).catch(() => setLeague([]));
    if (board === 'badges' && badgeStats === null && user) {
      getMyBadgeStats(user.nickname ?? null, user.activityPoints ?? 0).then(setBadgeStats).catch(() => {});
    }
    if ((board === 'missions' || board === 'activity') && missions === null && user) {
      // 고정 3종 + 운영자 커스텀 미션 병합 → 병합 목록 기준으로 진행도 조회
      getActiveMissions()
        .then((defs) => { setMissionDefs(defs); return getMissionProgress(user.nickname ?? null, defs); })
        .then(setMissions)
        .catch(() => setMissions([]));
    }
    if (board === 'hall' && hall === null) getMonthlyHall().then(setHall).catch(() => setHall({ label: '', rows: [] }));
    if (board === 'domestic' && domestic === null) getDomesticRankings(30).then(setDomestic).catch(() => setDomestic([]));
    if (board === 'verify' && myVerifs === null && user) myRankVerifications().then(setMyVerifs).catch(() => setMyVerifs([]));
    if (board === 'shop' && equippedMark === undefined && user) {
      getMyEquippedMark().then((k) => setEquippedMark(k)).catch(() => setEquippedMark(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, user?.id]);
  const handleClaim = async (key: string) => {
    setClaiming(key);
    try {
      const msg = await claimMission(key);
      toast.show(`🎁 ${msg}`, 'success');
      setMissions((prev) => prev ? prev.map((m) => (m.key === key ? { ...m, claimed: true } : m)) : prev);
      await refreshProfile?.();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '보상 받기 실패', 'error');
    } finally {
      setClaiming(null);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    getActivityLeaderboard(30)
      .then((r) => { if (active) setRows(r); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.activityPoints]);

  // 머니인/프라이즈 보드 — 전 매장 통합 집계(최초 진입 시 1회 로드)
  useEffect(() => {
    if (board === 'activity' || globalLoaded) return;
    let active = true;
    getGlobalRankingTotals()
      .then((r) => { if (active) { setGlobal(r); setGlobalLoaded(true); } })
      .catch(() => { if (active) setGlobalLoaded(true); });
    return () => { active = false; };
  }, [board, globalLoaded]);

  const globalRows = useMemo(() => {
    const arr = [...global];
    arr.sort((a, b) => board === 'prize'
      ? (b.prizePoints - a.prizePoints) || (b.moneyinCount - a.moneyinCount)
      : (b.moneyinCount - a.moneyinCount) || (b.prizePoints - a.prizePoints));
    return arr.slice(0, 30);
  }, [global, board]);

  const myProg = user ? tierProgress(user.activityPoints ?? 0) : null;
  const isAdmin = user?.role === 'admin';
  const myRank = useMemo(() => {
    if (!user) return null;
    const i = rows.findIndex((r) => r.id === user.id);
    return i >= 0 ? i + 1 : null;
  }, [rows, user]);
  // A(에이스) = K(14,000점) 달성 + 전체 상위 10위 이내(상대평가)
  const myIsAce = !isAdmin && isAceRank(user?.activityPoints ?? 0, myRank);

  // 주간 미션 블록 — '활동 순위' 보드 하단에 함께 표시(미션 보드 병합)
  const missionsBlock = (
          !user ? <p className="py-6 text-center text-2xs text-ink-muted">로그인하면 주간 미션에 참여할 수 있습니다</p>
          : missions === null ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
          : (
            <ul className="space-y-1.5">
              {missionDefs.map((m) => {
                const p = missions.find((x) => x.key === m.key);
                const cur = Math.min(p?.current ?? 0, m.goal);
                const done = (p?.current ?? 0) >= m.goal;
                const claimed = p?.claimed ?? false;
                return (
                  <li key={m.key} className="rounded-card border border-border-subtle bg-surface-high p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink-primary">{m.title} <span className="font-extrabold text-emerald-400">+{m.reward}점</span></p>
                        <p className="text-2xs text-ink-muted">{m.desc}</p>
                      </div>
                      {claimed ? (
                        <span className="shrink-0 rounded-badge bg-surface-float px-2 py-1 text-2xs font-bold text-ink-muted">✅ 받음</span>
                      ) : done ? (
                        <button type="button" disabled={claiming === m.key} onClick={() => handleClaim(m.key)}
                          className="btn-primary shrink-0 px-3 py-1.5 text-xs disabled:opacity-60">🎁 받기</button>
                      ) : (
                        <span className="shrink-0 text-xs font-bold tabular-nums text-ink-secondary">{cur}/{m.goal}</span>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-float">
                      <div className={['h-full rounded-full transition-all', done ? 'bg-emerald-400' : 'bg-gold-300'].join(' ')} style={{ width: `${Math.round((cur / m.goal) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )
  );

  return (
    <div className="space-y-3 animate-fade-in">
      {/* 내 등급 카드 */}
      {user && myProg && (
        <section className="rounded-card border border-gold-400/40 bg-gradient-to-br from-gold-300/[0.07] to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TierBadge points={user.activityPoints ?? 0} size={30} admin={isAdmin} overallRank={myRank} />
              <div>
                <p className="text-2xs text-ink-muted">내 등급</p>
                <p className="text-lg font-extrabold text-ink-primary leading-tight">
                  {isAdmin ? 'SS' : myIsAce ? 'AA' : myProg.current.label}
                  <span className="ml-1.5 text-xs font-semibold text-ink-muted">등급</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xs text-ink-muted">활동 점수</p>
              <p className="text-lg font-extrabold text-gold-300 tabular-nums leading-tight">
                <CountUp value={user.activityPoints ?? 0} />
              </p>
              {!isAdmin && myRank && <p className="text-2xs text-ink-muted">전체 {myRank}위</p>}
            </div>
          </div>

          {/* 다음 등급 진행률 (운영자는 SS 고정) */}
          {isAdmin ? (
            <p className="mt-3 text-2xs font-bold text-danger-light">운영자 전용 SS 등급 · 랭킹 집계 제외</p>
          ) : myProg.next ? (
            <div className="mt-3">
              <div className="flex items-center justify-between text-2xs text-ink-muted mb-1">
                <span>다음 등급 <span className="font-bold text-ink-secondary">{myProg.next.label}</span></span>
                <span className="tabular-nums">{myProg.toNext.toLocaleString()}점 남음</span>
              </div>
              <div className="h-2 rounded-full bg-surface-high overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold-300 transition-all"
                  style={{ width: `${Math.round(myProg.ratio * 100)}%` }}
                />
              </div>
            </div>
          ) : myIsAce ? (
            <p className="mt-3 text-2xs font-bold text-gold-300">AA 등급 달성 · 전체 상위 {ACE_TOP_RANK}위</p>
          ) : (
            <p className="mt-3 text-2xs font-bold text-gold-300">KK 등급(최고 점수) · 전체 {ACE_TOP_RANK}위 안에 들면 AA 등급</p>
          )}

          {/* 점수 적립 안내 */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              { k: '접속', v: '+1' },
              { k: '글쓰기', v: '+3' },
              { k: '댓글', v: '+1' },
            ].map((it) => (
              <span key={it.k} className="inline-flex items-center gap-1 px-2 py-1 rounded-badge bg-surface-high border border-border-subtle text-2xs">
                <span className="text-ink-secondary">{it.k}</span>
                <span className="font-bold text-emerald-400">{it.v}</span>
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowLadder((v) => !v)}
            className="mt-2 text-2xs font-semibold text-gold-300 hover:text-gold-200"
          >
            {showLadder ? '등급표 닫기' : '전체 등급표 보기'}
          </button>

          {showLadder && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 animate-slide-up">
              {/* A — 점수가 아닌 상대평가(명예) 등급 */}
              <div className="col-span-2 flex items-center justify-between px-2 py-1.5 rounded-input border border-gold-400/60 bg-gradient-to-r from-gold-300/15 to-transparent">
                <span className="inline-flex items-center gap-1.5">
                  <TierBadge points={ACE_MIN_POINTS} size={16} overallRank={1} />
                  <span className="text-2xs font-bold text-gold-300">AA 등급</span>
                </span>
                <span className="text-2xs text-ink-muted">KK 달성 + 전체 상위 {ACE_TOP_RANK}명</span>
              </div>
              {allTiers().slice().reverse().map((t) => (
                <div
                  key={t.key}
                  className={[
                    'flex items-center justify-between px-2 py-1.5 rounded-input border',
                    t.rank === myProg.current.rank
                      ? 'border-gold-400/50 bg-gold-300/[0.06]'
                      : 'border-border-subtle bg-surface-high',
                  ].join(' ')}
                >
                  <TierBadge points={t.min} size={16} />
                  <span className="text-2xs text-ink-muted tabular-nums">{t.min.toLocaleString()}점~</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 랭킹 리스트 — 다중 보드(활동/머니인/프라이즈) */}
      <section>
        <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5 mb-1.5 overflow-x-auto scrollbar-none lg:flex-wrap lg:overflow-visible">
          {(['activity', 'league', 'hall', 'moneyin', 'domestic', 'verify', 'shop'] as Board[]).map((b) => (
            <button key={b} type="button" onClick={() => setBoard(b)}
              className={['relative shrink-0 px-2 lg:px-3 py-1.5 text-[11px] lg:text-xs font-bold rounded-[6px] transition-colors duration-300',
                board === b ? 'text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
              {board === b && (
                <motion.span layoutId="rank-board-pill" aria-hidden
                  className="absolute inset-0 rounded-[6px] bg-gold-300"
                  transition={{ type: 'spring', stiffness: 700, damping: 42 }} />
              )}
              <span className="relative">{BOARD_LABEL[b]}</span>
            </button>
          ))}
        </div>
        <p className="mb-2 text-2xs text-ink-muted">{BOARD_DESC[board]}</p>

        {board === 'league' ? (
          league === null ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
          : league.length === 0 ? <p className="py-6 text-center text-2xs text-ink-muted">이번 주 활동 기록이 아직 없습니다 — 체크인·입상으로 리그에 입장하세요!</p>
          : (() => {
            // 리그 UI(레퍼런스: 리스트 사이 "내 카드" 빅 강조 + 상단 승급 안내 배너)
            const me = user ? league.find((r) => r.userId === user.id) ?? null : null;
            const myRank = me ? league.indexOf(me) + 1 : null;
            const nextTier = me ? [...LEAGUE_TIERS].reverse().find((t) => t.min > me.score) ?? null : null;
            return (
              <div className="space-y-2">
                {/* 승급 안내 배너 — 다음 티어까지 남은 점수 */}
                {me && (
                  <div className="rounded-card border border-gold-400/30 bg-gold-300/10 px-3 py-2 text-center text-xs font-semibold text-gold-300">
                    {nextTier
                      ? `${nextTier.min - me.score}점만 더 모으면 ${nextTier.emoji} ${nextTier.label} 티어로 승급해요`
                      : '💎 최고 티어 — 이번 주 왕좌를 지키세요!'}
                  </div>
                )}
                <ul className="overflow-hidden rounded-card border border-border-subtle bg-surface-high">
                  {league.map((r, i) => {
                    const t = leagueTierOf(r.score);
                    const isMe = user?.id === r.userId;
                    if (isMe) {
                      // 내 순위 빅 카드 — 리스트 흐름 속 인라인 강조(이미지 패턴)
                      return (
                        <li key={r.userId} className="border-b border-y border-gold-400/40 bg-gold-300/[0.08] px-3 py-3 last:border-b-0">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-300 text-base font-extrabold text-ink-inverse">
                              {r.nickname.slice(0, 1)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-gold-300">{myRank}위 · {markPrefix(r)}{r.nickname} <span className="text-ink-muted font-semibold">(나)</span></p>
                              <p className="text-2xl font-extrabold leading-tight tabular-nums text-ink-primary">
                                {r.score}<span className="ml-0.5 text-xs font-bold text-ink-muted">점</span>
                              </p>
                              <p className="text-2xs text-ink-muted">체크인 {r.checkins}회 · 입상 {r.placements}회</p>
                            </div>
                            {t && (
                              <span className="shrink-0 rounded-badge border border-gold-400/40 bg-surface-float px-2 py-1 text-xs font-bold text-gold-300">
                                {t.emoji} {t.label}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={r.userId} className="flex items-center gap-2.5 border-b border-border-subtle px-3 py-2 last:border-b-0">
                        <RankNum n={i + 1} />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-semibold text-ink-primary truncate">{markPrefix(r)}{r.nickname}</span>
                          <span className="block text-2xs text-ink-muted">체크인 {r.checkins}회 · 입상 {r.placements}회</span>
                        </div>
                        {t && <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs font-bold text-ink-secondary">{t.emoji} {t.label}</span>}
                        <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-gold-300">{r.score}</span>
                      </li>
                    );
                  })}
                </ul>
                {/* TOP20 밖이거나 이번 주 무활동 — 입장 안내 */}
                {user && !me && !isAdmin && (
                  <p className="rounded-card border border-border-subtle bg-surface-high px-3 py-2 text-center text-2xs text-ink-muted">
                    아직 이번 주 리그 점수가 없어요 — 체크인(+3)·입상으로 리그에 입장하세요!
                  </p>
                )}
                {/* 티어 메달 진열장 — 브론즈~다이아(레퍼런스 하단 메달 행). 내 티어 하이라이트, 미달성은 흐림 */}
                <div className="grid grid-cols-5 gap-1.5">
                  {[...LEAGUE_TIERS].reverse().map((t) => {
                    const mine = me ? leagueTierOf(me.score)?.key === t.key : false;
                    const reached = me ? me.score >= t.min : false;
                    return (
                      <div key={t.key}
                        className={['rounded-card border px-1 py-2 text-center transition-colors',
                          mine ? 'border-gold-400/60 bg-gold-300/10'
                            : reached ? 'border-border-subtle bg-surface-high'
                            : 'border-border-subtle bg-surface-high opacity-40'].join(' ')}>
                        <p className="text-xl leading-none">{t.emoji}</p>
                        <p className={['mt-1 text-2xs font-bold', mine ? 'text-gold-300' : 'text-ink-secondary'].join(' ')}>{t.label}</p>
                        <p className="text-[10px] tabular-nums text-ink-muted">{t.min}점~</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        ) : board === 'missions' ? (
          missionsBlock
        ) : board === 'badges' ? (
          !user ? <p className="py-6 text-center text-2xs text-ink-muted">로그인하면 업적을 모을 수 있습니다</p>
          : badgeStats === null ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
          : (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {BADGES.map((b) => {
                const got = b.check(badgeStats);
                return (
                  <div key={b.key} title={b.desc}
                    className={['rounded-card border p-2.5 text-center transition-colors', got ? 'border-gold-400/50 bg-gold-300/[0.08]' : 'border-border-subtle bg-surface-high opacity-55'].join(' ')}>
                    <p className={['text-xl leading-none', got ? '' : 'grayscale'].join(' ')}>{b.emoji}</p>
                    <p className={['mt-1 text-xs font-bold', got ? 'text-gold-300' : 'text-ink-secondary'].join(' ')}>{b.label}</p>
                    <p className="mt-0.5 text-2xs leading-tight text-ink-muted">{b.desc}</p>
                  </div>
                );
              })}
            </div>
          )
        ) : board === 'domestic' ? (
          domestic === null ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
          : domestic.length === 0 ? <p className="py-6 text-center text-2xs text-ink-muted">아직 인증된 입상이 없습니다 — '순위 인증' 탭에서 첫 주인공이 되어보세요!</p>
          : (
            <ul className="space-y-1">
              {domestic.map((r, i) => (
                <li key={r.nickname} className="flex items-center gap-2.5 rounded-input bg-surface-high px-3 py-2">
                  <span className="w-6 shrink-0 text-center text-sm font-extrabold tabular-nums text-gold-300">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{r.nickname}</span>
                  <span className="shrink-0 text-2xs text-ink-muted">{r.wins}회</span>
                  <span className="shrink-0 text-sm font-extrabold tabular-nums text-emerald-300">{(r.totalWon / 10000).toLocaleString()}만</span>
                </li>
              ))}
            </ul>
          )
        ) : board === 'verify' ? (
          !user ? <p className="py-6 text-center text-2xs text-ink-muted">로그인하면 입상 인증을 신청할 수 있습니다</p>
          : (
            <div className="space-y-2.5">
              <div className="space-y-1.5 rounded-card border border-border-default bg-surface-high p-3">
                <input value={vForm.event} onChange={(e) => setVForm((f) => ({ ...f, event: e.target.value }))} maxLength={60}
                  placeholder="대회명 (예: ○○ 인비테이셔널)" className="input w-full text-sm" />
                <div className="relative">
                  <input value={vForm.amount} inputMode="numeric" onChange={(e) => setVForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d]/g, '') }))}
                    placeholder="머니인 금액(원)" className="input w-full text-sm pr-8 tabular-nums" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">원</span>
                </div>
                <label className="flex items-center justify-between gap-2 rounded-input border border-dashed border-border-default px-3 py-2 text-2xs">
                  <span className={vProof ? 'text-emerald-300 font-bold' : 'text-ink-secondary'}>1. 머니인 증빙 {vProof ? '✓ 첨부됨' : '— 이름·순위·금액이 보여야 해요'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setVProof(e.target.files?.[0] ?? null)} />
                  <span className="shrink-0 rounded-input bg-surface-float px-2 py-1 font-bold text-ink-secondary">선택</span>
                </label>
                <label className="flex items-center justify-between gap-2 rounded-input border border-dashed border-border-default px-3 py-2 text-2xs">
                  <span className={vIdCard ? 'text-emerald-300 font-bold' : 'text-ink-secondary'}>2. 신분증 {vIdCard ? '✓ 첨부됨' : '— 이름·주민번호 앞자리만 보이게 가리고 촬영'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setVIdCard(e.target.files?.[0] ?? null)} />
                  <span className="shrink-0 rounded-input bg-surface-float px-2 py-1 font-bold text-ink-secondary">선택</span>
                </label>
                <button type="button" disabled={vBusy || !vForm.event.trim() || !vForm.amount || !vProof || !vIdCard}
                  onClick={submitVerify}
                  className="btn-primary w-full disabled:opacity-50">{vBusy ? '제출 중…' : '인증 요청'}</button>
                <p className="text-[10px] leading-relaxed text-ink-muted">
                  운영자 검토 후 승인되면 국내 순위에 합산됩니다. <b className="text-ink-secondary">신분증 이미지는 승인·거절 즉시 삭제</b>되며 다른 용도로 사용되지 않습니다. AI 생성·조작 이미지는 반려됩니다.
                </p>
              </div>
              {myVerifs && myVerifs.length > 0 && (
                <ul className="space-y-1">
                  {myVerifs.map((v) => (
                    <li key={v.id} className="flex items-center gap-2 rounded-input bg-surface-high px-3 py-2 text-2xs">
                      <span className={['shrink-0 rounded-badge px-1.5 py-0.5 font-bold leading-none',
                        v.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : v.status === 'rejected' ? 'bg-danger/15 text-danger-light' : 'bg-gold-300/15 text-gold-300'].join(' ')}>
                        {v.status === 'approved' ? '승인' : v.status === 'rejected' ? '반려' : '검토 중'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink-secondary">{v.eventName}</span>
                      <span className="shrink-0 tabular-nums text-ink-primary">{(v.amountWon / 10000).toLocaleString()}만</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        ) : board === 'shop' ? (
          !user ? <p className="py-6 text-center text-2xs text-ink-muted">로그인하면 마크를 모을 수 있습니다</p>
          : (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-card border border-border-subtle bg-surface-high px-3 py-2">
                <span className="text-xs text-ink-secondary">내 활동점수</span>
                <span className="text-sm font-extrabold tabular-nums text-gold-300">{(user.activityPoints ?? 0).toLocaleString()}점</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {SHOP_MARKS.map((mk) => {
                  const pts = user.activityPoints ?? 0;
                  const unlocked = pts >= mk.need;
                  const on = equippedMark === mk.key;
                  return (
                    <div key={mk.key}
                      className={['rounded-card border p-2.5 text-center transition-colors',
                        on ? 'border-gold-300 bg-gold-300/[0.1]' : unlocked ? 'border-border-default bg-surface-high' : 'border-border-subtle bg-surface-high opacity-50'].join(' ')}>
                      <p className={['text-2xl leading-none', unlocked ? '' : 'grayscale'].join(' ')}>{mk.emoji}</p>
                      <p className="mt-1 text-xs font-bold text-ink-primary">{mk.name}</p>
                      <p className="mt-0.5 text-2xs leading-tight text-ink-muted">{mk.desc}</p>
                      {unlocked ? (
                        <button type="button" disabled={equipBusy !== null}
                          onClick={() => handleEquip(on ? null : mk.key)}
                          className={['mt-1.5 w-full rounded-input px-2 py-1.5 text-2xs font-bold transition-colors',
                            on ? 'bg-gold-300 text-ink-inverse' : 'border border-gold-400/40 text-gold-300 hover:bg-gold-300/10'].join(' ')}>
                          {equipBusy === (on ? null : mk.key) || (equipBusy === '' && on) ? '적용 중…' : on ? '✓ 장착 중 — 해제' : '장착하기'}
                        </button>
                      ) : (
                        <p className="mt-1.5 rounded-input bg-surface-float px-2 py-1.5 text-2xs font-bold text-ink-muted">🔒 {mk.need.toLocaleString()}점</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {equippedMark && (
                <p className="text-center text-2xs text-ink-muted">미리보기: <span className="font-bold text-ink-primary">{SHOP_MARKS.find((m2) => m2.key === equippedMark)?.emoji} {user.nickname ?? '닉네임'}</span></p>
              )}
            </div>
          )
        ) : board === 'hall' ? (
          hall === null ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
          : hall.rows.length === 0 ? <p className="py-6 text-center text-2xs text-ink-muted">지난달 입상 기록이 없습니다 — 이번 달의 주인공이 되어보세요!</p>
          : (
            <div className="space-y-1.5">
              {hall.rows.map((r, i) => (
                <div key={r.nickname} className={['flex items-center gap-3 rounded-card border p-3', i === 0 ? 'border-gold-400/60 bg-gold-300/[0.08]' : 'border-border-subtle bg-surface-high'].join(' ')}>
                  <span className="text-2xl leading-none">{['👑', '🥈', '🥉'][i]}</span>
                  <div className="min-w-0 flex-1">
                    <p className={['truncate font-extrabold', i === 0 ? 'text-lg text-gold-300' : 'text-sm text-ink-primary'].join(' ')}>{markPrefix(r)}{r.nickname}</p>
                    <p className="text-2xs text-ink-muted">{hall.label} 입상 점수 {r.pts}점{r.wins > 0 ? ` · 우승 ${r.wins}회` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : board !== 'activity' ? (
          !globalLoaded ? (
            <p className="text-center py-6 text-2xs text-ink-muted">불러오는 중…</p>
          ) : globalRows.length === 0 ? (
            <p className="text-center py-6 text-2xs text-ink-muted">아직 집계된 매장 순위 기록이 없습니다</p>
          ) : (
            <ul className="rounded-card border border-border-subtle bg-surface-high overflow-hidden">
              {globalRows.map((r, i) => (
                <li key={r.nickname} className="flex items-center gap-2.5 px-3 py-2 border-b border-border-subtle last:border-b-0">
                  <RankNum n={i + 1} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-ink-primary truncate">{markPrefix(r)}{r.nickname}</span>
                    <span className="block text-[10px] text-ink-muted">매장 {r.venues}곳 · 최고 {r.bestPosition}등</span>
                  </div>
                  <span className="text-right">
                    <span className="block text-sm font-bold tabular-nums text-gold-300">
                      {board === 'prize' ? `${r.prizePoints.toLocaleString()}점` : `${r.moneyinCount.toLocaleString()}회`}
                    </span>
                    <span className="block text-[10px] text-ink-muted tabular-nums">
                      {board === 'prize' ? `머니인 ${r.moneyinCount}회` : `프라이즈 ${r.prizePoints.toLocaleString()}점`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : loading ? (
          <p className="text-center py-6 text-2xs text-ink-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="text-center py-6 text-2xs text-ink-muted">랭킹 정보가 없습니다</p>
        ) : (
          <>
          {/* TOP3 포디움 — Chess.com 리더보드 문법(2-1-3 배치) */}
          {rows.length >= 3 && (
            <div className="mb-2 grid grid-cols-3 items-end gap-1.5">
              {[rows[1], rows[0], rows[2]].map((r, idx) => {
                const place = idx === 1 ? 1 : idx === 0 ? 2 : 3;
                const big = place === 1;
                return (
                  <div key={r.id} className={['rounded-card border p-2.5 text-center', big ? 'border-gold-400/60 bg-gold-300/[0.08]' : 'border-border-subtle bg-surface-high'].join(' ')}>
                    <p className={big ? 'text-xl leading-none' : 'text-base leading-none'}>{['🥈', '👑', '🥉'][idx]}</p>
                    <span className={['mx-auto mt-1 flex items-center justify-center rounded-full font-bold text-white', big ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-2xs'].join(' ')}
                      style={{ background: r.avatarColor ?? '#5A6175' }}>
                      {r.nickname[0]}
                    </span>
                    <p className={['mt-1 truncate font-bold', big ? 'text-sm text-gold-300' : 'text-xs text-ink-primary'].join(' ')}>{markPrefix(r)}{r.nickname}</p>
                    <p className="text-2xs tabular-nums text-ink-muted">{r.activityPoints.toLocaleString()}점</p>
                  </div>
                );
              })}
            </div>
          )}
          <ul className="rounded-card border border-border-subtle bg-surface-high overflow-hidden">
            {(rows.length >= 3 ? rows.slice(3) : rows).map((r, i0) => {
              const i = rows.length >= 3 ? i0 + 3 : i0;
              const t = tierOf(r.activityPoints);
              const rowAce = isAceRank(r.activityPoints, i + 1);
              const isMe = user?.id === r.id;
              if (isMe && !isAdmin) {
                // 내 순위 빅 카드 — 리그 보드와 동일 패턴(리스트 흐름 속 인라인 강조)
                return (
                  <li key={r.id} className="border-y border-gold-400/40 bg-gold-300/[0.08] px-3 py-3 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-extrabold text-white"
                        style={{ background: r.avatarColor ?? '#5A6175' }}>
                        {r.nickname[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gold-300">{i + 1}위 · {r.nickname} <span className="font-semibold text-ink-muted">(나)</span></p>
                        <p className="text-2xl font-extrabold leading-tight tabular-nums" style={{ color: rowAce ? '#FFD700' : t.color }}>
                          {r.activityPoints.toLocaleString()}<span className="ml-0.5 text-xs font-bold text-ink-muted">점</span>
                        </p>
                      </div>
                      <TierBadge points={r.activityPoints} size={26} overallRank={i + 1} />
                    </div>
                  </li>
                );
              }
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2.5 px-3 py-2 border-b border-border-subtle last:border-b-0"
                >
                  <RankNum n={i + 1} />
                  <span
                    className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-2xs font-bold text-white"
                    style={{ background: r.avatarColor ?? '#5A6175' }}
                  >
                    {r.nickname[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink-primary truncate">{markPrefix(r)}{r.nickname}</span>
                      {isMe && <span className="text-2xs font-bold text-gold-300">나</span>}
                    </div>
                  </div>
                  <TierBadge points={r.activityPoints} size={16} overallRank={i + 1} />
                  <span className="w-14 text-right text-xs font-bold tabular-nums" style={{ color: rowAce ? '#FFD700' : t.color }}>
                    {r.activityPoints.toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
          {/* TOP30 밖 — 리스트 아래 내 점수 카드(순위 미표기) */}
          {user && !isAdmin && !myRank && (
            <div className="mt-2 flex items-center gap-3 rounded-card border border-gold-400/40 bg-gold-300/[0.08] px-3 py-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-300 text-base font-extrabold text-ink-inverse">
                {(user.nickname ?? '나')[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gold-300">{user.nickname ?? '나'} <span className="font-semibold text-ink-muted">(나)</span></p>
                <p className="text-2xl font-extrabold leading-tight tabular-nums text-ink-primary">
                  {(user.activityPoints ?? 0).toLocaleString()}<span className="ml-0.5 text-xs font-bold text-ink-muted">점</span>
                </p>
                <p className="text-2xs text-ink-muted">TOP 30 진입까지 활동 점수를 모아보세요</p>
              </div>
            </div>
          )}
          </>
        )}
        {board === 'activity' && (
          <>
            <p className="mt-2 text-2xs text-ink-muted text-center">
              접속·글쓰기·댓글로 점수를 모아 KK(14,000점)까지 올리세요. AA는 KK 달성자 중 전체 상위 {ACE_TOP_RANK}명만!
            </p>
            <div className="mt-4 border-t border-border-subtle pt-3">
              <p className="mb-2 text-sm font-bold text-ink-primary">🎯 이번 주 미션 <span className="text-2xs font-normal text-ink-muted">달성하면 활동점수 즉시 지급 · 월요일 리셋</span></p>
              {missionsBlock}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
