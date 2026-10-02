// src/components/features/community/SpotPostCard.tsx — 게시판에 올라온 NURI SPOT
//
// 오너 지시(2026-09-11): "스팟 토론은 누리 스팟 말고 게시판으로 보내서 게시판을 활성화."
// 그래서 토론의 **본체가 여기**다. 도구 안에는 피드를 두지 않고, 글은 게시판 '핸드 분석'
// 카테고리에 쌓인다(api/spots.ts 의 share_spot_post 가 p_category:'hand').
//
// 🔴 2026-10-01 오너 "공유해서 서로서로 보기 좋아야 하는데 지금은 너무 조잡해" → 시안 A(테이블 그림) 채택.
//   정본 캡처: 문서 폴더 spot-share-design/proto/a-detail-mw-hidden-dark.png.
//   화면 순서가 곧 토론의 순서다: ① 테이블·진행(상황) → ② 투표(당신이라면?) → ③ 작성자가 상대 카드·결과를 연다.
//   투표는 기존 post_polls 어태치먼트(PostAttachments)를 **카드 안으로 옮겨** 그대로 쓴다 — 새로 만들지 않는다.
//   스팟 글이 아니면 투표는 예전 자리(본문 아래)에 그대로 선다.
//
// ⚠ 가림(reveal) 은 스포일러 장치다. 서버가 안 가리고 클라이언트가 지우기만 하면
//   devtools 로 그냥 보여서 투표가 무의미해진다. 그래서 20260911d 는 공유 시점에
//   상대 카드·결과·글쓴이의 선택을 spot 본문에서 빼내 hidden_* 컬럼에 넣고 그 컬럼의
//   SELECT 를 회수한다. 작성자가 열면 reveal_post_spot 이 본문으로 되돌려 넣는다.
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../atoms/Toast';
import { writeSnap } from '../../../lib/snapshot';
import { fetchPostSpot, revealPostSpot } from '../../../api/spots';
import type { Attachment, PollOption } from '../../../api/postAttachments';
import PostAttachments from '../PostAttachments';
import { spotFromEmbed, type EmbeddedSpot } from './spotShare/embeddedSpot';
import { fitPollOptions, shareView, voteChoices } from './spotShare/shareView';
import { RevealBlock } from './spotShare/ShareParts';
import { SpotTableDetail } from './spotShare/SpotTable';
import { msgOf } from '../../../lib/dbError';

type State = 'loading' | 'none' | 'error' | 'ok';
type OnVote = (pollId: string, optionId: string) => Promise<PollOption[]>;

/**
 * @param expectSpot 이 글이 **스팟 글일 것으로 아는가**. 로딩 중 자리를 예약할지를 정한다.
 *   기본 false — 모르면 자리를 잡지 않는다. 잘못 예약한 자리는 사라질 때 아래를 통째로 튀게 한다.
 * @param initial 목록 쿼리에 끼워 받은 post_spots 행(CommunityPost.spotEmbed).
 *   있으면 첫 프레임부터 그린다(스켈레톤 없음) · null 이면 스팟 글이 아니라고 알고 요청하지 않는다 · undefined 면 모른다.
 * @param attachment·onVote 게시글 투표 — 스팟 글이면 카드 안에, 아니면 예전 자리에 그린다.
 */
