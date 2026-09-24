// src/components/features/gto/MySpotList.tsx — 내 스팟(비공개 저장 목록)
//
// 목록 카드에는 강한 glow 를 반복하지 않는다 — 히어로와 리포트가 이미 빛나고 있고,
// 여기까지 빛나면 무엇을 먼저 볼지 알 수 없어진다(오너 지시 7 의 광량 단계).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../atoms/Icon';
import { MiniCard } from '../../atoms/HandCards';
import { useToast } from '../../atoms/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { spotSummary, streetLabel, actionLabel, type SpotReview } from '../../../lib/spot';
import { COVERAGE_LABEL } from '../../../lib/spotEvaluate';
import { listMySpots, deleteMySpot, updateSpotPlayedOn, type SavedSpot } from '../../../api/spots';
import { listSpotAiReviews } from '../../../api/spotReview';
import SpotDetails from './SpotDetails';

/** 저장 시각(UTC ISO) → KST 날짜 — playedOn 이 없는 옛 행의 표시용(CalendarPanel 과 같은 한 줄, 2026-09-25). */
const kstDateOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

/** 코칭 맵이 같은가 — 둘 다 비었을 때도 같다(빈 결과마다 새 Map 을 넣어 두 번째 커밋을 만들던 자리). */
const sameAi = (a: Map<string, string>, b: Map<string, string>) =>
  a.size === b.size && [...b].every(([k, v]) => a.get(k) === v);

