// src/components/features/RegularsModal.tsx
// 단골 관리(CRM) — 매장 전체 고객을 장부 바인 기록 기준으로 나열 + 행 펼침 시 상세 활동(바인/방문/머니인/예약/누적/객단가).
// 새 테이블 없이 기존 장부 데이터만 사용. 관계자(직원)는 제외.
import { useEffect, useMemo, useState } from 'react';
import Modal from '../atoms/Modal';
import { getVenueRegulars, getCustomerActivity, type VenueRegular, type CustomerActivity } from '../../api/reservations';
import { wonToMan } from '../../api/ledger';
import { getCustomerProfile, saveCustomerProfile, getCoupons, issueCoupon, setCouponStatus, type Coupon } from '../../api/crm';

export default function RegularsModal({ open, onClose, venueId, exclude = [] }: { open: boolean; onClose: () => void; venueId: string; exclude?: string[] }) {
  const [list, setList] = useState<VenueRegular[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open) return;
    setQ(''); setList(null);
    getVenueRegulars(venueId).then(setList).catch(() => setList([]));
  }, [open, venueId]);

  const ex = useMemo(() => new Set(exclude.map((s) => s.trim())), [exclude]);
  const rows = (list ?? []).filter((r) => !ex.has(r.name.trim()) && (!q.trim() || r.name.includes(q.trim())));

  return (
    <Modal open={open} onClose={onClose} title="단골 관리" maxWidth="md" variant="sheet">
      <div className="space-y-3 p-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="고객 이름 검색…" className="input w-full text-sm" />
        {list === null ? (
          <p className="py-8 text-center text-2xs text-ink-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-2xs text-ink-muted">고객 데이터가 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r, i) => <RegularRow key={r.name} idx={i + 1} r={r} venueId={venueId} />)}
          </ul>
        )}
        <p className="text-[10px] text-ink-muted">장부 바인 기록 기준 · 직원(관계자) 제외 · 5회 이상 ‘단골’</p>
      </div>
    </Modal>
  );
}

function RegularRow({ idx, r, venueId }: { idx: number; r: VenueRegular; venueId: string }) {
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState<CustomerActivity | null>(null);
  const [bday, setBday] = useState('');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [crmLoaded, setCrmLoaded] = useState(false);
  const toggle = () => {
    const n = !open; setOpen(n);
    if (n && !act) getCustomerActivity(venueId, r.name).then(setAct).catch(() => {});
    if (n && !crmLoaded) {
      getCustomerProfile(venueId, r.name).then((p) => setBday(p?.birthday ?? '')).catch(() => {});
      getCoupons(venueId, r.name).then(setCoupons).catch(() => {});
      setCrmLoaded(true);
    }
  };
  const saveBday = async () => { try { await saveCustomerProfile(venueId, r.name, { birthday: bday || null }); } catch { /* noop */ } };
  const addCoupon = async () => { const t = window.prompt('쿠폰 내용 (예: 5만 바인권 / 첫방문 50%)'); if (!t) return; try { await issueCoupon(venueId, r.name, t); getCoupons(venueId, r.name).then(setCoupons); } catch { /* noop */ } };
  // 쿠폰 사용 처리 — 'use' 접두어가 훅으로 오인되지 않도록 redeem 으로 명명
  const redeemCoupon = async (id: string) => { await setCouponStatus(id, 'used'); getCoupons(venueId, r.name).then(setCoupons); };
  return (
    <li className="rounded-input border border-border-subtle bg-surface-low">
      <button type="button" onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className={`w-5 shrink-0 text-center text-2xs font-bold tabular-nums ${idx === 1 ? 'text-accent-300' : 'text-ink-muted'}`}>{idx}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">
          {r.name}{r.buyins >= 5 && <span className="ml-1.5 text-2xs font-bold text-accent-300">단골</span>}
        </span>
        <span className="shrink-0 text-2xs text-ink-muted tabular-nums">바인 {r.buyins} · 방문 {r.visits}</span>
        <span className="shrink-0 text-xs text-ink-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-border-subtle px-3 py-2">
          {!act ? (
            <p className="py-1 text-center text-2xs text-ink-muted">불러오는 중…</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              <Cell label="바인" v={`${act.buyins}회`} />
              <Cell label="방문" v={`${act.visits}회`} />
              <Cell label="머니인" v={`${act.moneyIn}회`} />
              <Cell label="예약" v={`${act.reservations}회`} />
              <Cell label="누적" v={`${wonToMan(act.amount)}만`} gold />
              <Cell label="객단가" v={act.buyins ? `${wonToMan(Math.round(act.amount / act.buyins))}만` : '-'} />
            </div>
          )}
          <div className="mt-2 space-y-1.5 border-t border-border-subtle pt-2">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-2xs text-ink-muted">생일</span>
              <input type="date" value={bday} onChange={(e) => setBday(e.target.value)} className="input flex-1 text-2xs" />
              <button type="button" onClick={saveBday} className="btn-ghost shrink-0 px-2 text-2xs text-accent-300">저장</button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xs text-ink-muted">활성 쿠폰 {coupons.filter((c) => c.status === 'active').length}장</span>
              <button type="button" onClick={addCoupon} className="btn-ghost px-2 text-2xs text-accent-300">+ 쿠폰 발급</button>
            </div>
            {coupons.filter((c) => c.status === 'active').map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded bg-surface-high px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-2xs text-ink-secondary">🎟 {c.title}</span>
                <button type="button" onClick={() => redeemCoupon(c.id)} className="shrink-0 text-2xs font-bold text-accent-300">사용</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

function Cell({ label, v, gold }: { label: string; v: string; gold?: boolean }) {
  return (
    <div className="rounded bg-surface-high py-1.5 text-center">
      <p className={`text-sm font-bold leading-none tabular-nums ${gold ? 'text-accent-300' : 'text-ink-primary'}`}>{v}</p>
      <p className="mt-0.5 text-[10px] text-ink-muted">{label}</p>
    </div>
  );
}
