// src/components/features/TierLeaderboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import TierBadge, { tierOf, tierProgress, allTiers, isAceRank, ACE_TOP_RANK, ACE_MIN_POINTS } from '../atoms/TierBadge';
import { getActivityLeaderboard, type LeaderboardEntry } from '../../api/community';
import { getGlobalRankingTotals, type GlobalRankingTotal } from '../../api/rankings';

// 통합 랭킹 보드 종류 — 활동(기존 등급 연동) + 전 매장 머니인/프라이즈(고도화)
type Board = 'activity' | 'moneyin' | 'prize';
const BOARD_LABEL: Record<Board, string> = { activity: '활동 점수', moneyin: '머니인 랭킹', prize: '프라이즈 랭킹' };
const BOARD_DESC: Record<Board, string> = {
  activity: '접속·글쓰기·댓글 활동 점수 — 등급(2·3~AA)과 연동됩니다.',
  moneyin: '전국 매장 순위 등록(입상) 횟수 합산 — 가장 많이 머니인한 플레이어.',
  prize: '전국 매장 프라이즈 점수 합산(금전적 가치 없음).',
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
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLadder, setShowLadder] = useState(false);
  const [board, setBoard] = useState<Board>('activity');
  const [global, setGlobal] = useState<GlobalRankingTotal[]>([]);
  const [globalLoaded, setGlobalLoaded] = useState(false);

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
                {(user.activityPoints ?? 0).toLocaleString()}
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
        <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5 mb-1.5">
          {(['activity', 'moneyin', 'prize'] as Board[]).map((b) => (
            <button key={b} type="button" onClick={() => setBoard(b)}
              className={['flex-1 py-1.5 text-xs font-bold rounded-[6px] transition-colors',
                board === b ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
              {BOARD_LABEL[b]}
            </button>
          ))}
        </div>
        <p className="mb-2 text-2xs text-ink-muted">{BOARD_DESC[board]}</p>

        {board !== 'activity' ? (
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
                    <span className="text-sm font-semibold text-ink-primary truncate">{r.nickname}</span>
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
          <ul className="rounded-card border border-border-subtle bg-surface-high overflow-hidden">
            {rows.map((r, i) => {
              const t = tierOf(r.activityPoints);
              const rowAce = isAceRank(r.activityPoints, i + 1);
              const isMe = user?.id === r.id;
              return (
                <li
                  key={r.id}
                  className={[
                    'flex items-center gap-2.5 px-3 py-2 border-b border-border-subtle last:border-b-0',
                    isMe ? 'bg-gold-300/[0.06]' : '',
                  ].join(' ')}
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
                      <span className="text-sm font-semibold text-ink-primary truncate">{r.nickname}</span>
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
        )}
        {board === 'activity' && (
          <p className="mt-2 text-2xs text-ink-muted text-center">
            접속·글쓰기·댓글로 점수를 모아 KK(14,000점)까지 올리세요. AA는 KK 달성자 중 전체 상위 {ACE_TOP_RANK}명만!
          </p>
        )}
      </section>
    </div>
  );
}
