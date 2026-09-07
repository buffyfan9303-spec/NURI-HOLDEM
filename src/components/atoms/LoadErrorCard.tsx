// 불러오기 실패 카드 — '빈 상태'와 '실패'를 시각적으로 갈라놓기 위한 세 번째 분기.
//
// 왜 필요한가: 이 앱의 렌더 분기는 오랫동안 두 갈래뿐이었다 —
//   `!loaded ? 스켈레톤 : length === 0 ? 빈상태 : 목록`.
//   그래서 조회가 실패해도 '아직 아무것도 없네'로 보였고, 그 위장이 파괴적 조작을 유도했다:
//   클락 조회 실패 → '클락 없음' → 설정폼 → [시작] → 진행 중이던 대회가 0으로 덮인다.
//   장터는 등록이 100% 실패하는데 '매물이 없네'로 보여서 그대로 프로덕션에 나가 있었다.
//
// 그래서 이 카드가 지켜야 할 것은 두 가지다:
//   ① 이건 '없음'이 아니라 '못 불러옴'이라고 분명히 말한다.
//   ② 다시 시도할 수단을 반드시 준다 — 현장에서 네트워크 순단은 흔하고, 대부분 재시도로 풀린다.
//
// 2026-09-05(U4): 세 번째 갈래로 '권한 없음'을 더 갈랐다. 서버가 42501/403 을 준 경우는
//   '못 불러옴'과 원인도 처방도 다르다 — 직원이 자기 조작을 의심하며 같은 버튼을 반복해서
//   누르는 대신, 업주에게 권한을 요청하면 된다는 것을 문구가 말해 준다.
//   재시도 버튼은 남긴다: 세션 복원 전에 날아간 요청도 42501 로 떨어지고, 그때는 재시도가 답이다.
import { msgOf, isDenied } from '../../lib/dbError';

export default function LoadErrorCard({ error, onRetry, what = '정보', compact = false }: {
  error?: unknown;
  onRetry?: () => void;
  /** 무엇을 못 불러왔는지(예: '장부', '클락', '대회 목록') — 화면마다 다르게 */
  what?: string;
  /** 좁은 영역(위젯 등)에 넣을 때 */
  compact?: boolean;
}) {
  const detail = msgOf(error, '');
  const denied = isDenied(error);
  return (
    <div
      role="alert"
      className={[
        'flex flex-col items-center justify-center gap-2 rounded-card border border-danger/30 bg-danger/[0.06] text-center',
        compact ? 'px-3 py-4' : 'px-4 py-10',
      ].join(' ')}
    >
      <svg width={compact ? 24 : 36} height={compact ? 24 : 36} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-danger-light" aria-hidden>
        <path d="M12 3 L22 20 H2 Z" />
        <line x1="12" y1="10" x2="12" y2="14" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" />
      </svg>
      <p className={['font-semibold text-danger-light', compact ? 'text-xs' : 'text-sm'].join(' ')}>
        {denied ? `${what} 열람 권한이 없습니다` : `${what}을(를) 불러오지 못했습니다`}
      </p>
      {/* 서버가 준 이유가 있으면 그대로 — '저장 실패' 한 문장으로 뭉개면 원인 추적이 끊긴다 */}
      {detail && <p className="text-2xs leading-relaxed text-ink-secondary">{detail}</p>}
      <p className="text-2xs text-ink-muted">
        {denied ? '내용이 없는 것이 아니라, 이 계정에 열람 권한이 없습니다.' : '아직 등록된 내용이 없는 것과는 다릅니다.'}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry}
          /* hit: 44x44 투명 확장. 이 카드는 flex-col 이고 주변에 다른 누를 것이 없어
             이웃 탭을 가로챌 위험이 없다(부모에 overflow-hidden 도 없다).
             실패 화면에서 빠져나오는 **유일한** 수단이라 31.75px 로 둘 수 없다. */
          className="hit mt-1 rounded-input border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger-light active:scale-95 transition">
          다시 시도
        </button>
      )}
    </div>
  );
}
