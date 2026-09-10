// src/components/features/community/SpotPostCard.tsx — 게시판에 올라온 NURI SPOT
//
// 오너 지시(2026-09-11): "스팟 토론은 누리 스팟 말고 게시판으로 보내서 게시판을 활성화."
// 그래서 토론의 **본체가 여기**다. 도구 안에는 피드를 두지 않고, 글은 게시판 '핸드 분석'
// 카테고리에 쌓인다(api/spots.ts 의 share_spot_post 가 p_category:'hand').
//
// 화면 순서가 곧 토론의 순서다:
//   ① 상황(스팟) 을 본다  → ② 폴드·콜·레이즈를 고른다(투표는 기존 post_polls 어태치먼트가
//   이미 담당한다 — 이 카드가 투표를 다시 만들지 않는다) → ③ 작성자가 상대 카드·결과를 연다.
//
// ⚠ 가림(reveal) 은 스포일러 장치다. 서버가 안 가리고 클라이언트가 지우기만 하면
//   devtools 로 그냥 보여서 투표가 무의미해진다. 그래서 20260911d 는 공유 시점에
//   상대 카드·결과·글쓴이의 선택을 spot 본문에서 빼내 hidden_* 컬럼에 넣고 그 컬럼의
//   SELECT 를 회수한다. 작성자가 열면 reveal_post_spot 이 본문으로 되돌려 넣는다.
import { useEffect, useState } from 'react';
import Icon from '../../atoms/Icon';
import { MiniCard } from '../../atoms/HandCards';
import { useToast } from '../../atoms/Toast';
import { writeSnap } from '../../../lib/snapshot';
import { spotSummary, streetLabel, actionLabel } from '../../../lib/spot';
import { COVERAGE_LABEL } from '../../../lib/spotEvaluate';
import { fetchPostSpot, revealPostSpot, type PostSpot } from '../../../api/spots';

type State = 'loading' | 'none' | 'error' | 'ok';

export default function SpotPostCard({ postId, isAuthor }: { postId: string; isAuthor: boolean }) {
  const toast = useToast();
  const [ps, setPs] = useState<PostSpot | null>(null);
  const [state, setState] = useState<State>('loading');
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetchPostSpot(postId)
      .then((r) => {
        if (!alive) return;                       // 글을 빨리 넘기면 옛 응답이 늦게 온다
        setPs(r);
        setState(r ? 'ok' : 'none');
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [postId]);

  // 스팟 글이 아니면 자리를 차지하지 않는다 — 일반 글·레거시 리플레이 글이 여기 걸린다.
  if (state === 'none') return null;
  // 스켈레톤 높이를 실제 카드와 맞춘다(CLS) — 값이 들어올 때 댓글이 밀려 내려가지 않게.
  if (state === 'loading') return <div className="mt-3 h-[132px] animate-pulse rounded-card bg-surface-high" />;
  if (state === 'error' || !ps) {
    return (
      <p className="mt-3 rounded-card border border-border-default bg-surface-mid px-3 py-2.5 text-2xs text-ink-muted">
        스팟을 불러오지 못했습니다. 글 내용은 그대로입니다.
      </p>
    );
  }

  const { spot } = ps;
  const hidden = !ps.revealVillain || !ps.revealResult;

  const reveal = async () => {
    setRevealing(true);
    try {
      await revealPostSpot(postId, true, true);
      setPs({ ...ps, revealVillain: true, revealResult: true });
      toast.show('분석을 공개했습니다', 'success');
      // 상대 카드·결과는 서버만 알고 있다 — 다시 받아야 화면에 들어온다.
      fetchPostSpot(postId).then((r) => { if (r) setPs(r); }).catch(() => { /* 표시는 이미 갱신됨 */ });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '공개에 실패했습니다', 'error');
    } finally { setRevealing(false); }
  };

  // 도구로 넘길 때는 스냅샷에 실어 보낸다 — NuriSpotPanel 이 마운트 시 tool:spot 을 읽는다.
  const analyze = () => {
    writeSnap('tool:spot', spot);
    window.dispatchEvent(new CustomEvent('nuri:open-tool', { detail: 'spot' }));
  };

  return (
    <section data-spot-post className="mt-3 rounded-card border border-border-default bg-surface-mid p-3">
      <header className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-badge border border-border-default bg-surface-high px-2 py-0.5 text-2xs font-semibold text-ink-secondary">
          <Icon name="spade" size={11} aria-hidden />NURI SPOT
        </span>
        <span data-spot-coverage={ps.coverageKind}
          className="rounded-badge bg-surface-high px-1.5 py-px text-2xs font-semibold text-ink-muted">
          {COVERAGE_LABEL[ps.coverageKind]}
        </span>
      </header>

      <p className="mt-2 text-xs font-bold text-ink-primary break-keep">{spotSummary(spot)}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Cards label="내 카드" ids={spot.hero} />
        {spot.board.length > 0 && <Cards label={streetLabel(spot.street)} ids={spot.board} />}
        {ps.revealVillain && spot.villain.length > 0 && <Cards label="상대" ids={spot.villain} />}
      </div>

      {/* 글쓴이의 선택은 결과가 열린 뒤에만. 먼저 보이면 "당신이라면?" 투표가 그 값에
          끌려간다 — 서버도 같은 시점에 내려준다(hidden_action). */}
      {ps.revealResult && spot.heroAction && (
        <p data-spot-heroaction className="mt-2 text-2xs text-ink-secondary">
          글쓴이의 선택 <b className="text-ink-primary">{actionLabel(spot.heroAction)}</b>
        </p>
      )}

      {/* 가려진 동안에는 **무엇이 가려졌는지**를 분명히 말한다 — 투표가 먼저인 이유가 된다. */}
      {hidden && (
        <p className="mt-2 flex items-start gap-1.5 rounded-input bg-surface-high px-2.5 py-1.5 text-2xs leading-relaxed text-ink-muted">
          <Icon name="lock" size={12} className="mt-px shrink-0" aria-hidden />
          <span>상대 카드 · 글쓴이의 선택 · 결과는 아직 가려져 있습니다. 먼저 골라 보고 분포를 확인하세요.</span>
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button type="button" onClick={analyze} className="btn-ghost min-h-[44px] px-3 text-xs">
          이 스팟 분석하기
        </button>
        {isAuthor && hidden && (
          <button type="button" onClick={reveal} disabled={revealing}
            className="min-h-[44px] rounded-input border border-accent-400/40 bg-accent-300/10 px-3 text-xs font-bold text-accent-200 disabled:opacity-60">
            {revealing ? '공개하는 중…' : '분석 공개'}
          </button>
        )}
      </div>

      <p className="mt-2 text-[10px] text-ink-muted">
        공유 시점 기준 · 데이터 버전 <span className="tabular-nums">{ps.datasetVersion}</span>
        {ps.sourceLabel ? ` · ${ps.sourceLabel}` : ''}
      </p>
    </section>
  );
}

function Cards({ label, ids }: { label: string; ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-2xs text-ink-muted">{label}</span>
      <span className="flex gap-0.5" aria-label={label}>
        {ids.map((c) => <MiniCard key={c} id={c} />)}
      </span>
    </div>
  );
}
