// src/components/features/gto/HandReviewTool.tsx
// 핸드 리플레이어 — '그 핸드' 복기 도구.
//
// 왜 도구 탭인가: 오프라인 홀덤펍 유저에겐 핸드히스토리 파일이 없다. 실제 행동은
// "버스트하고 나와서 그 핸드 따지기"인데, 그걸 할 수 있는 화면이 지금까지 **커뮤니티 글 안에만**
// 있었다(글을 써야만 리플레이가 생긴다). 글을 쓸 생각이 없는 사람은 도구 자체에 닿지 못했다.
//
// 새로 만든 것: 카드 입력 + 팟·액션 메모뿐이다. 재생·에퀴티 추이·아웃 카드 목록은
// 기존 HandReplayer 를 그대로 재사용한다(표시 로직 이중화 금지 — 글과 도구가 같은 화면이어야 한다).
//
// 커뮤니티 연결: 새 스키마를 만들지 않는다. lib/hand.encodeReplay 가 뱉는 기존 [[REPLAY:...]]
// 마커를 그대로 복사해 글쓰기 폼으로 넘긴다 — 붙여넣으면 글 상세에서 같은 리플레이가 뜬다.
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import HandReplayer from '../HandReplayer';
import { CalcCard } from '../tools/calcUi';
import Icon from '../../atoms/Icon';
import { useToast } from '../../atoms/Toast';
import { encodeReplay, type ReplayData } from '../../../lib/hand';
import { openPostForm } from '../../../lib/requireLogin';
import { writeSnap } from '../../../lib/snapshot';
import HandBoardPicker from './HandBoardPicker';
import { useHandBoard } from './useHandBoard';

export const REPLAY_SNAP = 'tool:replay';

export interface HandReviewInit {
  hero?: string[];
  villain?: string[];
  board?: string[];
  pot?: string;
  actions?: { pre?: string; flop?: string; turn?: string; river?: string };
}

/** 진입 즉시 볼 것이 있어야 한다 — A♠K♠(넛 플러시 드로우) vs QQ(플랍 셋), 리버에 스페이드. */
const DEMO: HandReviewInit = {
  hero: ['As', 'Ks'],
  villain: ['Qh', 'Qd'],
  board: ['Qs', '7s', '2h', '9c', 'Js'],
  actions: { pre: '내가 3벳, 상대 콜', flop: '상대 체크, 내가 벳, 상대 콜', turn: '둘 다 체크', river: '상대 벳, 내가 레이즈' },
};

const STREETS = [['pre', '프리플랍'], ['flop', '플랍'], ['turn', '턴'], ['river', '리버']] as const;

