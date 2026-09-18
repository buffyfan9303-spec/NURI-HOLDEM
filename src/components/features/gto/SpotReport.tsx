// src/components/features/gto/SpotReport.tsx — 스팟 리포트
//
// 정보 순서가 이 화면의 전부다(오너 지시 6-5):
//   ① 내 선택 · 평가 상태 · 기준 액션 · 분석 등급   ← 먼저 보이는 것
//   ② 액션별 빈도(가로 누적 막대) 또는 수학 지표
//   ③ 왜 그런지 · 가정 · 데이터 출처와 버전
//   ④ 저장 · 비슷한 스팟 · 스팟 토론에 공유
//
// ⚠ '어그레션 차트' 같은 해석이 어려운 그림은 쓰지 않는다. 폴드·콜·레이즈 누적 막대 하나로
//   끝내고, 퍼센트와 액션명은 **막대 밖에서도** 읽히게 목록으로 함께 적는다(작은 화면·색맹 대응).
import { useEffect, useState } from 'react';
import Icon from '../../atoms/Icon';
import Modal from '../../atoms/Modal';
import { ensureLogin } from '../../../lib/requireLogin';
import type { useToast } from '../../atoms/Toast';
import type { useAuth } from '../../../contexts/AuthContext';
import { actionLabel, spotSummary, type SpotReview } from '../../../lib/spot';
import {
  COVERAGE_LABEL, VERDICT_LABEL,
  type SpotEvaluation, type CoverageKind, type Verdict, type ActionMix,
} from '../../../lib/spotEvaluate';
import { writeSnap } from '../../../lib/snapshot';
import { saveMySpot, shareSpotPost } from '../../../api/spots';
import { gotoBoardPost } from '../../../lib/spotNav';
import { buildShareBody, spotWithNote } from './spotShareBody';

/** 등급별 색 — **색만으로 의미를 전하지 않는다.** 항상 라벨·아이콘과 함께 쓴다. */
/** led = [data-aura-variant](index.css) — 인라인 rgb 링은 라이트·고대비·강제색에서 못 껐다(2026-09-18). unsupported 는 LED 없음. */
const COVERAGE_TONE: Record<CoverageKind, { led: 'violet' | 'cyan' | 'amber' | null; text: string; icon: 'microscope' | 'table' | 'scale' | 'sigma' | 'info' }> = {
  exact_solver:         { led: 'violet', text: 'text-accent-200', icon: 'microscope' },
  chart_nash:           { led: 'cyan',   text: 'text-aura-300',   icon: 'table' },
  normalized_reference: { led: 'amber',  text: 'text-amber-200',  icon: 'scale' },
  math_only:            { led: 'amber',  text: 'text-amber-200',  icon: 'sigma' },
  unsupported:          { led: null,     text: 'text-ink-muted',  icon: 'info' },
};

const VERDICT_TONE: Record<Verdict, string> = {
  good: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/35',
  mixed: 'bg-accent-300/12 text-accent-200 border-accent-400/35',
  improve: 'bg-rose-500/12 text-rose-300 border-rose-500/35',
  reference: 'bg-amber-500/12 text-amber-200 border-amber-500/35',
  math: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
  out_of_scope: 'bg-surface-high text-ink-muted border-border-default',
};

const MIX_TONE: Record<keyof ActionMix, { bar: string; dot: string; label: string }> = {
  fold: { bar: 'bg-slate-500', dot: 'bg-slate-500', label: '폴드' },
  call: { bar: 'bg-aura-300', dot: 'bg-aura-300', label: '콜' },
  raise: { bar: 'bg-accent-300', dot: 'bg-accent-300', label: '레이즈' },
};

interface Props {
  spot: SpotReview;
  evaluation: SpotEvaluation;
  calculating: boolean;
  blocked: boolean;
  /** 2026-09-14: 저장 목록(MySpotList)에서 "공유"로 열었을 때 증가하는 신호.
   *  ⚠ 여기서 **게시하지 않는다** — 기존 확인 시트(onShare)를 열 뿐이다.
   *     저장 목록에 shareSpotPost 를 직접 붙이면 F16 이 세운 "올라갈 본문을 먼저 보여 준다"는
   *     계약을 우회하는 두 번째 게시 경로가 생긴다. 그래서 진입점만 늘리고 경로는 하나로 둔다. */
  shareIntent?: number;
  user: ReturnType<typeof useAuth>['user'];
  toast: ReturnType<typeof useToast>;
}

