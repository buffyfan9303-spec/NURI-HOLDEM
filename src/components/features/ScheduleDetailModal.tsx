import { useRef, useState, useEffect, useMemo } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import ImageLightbox from '../atoms/ImageLightbox';
import CommentThread from './CommentThread';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import StatefulActionButton from '../atoms/StatefulActionButton';
import HoldToConfirmButton from '../atoms/HoldToConfirmButton';
import { getMyReservation, createReservation, cancelMyReservation, getOwnerReservations, type Reservation, type OwnerReservation } from '../../api/reservations';
import { prizeMainText } from './ScheduleCard';
import type { Schedule } from '../../api/schedules';
import { scheduleStatus } from '../../lib/scheduleStatus';
import { matchClockSchedule, msToRegClose, type RegInfo } from '../../lib/regStatus';
import type { Comment } from '../../api/community';
import {
  generateBlinds, getVenueClocks, subscribeClock, effectiveLevel,
  type ClockState, type ClockLevel,
} from '../../api/clock';
import { promptLogin, openPostForm, ensureVerified } from '../../lib/requireLogin';
import { googleCalendarUrl, icsDataUrl, isIOS } from '../../lib/calendar';
import { enablePush, pushSupported } from '../../api/push';
import QRCode from 'qrcode';
import { requestBuyin, buyinRequestUrl, kstToday } from '../../api/ledger';
import SlidingPill from '../atoms/SlidingPill';
import { goSubTab } from '../../lib/subTabTransition';

interface ScheduleDetailModalProps {
  schedule: Schedule | null;
  open: boolean;
  onClose: () => void;
  onVenueClick: (venueId: string) => void;
  /** 매장 별점 집계(방문 후기) — 매장명 옆 ⭐ 표시 */
  rating?: { avg: number; count: number };
  comments: Comment[];
  onSubmitComment: (content: string, parentId?: string) => void;
  onDeleteComment?: (commentId: string) => void;
  /** 관리자 마스터 삭제(포스터) */
  onDeletePoster?: (id: string) => void;
  /** 데스크탑 2-pane 우측 패널로 인라인 렌더 */
  inline?: boolean;
  /** UX-1: 라이브 클락 실측 레지 상태 — '매장에 확인해 주세요'를 실제 답으로 교체 */
  regInfo?: RegInfo;
}

// APIS 상세 문법(오너 지목 벤치마크) — [메인][블라인드][프라이즈][매장정보] + 기존 Q&A.
// Q&A 를 4탭 안에 우겨넣지 않고 5번째 칸으로 남긴 이유: 안읽음 배지('새 N')가 붙는 유일한 탭이라
// 다른 탭 밑에 묻으면 '새 질문이 왔다'를 알 길이 사라진다(기능 손실). 나머지 4탭은 스크린샷과 동일.
type Tab = 'main' | 'blinds' | 'prize' | 'venue' | 'qna';
/** 5탭 진열 순서 — 하위 탭 전환 방향(forward/back) 기준. TABS 나열 그대로. */
const TAB_ORDER: Tab[] = ['main', 'blinds', 'prize', 'venue', 'qna'];
const TABS: { key: Tab; label: string }[] = [
  { key: 'main',   label: '메인' },
  { key: 'blinds', label: '블라인드' },
  { key: 'prize',  label: '프라이즈' },
  { key: 'venue',  label: '매장정보' },
  { key: 'qna',    label: 'Q&A' },
];

const SUITS = ['♠','♥','♦','♣'];
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

// 라이브 패널 액센트 텍스트 — 다크는 accent-200(8.19:1), 라이트는 accent-300(6.37:1).
// accent-300 단독은 다크 surface-low 위에서 3.67:1 이라 소형 텍스트 기준(4.5)을 못 넘는다.
const ACCENT_INK = 'text-accent-300 dark:text-accent-200';
// 진행 신호 — 라이트는 emerald-700(5.39:1, 토큰 주석의 '라이트 텍스트 전용' 단), 다크는 emerald-400(8.03:1).
const LIVE_INK = 'text-emerald-700 dark:text-emerald-400';
// 임박 신호 — 라이트 danger-deep(6.20:1) / 다크 danger-light(7.64:1)
const URGENT_INK = 'text-danger-deep dark:text-danger-light';

