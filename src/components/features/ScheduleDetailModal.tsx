import { useState, useEffect } from 'react';
import Modal from '../atoms/Modal';
import CommentThread from './CommentThread';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import { getMyReservation, createReservation, cancelMyReservation, type Reservation } from '../../api/reservations';
import { prizeMainText } from './ScheduleCard';
import type { Schedule } from '../../api/schedules';
import type { Comment } from '../../api/community';
import { generateBlinds } from '../../api/clock';

interface ScheduleDetailModalProps {
  schedule: Schedule | null;
  open: boolean;
  onClose: () => void;
  onVenueClick: (venueId: string) => void;
  comments: Comment[];
  onSubmitComment: (content: string, parentId?: string) => void;
  onDeleteComment?: (commentId: string) => void;
  /** 관리자 마스터 삭제(포스터) */
  onDeletePoster?: (id: string) => void;
}

type Tab = 'info' | 'qna';

const SUITS = ['♠','♥','♦','♣'];
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export default function ScheduleDetailModal({
  schedule: scheduleProp, open, onClose, onVenueClick, comments, onSubmitComment, onDeleteComment, onDeletePoster,
}: ScheduleDetailModalProps) {
  const [tab, setTab] = useState<Tab>('info');
  const { user } = useAuth();

  // 닫힘 애니메이션이 끝날 때까지 직전 일정을 유지(시트가 아래로 슬라이드되며 닫히도록)
  const [shown, setShown] = useState<Schedule | null>(scheduleProp);
  useEffect(() => { if (scheduleProp) setShown(scheduleProp); }, [scheduleProp]);
  const schedule = scheduleProp ?? shown;

  if (!schedule) return null;

  const d = new Date(schedule.date);
  const dow = DAYS_KO[d.getDay()];
  const qnaComments = comments.filter((c) => c.scheduleId === schedule.id);

  return (
    <Modal open={open} onClose={onClose} maxWidth="lg" variant="page">
      {/* ── 포스터 헤더 ───────────────────────────────────────────────── */}
      <div className="relative">
        <div
          className={[
            'relative flex items-center justify-center overflow-hidden',
            // 실제 포스터 이미지가 있으면 전체를 보여주고(잘리지 않게),
            // 없으면 16:9 장식 배너로 표시
            schedule.posterUrl ? 'bg-surface-base' : 'aspect-[16/9] sm:aspect-[2/1]',
          ].join(' ')}
          style={schedule.posterUrl
            ? undefined
            : { background: `linear-gradient(135deg, ${schedule.posterColor ?? '#1a1d24'}ee 0%, #0a0c0f 100%)` }}
        >
          {schedule.posterUrl ? (
            <img
              src={schedule.posterUrl}
              alt={`${schedule.title} 포스터`}
              className="block w-full h-auto max-h-[82vh] object-contain"
            />
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

          {/* 상단 그라데이션 + 닫기 */}
          <div className="absolute top-0 left-0 right-0 h-20 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(10,12,15,0.7), transparent)' }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-surface-base/80 backdrop-blur text-ink-primary hover:bg-surface-high transition-colors z-10"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
            </svg>
          </button>

          {/* 상단 배지 */}
          <div className="absolute top-3 left-3 flex items-center gap-1 z-10">
            {schedule.isPremium && (
              <span className="rounded-badge bg-gold-300 px-2 py-0.5 text-xs font-bold text-ink-inverse leading-none">
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

        {/* 제목 영역 (포스터 아래) */}
        <div className="px-4 pt-4 pb-2">
          <h1 className={[
            'text-xl font-bold leading-tight',
            schedule.isPremium ? 'text-gold-300' : 'text-ink-primary',
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
              className="mt-1.5 inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-gold-300 transition-colors group"
            >
              <span className="font-medium underline decoration-dotted underline-offset-2">
                {schedule.pubName}
              </span>
              <span className="text-border-strong">·</span>
              <span>{schedule.region}</span>
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
            </p>
          )}
          {schedule.address && (
            <p className="mt-0.5 ml-5 text-xs text-ink-muted">{schedule.address}</p>
          )}
        </div>
      </div>

      {/* ── 탭바 (정보 / Q&A) — sticky 상단 고정 ────────────────── */}
      <div className="grid grid-cols-2 border-b border-border-subtle sticky top-0 bg-surface-mid z-10">
        {(['info', 'qna'] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={[
                'py-3 text-sm font-medium transition-colors text-center',
                'border-b-2 -mb-px',
                active
                  ? 'border-gold-300 text-gold-300'
                  : 'border-transparent text-ink-muted hover:text-ink-secondary',
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
        <div className="px-4 py-4">
          <CommentThread
            comments={qnaComments}
            onSubmit={onSubmitComment}
            onDelete={onDeleteComment}
            emptyText="이 토너먼트에 대해 첫 질문을 남겨보세요."
          />
        </div>
      ) : (
      <div className="px-4 pt-5 pb-6 space-y-6">

        {/* 예약하기 (첫 페이지) */}
        <ReserveBox scheduleId={schedule.id} />

        {/* 프라이즈 강조 박스 */}
        {(schedule.prizePool || schedule.prizePercent) && (
          <section className="rounded-card border border-gold-400/50 bg-gradient-to-br from-gold-300/10 to-transparent p-4">
            <p className="text-2xs uppercase tracking-wider text-gold-500 mb-1">{schedule.guaranteed ? '상금 풀' : '프라이즈'}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gold-300 tabular-nums leading-none">
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
              sub={schedule.buyIn.rebuy !== undefined ? (
                <>리바이 {schedule.buyIn.rebuy.toLocaleString()}
                  {schedule.buyIn.rebuyLimit ? `×${schedule.buyIn.rebuyLimit}` : ' 무제한'}
                  {schedule.buyIn.addon !== undefined && (
                    <> · 애드온 {schedule.buyIn.addon.toLocaleString()}</>
                  )}
                </>
              ) : '리바이 없음'}
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

        {/* 토너먼트 구조 (선택) */}
        {schedule.structure && (
          <section>
            <h3 className="text-sm font-semibold text-ink-primary mb-2">토너먼트 구조</h3>
            <div className="grid grid-cols-3 gap-2">
              <InfoCard
                label="시작 칩"
                value={schedule.structure.startingChips.toLocaleString()}
                compact
              />
              <InfoCard
                label="레벨"
                value={`${schedule.structure.blindLevelMinutes}분`}
                compact
              />
              {schedule.structure.lateRegLevels !== undefined && (
                <InfoCard
                  label="레이트 레지"
                  value={`${schedule.structure.lateRegLevels}레벨`}
                  compact
                />
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
                  className="flex items-center gap-2 px-3 py-2 rounded-input border border-gold-400/30 bg-gold-300/[0.04]"
                >
                  {p.badge && (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-badge bg-gold-300 text-ink-inverse text-2xs font-bold leading-none">
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
                          isTop3 ? 'text-gold-300 font-bold' : 'text-ink-secondary',
                        ].join(' ')}>
                          {rp.rank}
                        </td>
                        <td className={[
                          'px-3 py-1.5 text-right tabular-nums',
                          isTop3 ? 'text-gold-300 font-extrabold text-sm' : 'text-ink-primary font-semibold',
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
    </Modal>
  );
}

// ── 예약하기 박스 (1분 1회 제한) ──────────────────────────────────────────────
function ReserveBox({ scheduleId }: { scheduleId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [mine, setMine] = useState<Reservation | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setName(user?.nickname || user?.name || '');
    if (user) getMyReservation(scheduleId).then(setMine).catch(() => {});
    else setMine(null);
  }, [scheduleId, user]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const act = async () => {
    if (!user) { toast.show('로그인 후 예약할 수 있습니다', 'error'); return; }
    if (busy || cooldown > 0) return;
    setBusy(true);
    try {
      if (mine) { await cancelMyReservation(scheduleId); setMine(null); toast.show('예약을 취소했습니다', 'info'); }
      else {
        const n = (name.trim() || user.name || '예약자');
        await createReservation(scheduleId, n);
        setMine({ id: '', scheduleId, userId: user.id, displayName: n, createdAt: new Date().toISOString() });
        toast.show('예약되었습니다', 'success');
      }
      setCooldown(60); // 반복 클릭 방지: 1분 1회
    } catch (e) { toast.show(e instanceof Error ? e.message : '처리 실패', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-card border border-gold-400/40 bg-gradient-to-br from-gold-300/[0.08] to-transparent p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-gold-300">참가 예약</p>
        {mine && <span className="text-2xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-badge">예약 완료</span>}
      </div>
      {!mine && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="닉네임 또는 실명" maxLength={30} className="input w-full text-sm" />
      )}
      <button type="button" onClick={act} disabled={busy || cooldown > 0}
        className={['w-full py-3 rounded-input text-sm font-bold transition-colors disabled:opacity-60',
          mine ? 'bg-surface-high text-danger-light border border-danger/40 hover:bg-danger/10' : 'btn-primary'].join(' ')}>
        {cooldown > 0 ? `${cooldown}초 후 가능` : mine ? '예약 취소' : '예약하기'}
      </button>
      <p className="text-[10px] text-ink-muted">{mine ? `예약자: ${mine.displayName} · 반복 클릭 방지를 위해 변경 후 1분간 잠깁니다.` : '예약 후 1분간 다시 클릭할 수 없습니다.'}</p>
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
  const levels = generateBlinds(regClose, 25, dur, dur);

  let levelNo = 0;
  return (
    <section>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-input border border-border-subtle bg-surface-high px-3 py-2.5 text-left transition-colors hover:border-border-default">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-ink-primary shrink-0">블라인드 구조</span>
          <span className="text-2xs text-ink-muted truncate">레지 {regClose}LV 마감 · {dur}분 · ~25LV</span>
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
                    <tr key={i} className="bg-gold-300/[0.06] border-t border-border-subtle">
                      <td colSpan={4} className="py-1.5 px-2 text-center font-bold text-gold-300">BREAK · {l.minutes}분</td>
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
