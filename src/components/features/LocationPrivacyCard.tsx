// src/components/features/LocationPrivacyCard.tsx — 내 정보 › 보안: 위치정보 이용 동의 상태 · 철회 · 이용 내역 열람.
//
// 위치정보법 제24조 — ①동의 철회 ②일시 중지 ③확인자료 열람 ④철회 시 확인자료 파기(서버 set_my_location_consent 가 지운다).
// 이용 내역은 **누를 때만** 불러온다 — 열람 자체가 서버에 '열람' 1행을 남기므로(고시 제6조①2호) 탭을 열 때마다 쌓지 않는다.
import { useEffect, useState } from 'react';
import { getMyLocationConsent, getMyLocationUseLog, type LocationConsentState, type LocationUseRow } from '../../api/locationPrivacy';
import { saveLocationConsent, isConsentCurrent, consentSummary, LOCATION_CONSENT_EVENT, LOCATION_TERMS_VERSION } from '../../lib/locationConsent';
import LoadErrorCard from '../atoms/LoadErrorCard';
import type { LegalDoc } from './LegalDocsModal';

const PURPOSE_LABEL: Record<string, string> = { checkin_radius: '출석 위치 확인', self_view: '이용 내역 열람' };
const VIA_LABEL: Record<string, string> = { device_gps: '휴대폰 위치(GPS)', none: '위치 사용 없음' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR') : '');

export default function LocationPrivacyCard({ onOpenLegal }: { onOpenLegal?: (doc: LegalDoc) => void }) {
  const [s, setS] = useState<LocationConsentState | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<LocationUseRow[] | null>(null);
  const [logErr, setLogErr] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    setErr(null);
    getMyLocationConsent().then((v) => { if (alive) setS(v); }).catch((e: unknown) => { if (alive) setErr(e); });
    const h = () => setTick((t) => t + 1);
    window.addEventListener(LOCATION_CONSENT_EVENT, h);
    return () => { alive = false; window.removeEventListener(LOCATION_CONSENT_EVENT, h); };
  }, [tick]);

  const change = async (granted: boolean) => {
    setBusy(true); setMsg(null);
    try {
      const next = await saveLocationConsent(granted);
      setS(next);
      if (!granted) setLog(null); // 서버가 이용 내역을 지웠다 — 화면의 옛 목록도 걷는다
      setMsg(granted ? '동의했어요. 출석할 때 위치로 매장 안인지 확인해요' : '철회했어요. 위치 이용 내역도 삭제했어요');
    } catch {
      setMsg('저장하지 못했어요. 잠시 후 다시 시도해 주세요');
    } finally { setBusy(false); }
  };

  const openLog = () => {
    setLogErr(null);
    getMyLocationUseLog(100).then(setLog).catch((e: unknown) => setLogErr(e));
  };

  const granted = s ? isConsentCurrent(s) : false;
  return (
    <div data-testid="location-privacy-card">
      <p className="mb-1.5 text-sm font-semibold text-ink-primary">위치정보 이용 동의(선택)</p>
      <p className="mb-2 text-2xs leading-relaxed text-ink-muted">출석할 때 매장 안인지 위치로 확인하는 데만 써요. 좌표는 저장하지 않아요.</p>
      {s === null && err == null ? (
        <p className="rounded-aura border card-aura p-3 text-center text-2xs text-ink-muted">불러오는 중…</p>
      ) : err != null ? (
        <LoadErrorCard error={err} what="위치정보 동의 상태" onRetry={() => setTick((t) => t + 1)} compact />
      ) : (
        <div className="space-y-2 rounded-input border border-border-subtle bg-surface-low px-3 py-2.5">
          <p data-testid="location-consent-state" className="text-xs font-bold text-ink-primary">{consentSummary(s!)}</p>
          <div className="flex flex-wrap gap-2">
            {granted ? (
              <button type="button" data-testid="location-consent-revoke" disabled={busy} onClick={() => change(false)}
                className="btn-ghost btn-sm min-h-[44px]">동의 철회</button>
            ) : (
              <button type="button" data-testid="location-consent-grant" disabled={busy} onClick={() => change(true)}
                className="btn-ghost btn-sm min-h-[44px]">{`동의하기(제${LOCATION_TERMS_VERSION}판)`}</button>
            )}
            <button type="button" data-testid="location-log-open" onClick={openLog} className="btn-ghost btn-sm min-h-[44px]">이용 내역 보기</button>
            {onOpenLegal && (
              <button type="button" onClick={() => onOpenLegal('location')} className="btn-ghost btn-sm min-h-[44px]">약관 보기</button>
            )}
          </div>
          {granted && <p className="text-2xs text-ink-muted">철회하면 위치 이용 내역이 바로 삭제되고, 출석은 위치 없이 계속할 수 있어요.</p>}
          {msg && <p role="status" data-testid="location-consent-msg" className="text-2xs text-ink-secondary">{msg}</p>}
        </div>
      )}
      {logErr != null ? (
        <div className="mt-2"><LoadErrorCard error={logErr} what="위치 이용 내역" onRetry={openLog} compact /></div>
      ) : log !== null ? (
        <ul data-testid="location-log-list" className="mt-2 space-y-1.5">
          {log.length === 0 ? (
            <li className="rounded-aura border card-aura p-3 text-center text-2xs text-ink-muted">이용 내역이 없어요.</li>
          ) : log.map((r, i) => (
            <li key={`${r.usedAt}-${i}`} className="rounded-input border border-border-subtle bg-surface-low px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-ink-primary">{PURPOSE_LABEL[r.purpose] ?? r.purpose}</span>
                <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{fmt(r.usedAt)}</span>
              </div>
              <p className="mt-0.5 text-2xs text-ink-muted">{VIA_LABEL[r.acquiredVia] ?? r.acquiredVia} · {r.recipient ? `제공받는 자 ${r.recipient}` : '제3자 제공 없음'}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
