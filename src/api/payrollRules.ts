// src/api/payrollRules.ts — 매장 급여 계산 설정(휴게 자동 공제·5인 이상 가산·주휴·조기 출근 인정).
//
// 테이블 venue_payroll_rules 는 마이그레이션 초안(20260926a, 리드 적용 대기)이 만든다.
// 적용 전에는 PostgREST 가 '테이블 없음'(PGRST205 / 42P01)을 돌려준다 — 그건 조회 실패가 아니라
// '아직 저장된 설정이 없음' 이다. 기본값으로 계산하고 저장만 막는다(급여 화면 자체가 '—' 로 죽으면 기능 소실).
import { useCallback, useEffect, useState } from 'react';
import { supabase, IS_MOCK } from '../lib/supabase';
import { DEFAULT_PAY_RULES, type PayRules } from '../lib/staffPay';
import { msgOf } from '../lib/dbError';

const isMissingTable = (e: unknown) => {
  const c = (e && typeof e === 'object' ? (e as { code?: unknown }).code : null);
  return c === 'PGRST205' || c === '42P01';
};

/** 저장된 설정. 행이 없으면 null(기본값을 쓴다). 테이블이 아직 없으면 'missing'. */
export async function getPayRules(venueId: string): Promise<PayRules | null | 'missing'> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.from('venue_payroll_rules')
    .select('early_credit, auto_break, five_plus, weekly_holiday').eq('venue_id', venueId).maybeSingle();
  if (error) { if (isMissingTable(error)) return 'missing'; throw error; }
  if (!data) return null;
  return { earlyCredit: !!data.early_credit, autoBreak: !!data.auto_break, fivePlus: !!data.five_plus, weeklyHoliday: !!data.weekly_holiday };
}

export async function savePayRules(venueId: string, r: PayRules): Promise<void> {
  if (IS_MOCK) return;
  const { data, error } = await supabase.from('venue_payroll_rules').upsert({
    venue_id: venueId, early_credit: r.earlyCredit, auto_break: r.autoBreak, five_plus: r.fivePlus, weekly_holiday: r.weeklyHoliday,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id' }).select('venue_id');
  if (error) throw error;
  // RLS 거부는 200 + 0행으로 올 수 있다 — 저장된 척하지 않는다.
  if (!data || data.length === 0) throw new Error('급여 설정을 저장할 권한이 없습니다');
}

const SAVED_EVENT = 'nuri:payroll-rules-saved';

export type PayRulesState = 'loading' | 'ready' | 'missing' | 'error';

/** 매장 급여 설정 — 계산에 쓸 값(rules)은 항상 있다(기본값 포함). 실패는 err 로 따로 준다. */
export function usePayRules(venueId: string) {
  const [rules, setRules] = useState<PayRules>(DEFAULT_PAY_RULES);
  const [state, setState] = useState<PayRulesState>('loading');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setState('loading'); setErr(null);
    getPayRules(venueId)
      .then((r) => { if (!alive) return; setRules(r && r !== 'missing' ? r : DEFAULT_PAY_RULES); setState(r === 'missing' ? 'missing' : 'ready'); })
      .catch((e) => { if (!alive) return; setRules(DEFAULT_PAY_RULES); setState('error'); setErr(msgOf(e, '급여 계산 설정을 불러오지 못했습니다')); });
    // 같은 매장의 다른 화면(급여 설정 칸)이 저장하면 이 화면도 바로 새 값으로 다시 센다.
    const onSaved = (e: Event) => { const d = (e as CustomEvent<{ venueId: string; rules: PayRules }>).detail; if (d?.venueId === venueId) { setRules(d.rules); setState('ready'); setErr(null); } };
    window.addEventListener(SAVED_EVENT, onSaved);
    return () => { alive = false; window.removeEventListener(SAVED_EVENT, onSaved); };
  }, [venueId]);
  const save = useCallback(async (r: PayRules) => {
    await savePayRules(venueId, r);
    window.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: { venueId, rules: r } }));
  }, [venueId]);
  return { rules, state, err, save };
}
