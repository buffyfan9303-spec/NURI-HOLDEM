// src/components/features/TierLeaderboard.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { goSubTab } from '../../lib/subTabTransition';
import {
  getDomesticRankings, myRankVerifications, submitRankVerification,
  EVENT_KIND_LABEL, type RankVerification, type DomesticRow,
} from '../../api/rankverify';
import { useAuth } from '../../contexts/AuthContext';
import TierBadge, { tierOf, tierColor, tierProgress, allTiers, isAceRank, ACE_TOP_RANK, ACE_MIN_POINTS, tierCss, ACE_VAR } from '../atoms/TierBadge';
import {
  getActivityLeaderboard, getMyPointBalance, getShoutRules,
  getShopSkus, getMyOwnedMarks, buyMark, SHOUT_SLOT_SECONDS, CHEER_DAILY_CAP, BUMP_SLOTS,
  getMyCosmetics, buyCosmetic, setEquippedCosmetic, getNickColors,
  getBuyableSeasonBadges, getMySeasonBadges, buySeasonBadge, buyNicknameReset,
  type LeaderboardEntry, type PointBalance, type ShopSku, type OwnedMark,
  type OwnedCosmetic, type BuyableSeasonBadge, type OwnedSeasonBadge,
} from '../../api/community';
import {
  loadCosmetics, frameCosmetics, nickColorCosmetics, nickColorVar,
  FALLBACK_COSMETICS, type Cosmetic,
} from '../../lib/cosmetics';
import { drawProfileCard, downloadProfileCard, frameLabel, DEFAULT_FRAME } from '../../lib/profileCard';
import { getGlobalRankingTotals, CAREER_PERIOD_LABEL, type GlobalRankingTotal, type CareerPeriod } from '../../api/rankings';
import { onColorInkClass } from '../../lib/color';
import { useToast } from '../atoms/Toast';
import EmptyState from '../atoms/EmptyState';
import Icon from '../atoms/Icon';
import CountUp from '../atoms/CountUp';
import SlidingPill from '../atoms/SlidingPill';
import { ShoutComposer } from './CommunityShoutBar';
import {
  loadShopMarks, earnMarks, ownableMarks, markEmoji, markOf, FALLBACK_CATALOG,
  type CatalogMark,
} from '../../lib/shopMarks';
import { getHallOfFame, type HallBoard } from '../../lib/hallOfFame';
import {
  MISSIONS, getActiveMissions, getMissionProgress, claimMission, type Mission, type MissionProgress,
  BADGES, getMyBadgeStats, type BadgeStats,
  getMyEquippedMark, setEquippedMark as saveEquippedMark,
} from '../../lib/loyalty';

// 시상대 색 — 👑🥈🥉 이모지는 OS 마다 금·은·동 색조가 달라 서열이 뒤집혀 보였다.
// 아이콘 + 토큰 색으로 옮겨 1·2·3위 서열을 앱이 통제한다(AdminTab 명예의 전당과 같은 규약).
const HALL_TONE = ['text-gold-300', 'text-slate-200', 'text-amber-600'] as const;   // 1·2·3위 순
const PODIUM_TONE = ['text-slate-200', 'text-gold-300', 'text-amber-600'] as const; // 시상대 배치는 2·1·3위 순

// 통합 랭킹 허브 — 활동/머니인/프라이즈 + 주간 리그·업적·미션·명예의 전당(충성도)
type Board = 'activity' | 'moneyin' | 'badges' | 'missions' | 'hall' | 'shop' | 'domestic' | 'verify';
// 탭바에 실제로 보이는 순서 — 전환 방향(좌/우)이 이 순서에서 나온다.
// map 과 방향 계산이 각자 배열을 들면 언젠가 어긋나므로 하나만 둔다.
// 주간 리그는 2026-09-05 삭제(오너). 머니인 = 전국 대회 입상 경력.
const RANK_TABS: Board[] = ['activity', 'moneyin', 'hall', 'domestic', 'verify', 'shop'];
const BOARD_LABEL: Record<Board, string> = {
  activity: '활동 순위', moneyin: '머니인', shop: '상점', domestic: '국내 순위', verify: '순위 인증',
  badges: '업적', missions: '미션', hall: '명예의 전당',
};
const BOARD_DESC: Record<Board, string> = {
  domestic: '대회(토너먼트) 입상만 인정. 해외 대회도 포함하며, 운영자가 승인한 건에 한해 100만원(100T)당 1점으로 합산합니다. 일반 펍 정기 게임은 포함되지 않습니다.',
  verify: '대회 입상 증빙 2장(머니인·신분증)을 올려 운영자 승인을 받으면 국내 순위에 합산됩니다. 대회만 인정되며(일반 펍 제외) 100만원(100T)당 1점입니다.',
  shop: '모으는 마크는 활동점수 도달로 영구 해금(차감 없음)이고, 나머지(꾸미기 마크·프레임·닉네임 색·시즌 뱃지·외치기·응원·끌올)는 사용 가능 점수로 삽니다. 소장한 것은 영구히 남고, 무엇을 사도 누적 점수(등급 기준)는 줄지 않습니다.',
  activity: '접속·글쓰기·댓글 활동 점수. 등급(2·3~AA)과 연동. 아래 주간 미션을 달성하면 점수를 바로 받아요.',
  moneyin: '전국 대회 머니인(입상) 경력 순위. 매장이 등록한 대회 순위 기록만 세며 상금·금액은 보지 않습니다 — 입상 횟수 → 우승 → TOP3 → 최고 등수 순.',
  badges: '조건을 달성하면 자동으로 열리는 업적 뱃지. 모아서 프로필을 채우세요.',
  missions: '이번 주 미션. 달성하면 활동점수 보상을 바로 받아요. 월요일 리셋.',
  hall: '지난달 가장 빛난 플레이어 TOP3. 운영자가 직접 선정하며, 선정이 없는 달은 입상 기록으로 자동 집계됩니다.',
};

/**
 * 예전 기간권의 잔여 — 하루 미만은 시간으로.
 * 기간권은 판매 중지됐지만 **이미 산 사람의 남은 기간은 그대로 인정**한다(서버 my_owned_marks source='rent').
 */