export default function MySpotList({ onOpen, onShare, onNew, active = true }: {
  /** 보이는 동안 true — 보일 때마다 **조용히** 다시 읽는다(받은 행은 유지, 스켈레톤은 첫 진입 1회). */
  active?: boolean;
  onOpen: (s: SpotReview) => void;
  /** 2026-09-14 오너 지시 — 저장한 스팟을 **여기서 바로** 게시판에 올린다.
   *  ⚠ 여기서 게시 RPC 를 부르지 않는다. 분석 탭으로 열면서 리포트의 **확인 시트**를 띄울 뿐이다.
   *     올라갈 본문을 먼저 보여 주고 메모를 고칠 기회를 주는 F16 계약을 우회하면 안 된다
   *     ('내 선택·메모' 칸은 사용자가 혼잣말로 적는 자리라 그대로 공개되면 사고다). */
  onShare: (s: SpotReview) => void;
  onNew: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<SavedSpot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  /** 인라인 상세는 **한 번에 하나만** 편다 — 여러 개가 열리면 목록이 길어져 스크롤이 무너진다. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** 끝난 AI 코칭(spot_review_id → 본문). 재열람은 테이블을 읽을 뿐이라 포인트가 들지 않는다. */
  const [ai, setAi] = useState<Map<string, string>>(() => new Map());

  /** 요청 세대 — 늦게 온 이전 응답이 새 응답을 덮지 않게. */
  const seq = useRef(0);
  /** 한 번이라도 목록을 받았나 — 그 뒤 재조회 실패는 보여 준 목록을 지우지 않는다. */
  const loaded = useRef(false);

  // 🔴 SPOT-MYSPOT-JANK(2026-09-24): 탭을 오갈 때마다 행을 버리고 스켈레톤부터 다시 그렸다.
  //   같은 목록이면 상태를 바꾸지 않는다(재렌더 0) — 바뀐 경우(새로 저장한 스팟)만 커밋한다.
  const load = useCallback(() => {
    const my = ++seq.current;
    if (!user) { setRows([]); return; }
    listMySpots()
      .then((r) => {
        if (my !== seq.current) return;
        loaded.current = true;
        setRows((prev) => (prev && JSON.stringify(prev) === JSON.stringify(r) ? prev : r));
        setFailed(false);
        return listSpotAiReviews(r.map((x) => x.id)).then(
          (m) => { if (my === seq.current) setAi((prev) => (sameAi(prev, m) ? prev : m)); },
          () => { /* 코칭이 없어도 목록은 선다 */ },
        );
      })
      .catch(() => {
        if (my !== seq.current || loaded.current) return;
        setRows([]); setFailed(true);
      });
  }, [user]);

  useEffect(() => { if (active) load(); }, [active, load]);

  /** 이미 저장한 스팟의 날짜만 바꾼다(오너 2026-09-25 SPOT-DATE) — 서버가 실제로 바뀐 뒤에만 목록을 갱신한다. */
  const setDate = useCallback(async (id: string, date: string) => {
    try {
      await updateSpotPlayedOn(id, date);
      setRows((r) => (r ?? []).map((x) => (x.id === id ? { ...x, playedOn: date } : x)));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '날짜를 바꾸지 못했습니다', 'error');
    }
  }, [toast]);

  const remove = useCallback(async (id: string) => {
    try {
      await deleteMySpot(id);
      seq.current++; // 진행 중인 재조회 응답이 방금 지운 행을 되살리지 않게
      setRows((r) => (r ?? []).filter((x) => x.id !== id));
      toast.show('삭제했습니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '삭제에 실패했습니다', 'error');
    } finally { setConfirmId(null); }
  }, [toast]);

  /** 부모 콜백은 최신 것을 ref 로 부른다 — 콜백 정체성이 바뀌어도 목록 메모가 깨지지 않게. */
  const cb = useRef({ onOpen, onShare, setDate });
  cb.current = { onOpen, onShare, setDate };
  // 목록 JSX 는 메모한다 — 탭을 오갈 때 active 만 바뀌면 행 10개를 다시 그리지 않는다(SPOT-MYSPOT-JANK).
  const list = useMemo(() => (!rows || rows.length === 0 ? null : (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded-aura border card-aura p-2.5">
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
                {ai.has(r.id) && <span className="inline-flex items-center gap-0.5 text-accent-200"><Icon name="sparkles" size={10} aria-hidden />AI 코칭</span>}
              </p>
            </div>
          </div>
          {/* 🔴 2026-09-22 요구 A — '다시 열기'(= 작성 폼으로 되돌림) 대신 **상세 보기**가 기본이다.
              오너: 저장한 스팟은 요약만 보이고 누르면 작성 폼으로 돌아가 버려서, 그때 무엇을 적었는지
              한 화면에서 읽을 수가 없었다. 목록 안에서 펼치는 인라인 상세를 둔다 —
              새 모달·중첩 시트를 만들지 않는다(뒤로가기 층이 늘고 keep-alive 와 얽힌다). */}
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={() => setExpandedId((id) => (id === r.id ? null : r.id))}
              aria-expanded={expandedId === r.id} aria-controls={`spot-detail-${r.id}`}
              className="btn-ghost min-h-[44px] flex-1 text-xs">
              {expandedId === r.id ? '접기' : '상세 보기'}
            </button>
            <button type="button" onClick={() => cb.current.onShare(r.spot)} className="btn-primary min-h-[44px] flex-1 text-xs">
              게시판에 공유
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
          {expandedId === r.id && (
            <div id={`spot-detail-${r.id}`} className="mt-2 rounded-input bg-surface-high px-2.5 py-1.5">
              {/* 저장 당시 스냅샷을 **그대로** 보여 준다 — 지금 엔진으로 다시 계산해
                  저장할 때와 다른 값을 보여 주지 않는다(명세 §2.4). */}
              <SpotDetails spot={r.spot} mode="owner" />
              {/* SPOT-DATE(2026-09-25) — 저장 뒤에도 날짜를 바꿀 수 있게. defaultValue + onChange 라 새로
                  고르기 전까지는 지금 값(playedOn 또는 저장일의 KST 날짜)을 그대로 보여준다. */}
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
                <label htmlFor={`spot-date-${r.id}`} className="shrink-0 text-2xs text-ink-muted">이 스팟 날짜</label>
                <input id={`spot-date-${r.id}`} type="date" defaultValue={r.playedOn ?? kstDateOf(r.createdAt)}
                  onChange={(e) => { if (e.target.value) cb.current.setDate(r.id, e.target.value); }}
                  className="h-[36px] min-w-0 flex-1 rounded-input border border-border-subtle bg-surface-high px-2 text-xs text-ink-primary" />
              </div>
              {ai.has(r.id) && (
                // 결과는 나만 본다 — 게시판 공유(onShare → 확인 시트)의 본문에는 실리지 않는다.
                <section data-testid="spot-ai-result" aria-label="AI 아쉬운 포인트" className="mt-2 border-t border-border-subtle pt-2">
                  <h4 className="text-2xs font-bold text-ink-secondary">AI 아쉬운 포인트 <span className="font-normal text-ink-muted">(나만 보여요)</span></h4>
                  <p className="mt-1 whitespace-pre-wrap break-keep text-xs leading-relaxed text-ink-primary">{ai.get(r.id)}</p>
                </section>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border-subtle pt-2">
                <button type="button" onClick={() => cb.current.onOpen(r.spot)} className="btn-ghost min-h-[44px] flex-1 text-xs">
                  수정하기
                </button>
                <button type="button" onClick={() => setExpandedId(null)} className="btn-ghost min-h-[44px] px-3 text-xs">
                  목록으로
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )), [rows, ai, expandedId, confirmId, remove]);

  if (!user) {
    return (
      <Empty icon="lock" title="로그인하면 스팟을 저장할 수 있어요"
        desc="저장한 스팟은 나만 볼 수 있습니다. '게시판에 공유'를 누르기 전까지 올라가지 않아요." />
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
    // design 실측(2026-09-14): 빈 카드 147px 아래 빈 여백이 화면의 51% 였고 다음 행동이 없었다.
    // 여백을 위아래로 나누고, 다음 행동(새 스팟 만들기)을 버튼으로 준다.
    // 2026-09-19 오너: "탭 위아래 공백이 너무 크다" — 예전 `min-h-[50svh]` 가운데 정렬(422px 상자에 204px 카드)이
    // 빈 카드 위아래에 각 109px 공백을 만들었다(390px 실측). 뷰포트 단위 자체를 뺀다 — 카드가 탭 바로 아래 온다.
    // (그 전의 `dvh` 되먹임 고리 문제(2026-09-15)는 단위가 없어졌으니 같이 사라진다.)
    return (
      <Empty icon="bookmark" title="아직 저장한 스팟이 없어요"
        desc="'스팟 작성' 탭에서 한 판을 입력하고 '내 스팟에 저장'을 누르면 여기에 쌓입니다."
        action={<button type="button" onClick={onNew} className="btn-primary min-h-[44px] px-4 text-xs">스팟 작성 탭에서 새로 만들기</button>} />
    );
  }

  return list;
}

function Empty({ icon, title, desc, action }: {
  icon: 'lock' | 'bookmark' | 'alert'; title: string; desc: string; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-aura border card-aura px-4 py-6 text-center">
      <Icon name={icon} size={22} className="mx-auto mb-2 text-ink-muted" aria-hidden />
      <p className="text-sm font-bold text-ink-primary">{title}</p>
      <p className="mx-auto mt-1 max-w-[22rem] text-2xs leading-relaxed text-ink-muted break-keep">{desc}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
