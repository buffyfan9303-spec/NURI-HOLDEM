// TDA canonical 규칙 사본이 원본과 일치하는가 (2026-09-11)
//
// 왜 테스트로 잠그나: `tda-assist` 엣지 함수는 클라이언트가 보낸 **키**로 자기 rules.json 에서
// 원문을 꺼내 프롬프트를 만든다. 사본이 원본과 어긋나면 두 가지 실패가 난다.
//   ① 키가 없어 400 — 화면에서 AI 안내가 통째로 안 나온다(조용한 기능 소실).
//   ② 본문이 옛 판이라 **없는 조항·틀린 번호를 인용** — 딜러가 손님 앞에서 잘못된 판정을 한다.
// ②가 이 기능의 유일한 치명 실패라, 사본 갱신을 잊는 경로를 테스트로 막는다.
//   재생성: node scripts/gen-tda-rules.mjs
import { describe, it, expect } from 'vitest';
import { TDA_RULES, TDA_VERSION } from '../data/tdaRules';
import { tdaRuleKey } from './tdaSearch';
import canon from '../../supabase/functions/tda-assist/rules.json';

interface CanonRule { key: string; no: number | null; section: string; title: string; body: string; page: number }
const canonRules = (canon as { version: string; rules: CanonRule[] }).rules;

describe('TDA canonical 규칙 사본(tda-assist/rules.json)', () => {
  it('원본과 버전·건수가 같다', () => {
    expect((canon as { version: string }).version).toBe(TDA_VERSION);
    expect(canonRules.length).toBe(TDA_RULES.length);
  });

  it('규칙 키가 유일하다 — 겹치면 서버가 엉뚱한 규칙을 조립한다', () => {
    const keys = canonRules.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('모든 규칙의 키·번호·제목·본문·쪽수가 원본과 글자 단위로 같다', () => {
    const byKey = new Map(canonRules.map((r) => [r.key, r]));
    const mismatched: string[] = [];
    for (const r of TDA_RULES) {
      const k = tdaRuleKey(r);
      const c = byKey.get(k);
      if (!c) { mismatched.push(`사본에 없음: ${k}`); continue; }
      if (c.no !== r.no) mismatched.push(`번호 다름: ${k}`);
      if (c.section !== r.section) mismatched.push(`섹션 다름: ${k}`);
      if (c.title !== r.title) mismatched.push(`제목 다름: ${k}`);
      if (c.body !== r.body) mismatched.push(`본문 다름: ${k}`);
      if (c.page !== r.page) mismatched.push(`쪽수 다름: ${k}`);
    }
    expect(mismatched, `node scripts/gen-tda-rules.mjs 로 재생성하라\n${mismatched.join('\n')}`).toEqual([]);
  });

  it('클라이언트가 만드는 키가 사본의 키 집합에 전부 들어 있다', () => {
    const canonKeys = new Set(canonRules.map((r) => r.key));
    const missing = TDA_RULES.map(tdaRuleKey).filter((k) => !canonKeys.has(k));
    expect(missing).toEqual([]);
  });
});