function remainDays(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return '만료됨';
  const h = Math.floor(ms / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)}일 남음` : `${Math.max(1, h)}시간 남음`;
}

/**
 * 외치기 카드 부제 — 등급 이름을 서버 가격표에서 그대로 읽어 잇는다('외치기 · 하이라이트').
 * ⚠ 전광판(shout_board)은 판매 중지라 여기 뜨면 안 된다. 서버가 active=false 로 이미 빼 주지만
 *   화면에서도 한 번 더 막는다(ShoutComposer 의 등급 목록과 같은 규약).
 */
function shoutTierHint(skus: ShopSku[]): string {
  return skus.filter((s) => s.kind === 'shout' && s.key !== 'shout_board')
    .sort((a, b) => a.sort - b.sort).map((s) => s.label).join(' · ');
}

function RankNum({ n }: { n: number }) {
  const top = n <= 3;
  // 1~3위 메달색은 금·은·동이라는 도메인 기호(등급 팔레트가 아님)라 고정 스냅샷으로 둔다.
  // 잉크만 --ink-on-bright 로 옮긴다 — 세 배경 모두 밝아 어두운 잉크가 정답이고, 값이 토큰과 갈리면 안 된다.
  const medals = ['#FFD100', '#C0C8D8', '#E0945A'];
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-2xs font-extrabold tabular-nums shrink-0"
      style={
        top
          ? { background: medals[n - 1], color: 'rgb(var(--ink-on-bright))' }
          : {
              background: 'transparent',
              // 4위 이하 순위 숫자. 구 리터럴 #7C8696 은 surface-high 위 다크 3.82 · 라이트 3.26 으로
              // 양쪽 AA 미달이었다. 텍스트용 토큰 --tier-slate(장식용 -vivid 아님)로 5.40 / 5.70.
              color: tierCss('--tier-slate'),
              // 구 리터럴 #2a2f3a 는 다크 전용이라 라이트에서 11.87:1 의 새까만 테두리가 됐다.
              border: '1px solid rgb(var(--border-default))',
            }
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

/** 상점 액션 버튼의 **고정 박스** — 구매/장착/해제 세 상태가 같은 크기를 쓰게 한다.
 *  테두리를 항상 1px 잡아 두는 것이 핵심이다(활성일 때만 transparent):
 *  예전엔 활성 상태만 테두리가 없어 누르는 순간 높이가 2px 줄었다 늘었다 — 그게 오너가 본 '툭' 이다.
 *  바뀌는 것을 색·글자로만 한정하면 transition-colors 하나로 부드러워진다(모션 헌법 §4). */
const SHOP_BTN = 'mt-1.5 inline-flex w-full min-h-[30px] items-center justify-center gap-1 rounded-input border px-2 py-1.5 text-2xs font-bold transition-colors disabled:opacity-50';
const SHOP_BTN_ON = 'border-transparent bg-accent-300 text-white';
const SHOP_BTN_OFF = 'border-accent-400/40 text-accent-300 hover:bg-accent-300/10';

/** 전국 대회 머니인 입상 경력 보드(오너 결정 2026-09-05) — 상금·금액 없이 '입상 경력'만 강조한다.
 *  기간 칩(전체·올해·최근 90일) · 내 경력 카드(전국 순위·상위 %) · 목록(입상 횟수 큰 숫자 + 우승·TOP3·최고 등수·매장 수·최근 입상). */
function CareerBoard({ myNick, nickStyle, markPrefix }: {
  myNick: string | null;
  nickStyle: (r: unknown) => CSSProperties | undefined;
  markPrefix: (r: unknown) => string;
}) {
  const [period, setPeriod] = useState<CareerPeriod>('all');
  const [rows, setRows] = useState<GlobalRankingTotal[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0); // 실패 후 '다시' — 같은 기간이라도 재조회
  useEffect(() => {
    let alive = true;
    setRows(null); setFailed(false);
    getGlobalRankingTotals(period)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) { setRows([]); setFailed(true); } });
    return () => { alive = false; };
  }, [period, tick]);
  const key = (myNick ?? '').trim().toLowerCase();
  const myIdx = rows && key ? rows.findIndex((r) => r.nickname.trim().toLowerCase() === key) : -1;
  const me = myIdx >= 0 && rows ? rows[myIdx] : null;
  const pct = me && rows ? Math.max(1, Math.round(((myIdx + 1) / rows.length) * 100)) : null;
  const fmtDate = (d: string | null) => (d ? d.slice(2).replace(/-/g, '.') : '');
  return (
    <div className="space-y-2">
      {/* 기간 — 경력은 누적이 본질이라 '전체'가 기본. 올해·최근 90일은 현역 감각용. */}
      <div className="flex gap-1.5" role="group" aria-label="집계 기간">
        {(Object.keys(CAREER_PERIOD_LABEL) as CareerPeriod[]).map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p}
            className={['min-h-9 rounded-chip border px-3 text-2xs font-bold transition-colors',
              period === p ? 'border-transparent bg-accent-300 text-white' : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
            {CAREER_PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      {rows === null ? (
        <RowSkeleton rows={8} />
      ) : failed ? (
        <EmptyState title="경력을 불러오지 못했어요" hint="잠시 후 다시 열어 주세요" icon={<Icon name="alert" />}
          action={<button type="button" onClick={() => setTick((t) => t + 1)} className="btn-ghost px-3 py-1.5 text-xs">다시 불러오기</button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={period === 'all' ? '아직 집계된 대회 입상이 없어요' : '이 기간의 대회 입상이 없어요'}
          hint="매장이 대회 순위를 올리면 입상 경력이 이 표에 자동으로 오릅니다"
          icon={<Icon name="trophy" />}
        />
      ) : (
        <>
          {/* 내 경력 — 전국 순위·상위 % 와 경력 한 줄. 로그인 전엔 그리지 않는다. */}
          {myNick && (me ? (
            <div className="rounded-card border border-accent-400/40 bg-accent-300/[0.08] px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-bold text-accent-300">내 대회 입상 경력 <span className="font-normal text-ink-muted">· {CAREER_PERIOD_LABEL[period]}</span></p>
                <p className="shrink-0 text-xs font-extrabold tabular-nums text-ink-primary">전국 {myIdx + 1}위 <span className="font-semibold text-ink-muted">· 상위 {pct}%</span></p>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs tabular-nums text-ink-secondary">
                <span>입상 <b className="text-ink-primary">{me.moneyinCount}</b>회</span>
                <span>우승 <b className="text-ink-primary">{me.wins}</b>회</span>
                <span>TOP3 <b className="text-ink-primary">{me.top3}</b>회</span>
                <span>최고 <b className="text-ink-primary">{me.bestPosition}</b>위</span>
                <span>매장 <b className="text-ink-primary">{me.venues}</b>곳</span>
                {me.lastDate && <span>최근 {fmtDate(me.lastDate)}</span>}
              </p>
            </div>
          ) : (
            <p className="rounded-card border border-border-subtle bg-surface-high px-3 py-2 text-center text-2xs text-ink-muted">아직 내 대회 입상 기록이 없어요 — 매장이 대회 순위를 올리면 자동으로 오릅니다</p>
          ))}
          <ul className="overflow-hidden rounded-card border border-border-subtle bg-surface-high">
            {rows.slice(0, 50).map((r, i) => {
              const isMe = i === myIdx;
              return (
                <li key={r.nickname} className={['flex items-center gap-2.5 border-b border-border-subtle px-3 py-2 last:border-b-0', isMe ? 'bg-accent-300/[0.08]' : ''].join(' ')}>
                  <RankNum n={i + 1} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-primary" style={nickStyle(r)}>{markPrefix(r)}{r.nickname}{isMe && <span className="ml-1 text-2xs font-semibold text-accent-300">(나)</span>}</span>
                    <span className="block truncate text-2xs tabular-nums text-ink-muted">우승 {r.wins} · TOP3 {r.top3} · 최고 {r.bestPosition}위 · 매장 {r.venues}곳</span>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums text-accent-300">입상 {r.moneyinCount}회</span>
                    {r.lastDate && <span className="block text-2xs tabular-nums text-ink-muted">{fmtDate(r.lastDate)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="pt-0.5 text-center text-2xs text-ink-muted">매장이 등록한 대회 순위(입상)만 집계 · 상금·금액과 무관 · 상위 50명</p>
        </>
      )}
    </div>
  );
}

export default function TierLeaderboard() {
  const { user, refreshProfile } = useAuth();
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLadder, setShowLadder] = useState(false);
  const [board, setBoard] = useState<Board>('activity');
  /**
   * 랭킹 세부 탭 전환 — 매장 서브탭(VenuePage)과 같은 방향성 푸시.
   * 탭바는 전환 중 자기 스냅샷 이름을 가져 제자리에 고정되고, 아래 본문만 밀린다.
   * (상시 name 을 주면 화면을 떠날 때 탭바 잔상이 얼어붙는다 — VenuePage 에서 실측된 함정.)
   * 조리법은 goSubTab 하나 — 마커 수명 = 전환 수명. 고정 타이머는 느린 기기에서 전환 도중 풀려
   * 탭바 위쪽(내 등급·헤더)이 blur 로 밀렸다 돌아왔다(오너 지적 2026-09-05, CPU×8 실측).
   */
  const goBoard = useCallback((next: Board) => {
    goSubTab('rank-tab', RANK_TABS, board, next, () => setBoard(next));
  }, [board]);
  // 순위표 행의 닉네임 색 — rows 가 바뀔 때만 일괄 조회한다(행마다 부르지 않는다).
  const [rowNickTokens, setRowNickTokens] = useState<Record<string, string>>({});
  // 충성도 허브 — 주간 리그/업적/미션/명예의 전당(보드 진입 시 1회 로드)
  const toast = useToast();
  const [badgeStats, setBadgeStats] = useState<BadgeStats | null>(null);
  const [equippedMark, setEquippedMark] = useState<string | null | undefined>(undefined); // 상점: 장착 마크(undefined=미로드)
  const [equipBusy, setEquipBusy] = useState<string | null>(null);
  // 상점 소비형 상품 — 누적 점수는 그대로 두고 '사용 가능 점수'만 깎는다(§spent_points).
  // 2026-08-30: 꾸미기 마크를 기간권에서 **2,000점 영구 소장**으로 옮겼다.
  // 만료로 반복 소비를 만들려던 설계였지만 만료는 '산 걸 잃는 일'이라 살 이유가 아니라 안 살 이유였다.
  // 반복 소비는 외치기(20초 슬롯)가 맡는다 — 그쪽은 만료가 상품의 본질이라 손해로 읽히지 않는다.
  const [balance, setBalance] = useState<PointBalance | null>(null);
  // ⚠ 초기값은 서버 shop_skus.shout_basic 과 같아야 한다. 낮게 두면 응답이 오기 전 한 프레임 동안
  //   화면은 '30점'이라 말하고 서버는 실제 가격을 걷는다 — 유저에게 거짓말이 되는 값이다.
  //   2026-08-30 슬롯 전환(기간 → 20초 1회)으로 200 → 50.
  const [shoutCost, setShoutCost] = useState(50);
  const [shoutOpen, setShoutOpen] = useState(false);
  const [skus, setSkus] = useState<ShopSku[]>([]);
  // 내가 가진 꾸미기 마크 — own(영구 소장) + rent(판매 중지된 예전 기간권의 잔여분).
  // 두 갈래를 한 목록으로 받는 이유: 장착 가능 여부의 판정을 화면이 다시 하지 않기 위해서다
  // (서버 set_equipped_mark 가 같은 세 갈래로 최종 판정한다 — 화면이 자체 판정하면 언젠가 갈린다).
  const [owned, setOwned] = useState<OwnedMark[] | null>(null);
  const [earnList, setEarnList] = useState<CatalogMark[]>(() => FALLBACK_CATALOG.filter((m) => m.kind === 'earn'));
  const [shopList, setShopList] = useState<CatalogMark[]>(() => FALLBACK_CATALOG.filter((m) => m.kind === 'rent'));
  const [buying, setBuying] = useState<string | null>(null);       // 구매 중인 마크 키
  // ── 소유물형 상품(2026-08-30 · 20260830n) ──────────────────────────────────
  //   프레임 400 · 닉네임 색 600 · 시즌 뱃지 300 · 즉시 변경권 250.
  //   전부 **표현·소유·편의**뿐이다. 확률형(뽑기)·포인트 베팅·유저 간 포인트 선물·
  //   포인트↔이용권 교환·참가비 대납은 설계에서 배제했다 — 점수가 값을 갖는 순간
  //   게임산업법 §32①7(환전 알선) 위험이고 '환금성 없음' 방어선(약관 제10조)이 무너진다.
  const [cosmetics, setCosmetics] = useState<Cosmetic[]>(FALLBACK_COSMETICS);
  const [myCosmetics, setMyCosmetics] = useState<OwnedCosmetic[] | null>(null);
  const [seasonBuyable, setSeasonBuyable] = useState<BuyableSeasonBadge[] | null>(null);
  const [seasonOwned, setSeasonOwned] = useState<OwnedSeasonBadge[] | null>(null);
  const [nickResetBusy, setNickResetBusy] = useState(false);
  // 프로필 카드 미리보기 — 고른 프레임이 실제로 어떻게 굽히는지가 곧 400점의 근거다.
  //
  // ⚠ ref 객체(useRef)가 아니라 **콜백 ref + state** 다. 이유는 실측으로 잡힌 버그다:
  //   캔버스는 `{frameSku && ...}` 안에 있고 frameSku 는 서버 가격표(getShopSkus)가 도착해야 생긴다.
  //   상점 탭에 들어온 첫 렌더에는 캔버스가 **없으므로** 그리기 이펙트가 ref.current === null 로
  //   그냥 빠져나가고, 가격표가 도착해 캔버스가 마운트될 때는 이펙트의 의존성이 하나도 바뀌지 않아
  //   **다시 돌지 않는다** → 카드가 영원히 빈 사각형으로 남는다(런타임 프로브에서 전 픽셀 alpha=0).
  //   노드를 state 로 들면 '마운트'가 곧 의존성 변화라 그 순간 그려진다.
  const [cardEl, setCardEl] = useState<HTMLCanvasElement | null>(null);
  // 키 → 보유 상태. own 이 rent 를 이긴다(서버 my_owned_marks 가 이미 그렇게 정렬해 주지만,
  // 화면에서도 같은 우선순위를 박아 둔다 — 소장한 마크에 '3일 남음'이 뜨면 거짓말이 된다).
  const ownedBy = useMemo(() => {
    const m = new Map<string, OwnedMark>();
    for (const o of owned ?? []) if (o.source === 'own' || !m.has(o.markKey)) m.set(o.markKey, o);
    return m;
  }, [owned]);
  // 마크 가격 — 서버 shop_skus.mark_own 이 단일 출처다. **화면에 하드코딩하지 않는다**
  // (가격표가 바뀌면 화면은 옛 값을 말하고 서버는 새 값을 걷는다 — shoutCost 폴백 30 vs 서버 200 과 같은 함정).
  const markSku = skus.find((s) => s.kind === 'mark') ?? null;
  // 반복 소비형 2종(2026-08-30) — 상점은 가격만 보여 주고, 구매는 대상이 있는 커뮤니티에서 한다.
  const cheerSku = skus.find((s) => s.kind === 'cheer') ?? null;
  const bumpSku = skus.find((s) => s.kind === 'bump') ?? null;
  // 판매 중지된 기간권 — 서버가 active=false 로 이미 빼 주지만, 되살아나도 살 수 없게 화면에서도 막는다.
  const deadRentSkus = skus.filter((s) => s.kind === 'mark_rent');
  // 소유물형 SKU — 가격은 전부 서버가 출처다(화면에 숫자를 박지 않는다).
  const frameSku  = skus.find((s) => s.key === 'card_frame') ?? null;
  const nickSku   = skus.find((s) => s.key === 'nick_color') ?? null;
  const seasonSku = skus.find((s) => s.key === 'season_badge') ?? null;
  const nickChangeSku = skus.find((s) => s.key === 'nick_change') ?? null;
  const frameList = useMemo(() => cosmetics.filter((c) => c.kind === 'card_frame'), [cosmetics]);
  const nickList  = useMemo(() => cosmetics.filter((c) => c.kind === 'nick_color'), [cosmetics]);
  // 키 → 소장/장착. 소유 판정은 서버 my_cosmetics() 가 이미 끝냈다(화면이 다시 하지 않는다).
  const cosmeticBy = useMemo(() => {
    const m = new Map<string, OwnedCosmetic>();
    for (const c of myCosmetics ?? []) m.set(c.itemKey, c);
    return m;
  }, [myCosmetics]);
  const equippedFrame = (myCosmetics ?? []).find((c) => c.kind === 'card_frame' && c.equipped)?.itemKey ?? null;
  // ⚠ 닉네임 30일 쿨다운 판정은 서버 enforce_nickname_cooldown 트리거와 **같은 식**이어야 한다.
  //   갈리면 '샀는데 못 바꾸는' 또는 '안 사도 되는데 사게 되는' 둘 중 하나가 된다.
  //   (최종 판정은 서버 buy_nickname_reset 이 한다 — 여기는 버튼을 보여줄지 정할 뿐이다.)
  const nickLocked = (() => {
    if (!user || user.role === 'admin' || !user.nameChangedAt) return false;
    return Date.now() - new Date(user.nameChangedAt).getTime() < 30 * 24 * 3600_000;
  })();
  const nickFreeAt = user?.nameChangedAt
    ? new Date(new Date(user.nameChangedAt).getTime() + 30 * 24 * 3600_000).toLocaleDateString('ko-KR')
    : '';
  const reloadBalance = useRef(() => { getMyPointBalance().then(setBalance).catch(() => {}); }).current;
  const [domestic, setDomestic] = useState<DomesticRow[] | null>(null);
  const [myVerifs, setMyVerifs] = useState<RankVerification[] | null>(null);
  // 오너 #11(2026-08-30): 대회 구분 선택 제거 — 순위 인증은 '대회'만 받는다.
  //   일반 펍(정기 게임)은 인증 대상이 아니고, 서버 RLS 도 event_kind='official' 만 통과시킨다.
  const [vForm, setVForm] = useState<{ event: string; amount: string; overseas: boolean }>(
    { event: '', amount: '', overseas: false });
  const [vProof, setVProof] = useState<File | null>(null);
  const [vIdCard, setVIdCard] = useState<File | null>(null);
  const [vBusy, setVBusy] = useState(false);
  // 행 닉네임 앞 장착 마크 — equippedMark 없는 행 타입(주간 리그 등)도 안전.
  // 만료·강등된 마크는 서버(get_activity_leaderboard)가 이미 null 로 지워서 준다.
  const markPrefix = (r: unknown): string => {
    const k = (r as { equippedMark?: string | null }).equippedMark;
    const e = markEmoji(k);
    return e ? e + ' ' : '';
  };
  /**
   * 행 닉네임 색(상점 600점 · 20260830n) — 마크와 **같은 결합 지점**이다.
   * 소장·판매 판정은 서버 get_nick_colors 가 이미 끝냈고, 여기서는 토큰명을 CSS 변수로 잇기만 한다.
   * 색이 없는 행은 undefined 를 돌려 종전 클래스 색(등급색·ink-primary)을 그대로 둔다.
   */
  const nickStyle = (r: unknown): CSSProperties | undefined => {
    // 보드마다 회원 id 를 담는 키가 다르다(활동 순위 = id · 주간 리그 = userId ·
    // 매장 통합 집계 = 닉네임만). 둘 다 없으면 색을 칠하지 않는다 — 종전 그대로다.
    const row = r as { id?: string | null; userId?: string | null };
    const id = row?.id ?? row?.userId ?? null;
    const v = id ? nickColorVar(rowNickTokens[id]) : null;
    return v ? { color: tierCss(v) } : undefined;
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
        isOverseas: vForm.overseas,
      });
      setVForm({ event: '', amount: '', overseas: false }); setVProof(null); setVIdCard(null);
      setMyVerifs(null); myRankVerifications().then(setMyVerifs).catch(() => {});
    } catch { /* 실패 시 입력 유지 */ }
    finally { setVBusy(false); }
  };
  // 마크 영구 소장 구매 — 차감·소장·장착이 서버 한 트랜잭션이라 여기서는 결과만 반영한다.
  // 중복 클릭은 buying 으로 한 번 더 막지만, 최종 판정은 프로필 행 잠금을 쥔 서버가 한다.
  const handleBuyMark = async (mk: CatalogMark) => {
    if (buying !== null || !markSku) return;
    setBuying(mk.key);
    try {
      const key = await buyMark(mk.key);
      setOwned((prev) => [...(prev ?? []).filter((o) => o.markKey !== key), { markKey: key, source: 'own', until: null }]);
      setEquippedMark(key);                 // 서버가 구매 즉시 장착까지 끝냈다
      reloadBalance();
      await refreshProfile?.();
      toast.show(`${markOf(key)?.name ?? '마크'} 소장! ${markSku.price.toLocaleString()}점 사용. 이제 계속 쓸 수 있어요`, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '구매에 실패했습니다', 'error');
    } finally { setBuying(null); }
  };

  // 장착/해제 진행 표시 — handleEquip 이 equipBusy 에 넣는 값과 **정확히 같은 규칙**으로 되물어야 한다.
  // 종전 식 `equipBusy === (on ? null : mk.key)` 는 장착 중인 카드에서 equipBusy(null) === null 이
  // 항상 참이라, 아무것도 누르지 않았는데도 '적용 중…' 이 영구히 박혀 있었다
  // (장착한 마크의 '해제' 버튼이 통째로 사라진 셈 — 2026-08-30 런타임 프로브가 잡았다).
  const equipPending = (key: string, on: boolean) => equipBusy !== null && equipBusy === (on ? '' : key);

  const handleEquip = async (key: string | null) => {
    if (equipBusy !== null) return;
    setEquipBusy(key ?? '');
    try {
      await saveEquippedMark(key);
      setEquippedMark(key);
    } catch { /* 실패 시 기존 유지 */ }
    finally { setEquipBusy(null); }
  };

  // ── 소유물형 구매·장착 (2026-08-30 · 20260830n) ───────────────────────────
  // 마크와 **같은 규약**: 차감·소장·장착이 서버 한 트랜잭션이라 화면은 결과만 반영한다.
  const handleBuyCosmetic = async (c: Cosmetic) => {
    const sku = c.kind === 'card_frame' ? frameSku : nickSku;
    if (buying !== null || !sku) return;
    setBuying(c.key);
    try {
      const key = await buyCosmetic(c.kind, c.key);
      // 산 즉시 장착이므로 같은 kind 의 다른 항목은 장착이 풀린다 — 서버 상태와 같게 맞춘다.
      setMyCosmetics((prev) => [
        ...(prev ?? []).filter((o) => o.itemKey !== key)
          .map((o) => (o.kind === c.kind ? { ...o, equipped: false } : o)),
        { kind: c.kind, itemKey: key, equipped: true },
      ]);
      reloadBalance();
      toast.show(`${c.label} 소장! ${sku.price.toLocaleString()}점 사용. 바로 적용됐어요`, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '구매에 실패했습니다', 'error');
    } finally { setBuying(null); }
  };

  const handleEquipCosmetic = async (c: Cosmetic, on: boolean) => {
    if (equipBusy !== null) return;
    setEquipBusy(on ? '' : c.key);
    try {
      const key = await setEquippedCosmetic(c.kind, on ? null : c.key);
      setMyCosmetics((prev) => (prev ?? []).map((o) =>
        o.kind === c.kind ? { ...o, equipped: key !== null && o.itemKey === key } : o));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '적용에 실패했습니다', 'error');
    } finally { setEquipBusy(null); }
  };

  const handleBuySeasonBadge = async (b: BuyableSeasonBadge) => {
    if (buying !== null || !seasonSku) return;
    setBuying(b.seasonId);
    try {
      const r = await buySeasonBadge(b.venueId);
      setSeasonBuyable((prev) => (prev ?? []).filter((x) => x.seasonId !== r.seasonId));
      getMySeasonBadges().then(setSeasonOwned).catch(() => {});
      reloadBalance();
      toast.show(`${r.venueName} ${r.seasonName} 뱃지를 받았어요. ${seasonSku.price.toLocaleString()}점 사용`, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '구매에 실패했습니다', 'error');
    } finally { setBuying(null); }
  };

  // 파는 것은 기능이 아니라 **기다림 면제**다. 닉네임 변경 자체는 계속 무료이고,
  // 쿨다운이 안 걸려 있으면 서버가 '이 권한은 필요하지 않습니다'로 거절한다.
  const handleBuyNickReset = async () => {
    if (nickResetBusy || !nickChangeSku) return;
    setNickResetBusy(true);
    try {
      await buyNicknameReset();
      reloadBalance();
      await refreshProfile?.();
      toast.show('이제 설정 탭에서 닉네임을 바로 바꿀 수 있어요', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '구매에 실패했습니다', 'error');
    } finally { setNickResetBusy(false); }
  };

  const handleSaveCard = () => {
    if (!user) return;
    downloadProfileCard({
      nickname: user.nickname ?? user.name ?? '회원',
      tierLabel: isAdmin ? 'SS' : myIsAce ? 'AA' : tierOf(user.activityPoints ?? 0).label,
      tierColor: tierColor(user.activityPoints ?? 0, isAdmin),
      points: user.activityPoints ?? 0,
      frame: equippedFrame,
    });
  };
  const [missions, setMissions] = useState<MissionProgress[] | null>(null);
  const [missionDefs, setMissionDefs] = useState<Mission[]>(MISSIONS);
  const [hall, setHall] = useState<HallBoard | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  useEffect(() => {
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
      // 카탈로그·가격표는 서버가 단일 출처다. 응답 전에는 폴백으로 그려 두므로 화면이 비지 않는다.
      loadShopMarks().then(() => { setEarnList(earnMarks()); setShopList(ownableMarks()); }).catch(() => {});
      getShopSkus().then(setSkus).catch(() => {});
      getMyOwnedMarks().then(setOwned).catch(() => setOwned([]));
      // 소유물형(20260830n) — 카탈로그·소장 목록·시즌 뱃지. 실패해도 폴백으로 그려 화면이 비지 않는다.
      loadCosmetics().then(() => setCosmetics([...frameCosmetics(), ...nickColorCosmetics()])).catch(() => {});
      getMyCosmetics().then(setMyCosmetics).catch(() => setMyCosmetics([]));
      getBuyableSeasonBadges().then(setSeasonBuyable).catch(() => setSeasonBuyable([]));
      getMySeasonBadges().then(setSeasonOwned).catch(() => setSeasonOwned([]));
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
      .then((r) => {
        if (!active) return;
        setRows(r);
        if (r.length) rememberRowCount(r.length >= 3 ? r.length - 3 : r.length);
        // 닉네임 색은 순위표가 도착한 뒤 한 번만 — 행 렌더 중에 부르면 30회 왕복이 된다.
        const ids = r.map((x) => x.id).filter(Boolean);
        if (ids.length) getNickColors(ids).then((m) => { if (active) setRowNickTokens(m); }).catch(() => {});
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.activityPoints]);

  const myProg = user ? tierProgress(user.activityPoints ?? 0) : null;
  const isAdmin = user?.role === 'admin';
  const myRank = useMemo(() => {
    if (!user) return null;
    const i = rows.findIndex((r) => r.id === user.id);
    return i >= 0 ? i + 1 : null;
  }, [rows, user]);
  // A(에이스) = K(14,000점) 달성 + 전체 상위 10위 이내(상대평가)
  const myIsAce = !isAdmin && isAceRank(user?.activityPoints ?? 0, myRank);

  // 프로필 카드 미리보기 — 저장 버튼이 만드는 것과 **같은 그림**을 같은 함수로 굽는다.
  // (미리보기와 결과가 다르면 그건 미리보기가 아니라 다른 그림이다.)
  // ⚠ 이 훅은 isAdmin·myIsAce 정의 뒤에 있어야 한다 — 의존성 배열은 렌더 중에 평가되므로
  //   위로 올리면 TDZ 로 터진다.
  useEffect(() => {
    if (!cardEl || !user) return;
    drawProfileCard(cardEl, {
      nickname: user.nickname ?? user.name ?? '회원',
      tierLabel: isAdmin ? 'SS' : myIsAce ? 'AA' : tierOf(user.activityPoints ?? 0).label,
      tierColor: tierColor(user.activityPoints ?? 0, isAdmin),
      points: user.activityPoints ?? 0,
      frame: equippedFrame,
    });
  }, [cardEl, user, isAdmin, myIsAce, equippedFrame]);

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
        <section className="rounded-aura border card-aura p-3">
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
              <p className="text-lg font-extrabold stat-violet tabular-nums leading-tight">
                <CountUp value={user.activityPoints ?? 0} />
              </p>
              {!isAdmin && myRank && <p className="text-2xs text-ink-muted">전체 <b className="text-xs font-extrabold tabular-nums text-ink-primary">{myRank}위</b></p>}
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
                    style={{ width: `${Math.round(myProg.ratio * 100)}%`, background: `linear-gradient(90deg, ${tierCss(myProg.current.vividVar)}, ${tierCss(myProg.next.vividVar)})` }}
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
        <div data-rank-tabbar className="relative flex items-center gap-1 bg-surface-high rounded-input p-0.5 mb-1.5 overflow-x-auto scrollbar-none lg:flex-wrap lg:overflow-visible">
          {/* 오너 지시(2026-08-28): 구 pill(그라데이션 배경) 제거 — 커뮤니티 서브탭과 같은
              밑줄(underline) 문법. 활성은 미끄러지는 2px 밑줄 + 잉크색·굵기. */}
          <SlidingPill activeKey={board} underline className="rounded-full bg-accent-300" />
          {RANK_TABS.map((b) => (
            <button key={b} type="button" data-pill-active={board === b || undefined} onClick={() => goBoard(b)}
              className={['relative shrink-0 px-2 lg:px-3 py-2 t-tab rounded-[6px] transition-colors',
                board === b ? 'text-ink-primary font-bold' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
              <span className="relative">{BOARD_LABEL[b]}</span>
            </button>
          ))}
        </div>
        <div data-rank-panel>
        {/* 보드 설명 — 1행/2행이 섞이면 탭을 옮길 때마다 아래가 통째로 밀린다. 2행분을 예약. */}
        <p className="mb-2 min-h-[2.25rem] t-desc text-ink-muted">{BOARD_DESC[board]}</p>

        {board === 'missions' ? (
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
              hint="'순위 인증' 탭에서 대회 입상 증빙을 올리면 이 순위에 합산됩니다"
              icon={<Icon name="trophy" />}
              action={<button type="button" onClick={() => setBoard('verify')} className="btn-primary px-4 py-2 text-xs">순위 인증하러 가기</button>}
            />
          )
          : (
            <ul className="space-y-1">
              {domestic.map((r, i) => (
                <li key={r.nickname} className="flex items-center gap-2.5 rounded-input bg-surface-high px-3 py-2">
                  <span className="w-6 shrink-0 text-center text-sm font-extrabold tabular-nums text-accent-300">{i + 1}</span>
                  {/* ⚠ 부모에 truncate(nowrap+overflow+ellipsis)를 걸고 자식을 block 으로 두면
                      통계 줄은 **말줄임표조차 없이 하드 클립**된다 — ellipsis 는 부모의 인라인 콘텐츠에만
                      적용되기 때문이다. 누적 금액이 커질수록 먼저 사라졌다. 줄마다 각자 줄인다. */}
                  <span className="flex min-w-0 flex-1 flex-col text-sm font-semibold text-ink-primary">
                    <span className="truncate">{r.nickname}</span>
                    <span className="truncate text-2xs font-normal text-ink-muted tabular-nums">
                      대회 {r.wins}회{r.overseas > 0 ? ` · 해외 ${r.overseas}회` : ''} · 누적 {(r.totalWon / 10000).toLocaleString()}만
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
                {/* 오너 #11 — 구분 선택을 없앴다. 인증 대상은 '대회'뿐이고, 일반 펍 정기 게임은
                    신청 자체가 성립하지 않는다(서버 RLS 도 official 만 받는다). 선택지를 남겨 두면
                    '내면 뭐라도 남겠지'라는 기대가 생겨 반려만 늘어난다 — 조건을 먼저 말한다. */}
                <p className="flex items-start gap-1.5 rounded-input border border-accent-400/40 bg-accent-300/[0.08] px-2.5 py-2 text-2xs leading-relaxed text-ink-secondary">
                  <Icon name="trophy" size={13} className="mt-px shrink-0 text-accent-300" />
                  <span><b className="text-accent-200">대회(토너먼트) 입상만 인증됩니다.</b> 매장 정기 게임(일반 펍) 기록은 순위 인증 대상이 아니며, 제출해도 반려됩니다.</span>
                </p>
                <label className="flex items-center justify-between gap-2 rounded-input border border-border-default px-3 py-2 text-2xs">
                  <span className="text-ink-secondary">해외 대회입니다 <span className="text-ink-muted">해외도 정식 대회면 인정돼요</span></span>
                  <input type="checkbox" checked={vForm.overseas} className="h-4 w-4 shrink-0 accent-current text-accent-300"
                    onChange={(e) => setVForm((f) => ({ ...f, overseas: e.target.checked }))} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-input border border-dashed border-border-default px-3 py-2 text-2xs">
                  <span className={vProof ? 'text-emerald-300 font-bold' : 'text-ink-secondary'}>1. 머니인 증빙 {vProof ? '✓ 첨부됨' : '이름·순위·금액이 보여야 해요'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setVProof(e.target.files?.[0] ?? null)} />
                  <span className="shrink-0 rounded-input bg-surface-float px-2 py-1 font-bold text-ink-secondary">선택</span>
                </label>
                <label className="flex items-center justify-between gap-2 rounded-input border border-dashed border-border-default px-3 py-2 text-2xs">
                  <span className={vIdCard ? 'text-emerald-300 font-bold' : 'text-ink-secondary'}>2. 신분증 {vIdCard ? '✓ 첨부됨' : '이름·주민번호 앞자리만 보이게 가리고 촬영'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setVIdCard(e.target.files?.[0] ?? null)} />
                  <span className="shrink-0 rounded-input bg-surface-float px-2 py-1 font-bold text-ink-secondary">선택</span>
                </label>
                <button type="button" disabled={vBusy || !vForm.event.trim() || !vForm.amount || !vProof || !vIdCard}
                  onClick={submitVerify}
                  className="btn-primary w-full disabled:opacity-50">{vBusy ? '제출 중…' : '인증 요청'}</button>
                <p className="text-2xs leading-relaxed text-ink-muted">
                  운영자가 <b className="text-ink-secondary">대회 입상으로 승인한 건</b>만 국내 순위에 합산되며, <b className="text-ink-secondary">100만원(100T)당 1점</b>입니다(임계 미만은 점수 없음). 대회 여부는 증빙을 보고 운영자가 최종 판정합니다. <b className="text-ink-secondary">신분증 이미지는 승인·거절 즉시 삭제</b>되며 다른 용도로 사용되지 않습니다. AI 생성·조작 이미지는 반려됩니다.
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

              {/* ── 점수로 사는 것 ─────────────────────────────────────────────────
                  '활동으로 얻는 것(도달 마크)'과 '점수로 사는 것(구매 상품)'을 절대 섞지 않는다.
                  섞이면 이미 해금해 장착 중인 마크가 '사야 하는 것'으로 보여 산 걸 빼앗는 회귀가 된다
                  (spent_points 를 activity_points 와 분리한 이유가 정확히 그것이었다). */}
              <div className="flex items-center gap-1.5 pt-1">
                {/* 카피(오너 2026-09-04): '쓰는 이유/버는 이유'는 내부 용어라 사용자에게 안 읽힌다.
                    두 구역이 섞이면 안 된다는 원칙은 그대로 두고, 말만 사용자 언어로 바꾼다.
                    아이콘도 지갑(추상) → 카트(산다)로 — 아래 '활동으로 얻는 것'의 메달과 짝이 맞는다. */}
                <Icon name="cart" size={13} className="shrink-0 text-accent-300" />
                <p className="shrink-0 text-2xs font-extrabold text-accent-300">점수로 사는 것</p>
                <p className="shrink-0 text-2xs text-ink-muted">사용 가능 점수로 구매합니다</p>
                <span className="h-px flex-1 bg-border-subtle" />
              </div>

              {/* ── 소비형 ① 꾸미기 마크 (2026-08-30 기간권 → 영구 소장) ─────────
                  기간권을 접은 이유: 만료로 반복 소비를 만들려던 설계였지만, 유저에겐 만료가
                  '산 걸 잃는 일'이라 살 이유가 아니라 안 살 이유였다. 반복 소비는 외치기가 맡는다.
                  가격은 서버 shop_skus.mark_own 이 유일한 출처다 — 화면에 숫자를 박지 않는다. */}
              <div className="rounded-card border border-border-subtle bg-surface-high p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-bold text-ink-primary">
                    꾸미기 마크 <span className="font-normal text-ink-muted">한 번 사면 영구 소장</span>
                  </p>
                  {markSku && (
                    <p className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-0.5 text-2xs font-extrabold tabular-nums text-accent-300">
                      {markSku.price.toLocaleString()}점
                    </p>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {shopList.map((mk) => {
                    const own = ownedBy.get(mk.key);
                    const on = equippedMark === mk.key;
                    const price = markSku?.price ?? 0;
                    const poor = !own && balance !== null && balance.available < price;
                    return (
                      <div key={mk.key}
                        className={['card-sink rounded-card border p-2.5 text-center transition-colors',
                          on ? 'border-accent-300 bg-accent-300/[0.1]'
                            : own ? 'border-border-default bg-surface-high'
                              : 'border-border-subtle bg-surface-high'].join(' ')}>
                        <p className="text-2xl leading-none">{mk.emoji}</p>
                        <p className="mt-1 text-xs font-bold text-ink-primary">{mk.name}</p>
                        <p className="mt-0.5 text-2xs leading-tight text-ink-muted">{mk.desc}</p>
                        {/* 판매 중지된 기간권의 잔여분 — 산 것을 뺏지 않는다는 표시라 절대 지우지 않는다 */}
                        {own?.source === 'rent' && own.until && (
                          <p className="mt-1 text-2xs font-semibold text-accent-300">기간권 {remainDays(own.until)}</p>
                        )}
                        {own ? (
                          <button type="button" disabled={equipBusy !== null}
                            onClick={() => handleEquip(on ? null : mk.key)}
                            className={[SHOP_BTN, on ? SHOP_BTN_ON : SHOP_BTN_OFF].join(' ')}>
                            {equipPending(mk.key, on)
                              ? '적용 중…' : on ? '✓ 장착 중 · 해제' : own.source === 'own' ? '소장 중 · 장착' : '장착하기'}
                          </button>
                        ) : (
                          <button type="button" disabled={buying !== null || poor || !markSku}
                            onClick={() => handleBuyMark(mk)} title={markSku?.descr}
                            className={[SHOP_BTN, SHOP_BTN_OFF, 'tabular-nums'].join(' ')}>
                            {buying === mk.key ? '구매 중…'
                              : !markSku ? '판매 준비 중'
                                : poor ? `${price.toLocaleString()}점 부족` : `${price.toLocaleString()}점 소장`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 기간권 1일/7일/30일 — 판매 중지. 서버가 active=false 로 이미 빼 주지만
                    되살아나도 살 수 없게 화면에서도 비활성 상태로만 진열한다. */}
                {deadRentSkus.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-1.5" aria-hidden="false">
                    {deadRentSkus.map((s) => (
                      <div key={s.key}
                        className="rounded-card border border-border-subtle bg-surface-float px-2 py-2 text-center opacity-50">
                        <span className="block text-xs font-bold text-ink-secondary line-through">{s.label}</span>
                        <span className="mt-0.5 block text-2xs font-bold text-ink-muted">판매 중지</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">
                  기간권(1일·7일·30일)은 판매를 종료했습니다 — <b className="text-ink-secondary">이미 구매한 기간은 그대로 유지</b>되고,
                  끝나도 소장한 마크는 사라지지 않아요. 소장한 마크는 언제든 바꿔 달 수 있고,
                  무엇을 사도 <b className="text-ink-secondary">누적 점수·등급은 그대로</b>입니다.
                </p>
              </div>

              {/* ── 소유물형 ① 프로필 카드 프레임 (2026-08-30 · 20260830n) ────────
                  프로필 카드는 유저가 앱 **밖으로 내보내는** 산출물인데 디자인이 하나뿐이었다.
                  ⚠ 캔버스는 CSS 변수를 못 읽어 프레임 색은 hex 상수이고 카드는 **다크 고정**이다
                    (라이트 테마에서 저장해도 카드는 어둡게 나간다 — 공유 이미지는 보는 사람의 테마와
                     무관하게 같아야 하므로 그게 정답이다). 근거는 src/lib/profileCard.ts 헤더. */}
              {frameSku && (
                <div className="rounded-card border border-border-subtle bg-surface-high p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-bold text-ink-primary">
                      {frameSku.label} <span className="font-normal text-ink-muted">공유 카드 테두리 · 영구 소장</span>
                    </p>
                    <p className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-0.5 text-2xs font-extrabold tabular-nums text-accent-300">
                      {frameSku.price.toLocaleString()}점
                    </p>
                  </div>

                  {/* 미리보기 — 실제로 저장될 그림 그대로. 고른 프레임이 어떻게 굽히는지가 곧 가격의 근거다.
                      캔버스 픽셀은 640x880 고정이고 CSS 로만 줄여 그린다(공간이 미리 잡혀 있어 CLS 0). */}
                  {/* 레이아웃(오너 2026-09-04 "이미지가 왼쪽에 크게 있고 오른쪽에 공란이 너무 많아"):
                      220px 세로 카드 옆에 두 줄짜리 텍스트를 items-start 로 붙여 둬서 오른쪽 아래가
                      통째로 비었다. 캔버스 비율(160:220 = 640:880)은 정확하니 이미지가 아니라 **배치** 문제다.
                      ① 세로 중앙 정렬로 빈 아래를 없애고 ② 오른쪽에 '지금 장착' 실체를 하나 더 얹어
                      두 열의 무게를 맞춘다 ③ 좁은 폭에서는 아예 위아래로 쌓는다(옆에 두면 텍스트가 눌린다). */}
                  <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-center">
                    <canvas ref={setCardEl} width={640} height={880} aria-label="프로필 공유 카드 미리보기"
                            className="h-[15.4rem] w-[11.2rem] shrink-0 rounded-card border border-border-subtle" />
                    <div className="min-w-0 w-full flex-1 space-y-2">
                      <div className="rounded-input border border-border-subtle bg-surface-low px-2.5 py-2">
                        <p className="text-2xs text-ink-muted">지금 장착</p>
                        <p className="mt-0.5 truncate text-sm font-bold text-ink-primary">
                          {frameLabel(equippedFrame ?? DEFAULT_FRAME)}
                        </p>
                      </div>
                      <p className="text-2xs leading-relaxed text-ink-muted">
                        인스타·카톡에 올릴 수 있는 이미지로 저장합니다. 프레임을 사면 바로 적용되고,
                        소장한 프레임은 언제든 바꿔 달 수 있어요.
                      </p>
                      <button type="button" onClick={handleSaveCard}
                        className="btn-primary w-full py-2 text-xs">
                        <span className="inline-flex items-center gap-1"><Icon name="download" size={13} className="shrink-0" />카드 이미지 저장</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {frameList.map((c) => {
                      const own = cosmeticBy.get(c.key);
                      const on = own?.equipped === true;
                      const poor = !own && balance !== null && balance.available < frameSku.price;
                      return (
                        <div key={c.key}
                          className={['card-sink rounded-card border p-2.5 text-center transition-colors',
                            on ? 'border-accent-300 bg-accent-300/[0.1]'
                               : own ? 'border-border-default bg-surface-high'
                                     : 'border-border-subtle bg-surface-high'].join(' ')}>
                          <p className="text-xs font-bold text-ink-primary">{c.label}</p>
                          <p className="mt-0.5 text-2xs leading-tight text-ink-muted">{c.desc}</p>
                          {own ? (
                            <button type="button" disabled={equipBusy !== null}
                              onClick={() => handleEquipCosmetic(c, on)}
                              className={[SHOP_BTN, on ? SHOP_BTN_ON : SHOP_BTN_OFF].join(' ')}>
                              {equipPending(c.key, on) ? '적용 중…' : on ? '✓ 적용 중 · 해제' : '소장 중 · 적용'}
                            </button>
                          ) : (
                            <button type="button" disabled={buying !== null || poor}
                              onClick={() => handleBuyCosmetic(c)}
                              className={[SHOP_BTN, SHOP_BTN_OFF, 'tabular-nums'].join(' ')}>
                              {buying === c.key ? '구매 중…'
                                : poor ? `${frameSku.price.toLocaleString()}점 부족` : `${frameSku.price.toLocaleString()}점 소장`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── 소유물형 ② 닉네임 색 ───────────────────────────────────────
                  마크와 **결합 지점이 완전히 같다**(닉네임 앞 글리프 ↔ 닉네임 글자색) —
                  유통 경로가 이미 검증돼 있다. 마크는 이모지라 기기마다 다른 그림이 뜨지만
                  **색은 앱이 100% 통제**한다.
                  ⚠ 새 팔레트를 만들지 않는다: 라이트/다크 양쪽 4.5:1 을 이미 통과한 --tier-* 6종을
                    그대로 쓰고, '닉네임 색' 지점이 e2e/design-tokens.spec.ts 대비 계약에 들어가 있다. */}
              {nickSku && (
                <div className="rounded-card border border-border-subtle bg-surface-high p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-bold text-ink-primary">
                      {nickSku.label} <span className="font-normal text-ink-muted">글·댓글의 내 이름에 · 영구 소장</span>
                    </p>
                    <p className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-0.5 text-2xs font-extrabold tabular-nums text-accent-300">
                      {nickSku.price.toLocaleString()}점
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {nickList.map((c) => {
                      const own = cosmeticBy.get(c.key);
                      const on = own?.equipped === true;
                      const poor = !own && balance !== null && balance.available < nickSku.price;
                      const v = nickColorVar(c.token);
                      return (
                        <div key={c.key}
                          className={['card-sink rounded-card border p-2.5 text-center transition-colors',
                            on ? 'border-accent-300 bg-accent-300/[0.1]'
                               : own ? 'border-border-default bg-surface-high'
                                     : 'border-border-subtle bg-surface-high'].join(' ')}>
                          {/* 미리보기는 '내 닉네임을 그 색으로' 보여준다 — 색 동그라미보다 정확하다 */}
                          <p className="truncate text-sm font-extrabold"
                             style={v ? { color: tierCss(v) } : undefined}>
                            {markEmoji(equippedMark)}{markEmoji(equippedMark) ? ' ' : ''}{user.nickname ?? user.name ?? '닉네임'}
                          </p>
                          <p className="mt-0.5 text-2xs font-bold text-ink-primary">{c.label}</p>
                          {own ? (
                            <button type="button" disabled={equipBusy !== null}
                              onClick={() => handleEquipCosmetic(c, on)}
                              className={[SHOP_BTN, on ? SHOP_BTN_ON : SHOP_BTN_OFF].join(' ')}>
                              {equipPending(c.key, on) ? '적용 중…' : on ? '✓ 적용 중 · 해제' : '소장 중 · 적용'}
                            </button>
                          ) : (
                            <button type="button" disabled={buying !== null || poor}
                              onClick={() => handleBuyCosmetic(c)}
                              className={[SHOP_BTN, SHOP_BTN_OFF, 'tabular-nums'].join(' ')}>
                              {buying === c.key ? '구매 중…'
                                : poor ? `${nickSku.price.toLocaleString()}점 부족` : `${nickSku.price.toLocaleString()}점 소장`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── 소유물형 ③ 단골 시즌 뱃지 ──────────────────────────────────
                  시즌 단위라 만료가 '잃는 일'이 아니라 **'이번 시즌 것'**으로 읽힌다 —
                  기간권(1일/7일/30일)이 밟은 지뢰를 피하는 지점이다. 지난 시즌 뱃지도 그대로 남는다.
                  단골(팔로우)한 매장만 살 수 있다: 아무 매장이나 살 수 있으면 표시의 의미가 증발한다. */}
              {seasonSku && (
                <div className="rounded-card border border-border-subtle bg-surface-high p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-bold text-ink-primary">
                      {seasonSku.label} <span className="font-normal text-ink-muted">단골 매장의 이번 시즌</span>
                    </p>
                    <p className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-0.5 text-2xs font-extrabold tabular-nums text-accent-300">
                      {seasonSku.price.toLocaleString()}점
                    </p>
                  </div>
                  {(seasonOwned?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(seasonOwned ?? []).map((b) => (
                        <span key={b.seasonId}
                          className={['inline-flex items-center gap-1 rounded-badge border px-2 py-1 text-2xs font-bold',
                            b.ongoing ? 'border-accent-400/50 bg-accent-300/[0.10] text-accent-300'
                                      : 'border-border-subtle bg-surface-float text-ink-secondary'].join(' ')}>
                          <Icon name="medal" size={11} className="shrink-0" />
                          {b.venueName} · {b.seasonName}
                          {!b.ongoing && <span className="font-normal text-ink-muted">(지난 시즌)</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {seasonBuyable === null ? (
                    <div className="skeleton mt-2 h-9 rounded-input" aria-hidden />
                  ) : seasonBuyable.length === 0 ? (
                    <p className="mt-2 text-2xs leading-relaxed text-ink-muted">
                      지금 살 수 있는 시즌 뱃지가 없어요 — 매장을 <b className="text-ink-secondary">단골(팔로우)</b>로 담고,
                      그 매장이 시즌을 진행 중일 때 이 자리에 나타납니다.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {seasonBuyable.map((b) => {
                        const poor = balance !== null && balance.available < seasonSku.price;
                        return (
                          <li key={b.seasonId} className="flex items-center gap-2.5 rounded-input border border-border-subtle bg-surface-float px-3 py-2">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-bold text-ink-primary">{b.venueName}</span>
                              <span className="block text-2xs text-ink-muted">{b.seasonName} · {b.endsOn} 종료</span>
                            </span>
                            <button type="button" disabled={buying !== null || poor}
                              onClick={() => handleBuySeasonBadge(b)}
                              className="shrink-0 rounded-input border border-accent-400/40 px-2.5 py-1.5 text-2xs font-bold tabular-nums text-accent-300 transition-colors hover:bg-accent-300/10 disabled:opacity-50">
                              {buying === b.seasonId ? '구매 중…'
                                : poor ? `${seasonSku.price.toLocaleString()}점 부족` : `${seasonSku.price.toLocaleString()}점 받기`}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* ── 편의 ④ 닉네임 즉시 변경권 ─────────────────────────────────
                  파는 것은 기능이 아니라 **기다림 면제**다. 닉네임 변경 자체는 계속 무료이고,
                  쿨다운이 안 걸려 있으면 아예 팔지 않는다(아무것도 주지 않고 점수만 받는 일이 없게).
                  그래서 잠겨 있지 않을 때는 '지금 바로 바꿀 수 있다'고만 알린다. */}
              {nickChangeSku && (
                <div className="flex items-center gap-2.5 rounded-card border border-border-subtle bg-surface-high px-3 py-2.5">
                  <Icon name="edit" size={18} className="shrink-0 text-accent-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-ink-primary">{nickChangeSku.label}</span>
                    <span className="block text-2xs leading-tight text-ink-muted">
                      {nickLocked
                        ? <>지금은 <b className="text-ink-secondary">{nickFreeAt}</b>부터 바꿀 수 있어요. 기다리지 않고 바로 바꿉니다</>
                        : '지금은 기다리지 않고 바로 바꿀 수 있어요 · 변경은 원래 무료예요'}
                    </span>
                  </span>
                  {nickLocked ? (
                    <button type="button" disabled={nickResetBusy || (balance !== null && balance.available < nickChangeSku.price)}
                      onClick={handleBuyNickReset}
                      className="shrink-0 rounded-input border border-accent-400/40 px-2.5 py-1.5 text-2xs font-bold tabular-nums text-accent-300 transition-colors hover:bg-accent-300/10 disabled:opacity-50">
                      {nickResetBusy ? '적용 중…'
                        : balance !== null && balance.available < nickChangeSku.price
                          ? `${nickChangeSku.price.toLocaleString()}점 부족` : `${nickChangeSku.price.toLocaleString()}점`}
                    </button>
                  ) : (
                    <span className="shrink-0 rounded-badge bg-surface-float px-2 py-1 text-2xs font-bold text-ink-muted">필요 없음</span>
                  )}
                </div>
              )}

              {/* ── 소비형 ② 외치기 (오너 #8 · 2026-08-30 20초 슬롯 1회로 전환) ───── */}
              <button type="button" onClick={() => setShoutOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-card border border-accent-400/50 bg-gradient-to-r from-accent-300/[0.1] to-transparent px-3 py-2.5 text-left transition-colors hover:border-accent-300">
                <Icon name="megaphone" size={20} className="shrink-0 text-accent-300" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink-primary">외치기</span>
                  <span className="block text-2xs leading-tight text-ink-muted">
                    커뮤니티 맨 위에서 {SHOUT_SLOT_SECONDS}초 1회 방송 · 대기열 순서대로
                    {shoutTierHint(skus) && <> · {shoutTierHint(skus)}</>}
                  </span>
                </span>
                <span className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-1 text-2xs font-extrabold text-accent-300">{shoutCost.toLocaleString()}점~</span>
              </button>

              {/* ── 소비형 ③④ 응원 · 끌올 (2026-08-30 · 20260830m) ─────────────
                  여기서 **사지 않는다.** 둘 다 '어느 글/댓글에' 를 골라야 성립하는 상품이라
                  구매 버튼을 상점에 두면 대상 없는 결제가 된다. 상점은 가격 사다리를 보여 주는
                  자리이고(30 → 100 → 50/150 → 800), 실제 구매는 커뮤니티 글에서 일어난다.
                  가격은 서버 shop_skus 가 출처라 화면에 숫자를 박지 않는다. */}
              {(cheerSku || bumpSku) && (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {cheerSku && (
                    <div className="flex items-center gap-2.5 rounded-card border border-border-subtle bg-surface-high px-3 py-2.5">
                      <Icon name="chip-stack" size={18} className="shrink-0 text-accent-300" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-ink-primary">{cheerSku.label}</span>
                        <span className="block text-2xs leading-tight text-ink-muted">
                          커뮤니티 글·댓글에서 보냅니다 · 하루 {CHEER_DAILY_CAP}번까지
                        </span>
                      </span>
                      <span className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-1 text-2xs font-extrabold tabular-nums text-accent-300">
                        {cheerSku.price.toLocaleString()}점
                      </span>
                    </div>
                  )}
                  {bumpSku && (
                    <div className="flex items-center gap-2.5 rounded-card border border-border-subtle bg-surface-high px-3 py-2.5">
                      <Icon name="zap" size={18} className="shrink-0 text-accent-300" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-ink-primary">{bumpSku.label}</span>
                        <span className="block text-2xs leading-tight text-ink-muted">
                          내 글에서 누르면 {bumpSku.durationHours}시간 상단 · 동시 {BUMP_SLOTS}자리
                        </span>
                      </span>
                      <span className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-1 text-2xs font-extrabold tabular-nums text-accent-300">
                        {bumpSku.price.toLocaleString()}점
                      </span>
                    </div>
                  )}
                </div>
              )}
              <p className="text-2xs leading-relaxed text-ink-muted">
                응원은 <b className="text-ink-secondary">받는 사람에게 점수가 가지 않습니다</b> — 표시와 알림만 남고 점수는 소멸해요.
              </p>

              {/* ── 활동으로 얻는 것 — 여기 있는 16종은 **살 수 없다.** 점수로만 열린다.
                  위(점수로 사는 것)와 시각적으로 갈라 두지 않으면 '해금한 마크를 또 사야 하나'로 읽힌다. */}
              <div className="flex items-center gap-1.5 pt-2">
                <Icon name="medal" size={13} className="shrink-0 text-emerald-300" />
                <p className="shrink-0 text-2xs font-extrabold text-emerald-300">활동으로 얻는 것</p>
                <p className="shrink-0 text-2xs text-ink-muted">점수가 쌓이면 자동으로 열려요 · 구매 불가</p>
                <span className="h-px flex-1 bg-border-subtle" />
              </div>
              <p className="text-2xs font-bold text-ink-secondary">모으는 마크 <span className="font-normal text-ink-muted">점수에 도달하면 영구 해금(차감 없음)</span></p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {earnList.map((mk) => {
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
                          {equipPending(mk.key, on) ? '적용 중…' : on ? '✓ 장착 중 · 해제' : '장착하기'}
                        </button>
                      ) : (
                        <p className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-input bg-surface-float px-2 py-1.5 text-2xs font-bold text-ink-muted"><Icon name="lock" size={11} className="shrink-0" />{mk.need.toLocaleString()}점</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {equippedMark && (
                <p className="text-center text-2xs text-ink-muted">미리보기: <span className="font-bold text-ink-primary">{markEmoji(equippedMark)} {user.nickname ?? '닉네임'}</span></p>
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
              hint="지난달 입상 기록이 없습니다. 대회에 참가해 이번 달의 주인공이 되어보세요"
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
        ) : board === 'moneyin' ? (
          <CareerBoard myNick={user?.nickname ?? null} nickStyle={nickStyle} markPrefix={markPrefix} />
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
                  // 2·3위는 card-aura(아우라 v6 불투명 카드). ring-conic 은 background-image 라 card-elev 와 같은 요소 병용 금지(index.css 주석) — card-aura 는 무관.
                  // 1위 배경이 accent-300/[0.08]→surface-low 로 바뀌지만 합성색이 #1E1830 vs #1D192E 로
                  // 사실상 동일 — 이름(text-accent-300) 대비 3.718→3.711 로 실질 불변.
                  <div key={r.id} className={['rounded-aura border p-2.5 text-center', big ? 'ring-conic bg-surface-low' : 'card-aura'].join(' ')}>
                    <Icon name={idx === 1 ? 'crown' : 'medal'} size={big ? 22 : 17}
                      className={['mx-auto', PODIUM_TONE[idx]].join(' ')} role="img" aria-hidden={false} aria-label={`${idx === 1 ? 1 : idx === 0 ? 2 : 3}위`} />
                    <span className={['mx-auto mt-1 block rounded-full p-[2px]', big ? 'h-10 w-10' : 'h-8 w-8'].join(' ')}
                      style={{ background: `conic-gradient(from 210deg, ${tierCss(rt.vividVar)}, ${tierCss(rt.vividVar, 0.267)} 45%, ${tierCss(rt.vividVar, 0.8)} 70%, ${tierCss(rt.vividVar)})` }}>
                      <span className={['flex h-full w-full items-center justify-center rounded-full font-bold', onColorInkClass(r.avatarColor ?? '#5A6175'), big ? 'text-sm' : 'text-2xs'].join(' ')}
                        style={{ background: r.avatarColor ?? '#5A6175' }}>
                        {r.nickname[0]}
                      </span>
                    </span>
                    <p className={['mt-1 truncate font-bold', big ? 'text-sm text-accent-300' : 'text-xs text-ink-primary'].join(' ')} style={nickStyle(r)}>{markPrefix(r)}{r.nickname}</p>
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
                      <span className={['flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-extrabold', onColorInkClass(r.avatarColor ?? '#5A6175')].join(' ')}
                        style={{ background: r.avatarColor ?? '#5A6175' }}>
                        {r.nickname[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-accent-300">{i + 1}위 · {r.nickname} <span className="font-semibold text-ink-muted">(나)</span></p>
                        <p className="text-2xl font-extrabold leading-tight tabular-nums" style={{ color: tierCss(rowAce ? ACE_VAR : t.colorVar) }}>
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
                    className={['w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-2xs font-bold', onColorInkClass(r.avatarColor ?? '#5A6175')].join(' ')}
                    style={{ background: r.avatarColor ?? '#5A6175' }}
                  >
                    {r.nickname[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink-primary truncate" style={nickStyle(r)}>{markPrefix(r)}{r.nickname}</span>
                      {isMe && <span className="text-2xs font-bold text-accent-300">나</span>}
                    </div>
                  </div>
                  <TierBadge points={r.activityPoints} size={16} overallRank={i + 1} />
                  <span className="w-14 text-right text-xs font-bold tabular-nums" style={{ color: tierCss(rowAce ? ACE_VAR : t.colorVar) }}>
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
        </div>
      </section>
    </div>
  );
}