export default function HandReviewTool({ initial }: { initial?: HandReviewInit }) {
  const toast = useToast();
  const potId = useId();
  const actId = useId();
  const init = useMemo(() => (initial && (initial.hero?.length ?? 0) > 0 ? initial : DEMO), [initial]);

  const hb = useHandBoard(5, init);
  const [pot, setPot] = useState(init.pot ?? '');
  const [acts, setActs] = useState({
    pre: init.actions?.pre ?? '', flop: init.actions?.flop ?? '',
    turn: init.actions?.turn ?? '', river: init.actions?.river ?? '',
  });
  /** 클립보드가 막힌 환경(비-HTTPS 웹뷰 등) 폴백 — 코드를 눈에 보이게 꺼내 직접 복사하게 한다 */
  const [fallbackCode, setFallbackCode] = useState<string | null>(null);

  const heroKey = hb.ids.hero.join(',');
  const villainKey = hb.ids.villain.join(',');
  const boardKey = hb.ids.board.join(',');

  const replay: ReplayData = useMemo(() => ({
    hero: hb.ids.hero, villain: hb.ids.villain, board: hb.ids.board,
    pot: pot.trim() || undefined,
    actions: {
      pre: acts.pre.trim() || undefined, flop: acts.flop.trim() || undefined,
      turn: acts.turn.trim() || undefined, river: acts.river.trim() || undefined,
    },
  }), [hb.ids.hero, hb.ids.villain, hb.ids.board, pot, acts]);

  // 마지막 복기 보존 — 재방문 시 '그 핸드'로 돌아온다. 타이핑마다 쓰지 않게 400ms 뒤로 미룬다.
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      writeSnap(REPLAY_SNAP, {
        hero: heroKey ? heroKey.split(',') : [], villain: villainKey ? villainKey.split(',') : [],
        board: boardKey ? boardKey.split(',') : [], pot, actions: acts,
      } satisfies HandReviewInit);
    }, 400);
    return () => { if (saveRef.current) clearTimeout(saveRef.current); };
  }, [heroKey, villainKey, boardKey, pot, acts]);

  const hasHand = hb.heroCards.length > 0 || hb.boardCards.length > 0;
  const canAttach = hb.heroCards.length === 2 || hb.boardCards.length >= 3;

  // 커뮤니티로 — 기존 마커를 복사하고 글쓰기 폼(핸드 분석)을 연다. 새 저장 경로를 만들지 않는다.
  const toCommunity = async () => {
    const code = encodeReplay('', replay).trim();
    try {
      await navigator.clipboard.writeText(code);
      setFallbackCode(null);
      toast.show('핸드를 복사했어요 — 글 본문 맨 끝에 붙여넣으면 리플레이로 올라갑니다', 'success');
    } catch {
      // 복사 실패(비-HTTPS 웹뷰 등) — 코드를 화면에 꺼내고 글쓰기 폼은 열지 않는다.
      // 여기서 폼을 열면 그 폼이 코드를 덮어 사용자가 복사할 방법이 사라진다.
      setFallbackCode(code);
      toast.show('복사가 막혀 있어요 — 아래 코드를 직접 복사한 뒤 다시 눌러주세요', 'error');
      return;
    }
    openPostForm('hand');
  };

  const resetAll = () => {
    hb.clear();
    setPot('');
    setActs({ pre: '', flop: '', turn: '', river: '' });
    setFallbackCode(null);
  };

  return (
    <div className="space-y-3">
      <CalcCard desc="그 핸드를 카드로 놓고 스트리트별로 다시 돌려봅니다 — 승률 추이와 아웃 카드는 앱이 계산합니다">
        <HandBoardPicker hb={hb} hint={<>보드는 플랍 3장부터 리버 5장까지</>} />
      </CalcCard>

      {/* 리플레이 — 커뮤니티 글 상세와 완전히 같은 컴포넌트. 카드가 바뀌면 처음(프리플랍)부터 다시. */}
      <div className="space-y-2">
        <p className="text-2xs font-bold text-ink-secondary">리플레이 미리보기</p>
        {hasHand ? (
          <div className="flex justify-center">
            <HandReplayer key={`${heroKey}|${villainKey}|${boardKey}`} replay={replay} />
          </div>
        ) : (
          <p className="rounded-aura border card-aura px-3 py-6 text-center text-2xs leading-relaxed text-ink-muted">
            내 핸드 2장부터 골라 보세요. 상대 핸드까지 넣으면 스트리트별 승률 추이와 아웃 카드가 함께 나옵니다.
          </p>
        )}
      </div>

      {/* 팟·스트리트 액션 — 글쓰기 폼의 리플레이 입력과 같은 필드(같은 데이터가 두 문법이면 그게 버그다) */}
      <CalcCard>
        <div className="grid grid-cols-[3.75rem_1fr] items-center gap-x-2 gap-y-1.5">
          <label htmlFor={potId} className="text-2xs font-bold text-ink-secondary">팟</label>
          <input id={potId} type="text" value={pot} onChange={(e) => setPot(e.target.value)} maxLength={20}
            placeholder="예: 12.5bb, 34만" className="input w-full text-sm" />
          {STREETS.map(([k, lab]) => (
            <Fragment key={k}>
              <label htmlFor={`${actId}-${k}`} className="text-2xs font-bold text-ink-secondary">{lab}</label>
              <input id={`${actId}-${k}`} type="text" value={acts[k]} maxLength={80}
                onChange={(e) => setActs((p) => ({ ...p, [k]: e.target.value }))}
                placeholder="예: 내가 2.5bb 오픈, 상대 콜" className="input w-full text-sm" />
            </Fragment>
          ))}
        </div>
        <p className="text-2xs leading-relaxed text-ink-muted">액션 메모는 선택입니다 — 비워두면 카드만 재생됩니다.</p>
      </CalcCard>

      <div className="space-y-2 rounded-aura border card-aura p-3">
        <button
          type="button"
          disabled={!canAttach}
          onClick={toCommunity}
          className="btn-primary flex h-10 w-full items-center justify-center gap-1.5 text-sm font-bold disabled:opacity-40"
        >
          <Icon name="comment" size={15} className="shrink-0" aria-hidden />
          이 핸드로 글쓰기 — 커뮤니티에 물어보기
        </button>
        <p className="text-2xs leading-relaxed text-ink-muted">
          핸드가 클립보드에 복사되고 글쓰기 폼이 열립니다. <b className="text-ink-secondary">본문 맨 끝에 붙여넣으면</b> 글에서도 같은 리플레이가 재생됩니다.
        </p>
        {fallbackCode && (
          <input
            readOnly
            value={fallbackCode}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="핸드 코드 — 길게 눌러 복사하세요"
            className="input w-full text-2xs tabular-nums"
          />
        )}
        <div className="flex justify-end">
          <button type="button" onClick={resetAll} className="text-2xs font-semibold text-ink-muted transition-colors hover:text-danger-light">
            전부 초기화
          </button>
        </div>
      </div>

      <a href="#tool=outs" className="block px-1 text-2xs font-semibold text-accent-300 transition-colors hover:text-accent-200">
        아웃 개수만 빠르게 — 아웃츠 계산기 →
      </a>
    </div>
  );
}
