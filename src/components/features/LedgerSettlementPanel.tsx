// src/components/features/LedgerSettlementPanel.tsx
// 5단계 '정산' — **그날 하루를 총체적으로 마무리하는 판**.
//
// 오너 2026-09-08: "5번 정산을 누르면 그날 정산이 나와야 하는데 왜 장부로 이동되는지 모르겠어.
//   정산 탭을 활성화 … 신규손님, 기존손님, 바인을 많이한 손님, 머니인을 한 순위, 미수, 총 매출,
//   기준엔트리 대비 매출 및 손익 등등 … 매장 업주들이 궁금해할 모든 것".
//
// 예전에는 '정산'이 판이 아니라 **장부 하단 정산바로 데려가는 이동**이었다(2026-09-06 판단).
// 그 판단을 오너가 뒤집었다 — 그날 마감은 장부 한 줄이 아니라 하루 전체의 결산이라는 것.
// 장부의 정산바·마감 모달은 그대로 둔다(그건 '이 게임 하나를 닫는' 도구다). 이 판은 그 위층이다.
//
// ⚠ 금액은 전부 settlementReport(=buyinFinance) 로만 만든다. 여기서 따로 합산하면
//   장부·통계·CSV 와 갈린다 — 실제로 CRM 이 그렇게 갈린 적이 있다(ledger.ts F04 주석).
// ⚠ 플랫폼: 매장 운영은 PC 99%(CLAUDE.md). 데스크톱 2열을 기본으로 두고 모바일은 1열로 접는다.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Icon, { type IconName } from '../atoms/Icon';
import { EmptyState } from '../atoms/Skeleton';
import {
  getLedgerRange, getLedgerPlayers, kstToday, visitorLabel, wonToMan, WON_PER_MAN,
  type LedgerBuyin, type LedgerPlayer, type LedgerSession,
} from '../../api/ledger';
import { settlementReport, type SettlePlayer, type SettlementReport } from '../../lib/ledgerSettlement';

const man = (won: number) => `${wonToMan(won)}만`;