/** levels 배열 인덱스 → '몇 번째 레벨'(브레이크 제외) */
function levelNoAt(levels: ClockLevel[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index && i < levels.length; i++) if (levels[i].kind === 'level') n++;
  return n;
}
/** 남은 ms → '23분' / '1시간 5분' (라이브 탭 regMinLabel 과 같은 표기 규칙) */
function minLabel(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60 > 0 ? `${min % 60}분` : ''}`.trim() : `${min}분`;
}
const blindText = (l?: ClockLevel): string =>
  l ? `${l.sb.toLocaleString()}/${l.bb.toLocaleString()}${l.ante > 0 ? ` (${l.ante.toLocaleString()})` : ''}` : '—';

export default function ScheduleDetailModal({
  schedule: scheduleProp, open, onClose, onVenueClick, rating, comments, onSubmitComment, onDeleteComment, onDeletePoster, inline, regInfo,
}: ScheduleDetailModalProps) {
  const [tab, setTab] = useState<Tab>('main');
  const [lightbox, setLightbox] = useState(false);
  const { user } = useAuth();
  // 다른 대회를 열면 항상 [메인]부터 — 이전 대회에서 보던 탭이 남아 있으면 '내가 뭘 보고 있는지'가 어긋난다
  useEffect(() => { if (scheduleProp?.id) setTab('main'); }, [scheduleProp?.id]);

  // 닫힘 애니메이션이 끝날 때까지 직전 일정을 유지(시트가 아래로 슬라이드되며 닫히도록)
  const [shown, setShown] = useState<Schedule | null>(scheduleProp);
  useEffect(() => { if (scheduleProp) setShown(scheduleProp); }, [scheduleProp]);
  const schedule = scheduleProp ?? shown;
  // 열린 시각 — 고스트 클릭(탭 직후 합성 click) 판정 기준(포스터 확대 400ms 가드)
  const openedAtRef = useRef(0);
  useEffect(() => { if (open) openedAtRef.current = performance.now(); }, [open, scheduleProp?.id]);

  if (!schedule) return null;

  const d = new Date(schedule.date);
  const dow = DAYS_KO[d.getDay()];
  const qnaComments = comments.filter((c) => c.scheduleId === schedule.id);
  // 끝난 대회에 '예약하기'가 살아 있으면 손님은 참가된 줄 알고 업주 명단엔 유령 예약이 남는다
  const status = scheduleStatus(schedule.date, schedule.startTime);
  // 현장 바인 요청은 서버가 무조건 'KST 오늘' 장부에 넣는다(request_buyin). 그래서 대회 당일이 아닌
  // 포스터에서 요청 UI 를 띄우면 2주 뒤 대회를 보던 손님의 요청이 오늘 장부에 조용히 섞인다 — 날짜로 잠근다.
  const kToday = kstToday();
  const eventDate = schedule.date.slice(0, 10); // date 컬럼이지만 방어적으로 앞 10자만 비교
  const isEventToday = eventDate === kToday;
  const isPastEvent = eventDate < kToday;       // ISO(YYYY-MM-DD) 라 사전순 비교 = 날짜 비교
  // 라이브 클락 패널을 띄울 조건. regInfo 는 App 이 '진행 중 클락 ↔ 이 포스터' 매칭에 성공했을 때만
  // 내려온다 — 즉 클락이 실재한다는 증거다. 이걸 전제로 삼아야 (a) 포스터를 열 때마다 clock 조회를
  // 날리지 않고 (b) 패널을 첫 페인트부터 그려 '요약 → 패널' 교체 CLS 가 아예 생기지 않는다.
  const liveShown = !!regInfo && !!schedule.venueId && status !== 'ended';

  return (
    <Modal open={open} onClose={onClose} maxWidth="6xl" variant="page" inline={inline}>
      {/* 닫기(모바일) — 한 화면이라 우상단 고정이 편함. PC는 아래 sticky 탭바에 통합 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="lg:hidden fixed top-[calc(0.75rem+env(safe-area-inset-top))] right-3 z-[60] w-9 h-9 flex items-center justify-center rounded-full bg-surface-base/80 backdrop-blur text-ink-primary hover:bg-surface-high transition-colors"
      >
        <Icon name="close" size={15} />
      </button>

      {/* PC: 포스터(좌, 고정) + 정보(우, 스크롤) 2열 / 모바일: 세로 스택 */}
      <div className="lg:grid lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:items-start">
        {/* ── 포스터 ───────────────────────────────────────────────── */}
        <div className="relative lg:sticky lg:top-0 lg:self-start lg:flex lg:h-screen lg:items-center lg:justify-center lg:border-r lg:border-border-subtle lg:bg-surface-base">
          <div
            className={[
              'relative flex w-full items-center justify-center overflow-hidden',
              schedule.posterUrl ? 'bg-surface-base' : 'aspect-[16/9] sm:aspect-[2/1]',
            ].join(' ')}
            // [DS] MO-8B: 카드 포스터(같은 이름)에서 이 자리로 모핑 — 모달은 열려 있는 동안만
            // 존재하므로 이름 중복(전환 취소) 걱정이 없다. 카드 쪽 이름은 App 이 조건부 관리.
            style={{
              viewTransitionName: 'vt-poster',
              ...(schedule.posterUrl
                ? {}
                : { background: `linear-gradient(135deg, ${schedule.posterColor ?? '#1a1d24'}ee 0%, #0a0c0f 100%)` }),
            }}
          >
            {schedule.posterUrl ? (
              <button
                type="button"
                onClick={() => {
                  // 고스트 클릭 가드 — 카드 탭의 합성 click 이 방금 마운트된 포스터에 꽂혀
                  // 라이트박스가 멋대로 열리는 것 방지(View Transition 동기 커밋 도입 후 재현).
                  if (performance.now() - openedAtRef.current < 400) return;
                  setLightbox(true);
                }}
                aria-label="포스터 확대 보기"
                className="block w-full cursor-zoom-in"
              >
                <img
                  src={schedule.posterUrl}
                  alt={`${schedule.title} 포스터`}
                  decoding="async"
                  // 로드 전 높이 예약 — 이미지가 뜨는 순간 아래 제목/배지가 통째로 밀리는 점프(CLS) 방지.
                  // 포스터는 세로형(1200x1600)이라 로드 후 실제 높이가 이 최소값을 항상 넘어 시각 영향 없음.
                  style={{ minHeight: 'min(40vh, 320px)' }}
                  className="block h-auto w-full max-h-[65vh] object-contain lg:max-h-screen"
                />
              </button>
            ) : (
              <>
                <div className="absolute inset-0 grid grid-cols-6 gap-2 p-3 opacity-[0.08] select-none pointer-events-none" aria-hidden>
                  {Array.from({ length: 24 }, (_, i) => (
                    <span key={i} className="text-2xl text-white text-center">{SUITS[i % 4]}</span>
                  ))}
                </div>
                <span className="relative text-6xl opacity-30 select-none" aria-hidden>♠</span>
              </>
            )}

            {/* 상단 그라데이션 */}
            <div className="absolute top-0 left-0 right-0 h-20 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, rgba(10,12,15,0.7), transparent)' }}
            />

            {/* 상단 배지 */}
            <div className="absolute top-3 left-3 flex items-center gap-1 z-10">
              {status !== 'upcoming' && (
                <span className={[
                  'rounded-badge px-2 py-0.5 text-xs font-bold leading-none',
                  status === 'ended' || (regInfo && regInfo.msLeft === 0) ? 'bg-black/70 text-white/85'
                    : regInfo && regInfo.msLeft !== null ? 'bg-emerald-600 text-white'
                    : 'bg-danger text-white',
                ].join(' ')}>
                  {status === 'ended' ? '종료'
                    : regInfo && regInfo.msLeft === 0 ? '진행 중 · 레지 마감'
                    : regInfo && regInfo.msLeft !== null ? '진행 중 · 등록 가능'
                    : '진행 중'}
                </span>
              )}
              {schedule.isPremium && (
                <span className="rounded-badge bg-accent-300 px-2 py-0.5 text-xs font-bold text-white leading-none">
                  TOP
                </span>
              )}
              <span className={[
                'rounded-badge border px-2 py-0.5 text-xs font-bold tracking-wider leading-none',
                schedule.format === 'MTT'    && 'bg-blue-500/30 text-blue-300 border-blue-400',
                schedule.format === 'SNG'    && 'bg-purple-500/30 text-purple-300 border-purple-400',
                schedule.format === 'PKO'    && 'bg-teal-500/30 text-teal-300 border-teal-400',
                schedule.format === 'Bounty' && 'bg-amber-500/30 text-amber-300 border-amber-400',
                schedule.format === 'Mix'    && 'bg-pink-500/30 text-pink-300 border-pink-400',
              ].filter(Boolean).join(' ')}>
                {schedule.format}
              </span>
              {schedule.guaranteed && (
                <span className="rounded-badge bg-emerald-500/30 text-emerald-300 border border-emerald-400 px-2 py-0.5 text-xs font-bold tracking-wider leading-none">
                  GTD
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── 정보 (우측, 스크롤) ──────────────────────────────────── */}
        <div className="flex min-w-0 flex-col">
          {/* 제목 영역 */}
          <div className="px-3.5 pt-3.5 pb-2">
            <h1 className={[
              'text-xl font-bold leading-tight',
              schedule.isPremium ? 'text-accent-300' : 'text-ink-primary',
            ].join(' ')}>
              {schedule.title}
            </h1>
            {onDeletePoster && user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => { if (confirm('이 포스터를 삭제하시겠습니까? 되돌릴 수 없습니다.')) onDeletePoster(schedule.id); }}
                className="mt-1 mb-1 text-2xs font-semibold px-2 py-1 rounded-badge border bg-danger/15 text-danger-light border-danger/30 hover:bg-danger/25 transition-colors"
              >
                운영자 삭제
              </button>
            )}
            {schedule.venueId ? (
              <button
                type="button"
                onClick={() => onVenueClick(schedule.venueId!)}
                className="mt-1.5 inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-accent-300 transition-colors group"
              >
                <span className="font-medium underline decoration-dotted underline-offset-2">
                  {schedule.pubName}
                </span>
                <span className="text-ink-muted">·</span>
                <span>{schedule.region}</span>
                {/* APIS 헤더 문법: 매장명 · 지역 · 유형 — 포스터 배지와 중복이지만 포스터를 지나쳐도 유형이 남는다 */}
                <span className="text-ink-muted">·</span>
                <span className="font-semibold tracking-wider">{schedule.format}</span>
                {rating && rating.count > 0 && (
                  <span className={`inline-flex shrink-0 items-center gap-0.5 font-bold tabular-nums ${ACCENT_INK}`} title={`방문 후기 ${rating.count}건 평균`}>
                    <Icon name="star-fill" size={12} className="shrink-0 text-gold-300" />{rating.avg.toFixed(1)}<span className="font-normal text-ink-muted">({rating.count})</span>
                  </span>
                )}
                <svg
                  width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6"
                  className="opacity-50 group-hover:opacity-100 transition-opacity ml-1"
                  aria-hidden
                >
                  <path d="M2 9 L9 2 M3.5 2 L9 2 L9 7.5" strokeLinecap="round" />
                </svg>
              </button>
            ) : (
              <p className="mt-1.5 inline-flex items-center gap-1 text-sm text-ink-secondary">
                <span className="font-medium">{schedule.pubName}</span>
                <span className="text-ink-muted">·</span>
                <span>{schedule.region}</span>
                <span className="text-ink-muted">·</span>
                <span className="font-semibold tracking-wider">{schedule.format}</span>
                {rating && rating.count > 0 && (
                  <span className={`inline-flex shrink-0 items-center gap-0.5 font-bold tabular-nums ${ACCENT_INK}`} title={`방문 후기 ${rating.count}건 평균`}>
                    <Icon name="star-fill" size={12} className="shrink-0 text-gold-300" />{rating.avg.toFixed(1)}<span className="font-normal text-ink-muted">({rating.count})</span>
                  </span>
                )}
              </p>
            )}
            {schedule.address && (
              <a href={`https://map.kakao.com/link/search/${encodeURIComponent(schedule.address)}`}
                target="_blank" rel="noopener noreferrer"
                className="mt-0.5 ml-5 flex items-center gap-1.5 text-xs text-ink-muted underline decoration-border-strong underline-offset-2 hover:text-accent-300">
                <Icon name="map" size={13} className="shrink-0" />{schedule.address}
              </a>
            )}
          </div>

      {/* ── 탭바 (메인 / 블라인드 / 프라이즈 / 매장정보 / Q&A) — sticky 상단 고정. PC는 우측에 닫기 통합 ──
          활성 표시는 밑줄(SlidingPill underline) — UnderlineTabs 와 동일 문법을 인라인으로 쓴다.
          왜 공용 UnderlineTabs 를 안 쓰나: label 이 string 이라 Q&A 의 개수·안읽음 배지를 붙일 수 없다. */}
      <div data-sched-tabbar="" role="tablist" className="relative grid grid-cols-5 border-b border-border-subtle sticky top-0 bg-surface-base z-10 lg:pr-[4.25rem]">
        <SlidingPill activeKey={tab} underline className="rounded-full bg-accent-300" />
        {/* PC 닫기 — 정보 영역 우상단(항상 보이는 sticky 탭바, 손 닿는 위치) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-border-default bg-surface-high/90 px-2.5 py-1.5 text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors"
        >
          <Icon name="close" size={14} />
          <span className="text-xs font-bold">닫기</span>
        </button>
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              data-pill-active={active || undefined}
              onClick={() => goSubTab('sched-tab', TAB_ORDER, tab, key, () => setTab(key))}
              className={[
                // §T1 탭 굵기 규격: 비활성 600 / 활성 700.
                // ⚠ font-semibold 와 font-bold 를 함께 주면 안 된다 — Tailwind 출력 순서상 semibold 가 뒤라 이긴다.
                'relative min-w-0 px-0.5 py-3 text-center text-xs transition-colors sm:text-sm',
                active ? 'font-bold' : 'font-semibold',
                // 활성 탭 라벨은 accent-300 단독이면 다크 surface-base 위 4.0:1 로 소형 텍스트 기준 미달 —
                // 다크에서만 accent-200 으로 올린다(8.8:1). 밑줄 색은 그대로 accent-300.
                active ? ACCENT_INK : 'text-ink-muted hover:text-ink-secondary',
              ].join(' ')}
            >
              <span className="block truncate">
                {label}
                {key === 'qna' && qnaComments.length > 0 && (
                  <span className="ml-0.5 text-2xs font-normal text-ink-muted tabular-nums">({qnaComments.length})</span>
                )}
              </span>
              {/* 안읽음은 5칸 폭에 '새 N' 텍스트가 안 들어가 점으로 압축 — 개수는 aria/title 로 보존 */}
              {key === 'qna' && schedule.unreadQnaCount > 0 && (
                <span aria-label={`새 질문 ${schedule.unreadQnaCount}개`} title={`새 질문 ${schedule.unreadQnaCount}개`}
                  className="absolute right-1.5 top-2 h-1.5 w-1.5 rounded-full bg-danger" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── 본문 — 탭 5개가 같은 패딩 컨테이너를 공유(탭 전환에 좌우 여백이 흔들리지 않게) ── */}
      <div data-sched-panel="" className="px-3.5 pt-3 pb-5 space-y-3">

      {/* ══════ 메인 — 지금 상태 · 참가 행동 · 게임 정보 ══════════════════════ */}
      {tab === 'main' && (<>

        {/* 라이브 클락 3열 패널(APIS 상단) — regInfo 가 있다 = 이 대회에 매칭된 클락이 실제로
            돌고 있다는 App 의 실측 증거다. 그래서 여기서만 클락을 읽는다(포스터 열 때마다 조회 X).
            라이브가 아니면 기존 핵심 요약 그리드를 그대로 유지한다. */}
        {liveShown ? (
          <LiveClockPanel schedule={schedule} regInfo={regInfo} onSeePrize={() => goSubTab('sched-tab', TAB_ORDER, tab, 'prize', () => setTab('prize'))} />
        ) : (
        <section className="overflow-hidden rounded-card border border-border-subtle bg-surface-high">
          {/* ── 핵심 요약 그리드(APIS '오늘 예정' 문법) — 바이인·프라이즈·시작·레지마감·스타팅칩·
              리엔트리를 2열 고정 행높이로 '한 화면 요약'. §28: 바이인·GTD·프라이즈풀은
              상품 가격 정보라 표시를 유지한다. */}
          <div className="grid grid-cols-2 [&>div]:border-border-subtle [&>div:nth-child(even)]:border-l [&>div:nth-child(n+3)]:border-t">
            {/* 바이인 미입력(0)은 가격 정보가 아니다 — 카드·표와 같은 '—' 문법(§28은 실제 금액에만 적용) */}
            <SummaryCell label="바이인" value={schedule.buyIn.amount > 0 ? schedule.buyIn.amount.toLocaleString() : '—'} />
            <SummaryCell
              label={schedule.guaranteed ? '상금 풀' : '프라이즈'}
              value={prizeMainText(schedule)}
              accent
              badge={(schedule.prizePool || schedule.prizePercent) ? (
                <span className={[
                  'shrink-0 rounded-badge border px-1.5 py-0.5 text-2xs font-bold leading-none tracking-wider',
                  schedule.guaranteed
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-surface-base text-ink-muted border-border-default',
                ].join(' ')}>
                  {schedule.guaranteed ? 'GTD' : '엔트리'}
                </span>
              ) : undefined}
            />
            <SummaryCell label="시작" value={`${d.getMonth() + 1}/${d.getDate()} (${dow}) ${schedule.startTime}`} />
            <SummaryCell label="레지 마감" value={schedule.regCloseTime ? schedule.regCloseTime : '현장 안내'} />
            <SummaryCell label="스타팅 칩" value={schedule.structure?.startingChips != null ? schedule.structure.startingChips.toLocaleString() : '현장 안내'} />
            <SummaryCell label="리엔트리" value={rebuyText(schedule)} />
          </div>
          {schedule.guaranteed && (
            <p className="border-t border-border-subtle px-3 py-1.5 text-2xs text-ink-muted">
              ※ 보장 상금: 참가 인원에 관계없이 위 금액 이상이 지급됩니다
            </p>
          )}
        </section>
        )}

        {/* 참가 예약 — 기본 접힘(한 줄 요약 + '더보기'), CTA 는 접힘 행 우측에 유지 */}
        {/* status 를 계산해 넘기지 않고 date/startTime 을 넘긴다 — 모달을 열어둔 채 종료 시각을
            넘길 수 있어, 클릭 시점에 다시 판정해야 하기 때문 */}
        <ReserveBox scheduleId={schedule.id} ownerId={schedule.ownerId} venueId={schedule.venueId}
          date={schedule.date} startTime={schedule.startTime} sched={schedule} regInfo={regInfo} />

        {/* 현장 바인(참가) 요청 — 대회 당일에만 연다. 요청이 '오늘' 장부로 들어가기 때문(위 kToday 주석)
            지난 대회에선 안내조차 띄우지 않는다 — 할 수 있는 게 없어 소음일 뿐이라. */}
        {schedule.venueId && isEventToday && <BuyinRequestBox venueId={schedule.venueId} eventDate={eventDate} />}
        {schedule.venueId && !isEventToday && !isPastEvent && (
          <p className="rounded-card border border-border-subtle bg-surface-high px-3 py-2 text-2xs leading-relaxed text-ink-muted">
            <Icon name="hand" size={12} className="mr-0.5 inline-block align-[-1px] shrink-0" /><b className="text-ink-secondary">현장 참가 신청</b>은 대회 <b className="text-ink-secondary">당일</b>에 이 화면에서 열립니다. 지금은 위 <b className="text-ink-secondary">참가 예약</b>으로 자리를 잡아두세요.
          </p>
        )}

        {/* 캘린더 등록 · 공유 — 참가 결심 직후 동선 */}
        <CalendarShareRow schedule={schedule} />

        {/* ── 게임 정보 (APIS 하단 2열 정의 리스트) — 게임명·날짜·시작 시간·유형·바이인·
            스타팅 칩·리바이 칩·블라인드 타임. 값이 없는 선택 항목은 행 자체를 생략하고,
            원래 폴백 문구('현장 안내'·'미정'·'메인 토너먼트')를 갖고 있던 행은 그 문구가 곧 답이라 유지한다.
            긴 값은 줄바꿈 대신 가로 마퀴 루프(MarqueeText)로 옆으로 흐른다(기존 문법 유지). */}
        <section>
          <h3 className="text-sm font-bold text-ink-primary mb-1">게임 정보</h3>
          <dl className="divide-y divide-border-subtle border-y border-border-subtle">
            <InfoRow label="게임명" value={schedule.title} />
            <InfoRow label="날짜" value={`${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${dow})`} />
            {schedule.startTime && <InfoRow label="시작 시간" value={schedule.startTime} />}
            <InfoRow label="유형" value={`${schedule.format} · ${schedule.guaranteed ? 'GTD 보장' : '예상 상금'}`} />
            <InfoRow label="바이인" value={buyinDetailText(schedule)} />
            <InfoRow label="리엔트리" value={rebuyText(schedule)} />
            {schedule.structure?.startingChips != null && <InfoRow label="스타팅 칩" value={schedule.structure.startingChips.toLocaleString()} />}
            {schedule.structure?.rebuyStack != null && <InfoRow label="리바이 칩" value={schedule.structure.rebuyStack.toLocaleString()} />}
            {schedule.structure?.blindLevelMinutes != null && <InfoRow label="블라인드 타임" value={`${schedule.structure.blindLevelMinutes}분`} />}
            <InfoRow label="레지 마감" value={schedule.regCloseTime ? `${schedule.regCloseTime} · 레이트 레지 마감` : '현장 안내'} />
            {schedule.structure?.lateRegLevels !== undefined && <InfoRow label="레이트 레지" value={`${schedule.structure.lateRegLevels}레벨`} />}
            <InfoRow label="듀레이션" value={schedule.duration || '미정'} />
            <InfoRow
              label="이벤트"
              value={schedule.sideEvents && schedule.sideEvents.length > 0
                ? `사이드 ${schedule.sideEvents.length}개 · ${schedule.sideEvents.map((se) => se.name).join(', ')}`
                : '메인 토너먼트'}
            />
          </dl>
        </section>

        {/* 프로모션 */}
        {schedule.promotions && schedule.promotions.length > 0 && (
          <section>
            <h3 className="text-sm font-bold text-ink-primary mb-1.5">프로모션 / 얼리칩</h3>
            <ul className="space-y-1.5">
              {/* 긴 detail(예: 사전예약 얼리칩 조건)이 shrink-0 한 줄 강제로 행 밖으로 삐져나가던
                  오버플로 수정 — 배지·제목 한 줄 + 설명은 아래 전체 폭 줄바꿈 스택으로. */}
              {schedule.promotions.map((p, i) => (
                <li
                  key={i}
                  className="px-3 py-2 rounded-input border border-accent-400/30 bg-accent-300/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    {p.badge && (
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-badge bg-accent-300 text-white text-2xs font-bold leading-none">
                        {p.badge}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 whitespace-normal break-keep [overflow-wrap:anywhere] text-sm text-ink-primary font-semibold">{p.title}</span>
                  </div>
                  {p.detail && (
                    <p className="mt-1 min-w-0 whitespace-normal break-keep [overflow-wrap:anywhere] text-2xs leading-relaxed text-ink-muted">{p.detail}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 사이드 이벤트 */}
        {schedule.sideEvents && schedule.sideEvents.length > 0 && (
          <section>
            <h3 className="text-sm font-bold text-ink-primary mb-1.5">사이드 이벤트</h3>
            <div className="grid grid-cols-2 gap-2">
              {schedule.sideEvents.map((se, i) => (
                <div key={i} className="rounded-input bg-surface-high border border-border-subtle px-2.5 py-2">
                  <p className="text-2xs text-ink-muted mb-0.5">{se.startBefore}</p>
                  <p className="text-sm font-bold text-ink-primary">{se.name}</p>
                  {se.note && <p className="text-2xs text-ink-muted mt-0.5">{se.note}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 규정 — 대회 운영 규칙이라 매장 탭이 아니라 메인에 둔다 */}
        {schedule.rules && schedule.rules.length > 0 && (
          <section className="reveal">
            <h3 className="text-sm font-bold text-ink-primary mb-1.5">운영 규정</h3>
            <ul className="space-y-1 text-xs text-ink-secondary">
              {schedule.rules.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-ink-muted shrink-0 mt-0.5">·</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 상세 설명 */}
        {schedule.description && (
          <section className="reveal">
            <h3 className="text-sm font-bold text-ink-primary mb-1.5">상세 설명</h3>
            <p className="text-xs text-ink-secondary leading-relaxed whitespace-pre-wrap">
              {schedule.description}
            </p>
          </section>
        )}
      </>)}

      {/* ══════ 블라인드 — 직접 입력 텍스트 + 레벨 구조 표 ═════════════════════ */}
      {tab === 'blinds' && (<>
        {/* 블라인드 (선택) — 직접 입력 텍스트 */}
        {schedule.blinds && (
          <section>
            <h3 className="text-sm font-bold text-ink-primary mb-1.5">블라인드</h3>
            <p className="text-xs text-ink-secondary leading-relaxed whitespace-pre-wrap rounded-input bg-surface-high border border-border-subtle px-3 py-2">
              {schedule.blinds}
            </p>
          </section>
        )}
        {/* 블라인드 구조 — 전용 탭에서는 접지 않는다(탭 자체가 이미 '펼침'이라 한 번 더 누르게 하면 계단이 하나 는다) */}
        <BlindStructure schedule={schedule} alwaysOpen />
      </>)}

      {/* ══════ 프라이즈 — 상금 요약 + 순위별 상금표 ═══════════════════════════ */}
      {tab === 'prize' && (<>
        {/* §28: 상금 풀·GTD·바이인은 상품 가격 정보라 표시를 유지한다 */}
        <section className="overflow-hidden rounded-card border border-border-subtle bg-surface-high">
          <div className="grid grid-cols-2 [&>div]:border-border-subtle [&>div:nth-child(even)]:border-l">
            <SummaryCell
              label={schedule.guaranteed ? '상금 풀' : '프라이즈'}
              value={prizeMainText(schedule)}
              accent
              badge={(schedule.prizePool || schedule.prizePercent) ? (
                <span className={[
                  'shrink-0 rounded-badge border px-1.5 py-0.5 text-2xs font-bold leading-none tracking-wider',
                  schedule.guaranteed
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-surface-base text-ink-muted border-border-default',
                ].join(' ')}>
                  {schedule.guaranteed ? 'GTD' : '엔트리'}
                </span>
              ) : undefined}
            />
            <SummaryCell label="바이인" value={schedule.buyIn.amount > 0 ? schedule.buyIn.amount.toLocaleString() : '—'} />
          </div>
          {schedule.guaranteed && (
            <p className="border-t border-border-subtle px-3 py-1.5 text-2xs text-ink-muted">
              ※ 보장 상금: 참가 인원에 관계없이 위 금액 이상이 지급됩니다
            </p>
          )}
        </section>

        {/* ── 순위별 상금 — APIS 문법: 상금이 핵심 정보라 접지 않고 상시 노출 ── */}
        {schedule.rankingPrizes && schedule.rankingPrizes.length > 0 ? (
          <section>
            <h3 className="text-sm font-bold text-ink-primary mb-1.5">순위별 상금</h3>
            <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-high">
              <table className="w-full text-xs">
                <tbody>
                  {schedule.rankingPrizes.map((rp, i) => {
                    const isTop3 = ['1st', '2nd', '3rd'].includes(rp.rank);
                    return (
                      <tr key={i} className="border-b border-border-subtle last:border-b-0">
                        <td className={[
                          'px-3 py-1 w-20',
                          isTop3 ? `${ACCENT_INK} font-bold` : 'text-ink-secondary',
                        ].join(' ')}>
                          {rp.rank}
                        </td>
                        <td className={[
                          'px-3 py-1 text-right tabular-nums',
                          isTop3 ? `${ACCENT_INK} font-extrabold text-sm` : 'text-ink-primary font-semibold',
                        ].join(' ')}>
                          {rp.amount.toLocaleString()}{rp.unit ?? ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <p className="rounded-card border border-border-subtle bg-surface-high px-3 py-3 text-2xs leading-relaxed text-ink-muted">
            순위별 상금표가 아직 등록되지 않았습니다 — 배분은 매장 현장 안내를 따릅니다.
          </p>
        )}
      </>)}

      {/* ══════ 매장정보 — 매장 · 위치 · 파트너 · 결제 수단 ═════════════════════ */}
      {tab === 'venue' && (<>
        <section className="overflow-hidden rounded-card border border-border-subtle bg-surface-high">
          <div className="px-3 py-2.5">
            <p className="text-2xs leading-none text-ink-muted">매장</p>
            <p className="mt-1 break-keep text-base font-bold leading-tight text-ink-primary">{schedule.pubName}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-secondary">
              <span>{schedule.region}</span>
              {rating && rating.count > 0 && (
                <>
                  <span className="text-ink-muted">·</span>
                  <span className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${ACCENT_INK}`}>
                    <Icon name="star-fill" size={12} className="shrink-0 text-gold-300" />{rating.avg.toFixed(1)}
                  </span>
                  <span className="text-ink-muted">방문 후기 {rating.count}건 평균</span>
                </>
              )}
            </p>
          </div>
          <div className="divide-y divide-border-subtle border-t border-border-subtle">
            {schedule.address && (
              <a href={`https://map.kakao.com/link/search/${encodeURIComponent(schedule.address)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 text-xs transition-colors hover:bg-surface-float/40">
                <Icon name="map" size={14} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 break-keep text-ink-secondary">{schedule.address}</span>
                <span className={`shrink-0 text-2xs font-bold ${ACCENT_INK}`}>지도 →</span>
              </a>
            )}
            {schedule.venueId && (
              <button type="button" onClick={() => onVenueClick(schedule.venueId!)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-surface-float/40">
                <Icon name="home" size={14} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 font-semibold text-ink-primary">매장 페이지 — 다른 일정 · 후기 · 위치</span>
                <span className={`shrink-0 text-2xs font-bold ${ACCENT_INK}`}>이동 →</span>
              </button>
            )}
          </div>
        </section>

        {/* 파트너 & 결제 */}
        {(schedule.partners || schedule.paymentMethods) && (
          <section className="reveal space-y-3">
            {schedule.partners && schedule.partners.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-ink-primary mb-1.5">파트너 / 시드권 발행</h3>
                <div className="flex flex-wrap gap-1.5">
                  {/* max-w-full: 긴 파트너명(띄어쓰기 없는 영문 등)이 칩째로 화면 밖으로 나가지 않게 칩 안에서 줄바꿈 */}
                  {schedule.partners.map((p) => (
                    <span
                      key={p}
                      className="inline-flex max-w-full items-center break-keep [overflow-wrap:anywhere] px-2.5 py-1 rounded-badge bg-surface-high border border-border-default text-xs font-bold text-ink-primary tracking-wider"
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-2xs text-ink-muted">교차 지급 가능</p>
              </div>
            )}
            {schedule.paymentMethods && schedule.paymentMethods.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-ink-primary mb-1.5">결제 수단</h3>
                <div className="flex flex-wrap gap-1.5">
                  {schedule.paymentMethods.map((m) => (
                    <span
                      key={m}
                      className={`inline-flex max-w-full items-center break-keep [overflow-wrap:anywhere] px-2.5 py-1 rounded-badge bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold ${LIVE_INK}`}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </>)}

      {/* ══════ Q&A ═══════════════════════════════════════════════════════════ */}
      {tab === 'qna' && (<>
        {/* 대회 후기 쓰기 — 커뮤니티 게시판(대회 후기 카테고리)으로 바로 작성 */}
        <button type="button"
          onClick={() => { if (!user) { promptLogin(); return; } openPostForm('tourney'); }}
          className="flex w-full items-center gap-2 rounded-input border border-accent-400/40 bg-accent-300/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-accent-300/[0.1]">
          <Icon name="edit" size={15} className="shrink-0 text-accent-300" />
          <span className="min-w-0 flex-1">
            <span className={`block text-xs font-bold ${ACCENT_INK}`}>이 대회 후기 쓰기</span>
            <span className="block text-2xs text-ink-muted">참가 후기를 커뮤니티 게시판(대회 후기)에 남겨보세요 — 다른 플레이어에게 큰 도움이 됩니다.</span>
          </span>
          <span className={`shrink-0 ${ACCENT_INK}`} aria-hidden>→</span>
        </button>
        {/* 탭 칸(78px)에 안 들어가 점으로 압축한 '새 N' — 개수 자체는 여기서 원문 그대로 보존.
            text-danger 단독은 라이트 surface-base 위 3.27:1 이라 소형 텍스트 기준 미달 → deep/light 쌍. */}
        {schedule.unreadQnaCount > 0 && (
          <p className={`text-2xs font-bold ${URGENT_INK}`}>새 {schedule.unreadQnaCount}</p>
        )}
        <CommentThread
          comments={qnaComments}
          onSubmit={onSubmitComment}
          onDelete={onDeleteComment}
          emptyText="이 토너먼트에 대해 첫 질문을 남겨보세요."
        />
      </>)}
      </div>
        </div>
      </div>
      {/* 포스터 풀스크린 라이트박스 — 핀치줌·더블탭·팬 */}
      {lightbox && schedule.posterUrl && (
        <ImageLightbox src={schedule.posterUrl} alt={`${schedule.title} 포스터`} onClose={() => setLightbox(false)} />
      )}
    </Modal>
  );
}

// ── 라이브 클락 3열 패널(APIS 상세 상단) ──────────────────────────────────────
// 왼: 프라이즈 요약 + 전체보기 / 가운데: LEVEL · 큰 타이머 · BLINDS · NEXT / 오른: PLAYERS 계열.
// 데이터는 전부 기존 것만 쓴다 — clock API(getVenueClocks·effectiveLevel·subscribeClock),
// liveStats 스냅샷, regStatus(matchClockSchedule·msToRegClose). 새 백엔드·새 컬럼 없음.
//
// 390px 붕괴: 타이머가 1행 전체(col-span-2), 그 아래 프라이즈|PLAYERS 2열.
// sm 이상에서 order 로 APIS 순서(프라이즈·타이머·PLAYERS)를 복원한다 — 모바일에서 타이머를
// 맨 위에 두는 이유는 '지금 몇 분 남았나'가 이 화면의 심장이라서다.
function LiveClockPanel({ schedule, regInfo, onSeePrize }: {
  schedule: Schedule; regInfo?: RegInfo; onSeePrize: () => void;
}) {
  const { id, venueId, date, title } = schedule;
  // matchClockSchedule 은 Schedule[] 을 받는다 — 매칭 규칙(같은 매장·같은 날짜, 여럿이면 제목 일치)을
  // 여기서 다시 짜면 규칙이 두 벌이 된다. 최소 필드 스텁 1개로 그 단일 소스를 그대로 호출한다.
  const stub = useMemo(() => [{ id, venueId, date, title } as Schedule], [id, venueId, date, title]);
  const [clock, setClock] = useState<ClockState | null>(null);
  useEffect(() => {
    if (!venueId) return;
    let alive = true;
    const load = () => getVenueClocks(venueId)
      .then((gs) => { if (alive) setClock(gs.find((g) => matchClockSchedule(g, stub)) ?? null); })
      // 조회 실패를 화면 상태로 승격시키지 않는다 — 패널은 직전 값을 유지하고,
      // 아래 참가 예약 문구(regInfo 기반)가 이미 '지금 등록 되나'의 답을 들고 있다.
      .catch(() => {});
    load();
    const t = window.setInterval(load, 30_000);
    const off = subscribeClock(venueId, load); // 레벨 전환·엔트리 갱신 즉시 반영
    return () => { alive = false; window.clearInterval(t); off(); };
  }, [venueId, stub]);

  // 1초 틱 — 모달이 열려 있는 동안(=이 컴포넌트가 마운트된 동안)만, 그리고 클락이 도는 동안만.
  const running = !!clock?.running;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 1_000);
    return () => window.clearInterval(t);
  }, [running]);

  const lvls = clock?.config?.levels ?? [];
  // 손님 기기는 쓰기 권한이 없다 — 표시만 보정한다(DB 전진은 운영자 화면 책임).
  const eff = clock ? effectiveLevel(clock) : null;
  const lv = eff ? lvls[eff.index] : undefined;
  const isBreak = lv?.kind === 'break';
  const levelNo = eff ? levelNoAt(lvls, eff.index) : 0;
  const nextLv = eff ? lvls.slice(eff.index + 1).find((l) => l.kind === 'level') : undefined;
  const remain = eff ? eff.remainingMs : 0;
  const mm = String(Math.floor(remain / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((remain % 60_000) / 1000)).padStart(2, '0');
  const regMs = clock && eff ? msToRegClose(clock, eff.index, eff.remainingMs) : (regInfo?.msLeft ?? null);
  const regLv = clock?.config?.regCloseLevel ?? 0;
  // 다음 브레이크까지 — 현재 레벨 잔여 + 사이 레벨들의 길이 누적
  let breakMs: number | null = null;
  if (eff) {
    let acc = eff.remainingMs;
    for (let i = eff.index + 1; i < lvls.length; i++) {
      if (lvls[i].kind === 'break') { breakMs = acc; break; }
      acc += (lvls[i].minutes || 0) * 60_000;
    }
  }
  const ls = clock?.liveStats ?? null;

  return (
    <section className={[
      'rounded-card border p-2',
      running ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-border-default bg-surface-high/40',
    ].join(' ')}>
      {/* 헤더: ● LIVE ────────────── 레지 마감 · LV8 */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={['flex shrink-0 items-center gap-1 text-2xs font-bold leading-none',
          running ? LIVE_INK : 'text-ink-secondary'].join(' ')}>
          <span aria-hidden>●</span>{running ? 'LIVE' : '일시정지'}
        </span>
        <span className="ml-auto min-w-0 truncate text-2xs font-bold leading-none">
          {regMs === null ? (
            <span className="text-ink-muted">레지 마감 · 현장 안내</span>
          ) : regMs === 0 ? (
            <span className="text-ink-muted">레지 마감{regLv > 0 ? ` · LV${regLv}` : ''} · 마감</span>
          ) : (
            <span className={regMs <= 5 * 60_000 ? URGENT_INK : LIVE_INK}>
              레지 마감{regLv > 0 ? ` · LV${regLv}` : ''} · {minLabel(regMs)} 남음
            </span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {/* ── 가운데(모바일 1행): LEVEL · 타이머 · BLINDS · NEXT ── */}
        <div className="col-span-2 flex min-h-[7.5rem] flex-col items-center justify-center rounded-input border border-border-subtle bg-surface-low px-3 py-2.5 text-center sm:order-2 sm:col-span-1">
          <p className="text-2xs font-bold leading-none tracking-wider text-ink-muted">
            {isBreak ? 'BREAK' : `LEVEL ${levelNo || '-'}`}
          </p>
          {/* tabular-nums + 고정 최소 높이 = 초가 바뀌어도 폭·행높이가 흔들리지 않는다(CLS 0) */}
          <p className="mt-1 font-display text-[2.125rem] font-extrabold leading-none tabular-nums text-ink-primary">
            {eff ? `${mm}:${ss}` : '--:--'}
          </p>
          <p className="mt-2 text-2xs font-bold leading-none tracking-wider text-ink-muted">BLINDS</p>
          <p className="mt-1 text-sm font-bold leading-none tabular-nums text-ink-primary">
            {isBreak ? '휴식 중' : blindText(lv)}
          </p>
          <p className="mt-1 text-2xs leading-none tabular-nums text-ink-muted">NEXT {blindText(nextLv)}</p>
        </div>

        {/* ── 왼쪽: 프라이즈 요약 + 전체보기 ── */}
        <div className="flex min-h-[6.5rem] flex-col rounded-input border border-border-subtle bg-surface-low px-3 py-2.5 sm:order-1">
          <p className="text-2xs font-bold leading-none tracking-wider text-ink-muted">PRIZE</p>
          {/* §28: 프라이즈풀·GTD 는 상품 가격 정보라 표시 유지 */}
          <p className="mt-1.5 text-lg font-extrabold leading-none tabular-nums text-ink-primary">{prizeMainText(schedule)}</p>
          <p className="mt-1.5 text-2xs leading-snug text-ink-muted">
            {schedule.guaranteed ? '참가 인원과 무관한 보장 상금' : '엔트리 대비 상금'}
          </p>
          <button type="button" onClick={onSeePrize}
            className={`mt-auto pt-2 text-left text-2xs font-bold ${ACCENT_INK}`}>
            프라이즈 전체보기 →
          </button>
        </div>

        {/* ── 오른쪽: PLAYERS · TOTAL CHIPS · AVG STACK · NEXT BREAK ── */}
        <div className="flex min-h-[6.5rem] flex-col rounded-input border border-border-subtle bg-surface-low px-3 py-2.5 sm:order-3">
          <p className="text-2xs font-bold leading-none tracking-wider text-ink-muted">PLAYERS</p>
          <p className="mt-1.5 text-lg font-extrabold leading-none tabular-nums text-ink-primary">
            {ls ? `${ls.alive}/${ls.entries}` : '—'}
          </p>
          <dl className="mt-1.5 space-y-1 text-2xs leading-none">
            <StatRow label="TOTAL CHIPS" value={ls && ls.totalStack > 0 ? ls.totalStack.toLocaleString() : '—'} />
            <StatRow label="AVG STACK" value={ls && ls.avgStack > 0 ? ls.avgStack.toLocaleString() : '—'} />
            <StatRow label="NEXT BREAK" value={isBreak ? '휴식 중' : breakMs !== null ? minLabel(breakMs) : '없음'} />
          </dl>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-2xs text-ink-muted">운영 중 클락의 공개 정보입니다 · 실시간 반영</p>
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="shrink-0 tracking-wider text-ink-muted">{label}</dt>
      <dd className="min-w-0 truncate font-bold tabular-nums text-ink-primary">{value}</dd>
    </div>
  );
}

// ── 캘린더 등록 · 공유 링크 줄 ────────────────────────────────────────────────
function CalendarShareRow({ schedule }: { schedule: Schedule }) {
  const toast = useToast();
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* 구글 캘린더 바로 등록 — 다운로드 없이 새 창에서 '저장'만 누르면 끝 */}
      <button type="button"
        onClick={() => {
          const ev = { title: schedule.title, date: schedule.date, startTime: schedule.startTime, venueName: schedule.pubName, address: schedule.address };
          // iOS 기본 캘린더 사용자는 구글 URL 로는 등록이 안 된다(Phase 14) — .ics 는 네이티브로 열린다.
          if (isIOS()) {
            const a = document.createElement('a');
            a.href = icsDataUrl(ev);
            a.download = `${schedule.title.slice(0, 30)}.ics`;
            document.body.appendChild(a); a.click(); a.remove();
          } else {
            window.open(googleCalendarUrl(ev), '_blank', 'noopener');
          }
        }}
        className="flex items-center justify-center gap-1.5 rounded-input border border-border-default bg-surface-high py-2 text-xs font-bold text-ink-secondary transition-colors hover:border-accent-400/50 hover:text-accent-300">
        <Icon name="calendar" size={14} className="shrink-0" />내 캘린더에 추가
      </button>
      {/* 공유 링크 복사 — 이 대회로 바로 열리는 주소 */}
      <button type="button"
        onClick={async () => {
          try {
            // /p/<id> = 카톡·페북 봇에 대회별 OG 카드(포스터·바이인)를 주는 프리렌더 경로.
            // 사람은 자동으로 /?s=<id> (앱 포스터 상세)로 리다이렉트된다.
            await navigator.clipboard.writeText(`https://nuriholdem.com/p/${schedule.id}`);
            toast.show('공유 링크를 복사했습니다 — 붙여넣으면 이 대회로 바로 열려요', 'success');
          } catch { toast.show('복사에 실패했습니다', 'error'); }
        }}
        className="flex items-center justify-center gap-1.5 rounded-input border border-border-default bg-surface-high py-2 text-xs font-bold text-ink-secondary transition-colors hover:border-accent-400/50 hover:text-accent-300">
        <Icon name="link" size={14} className="shrink-0" />공유 링크
      </button>
    </div>
  );
}

// ── 예약하기 박스 ─────────────────────────────────────────────────────────────
// 포스터 하단 — 현장 바인(참가) 요청. QR(다른 기기 스캔용) + 버튼(앱 내 회원 직접 요청).
// 호출부에서 '대회 당일'에만 렌더한다. 왜: 요청은 서버(request_buyin)가 KST 오늘 장부에 넣기 때문에
// 다른 날짜 포스터에서 누르면 엉뚱한 날 장부가 오염된다. eventDate 를 서버에도 넘겨 2중으로 막는다.
function BuyinRequestBox({ venueId, eventDate }: { venueId: string; eventDate: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [qr, setQr] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { QRCode.toDataURL(buyinRequestUrl(venueId), { width: 200, margin: 1 }).then(setQr).catch(() => {}); }, [venueId]);
  const send = () => {
    if (!user) { promptLogin(); return; }
    if (sending) return;
    setSending(true);
    requestBuyin(venueId, null, undefined, eventDate)
      .then((name) => toast.show(`${name || '매장'} 참가(바인) 요청 전송! 운영자 승인을 기다려 주세요`, 'success'))
      .catch((e) => toast.show(e instanceof Error ? e.message : '요청 전송 실패', 'error'))
      .finally(() => setSending(false));
  };
  return (
    <div className="flex items-center gap-3 rounded-card border border-sky-500/30 bg-sky-500/[0.05] p-2.5">
      {qr && <img src={qr} alt="바인 요청 QR" width={72} height={72} decoding="async" className="shrink-0 rounded-input bg-white p-1" />}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink-primary"><Icon name="hand" size={15} className="shrink-0" />지금 매장에서 참가 신청 <span className="font-normal text-ink-muted">· 오늘 · 현장</span></p>
        <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">매장에 도착한 뒤 눌러주세요. 운영자가 승인하면 <b className="text-ink-secondary">오늘 장부 명단</b>에 바로 등록됩니다.</p>
        {/* 오발신이 곧 운영자 장부 오염 + 업주 푸시 알림이라, 스치는 탭으로는 나가지 않게 꾹 누르기
            (예약 취소와 동일 패턴 — 확인 팝업보다 빠르면서 오작동엔 더 안전) */}
        <HoldToConfirmButton onConfirm={send} disabled={sending} holdingLabel="계속 누르세요…"
          className="btn-primary mt-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          {sending ? '전송 중…' : <span className="inline-flex items-center gap-1.5"><Icon name="hand" size={13} className="shrink-0" />꾹 눌러 참가 신청</span>}
        </HoldToConfirmButton>
      </div>
    </div>
  );
}

function ReserveBox({ scheduleId, ownerId, venueId, date, startTime, sched, regInfo }: { scheduleId: string; ownerId?: string | null; venueId?: string | null; date: string; startTime: string; sched: Schedule; regInfo?: RegInfo }) {
  const { user } = useAuth();
  const toast = useToast();
  const [mine, setMine] = useState<Reservation | null>(null);
  // 컴팩트 재구성(오너 지시 2026-08-27) — 예약 UI 는 기본 접힘. 한 줄 요약 + '더보기'로 펼친다.
  // CTA('예약하기')는 접힘 행 우측에 항상 노출 — 누르면 펼쳐져 닉네임 입력부터 이어진다.
  const [expanded, setExpanded] = useState(false);
  // 예약 성공 순간 — 토스트 한 줄로 끝내지 않고 '다음 단계'(캘린더·1시간 전 알림)를 제안
  const [justReserved, setJustReserved] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // 'live'(시작했지만 레지 마감 전)는 예약을 계속 받는다 — 현장 레이트 레지를 막으면 매출이 죽는다
  const status = scheduleStatus(date, startTime);
  const ended = status === 'ended';

  // 예약 내역(예약명·날짜·시간)은 '이 포스터의 매장' 업주/운영자만 — 타 매장 업주·일반 노출 차단
  const isManager = user?.role === 'admin'
    || (user?.role === 'venue_owner' && ((!!ownerId && user.id === ownerId) || (!!venueId && user.venueId === venueId)));
  const [resList, setResList] = useState<OwnerReservation[]>([]);
  const [resOpen, setResOpen] = useState(false);
  const loadRes = () => { if (isManager) getOwnerReservations(scheduleId).then(setResList).catch(() => {}); };
  useEffect(() => {
    setName(user?.nickname || user?.name || '');
    if (user) getMyReservation(scheduleId).then(setMine).catch(() => {});
    else setMine(null);
  }, [scheduleId, user]);
  useEffect(() => { if (isManager) getOwnerReservations(scheduleId).then(setResList).catch(() => {}); else setResList([]); }, [scheduleId, isManager]);

  const act = async () => {
    if (!user) { toast.show('로그인 후 예약할 수 있습니다', 'error'); promptLogin(); return; }
    if (busy || !mine) return;
    setBusy(true);
    try {
      await cancelMyReservation(scheduleId); setMine(null); toast.show('예약을 취소했습니다', 'info');
      loadRes();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '처리 실패', 'error');
    }
    finally { setBusy(false); }
  };
  // 예약(생성)은 상태 버튼이 모핑으로 보여준다 — 체크 애니메이션이 끝난 onDone에서 '예약 완료' 카드로 전환
  const doReserve = async () => {
    // 렌더 시점 status 는 낡을 수 있다(모달을 켜둔 채 종료 시각을 넘김) → 누르는 순간 다시 판정
    if (scheduleStatus(date, startTime) === 'ended') {
      toast.show('종료된 대회는 예약할 수 없습니다', 'error');
      throw new Error('ended');
    }
    if (!ensureVerified(user, '대회 예약')) throw new Error('verify'); // 로그인 + 본인인증 회원만 예약
    const _u = user!;
    const n = (name.trim() || _u.name || '예약자');
    try {
      await createReservation(scheduleId, n); // 중복 닉네임이면 '이미 등록된 닉네임입니다' throw
    } catch (e) {
      // 중복 닉네임 등 — 입력은 유지되어 닉네임만 바꿔 바로 다시 예약 가능
      toast.show(e instanceof Error ? e.message : '처리 실패', 'error');
      throw e;
    }
  };
  const afterReserve = () => {
    if (!user) return;
    const n = (name.trim() || user.name || '예약자');
    setMine({ id: '', scheduleId, userId: user.id, displayName: n, createdAt: new Date().toISOString() });
    setJustReserved(true); // 성공 패널이 다음 행동(캘린더·알림)까지 안내 — 토스트 대체
    loadRes();
  };
  // D-day — 대회는 보통 며칠 뒤라, 잊지 않게 하는 장치(캘린더·알림)와 함께 보여준다
  const ddayNum = Math.round((new Date(date + 'T00:00:00').getTime() - new Date(new Date().toLocaleDateString('en-CA') + 'T00:00:00').getTime()) / 86400000);
  const ddayLabel = ddayNum <= 0 ? '오늘' : ddayNum === 1 ? '내일' : `D-${ddayNum}`;
  const addToCalendar = () => {
    const ev = { title: sched.title, date: sched.date, startTime: sched.startTime, venueName: sched.pubName, address: sched.address };
    if (isIOS()) {
      const a = document.createElement('a');
      a.href = icsDataUrl(ev);
      a.download = `${sched.title.slice(0, 30)}.ics`;
      document.body.appendChild(a); a.click(); a.remove();
    } else {
      window.open(googleCalendarUrl(ev), '_blank', 'noopener');
    }
  };
  const enableReminderPush = async () => {
    try { await enablePush(); setPushOn(true); toast.show('알림을 켰습니다 — 시작 1시간 전에 알려드려요', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '알림 설정 실패', 'error'); }
  };
  const fmtRes = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  return (
    <section className="rounded-card border border-accent-400/40 bg-gradient-to-br from-accent-300/[0.08] to-transparent">
      {/* 한 줄 요약 행(기본 접힘) — 아래 '지금 매장에서 참가 신청'과 역할이 헷갈려 손님이
          잘못 누르는 사고가 있어 제목에 역할을 박아둔다 */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="shrink-0 text-sm font-bold text-accent-300">참가 예약</span>
          <span className="min-w-0 flex-1 truncate text-2xs text-ink-muted">
            {mine ? `예약자: ${mine.displayName}` : isManager ? `예약 ${resList.length}명` : '미리 자리 잡아두기'}
          </span>
          {mine && <span className="shrink-0 text-2xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-badge">예약 완료</span>}
          {!mine && ended && <span className="shrink-0 text-2xs font-bold text-ink-muted bg-surface-high border border-border-default px-2 py-0.5 rounded-badge">종료</span>}
          <span className="flex shrink-0 items-center gap-0.5 text-2xs font-bold text-ink-muted">
            {expanded ? '접기' : '더보기'}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
              className={['transition-transform', expanded ? 'rotate-180' : ''].join(' ')} aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
          </span>
        </button>
        {/* 예약 CTA 는 접혀 있어도 숨기지 않는다 — 누르면 예약 UI(닉네임 입력)가 펼쳐진다 */}
        {!mine && !ended && !expanded && (
          <button type="button" onClick={() => setExpanded(true)}
            className="btn-primary shrink-0 px-3 py-1.5 text-xs">
            예약하기
          </button>
        )}
      </div>

      {expanded && (
      // data-no-drag-close: 이 안에서 시작한 손짓은 전체화면 시트의 '끓어 닫기' 로 해석하지 않는다 —
      //   닉네임을 적다가 실수로 내려서 포스터 상세가 통째로 닫히면 입력이 통째로 사라진다(오너 필수 제외 조건).
      <div data-no-drag-close className="space-y-2 border-t border-accent-400/20 px-3 pb-3 pt-2 animate-fade-in">
      {!user && !ended && (
        <p className="rounded-input bg-surface-base/50 px-2.5 py-2 text-2xs leading-relaxed text-ink-muted">
          예약엔 <b className="text-ink-secondary">로그인·본인인증</b>이 필요해요 — 노쇼 방지를 위한 자리 보장 장치예요.
        </p>
      )}
      {!mine && !ended && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="닉네임 또는 실명" maxLength={30} className="input w-full text-sm" />
      )}
      {/* 예약 성공 패널 — 완료 순간에 다음 행동을 제안(캘린더 등록·1시간 전 알림). 서버
          리마인더는 이미 예약자 전원에게 발송되므로, 여기의 '알림 받기'는 푸시 구독만 켠다. */}
      {justReserved && mine && (
        <div className="animate-fade-in space-y-2 rounded-input border border-emerald-500/40 bg-emerald-500/[0.07] p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-400"><Icon name="check-circle" size={15} className="shrink-0" />예약 완료 · {ddayLabel} {startTime?.slice(0, 5)} 시작</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={addToCalendar}
              className="flex items-center justify-center gap-1.5 rounded-input border border-border-default bg-surface-high py-2.5 text-2xs font-bold text-ink-secondary hover:border-accent-400/50 hover:text-accent-300 transition-colors">
              <Icon name="calendar" size={13} className="shrink-0" />캘린더에 추가
            </button>
            {pushSupported() ? (
              <button type="button" onClick={enableReminderPush} disabled={pushOn}
                className={['flex items-center justify-center gap-1.5 rounded-input border py-2.5 text-2xs font-bold transition-colors',
                  pushOn ? 'border-emerald-500/40 text-emerald-400' : 'border-border-default bg-surface-high text-ink-secondary hover:border-accent-400/50 hover:text-accent-300'].join(' ')}>
                <Icon name="bell" size={13} className="shrink-0" />{pushOn ? '알림 켜짐 ✓' : '1시간 전 알림'}
              </button>
            ) : (
              <span className="flex items-center justify-center gap-1.5 rounded-input border border-border-default bg-surface-high py-2.5 text-2xs text-ink-muted"><Icon name="alarm" size={13} className="shrink-0" />시작 1시간 전 알림 예정</span>
            )}
          </div>
          <button type="button" onClick={() => setJustReserved(false)}
            className="w-full py-1 text-center text-2xs font-bold text-ink-muted hover:text-ink-secondary">확인</button>
        </div>
      )}
      {/* 개인정보 제3자 제공 고지 — 예약을 누르는 순간 매장에 회원의 **이름(실명)** 이 실제로 전달된다
          (RPC schedule_reservations_for_owner 가 profiles.real_name 을 업주에게 반환한다. 아래
           '예약 내역'이 그걸 그대로 그리고 있다). 매장은 자기 사업을 위해 그 정보를 쓰므로 수탁자가
          아니라 **별도의 개인정보처리자**로 보는 것이 안전하고, 그렇다면 이건 제3자 제공이다.
          ⚠ 개보법 §17① 은 제3자 제공에 원칙적으로 동의를 요구하고, §17①2 가 열거하는 예외에
            §15①4(계약의 이행)는 **포함되지 않는다** — "예약이라는 계약을 이행하려면 필요하다"만으로는
            정당화되지 않는다. 그래서 '무엇을·누구에게·왜·언제까지'를 CTA 바로 위에서 전부 밝히고,
            그 상태에서 누르는 예약을 동의의 의사표시로 본다(처리방침 제9조와 항목이 일치해야 한다).
          접지 않는 이유: 접힌 고지는 고지가 아니다. 여기만은 '더보기' 뒤로 숨기지 않는다. */}
      {!mine && !ended && (
        <div className="rounded-input border border-border-default bg-surface-base/50 px-2.5 py-2">
          <p className="flex items-start gap-1.5 text-2xs font-bold leading-relaxed text-ink-secondary">
            <Icon name="lock" size={12} className="mt-0.5 shrink-0" />
            <span>예약하면 이 매장에 <b className="text-accent-300">이름(실명)과 닉네임</b>이 전달됩니다</span>
          </p>
          <ul className="mt-1 space-y-0.5 text-2xs leading-relaxed text-ink-muted">
            <li>· 전달 항목: 닉네임, 이름(실명 — 본인인증을 마친 회원), 입력한 예약명, 예약 일시, 대회 당일 매장 체크인 여부</li>
            <li>· 받는 곳: {sched.pubName || '이 대회를 여는 매장'}의 운영주체(업주·매장 운영자)</li>
            <li>· 이용 목적: 예약자 본인 확인, 좌석 배정, 변경·취소 및 대회 진행 안내</li>
            <li>· 보유 기간: 대회 종료 후 분쟁 대응에 필요한 기간까지 — 예약을 취소하면 매장 명단에서 곧바로 지워집니다</li>
            <li>· 휴대전화번호는 매장에 전달되지 않습니다</li>
          </ul>
          <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
            아래 <b className="text-ink-secondary">예약하기</b>를 누르면 위 제공에 동의하는 것으로 봅니다.{' '}
            <a href="/legal/privacy.html" target="_blank" rel="noopener"
              className="font-semibold text-accent-300 underline underline-offset-2">개인정보처리방침 제9조</a>
          </p>
        </div>
      )}

      {/* 취소는 종료 후에도 열어둔다 — 막는 건 '새 예약'이지 이미 남긴 기록의 정리가 아니다 */}
      {mine ? (
        <HoldToConfirmButton onConfirm={act} disabled={busy} holdingLabel="취소하는 중…"
          className="w-full py-3 rounded-input text-sm font-bold transition-colors disabled:opacity-60 bg-surface-high text-danger-light border border-danger/40">
          꾹 눌러 예약 취소
        </HoldToConfirmButton>
      ) : ended ? (
        <p className="rounded-input border border-border-default bg-surface-high py-3 text-center text-sm font-bold text-ink-muted">
          종료된 대회입니다 — 예약을 받지 않습니다
        </p>
      ) : (
        <div className="flex justify-center">
          <StatefulActionButton label="예약하기" successLabel="예약 완료!"
            onAction={doReserve} onDone={afterReserve} className="w-full" />
        </div>
      )}
      <p className="text-2xs text-ink-muted">
        {mine ? `예약자: ${mine.displayName}`
          : ended ? '이미 끝난 대회라 예약이 닫혔습니다. 다음 대회 일정을 확인해 주세요.'
          : status === 'live' ? (
              // UX-1: 클락 실측이 있으면 '매장에 확인해 주세요' 대신 실제 답을 준다(서버는 답을 알고 있었다)
              regInfo && regInfo.msLeft !== null
                ? (regInfo.msLeft === 0
                    ? '레이트 레지가 마감된 대회입니다 — 다음 일정을 확인해 주세요.'
                    : `레이트 레지 진행 중 — 마감까지 약 ${Math.max(1, Math.round(regInfo.msLeft / 60_000))}분, 지금 등록할 수 있습니다.`)
                : '이미 시작한 대회입니다 — 레이트 레지 가능 여부는 매장에 확인해 주세요.'
            )
          : '같은 닉네임이 이미 있으면 예약할 수 없어요. 닉네임을 바꿔 다시 시도하세요.'}
      </p>

      {/* 업주/운영자: 예약 내역(실제 아이디·닉네임) — 접이식 */}
      {isManager && (
        <div className="mt-1 border-t border-accent-400/20 pt-2">
          <button type="button" onClick={() => setResOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
            <span className="text-2xs font-bold text-accent-300">예약 내역 <span className="font-normal text-ink-muted">({resList.length})</span></span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={['text-ink-muted transition-transform', resOpen ? 'rotate-180' : ''].join(' ')} aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {resOpen && (
            resList.length === 0
              ? <p className="py-2 text-center text-2xs text-ink-muted">예약이 없습니다.</p>
              : <ul className="mt-1.5 max-h-60 space-y-1 overflow-y-auto">
                  {resList.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-input bg-surface-base/50 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 truncate text-xs font-semibold text-ink-primary">
                          <span className="truncate">{r.realName ? `${r.realName}(${r.nickname ?? '-'})` : (r.nickname ?? '비회원')}</span>
                          {/* 예약→방문 전환 표시 — 당일 체크인 있으면 ✓, 종료 후에도 없으면 노쇼 */}
                          {r.visited
                            ? <span className="shrink-0 rounded-badge bg-emerald-500/15 px-1 py-0.5 text-2xs font-bold leading-none text-emerald-400">방문 ✓</span>
                            : ended
                              ? <span className="shrink-0 rounded-badge border border-border-default bg-surface-high px-1 py-0.5 text-2xs font-bold leading-none text-ink-muted">노쇼</span>
                              : null}
                        </p>
                        <p className="truncate text-2xs text-ink-muted">예약명: {r.displayName}</p>
                      </div>
                      <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{fmtRes(r.createdAt)}</span>
                    </li>
                  ))}
                </ul>
          )}
          {/* 받는 쪽에도 한 줄 — 개보법 §19(제공받은 자의 이용·제공 제한): 제공받은 개인정보는
              제공 목적 외로 이용하거나 제3자에게 다시 제공할 수 없다. 손님 화면의 고지와 짝을 이룬다. */}
          {resOpen && (
            <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">
              예약자의 이름·닉네임은 <b className="text-ink-secondary">이 대회의 예약 운영</b>을 위해서만 이용할 수 있습니다.
              다른 목적으로 쓰거나 외부에 다시 제공하는 것은 「개인정보 보호법」 제19조 위반입니다.
            </p>
          )}
        </div>
      )}
      </div>
      )}
    </section>
  );
}

// ── 블라인드 구조 ────────────────────────────────────────────────────────────

// 포스터 기본 블라인드 구조 — 로티 파이널롤백 기반 템플릿. 기본 접힘, 클릭 시 펼침. 레지 마감(기본 16LV) 이후 25LV까지 표시.
function BlindStructure({ schedule, alwaysOpen = false }: { schedule: Schedule; alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const shown = alwaysOpen || open;
  const regClose = (() => {
    const m = String(schedule.regCloseTime ?? '').match(/\d+/);
    const n = m ? parseInt(m[0], 10) : 16;
    return Math.min(Math.max(n, 1), 25);
  })();
  const dur = schedule.structure?.blindLevelMinutes || 20;
  const custom = schedule.structure?.levels;
  // 포스터별 저장된 커스텀 레벨이 있으면 그걸, 없으면 파이널롤백 기반 자동 생성
  const levels: { kind: 'level' | 'break'; sb: number; bb: number; ante: number; minutes: number }[] = custom && custom.length
    ? custom.map((l) => ({ kind: l.isBreak ? 'break' : 'level', sb: l.sb, bb: l.bb, ante: l.ante, minutes: l.minutes }))
    : generateBlinds(regClose, 25, dur, dur).map((l) => ({ kind: l.kind, sb: l.sb, bb: l.bb, ante: l.ante, minutes: l.minutes }));

  let levelNo = 0;
  return (
    <section>
      {/* 요약 줄 — 전용 탭(alwaysOpen)에서는 누를 게 없으므로 버튼이 아니라 정적 헤더로 낮춘다 */}
      {alwaysOpen ? (
        <div className="flex w-full items-center justify-between gap-2 rounded-input border border-border-subtle bg-surface-high px-3 py-2.5">
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-ink-primary shrink-0">블라인드 구조</span>
            <span className="text-2xs text-ink-muted truncate">{custom && custom.length ? `맞춤 ${custom.filter((l) => !l.isBreak).length}레벨` : `레지 ${regClose}LV 마감 · ${dur}분 · ~25LV`}</span>
          </span>
        </div>
      ) : (
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-input border border-border-subtle bg-surface-high px-3 py-2.5 text-left transition-colors hover:border-border-default">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-ink-primary shrink-0">블라인드</span>
          <span className="text-2xs text-ink-muted truncate">{custom && custom.length ? `맞춤 ${custom.filter((l) => !l.isBreak).length}레벨` : `레지 ${regClose}LV 마감 · ${dur}분 · ~25LV`}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      )}

      {shown && (
        // 탭 전용(alwaysOpen)에서는 진입 애니를 붙이지 않는다 — 탭을 오갈 때마다 긴 표 전체에
        // blur 필터가 다시 걸리면 그게 곧 페인트 폭탄이다(§20.4 #3).
        <div className={`mt-2 overflow-hidden rounded-input border border-border-subtle ${alwaysOpen ? '' : 'animate-fade-in'}`}>
          <table className="w-full text-2xs tabular-nums">
            <thead>
              <tr className="bg-surface-high text-ink-muted">
                <th className="py-1.5 px-2 text-left font-semibold">LV</th>
                <th className="py-1.5 px-2 text-right font-semibold">SB / BB</th>
                <th className="py-1.5 px-2 text-right font-semibold">앤티</th>
                <th className="py-1.5 px-2 text-right font-semibold">시간</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l, i) => {
                if (l.kind === 'break') {
                  return (
                    <tr key={i} className="bg-accent-300/[0.06] border-t border-border-subtle">
                      <td colSpan={4} className="py-1.5 px-2 text-center font-bold text-accent-300">BREAK · {l.minutes}분</td>
                    </tr>
                  );
                }
                levelNo += 1;
                const isRegClose = levelNo === regClose;
                return (
                  <tr key={i} className={`border-t border-border-subtle ${isRegClose ? 'bg-amber-500/[0.08]' : ''}`}>
                    <td className="py-1.5 px-2 text-left font-bold text-ink-secondary">
                      {levelNo}{isRegClose && <span className="ml-1 text-[9px] font-bold text-amber-400">레지마감</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right font-semibold text-ink-primary">{l.sb.toLocaleString()} / {l.bb.toLocaleString()}</td>
                    <td className="py-1.5 px-2 text-right text-ink-muted">{l.ante ? l.ante.toLocaleString() : '-'}</td>
                    <td className="py-1.5 px-2 text-right text-ink-muted">{l.minutes}분</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="bg-surface-base px-2 py-1.5 text-2xs text-ink-muted">※ 매장 기본 구조 예시입니다. 실제 운영 시 변동될 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}

// ── 값 마퀴 — 칸 폭을 넘는 값이 줄바꿈 대신 옆으로 흐르고 무한 루프로 돌아온다 ──────
// 내용 2회 복제 + translateX(-50%) 무한 루프(모션 헌법 §20.4 #1 '무한 루프' 허용 예외 —
// transform 전용·컴포지터 상주). 넘치지 않으면 정적 표시(애니메이션 자체를 붙이지 않음).
// prefers-reduced-motion 은 index.css 동작 줄이기 블록에서 truncate 폴백.
function MarqueeText({ text, className = '' }: { text: string; className?: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [loopW, setLoopW] = useState(0); // 0 = 넘치지 않음(정적)
  useEffect(() => {
    const vp = viewportRef.current, ms = measureRef.current;
    if (!vp || !ms) return;
    const check = () => setLoopW(ms.offsetWidth > vp.clientWidth + 1 ? ms.offsetWidth : 0);
    check();
    const ro = new ResizeObserver(check); // 폰트 로드·회전·2-pane 리사이즈에도 재판정
    ro.observe(vp);
    return () => ro.disconnect();
  }, [text]);
  const GAP = 32; // 복제본 사이 간격(px) — pr-8 과 일치해야 -50% 지점이 정확히 맞물린다
  return (
    <div ref={viewportRef} className={`relative min-w-0 overflow-hidden ${className}`}>
      {/* 측정 전용(불가시) 상주 — 마퀴 전환 뒤에도 '더는 안 넘침' 복귀 판정 가능 */}
      <span ref={measureRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap">{text}</span>
      {loopW > 0 ? (
        <div
          className="marquee-loop flex w-max"
          style={{ '--marquee-dur': `${Math.max(6, Math.round((loopW + GAP) / 28))}s` } as React.CSSProperties}
        >
          <span className="whitespace-nowrap pr-8">{text}</span>
          <span className="whitespace-nowrap pr-8" aria-hidden>{text}</span>
        </div>
      ) : (
        <span className="block truncate">{text}</span>
      )}
    </div>
  );
}

// 게임 정보 2열 정의 행 — 라벨(dt) 좌 / 값(dd) 우. 긴 값은 MarqueeText 가 옆으로 흘린다.
// dl > div > dt+dd 는 HTML5 유효 구조 — 행 단위 구분선을 주려면 래퍼가 필요하다.
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 py-1.5">
      <dt className="text-2xs text-ink-muted">{label}</dt>
      <dd className="min-w-0">
        <MarqueeText text={value} className="text-xs font-semibold text-ink-primary tabular-nums text-right" />
      </dd>
    </div>
  );
}

// 상단 요약 그리드 셀 — 라벨(2xs muted) 위 / 값(sm bold) 아래, 행 높이 고정(h-14)
function SummaryCell({ label, value, badge, accent = false }: {
  label: string; value: string; badge?: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className="flex h-14 min-w-0 flex-col justify-center gap-0.5 px-3">
      <span className="text-2xs leading-none text-ink-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <MarqueeText
          text={value}
          className={`min-w-0 flex-1 text-sm font-bold tabular-nums leading-tight ${accent ? 'text-gold-300' : 'text-ink-primary'}`}
        />
        {badge}
      </div>
    </div>
  );
}

// 리엔트리 요약(요약 그리드) — 리바이 유무·한도. 정보 없으면 프리즈아웃.
function rebuyText(s: Schedule): string {
  const b = s.buyIn;
  if (b.rebuy === undefined) return '프리즈아웃';
  return `리바이 ${b.rebuy.toLocaleString()}${b.rebuyLimit ? `×${b.rebuyLimit}` : ' 무제한'}`;
}

// 바이인 상세(정보 행) — 금액 + 게임종류·리바이·애드온 한 줄(넘치면 마퀴)
function buyinDetailText(s: Schedule): string {
  const b = s.buyIn;
  const parts: string[] = [];
  // 미입력 0은 가격 정보가 아니다 — 세그먼트 생략(카드·표의 '—' 문법과 동일 판정, 2026-08-28)
  if (b.amount > 0) parts.push(b.amount.toLocaleString());
  if (b.gameType) parts.push(b.gameType);
  if (b.rebuy !== undefined) parts.push(`리바이 ${b.rebuy.toLocaleString()}${b.rebuyLimit ? `×${b.rebuyLimit}` : ' 무제한'}`);
  if (b.addon || b.addonStack) parts.push(`애드온${b.addon ? ` ${b.addon.toLocaleString()}원` : ''}${b.addonStack ? ` (${b.addonStack.toLocaleString()}칩)` : ''}`);
  // 프리즈아웃 추론은 기존 의미 보존: '금액만 있고 리바이 정보가 없다'일 때만
  if (b.amount > 0 && parts.length === 1) parts.push('프리즈아웃');
  return parts.length > 0 ? parts.join(' · ') : '—';
}
