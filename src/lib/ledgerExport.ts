// src/lib/ledgerExport.ts
// 장부를 Excel(.xls)로 내보내기 — 무의존성(HTML 테이블 → application/vnd.ms-excel).
// 한글/서식 유지, Excel에서 바로 열림. 기존 새틀빌지(BUY-IN LIST) 양식과 유사한 표 구성.
import type { LedgerBuyin, LedgerPlayer, LedgerSession, PaymentMethod, VisitorType } from '../api/ledger';
import { cardUnit } from '../api/ledger';

const METHOD_KO: Record<PaymentMethod, string> = {
  ticket: '티켓', cash: '현금', transfer: '이체', card: '카드', support: '가게지원',
};
const VISITOR_KO: Record<VisitorType, string> = { new: '신규방문', regular: '기존손님', staff: '관계자' };

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function hhmm(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return ''; }
}

export interface LedgerExportInput {
  venueName: string;
  session: LedgerSession;
  players: LedgerPlayer[];
  buyins: LedgerBuyin[];
}

export function buildLedgerHtml(input: LedgerExportInput): string {
  const { venueName, session, players, buyins } = input;
  const byPlayer = (name: string) => buyins.filter((b) => b.playerName === name).sort((a, b) => a.entryNo - b.entryNo);

  // 보드에 표기된 모든 플레이어(명단 ∪ 바인기록)
  const rosterNames = players.map((p) => p.name);
  const extra = [...new Set(buyins.map((b) => b.playerName))].filter((n) => !rosterNames.includes(n));
  const names = [...rosterNames, ...extra];
  const maxEntry = Math.max(1, ...buyins.map((b) => b.entryNo), ...names.map((n) => byPlayer(n).length));

  // 집계
  let totalBuyins = 0, ticket = 0, revenue = 0, unpaid = 0, support = 0;
  for (const b of buyins) {
    totalBuyins++;
    if (b.paymentMethod === 'support') support++;
    else if (b.paymentMethod === 'ticket') ticket++;
    else {
      const unit = b.paymentMethod === 'card' ? cardUnit(session) : session.buyinAmount;
      if (b.isUnpaid) unpaid += unit; else revenue += unit;
    }
  }

  const cellOf = (name: string, e: number): string => {
    const c = byPlayer(name).find((b) => b.entryNo === e);
    if (!c) return '';
    const tag = c.paymentMethod === 'support' ? '지원' : `${METHOD_KO[c.paymentMethod]}${c.isUnpaid ? '/미수' : '/완납'}`;
    return `${tag}<br>${hhmm(c.buyinAt)}`;
  };

  const headCols = Array.from({ length: maxEntry }, (_, i) => `<th>${i + 1}바인</th>`).join('');
  const bodyRows = names.map((name, i) => {
    const p = players.find((x) => x.name === name);
    const type = p?.visitorType ? VISITOR_KO[p.visitorType] : '';
    const note = p?.note ?? '';
    const cells = Array.from({ length: maxEntry }, (_, k) => {
      const v = cellOf(name, k + 1);
      const unpaidCell = v.includes('미수');
      return `<td style="text-align:center;${unpaidCell ? 'color:#c0392b;font-weight:bold;' : ''}">${v}</td>`;
    }).join('');
    return `<tr><td style="text-align:center;">${i + 1}</td><td>${esc(name)}</td><td style="text-align:center;">${esc(type)}</td>${cells}<td style="text-align:center;">${byPlayer(name).length}</td><td>${esc(note)}</td></tr>`;
  }).join('');

  const cardLine = session.cardAmount && session.cardAmount > 0
    ? `카드단가 ${session.cardAmount.toLocaleString()}원` : '카드단가 = 현금단가';

  const meta = [
    `매장: ${esc(venueName)}`,
    `일자: ${esc(session.sessionDate)}`,
    `게임: ${esc(session.title ?? '-')}`,
    `현금단가 ${session.buyinAmount.toLocaleString()}원 / ${cardLine}`,
    session.eventMemo ? `이벤트: ${esc(session.eventMemo)}` : '',
    session.dealers ? `딜러: ${esc(session.dealers.replace(/\n/g, ', '))}` : '',
    session.closed && session.closeMemo ? `마감메모: ${esc(session.closeMemo)}` : '',
  ].filter(Boolean).join('<br>');

  const totalColspan = maxEntry + 5;
  const summary = `총 엔트리 ${totalBuyins} · 회수 티켓 ${ticket}장 · 완납 매출 ${revenue.toLocaleString()}원 · 당일 미수금 ${unpaid.toLocaleString()}원 · 가게지원 ${support}건`;

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><style>
table{border-collapse:collapse;font-family:'Malgun Gothic',sans-serif;font-size:11px;}
th,td{border:1px solid #999;padding:4px 6px;mso-number-format:'\\@';}
th{background:#1f2937;color:#fff;}
caption{font-size:15px;font-weight:bold;padding:8px;text-align:left;}
</style></head><body>
<table>
<caption>${esc(venueName)} BUY-IN LIST</caption>
<tr><td colspan="${totalColspan}" style="text-align:left;">${meta}</td></tr>
<tr><th>번호</th><th>플레이어</th><th>유형</th>${headCols}<th>총바인</th><th>비고</th></tr>
${bodyRows}
<tr><td colspan="${totalColspan}" style="text-align:left;font-weight:bold;">${summary}</td></tr>
</table>
</body></html>`;
}

export function exportLedgerXls(input: LedgerExportInput): void {
  const html = buildLedgerHtml(input);
  const blob = new Blob(['﻿', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeName = (input.venueName || '장부').replace(/[\\/:*?"<>|]/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}_${input.session.sessionDate}_장부.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