export default function SpotPostCard({ postId, isAuthor, expectSpot = false, initial, attachment, onVote }: {
  postId: string; isAuthor: boolean; expectSpot?: boolean; initial?: unknown;
  attachment?: Attachment | null; onVote?: OnVote;
}) {
  const toast = useToast();
  const [ps, setPs] = useState<EmbeddedSpot | null>(() => spotFromEmbed(initial));
  const [state, setState] = useState<State>(() => stateOf(initial));
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    const embedded = spotFromEmbed(initial);
    setPs(embedded);
    setState(stateOf(initial));
    if (initial !== undefined && !embedded) return;   // 목록이 '스팟 글 아님' 을 이미 알려 줬다
    let alive = true;
    // 끼워 받은 값이 있어도 한 번 새로 받는다 — 목록을 받은 뒤 작성자가 공개했을 수 있다(그동안은 받은 값으로 그린다).
    fetchPostSpot(postId)
      .then((r) => {
        if (!alive) return;                       // 글을 빨리 넘기면 옛 응답이 늦게 온다
        if (r) { setPs(r); setState('ok'); } else if (!embedded) setState('none');
      })
      .catch(() => { if (alive && !embedded) setState('error'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 글이 바뀔 때만 다시 받는다(initial 은 그 글의 목록 값)
  }, [postId]);

  // 투표 보기를 상황에 맞춘다(체크 뒤면 체크·벳). 서버가 고정값을 넣은 글만 이름을 바꾼다 — shareView.fitPollOptions.
  const choices = ps ? voteChoices(ps.spot) : null;
  const choiceKey = choices?.join() ?? '';
  const fitted = useMemo<Attachment | null | undefined>(() => (
    attachment?.kind === 'poll' && choices
      ? { ...attachment, options: fitPollOptions(attachment.options, choices) }
      : attachment
    // eslint-disable-next-line react-hooks/exhaustive-deps -- choices 는 choiceKey 로 대표한다
  ), [attachment, choiceKey]);
  const fittedVote = useMemo<OnVote | undefined>(() => (
    onVote && choices ? async (pId, oId) => fitPollOptions(await onVote(pId, oId), choices) : onVote
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [onVote, choiceKey]);

  // 스팟 글이 아닐 때 투표가 서는 예전 자리(본문 아래 mt-3).
  const plainAttachment = attachment
    ? <div className="mt-3"><PostAttachments key={postId} attachment={attachment} onVote={onVote} /></div>
    : null;

  // 스팟 글이 아니면 자리를 차지하지 않는다 — 일반 글·레거시 리플레이 글이 여기 걸린다.
  if (state === 'none') return plainAttachment;
  // 🔴 2026-09-19 오너: "게시판 글을 누르면 아직도 로드가 느린건지 지지직 하면서 올라가".
  //   근본원인이 **이 스켈레톤이었다.** 빈 상자를 PostDetailModal 이 **모든 글에** 무조건 그렸고,
  //   스팟이 아니면 null 로 사라지면서 반응행·댓글·이전/다음이 통째로 위로 튀었다(LayoutShift 0.0806).
  //   ⚠ 자리 예약 자체는 옳다 — **스팟 글일 때만** 예약해야 한다. 카테고리는 서버가 보장하는 선행 신호다.
  //   2026-10-01: 목록에서 스팟을 끼워 받으므로(initial) 게시판에서 연 글은 이 경로를 거의 타지 않는다.
  if (state === 'loading') {
    return expectSpot ? <div className="mt-3 h-[132px] animate-pulse rounded-aura bg-surface-high" /> : plainAttachment;
  }
  if (state === 'error' || !ps) {
    return (
      <>
        <p className="mt-3 rounded-aura border card-aura px-3 py-2.5 text-2xs text-ink-muted">
          스팟을 불러오지 못했습니다. 글 내용은 그대로입니다.
        </p>
        {plainAttachment}
      </>
    );
  }

  const { spot } = ps;
  const hidden = !ps.revealVillain || !ps.revealResult;
  const v = shareView(spot, hidden === false);

  const reveal = async () => {
    setRevealing(true);
    try {
      await revealPostSpot(postId, true, true);
      setPs({ ...ps, revealVillain: true, revealResult: true });
      toast.show('분석을 공개했습니다', 'success');
      // 상대 카드·결과는 서버만 알고 있다 — 다시 받아야 화면에 들어온다.
      fetchPostSpot(postId).then((r) => { if (r) setPs(r); }).catch(() => { /* 표시는 이미 갱신됨 */ });
    } catch (e) {
      toast.show(msgOf(e, '공개에 실패했습니다'), 'error');
    } finally { setRevealing(false); }
  };

  // 도구로 넘길 때는 스냅샷에 실어 보낸다 — NuriSpotPanel 이 마운트 시 tool:spot 을 읽는다.
  const analyze = () => {
    writeSnap('tool:spot', spot);
    window.dispatchEvent(new CustomEvent('nuri:open-tool', { detail: 'spot' }));
  };

  return (
    <section data-spot-post className="mt-3">
      <SpotTableDetail
        v={v}
        poll={fitted ? <PostAttachments key={postId} attachment={fitted} onVote={fittedVote} /> : undefined}
        reveal={(
          <RevealBlock v={v} revealButton={isAuthor && hidden ? (
            <button type="button" onClick={reveal} disabled={revealing} aria-label="상대 카드·내 선택·결과 공개"
              className="min-h-[44px] shrink-0 rounded-input border border-accent-400/40 bg-accent-300/10 px-3 text-xs font-bold text-accent-200 disabled:opacity-60">
              {revealing ? '공개하는 중…' : '공개'}
            </button>
          ) : undefined} />
        )}
        footer={(
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={analyze} className="btn-ghost min-h-[44px] px-3 text-xs">
              내 스팟으로 가져오기
            </button>
          </div>
        )}
      />
    </section>
  );
}

function stateOf(initial: unknown): State {
  if (initial === undefined) return 'loading';
  return spotFromEmbed(initial) ? 'ok' : 'none';
}
