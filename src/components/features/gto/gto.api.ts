// src/components/features/gto/gto.api.ts
import { supabase, IS_MOCK } from '../../../lib/supabase';
import type { ActionFrequency, GtoScenario, HandCombo } from './gto.types';

/** Gemini 기반 GTO 해설 (Edge Function gto-explain). 실패 시 throw → 호출부에서 폴백 */
export async function explainGtoSpot(input: {
  scenario: GtoScenario;
  combo: HandCombo;
  frequency: ActionFrequency;
}): Promise<string> {
  if (IS_MOCK) throw new Error('데모 모드');
  const { scenario, combo, frequency } = input;

  const { data, error } = await supabase.functions.invoke('gto-explain', {
    body: {
      scenarioLabel: scenario.label,
      heroPosition: scenario.heroPosition,
      villain: scenario.villain,
      stackDepthBb: scenario.stackDepthBb,
      comboId: combo.id,
      comboKind: combo.kind,
      frequency,
    },
  });

  if (error) throw error;
  const text = (data as { text?: string } | null)?.text?.trim();
  if (!text) throw new Error('빈 응답');
  return text;
}
