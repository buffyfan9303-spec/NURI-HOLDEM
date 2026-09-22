// src/components/features/gto/SpotReport.tsx — 작성 내용 + 저장·공유
//
// 🔴 2026-09-22 요구 A 로 이 화면의 성격이 바뀌었다.
//   전: '스팟 리포트' — 평가 배지·분석 등급·액션 빈도 막대·수학 지표·데이터 버전이 주인공이었다.
//   후: **작성한 내용을 그대로 읽어 주고, 저장하고, 게시판에 공유하는 자리.**
//   오너: "분석 카드는 지우고, 작성하고 저장하고 게시판에 공유해서 보여 주는 게 목적이다."
//
// 지금 순서:
//   ① 작성 내용(SpotDetails — 세 화면이 함께 쓰는 표시 컴포넌트)
//   ② 내 스팟에 저장 · 스팟 토론에 공유
//
// ⚠ 지운 것은 **판정 표시**뿐이다. 입력 검증(IssueList)·저장 스냅샷(`evaluation`)·
//   공유 확인 시트(F16 계약)·트레이너 도구는 전부 그대로다.
import { useEffect, useState } from 'react';
import Icon from '../../atoms/Icon';
import Modal from '../../atoms/Modal';
import { ensureLogin } from '../../../lib/requireLogin';
import type { useToast } from '../../atoms/Toast';
import type { useAuth } from '../../../contexts/AuthContext';
import { spotSummary, type SpotReview } from '../../../lib/spot';
import type { SpotEvaluation, CoverageKind } from '../../../lib/spotEvaluate';
import { saveMySpot, shareSpotPost } from '../../../api/spots';
import { gotoBoardPost } from '../../../lib/spotNav';
import { buildShareBody, spotWithNote } from './spotShareBody';
import SpotDetails from './SpotDetails';

/** 등급별 색 — **색만으로 의미를 전하지 않는다.** 항상 라벨·아이콘과 함께 쓴다. */
/** led = [data-aura-variant](index.css) — 인라인 rgb 링은 라이트·고대비·강제색에서 못 껐다(2026-09-18). unsupported 는 LED 없음. */
const COVERAGE_TONE: Record<CoverageKind, { led: 'violet' | 'cyan' | 'amber' | null; text: string; icon: 'microscope' | 'table' | 'scale' | 'sigma' | 'info' }> = {
  exact_solver:         { led: 'violet', text: 'text-accent-200', icon: 'microscope' },
  chart_nash:           { led: 'cyan',   text: 'text-aura-300',   icon: 'table' },
  normalized_reference: { led: 'amber',  text: 'text-amber-200',  icon: 'scale' },
  math_only:            { led: 'amber',  text: 'text-amber-200',  icon: 'sigma' },
  unsupported:          { led: null,     text: 'text-ink-muted',  icon: 'info' },
};

// 🔴 VERDICT_TONE(판정 색) 은 요구 A 로 제거했다 — 이 화면은 더 이상 옳고 그름을 말하지 않는다.
//   판정 자체(`spotEvaluate`)는 저장 스냅샷 호환을 위해 그대로 살아 있다.

interface Props {
  spot: SpotReview;
  evaluation: SpotEvaluation;
  // 🔴 `calculating` prop 은 요구 A 로 제거했다 — 이 화면에서 도는 비동기 계산이 없어졌다.
  blocked: boolean;
  /** 2026-09-14: 저장 목록(MySpotList)에서 "공유"로 열었을 때 증가하는 신호.
   *  ⚠ 여기서 **게시하지 않는다** — 기존 확인 시트(onShare)를 열 뿐이다.
   *     저장 목록에 shareSpotPost 를 직접 붙이면 F16 이 세운 "올라갈 본문을 먼저 보여 준다"는
   *     계약을 우회하는 두 번째 게시 경로가 생긴다. 그래서 진입점만 늘리고 경로는 하나로 둔다. */
  shareIntent?: number;
  // 🔴 `equityMeta` prop 은 요구 A 로 제거했다 — 승률을 화면에 쓰지 않으므로 받을 이유가 없다.
  //   NuriSpotPanel 의 10,000회 equity 계산 배선도 같은 이유로 걷어냈다.
  user: ReturnType<typeof useAuth>['user'];
  toast: ReturnType<typeof useToast>;
}

