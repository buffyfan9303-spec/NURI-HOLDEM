// src/components/features/TierLeaderboard.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getDomesticRankings, myRankVerifications, submitRankVerification,
  EVENT_KIND_LABEL, type RankEventKind, type RankVerification, type DomesticRow,
} from '../../api/rankverify';
import { useAuth } from '../../contexts/AuthContext';
import TierBadge, { tierOf, tierProgress, allTiers, isAceRank, ACE_TOP_RANK, ACE_MIN_POINTS } from '../atoms/TierBadge';
import { getActivityLeaderboard, getMyPointBalance, getShoutRules, type LeaderboardEntry, type PointBalance } from '../../api/community';
import { getGlobalRankingTotals, type GlobalRankingTotal } from '../../api/rankings';
import { useToast } from '../atoms/Toast';
import EmptyState from '../atoms/EmptyState';
import Icon from '../atoms/Icon';
import CountUp from '../atoms/CountUp';
import SlidingPill from '../atoms/SlidingPill';
import { ShoutComposer } from './CommunityShoutBar';
import { ALL_MARKS } from '../../lib/shopMarks';
import { getHallOfFame, type HallBoard } from '../../lib/hallOfFame';
import {
  getWeeklyLeague, leagueTierOf, LEAGUE_TIERS, type LeagueRow,
  MISSIONS, getActiveMissions, getMissionProgress, claimMission, type Mission, type MissionProgress,
  BADGES, getMyBadgeStats, type BadgeStats,
  getMyEquippedMark, setEquippedMark as saveEquippedMark,
} from '../../lib/loyalty';

// 시상대 색 — 👑🥈🥉 이모지는 OS 마다 금·은·동 색조가 달라 서열이 뒤집혀 보였다.
// 아이콘 + 토큰 색으로 옮겨 1·2·3위 서열을 앱이 통제한다(AdminTab 명예의 전당과 같은 규약).
const HALL_TONE = ['text-gold-300', 'text-slate-200', 'text-amber-600'] as const;   // 1·2·3위 순
const PODIUM_TONE = ['text-slate-200', 'text-gold-300', 'text-amber-600'] as const; // 시상대 배치는 2·1·3위 순

// 통합 랭킹 허브 — 활동/머니인/프라이즈 + 주간 리그·업적·미션·명예의 전당(충성도)
type Board = 'activity' | 'moneyin' | 'prize' | 'league' | 'badges' | 'missions' | 'hall' | 'shop' | 'domestic' | 'verify';
const BOARD_LABEL: Record<Board, string> = {
  activity: '활동 순위', moneyin: '머니인', prize: '프라이즈', shop: '상점', domestic: '국내 순위', verify: '순위 인증',
  league: '주간 리그', badges: '업적', missions: '미션', hall: '명예의 전당',
};
const BOARD_DESC: Record<Board, string> = {
  domestic: '정식 대회(해외 포함) 입상만 인정 — 운영자가 승인한 건에 한해 100만원(10T)당 1점으로 합산합니다.',
  verify: '대회 입상 증빙 2장(머니인·신분증)을 올려 운영자 승인을 받으면 국내 순위에 합산됩니다. 정식 대회만 인정되며 100만원(10T)당 1점입니다.',
  shop: '마크는 활동점수 도달로 해금(차감 없음), 외치기는 사용 가능 점수로 구매합니다. 누적 점수(등급 기준)는 줄지 않습니다.',
  activity: '접속·글쓰기·댓글 활동 점수 — 등급(2·3~AA)과 연동. 아래 주간 미션을 달성하면 점수를 바로 받아요.',
  moneyin: '전국 매장 머니인 점수 — 100만원(10T)당 1점으로 합산합니다(임계 미만은 점수 없음).',
  prize: '전국 매장 프라이즈 점수 합산(금전적 가치 없음).',
  league: '이번 주 활약(체크인 ×3 + 머니인 점수) — 머니인은 100만원(10T)당 1점. 월요일마다 새로 시작!',
  badges: '조건을 달성하면 자동으로 열리는 업적 뱃지 — 모아서 프로필을 채우세요.',
  missions: '이번 주 미션 — 달성하면 활동점수 보상을 바로 받아요. 월요일 리셋.',
  hall: '지난달 가장 빛난 플레이어 TOP3 — 운영자가 직접 선정하며, 선정이 없는 달은 입상 기록으로 자동 집계됩니다.',
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

// ── 로딩 자리표시자 ──────────────────────────────────────────────────────────
// 오너 #5(레이아웃 점프)의 처방은 '공간 예약'이다. 한 줄짜리 "불러오는 중…" 문단은
// 실제 목록(수백 px)과 높이가 전혀 달라서, 로딩이 끝나는 순간 아래 콘텐츠가 통째로 밀린다.
// 그래서 로딩 표시는 **실제 행 높이와 같은** 스켈레톤으로 채운다.
//   · 행 1개 = px-3 py-2 + 28px 아바타 = 44px(h-11) — 실측으로 맞춘 값.
//   · 마지막으로 본 행 수를 기억해(localStorage) 다음 진입에는 **정확한** 높이를 예약한다.
//     기기마다 회원 수가 다르지도, 자주 바뀌지도 않아서 두 번째 진입부터는 사실상 오차 0이다.
//     저장이 막힌 브라우저(프라이빗 등)에서도 기본값 8로 정상 동작한다.
const ROW_COUNT_KEY = 'nuri:rank-rows';
let lastActivityRowCount = (() => {
  try {
    const v = Number(localStorage.getItem(ROW_COUNT_KEY));
    return Number.isFinite(v) && v > 0 ? Math.min(30, v) : 8;
  } catch { return 8; }
})();
function rememberRowCount(n: number) {
  lastActivityRowCount = Math.max(1, Math.min(30, n));
  try { localStorage.setItem(ROW_COUNT_KEY, String(lastActivityRowCount)); } catch { /* 저장 차단 환경 */ }
}

function RowSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="overflow-hidden rounded-card border border-border-subtle bg-surface-high" aria-hidden>
      {Array.from({ length: Math.max(1, rows) }).map((_, i) => (
        <li key={i} className="flex h-11 items-center gap-2.5 border-b border-border-subtle px-3 last:border-b-0">
          <span className="skeleton h-6 w-6 rounded-full" />
          <span className="skeleton h-7 w-7 rounded-full" />
          <span className="skeleton h-3.5 min-w-0 flex-1 rounded" style={{ maxWidth: `${45 + ((i * 13) % 30)}%` }} />
          <span className="skeleton h-3.5 w-10 rounded" />
        </li>
      ))}
    </ul>
  );
}

