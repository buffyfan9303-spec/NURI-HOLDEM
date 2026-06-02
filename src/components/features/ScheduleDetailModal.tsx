import { useState } from 'react';
import Modal from '../atoms/Modal';
import CommentThread from './CommentThread';
import { formatPrize } from './ScheduleCard';
import type { Schedule } from '../../api/schedules';
import type { Comment } from '../../api/community';

interface ScheduleDetailModalProps {
  schedule: Schedule | null;
  open: boolean;
  onClose: () => void;
  onVenueClick: (venueId: string) => void;
  comments: Comment[];
  onSubmitComment: (content: string, parentId?: string) => void;
  onDeleteComment?: (commentId: string) => void;
}

type Tab = 'info' | 'qna';

const SUITS = ['♠','♥','♦','♣'];
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export default function ScheduleDetailModal({
  schedule, open, onClose, onVenueClick, comments, onSubmitComment, onDeleteComment,
}: ScheduleDetailModalProps) {
  const [tab, setTab] = useState<Tab>('info');

  if (!schedule) return null;

  const d = new Date(schedule.date);
  const dow = DAYS_KO[d.getDay()];
  const qnaComments = comments.filter((c) => c.scheduleId === schedule.id);

  return (
    <Modal open={open} onClose={onClose} maxWidth="lg" variant="sheet" fillHeight>
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
          <button
            type="button"
            onClick={() => onVenueClick(schedule.venueId)}
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
      <div className="px-4 pb-6 space-y-5">

        {/* 프라이즈 강조 박스 */}
        {schedule.prizePool && (
          <section className="rounded-card border border-gold-400/50 bg-gradient-to-br from-gold-300/10 to-transparent p-4">
            <p className="text-2xs uppercase tracking-wider text-gold-500 mb-1">상금 풀</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gold-300 tabular-nums leading-none">
                {formatPrize(schedule.prizePool)}
              </span>
              <span className={[
                'text-sm font-bold tracking-wider rounded-badge px-2 py-0.5 border',
                schedule.guaranteed
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-surface-high text-ink-muted border-border-default',
              ].join(' ')}>
                {schedule.guaranteed ? 'GTD' : '예상'}
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
              sub={schedule.startTime}
            />
            <InfoCard
              label="진행 시간"
              value={schedule.duration}
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
          </div>
        </section>

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
              RANKING GTD
              <span className="text-2xs text-ink-muted font-normal">(단위: 만원)</span>
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
                          {rp.amount}만
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

// ── 정보 카드 ────────────────────────────────────────────────────────────────

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
