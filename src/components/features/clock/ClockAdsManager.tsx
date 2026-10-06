// src/components/features/clock/ClockAdsManager.tsx — 클락 슬라이드 광고 관리(관리자 전용, K단계 2026-09-30).
// 화면 게이트(isAdmin)는 UI 분기일 뿐이다 — 쓰기는 서버(clock_ads RLS · clock_ads 버킷 정책, 20260930h)가 관리자만 통과시킨다.
// 기존 우하단 스폰서(광고 등록/크기/삭제 버튼)는 그대로 두고, 이것은 왼쪽 칸 슬라이드에 10초씩 끼는 광고다.
import { useEffect, useState } from 'react';
import Modal from '../../atoms/Modal';
import { useToast } from '../../atoms/Toast';
import { msgOf } from '../../../lib/dbError';
import { kstToday } from '../../../lib/kst';
import {
  fetchClockAds, uploadClockAdImage, createClockAd, updateClockAd, deleteClockAd,
  CLOCK_AD_W, CLOCK_AD_H, CLOCK_AD_NOTICE, type ClockAd,
} from '../../../api/clockAds';
import { publishClockSignal } from './clockTheme';

/** KST 날짜('2026-09-30') → 그날 00:00 KST 의 ISO. 끝 날짜는 다음 날 00:00(그날 하루 전체 포함). */
const kstDayStart = (d: string, addDays = 0) => new Date(Date.parse(`${d}T00:00:00+09:00`) + addDays * 86_400_000).toISOString();
const kstDateOf = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);

