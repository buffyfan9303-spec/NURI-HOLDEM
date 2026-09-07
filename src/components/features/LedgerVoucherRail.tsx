// src/components/features/LedgerVoucherRail.tsx — 장부 옆 '매장이용권 실시간 내역' 레일.
//
// 오너 지시(2026-09-06): 장부에 들어가면 우측에서 이용권이 들어오는 걸 실시간으로 보고 싶다.
// 전체화면에서는 방송 채팅처럼 계속 흐르는 자리로 쓴다.
//
// 설계 판단 셋:
//  ① **최신이 위**다. 채팅은 아래로 쌓이지만 이건 운영 중에 흘깃 보는 판이다 —
//     아래로 쌓으면 새 줄을 보려고 매번 스크롤을 따라가야 한다. 위로 쌓으면 눈만 올리면 된다.
//  ② 한 장의 이용권이 **두 사건**을 만든다: 발급(입)과 사용(출). 두 사건은 시각이 다르므로
//     행을 두 개로 펼쳐 시간순으로 섞는다. 회수는 시각 컬럼이 없어 발급 행에 배지로만 표시한다
//     (없는 시각을 지어내면 순서가 거짓말이 된다).
//  ③ 실시간 구독 + 30초 폴링을 **둘 다** 건다. 구독은 조용히 끊길 수 있고(지하 매장·절전),
//     끊긴 걸 알아채는 순간이 곧 손님과 다투는 순간이다. 폴링은 그 조용한 실패의 바닥이다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../atoms/Icon';
import { Skeleton } from '../atoms/Skeleton';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { listVenueVouchers, subscribeVenueVouchers, type Voucher } from '../../api/vouchers';
import { toFeedRows, summarizeFor } from '../../lib/voucherFeed';