export default function SpotReport({ spot, evaluation, blocked, user, toast, shareIntent = 0 }: Props) {
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

  // 🔴 `onDrill`('비슷한 스팟 풀기' → 트레이너) 은 요구 A 로 제거했다.
  //   트레이너 도구 자체와 `evaluation.drill` 데이터는 그대로 있다 — 이 화면에서 나가는 길만 없앴다.

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
  // ⚠ blocked(입력 미완성)면 열지 않는다 — 올릴 수 없는 상태에서 시트만 뜨면 막다른 길이다.
  useEffect(() => {
    if (!shareIntent || blocked) return;
    if (!ensureLogin(user)) return;
    setDraftNote(spot.note?.trim() ?? '');
    setConfirming(true);
    // spot 은 의도적으로 의존성에서 뺀다 — 메모를 고칠 때마다 시트가 다시 열리면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareIntent, blocked, user]);

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
      aria-label="작성 내용"
    >
      {/* 🔴 2026-09-22 요구 A — 이 카드는 이제 **작성한 내용을 읽어 주는 자리**다.
          오너: "분석 카드는 지우고, 작성하고 저장하고 게시판에 공유해서 보여 주는 게 목적이다."
          여기 있던 분석 UI 를 전부 걷어냈다: 평가/판정 배지, 출처 등급 배지, 수학 지표 블록,
          액션 빈도 막대, 승률·오즈 계열 수치 세 줄, 평가 notes, 솔버 고지, 데이터 버전 줄,
          트레이너로 가는 버튼.
          ⚠ 지운 문구를 이 주석에 **그대로 적지 마라** — 계약 테스트가 소스 문자열로 세므로
            주석 한 줄이 '되살아났다' 로 잡힌다(이 저장소가 여러 번 밟은 함정이다).
          ⚠ **입력 검증은 그대로다.** 중복 카드·스트리트 장수·자리 충돌은 폼 아래 IssueList 가 계속 말한다.
            없앤 것은 '무엇이 옳은가' 하는 판정뿐이다.
          ⚠ `evaluation` prop 은 남는다 — 화면에 안 쓰지만 `saveMySpot` 이 스냅샷(coverage_kind·
            dataset_version)을 그대로 저장해야 기존 행·RPC 스키마와 호환된다. */}
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-primary">작성 내용</h3>
        <span className="text-2xs text-ink-muted">{spotSummary(spot)}</span>
      </header>

      <div className="mt-2 rounded-input bg-surface-high px-2.5 py-1.5">
        <SpotDetails spot={spot} mode="owner" />
      </div>

      {/* 행동 */}
      {/* whitespace-normal · leading-tight: `.btn` 의 nowrap 이 200% 글자확대(root 34px)에서 '내 스팟에 저장' 을 칸 밖으로
          흘려 옆 버튼 위에 겹쳤다(2026-09-19 스윕, 320~390px). 라벨을 줄이지 않고 두 줄을 허용한다 — SpotHeroCard(ToolsPanel) 와 같은 조리법. */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-border-subtle pt-2.5">
        <button type="button" onClick={onSave} disabled={blocked || busy !== null}
          className="btn-ghost min-h-[44px] whitespace-normal px-2 text-xs leading-tight disabled:opacity-50">
          {busy === 'save' ? '저장 중…' : saved ? '저장됨' : '내 스팟에 저장'}
        </button>
        <button type="button" onClick={onShare} disabled={blocked || busy !== null}
          className="btn-primary min-h-[44px] whitespace-normal px-2 text-xs leading-tight disabled:opacity-50">
          {busy === 'share' ? '올리는 중…' : '스팟 토론에 공유'}
        </button>
      </div>
      {blocked && (
        <p className="mt-1.5 text-2xs text-ink-muted">입력을 고치면 저장·공유할 수 있어요. 적어 둔 내용은 그대로 있습니다.</p>
      )}

      {/* 🔴 '비슷한 스팟 풀기' 버튼은 요구 A 로 제거했다(트레이너 도구 자체는 그대로 있다).
          이 화면은 작성·저장·공유가 목적이고, 여기서 트레이너로 새는 길은 그 흐름을 끊는다. */}

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
          {/* 같은 처방 — '게시판에 올리기' 가 200% 에서 오른쪽 경계를 넘었다(스윕 [medium]). */}
          <button type="button" onClick={onCancel} disabled={busy}
            className="btn-ghost min-h-[44px] whitespace-normal px-2 text-xs leading-tight disabled:opacity-50">취소</button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className="btn-primary min-h-[44px] whitespace-normal px-2 text-xs leading-tight disabled:opacity-50">
            {busy ? '올리는 중…' : '게시판에 올리기'}
          </button>
        </div>
        <p className="text-2xs text-ink-muted">취소하면 아무 글도 올라가지 않습니다.</p>
      </div>
    </Modal>
  );
}
