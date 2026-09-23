// src/lib/tdaRulesLoad.ts
// TDA 규칙 본문(140KB) 모듈 캐시 — GTO-TOOL-OPEN-JANK(2026-09-24).
// 도구는 열 때마다 새로 마운트된다. 예전엔 매번 useEffect 에서 import 해 **두 번째 열기에도**
// 스켈레톤(344px) → 본문(6047px) 계단이 났다. 한 번 받은 값은 여기 쥐고 다음 마운트는 동기로 그린다.
import type { TdaRule } from '../data/tdaRules';

export interface TdaData { rules: TdaRule[]; version: string }

let cache: TdaData | null = null;
let pending: Promise<TdaData> | null = null;

/** 이미 받았으면 값, 아니면 null(동기). */
export const peekTdaRules = (): TdaData | null => cache;

/** 받는다(같은 요청 공유). 실패하면 비워 다음에 다시 시도한다. */
export function loadTdaRules(): Promise<TdaData> {
  return (pending ??= import('../data/tdaRules').then(
    (m) => (cache = { rules: m.TDA_RULES, version: m.TDA_VERSION }),
    (err) => { pending = null; throw err; },
  ));
}
