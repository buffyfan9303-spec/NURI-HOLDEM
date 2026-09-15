// 직원 권한 토글의 다섯 상태 — 확인 중 / 확인 실패 / 미부여 / 부여 / 변경 중 (P02, 2026-09-13).
//
// 왜 이 파일이 따로 있는가: StaffManager(VenueManageTab.tsx)는 오랫동안 `access.includes(id)` 한 갈래로만
//   권한 버튼을 그렸다. 조회가 실패해도 배열이 비어 **모든 직원이 '권한 없음'** 으로 보였고, 업주가 그걸 믿고
//   다시 누르면 이미 있는 권한에 grant 가 나갔다. "모른다" 와 "없다" 를 화면이 갈라 말해야 하고,
//   **모르는 동안에는 저장이 나가면 안 된다** — 그 판정을 한 곳에 두고 단위 테스트로 잠근다.
//
// 이 파일은 순수 함수만 둔다(vitest 환경이 node 라 컴포넌트 렌더 테스트가 없다 — 판정은 여기서,
// 배선은 src/components/features/StaffAccessState.contract.test.ts 가 본다).
import { isDenied, msgOf } from './dbError';

/** 권한 보유자 목록 조회의 상태. 'ready' 의 ids 가 [] 인 것은 "아무도 없다" 이지 실패가 아니다. */
export type AccessLoad =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; ids: readonly string[] };

/** 한 직원의 한 권한 버튼이 지금 무엇을 말해야 하는가. */
export type AccessView = 'checking' | 'failed' | 'granted' | 'ungranted' | 'changing';

export function accessViewOf(load: AccessLoad, changing: ReadonlySet<string>, userId: string): AccessView {
  // 변경 중은 조회 상태보다 우선한다 — 저장이 나간 뒤 재조회가 겹쳐도 버튼이 '확인 중' 으로 흔들리지 않게.
  if (changing.has(userId)) return 'changing';
  if (load.status === 'loading') return 'checking';
  if (load.status === 'error') return 'failed';
  return load.ids.includes(userId) ? 'granted' : 'ungranted';
}

/** 눌렀을 때 grant/revoke 를 **보내도 되는가.** 확인 중·확인 실패·변경 중에는 절대 보내지 않는다 —
 *  지금 값을 모르는 채 보내는 grant/revoke 가 P02 의 실제 피해였다. */
export function canToggleAccess(view: AccessView): boolean {
  return view === 'granted' || view === 'ungranted';
}

/** 실패 상태에서 눌렀을 때의 안내 — 쉬운 말 + 다음 행동(실행문 J절). */
export const ACCESS_LOAD_FAILED_MSG = '권한을 불러오지 못했어요. 다시 시도해 주세요.';
/** 서버가 42501/403 을 준 경우 — '다시 시도' 가 답이 아니다(nuri-async-guard 부류 2). 처방이 다르니 문장도 다르다. */
export const ACCESS_LOAD_DENIED_MSG = '권한 설정을 볼 수 있는 계정이 아니에요. 매장 업주 계정으로 다시 로그인해 주세요.';
/** 실패 사유별 안내 — 권한 거부(isDenied)·세션 만료(PGRST301)·그 밖의 실패(네트워크·구버전 서버 PGRST202)를 갈라 말한다.
 *  ⚠ 20260915a 부터 두 RPC(get_ledger_access_user_ids·get_voucher_access_user_ids)는 비인가 호출자에게 0행이 아니라 **42501** 을 준다
 *    (그전엔 인가가 WHERE 절이라 200+0행 = '아무도 없음' 으로 위장됐다). 42501 은 '다시 시도' 가 답이 아니라 계정 안내다.
 *    PGRST301 도 '다시 시도' 로 영원히 성공하지 않는다 — 재로그인이 답이라 msgOf 의 문장('로그인이 만료되었습니다. 다시 로그인해 주세요')을 그대로 쓴다. */
export function accessLoadFailedMsg(error: unknown): string {
  if (isDenied(error)) return ACCESS_LOAD_DENIED_MSG;
  const code = error && typeof error === 'object' ? String((error as { code?: unknown }).code ?? '') : '';
  if (code === 'PGRST301') return msgOf(error, ACCESS_LOAD_FAILED_MSG);
  return ACCESS_LOAD_FAILED_MSG;
}

export type AccessKind = 'ledger' | 'voucher' | 'schedule';

/** 버튼 글귀. 부여/미부여 글귀는 종전 화면 그대로(기능 보존) — 나머지 세 상태만 새로 말한다. */
export function accessLabel(kind: AccessKind, view: AccessView): string {
  const name = kind === 'ledger' ? '장부·순위' : kind === 'voucher' ? '이용권내역' : '스케줄 편성';
  switch (view) {
    case 'checking': return `${name} 확인 중…`;
    case 'failed': return `${name} 확인 실패 · 다시 시도`;
    case 'changing': return `${name} 변경 중…`;
    case 'granted': return kind === 'ledger' ? '장부·순위 권한 ✓' : kind === 'voucher' ? '이용권내역 ✓' : '스케줄 편성 ✓';
    case 'ungranted': return kind === 'ledger' ? '장부·순위 권한 없음' : kind === 'voucher' ? '이용권내역 ✗' : '스케줄 편성 ✗';
  }
}
