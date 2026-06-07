// src/components/features/CustomerDashboardPage.tsx
// 손님 대시보드 — 전체 페이지(모바일 포함). 헤더 🎟 버튼으로 진입.
// 내 매장이용권(매장별) + 매장 이용내역(방문·머니인·금액). 매장이용권은 금전적 가치 없음.
// 사용(회수) = 발급 매장 QR 스캔 또는 그 매장 업주 전화번호로만. 유저 간 전송 불가.
import { useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { Html5Qrcode } from 'html5-qrcode';
import {
  listMyVouchers, myVisitedVenues, myPlayHistory,
  redeemMyVoucher, redeemMyVoucherByQr, redeemMyVoucherByPhone,
  type Voucher, type VisitedVenue, type PlayHistory,
} from '../../api/vouchers';
import { wonToMan } from '../../api/ledger';

function parseVenueId(text: string): string | null {
  const t = text.trim();
  if (t.startsWith('NURIV-VENUE:')) return t.slice('NURIV-VENUE:'.length).trim();
  try { const u = new URL(t); const c = u.searchParams.get('checkin'); if (c) return c; } catch { /* not a url */ }
  if (/^[0-9a-fA-F-]{36}$/.test(t)) return t;
  return null;
}

interface Stack { venueId: string; venueName: string; title: string; ids: string[] }

export default function CustomerDashboardPage({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [visits, setVisits] = useState<VisitedVenue[]>([]);
  const [plays, setPlays] = useState<PlayHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [redeem, setRedeem] = useState<Stack | null>(null);

  const reload = () => {
    setLoading(true);
    Promise.all([listMyVouchers(), myVisitedVenues(), myPlayHistory()])
      .then(([vs, vi, pl]) => { setVouchers(vs); setVisits(vi); setPlays(pl); })
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { if (open) reload(); }, [open]);

  if (!open) return null;

  const active = vouchers.filter((v) => v.status === 'active');
  const venueMap = new Map<string, { name: string; stacks: Map<string, Stack> }>();
  for (const v of active) {
    const vid = v.venueId; const vname = v.venueName ?? '기타 매장';
    if (!venueMap.has(vid)) venueMap.set(vid, { name: vname, stacks: new Map() });
    const g = venueMap.get(vid)!;
    if (!g.stacks.has(v.title)) g.stacks.set(v.title, { venueId: vid, venueName: vname, title: v.title, ids: [] });
    g.stacks.get(v.title)!.ids.push(v.id);
  }
  const venueGroups = [...venueMap.entries()].map(([vid, g]) => ({ vid, name: g.name, stacks: [...g.stacks.values()] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const usageMap = new Map<string, { name: string; visits: number; moneyin: number; amount: number }>();
  for (const x of visits) usageMap.set(x.venueId, { name: x.venueName ?? '매장', visits: x.visits, moneyin: 0, amount: 0 });
  for (const p of plays) {
    const e = usageMap.get(p.venueId) ?? { name: p.venueName ?? '매장', visits: 0, moneyin: 0, amount: 0 };
    e.moneyin = p.moneyinCount; e.amount = p.totalAmount;
    usageMap.set(p.venueId, e);
  }
  const usage = [...usageMap.values()].sort((a, b) => (b.moneyin + b.visits) - (a.moneyin + a.visits));

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface-base">
      <header className="flex h-header-h shrink-0 items-center gap-2 border-b border-border-subtle px-page-x">
        <button type="button" onClick={onClose} aria-label="닫기" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-high">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-base font-bold text-ink-primary">내 대시보드</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-page-x py-section">
          <div className="rounded-card border border-amber-500/40 bg-amber-500/[0.08] p-3">
            <p className="text-sm font-bold text-amber-300">⚠️ 매장이용권은 금전적 가치가 없습니다</p>
            <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">현금·포인트가 아니며 환불·현금화·유저 간 거래가 불가합니다. 발급한 매장에서 사용(회수)만 가능합니다.</p>
          </div>

          <section>
            <p className="mb-1.5 text-sm font-bold text-ink-primary">내 매장이용권 <span className="text-gold-300">{active.length}</span></p>
            {loading ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
              : venueGroups.length === 0 ? <p className="py-6 text-center text-2xs text-ink-muted">보유한 매장이용권이 없습니다.</p>
                : <div className="space-y-3">{venueGroups.map((g) => (
                  <div key={g.vid} className="rounded-card border border-border-default bg-surface-low p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-primary">
                      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" /><span className="min-w-0 truncate">{g.name}</span>
                    </p>
                    <ul className="space-y-1.5">{g.stacks.map((s) => (
                      <li key={s.title} className="flex items-center gap-2 rounded-input border border-gold-400/40 bg-gold-300/[0.05] px-3 py-2">
                        <span className="text-base" aria-hidden>🎟</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{s.title} <span className="text-2xs text-ink-muted">×{s.ids.length}</span></span>
                        <button type="button" onClick={() => setRedeem(s)} className="btn-primary shrink-0 px-3 text-2xs">사용하기</button>
                      </li>
                    ))}</ul>
                  </div>
                ))}</div>}
          </section>

          <section>
            <p className="mb-1.5 text-sm font-bold text-ink-primary">매장 이용내역</p>
            {loading ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
              : usage.length === 0 ? <p className="py-6 text-center text-2xs text-ink-muted">방문·머니인 기록이 아직 없습니다.</p>
                : <ul className="space-y-1.5">{usage.map((u, i) => (
                  <li key={i} className="rounded-input border border-border-subtle bg-surface-low px-3 py-2">
                    <p className="truncate text-sm font-semibold text-ink-primary">{u.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-ink-muted">
                      <span>방문 <b className="text-ink-secondary tabular-nums">{u.visits}</b>회</span>
                      <span>머니인 <b className="text-ink-secondary tabular-nums">{u.moneyin}</b>회</span>
                      <span>누적 <b className="text-gold-300 tabular-nums">{u.amount ? wonToMan(u.amount) + '만' : '-'}</b></span>
                    </div>
                  </li>
                ))}</ul>}
          </section>
        </div>
      </div>

      {redeem && <RedeemSheet stack={redeem} onClose={() => setRedeem(null)} onDone={() => { setRedeem(null); reload(); }} />}
    </div>
  );
}

function RedeemSheet({ stack, onClose, onDone }: { stack: Stack; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'menu' | 'qr' | 'phone'>('menu');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const vid = stack.ids[0];

  const doDirect = async () => {
    if (!window.confirm(`'${stack.venueName}'에서 이용권을 사용(전송)할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try { const n = await redeemMyVoucher(vid); toast.show(`${n} 이용권 사용 완료`, 'success'); onDone(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '사용 실패', 'error'); setBusy(false); }
  };
  const doQr = async (text: string) => {
    const venueId = parseVenueId(text);
    if (!venueId) { toast.show('매장 QR이 아닙니다', 'error'); setMode('menu'); return; }
    setBusy(true);
    try { const n = await redeemMyVoucherByQr(vid, venueId); toast.show(`${n} 이용권 사용 완료`, 'success'); onDone(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '사용 실패', 'error'); setBusy(false); setMode('menu'); }
  };
  const doPhone = async () => {
    setBusy(true);
    try { const n = await redeemMyVoucherByPhone(vid, phone); toast.show(`${n} 이용권 사용 완료`, 'success'); onDone(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '사용 실패', 'error'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-md space-y-3 rounded-t-dialog border border-border-default bg-surface-mid p-4 animate-slide-up sm:rounded-dialog">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-bold text-ink-primary">{stack.venueName} · {stack.title}</p>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 text-lg leading-none text-ink-muted">✕</button>
        </div>
        {mode === 'menu' && (<>
          <p className="text-2xs text-ink-muted">발급 매장(<b className="text-ink-secondary">{stack.venueName}</b>)에서만 사용됩니다. 방법을 선택하세요.</p>
          <button type="button" disabled={busy} onClick={doDirect} className="btn-primary w-full text-sm disabled:opacity-50">✅ 이 매장으로 바로 전송(사용)</button>
          <button type="button" onClick={() => setMode('qr')} className="btn-ghost w-full text-sm">📷 매장 QR 스캔해서 사용</button>
          <button type="button" onClick={() => setMode('phone')} className="btn-ghost w-full text-sm">📞 매장 업주 전화번호로 전송</button>
        </>)}
        {mode === 'qr' && (
          <div className="space-y-2">
            <p className="text-2xs text-ink-muted">매장에 비치된 QR을 비춰 주세요. (카메라 권한 필요)</p>
            <QrScanner onResult={doQr} onError={(m) => { toast.show(m, 'error'); setMode('menu'); }} />
            <button type="button" onClick={() => setMode('menu')} className="btn-ghost w-full text-2xs">취소</button>
          </div>
        )}
        {mode === 'phone' && (
          <div className="space-y-2">
            <p className="text-2xs text-ink-muted">발급 매장 <b className="text-ink-secondary">업주 전화번호</b>를 입력하세요.</p>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="010-0000-0000" className="input w-full text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode('menu')} className="btn-ghost flex-1 text-sm">뒤로</button>
              <button type="button" disabled={busy} onClick={doPhone} className="btn-primary flex-1 text-sm disabled:opacity-50">{busy ? '처리 중…' : '사용'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QrScanner({ onResult, onError }: { onResult: (text: string) => void; onError: (msg: string) => void }) {
  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let done = false;
    const stop = () => { const s = scanner; scanner = null; if (s) { s.stop().then(() => s.clear()).catch(() => {}); } };
    (async () => {
      try {
        scanner = new Html5Qrcode('nuri-qr-reader');
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 },
          (text) => { if (!done) { done = true; const r = text; stop(); onResult(r); } },
          () => {});
      } catch (e) { onError(e instanceof Error ? e.message : '카메라를 열 수 없습니다. 권한을 확인하세요.'); }
    })();
    return () => { done = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div id="nuri-qr-reader" className="mx-auto w-full max-w-[280px] overflow-hidden rounded-input bg-black" style={{ minHeight: 220 }} />;
}