export default function SpotReport({ spot, evaluation, calculating, blocked, user, toast, shareIntent = 0 }: Props) {
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [saved, setSaved] = useState(false);
  /** 공유 확인 시트가 떠 있는가 — 이게 true 인 동안에도 아직 올라간 글은 없다. */
  const [confirming, setConfirming] = useState(false);
  /** 시트에서 고치는 메모. 원본 spot 은 건드리지 않는다(내 스팟 임시저장을 흔들지 않게). */
  const [draftNote, setDraftNote] = useState('');
  const tone = COVERAGE_TONE[evaluation.kind];

  const onSave = async () => {
    if (!ensureLogin(user)) return;
    setBusy('save');
    try {
      await saveMySpot(spot, evaluation);
      setSaved(true);
      toast.show('내 스팟에 저장했습니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장에 실패했습니다', 'error');
    } finally { setBusy(null); }
  };

  // 트레이너로 넘길 때는 스냅샷에 실어 보낸다 — ToolsPanel 의 case 'trainer' 가 읽는다.
  // 참조한 표의 **그 문제**를 그대로 낸다(makeQuiz 의 키 복원).
  const onDrill = () => {
    if (!('drill' in evaluation) || !evaluation.drill) return;
    writeSnap('tool:trainer', evaluation.drill);
    window.dispatchEvent(new CustomEvent('nuri:open-tool', { detail: 'trainer' }));
  };

  // ⚠ 공유 버튼은 **아무것도 올리지 않는다**(F16, 2026-09-13).
  //   예전에는 이 버튼이 곧장 shareSpotPost 를 불렀다. 그런데 본문은 클라이언트가 짓고
  //   '내 선택 · 메모' 칸이 그대로 공개 본문이 된다 — 그 칸의 안내문이 "왜 그렇게 했는지,
  //   무엇이 고민이었는지" 라 사용자는 **혼잣말을 쓴다고 생각한다**. 게시 뒤 삭제는 있지만
  //   실시간 구독으로 이미 남에게 보인 뒤다. 그래서 올라갈 본문을 먼저 보여 주고,
  //   그 자리에서 메모를 고치거나 지울 수 있게 한 뒤에야 사용자가 게시를 누른다.
  const onShare = () => {
    if (!ensureLogin(user)) return;
    setDraftNote(spot.note?.trim() ?? '');
    setConfirming(true);
  };

  // 저장 목록에서 '공유'로 들어오면 **여기서** 확인 시트를 연다.
  // ⚠ 게시는 여전히 onConfirmShare 한 곳뿐이다 — 진입점만 늘리고 경로는 하나로 둔다(F16 계약).
  // ⚠ 계산이 끝난 뒤에 연다. 계산 중에 열면 시트가 **비어 있거나 이전 스팟의 본문**을 보여 준다.
  // ⚠ blocked(입력 미완성)면 열지 않는다 — 올릴 수 없는 상태에서 시트만 뜨면 막다른 길이다.
  useEffect(() => {
    if (!shareIntent || calculating || blocked) return;
    if (!ensureLogin(user)) return;
    setDraftNote(spot.note?.trim() ?? '');
    setConfirming(true);
    // spot 은 의도적으로 의존성에서 뺀다 — 메모를 고칠 때마다 시트가 다시 열리면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareIntent, calculating, blocked, user]);

  // 취소는 시트만 닫는다 — 여기에는 네트워크 호출이 하나도 없다(공개 글 0).
  const onCancelShare = () => {
    if (busy === 'share') return;   // 올라가는 중에는 닫지 않는다(결과를 못 보는 유령 게시 방지)
    setConfirming(false);
  };

  // 실제 게시. 저장 요청은 **RPC 한 번 그대로** — 확인 단계를 끼웠다고 쪼개지 않는다
  // (share_spot_post 가 글·스팟·투표를 한 트랜잭션에 만든다. 나누면 부분 성공이 생긴다).
  const onConfirmShare = async () => {
    setBusy('share');
    try {
      const postId = await shareSpotPost(spotWithNote(spot, draftNote), evaluation);
      setConfirming(false);
      toast.show('스팟 토론에 올렸습니다', 'success');
      // 여기서 멈추면 사용자는 **자기 글을 끝내 보지 못한다** — 올라갔는지도 알 수 없다.
      // 게시판으로 넘어가 방금 만든 글을 연다(오너 지시 2026-09-11).
      gotoBoardPost(postId);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '공유에 실패했습니다', 'error');
    } finally { setBusy(null); }
  };

  return (
    <section
      className="relative rounded-aura border card-aura p-3"
      // 결과 카드 뒤에만 등급 색 LED — 입력 카드에는 이 빛을 반복하지 않는다.
      // .card-aura[data-aura] 가 접촉 그림자 + LED 를 합성한다(index.css). 인라인 box-shadow 로 덮으면 그 합성이 통째로 사라진다.
      data-aura={tone.led ? '' : undefined}
      data-aura-level={tone.led ? 'hero' : undefined}
      data-aura-variant={tone.led ?? undefined}
      aria-label="스팟 리포트"
    >
      {/* ① 먼저 보이는 것 */}
      <header className="flex flex-wrap items-center gap-2">
        {/* 평가 배지는 **판정할 것이 있을 때만** 세운다.
            · 내가 고른 액션이 없으면 판정할 대상이 없다.
            · out_of_scope 는 아래 등급 배지가 이미 같은 문장을 말한다 — 두 배지가 같은 글자를
              나란히 띄우면 정보가 늘지 않고 화면만 시끄러워진다(1280 실측에서 실제로 그랬다). */}
        {spot.heroAction !== null && evaluation.verdict !== 'out_of_scope' && (
          <span className={['inline-flex items-center gap-1 rounded-badge border px-2 py-0.5 text-2xs font-bold', VERDICT_TONE[evaluation.verdict]].join(' ')}>
            <Icon name={evaluation.verdict === 'good' ? 'check' : evaluation.verdict === 'improve' ? 'alert' : 'info'} size={11} aria-hidden />
            {VERDICT_LABEL[evaluation.verdict]}
          </span>
        )}
        <span
          data-source-badge={evaluation.kind}
          title={coverageHint(evaluation.kind)}
          className={['inline-flex items-center gap-1 rounded-badge border border-border-default bg-surface-high px-2 py-0.5 text-2xs font-semibold', tone.text].join(' ')}
        >
          <Icon name={tone.icon} size={11} aria-hidden />
          {COVERAGE_LABEL[evaluation.kind]}
        </span>
        {calculating && <span className="text-2xs text-ink-muted" aria-live="polite">계산 중…</span>}
      </header>

      <p className="mt-1.5 text-2xs text-ink-muted">{spotSummary(spot)}</p>

      <div className="mt-2 flex items-center gap-2 rounded-input bg-surface-high px-2.5 py-2">
        <span className="shrink-0 text-2xs text-ink-muted">내 선택</span>
        <span className="text-sm font-bold text-ink-primary">
          {spot.heroAction ? actionLabel(spot.heroAction) : '아직 고르지 않음'}
          {spot.heroActionSizeBb !== undefined && spot.heroAction && ['call', 'bet', 'raise'].includes(spot.heroAction) && (
            <span className="ml-1 text-xs tabular-nums text-ink-secondary">{spot.heroActionSizeBb}BB</span>
          )}
        </span>
      </div>

      {/* ② 빈도 또는 수학 */}
      {(evaluation.kind === 'chart_nash' || evaluation.kind === 'normalized_reference') && (
        <MixBar mix={evaluation.mix} absent={evaluation.absent} heroKey={heroMixKey(spot)} />
      )}
      {(evaluation.kind === 'math_only' || evaluation.kind === 'unsupported') && (
        <MathBlock math={evaluation.math} boardCount={spot.board.length} />
      )}

      {/* ③ 왜 그런지 · 가정 · 출처
          범위 밖일 때는 **리포트 한 문장(reason)** 만 세운다.
          notes 에는 검증 오류 목록이 그대로 들어 있지만(spotEvaluate 의 데이터 계약이다),
          그건 입력 폼 바로 아래 IssueList 가 이미 빨간 배너로 말하고 있다 —
          같은 문장을 한 화면 아래에서 회색 불릿으로 한 번 더 띄우면 정보가 늘지
          않고 화면만 시끄러워진다(412px 실측에서 실제로 그러했다).
          그래도 reason 은 반드시 세운다 — 리포트는 혼자 떨어져도 자기를 설명해야 한다. */}
      {evaluation.kind === 'unsupported' ? (
        <p className="mt-2.5 border-t border-border-subtle pt-2.5 text-2xs leading-relaxed text-ink-secondary break-keep">
          {evaluation.reason}
        </p>
      ) : evaluation.notes.length > 0 ? (
        <ul className="mt-2.5 space-y-1 border-t border-border-subtle pt-2.5">
          {evaluation.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-1.5 text-2xs leading-relaxed text-ink-secondary break-keep">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted" aria-hidden />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
        데이터 버전 <span className="tabular-nums">{evaluation.datasetVersion}</span>
        {' · '}이 앱에는 검증된 솔버 데이터가 없어 <b className="text-ink-secondary">솔버 기준</b> 등급은 사용하지 않습니다.
      </p>

      {/* ④ 행동 */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-border-subtle pt-2.5">
        <button type="button" onClick={onSave} disabled={blocked || busy !== null}
          className="btn-ghost min-h-[44px] text-xs disabled:opacity-50">
          {busy === 'save' ? '저장 중…' : saved ? '저장됨' : '내 스팟에 저장'}
        </button>
        <button type="button" onClick={onShare} disabled={blocked || busy !== null}
          className="btn-primary min-h-[44px] text-xs disabled:opacity-50">
          {busy === 'share' ? '올리는 중…' : '스팟 토론에 공유'}
        </button>
      </div>
      {blocked && (
        <p className="mt-1.5 text-2xs text-ink-muted">입력을 고치면 저장·공유할 수 있어요. 적어 둔 내용은 그대로 있습니다.</p>
      )}

      {/* 비슷한 스팟 풀기 — **평가가 실제로 본 그 표**가 있을 때만 세운다.
          이 저장소에는 스팟 사이의 거리를 재는 수단이 없다(canonicalSpotKey 는 같음/다름만 본다).
          그러니 '비슷하다'고 부를 수 있는 정직한 대상은 참조한 표 하나뿐이고, 포스트플랍처럼
          표가 없는 자리에는 **버튼을 만들지 않는다**(비활성 버튼은 '입력을 고치면 열린다'는
          거짓 약속이 된다 — 여긴 고칠 입력이 없다).
          ⚠ 위 2열 그리드에 넣지 않는다. 세 번째가 되면 한 칸이 혼자 남아 열이 깨진다. */}
      {'drill' in evaluation && evaluation.drill && (
        <button type="button" onClick={onDrill}
          className="mt-1.5 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-input border border-border-default text-xs font-bold text-ink-secondary">
          <Icon name="target" size={13} aria-hidden />비슷한 스팟 풀기
        </button>
      )}

      <ShareConfirmSheet
        open={confirming}
        spot={spot}
        note={draftNote}
        onNote={setDraftNote}
        busy={busy === 'share'}
        onCancel={onCancelShare}
        onConfirm={onConfirmShare}
      />
    </section>
  );
}

/**
 * 공유 확인 시트 — **올라갈 본문을 그대로** 보여 주고, 메모를 그 자리에서 고치거나 지우게 한다.
 *
 * 계약(이 셋이 이 화면의 존재 이유다):
 *  ① 여기 오기 전에는 아무것도 올라가지 않았다 — 취소하면 공개 글은 0이다.
 *  ② 미리보기는 실제 본문과 **같은 함수**(buildShareBody)로 짓는다 — 화면이 거짓말하지 않는다.
 *  ③ 메모가 공개된다는 사실을 눈에 띄게 말한다. 입력 칸의 안내문("왜 그렇게 했는지")만 보고
 *     혼잣말을 적어 둔 사람이 그대로 게시되는 일이 없어야 한다.
 *
 * Escape·포커스 복귀·배경 스크롤 잠금·44px 터치는 공용 Modal 이 이미 계약으로 갖고 있다 —
 * 여기서 다시 만들지 않는다(atoms/Modal + useDialogFocus).
 * 배경 클릭으로는 닫지 않는다(dismissOnBackdrop=false) — 글 쓰는 시트의 이 저장소 관행이다.
 */
function ShareConfirmSheet({
  open, spot, note, onNote, busy, onCancel, onConfirm,
}: {
  open: boolean;
  spot: SpotReview;
  note: string;
  onNote: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const body = buildShareBody(spot, note);
  return (
    <Modal open={open} onClose={onCancel} title="이 내용으로 게시판에 올립니다" variant="sheet" maxWidth="md" dismissOnBackdrop={false}>
      <div className="space-y-3 p-4" data-share-confirm>
        <p className="flex items-start gap-1.5 rounded-input border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-2xs leading-relaxed text-amber-200 break-keep">
          <Icon name="alert" size={13} className="mt-px shrink-0" aria-hidden />
          <span>
            아래 본문이 <b>그대로 공개 글</b>이 됩니다. <b>적어 둔 메모도 함께 공개됩니다</b> — 혼잣말이 아닙니다.
            남기고 싶지 않은 내용은 지금 고치거나 지우세요.
          </span>
        </p>

        <section>
          <h3 className="text-2xs font-bold text-ink-secondary">올라갈 본문</h3>
          <div data-share-preview
            className="mt-1 whitespace-pre-wrap break-keep rounded-input border border-border-default bg-surface-high px-2.5 py-2 text-xs leading-relaxed text-ink-primary">
            {body}
          </div>
        </section>

        <label className="block">
          <span className="text-2xs font-bold text-ink-secondary">메모 <span className="font-normal text-amber-200">(공개됩니다)</span></span>
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="비워 두면 '이 자리에서 어떻게 하시겠어요?' 만 올라갑니다"
            className="mt-1 w-full resize-y rounded-input border border-border-default bg-surface-high px-2.5 py-2 text-xs leading-relaxed text-ink-primary placeholder:text-ink-muted"
          />
        </label>
        {note.trim() !== '' && (
          <button type="button" onClick={() => onNote('')}
            className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-input border border-border-default text-xs font-bold text-ink-secondary">
            <Icon name="close" size={12} aria-hidden />메모 빼고 올리기
          </button>
        )}

        <ul className="space-y-1 border-t border-border-subtle pt-2.5">
          {[
            '게시판 · 핸드 카테고리에 올라갑니다.',
            '자리·스택·내 카드가 담긴 스팟 카드가 글에 붙습니다.',
            "'당신이라면?' 액션 투표가 함께 만들어집니다.",
            '상대 카드와 결과는 가려진 채 올라갑니다 — 나중에 직접 열 수 있습니다.',
          ].map((t) => (
            <li key={t} className="flex items-start gap-1.5 text-2xs leading-relaxed text-ink-secondary break-keep">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <button type="button" onClick={onCancel} disabled={busy}
            className="btn-ghost min-h-[44px] text-xs disabled:opacity-50">취소</button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className="btn-primary min-h-[44px] text-xs disabled:opacity-50">
            {busy ? '올리는 중…' : '게시판에 올리기'}
          </button>
        </div>
        <p className="text-2xs text-ink-muted">취소하면 아무 글도 올라가지 않습니다.</p>
      </div>
    </Modal>
  );
}

function heroMixKey(spot: SpotReview): keyof ActionMix | null {
  const a = spot.heroAction;
  if (a === 'fold') return 'fold';
  if (a === 'call') return 'call';
  if (a === 'raise' || a === 'bet') return 'raise';
  return null;
}

/** 폴드·콜·레이즈 가로 누적 막대 + 목록. 퍼센트는 막대 밖에서도 읽힌다. */
/**
 * 기준 빈도 막대.
 *
 * 🔴 **`absent` 갈래는 `0%` 가 아니라 `—` 로 그린다.** `mix` 에서 그 자리의 0 은 빈도가 아니라
 * **표의 침묵**이다(spotEvaluate 의 ActionMix 주석). 3벳 표 23장과 SB 얼리 수비 3장에는 콜 갈래가
 * 아예 없어서, 그대로 찍으면 "정확 일치" 배지 옆에 **"콜 0% · 폴드 0%"** 가 뜬다 —
 * 유저는 그걸 "차트가 접지 말라고 한다" 로 읽는다. 실측(2026-09-17 Fable 검증):
 * `CO vs LJ · JJ · 콜` 에서 배지 "정확 일치" + 막대 "폴드 0% · 콜 0% · 레이즈 50%" 가 그대로 나갔다.
 * 엔진이 잔여를 지어내지 않으려고 `absent` 를 만든 이유가 화면에서 도로 무너지던 자리다.
 * aria-label 도 같이 고친다 — 스크린리더에게만 "0%" 라고 말하면 그것도 거짓말이다.
 */
function MixBar({ mix, absent, heroKey }: { mix: ActionMix; absent: readonly (keyof ActionMix)[]; heroKey: keyof ActionMix | null }) {
  const order: (keyof ActionMix)[] = ['fold', 'call', 'raise'];
  const pct = (n: number) => Math.round(n * 1000) / 10;
  const silent = (k: keyof ActionMix) => absent.includes(k);
  const cell = (k: keyof ActionMix) => (silent(k) ? '—' : `${pct(mix[k])}%`);
  const text = order.map((k) => `${MIX_TONE[k].label} ${silent(k) ? '표에 없음' : `${pct(mix[k])}%`}`).join(', ');
  return (
    <div className="mt-2.5">
      {/* 막대 자체는 장식 — 실제 값은 아래 목록이 전한다(스크린리더는 목록을 읽는다) */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-high" role="img" aria-label={`기준 빈도 — ${text}`}>
        {order.map((k) => (
          !silent(k) && mix[k] > 0 ? <span key={k} className={MIX_TONE[k].bar} style={{ width: `${mix[k] * 100}%` }} /> : null
        ))}
      </div>
      <ul className="mt-1.5 space-y-1">
        {order.map((k) => (
          <li key={k} className="flex items-center gap-2 text-2xs">
            <span className={['h-2 w-2 shrink-0 rounded-full', MIX_TONE[k].dot].join(' ')} aria-hidden />
            <span className="flex-1 text-ink-secondary">
              {MIX_TONE[k].label}
              {heroKey === k && <span className="ml-1.5 rounded-badge bg-accent-300/15 px-1.5 py-px font-bold text-accent-200">내 선택</span>}
            </span>
            <span className={['tabular-nums font-bold', silent(k) ? 'text-ink-muted' : 'text-ink-primary'].join(' ')}
              title={silent(k) ? '이 표는 이 갈래를 담지 않습니다 — 빈도 0 이 아닙니다' : undefined}>{cell(k)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 승률은 **두 가지 방식**으로 계산된다 — 같은 문구로 뭉뚱그리면 한쪽은 반드시 거짓말이 된다.
 * `computeEquity` 는 보드가 3장 이상이면 잔여 조합을 **전수계산**하고(플랍 990 · 턴 44 · 리버 1),
 * 프리플랍·보드 1~2장일 때만 몬테카를로 표본을 쓴다.
 *
 * 2026-09-17 실측: 표본 10,000회에서 같은 프리플랍 핸드를 12번 돌리면 폭이 1.4~1.7%p 였다
 * (2,500회일 때는 2.7~3.5%p). 즉 **소수점 자리는 잡음**이라 표본일 때는 정수로 적는다.
 * 반대로 플랍 이후는 흔들리지 않는 값인데 "돌릴 때마다 달라진다" 고 적혀 있었다 — 그것도 거짓이었다.
 */
function MathBlock({ math, boardCount }: { math: SpotEvaluation['math']; boardCount: number }) {
  const sampled = boardCount < 3;
  const eq = math.heroEquityPct;
  const rows: [string, string, string?][] = [
    ['팟', `${math.potBb}BB`],
    ...(math.toCallBb > 0 ? [['콜 금액', `${math.toCallBb}BB`] as [string, string]] : []),
    ...(math.neededEquityPct !== null ? [['필요 승률', `${math.neededEquityPct}%`, '이 승률보다 높아야 콜이 손해가 아닙니다'] as [string, string, string]] : []),
    ...(eq !== null ? [sampled
      ? ['내 승률(추정)', `약 ${Math.round(eq)}%`, '무작위 표본 추정치 — 다시 계산하면 1%p 안팎으로 달라집니다(그래서 정수로 적습니다)']
      : ['내 승률', `${eq}%`, '남은 카드를 전부 돌려 계산한 값입니다 — 다시 계산해도 같습니다'],
    ] as [string, string, string][] : []),
  ];
  return (
    <dl className="mt-2.5 space-y-1">
      {rows.map(([k, v, help]) => (
        <div key={k} className="flex items-baseline justify-between gap-2 rounded-input bg-surface-high px-2.5 py-1.5">
          <dt className="text-2xs text-ink-secondary" title={help}>{k}{help && <Icon name="info" size={10} className="ml-1 inline-block align-[-1px] text-ink-muted" aria-hidden />}</dt>
          <dd className="text-sm font-bold tabular-nums text-ink-primary">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function coverageHint(k: CoverageKind): string {
  switch (k) {
    case 'exact_solver':
      return '동일한 게임 트리의 검증된 솔버 산출입니다. 이 앱에는 아직 해당 데이터가 없습니다.';
    case 'chart_nash':
      return '이 앱의 자체 프리플랍 차트 또는 자체 Nash 푸시·폴드 데이터와 조건이 정확히 일치합니다.';
    case 'normalized_reference':
      return '가까운 참조 스팟을 빌려 왔습니다. 무엇이 달랐는지 함께 적혀 있으니 그 차이를 감안해서 보세요.';
    case 'math_only':
      return '에퀴티·팟오즈·필요 승률만 계산했습니다. 어떤 액션이 옳은지는 말하지 않습니다.';
    default:
      return '이 조건은 지금 데이터로 판정할 수 없습니다. 리플레이·저장·토론은 그대로 됩니다.';
  }
}
