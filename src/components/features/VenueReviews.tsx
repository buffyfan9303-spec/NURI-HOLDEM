// 매장 후기·별점 — 소개 탭 하단. 체크인 인증자만 작성(서버 RLS), 매장당 1인 1후기(수정형).
import { useEffect, useMemo, useState } from 'react';
import { getVenueReviews, canReviewVenue, saveVenueReview, deleteVenueReview, type VenueReview } from '../../api/reviews';
import { useToast } from '../atoms/Toast';

interface Props {
  venueId: string;
  /** 로그인 사용자(null=비로그인) */
  userId: string | null;
  nickname: string | null;
  isAdmin?: boolean;
}

function Stars({ value, size = 14, onPick }: { value: number; size?: number; onPick?: (n: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5" role={onPick ? 'radiogroup' : undefined} aria-label={`별점 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" disabled={!onPick} onClick={() => onPick?.(n)}
          className={onPick ? 'p-0.5 active:opacity-80' : 'pointer-events-none'}
          aria-label={`${n}점`}
        >
          <svg width={size} height={size} viewBox="0 0 24 24"
            fill={n <= value ? '#FCD535' : 'none'} stroke={n <= value ? '#FCD535' : '#5E6673'}
            strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
            <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9 2.9-6z" />
          </svg>
        </button>
      ))}
    </span>
  );
}

export default function VenueReviews({ venueId, userId, nickname, isAdmin }: Props) {
  const toast = useToast();
  const [reviews, setReviews] = useState<VenueReview[] | null>(null);
  const [eligible, setEligible] = useState(false);
  const [writing, setWriting] = useState(false);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let on = true;
    getVenueReviews(venueId).then((r) => { if (on) setReviews(r); }).catch(() => { if (on) setReviews([]); });
    if (userId) canReviewVenue(venueId).then((v) => { if (on) setEligible(v); }).catch(() => {});
    return () => { on = false; };
  }, [venueId, userId]);

  const mine = useMemo(() => reviews?.find((r) => r.userId === userId) ?? null, [reviews, userId]);
  const avg = useMemo(() => {
    if (!reviews?.length) return 0;
    return Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10;
  }, [reviews]);

  const openForm = () => {
    setRating(mine?.rating ?? 5);
    setContent(mine?.content ?? '');
    setWriting(true);
  };
  const submit = async () => {
    setSaving(true);
    try {
      await saveVenueReview(venueId, rating, content, nickname ?? '회원');
      toast.show(mine ? '후기를 수정했습니다' : '후기를 남겼습니다 — 감사합니다!', 'success');
      setWriting(false);
      setReviews(await getVenueReviews(venueId));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '후기 저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (r: VenueReview) => {
    if (!window.confirm('이 후기를 삭제할까요?')) return;
    try {
      await deleteVenueReview(r.id);
      setReviews((prev) => prev?.filter((x) => x.id !== r.id) ?? prev);
      toast.show('후기를 삭제했습니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '삭제 실패', 'error');
    }
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <section className="space-y-2 border-t border-border-subtle pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-bold text-ink-primary">방문 후기</h3>
          {reviews && reviews.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-ink-secondary">
              <Stars value={Math.round(avg)} size={12} />
              <b className="tabular-nums text-gold-300">{avg.toFixed(1)}</b>
              <span className="text-ink-muted">({reviews.length})</span>
            </span>
          )}
        </div>
        {userId && (eligible || mine) && !writing && (
          <button type="button" onClick={openForm} className="btn-primary px-3 py-1.5 text-xs">
            {mine ? '내 후기 수정' : '후기 쓰기'}
          </button>
        )}
      </div>
      {/* 자격 안내 — 체크인 인증제(가짜 후기 차단) */}
      {userId && !eligible && !mine && (
        <p className="text-2xs text-ink-muted">매장 QR 체크인을 한 회원만 후기를 쓸 수 있어요(방문 인증제).</p>
      )}

      {writing && (
        <div className="space-y-2 rounded-card border border-gold-400/30 bg-gold-300/[0.04] p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-ink-secondary">별점</span>
            <Stars value={rating} size={22} onPick={setRating} />
            <b className="text-sm tabular-nums text-gold-300">{rating}.0</b>
          </div>
          <textarea
            value={content} onChange={(e) => setContent(e.target.value)} maxLength={300} rows={3}
            placeholder="매장 분위기, 운영, 토너 구성은 어땠나요? (선택, 300자)"
            className="input w-full resize-none text-sm leading-relaxed"
          />
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setWriting(false)} className="btn-ghost px-3 py-1.5 text-xs">취소</button>
            <button type="button" onClick={submit} disabled={saving} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-60">
              {saving ? '저장 중…' : mine ? '수정 완료' : '등록'}
            </button>
          </div>
        </div>
      )}

      {reviews === null ? (
        <p className="py-3 text-center text-2xs text-ink-muted">불러오는 중…</p>
      ) : reviews.length === 0 ? (
        <p className="py-3 text-center text-2xs text-ink-muted">아직 후기가 없어요 — 체크인하고 첫 후기를 남겨보세요!</p>
      ) : (
        <ul className="space-y-1.5">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-card border border-border-subtle bg-surface-high p-2.5">
              <div className="flex items-center gap-1.5">
                <Stars value={r.rating} size={12} />
                <span className="text-xs font-bold text-ink-primary">{r.nickname}</span>
                <span className="ml-auto text-2xs tabular-nums text-ink-muted">{fmt(r.createdAt)}</span>
                {(r.userId === userId || isAdmin) && (
                  <button type="button" onClick={() => remove(r)} className="text-2xs text-ink-muted hover:text-danger-light">삭제</button>
                )}
              </div>
              {r.content && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{r.content}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