export default function ClockAdsManager({ venueId, venueName, onClose }: { venueId: string; venueName?: string; onClose: () => void }) {
  const toast = useToast();
  const [ads, setAds] = useState<ClockAd[] | null>(null);
  const [busy, setBusy] = useState(false);
  const today = kstToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [onlyHere, setOnlyHere] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const reload = () => fetchClockAds().then(setAds).catch((e) => { setAds((a) => a ?? []); toast.show(msgOf(e, '광고 목록을 불러오지 못했습니다'), 'error'); });
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (msg: string) => { publishClockSignal('ad'); toast.show(msg, 'success'); return reload(); };

  const add = async () => {
    if (!file) { toast.show('이미지를 먼저 고르세요', 'error'); return; }
    if (to < from) { toast.show('끝 날짜가 시작 날짜보다 앞입니다', 'error'); return; }
    setBusy(true);
    try {
      const url = await uploadClockAdImage(file);
      const next = (ads ?? []).reduce((m, a) => Math.max(m, a.sortOrder), 0) + 1;
      await createClockAd({ imageUrl: url, startsAt: kstDayStart(from), endsAt: kstDayStart(to, 1), venueIds: onlyHere ? [venueId] : null, sortOrder: next });
      setFile(null);
      await done('광고를 등록했습니다');
    } catch (e) { toast.show(msgOf(e, '광고를 등록하지 못했습니다'), 'error'); }
    finally { setBusy(false); }
  };

  /** 순번 바꾸기 — 이웃과 sort_order 를 맞바꾼다(두 번 쓰기). 하나만 실패하면 재조회로 실제 순서를 다시 보여 준다. */
  const move = async (i: number, d: -1 | 1) => {
    const list = ads ?? [];
    const a = list[i], b = list[i + d];
    if (!a || !b) return;
    setBusy(true);
    try {
      await updateClockAd(a.id, { sortOrder: b.sortOrder === a.sortOrder ? a.sortOrder + d : b.sortOrder });
      await updateClockAd(b.id, { sortOrder: a.sortOrder });
      await done('순서를 바꿨습니다');
    } catch (e) { toast.show(msgOf(e, '순서를 바꾸지 못했습니다'), 'error'); await reload(); }
    finally { setBusy(false); }
  };

  const remove = async (a: ClockAd) => {
    if (!confirm('이 광고를 삭제할까요? 모든 매장 TV 에서 빠집니다.')) return;
    setBusy(true);
    try { await deleteClockAd(a.id); await done('광고를 삭제했습니다'); }
    catch (e) { toast.show(msgOf(e, '광고를 삭제하지 못했습니다'), 'error'); }
    finally { setBusy(false); }
  };

  const now = Date.now();
  return (
    <Modal open onClose={onClose} title="클락 슬라이드 광고" maxWidth="lg">
      <div className="space-y-3 p-4">
        {/* §28 안내 — 관리 화면에 늘 보인다. */}
        <p data-testid="clk-ads-notice" className="rounded-input border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-ink-secondary">{CLOCK_AD_NOTICE}</p>
        <p className="text-2xs text-ink-muted">
          TV 왼쪽 칸에서 시상·추가 페이지 다음에 <b>10초</b>씩(고정) 한 바퀴에 하나씩 순서대로 나갑니다. 이미지는 정확히 <b>{CLOCK_AD_W}×{CLOCK_AD_H}</b> · 500KB 이하 · webp/jpg/png.
        </p>

        <section className="space-y-2 rounded-aura border card-aura p-3">
          <p className="text-2xs font-semibold text-ink-secondary">새 광고</p>
          <input type="file" accept="image/webp,image/jpeg,image/png" aria-label="광고 이미지"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); }} className="block min-h-[44px] w-full text-xs text-ink-secondary" />
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="mb-1 block text-2xs text-ink-secondary">시작 날짜</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input w-full text-sm" /></label>
            <label className="block"><span className="mb-1 block text-2xs text-ink-secondary">끝 날짜(그날 포함)</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input w-full text-sm" /></label>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-1.5 pr-2"><input type="radio" checked={!onlyHere} onChange={() => setOnlyHere(false)} className="accent-accent-300" />전체 매장</label>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-1.5 pr-2"><input type="radio" checked={onlyHere} onChange={() => setOnlyHere(true)} className="accent-accent-300" />이 매장만{venueName ? ` (${venueName})` : ''}</label>
          </div>
          <button type="button" onClick={add} disabled={busy || !file} className="btn-primary w-full text-sm disabled:opacity-50">{busy ? '처리 중…' : '등록'}</button>
        </section>

        <section className="space-y-1.5">
          <p className="text-2xs font-semibold text-ink-secondary">등록된 광고 {ads ? `${ads.length}개` : ''}</p>
          {ads === null ? <p className="py-4 text-center text-xs text-ink-muted">불러오는 중…</p>
            : ads.length === 0 ? <p className="py-4 text-center text-xs text-ink-muted">등록된 광고가 없습니다</p>
            : ads.map((a, i) => {
              const live = Date.parse(a.startsAt) <= now && now < Date.parse(a.endsAt);
              return (
                <div key={a.id} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-base p-2">
                  <img src={a.imageUrl} alt="" width={45} height={60} className="h-15 w-[45px] shrink-0 rounded-[4px] object-cover" />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-semibold text-ink-primary tabular-nums">{kstDateOf(a.startsAt)} ~ {kstDateOf(new Date(Date.parse(a.endsAt) - 1).toISOString())}
                      <span className={['ml-1.5 text-2xs', live ? 'text-emerald-300' : 'text-ink-muted'].join(' ')}>{live ? '송출 중' : '기간 밖'}</span></p>
                    <p className="text-2xs text-ink-muted">{a.venueIds ? (a.venueIds.includes(venueId) && a.venueIds.length === 1 ? '이 매장만' : `매장 ${a.venueIds.length}곳`) : '전체 매장'} · 순번 {i + 1}</p>
                  </div>
                  <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="위로" className="hit grid h-8 w-9 place-items-center text-xs text-ink-muted disabled:opacity-30">▲</button>
                  <button type="button" disabled={busy || i === ads.length - 1} onClick={() => move(i, 1)} aria-label="아래로" className="hit grid h-8 w-9 place-items-center text-xs text-ink-muted disabled:opacity-30">▼</button>
                  <button type="button" disabled={busy} onClick={() => remove(a)} aria-label="광고 삭제" className="hit grid h-8 w-11 place-items-center text-xs text-ink-muted hover:text-danger-light">✕</button>
                </div>
              );
            })}
        </section>
      </div>
    </Modal>
  );
}
