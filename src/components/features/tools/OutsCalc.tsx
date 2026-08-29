import { Suspense, useState } from 'react';
import { CalcCard, Field, NumIn, Result } from './calcUi';
import Icon from '../../atoms/Icon';
import { lazyWithReload } from '../../../lib/lazyWithReload';

// 카드 입력 모드는 에퀴티 엔진(전수계산)을 끌고 오므로 지연 로드 — 기본 도구 청크는 그대로 가볍게.
const OutsFromCards = lazyWithReload(() => import('../gto/OutsFromCards'));

type Mode = 'cards' | 'manual';
const MODE_KEY = 'nuri:outs-mode';

// 아웃츠 → 완성 확률(정확/간이) + 브레이크이븐 팟 오즈.
// 2026-08-29: '카드로 세기' 모드 추가 — 초보는 아웃을 셀 줄 몰라서 이 계산기 앞에서 막혔다.
//   기존 '직접 입력'(아웃 개수 손입력)은 **그대로 남긴다** — 셀 줄 아는 사람에겐 그게 제일 빠르고,
//   상대 카드를 모르는 상황(폴드한 핸드)에선 유일한 경로다.
export default function OutsCalc() {
  const [mode, setMode] = useState<Mode>(() => {
    try { return localStorage.getItem(MODE_KEY) === 'manual' ? 'manual' : 'cards'; } catch { return 'cards'; }
  });
  const pickMode = (m: Mode) => {
    setMode(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* quota·차단 환경 */ }
  };

  const [outs, setOuts] = useState(8);
  const [street, setStreet] = useState<'flop' | 'turn'>('flop'); // flop=2장(턴+리버), turn=1장(리버)

  const o = Math.max(0, Math.min(outs, 21));
  const unseen = street === 'flop' ? 47 : 46;
  const oneCard = o / unseen;
  const twoCard = 1 - ((unseen - o) / unseen) * ((unseen - 1 - o) / (unseen - 1));
  const exact = street === 'flop' ? twoCard : oneCard;
  const rule = street === 'flop' ? Math.min(o * 4, 100) : o * 2; // 4·2 법칙
  const pct = Math.round(exact * 1000) / 10;
  const breakeven = exact > 0 && exact < 1 ? `${(Math.round(((1 - exact) / exact) * 10) / 10).toFixed(1)} : 1` : '-';

  return (
    // 제목은 전체화면 헤더가 이미 표시 — 카드 안은 설명만(2중 노출 제거)
    <div className="space-y-3">
      <div className="flex gap-1.5" role="group" aria-label="아웃츠 입력 방식">
        {([{ id: 'cards', label: '카드로 세기' }, { id: 'manual', label: '직접 입력' }] as const).map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => pickMode(m.id)}
            className={[
              'h-9 flex-1 rounded-input border text-2xs font-bold leading-none transition-colors focus:outline-none',
              mode === m.id ? 'border-accent-300 bg-accent-300 text-white' : 'border-border-default bg-surface-high text-ink-muted hover:text-ink-secondary',
            ].join(' ')}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'cards' ? (
        <Suspense fallback={<p className="rounded-card border border-border-default bg-surface-low py-10 text-center text-2xs text-ink-muted">카드 계산기 불러오는 중…</p>}>
          {/* 앱이 센 아웃 개수를 직접 입력 모드에도 옮겨 담는다 — 모드를 바꿔도 그 핸드가 이어진다 */}
          <OutsFromCards onCounted={(n, s) => { setOuts(n); setStreet(s); }} />
        </Suspense>
      ) : (
        <CalcCard desc="남은 아웃츠로 완성 확률과 필요한 팟 오즈를 계산">
          <Field label="아웃츠 (남은 도움 카드 수)">
            {/* 디스카운트 아웃츠(예: 7.5장) 입력을 위해 소수 허용 */}
            <NumIn value={outs} onChange={setOuts} suffix="장" decimal />
          </Field>
          <Field label="시점">
            <div className="flex gap-1.5">
              {([{ id: 'flop', label: '플랍 (턴+리버 · 2장)' }, { id: 'turn', label: '턴 (리버 · 1장)' }] as const).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStreet(s.id)}
                  className={[
                    'flex-1 h-9 rounded-input text-2xs font-bold leading-none border transition-colors focus:outline-none',
                    street === s.id ? 'bg-accent-300 border-accent-300 text-white' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary',
                  ].join(' ')}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Result label="완성 확률 (정확)" value={`${pct}%`} accent />
            <Result label="간이 (4·2 법칙)" value={`≈${rule}%`} />
          </div>
          <Result label="브레이크이븐 팟 오즈" value={breakeven} />
          {street === 'flop' && (
            <p className="flex items-start gap-1 text-2xs leading-relaxed text-amber-400"><Icon name="alert" size={12} className="mt-px shrink-0" />한 스트리트 콜 판단은 1장 기준(2장 확률은 올인일 때만)</p>
          )}
          <p className="text-2xs leading-relaxed text-ink-muted">아웃을 셀 줄 모르면 <b className="text-ink-secondary">카드로 세기</b> 모드에서 카드만 고르세요.</p>
        </CalcCard>
      )}

      <div className="space-y-1.5 rounded-card border border-border-default bg-surface-low p-3">
        <p className="text-2xs leading-relaxed text-ink-muted">상대 베팅이 팟 대비 이 비율보다 작으면 콜이 이득입니다. (예: 3:1 이상이면 콜)</p>
        {/* 중복 인지 제거 — 실제 팟·콜 금액 대입은 팟 오즈 계산기로(딥링크, 계산 로직 불변) */}
        <a href="#tool=pot" className="block text-2xs font-semibold text-accent-300 transition-colors hover:text-accent-200">
          실제 팟·콜 금액으로 손익 따지기 — 팟 오즈 계산기 →
        </a>
        {/* 카드를 다 아는 핸드는 리플레이어가 스트리트별 승률 추이까지 보여준다 */}
        <a href="#tool=replay" className="block text-2xs font-semibold text-accent-300 transition-colors hover:text-accent-200">
          스트리트별로 다시 돌려보기 — 핸드 리플레이어 →
        </a>
      </div>
    </div>
  );
}
