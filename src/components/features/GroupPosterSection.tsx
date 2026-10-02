// src/components/features/GroupPosterSection.tsx
// 그룹 포스터(오너 2026-10-02 B: "그룹도 포스터를 올릴 수 있게 — 그룹에 올라가는 건 상관없고, 일정에 올라가는 부분만 승인").
//  - 목록은 서버 RPC get_group_schedules(20261002h): 그룹 페이지 방문자 전체(비로그인 포함)가 본다 — 그룹 전용·공개 대기 포함.
//    반려된 것만 작성자·운영진·관리자. 전체 일정 피드에는 승인된 것만(서버 schedules_select).
//  - 등록·수정·삭제는 개설자·운영진(서버 can_post_group_poster)과 관리자. 그룹이 관리자 승인 전이면 서버가 막는다 — 여기서도 버튼을 감춘다.
//  - 일정 피드 노출(approved)은 서버 트리거가 정한다. 이 화면은 상태를 보여 줄 뿐 승인값을 만들지 않는다.
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { deleteSchedule, getGroupSchedules, type Schedule } from '../../api/schedules';
import type { Venue } from '../../api/community';
import type { PosterFormData, PosterSubmitResult } from './PosterFormModal';
import { msgOf } from '../../lib/dbError';

const PosterFormModal = lazy(() => import('./PosterFormModal'));

type SubmitPoster = (d: PosterFormData) => void | PosterSubmitResult | Promise<PosterSubmitResult>;

/** 포스터 공개 상태 — 서버 값(approved·feedRequest·rejectedAt)을 그대로 읽는다. */
function statusOf(s: Schedule): { label: string; cls: string } {
  if (s.approved) return { label: '일정 공개 중', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  if (s.feedRequest === false) return { label: '그룹 전용', cls: 'bg-surface-high text-ink-secondary border-border-default' };
  if (s.rejectedAt) return { label: '일정 공개 반려', cls: 'bg-danger/15 text-danger-light border-danger/30' };
  return { label: '일정 공개 요청 중', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
}

export default function GroupPosterSection({ group, canPost, onSubmitPoster }: {
  group: Venue;
  /** 개설자·운영진·관리자 — 서버도 같은 규칙(can_post_group_poster · 관리자). */
  canPost: boolean;
  onSubmitPoster?: SubmitPoster;
}) {
  const toast = useToast();
  const [items, setItems] = useState<Schedule[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  // undefined = 새 포스터, Schedule = 수정, null = 닫힘
  const [target, setTarget] = useState<Schedule | null | undefined>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    getGroupSchedules(group.id)
      .then((rows) => { if (alive) { setItems(rows); setErr(null); } })
      .catch((e) => { if (alive) setErr(e); });
    return () => { alive = false; };
  }, [group.id, tick]);

  const remove = async (s: Schedule) => {
    if (!window.confirm(`'${s.title}' 포스터를 삭제할까요?`)) return;
    try { await deleteSchedule(s.id); toast.show('포스터를 삭제했습니다', 'info'); reload(); }
    catch (e) { toast.show(msgOf(e, '삭제에 실패했습니다'), 'error'); }
  };

  const submit: SubmitPoster = async (d) => {
    const r = onSubmitPoster ? await onSubmitPoster(d) : undefined;
    reload();
    return r ?? { ok: true, saved: 1, total: 1 };
  };

  const postable = canPost && !!onSubmitPoster && group.approved;

  return (
    <div className="px-page-x py-3 border-b border-border-subtle" data-testid="group-posters">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-bold text-ink-primary">그룹 포스터</h3>
        {postable && (
          <button type="button" onClick={() => setTarget(undefined)} className="text-2xs font-semibold text-accent-200 hover:opacity-80">+ 포스터</button>
        )}
      </div>
      {canPost && !group.approved && (
        <p className="mb-1.5 text-2xs text-ink-muted">그룹이 관리자 승인을 받으면 포스터를 올릴 수 있습니다</p>
      )}
      {err != null ? (
        <LoadErrorCard error={err} what="그룹 포스터" onRetry={reload} />
      ) : items === null ? (
        <p className="py-1 text-2xs text-ink-muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="py-1 text-2xs text-ink-muted">등록된 포스터가 없습니다</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((s) => {
            const st = statusOf(s);
            return (
              <li key={s.id} data-testid="group-poster-row" className="flex items-center gap-2.5 rounded-input border border-border-subtle bg-surface-low p-2">
                <div className="h-14 w-10 shrink-0 overflow-hidden rounded-input"
                  style={s.posterUrl ? undefined : { background: `linear-gradient(135deg, ${s.posterColor ?? '#1a1d24'}ee, #0a0c0f)` }}>
                  {s.posterUrl && <img src={s.posterUrl} alt={`${s.title} 포스터`} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-primary">{s.title}</p>
                  <p className="truncate text-2xs text-ink-muted">
                    {s.date.slice(5).replace('-', '.')} {s.startTime} · 참가비 {s.buyIn.amount.toLocaleString()}원
                  </p>
                  <span data-testid="group-poster-status" className={['mt-0.5 inline-block rounded-badge border px-1 py-0.5 text-2xs font-semibold leading-none', st.cls].join(' ')}>{st.label}</span>
                  {canPost && s.rejectedAt && s.rejectReason && (
                    <p className="mt-0.5 text-2xs text-danger-light wrap-break-word">사유: {s.rejectReason}</p>
                  )}
                </div>
                {postable && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" onClick={() => setTarget(s)} className="h-8 rounded-input border border-border-default px-2 text-2xs font-semibold text-ink-secondary hover:text-accent-200">수정</button>
                    <button type="button" onClick={() => remove(s)} className="h-8 rounded-input px-2 text-2xs text-ink-muted hover:text-danger-light">삭제</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {target !== null && postable && (
        <Suspense fallback={null}>
          <PosterFormModal
            open
            schedule={target ?? null}
            group={{ id: group.id, name: group.name }}
            onClose={() => setTarget(null)}
            onSubmit={submit}
          />
        </Suspense>
      )}
    </div>
  );
}