export default function LedgerSettlementPanel({ venueId, date, active = true }: {
  venueId: string;
  /** 정산할 날짜(YYYY-MM-DD). 없으면 오늘. */
  date?: string | null;
  active?: boolean;
}) {
  const [day, setDay] = useState<string>(date ?? kstToday());
  // 부모(단계 바)가 다른 날짜를 실어 보내면 따라간다 — 사용자가 여기서 바꾼 날짜는 그대로 둔다.
  useEffect(() => { if (date) setDay(date); }, [date]);

  const [data, setData] = useState<{ sessions: LedgerSession[]; buyins: LedgerBuyin[]; players: LedgerPlayer[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!venueId) return;
    setData(null); setErr(null);
    getLedgerRange(venueId, day, day)
      .then(async ({ sessions, buyins }) => {
        // 명단은 게임별 조회밖에 없다. 하루의 게임은 보통 1~3개라 그대로 병렬로 부른다.
        const rosters = await Promise.all(sessions.map((s) => getLedgerPlayers(venueId, day, s.gameSeq).catch(() => [])));
        setData({ sessions, buyins, players: rosters.flat() });
      })
      // 통계는 '0원'과 '못 불러옴'이 시각적으로 같아서 특히 위험하다 — 실패를 빈 화면으로 위장하지 않는다.
      .catch((e) => setErr(e instanceof Error ? e.message : '정산 자료를 불러오지 못했습니다'));
  }, [venueId, day]);
  useEffect(() => { if (active) load(); }, [active, load]);

  const r: SettlementReport | null = useMemo(
    () => (data ? settlementReport(day, data.sessions, data.buyins, data.players) : null),
    [data, day],
  );

  return (
    <section className="space-y-4">
      {/* ── 날짜 · 새로고침 ── */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="text-2xs font-semibold text-ink-muted">정산일</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value || kstToday())}
            className="input h-10 text-sm tabular-nums" aria-label="정산할 날짜" />
        </label>
        <button type="button" onClick={load} className="btn-ghost h-10 px-3 text-xs">새로고침</button>
        {r && r.games.length > 0 && (
          <span className={`inline-flex items-center gap-1 rounded-badge border px-2 py-1 text-2xs font-bold ${r.allClosed
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>
            <Icon name={r.allClosed ? 'check' : 'clock'} size={12} />
            {r.allClosed ? '전 게임 마감됨' : `미마감 ${r.games.filter((g) => !g.closed).length}게임`}
          </span>
        )}
      </div>

      {err && (
        <p className="rounded-input border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs text-danger-light">{err}</p>
      )}
      {!err && !r && (
        <div className="space-y-3" aria-busy="true">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-aura" />)}</div>
          <div className="skeleton h-40 rounded-aura" />
        </div>
      )}

      {!err && r && r.games.length === 0 && (
        <div className="rounded-aura border card-aura">
          <EmptyState icon={<Icon name="book-open" />} title="이 날짜에 연 장부가 없습니다."
            desc="장부 단계에서 그날 장부를 열면 여기 정산이 만들어집니다." />
        </div>
      )}

      {!err && r && r.games.length > 0 && <Report r={r} />}
    </section>
  );
}

function Report({ r }: { r: SettlementReport }) {
  const t = r.total;
  // 기준 대비 — 기준 엔트리가 없으면 아무 말도 하지 않는다(0 대비 퍼센트는 의미가 없다).
  const hasTarget = t.targetEntries > 0;
  const entryRate = hasTarget ? Math.round((t.entries / t.targetEntries) * 100) : 0;
  const gapWon = t.revenue - t.targetRevenue;

  return (
    <div className="space-y-4">
      {/* ── ① 오늘의 숫자 넷 ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="완납 매출" value={man(t.revenue)} tone="emerald" hint="현금 + 카드 + 이체" />
        <Kpi label="미수금" value={man(t.unpaid)} tone={t.unpaid > 0 ? 'danger' : 'muted'} hint="아직 못 받은 참가비" />
        <Kpi label="총 엔트리" value={t.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })} tone="accent"
          hint={`바인 ${t.buyinCount}건 · 할인 반영`} />
        <Kpi label="참여 인원" value={`${r.people}명`} tone="accent"
          hint={`신규 ${r.newPeople} · 기존 ${r.regularPeople}`} />
      </div>

      {/* ── ② 기준 엔트리 대비 ── */}
      <Card title="기준 엔트리 대비" icon="target"
        note="상금·인건비·임대료는 장부에 없습니다. 여기 '차액'은 순이익이 아니라 기준 매출과의 차이입니다.">
        {hasTarget ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Line label="기준 엔트리" value={`${t.targetEntries.toLocaleString()}`} sub={`달성 ${entryRate}%`}
              tone={entryRate >= 100 ? 'emerald' : entryRate >= 80 ? 'amber' : 'danger'} />
            <Line label="기준 매출" value={man(t.targetRevenue)} sub="기준 엔트리 × 현금 단가" />
            <Line label="기준 대비 차액" value={`${gapWon >= 0 ? '+' : '−'}${man(Math.abs(gapWon))}`}
              sub={gapWon >= 0 ? '기준을 넘었습니다' : '기준에 못 미쳤습니다'}
              tone={gapWon >= 0 ? 'emerald' : 'danger'} />
          </div>
        ) : (
          <p className="text-2xs text-ink-muted">이 날짜의 장부에 <b className="text-ink-secondary">기준 엔트리</b>가 설정되어 있지 않아 대비를 계산하지 않았습니다. 장부 세션 정보에서 설정할 수 있어요.</p>
        )}
      </Card>

      {/* ── ③ 수단 분해(대차표) ── */}
      <Card title="받은 방법" icon="wallet" note="총바인 가치 = 정가 − 할인 = 아래 합계. 행마다 성립하므로 합계도 성립합니다.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="현금" value={man(t.tender.cash)} />
          <Tile label="카드" value={man(t.tender.card)} />
          <Tile label="이체" value={man(t.tender.transfer)} />
          <Tile label="이용권(티켓)" value={man(t.tender.ticket)} sub={`${Math.round(t.tender.ticket / WON_PER_MAN)}T`} />
          <Tile label="가게지원" value={man(t.tender.support)} />
          <Tile label="미수" value={man(t.tender.unpaid)} tone={t.tender.unpaid > 0 ? 'danger' : undefined} />
        </div>
        <dl className="mt-3 grid gap-2 border-t border-border-subtle pt-3 sm:grid-cols-3">
          <Row label="총바인 가치" value={man(t.value)} />
          <Row label="할인" value={`${t.discount.count}건 · ${man(t.discount.total)}`}
            sub={t.discount.cashTotal > 0 ? `덜 받은 현금 ${man(t.discount.cashTotal)}` : undefined} />
          <Row label="할인이 없었다면 매출" value={man(t.revenue + t.discount.cashTotal)} />
        </dl>
        {t.removed.count > 0 && (
          <p className="mt-3 rounded-input border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2 text-2xs text-ink-secondary">
            정산에서 제외된 행 <b className="tabular-nums">{t.removed.count}건</b>
            {' '}(엔트리 {t.removed.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })} · 매출 {man(t.removed.revenue)})은 위 합계에 들어 있지 않습니다.
          </p>
        )}
      </Card>

      {/* ── ④ 손님 구성 ── */}
      <Card title="손님 구성" icon="users" note="유형은 장부 명단에 적힌 값입니다. 유형을 안 적은 손님은 '미분류'로 모입니다.">
        <ul className="flex flex-wrap gap-2">
          {r.visitors.map((v) => (
            <li key={v.key || '_'} className="rounded-input border card-aura-sub px-3 py-2">
              <p className="text-2xs font-semibold text-ink-muted">{visitorLabel(v.key) || '미분류'}</p>
              <p className="text-base font-extrabold tabular-nums text-ink-primary">{v.people}<span className="ml-0.5 text-2xs font-semibold text-ink-muted">명</span></p>
              <p className="text-2xs tabular-nums text-ink-muted">바인 {v.buyins}건 · {man(v.moneyIn)}</p>
            </li>
          ))}
        </ul>
      </Card>

      {/* ── ⑤ 순위 셋 ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Rank title="바인을 많이 한 손님" icon="chip-stack" rows={r.topByBuyins}
          value={(p) => `${p.buyins}회`} sub={(p) => man(p.moneyIn)}
          empty="바인 기록이 없습니다." />
        <Rank title="머니인 순위" icon="trending-up" rows={r.topByMoneyIn}
          value={(p) => man(p.moneyIn)} sub={(p) => `바인 ${p.buyins}회`}
          note="머니인 = 게임에 넣은 가치(이용권·가게지원 포함). 받은 현금과 다릅니다."
          empty="머니인 기록이 없습니다." />
        <Rank title="미수 손님" icon="alert" rows={r.unpaidPlayers}
          value={(p) => man(p.unpaid)} sub={(p) => `받은 금액 ${man(p.paid)}`} tone="danger"
          empty="미수가 없습니다." />
      </div>

      {/* ── ⑥ 게임별 내역 ── */}
      {r.games.length > 1 && (
        <Card title="게임별 내역" icon="layers" note="합계만 보면 어느 게임이 기준에 못 미쳤는지 알 수 없습니다.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-2xs text-ink-muted">
                  <th className="py-1.5 pr-2 font-semibold">게임</th>
                  <th className="py-1.5 px-2 text-right font-semibold">엔트리</th>
                  <th className="py-1.5 px-2 text-right font-semibold">기준</th>
                  <th className="py-1.5 px-2 text-right font-semibold">완납 매출</th>
                  <th className="py-1.5 px-2 text-right font-semibold">미수</th>
                  <th className="py-1.5 pl-2 text-right font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {r.games.map((g) => (
                  <tr key={g.gameSeq} className="border-b border-border-subtle/60 last:border-0">
                    <td className="py-2 pr-2 font-semibold text-ink-primary">{g.title}</td>
                    <td className="py-2 px-2 text-right text-ink-secondary">{g.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                    <td className="py-2 px-2 text-right text-ink-muted">{g.targetEntries > 0 ? g.targetEntries : '—'}</td>
                    <td className="py-2 px-2 text-right font-bold text-emerald-700 dark:text-emerald-300">{man(g.revenue)}</td>
                    <td className={`py-2 px-2 text-right ${g.unpaid > 0 ? 'font-bold text-danger-light' : 'text-ink-muted'}`}>{man(g.unpaid)}</td>
                    <td className="py-2 pl-2 text-right text-2xs">
                      {g.closed ? <span className="text-emerald-600 dark:text-emerald-400">마감</span> : <span className="text-amber-500">진행</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── ⑦ 손님별 전체 ── */}
      <Card title="손님별 정산" icon="list-ordered" note="머니인 많은 순. 명단에만 있고 바인이 없는 손님도 인원에는 들어갑니다.">
        <div className="max-h-[28rem] overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-surface-mid">
              <tr className="border-b border-border-subtle text-2xs text-ink-muted">
                <th className="py-1.5 pr-2 font-semibold">손님</th>
                <th className="py-1.5 px-2 font-semibold">유형</th>
                <th className="py-1.5 px-2 text-right font-semibold">바인</th>
                <th className="py-1.5 px-2 text-right font-semibold">머니인</th>
                <th className="py-1.5 px-2 text-right font-semibold">받은 금액</th>
                <th className="py-1.5 pl-2 text-right font-semibold">미수</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.players.map((p) => (
                <tr key={p.name} className="border-b border-border-subtle/60 last:border-0">
                  <td className="py-2 pr-2 font-semibold text-ink-primary">{p.name}</td>
                  <td className="py-2 px-2 text-2xs text-ink-muted">{visitorLabel(p.visitorType) || '—'}</td>
                  <td className="py-2 px-2 text-right text-ink-secondary">{p.buyins}</td>
                  <td className="py-2 px-2 text-right text-ink-secondary">{man(p.moneyIn)}</td>
                  <td className="py-2 px-2 text-right text-emerald-700 dark:text-emerald-300">{man(p.paid)}</td>
                  <td className={`py-2 pl-2 text-right ${p.unpaid > 0 ? 'font-bold text-danger-light' : 'text-ink-muted'}`}>{man(p.unpaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── 작은 부품 ────────────────────────────────────────────────────────────────

const TONE: Record<string, string> = {
  emerald: 'text-emerald-700 dark:text-emerald-300',
  danger: 'text-danger-light',
  amber: 'text-amber-600 dark:text-amber-300',
  accent: 'text-accent-200',
  muted: 'text-ink-secondary',
};

function Kpi({ label, value, hint, tone = 'muted' }: { label: string; value: string; hint?: string; tone?: keyof typeof TONE | string }) {
  return (
    <div className="rounded-aura border card-aura px-3 py-2.5">
      <p className="text-2xs font-semibold text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-extrabold tabular-nums ${TONE[tone] ?? TONE.muted}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-2xs text-ink-muted" title={hint}>{hint}</p>}
    </div>
  );
}

function Card({ title, icon, note, children }: { title: string; icon: IconName; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-aura border card-aura p-3.5">
      <div className="mb-2.5 flex items-center gap-2 border-b border-border-subtle pb-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad" aria-hidden>
          <Icon name={icon} size={14} />
        </span>
        <h3 className="text-sm font-bold text-ink-primary">{title}</h3>
      </div>
      {children}
      {note && <p className="mt-2.5 text-2xs leading-relaxed text-ink-muted">{note}</p>}
    </section>
  );
}

function Line({ label, value, sub, tone = 'muted' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-input border card-aura-sub px-3 py-2">
      <p className="text-2xs font-semibold text-ink-muted">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${TONE[tone] ?? TONE.muted}`}>{value}</p>
      {sub && <p className="text-2xs text-ink-muted">{sub}</p>}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-input border card-aura-sub px-2.5 py-2">
      <p className="truncate text-2xs font-semibold text-ink-muted" title={label}>{label}</p>
      <p className={`text-sm font-extrabold tabular-nums ${tone ? TONE[tone] : 'text-ink-primary'}`}>{value}</p>
      {sub && <p className="text-2xs tabular-nums text-ink-muted">{sub}</p>}
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="shrink-0 text-2xs font-semibold text-ink-muted">{label}</dt>
      <dd className="text-sm font-bold tabular-nums text-ink-primary">{value}{sub && <span className="ml-1 text-2xs font-normal text-ink-muted">{sub}</span>}</dd>
    </div>
  );
}

