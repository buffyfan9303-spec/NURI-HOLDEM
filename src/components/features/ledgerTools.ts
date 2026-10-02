// 장부 작업대(LedgerWorkspace) → 장부(NuriPosLedger) 도구 통로.
// 작업대의 [이용권 확인]·[전체화면] 을 장부의 날짜 줄(목록 모드는 검색 줄) 끝에 그린다 — 혼자 한 줄을 차지하던 도구 줄 회수(감사 L-4·L-9).
// 두 컴포넌트가 서로를 import 하지 않게 따로 둔다(각자 lazy 청크).
import { createContext, type ReactNode } from 'react';

/** 작업대 밖(관리자 탭 등)에서는 null — 도구 없이 그린다. */
export const LedgerToolsContext = createContext<ReactNode>(null);

/** 전체화면 작업대 안인가 — 그 안에서는 장부 머리줄(날짜·게임)을 셸 칩 줄 자리로 portal 하지 않는다(그 자리는 전체화면 뒤에 가려진다). */
export const LedgerFullscreenContext = createContext(false);