/** 활동 순위 첫 로드 — 포디움(2-1-3) + 목록 자리 예약 */
function ActivityBoardSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-1.5 h-9 rounded-input border border-accent-400/40 bg-accent-300/[0.08]" aria-hidden />
      <div className="mb-2 grid grid-cols-3 items-end gap-1.5" aria-hidden>
        {[104, 124, 104].map((h, i) => (
          <div key={i} className="skeleton rounded-card" style={{ height: h }} />
        ))}
      </div>
      <RowSkeleton rows={lastActivityRowCount} />
      <span className="sr-only">랭킹을 불러오는 중입니다</span>
    </div>
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
  // 상점 소비형 상품(외치기) — 누적 점수는 그대로 두고 '사용 가능 점수'만 깎는다(§spent_points)
  const [balance, setBalance] = useState<PointBalance | null>(null);
  const [shoutCost, setShoutCost] = useState(30);
  const [shoutOpen, setShoutOpen] = useState(false);
  const reloadBalance = useRef(() => { getMyPointBalance().then(setBalance).catch(() => {}); }).current;
  const [domestic, setDomestic] = useState<DomesticRow[] | null>(null);
  const [myVerifs, setMyVerifs] = useState<RankVerification[] | null>(null);
  const [vForm, setVForm] = useState<{ event: string; amount: string; kind: RankEventKind; overseas: boolean }>(
    { event: '', amount: '', kind: 'official', overseas: false });
  const [vProof, setVProof] = useState<File | null>(null);
  const [vIdCard, setVIdCard] = useState<File | null>(null);
  const [vBusy, setVBusy] = useState(false);
  // 행 닉네임 앞 장착 마크 — equippedMark 없는 행 타입(주간 리그 등)도 안전
  const markPrefix = (r: unknown): string => {
    const k = (r as { equippedMark?: string | null }).equippedMark;
    return k ? ((ALL_MARKS.find((m) => m.key === k)?.emoji ?? '') + ' ') : '';
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
        eventKind: vForm.kind, isOverseas: vForm.overseas,
      });
      setVForm({ event: '', amount: '', kind: 'official', overseas: false }); setVProof(null); setVIdCard(null);
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
  const [hall, setHall] = useState<HallBoard | null>(null);
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
    if (board === 'hall' && hall === null) getHallOfFame().then(setHall).catch(() => setHall({ label: '', rows: [], source: 'auto' }));
    if (board === 'domestic' && domestic === null) getDomesticRankings(30).then(setDomestic).catch(() => setDomestic([]));
    if (board === 'verify' && myVerifs === null && user) myRankVerifications().then(setMyVerifs).catch(() => setMyVerifs([]));
    if (board === 'shop' && equippedMark === undefined && user) {
      getMyEquippedMark().then((k) => setEquippedMark(k)).catch(() => setEquippedMark(null));
    }
    if (board === 'shop' && user) {
      reloadBalance();
      getShoutRules().then((r) => setShoutCost(r.cost)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, user?.id]);
  const handleClaim = async (key: string) => {
    setClaiming(key);
    try {
      const msg = await claimMission(key);
      toast.show(msg, 'success');
      setMissions((prev) => prev ? prev.map((m) => (m.key === key ? { ...m, claimed: true } : m)) : prev);
      await refreshProfile?.();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '보상 받기 실패', 'error');
    } finally {
      setClaiming(null);
    }
  };

  // ⚠ 오너 #5 의 근본 원인이 여기였다.
  //   미션 '받기' → claim_mission → refreshProfile() 로 user.activityPoints 가 바뀌면
  //   이 이펙트가 다시 돌고, 예전엔 첫 줄에서 setLoading(true) 를 했다.
  //   그 순간 화면의 순위 목록 전체(포디움+행들)가 한 줄짜리 "불러오는 중…" 으로 바뀌면서
  //   문서 높이가 통째로 줄었다가(스크롤 위치까지 강제로 당겨짐) 응답이 오면 다시 늘어났다.
  //   실측(2026-08-29, 412px·응답 700ms): docHeight 1684 → 1418 → 1684,
  //   scrollY 487 → 221 → 487, layout-shift 0.2516(=CLS '나쁨' 구간).
  //   ⇒ 재조회 중에는 **이미 있는 목록을 그대로 둔다**(stale-while-revalidate).
  //     loading 은 '첫 로드'에서만 true 이고 한 번 내려간 뒤 다시 올라가지 않는다.
  //     높이를 애니메이트하는 처방(모션 헌법 위반)은 쓰지 않았다 — 애초에 높이가 안 바뀐다.
  useEffect(() => {
    let active = true;
    getActivityLeaderboard(30)
      .then((r) => { if (active) { setRows(r); if (r.length) rememberRowCount(r.length >= 3 ? r.length - 3 : r.length); } })
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

  // 머니인 보드 정렬 기준 = moneyinPoints(100만원당 1점, 서버 계산). 동점이면 상금 누적 → 최고 등수.
  const globalRows = useMemo(() => {
    const arr = [...global];
    arr.sort((a, b) => board === 'prize'
      ? (b.prizePoints - a.prizePoints) || (b.moneyinCount - a.moneyinCount)
      : (b.moneyinPoints - a.moneyinPoints) || (b.prizePoints - a.prizePoints) || (a.bestPosition - b.bestPosition));
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
          !user ? <p className="py-6 text-center t-desc text-ink-muted">로그인하면 주간 미션에 참여할 수 있습니다</p>
          : missions === null ? (
            // 미션 카드와 같은 높이(74px)로 자리 예약 — 도착 시 아래가 밀리지 않는다
            <ul className="space-y-1.5" aria-busy="true">
              {[0, 1, 2].map((i) => <li key={i} className="skeleton h-[4.625rem] rounded-card" />)}
            </ul>
          )
          : missionDefs.length === 0 ? <p className="py-6 text-center t-desc text-ink-muted">이번 주 미션이 준비 중입니다</p>
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
                        {/* §T1 역할: 카드 제목 = t-title(14.88/700) · 행 부가정보 = t-meta(11.69/400). 값은 종전과 동일하다. */}
                        <p className="t-title text-ink-primary">{m.title} <span className="font-extrabold text-emerald-400">+{m.reward}점</span></p>
                        <p className="t-meta text-ink-muted">{m.desc}</p>
                      </div>
                      {/* 세 상태(미달·받기·받음)를 **같은 박스 크기**로 고정한다 —
                          '받기' 버튼이 작은 뱃지로 바뀌면 행 높이가 줄어 그 아래가 또 밀린다(#5). */}
                      {claimed ? (
                        <span className="inline-flex h-8 w-[4.75rem] shrink-0 items-center justify-center gap-1 rounded-badge bg-surface-float text-2xs font-bold text-ink-muted"><Icon name="check" size={12} className="shrink-0" />받음</span>
                      ) : done ? (
                        <button type="button" disabled={claiming === m.key} onClick={() => handleClaim(m.key)}
                          className="btn-primary inline-flex h-8 w-[4.75rem] shrink-0 items-center justify-center px-0 py-0 text-xs disabled:opacity-60">
                          {claiming === m.key ? '받는 중…' : <span className="inline-flex items-center gap-1"><Icon name="gift" size={12} className="shrink-0" />받기</span>}
                        </button>
                      ) : (
                        <span className="inline-flex h-8 w-[4.75rem] shrink-0 items-center justify-center text-xs font-bold tabular-nums text-ink-secondary">{cur}/{m.goal}</span>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-float">
                      <div className={['h-full rounded-full transition-[width]', done ? 'bg-emerald-400' : 'bg-accent-300'].join(' ')} style={{ width: `${Math.round((cur / m.goal) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )
  );

  return (
    <div className="space-y-3 animate-fade-in">
      {/* 인플루언서·프로 기회 프레이밍(오너 지시 2026-08-27) — §28 안전 표현(금전 언급 없음) */}
      <div className="flex items-center gap-2 rounded-card border border-gold-400/30 bg-gold-300/[0.06] px-3 py-2">
        <Icon name="trophy" size={17} className="shrink-0 text-gold-300" />
        <p className="min-w-0 text-2xs font-semibold leading-relaxed text-gold-300">상위 랭커에게 프로·인플루언서 협업 기회가 열립니다</p>
      </div>
      {/* 내 등급 카드 */}
      {user && myProg && (
        <section className="rounded-card border border-accent-400/40 bg-gradient-to-br from-accent-300/[0.07] to-transparent p-4">
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
              <p className="text-lg font-extrabold text-accent-300 tabular-nums leading-tight">
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
                <span className="tabular-nums"><b className="text-ink-secondary">{(user.activityPoints ?? 0).toLocaleString()}</b> / {myProg.next.min.toLocaleString()}점 · {myProg.toNext.toLocaleString()}점 남음</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 min-w-0 flex-1 rounded-full bg-surface-high overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{ width: `${Math.round(myProg.ratio * 100)}%`, background: `linear-gradient(90deg, ${myProg.current.color}, ${myProg.next.color})` }}
                  />
                </div>
                {/* 바 끝 = 다음 등급 뱃지 미리보기 */}
                <span className="shrink-0" title={`다음 등급 ${myProg.next.label} · ${myProg.next.title}`}>
                  <TierBadge points={myProg.next.min} size={16} />
                </span>
              </div>
            </div>
          ) : myIsAce ? (
            <p className="mt-3 text-2xs font-bold text-accent-300">AA 등급 달성 · 전체 상위 {ACE_TOP_RANK}위</p>
          ) : (
            <p className="mt-3 text-2xs font-bold text-accent-300">KK 등급(최고 점수) · 전체 {ACE_TOP_RANK}위 안에 들면 AA 등급</p>
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
            className="mt-2 text-2xs font-semibold text-accent-300 hover:text-accent-200"
          >
            {showLadder ? '등급표 닫기' : '전체 등급표 보기'}
          </button>

          {showLadder && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 animate-slide-up">
              {/* A — 점수가 아닌 상대평가(명예) 등급 */}
              <div className="col-span-2 flex items-center justify-between px-2 py-1.5 rounded-input border border-accent-400/60 bg-gradient-to-r from-accent-300/15 to-transparent">
                <span className="inline-flex items-center gap-1.5">
                  <TierBadge points={ACE_MIN_POINTS} size={16} overallRank={1} />
                  <span className="text-2xs font-bold text-accent-300">AA 등급</span>
                </span>
                <span className="text-2xs text-ink-muted">KK 달성 + 전체 상위 {ACE_TOP_RANK}명</span>
              </div>
              {allTiers().slice().reverse().map((t) => (
                <div
                  key={t.key}
                  className={[
                    'flex items-center justify-between px-2 py-1.5 rounded-input border',
                    t.rank === myProg.current.rank
                      ? 'border-accent-400/50 bg-accent-300/[0.06]'
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
        <div className="relative flex items-center gap-1 bg-surface-high rounded-input p-0.5 mb-1.5 overflow-x-auto scrollbar-none lg:flex-wrap lg:overflow-visible">
          {/* 오너 지시(2026-08-28): 구 pill(그라데이션 배경) 제거 — 커뮤니티 서브탭과 같은
              밑줄(underline) 문법. 활성은 미끄러지는 2px 밑줄 + 잉크색·굵기. */}
          <SlidingPill activeKey={board} underline className="rounded-full bg-accent-300" />
          {(['activity', 'league', 'hall', 'moneyin', 'domestic', 'verify', 'shop'] as Board[]).map((b) => (
            <button key={b} type="button" data-pill-active={board === b || undefined} onClick={() => setBoard(b)}
              className={['relative shrink-0 px-2 lg:px-3 py-1.5 t-tab rounded-[6px] transition-colors',
                board === b ? 'text-ink-primary font-bold' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
              <span className="relative">{BOARD_LABEL[b]}</span>
            </button>
          ))}
        </div>
        {/* 보드 설명 — 1행/2행이 섞이면 탭을 옮길 때마다 아래가 통째로 밀린다. 2행분을 예약. */}
        <p className="mb-2 min-h-[2.25rem] t-desc text-ink-muted">{BOARD_DESC[board]}</p>

        {board === 'league' ? (
          league === null ? <RowSkeleton rows={6} />
          : league.length === 0 ? (
            <EmptyState
              title="이번 주 리그가 비어 있어요"
              hint="매장 QR 체크인(+3)·머니인(100만원당 +1)으로 첫 점수를 올려보세요"
              icon={<Icon name="medal" />}
            />
          )
          : (() => {
            // 리그 UI(레퍼런스: 리스트 사이 "내 카드" 빅 강조 + 상단 승급 안내 배너)
            const me = user ? league.find((r) => r.userId === user.id) ?? null : null;
            const myRank = me ? league.indexOf(me) + 1 : null;
            const nextTier = me ? [...LEAGUE_TIERS].reverse().find((t) => t.min > me.score) ?? null : null;
            return (
              <div className="space-y-2">
                {/* 승급 안내 배너 — 다음 티어까지 남은 점수 */}
                {me && (
                  <div className="rounded-card border border-accent-400/30 bg-accent-300/10 px-3 py-2 text-center text-xs font-semibold text-accent-300">
                    {nextTier
                      ? <span className="inline-flex flex-wrap items-center justify-center gap-1">{`${nextTier.min - me.score}점만 더 모으면`}<Icon name={nextTier.icon} size={13} className={['shrink-0', nextTier.tone].join(' ')} />{`${nextTier.label} 티어로 승급해요`}</span>
                      : <span className="inline-flex items-center justify-center gap-1"><Icon name="gem" size={13} className="shrink-0 text-sky-300" />최고 티어 — 이번 주 왕좌를 지키세요!</span>}
                  </div>
                )}
                <ul className="overflow-hidden rounded-card border border-border-subtle bg-surface-high">
                  {league.map((r, i) => {
                    const t = leagueTierOf(r.score);
                    const isMe = user?.id === r.userId;
                    if (isMe) {
                      // 내 순위 빅 카드 — 리스트 흐름 속 인라인 강조(이미지 패턴)
                      return (
                        <li key={r.userId} className="border-b border-y border-accent-400/40 bg-accent-300/[0.08] px-3 py-3 last:border-b-0">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-300 text-base font-extrabold text-white">
                              {r.nickname.slice(0, 1)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-accent-300">{myRank}위 · {markPrefix(r)}{r.nickname} <span className="text-ink-muted font-semibold">(나)</span></p>
                              <p className="text-2xl font-extrabold leading-tight tabular-nums text-ink-primary">
                                {r.score}<span className="ml-0.5 text-xs font-bold text-ink-muted">점</span>
                              </p>
                              <p className="text-2xs text-ink-muted">체크인 {r.checkins}회 · 입상 {r.placements}회</p>
                            </div>
                            {t && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-badge border border-accent-400/40 bg-surface-float px-2 py-1 text-xs font-bold text-accent-300">
                                <Icon name={t.icon} size={13} className={['shrink-0', t.tone].join(' ')} />{t.label}
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
                        {t && <span className="inline-flex shrink-0 items-center gap-1 rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs font-bold text-ink-secondary"><Icon name={t.icon} size={11} className={['shrink-0', t.tone].join(' ')} />{t.label}</span>}
                        <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-accent-300">{r.score}</span>
                      </li>
                    );
                  })}
                </ul>
                {/* TOP20 밖이거나 이번 주 무활동 — 입장 안내 */}
                {user && !me && !isAdmin && (
                  <p className="rounded-card border border-border-subtle bg-surface-high px-3 py-2 text-center text-2xs text-ink-muted">
                    아직 이번 주 리그 점수가 없어요 — 체크인(+3)·머니인(100만원당 +1)으로 리그에 입장하세요!
                  </p>
                )}
                {/* 티어 메달 진열장 — 브론즈~다이아(레퍼런스 하단 메달 행). 내 티어 하이라이트, 미달성은 흐림 */}
                <div className="grid grid-cols-5 gap-1.5">
                  {[...LEAGUE_TIERS].reverse().map((t) => {
                    const mine = me ? leagueTierOf(me.score)?.key === t.key : false;
                    const reached = me ? me.score >= t.min : false;
                    return (
                      <div key={t.key}
                        className={['card-sink rounded-card border px-1 py-2 text-center transition-colors',
                          mine ? 'border-accent-400/60 bg-accent-300/10'
                            : reached ? 'border-border-subtle bg-surface-high'
                            : 'border-border-subtle bg-surface-high opacity-40'].join(' ')}>
                        <Icon name={t.icon} size={22} className={['mx-auto', t.tone].join(' ')} />
                        <p className={['mt-1 text-2xs font-bold', mine ? 'text-accent-300' : 'text-ink-secondary'].join(' ')}>{t.label}</p>
                        <p className="text-2xs tabular-nums text-ink-muted">{t.min}점~</p>
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
          !user ? <p className="py-6 text-center t-desc text-ink-muted">로그인하면 업적을 모을 수 있습니다</p>
          : badgeStats === null ? <p className="py-6 text-center t-desc text-ink-muted">불러오는 중…</p>
          : (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {BADGES.map((b) => {
                const got = b.check(badgeStats);
                return (
                  <div key={b.key} title={b.desc}
                    className={['card-sink rounded-card border p-2.5 text-center transition-colors', got ? 'border-accent-400/50 bg-accent-300/[0.08]' : 'border-border-subtle bg-surface-high opacity-55'].join(' ')}>
                    <Icon name={b.icon} size={22} className={['mx-auto', got ? b.tone : 'text-ink-muted'].join(' ')} />
                    <p className={['mt-1 text-xs font-bold', got ? 'text-accent-300' : 'text-ink-secondary'].join(' ')}>{b.label}</p>
                    <p className="mt-0.5 text-2xs leading-tight text-ink-muted">{b.desc}</p>
                  </div>
                );
              })}
            </div>
          )
        ) : board === 'domestic' ? (
          domestic === null ? <RowSkeleton rows={6} />
          : domestic.length === 0 ? (
            <EmptyState
              title="아직 인증된 입상이 없어요"
              hint="'순위 인증' 탭에서 정식 대회 입상 증빙을 올리면 이 순위에 합산됩니다"
              icon={<Icon name="trophy" />}
              action={<button type="button" onClick={() => setBoard('verify')} className="btn-primary px-4 py-2 text-xs">순위 인증하러 가기</button>}
            />
          )
          : (
            <ul className="space-y-1">
              {domestic.map((r, i) => (
                <li key={r.nickname} className="flex items-center gap-2.5 rounded-input bg-surface-high px-3 py-2">
                  <span className="w-6 shrink-0 text-center text-sm font-extrabold tabular-nums text-accent-300">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">
                    {r.nickname}
                    <span className="block text-2xs font-normal text-ink-muted tabular-nums">
                      정식 대회 {r.wins}회{r.overseas > 0 ? ` · 해외 ${r.overseas}회` : ''} · 누적 {(r.totalWon / 10000).toLocaleString()}만
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-extrabold tabular-nums text-emerald-300">{r.points.toLocaleString()}점</span>
                </li>
              ))}
            </ul>
          )
        ) : board === 'verify' ? (
          !user ? <p className="py-6 text-center t-desc text-ink-muted">로그인하면 입상 인증을 신청할 수 있습니다</p>
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
                {/* 대회 구분 — 국내 순위는 '정식 대회'만 인정(오너 #7). 최종 확정은 운영자 승인. */}
                <div className="grid grid-cols-2 gap-1.5">
                  {(['official', 'pub'] as RankEventKind[]).map((k) => (
                    <button key={k} type="button" onClick={() => setVForm((f) => ({ ...f, kind: k }))}
                      aria-pressed={vForm.kind === k}
                      className={['rounded-input border px-2 py-2 text-2xs font-bold',
                        vForm.kind === k
                          ? 'border-accent-400/60 bg-accent-300/[0.12] text-accent-200'
                          : 'border-border-default bg-surface-float text-ink-secondary'].join(' ')}>
                      {EVENT_KIND_LABEL[k]}
                      <span className="block font-normal text-ink-muted">{k === 'official' ? '순위 인정' : '기록만 · 순위 제외'}</span>
                    </button>
                  ))}
                </div>
                <label className="flex items-center justify-between gap-2 rounded-input border border-border-default px-3 py-2 text-2xs">
                  <span className="text-ink-secondary">해외 대회입니다 <span className="text-ink-muted">— 해외도 정식 대회면 인정돼요</span></span>
                  <input type="checkbox" checked={vForm.overseas} className="h-4 w-4 shrink-0 accent-current text-accent-300"
                    onChange={(e) => setVForm((f) => ({ ...f, overseas: e.target.checked }))} />
                </label>
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
                <p className="text-2xs leading-relaxed text-ink-muted">
                  운영자가 <b className="text-ink-secondary">정식 대회로 승인한 건</b>만 국내 순위에 합산되며, <b className="text-ink-secondary">100만원(10T)당 1점</b>입니다(임계 미만은 점수 없음). 대회 구분은 운영자 검토 시 최종 확정됩니다. <b className="text-ink-secondary">신분증 이미지는 승인·거절 즉시 삭제</b>되며 다른 용도로 사용되지 않습니다. AI 생성·조작 이미지는 반려됩니다.
                </p>
              </div>
              {myVerifs && myVerifs.length > 0 && (
                <ul className="space-y-1">
                  {myVerifs.map((v) => (
                    <li key={v.id} className="flex items-center gap-2 rounded-input bg-surface-high px-3 py-2 text-2xs">
                      <span className={['shrink-0 rounded-badge px-1.5 py-0.5 font-bold leading-none',
                        v.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : v.status === 'rejected' ? 'bg-danger/15 text-danger-light' : 'bg-accent-300/15 text-accent-300'].join(' ')}>
                        {v.status === 'approved' ? '승인' : v.status === 'rejected' ? '반려' : '검토 중'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink-secondary">
                        {v.eventName}
                        <span className="ml-1 text-ink-muted">{EVENT_KIND_LABEL[v.eventKind]}{v.isOverseas ? '·해외' : ''}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-primary">{(v.amountWon / 10000).toLocaleString()}만</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        ) : board === 'shop' ? (
          !user ? <p className="py-6 text-center t-desc text-ink-muted">로그인하면 마크를 모을 수 있습니다</p>
          : (
            <div className="space-y-2">
              {/* 누적 / 사용 가능을 함께 — 마크는 '도달'(누적)로 해금되고, 외치기는 '사용 가능'을 깎는다 */}
              <div className="flex items-center justify-between rounded-card border border-border-subtle bg-surface-high px-3 py-2">
                <span className="text-xs text-ink-secondary">
                  내 활동점수
                  <span className="ml-1 text-2xs text-ink-muted">누적 {(user.activityPoints ?? 0).toLocaleString()}점 · 등급 기준</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-extrabold tabular-nums text-accent-300">
                    {balance ? balance.available.toLocaleString() : (user.activityPoints ?? 0).toLocaleString()}점
                  </span>
                  <span className="block text-2xs text-ink-muted">사용 가능</span>
                </span>
              </div>

              {/* ── 소비형 상품: 외치기 (오너 #8) ─────────────────────────────
                  마크는 '도달 해금'(차감 없음)이라 등급에 영향이 없다. 외치기는 유일한 소비형이라
                  누적 점수는 두고 사용액(spent_points)만 쌓는다 — 등급·마크 해금이 절대 되돌아가지 않게. */}
              <button type="button" onClick={() => setShoutOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-card border border-accent-400/50 bg-gradient-to-r from-accent-300/[0.1] to-transparent px-3 py-2.5 text-left transition-colors hover:border-accent-300">
                <Icon name="megaphone" size={20} className="shrink-0 text-accent-300" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink-primary">외치기</span>
                  <span className="block text-2xs leading-tight text-ink-muted">커뮤니티 맨 위에 내 한마디를 6시간 동안 크게 · 하루 3번까지</span>
                </span>
                <span className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-1 text-2xs font-extrabold text-accent-300">{shoutCost}점</span>
              </button>

              <p className="pt-0.5 text-2xs font-bold text-ink-secondary">마크 <span className="font-normal text-ink-muted">— 점수에 도달하면 해금(차감 없음)</span></p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {ALL_MARKS.map((mk) => {
                  const pts = user.activityPoints ?? 0;
                  const unlocked = pts >= mk.need;
                  const on = equippedMark === mk.key;
                  return (
                    <div key={mk.key}
                      className={['card-sink rounded-card border p-2.5 text-center transition-colors',
                        on ? 'border-accent-300 bg-accent-300/[0.1]' : unlocked ? 'border-border-default bg-surface-high' : 'border-border-subtle bg-surface-high opacity-50'].join(' ')}>
                      <p className={['text-2xl leading-none', unlocked ? '' : 'grayscale'].join(' ')}>{mk.emoji}</p>
                      <p className="mt-1 text-xs font-bold text-ink-primary">{mk.name}</p>
                      <p className="mt-0.5 text-2xs leading-tight text-ink-muted">{mk.desc}</p>
                      {unlocked ? (
                        <button type="button" disabled={equipBusy !== null}
                          onClick={() => handleEquip(on ? null : mk.key)}
                          className={['mt-1.5 w-full rounded-input px-2 py-1.5 text-2xs font-bold transition-colors',
                            on ? 'bg-accent-300 text-white' : 'border border-accent-400/40 text-accent-300 hover:bg-accent-300/10'].join(' ')}>
                          {equipBusy === (on ? null : mk.key) || (equipBusy === '' && on) ? '적용 중…' : on ? '✓ 장착 중 — 해제' : '장착하기'}
                        </button>
                      ) : (
                        <p className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-input bg-surface-float px-2 py-1.5 text-2xs font-bold text-ink-muted"><Icon name="lock" size={11} className="shrink-0" />{mk.need.toLocaleString()}점</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {equippedMark && (
                <p className="text-center text-2xs text-ink-muted">미리보기: <span className="font-bold text-ink-primary">{ALL_MARKS.find((m2) => m2.key === equippedMark)?.emoji} {user.nickname ?? '닉네임'}</span></p>
              )}
              <ShoutComposer open={shoutOpen} onClose={() => setShoutOpen(false)} onPosted={() => reloadBalance()} />
            </div>
          )
        ) : board === 'hall' ? (
          hall === null ? (
            <div className="space-y-1.5" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[4.75rem] rounded-card" />)}
            </div>
          )
          : hall.rows.length === 0 ? (
            <EmptyState
              title="아직 전당에 오른 사람이 없어요"
              hint="지난달 입상 기록이 없습니다 — 대회에 참가해 이번 달의 주인공이 되어보세요"
              icon={<Icon name="trophy" />}
            />
          )
          : (
            <div className="space-y-1.5">
              {hall.rows.map((r, i) => (
                <div key={`${r.nickname}-${i}`} className={['card-sink flex items-center gap-3 rounded-card border p-3', i === 0 ? 'border-accent-400/60 bg-accent-300/[0.08]' : 'border-border-subtle bg-surface-high'].join(' ')}>
                  <Icon name={i === 0 ? 'crown' : 'medal'} size={26}
                    className={['shrink-0', HALL_TONE[i]].join(' ')} role="img" aria-hidden={false} aria-label={`${i + 1}위`} />
                  <div className="min-w-0 flex-1">
                    <p className={['truncate font-extrabold', i === 0 ? 'text-lg text-accent-300' : 'text-sm text-ink-primary'].join(' ')}>{markPrefix(r)}{r.nickname}</p>
                    {/* 운영자가 직접 등록한 행에는 한 줄 소개가 붙는다(#10) */}
                    {r.note
                      ? <p className="truncate text-2xs text-ink-secondary">{r.note}</p>
                      : <p className="text-2xs text-ink-muted">{hall.label} 입상 점수 {r.pts}점{r.wins > 0 ? ` · 우승 ${r.wins}회` : ''}</p>}
                  </div>
                </div>
              ))}
              <p className="pt-0.5 text-center text-2xs text-ink-muted">
                {hall.label} 명예의 전당{hall.source === 'manual' ? ' · 운영자 선정' : ' · 지난달 입상 자동 집계'}
              </p>
            </div>
          )
        ) : board !== 'activity' ? (
          !globalLoaded ? (
            <RowSkeleton rows={8} />
          ) : globalRows.length === 0 ? (
            <EmptyState
              title="아직 집계된 매장 순위가 없어요"
              hint="매장이 대회 순위를 올리면 100만원(10T)당 1점으로 이 표에 합산됩니다"
              icon={<Icon name="chart" />}
            />
          ) : (
            <ul className="rounded-card border border-border-subtle bg-surface-high overflow-hidden">
              {globalRows.map((r, i) => (
                <li key={r.nickname} className="flex items-center gap-2.5 px-3 py-2 border-b border-border-subtle last:border-b-0">
                  <RankNum n={i + 1} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-ink-primary truncate">{markPrefix(r)}{r.nickname}</span>
                    <span className="block text-2xs text-ink-muted">매장 {r.venues}곳 · 최고 {r.bestPosition}등</span>
                  </div>
                  <span className="text-right">
                    <span className="block text-sm font-bold tabular-nums text-accent-300">
                      {board === 'prize' ? `${r.prizePoints.toLocaleString()}점` : `${r.moneyinPoints.toLocaleString()}점`}
                    </span>
                    <span className="block text-2xs text-ink-muted tabular-nums">
                      {board === 'prize' ? `머니인 ${r.moneyinCount}회` : `입상 ${r.moneyinCount}회`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : loading ? (
          <ActivityBoardSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState title="아직 랭킹이 없어요" hint="접속·글쓰기·댓글로 활동 점수를 모으면 이 자리에 이름이 올라갑니다" />
        ) : (
          <>
          {/* 상단 고정 '내 순위' 요약 1행 — 스크롤 없이 내 위치부터(TOP30 밖은 기존 하단 카드 유지) */}
          {user && !isAdmin && myRank && (
            <div className="mb-1.5 flex items-center gap-2.5 rounded-input border border-accent-400/40 bg-accent-300/[0.08] px-3 py-2">
              <span className="shrink-0 text-2xs font-bold text-accent-300">내 순위</span>
              <span className="shrink-0 text-sm font-extrabold tabular-nums text-ink-primary">{myRank}위</span>
              {/* §T1 순위 행 규격: 이름 text-sm/600 · 점수 text-xs/700 — 바로 아래 목록 행과 같은 값 */}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-secondary">{user.nickname ?? user.name ?? '나'}</span>
              <TierBadge points={user.activityPoints ?? 0} size={15} overallRank={myRank} />
              <span className="shrink-0 text-xs font-bold tabular-nums text-accent-300">{(user.activityPoints ?? 0).toLocaleString()}점</span>
            </div>
          )}
          {/* TOP3 포디움 — Chess.com 리더보드 문법(2-1-3 배치) + 등급색 그라데이션 링(1위 크게) */}
          {rows.length >= 3 && (
            <div className="mb-2 grid grid-cols-3 items-end gap-1.5">
              {[rows[1], rows[0], rows[2]].map((r, idx) => {
                const place = idx === 1 ? 1 : idx === 0 ? 2 : 3;
                const big = place === 1;
                const rt = tierOf(r.activityPoints);
                return (
                  // 포인트 1곳(오너 지시 2026-08-28) — 1위만 conic 시그니처 링(.ring-conic).
                  // 2·3위는 기존 card-elev 유지. 둘 다 background-image 라 같은 요소 병용 금지(index.css 주석).
                  // 1위 배경이 accent-300/[0.08]→surface-low 로 바뀌지만 합성색이 #1E1830 vs #1D192E 로
                  // 사실상 동일 — 이름(text-accent-300) 대비 3.718→3.711 로 실질 불변.
                  <div key={r.id} className={['rounded-card border p-2.5 text-center', big ? 'ring-conic bg-surface-low' : 'card-elev border-border-subtle bg-surface-high'].join(' ')}>
                    <Icon name={idx === 1 ? 'crown' : 'medal'} size={big ? 22 : 17}
                      className={['mx-auto', PODIUM_TONE[idx]].join(' ')} role="img" aria-hidden={false} aria-label={`${idx === 1 ? 1 : idx === 0 ? 2 : 3}위`} />
                    <span className={['mx-auto mt-1 block rounded-full p-[2px]', big ? 'h-10 w-10' : 'h-8 w-8'].join(' ')}
                      style={{ background: `conic-gradient(from 210deg, ${rt.color}, ${rt.color}44 45%, ${rt.color}CC 70%, ${rt.color})` }}>
                      <span className={['flex h-full w-full items-center justify-center rounded-full font-bold text-white', big ? 'text-sm' : 'text-2xs'].join(' ')}
                        style={{ background: r.avatarColor ?? '#5A6175' }}>
                        {r.nickname[0]}
                      </span>
                    </span>
                    <p className={['mt-1 truncate font-bold', big ? 'text-sm text-accent-300' : 'text-xs text-ink-primary'].join(' ')}>{markPrefix(r)}{r.nickname}</p>
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
                  <li key={r.id} className="border-y border-accent-400/40 bg-accent-300/[0.08] px-3 py-3 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-extrabold text-white"
                        style={{ background: r.avatarColor ?? '#5A6175' }}>
                        {r.nickname[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-accent-300">{i + 1}위 · {r.nickname} <span className="font-semibold text-ink-muted">(나)</span></p>
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
                      {isMe && <span className="text-2xs font-bold text-accent-300">나</span>}
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
            <div className="mt-2 flex items-center gap-3 rounded-card border border-accent-400/40 bg-accent-300/[0.08] px-3 py-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-300 text-base font-extrabold text-white">
                {(user.nickname ?? '나')[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-accent-300">{user.nickname ?? '나'} <span className="font-semibold text-ink-muted">(나)</span></p>
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
              <p className="mb-2 flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink-primary"><Icon name="target" size={15} className="shrink-0" />이번 주 미션 <span className="text-2xs font-normal text-ink-muted">달성하면 활동점수 즉시 지급 · 월요일 리셋</span></p>
              {missionsBlock}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