function Rank({ title, icon, rows, value, sub, empty, note, tone }: {
  title: string; icon: IconName; rows: SettlePlayer[];
  value: (p: SettlePlayer) => string; sub: (p: SettlePlayer) => string;
  empty: string; note?: string; tone?: string;
}) {
  // 상위 8명 — 그 아래는 '손님별 정산' 표가 전부 보여준다. 잘랐다는 사실은 밝힌다.
  const top = rows.slice(0, 8);
  return (
    <Card title={title} icon={icon} note={note}>
      {top.length === 0 ? (
        <p className="py-3 text-center text-2xs text-ink-muted">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {top.map((p, i) => (
            <li key={p.name} className="flex items-center gap-2 rounded-input border card-aura-sub px-2.5 py-1.5">
              <span className="w-4 shrink-0 text-center text-2xs font-bold tabular-nums text-ink-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary" title={p.name}>{p.name}</span>
              <span className="shrink-0 text-right">
                <span className={`block text-xs font-extrabold tabular-nums ${tone ? TONE[tone] : 'text-ink-primary'}`}>{value(p)}</span>
                <span className="block text-2xs tabular-nums text-ink-muted">{sub(p)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {rows.length > top.length && (
        <p className="mt-2 text-2xs text-ink-muted">상위 {top.length}명만 표시 — 나머지 {rows.length - top.length}명은 아래 ‘손님별 정산’에 있습니다.</p>
      )}
    </Card>
  );
}
