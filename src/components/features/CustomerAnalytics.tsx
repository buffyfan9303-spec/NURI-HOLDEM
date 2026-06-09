import { useEffect, useMemo, useState } from 'react';
import { getVenueCustomerStats, paymentLabel, type CustomerStat } from '../../api/reservations';
import { toCsv, downloadCsv } from '../../lib/csv';

type Range = 'all' | '7' | '30' | '90';

/**
 * 고객 분석 — 방문 손님 전체 리스트(장부 기준).
 * 바인 횟수 · 방문 · 머니인(입상) · 머니인 비율 · 미수 · 최다 결제수단 · 주 방문 시간대 · 최근 방문.
 * 기간(전체/7/30/90일) + 이름 검색 + CSV.
 */
export default function CustomerAnalytics({ venueId }: { venueId: string }) {
  const [range, setRange] = useState<Range>('all');
  const [rows, setRows] = useState<CustomerStat[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'buyins' | 'visits' | 'rate' | 'unpaid' | 'recent'>('buyins');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const from = range === 'all' ? undefined
      : new Date(Date.now() - Number(range) * 86400000).toLocaleDateString('en-CA');
    getVenueCustomerStats(venueId, from)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [venueId, range]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : [...rows];
    arr.sort((a, b) =>
      sort === 'visits' ? b.visits - a.visits
      : sort === 'rate'   ? (b.rate ?? -1) - (a.rate ?? -1)
      : sort === 'unpaid' ? b.unpaidCount - a.unpaidCount
      : sort === 'recent' ? String(b.lastVisit ?? '').localeCompare(String(a.lastVisit ?? ''))
      : b.buyins - a.buyins);
    return arr;
  }, [rows, query, sort]);

  const exportCsv = () => {
    const csv = toCsv(
      ['이름', '바인', '방문', '머니인', '머니인비율(%)', '미수횟수', '최다결제', '주방문시간', '최근방문'],
      filtered.map((r) => [r.name, r.buyins, r.visits, r.moneyIn, r.rate ?? '', r.unpaidCount, paymentLabel(r.topPayment), r.peakHour !== null ? `${r.peakHour}시` : '', r.lastVisit ?? '']),
    );
    downloadCsv(`고객분석_${range === 'all' ? '전체' : `최근${range}일`}`, csv);
  };

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-ink-primary">고객 분석</h3>
          <p className="text-2xs text-ink-muted">방문했던 손님 전체 — 장부 기준 행동 통계 ({rows.length}명)</p>
        </div>
        <button type="button" onClick={exportCsv} className="btn-ghost shrink-0 px-2 text-2xs text-gold-300">CSV</button>
      </div>

      {/* 기간 + 검색 + 정렬 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-0.5 rounded-input bg-surface-high p-0.5">
          {([['all', '전체'], ['7', '7일'], ['30', '30일'], ['90', '90일']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setRange(id)}
              className={['rounded-[6px] px-2.5 py-1 text-2xs font-bold transition-colors',
                range === id ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
              {label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름 검색"
          className="input min-w-0 flex-1 text-sm py-1.5" />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input w-auto shrink-0 text-2xs py-1.5">
          <option value="buyins">바인순</option>
          <option value="visits">방문순</option>
          <option value="rate">머니인 비율순</option>
          <option value="unpaid">미수순</option>
          <option value="recent">최근 방문순</option>
        </select>
      </div>

      {loading ? (
        <p className="py-8 text-center text-2xs text-ink-muted">불러오는 중…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-2xs text-ink-muted">{query ? '검색 결과가 없습니다.' : '이 기간의 장부 기록이 없습니다.'}</p>
      ) : (
        <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
          {filtered.slice(0, 200).map((r) => (
            <li key={r.name} className="rounded-input border border-border-subtle bg-surface-high px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-bold text-ink-primary">
                  {r.name}
                  {r.buyins >= 5 && <span className="ml-1.5 rounded-badge bg-gold-300/15 px-1.5 py-0.5 text-[10px] font-bold text-gold-300">단골</span>}
                  {r.unpaidCount > 0 && <span className="ml-1 rounded-badge bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold text-danger-light">미수 {r.unpaidCount}</span>}
                </p>
                {r.lastVisit && <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">최근 {r.lastVisit.slice(5)}</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-ink-muted">
                <span>바인 <b className="tabular-nums text-ink-secondary">{r.buyins}</b>회</span>
                <span>방문 <b className="tabular-nums text-ink-secondary">{r.visits}</b>회</span>
                <span>머니인 <b className="tabular-nums text-ink-secondary">{r.moneyIn}</b>회</span>
                <span>비율 <b className={['tabular-nums', (r.rate ?? 0) >= 30 ? 'text-gold-300' : 'text-ink-secondary'].join(' ')}>{r.rate !== null ? `${r.rate}%` : '-'}</b></span>
                <span>결제 <b className="text-ink-secondary">{paymentLabel(r.topPayment)}</b></span>
                {r.peakHour !== null && <span>주 방문 <b className="tabular-nums text-ink-secondary">{r.peakHour}시</b></span>}
              </div>
            </li>
          ))}
          {filtered.length > 200 && <li className="py-1 text-center text-[10px] text-ink-muted">상위 200명까지 표시 — 검색으로 좁혀보세요.</li>}
        </ul>
      )}
    </section>
  );
}