const POLL_MS = 30_000;

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function LedgerVoucherRail({ venueId, active = true, dense = false }: {
  venueId: string;
  /** 이 판이 실제로 보이는가 — 안 보이면 구독·폴링을 걸지 않는다(무료 한도의 egress 를 아낀다) */
  active?: boolean;
  /** 전체화면처럼 세로가 긴 자리에서 줄 간격을 조인다 */
  dense?: boolean;
}) {
  const [vs, setVs] = useState<Voucher[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<number | null>(null); // 마지막으로 받아온 시각
  const alive = useRef(true);

  const load = useCallback(async (manual = false) => {
    if (manual) setBusy(true);
    try {
      const rows = await listVenueVouchers(venueId);
      if (!alive.current) return;
      setVs(rows); setErr(null); setAt(Date.now());
    } catch (e) {
      if (alive.current) setErr(e);
    } finally { if (alive.current) setBusy(false); }
  }, [venueId]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!active) return;
    load();
    // 30초 폴링 — 오너 지시. 구독이 조용히 끊겨도 최소 30초 안에는 따라잡는다.
    const t = window.setInterval(() => load(), POLL_MS);
    const un = subscribeVenueVouchers(venueId, () => load()); // 즉시 반영(구독이 살아 있을 때)
    return () => { window.clearInterval(t); un(); };
  }, [venueId, active, load]);

  const now = Date.now();
  const rows = useMemo(() => (vs ? toFeedRows(vs, now) : []), [vs, now]);
  const query = q.trim().toLowerCase();
  const shown = useMemo(
    () => (query ? rows.filter((r) => r.name.toLowerCase().includes(query) || r.title.toLowerCase().includes(query)) : rows),
    [rows, query],
  );

  // 검색어가 있으면 '그 사람에게 보냈는지'를 한 줄로 먼저 답한다 — 그게 이 검색의 목적이다.
  const hit = useMemo(() => (vs ? summarizeFor(vs, q, now) : null), [vs, q, now]);

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-aura border card-aura" aria-label="매장이용권 실시간 내역">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-fuchsia">
          <Icon name="ticket" size={13} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-ink-primary">매장이용권 실시간</h3>
        <button type="button" onClick={() => load(true)} disabled={busy} aria-label="새로고침"
          className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-input text-ink-muted transition-colors hover:bg-surface-high hover:text-ink-secondary disabled:opacity-50">
          <Icon name="refresh" size={14} />
        </button>
      </div>

      {/* 이름·아이디로 '보냈는지' 확인 — 오너 지시. 맨 위에 둔다(찾으러 스크롤하지 않게). */}
      <div className="border-b border-border-subtle px-3 py-2">
        <div className="relative">
          <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·아이디로 확인"
            aria-label="이름 또는 아이디로 이용권 확인"
            className="input min-h-[38px] w-full pl-8 text-sm" />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="지우기"
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-input text-ink-muted hover:text-ink-secondary">
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
        {hit && (
          <p className="mt-1.5 rounded-input bg-surface-high px-2 py-1.5 text-2xs tabular-nums text-ink-secondary">
            {hit.issued === 0 ? (
              <span className="text-danger-light">보낸 기록이 없어요</span>
            ) : (
              <>발급 <b className="text-ink-primary">{hit.issued}</b>장 · 사용 {hit.used}장 · 보유 <b className="text-accent-200">{hit.held}</b>장</>
            )}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {err ? (
          <div className="p-3"><LoadErrorCard error={err} what="이용권 내역" onRetry={() => load(true)} /></div>
        ) : vs === null ? (
          <div className="space-y-1.5 p-3" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : shown.length === 0 ? (
          <p className="px-3 py-8 text-center text-2xs text-ink-muted">
            {query ? '해당하는 내역이 없어요' : '아직 이용권 내역이 없어요'}
          </p>
        ) : (
          <ul className={['divide-y divide-border-subtle', dense ? '' : ''].join(' ')}>
            {shown.slice(0, 200).map((r) => (
              <li key={r.key} className={['flex items-center gap-2 px-3', dense ? 'py-1.5' : 'py-2'].join(' ')}>
                {/* 입/출을 색과 기호로 동시에 — 색만으로 구분하면 흑백 모니터·색약에서 사라진다 */}
                <span className={['flex h-6 w-6 shrink-0 items-center justify-center rounded-input text-2xs font-bold',
                  r.kind === 'issued' ? 'bg-emerald-400/15 text-emerald-400' : 'bg-amber-400/15 text-amber-300'].join(' ')}>
                  {r.kind === 'issued' ? '입' : '출'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-ink-primary">
                    {r.name}
                    {/* 장수를 이름 바로 옆에 — 이 줄에서 제일 먼저 확인하는 사실이 '몇 장'이다.
                        1장이면 숫자를 붙이지 않는다(대부분이 1장이라 숫자가 소음이 된다). */}
                    {r.count > 1 && <span className="ml-1 tabular-nums text-accent-300">{r.count}장</span>}
                    {r.revoked
                      ? <span className="ml-1.5 rounded-chip bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger-light">회수</span>
                      /* 일부만 회수된 묶음 — '회수' 라고만 하면 전량 회수로 읽힌다. 숫자로 말한다. */
                      : r.revokedCount > 0 && <span className="ml-1.5 rounded-chip bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger-light">{r.revokedCount}장 회수</span>}
                    {r.expired
                      ? <span className="ml-1.5 rounded-chip bg-surface-float px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">만료</span>
                      : r.expiredCount > 0 && <span className="ml-1.5 rounded-chip bg-surface-float px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">{r.expiredCount}장 만료</span>}
                  </p>
                  <p className="truncate text-[10px] text-ink-muted">
                    {r.kind === 'issued' ? '전송' : '사용'} · {r.title}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">{hhmm(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="border-t border-border-subtle px-3 py-1.5 text-[10px] tabular-nums text-ink-muted">
        30초마다 자동 새로고침{at ? ` · 방금 ${hhmm(new Date(at).toISOString())} 갱신` : ''}
      </p>
    </aside>
  );
}
