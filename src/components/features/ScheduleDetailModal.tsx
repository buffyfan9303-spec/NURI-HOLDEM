import { useState, useEffect } from 'react';
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
import type { Comment } from '../../api/community';
import { generateBlinds } from '../../api/clock';
import { promptLogin, openPostForm, ensureVerified } from '../../lib/requireLogin';
import { googleCalendarUrl, icsDataUrl, isIOS } from '../../lib/calendar';
import { enablePush, pushSupported } from '../../api/push';
import QRCode from 'qrcode';
import { requestBuyin, buyinRequestUrl, kstToday } from '../../api/ledger';
import SlidingPill from '../atoms/SlidingPill';

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
}

type Tab = 'info' | 'qna';

const SUITS = ['♠','♥','♦','♣'];
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export default function ScheduleDetailModal({
  schedule: scheduleProp, open, onClose, onVenueClick, rating, comments, onSubmitComment, onDeleteComment, onDeletePoster, inline,
}: ScheduleDetailModalProps) {
  const [tab, setTab] = useState<Tab>('info');
  const [lightbox, setLightbox] = useState(false);
  const { user } = useAuth();

  // 닫힘 애니메이션이 끝날 때까지 직전 일정을 유지(시트가 아래로 슬라이드되며 닫히도록)
  const [shown, setShown] = useState<Schedule | null>(scheduleProp);
  useEffect(() => { if (scheduleProp) setShown(scheduleProp); }, [scheduleProp]);
  const schedule = scheduleProp ?? shown;

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
            style={schedule.posterUrl
              ? undefined
              : { background: `linear-gradient(135deg, ${schedule.posterColor ?? '#1a1d24'}ee 0%, #0a0c0f 100%)` }}
          >
            {schedule.posterUrl ? (
              <button
                type="button"
                onClick={() => setLightbox(true)}
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
                  status === 'ended' ? 'bg-black/70 text-white/85' : 'bg-danger text-white',
                ].join(' ')}>
                  {status === 'ended' ? '종료' : '진행 중'}
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
                <span className="text-border-strong">·</span>
                <span>{schedule.region}</span>
                {rating && rating.count > 0 && (
                  <span className="shrink-0 font-bold tabular-nums text-accent-300" title={`방문 후기 ${rating.count}건 평균`}>
                    ⭐{rating.avg.toFixed(1)}<span className="font-normal text-ink-muted">({rating.count})</span>
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
                <span className="text-border-strong">·</span>
                <span>{schedule.region}</span>
                {rating && rating.count > 0 && (
                  <span className="shrink-0 font-bold tabular-nums text-accent-300" title={`방문 후기 ${rating.count}건 평균`}>
                    ⭐{rating.avg.toFixed(1)}<span className="font-normal text-ink-muted">({rating.count})</span>
                  </span>
                )}
              </p>
            )}
            {schedule.address && (
              <p className="mt-0.5 ml-5 text-xs text-ink-muted">{schedule.address}</p>
            )}
          </div>

      {/* ── 탭바 (정보 / Q&A) — sticky 상단 고정. PC는 우측에 닫기 통합 ──────── */}
      <div className="relative grid grid-cols-2 border-b border-border-subtle sticky top-0 bg-surface-mid z-10 lg:pr-[4.25rem]">
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
        {(['info', 'qna'] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              data-pill-active={active || undefined}
              onClick={() => setTab(t)}
              className={[
                'relative py-3 text-sm font-medium transition-colors text-center',
                active ? 'text-accent-300' : 'text-ink-muted hover:text-ink-secondary',
              ].join(' ')}
            >
              {t === 'info' ? '대회 정보' : 'Q&A'}
              {t === 'qna' && qnaComments.length > 0 && (
                <span className="ml-1 text-2xs text-ink-muted tabular-nums">({qnaComments.length})</span>
              )}
              {t === 'qna' && schedule.unreadQnaCount > 0 && (
                <span className="ml-1.5 text-2xs text-danger font-bold">새 {schedule.unreadQnaCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 본문 ─────────────────────────────────────────────────────── */}
      {tab === 'qna' ? (
        <div className="px-3.5 py-3 space-y-2.5">
          {/* 대회 후기 쓰기 — 커뮤니티 게시판(대회 후기 카테고리)으로 바로 작성 */}
          <button type="button"
            onClick={() => { if (!user) { promptLogin(); return; } openPostForm('tourney'); }}
            className="flex w-full items-center gap-2 rounded-input border border-accent-400/40 bg-accent-300/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-accent-300/[0.1]">
            <span aria-hidden>📝</span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-accent-300">이 대회 후기 쓰기</span>
              <span className="block text-[10px] text-ink-muted">참가 후기를 커뮤니티 게시판(대회 후기)에 남겨보세요 — 다른 플레이어에게 큰 도움이 됩니다.</span>
            </span>
            <span className="shrink-0 text-accent-300" aria-hidden>→</span>
          </button>
          <CommentThread
            comments={qnaComments}
            onSubmit={onSubmitComment}
            onDelete={onDeleteComment}
            emptyText="이 토너먼트에 대해 첫 질문을 남겨보세요."
          />
        </div>
      ) : (
      <div className="px-3.5 pt-3.5 pb-5 space-y-4">

        {/* 예약하기 (첫 페이지) */}
        {/* status 를 계산해 넘기지 않고 date/startTime 을 넘긴다 — 모달을 열어둔 채 종료 시각을
            넘길 수 있어, 클릭 시점에 다시 판정해야 하기 때문 */}
        <ReserveBox scheduleId={schedule.id} ownerId={schedule.ownerId} venueId={schedule.venueId}
          date={schedule.date} startTime={schedule.startTime} sched={schedule} />

        {/* 현장 바인(참가) 요청 — 대회 당일에만 연다. 요청이 '오늘' 장부로 들어가기 때문(위 kToday 주석)
            지난 대회에선 안내조차 띄우지 않는다 — 할 수 있는 게 없어 소음일 뿐이라. */}
        {schedule.venueId && isEventToday && <BuyinRequestBox venueId={schedule.venueId} eventDate={eventDate} />}
        {schedule.venueId && !isEventToday && !isPastEvent && (
          <p className="rounded-card border border-border-subtle bg-surface-high px-3 py-2 text-2xs leading-relaxed text-ink-muted">
            🙋 <b className="text-ink-secondary">현장 참가 신청</b>은 대회 <b className="text-ink-secondary">당일</b>에 이 화면에서 열립니다. 지금은 위 <b className="text-ink-secondary">참가 예약</b>으로 자리를 잡아두세요.
          </p>
        )}

        {/* 캘린더 등록 · 공유 — 참가 결심 직후 동선 */}
        <CalendarShareRow schedule={schedule} />

        {/* 프라이즈 강조 박스 */}
        {(schedule.prizePool || schedule.prizePercent) && (
          <section className="rounded-card border border-accent-400/50 bg-gradient-to-br from-accent-300/10 to-transparent p-4">
            <p className="text-2xs uppercase tracking-wider text-gold-500 mb-1">{schedule.guaranteed ? '상금 풀' : '프라이즈'}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-accent-300 tabular-nums leading-none">
                {prizeMainText(schedule)}
              </span>
              <span className={[
                'text-sm font-bold tracking-wider rounded-badge px-2 py-0.5 border',
                schedule.guaranteed
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-surface-high text-ink-muted border-border-default',
              ].join(' ')}>
                {schedule.guaranteed ? 'GTD' : '엔트리'}
              </span>
            </div>
            {schedule.guaranteed && (
              <p className="mt-1 text-2xs text-ink-muted">
                ※ 보장 상금: 참가 인원에 관계없이 위 금액 이상이 지급됩니다
              </p>
            )}
          </section>
        )}

        {/* 핵심 정보 그리드 */}
        <section>
          <h3 className="text-sm font-semibold text-ink-primary mb-2">토너먼트 정보</h3>
          <div className="grid grid-cols-2 gap-2">
            <InfoCard
              label="일정"
              value={`${d.getMonth() + 1}/${d.getDate()} (${dow})`}
              sub={`시작 ${schedule.startTime}`}
            />
            <InfoCard
              label="레지 마감"
              value={schedule.regCloseTime ? schedule.regCloseTime : '현장 안내'}
              sub={schedule.regCloseTime ? '레이트 레지 마감' : undefined}
            />
            <InfoCard
              label="듀레이션"
              value={schedule.duration || '미정'}
            />
            <InfoCard
              label="바이인"
              value={schedule.buyIn.amount.toLocaleString()}
              sub={(() => {
                const b = schedule.buyIn; const parts: string[] = [];
                if (b.gameType) parts.push(b.gameType);
                if (b.rebuy !== undefined) parts.push(`리바이 ${b.rebuy.toLocaleString()}${b.rebuyLimit ? `×${b.rebuyLimit}` : ' 무제한'}`);
                if (b.addon || b.addonStack) parts.push(`애드온${b.addon ? ` ${b.addon.toLocaleString()}원` : ''}${b.addonStack ? ` (${b.addonStack.toLocaleString()}칩)` : ''}`);
                return parts.length ? parts.join(' · ') : '프리즈아웃';
              })()}
            />
            <InfoCard
              label="포맷"
              value={schedule.format}
              sub={schedule.guaranteed ? 'GTD 보장' : '예상 상금'}
            />
            <InfoCard
              label="이벤트"
              value={
                schedule.sideEvents && schedule.sideEvents.length > 0
                  ? `사이드 ${schedule.sideEvents.length}개`
                  : '메인 토너먼트'
              }
              sub={
                schedule.sideEvents && schedule.sideEvents.length > 0
                  ? schedule.sideEvents.map((se) => se.name).slice(0, 2).join(', ')
                  : undefined
              }
            />
          </div>
        </section>

        {/* 블라인드 (선택) */}
        {schedule.blinds && (
          <section>
            <h3 className="text-sm font-semibold text-ink-primary mb-2">블라인드</h3>
            <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap rounded-input bg-surface-high border border-border-subtle p-3">
              {schedule.blinds}
            </p>
          </section>
        )}

        {/* 토너먼트 구조 (선택) — 한 줄(가로 스크롤), 리바인칩 포함 */}
        {schedule.structure && (schedule.structure.startingChips != null || schedule.structure.rebuyStack != null || schedule.structure.blindLevelMinutes != null) && (
          <section>
            <h3 className="text-sm font-semibold text-ink-primary mb-2">토너먼트 구조</h3>
            <div className="flex gap-2 overflow-x-auto scrollbar-none snap-x snap-proximity overscroll-x-contain">
              {schedule.structure.startingChips != null && (
                <div className="shrink-0 w-[5.5rem] snap-start"><InfoCard label="시작 칩" value={schedule.structure.startingChips.toLocaleString()} compact /></div>
              )}
              {schedule.structure.rebuyStack != null && (
                <div className="shrink-0 w-[5.5rem] snap-start"><InfoCard label="리바인 칩" value={schedule.structure.rebuyStack.toLocaleString()} compact /></div>
              )}
              {schedule.structure.blindLevelMinutes != null && (
                <div className="shrink-0 w-[5.5rem] snap-start"><InfoCard label="레벨" value={`${schedule.structure.blindLevelMinutes}분`} compact /></div>
              )}
              {schedule.structure.lateRegLevels !== undefined && (
                <div className="shrink-0 w-[5.5rem] snap-start"><InfoCard label="레이트 레지" value={`${schedule.structure.lateRegLevels}레벨`} compact /></div>
              )}
            </div>
          </section>
        )}

        {/* 블라인드 구조 (접이식, 기본 접힘) */}
        <BlindStructure schedule={schedule} />

        {/* 프로모션 */}
        {schedule.promotions && schedule.promotions.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-ink-primary mb-2">프로모션 / 얼리칩</h3>
            <ul className="space-y-1.5">
              {schedule.promotions.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-input border border-accent-400/30 bg-accent-300/[0.04]"
                >
                  {p.badge && (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-badge bg-accent-300 text-white text-2xs font-bold leading-none">
                      {p.badge}
                    </span>
                  )}
                  <span className="flex-1 text-sm text-ink-primary font-semibold">{p.title}</span>
                  {p.detail && (
                    <span className="text-2xs text-ink-muted shrink-0">{p.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 사이드 이벤트 */}
        {schedule.sideEvents && schedule.sideEvents.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-ink-primary mb-2">사이드 이벤트</h3>
            <div className="grid grid-cols-2 gap-2">
              {schedule.sideEvents.map((se, i) => (
                <div key={i} className="rounded-input bg-surface-high border border-border-subtle p-3">
                  <p className="text-2xs text-ink-muted mb-0.5">{se.startBefore}</p>
                  <p className="text-base font-bold text-ink-primary">{se.name}</p>
                  {se.note && <p className="text-2xs text-ink-muted mt-0.5">{se.note}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* RANKING GTD */}
        {schedule.rankingPrizes && schedule.rankingPrizes.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-ink-primary mb-2 flex items-center gap-1.5">
              순위별 상금
            </h3>
            <div className="rounded-card border border-border-subtle bg-surface-high overflow-hidden">
              <table className="w-full text-xs">
                <tbody>
                  {schedule.rankingPrizes.map((rp, i) => {
                    const isTop3 = ['1st', '2nd', '3rd'].includes(rp.rank);
                    return (
                      <tr key={i} className="border-b border-border-subtle last:border-b-0">
                        <td className={[
                          'px-3 py-1.5 w-20',
                          isTop3 ? 'text-accent-300 font-bold' : 'text-ink-secondary',
                        ].join(' ')}>
                          {rp.rank}
                        </td>
                        <td className={[
                          'px-3 py-1.5 text-right tabular-nums',
                          isTop3 ? 'text-accent-300 font-extrabold text-sm' : 'text-ink-primary font-semibold',
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
        )}

        {/* 파트너 & 결제 */}
        {(schedule.partners || schedule.paymentMethods) && (
          <section className="space-y-3">
            {schedule.partners && schedule.partners.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-ink-primary mb-2">파트너 / 시드권 발행</h3>
                <div className="flex flex-wrap gap-1.5">
                  {schedule.partners.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center px-2.5 py-1 rounded-badge bg-surface-high border border-border-default text-xs font-bold text-ink-primary tracking-wider"
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
                <h3 className="text-sm font-semibold text-ink-primary mb-2">결제 수단</h3>
                <div className="flex flex-wrap gap-1.5">
                  {schedule.paymentMethods.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center px-2.5 py-1 rounded-badge bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-400"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 규정 */}
        {schedule.rules && schedule.rules.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-ink-primary mb-2">운영 규정</h3>
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
          <section>
            <h3 className="text-sm font-semibold text-ink-primary mb-2">상세 설명</h3>
            <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
              {schedule.description}
            </p>
          </section>
        )}
      </div>
      )}
        </div>
      </div>
      {/* 포스터 풀스크린 라이트박스 — 핀치줌·더블탭·팬 */}
      {lightbox && schedule.posterUrl && (
        <ImageLightbox src={schedule.posterUrl} alt={`${schedule.title} 포스터`} onClose={() => setLightbox(false)} />
      )}
    </Modal>
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
        className="flex items-center justify-center gap-1.5 rounded-input border border-border-default bg-surface-high py-3 text-sm font-bold text-ink-secondary transition-colors hover:border-accent-400/50 hover:text-accent-300">
        <span aria-hidden>📅</span> 내 캘린더에 추가
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
        className="flex items-center justify-center gap-1.5 rounded-input border border-border-default bg-surface-high py-3 text-sm font-bold text-ink-secondary transition-colors hover:border-accent-400/50 hover:text-accent-300">
        <span aria-hidden>🔗</span> 공유 링크
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
      .then((name) => toast.show(`${name || '매장'} 참가(바인) 요청 전송! 운영자 승인을 기다려 주세요 🙋`, 'success'))
      .catch((e) => toast.show(e instanceof Error ? e.message : '요청 전송 실패', 'error'))
      .finally(() => setSending(false));
  };
  return (
    <div className="flex items-center gap-3 rounded-card border border-sky-500/30 bg-sky-500/[0.05] p-3">
      {qr && <img src={qr} alt="바인 요청 QR" width={72} height={72} decoding="async" className="shrink-0 rounded bg-white p-1" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-primary">🙋 지금 매장에서 참가 신청 <span className="font-normal text-ink-muted">· 오늘 · 현장</span></p>
        <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">매장에 도착한 뒤 눌러주세요. 운영자가 승인하면 <b className="text-ink-secondary">오늘 장부 명단</b>에 바로 등록됩니다.</p>
        {/* 오발신이 곧 운영자 장부 오염 + 업주 푸시 알림이라, 스치는 탭으로는 나가지 않게 꾹 누르기
            (예약 취소와 동일 패턴 — 확인 팝업보다 빠르면서 오작동엔 더 안전) */}
        <HoldToConfirmButton onConfirm={send} disabled={sending} holdingLabel="계속 누르세요…"
          className="btn-primary mt-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          {sending ? '전송 중…' : '🙋 꾹 눌러 참가 신청'}
        </HoldToConfirmButton>
      </div>
    </div>
  );
}

function ReserveBox({ scheduleId, ownerId, venueId, date, startTime, sched }: { scheduleId: string; ownerId?: string | null; venueId?: string | null; date: string; startTime: string; sched: Schedule }) {
  const { user } = useAuth();
  const toast = useToast();
  const [mine, setMine] = useState<Reservation | null>(null);
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
    <section className="rounded-card border border-accent-400/40 bg-gradient-to-br from-accent-300/[0.08] to-transparent p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        {/* 아래 '지금 매장에서 참가 신청'과 역할이 헷갈려 손님이 잘못 누르는 사고가 있어 제목에 역할을 박아둔다 */}
        <p className="text-sm font-bold text-accent-300">참가 예약 <span className="font-normal text-ink-muted">· 미리 자리 잡아두기</span></p>
        {mine && <span className="text-2xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-badge">예약 완료</span>}
        {!mine && ended && <span className="text-2xs font-bold text-ink-muted bg-surface-high border border-border-default px-2 py-0.5 rounded-badge">종료</span>}
      </div>
      {!mine && !ended && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="닉네임 또는 실명" maxLength={30} className="input w-full text-sm" />
      )}
      {/* 예약 성공 패널 — 완료 순간에 다음 행동을 제안(캘린더 등록·1시간 전 알림). 서버
          리마인더는 이미 예약자 전원에게 발송되므로, 여기의 '알림 받기'는 푸시 구독만 켠다. */}
      {justReserved && mine && (
        <div className="animate-fade-in space-y-2 rounded-input border border-emerald-500/40 bg-emerald-500/[0.07] p-3">
          <p className="text-sm font-bold text-emerald-400">🎉 예약 완료 · {ddayLabel} {startTime?.slice(0, 5)} 시작</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={addToCalendar}
              className="rounded-input border border-border-default bg-surface-high py-2.5 text-2xs font-bold text-ink-secondary hover:border-accent-400/50 hover:text-accent-300 transition-colors">
              📅 캘린더에 추가
            </button>
            {pushSupported() ? (
              <button type="button" onClick={enableReminderPush} disabled={pushOn}
                className={['rounded-input border py-2.5 text-2xs font-bold transition-colors',
                  pushOn ? 'border-emerald-500/40 text-emerald-400' : 'border-border-default bg-surface-high text-ink-secondary hover:border-accent-400/50 hover:text-accent-300'].join(' ')}>
                {pushOn ? '🔔 알림 켜짐 ✓' : '🔔 1시간 전 알림'}
              </button>
            ) : (
              <span className="flex items-center justify-center rounded-input border border-border-default bg-surface-high py-2.5 text-2xs text-ink-muted">⏰ 시작 1시간 전 알림 예정</span>
            )}
          </div>
          <button type="button" onClick={() => setJustReserved(false)}
            className="w-full py-1 text-center text-2xs font-bold text-ink-muted hover:text-ink-secondary">확인</button>
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
      <p className="text-[10px] text-ink-muted">
        {mine ? `예약자: ${mine.displayName}`
          : ended ? '이미 끝난 대회라 예약이 닫혔습니다. 다음 대회 일정을 확인해 주세요.'
          : status === 'live' ? '이미 시작한 대회입니다 — 레이트 레지 가능 여부는 매장에 확인해 주세요.'
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
                        <p className="truncate text-xs font-semibold text-ink-primary">{r.realName ? `${r.realName}(${r.nickname ?? '-'})` : (r.nickname ?? '비회원')}</p>
                        <p className="truncate text-[10px] text-ink-muted">예약명: {r.displayName}</p>
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">{fmtRes(r.createdAt)}</span>
                    </li>
                  ))}
                </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ── 정보 카드 ────────────────────────────────────────────────────────────────

// 포스터 기본 블라인드 구조 — 로티 파이널롤백 기반 템플릿. 기본 접힘, 클릭 시 펼침. 레지 마감(기본 16LV) 이후 25LV까지 표시.
function BlindStructure({ schedule }: { schedule: Schedule }) {
  const [open, setOpen] = useState(false);
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
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-input border border-border-subtle bg-surface-high px-3 py-2.5 text-left transition-colors hover:border-border-default">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-ink-primary shrink-0">블라인드</span>
          <span className="text-2xs text-ink-muted truncate">{custom && custom.length ? `맞춤 ${custom.filter((l) => !l.isBreak).length}레벨` : `레지 ${regClose}LV 마감 · ${dur}분 · ~25LV`}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div className="mt-2 overflow-hidden rounded-input border border-border-subtle animate-fade-in">
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
          <p className="bg-surface-base px-2 py-1.5 text-[10px] text-ink-muted">※ 매장 기본 구조 예시입니다. 실제 운영 시 변동될 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}

function InfoCard({
  icon, label, value, sub, compact = false,
}: {
  icon?: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={[
      'rounded-input bg-surface-high border border-border-subtle',
      compact ? 'px-2.5 py-2' : 'p-3',
    ].join(' ')}>
      <div className="flex items-center gap-1 text-2xs text-ink-muted mb-0.5">
        {icon && <span aria-hidden>{icon}</span>}{label}
      </div>
      <p className={[
        'font-bold text-ink-primary tabular-nums leading-tight',
        compact ? 'text-sm' : 'text-base',
      ].join(' ')}>
        {value}
      </p>
      {sub && (
        <p className={[
          'text-ink-muted mt-0.5 leading-snug',
          compact ? 'text-2xs' : 'text-2xs',
        ].join(' ')}>
          {sub}
        </p>
      )}
    </div>
  );
}
