// src/components/features/UnpaidCollect.tsx
// 마감된 장부의 미수 받기(오너 2026-10-03 Q2: "게임이 완전히 마감된 뒤의 손님 미수는 직원도 받을 수 있지만 비밀번호를 입력해야 한다").
//
// 장부(마감 띠)와 정산 탭(직원 판)이 같이 쓴다 — 미수 판정·금액·비밀번호·오류 처리를 한 벌로.
// 서버 settle_unpaid_after_close(20261003h)가 정본이다: 마감 그대로 · 결제 수단만 바꿈 · 총액 불변 검사 · 감사 기록.
// 비밀번호 규칙은 바인 취소와 같다 — 설정 매장은 업주도 넣고, 미설정 매장은 업주·공동운영자만 비밀번호 없이(직원은 불가).
import { useEffect, useRef, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import {
  addonFinance, buyinFinance, cancelPwStateFromError, hasUnpaid, ledgerErrorText, ledgerHintOf, settleUnpaidAfterClose, wonToMan,
  LEDGER_NOTHING_UNPAID, type LedgerBuyin, type LedgerSession, type SettleMethod, type SettlePart,
} from '../../api/ledger';
import { ledgerGameLabel } from '../../lib/ledgerLink';

export interface UnpaidItem { b: LedgerBuyin; buyinWon: number; addonWon: number }

/** 미수가 남은 행과 그 금액 — 금액은 장부·정산과 같은 정본(buyinFinance·addonFinance)으로만 센다. */
export function unpaidItemsOf(buyins: readonly LedgerBuyin[], sessionOf: (b: LedgerBuyin) => LedgerSession | undefined): UnpaidItem[] {
  const out: UnpaidItem[] = [];
  for (const b of buyins) {
    if (!hasUnpaid(b)) continue;
    const s = sessionOf(b);
    const buyinWon = s ? buyinFinance(b, s).unpaid : (b.isSplit ? b.unpaidAmount : 0);
    out.push({ b, buyinWon, addonWon: addonFinance(b).unpaid });
  }
  return out.sort((x, y) => x.b.gameSeq - y.b.gameSeq || x.b.playerName.localeCompare(y.b.playerName) || x.b.entryNo - y.b.entryNo);
}

const METHODS: { v: SettleMethod; label: string }[] = [{ v: 'cash', label: '현금' }, { v: 'card', label: '카드' }, { v: 'transfer', label: '이체' }];

export default function UnpaidCollectList({ items, hasPw, canManage, showGame = false, onDone, onPwState, emptyText }: {
  items: UnpaidItem[];
  /** 받을 미수가 처음부터 없을 때 보일 문구(없으면 아무것도 그리지 않는다). */
  emptyText?: string;
  /** 매장에 취소 비밀번호가 설정됐는가(posHasPassword). */
  hasPw: boolean;
  /** can_manage_pos — 미설정 매장에서 비밀번호 없이 받을 수 있는가. */
  canManage: boolean;
  /** 여러 게임을 한 목록에 보일 때(정산 탭) 게임 이름을 붙인다. */
  showGame?: boolean;
  /** 성공·'이미 받음' 뒤 — 호출부가 장부를 **직접** 다시 읽는다(직원에게 회수한 지난 행은 RLS 로 사라져 Realtime 이 안 온다). */
  onDone: () => void;
  /** 서버 문구로 알아낸 비밀번호 설정 여부(틀림·잠김 = 있음, 미설정 = 없음). */
  onPwState?: (has: boolean) => void;
}) {
  const toast = useToast();
  const [target, setTarget] = useState<UnpaidItem | null>(null);
  const [method, setMethod] = useState<SettleMethod>('cash');
  const [part, setPart] = useState<SettlePart>('all');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // 키보드(design-reviewer 2026-10-03 비차단 2) — 창의 첫 포커스는 비밀번호 칸(없으면 첫 선택). Modal 의 공용 첫 포커스(50ms, 헤더 '닫기')
  //   뒤에 옮긴다. 성공하면 창을 연 버튼이 목록과 함께 사라지므로 목록 머리로 돌려준다(BODY 로 떨어지지 않게).
  const formRef = useRef<HTMLFormElement>(null);
  const headRef = useRef<HTMLParagraphElement>(null);
  const [done, setDone] = useState(false);
  const tid = target?.b.id;
  useEffect(() => {
    if (!tid) return;
    const t = window.setTimeout(() => {
      const f = formRef.current;
      (f?.querySelector<HTMLElement>('[data-first-focus]') ?? f?.querySelector<HTMLElement>('[role="radio"]'))?.focus({ preventScroll: true });
    }, 150);
    return () => window.clearTimeout(t);
  }, [tid]);
  if (items.length === 0 && !done) return emptyText ? <p className="py-4 text-center text-2xs text-ink-muted">{emptyText}</p> : null;
  const open = (it: UnpaidItem) => { setTarget(it); setMethod('cash'); setPart('all'); setPw(''); setErr(''); };
  const both = !!target && target.buyinWon > 0 && target.addonWon > 0;
  const won = !target ? 0 : part === 'buyin' ? target.buyinWon : part === 'addon' ? target.addonWon : target.buyinWon + target.addonWon;
  const noPwOk = !hasPw && canManage;
  const blocked = !hasPw && !canManage;
  const submit = async () => {
    if (!target || busy) return;
    setBusy(true); setErr('');
    try {
      await settleUnpaidAfterClose(target.b.id, method, noPwOk ? null : pw, both ? part : 'all');
      toast.show(`${target.b.playerName} 미수 ${wonToMan(won)}만원 받음 · ${METHODS.find((m) => m.v === method)?.label}`, 'success');
      setDone(true);
      setTarget(null);
      onDone();
      window.setTimeout(() => headRef.current?.focus({ preventScroll: true }), 200);
    } catch (e) {
      const text = ledgerErrorText(e, '미수를 받지 못했습니다');
      const st = cancelPwStateFromError(text);
      if (st !== null) onPwState?.(st);
      if (ledgerHintOf(e) === LEDGER_NOTHING_UNPAID) { toast.show(text, 'info'); setTarget(null); onDone(); return; }
      setErr(text);
      // 틀린 비밀번호 뒤 바로 다시 칠 수 있게 — 비밀번호 칸으로 돌아가 값 전체 선택(design-reviewer 재검토 비차단).
      window.setTimeout(() => {
        const el = formRef.current?.querySelector<HTMLInputElement>('[data-testid="unpaid-collect-pw"]');
        if (el) { el.focus({ preventScroll: true }); el.select(); }
      }, 0);
    } finally { setBusy(false); }
  };
  return (
    <div data-testid="unpaid-collect" className="space-y-1.5">
      <p ref={headRef} tabIndex={-1} data-testid="unpaid-collect-head" className={`text-2xs font-bold outline-none ${items.length ? 'text-danger-light' : 'text-emerald-400'}`}>
        {items.length ? `받을 미수 ${items.length}건` : '받을 미수를 모두 받았어요'}
      </p>
      {items.length > 0 && <ul className="divide-y divide-border-subtle rounded-input border border-danger/30 bg-danger/5">
        {items.map((it) => (
          <li key={it.b.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-ink-primary">
              {showGame && <span className="mr-1 text-2xs text-ink-muted">{ledgerGameLabel(it.b.gameSeq)}</span>}
              {it.b.playerName}{it.b.entryNo > 1 ? <span className="text-ink-muted"> · {it.b.entryNo}번째</span> : null}
              {it.addonWon > 0 && <span className="ml-1 text-2xs text-ink-muted">{it.buyinWon > 0 ? '바인+애드온' : '애드온'}</span>}
            </span>
            <b className="shrink-0 tabular-nums text-danger-light">{wonToMan(it.buyinWon + it.addonWon)}만</b>
            <button type="button" data-testid="unpaid-collect-btn" onClick={() => open(it)}
              className="btn-ghost tap-y-44 shrink-0 px-2.5 text-2xs font-bold text-accent-300">미수 받기</button>
          </li>
        ))}
      </ul>}
      <Modal open={!!target} onClose={() => !busy && setTarget(null)} title="미수 받기" variant="center" maxWidth="sm">
        {target && (
          <form ref={formRef} onSubmit={(e) => { e.preventDefault(); if (!(busy || blocked || (!noPwOk && !pw))) void submit(); }} className="space-y-3 p-4">
            <p className="text-sm text-ink-primary"><b>{target.b.playerName}</b> · {ledgerGameLabel(target.b.gameSeq)} · <b className="tabular-nums text-danger-light">{wonToMan(won)}만원</b></p>
            {both && (
              <div role="radiogroup" aria-label="받을 항목" className="flex gap-1.5">
                {([['all', '모두'], ['buyin', '바인만'], ['addon', '애드온만']] as const).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={part === v} onClick={() => setPart(v)}
                    className={['btn-sm tap-y-44 flex-1 rounded-input border text-xs font-bold', part === v ? 'border-accent-400 bg-accent-300/15 text-accent-200' : 'border-border-default text-ink-secondary'].join(' ')}>{l}</button>
                ))}
              </div>
            )}
            <div role="radiogroup" aria-label="받은 방법" className="flex gap-1.5">
              {METHODS.map((m) => (
                <button key={m.v} type="button" role="radio" aria-checked={method === m.v} onClick={() => setMethod(m.v)}
                  className={['btn-sm tap-y-44 flex-1 rounded-input border text-xs font-bold', method === m.v ? 'border-accent-400 bg-accent-300/15 text-accent-200' : 'border-border-default text-ink-secondary'].join(' ')}>{m.label}</button>
              ))}
            </div>
            {blocked ? (
              <p role="note" className="text-2xs text-ink-muted">취소 비밀번호가 설정되지 않은 매장은 업주·공동운영자만 받을 수 있어요. 업주에게 비밀번호 설정을 요청하세요.</p>
            ) : noPwOk ? (
              <p className="text-2xs text-ink-muted">취소 비밀번호가 설정되지 않은 매장이라 비밀번호 없이 받습니다.</p>
            ) : (
              <input type="password" inputMode="numeric" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)}
                placeholder="취소 비밀번호" aria-label="취소 비밀번호" data-testid="unpaid-collect-pw" data-first-focus className="input min-h-[44px] w-full text-sm" />
            )}
            {err && <p role="alert" className="text-2xs text-danger-light">{err}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setTarget(null)} disabled={busy} className="btn-ghost min-h-[44px] flex-1 text-xs">닫기</button>
              <button type="submit" data-testid="unpaid-collect-confirm" disabled={busy || blocked || (!noPwOk && !pw)}
                className="btn-primary min-h-[44px] flex-1 text-xs disabled:opacity-50">{busy ? '처리 중…' : '받음으로 기록'}</button>
            </div>
            <p className="text-2xs text-ink-muted">마감은 그대로이고 결제 수단만 바뀝니다. 누가 언제 받았는지 기록이 남습니다.</p>
          </form>
        )}
      </Modal>
    </div>
  );
}
