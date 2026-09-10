// src/components/features/gto/MySpotList.tsx — 내 스팟(비공개 저장 목록)
//
// 목록 카드에는 강한 glow 를 반복하지 않는다 — 히어로와 리포트가 이미 빛나고 있고,
// 여기까지 빛나면 무엇을 먼저 볼지 알 수 없어진다(오너 지시 7 의 광량 단계).
import { useCallback, useEffect, useState } from 'react';
import Icon from '../../atoms/Icon';
import { MiniCard } from '../../atoms/HandCards';
import { useToast } from '../../atoms/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { spotSummary, streetLabel, actionLabel, type SpotReview } from '../../../lib/spot';
import { COVERAGE_LABEL } from '../../../lib/spotEvaluate';
import { listMySpots, deleteMySpot, type SavedSpot } from '../../../api/spots';

export default function MySpotList({ onOpen }: { onOpen: (s: SpotReview) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<SavedSpot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) { setRows([]); return; }
    listMySpots()
      .then((r) => { setRows(r); setFailed(false); })
      .catch(() => { setRows([]); setFailed(true); });
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    try {
      await deleteMySpot(id);
      setRows((r) => (r ?? []).filter((x) => x.id !== id));
      toast.show('삭제했습니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '삭제에 실패했습니다', 'error');
    } finally { setConfirmId(null); }
  };

  if (!user) {
    return (
      <Empty icon="lock" title="로그인하면 스팟을 저장할 수 있어요"
        desc="저장한 스팟은 나만 볼 수 있습니다. 공유하기 전까지 게시판에 올라가지 않아요." />
    );
  }
  // 스켈레톤 높이를 실제 카드와 맞춘다 — 값이 들어올 때 목록이 내려앉지 않게.
  if (rows === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-card bg-surface-high" />)}
      </div>
    );
  }
  if (failed) {
    return (
      <Empty icon="alert" title="목록을 불러오지 못했습니다"
        desc="잠시 뒤 다시 시도해 주세요. 저장된 스팟은 그대로 있습니다."
        action={<button type="button" onClick={load} className="btn-ghost min-h-[44px] px-4 text-xs">다시 시도</button>} />
    );
  }
  if (rows.length === 0) {
    return (
      <Empty icon="bookmark" title="아직 저장한 스팟이 없어요"
        desc="분석 탭에서 한 판을 입력하고 '내 스팟에 저장' 을 누르면 여기에 쌓입니다." />
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded-card border border-border-default bg-surface-mid p-2.5">
          <div className="flex items-start gap-2">
            <div className="flex shrink-0 gap-0.5" aria-label="내 카드">
              {r.spot.hero.length > 0
                ? r.spot.hero.map((c) => <MiniCard key={c} id={c} />)
                : <span className="text-2xs text-ink-muted">카드 없음</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-ink-primary">{spotSummary(r.spot)}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-ink-muted">
                <span className="rounded-badge bg-surface-high px-1.5 py-px font-semibold">{COVERAGE_LABEL[r.coverageKind]}</span>
                {r.spot.heroAction && <span>내 선택 {actionLabel(r.spot.heroAction)}</span>}
                {r.spot.board.length > 0 && <span>{streetLabel(r.spot.street)} {r.spot.board.length}장</span>}
              </p>
            </div>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={() => onOpen(r.spot)} className="btn-ghost min-h-[44px] flex-1 text-xs">
              다시 열기
            </button>
            {confirmId === r.id ? (
              <>
                <button type="button" onClick={() => remove(r.id)}
                  className="min-h-[44px] rounded-input border border-danger/40 bg-danger/10 px-3 text-xs font-bold text-danger">
                  정말 삭제
                </button>
                <button type="button" onClick={() => setConfirmId(null)}
                  className="min-h-[44px] rounded-input px-3 text-xs text-ink-muted">취소</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmId(r.id)} aria-label="스팟 삭제"
                className="flex h-[44px] w-[44px] items-center justify-center rounded-input text-ink-muted transition-colors hover:text-danger">
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Empty({ icon, title, desc, action }: {
  icon: 'lock' | 'bookmark' | 'alert'; title: string; desc: string; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border-default bg-surface-mid px-4 py-6 text-center">
      <Icon name={icon} size={22} className="mx-auto mb-2 text-ink-muted" aria-hidden />
      <p className="text-sm font-bold text-ink-primary">{title}</p>
      <p className="mx-auto mt-1 max-w-[22rem] text-2xs leading-relaxed text-ink-muted break-keep">{desc}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
