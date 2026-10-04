// 업주 설정 › 매장 페이지 › '출석 위치' (CHECKIN-GEO 2단계, 오너 결정 2026-09-23)
//
// 서버 check_in 은 매장 좌표가 없으면 손님 출석을 거부한다(20260923b). 좌표를 채우는 문은 둘이다:
//   (a) 관리자가 손님 매장 페이지 '소개' 탭을 열면 지도 지오코딩이 조용히 저장(VenuePage onCoords — 기존, 좌표 없을 때만)
//   (b) 이 칸 — 업주가 매장 안에서 「지금 위치로 등록」 또는 「주소로 등록」.
// 저장은 set_venue_coords RPC(서버가 can_manage_venue 로 검사). 저장 뒤 **서버 값을 다시 읽어** 보여 준다(거짓 성공 금지 K-03).
// 매장 전환 늦은 응답: await 뒤마다 venueRef.current(지금 매장)와 시작 때 매장을 비교한다(§C).
// 20261004d(오너 결정 (다)): 「위치 확인 출석」 스위치 — 매장이 켜야만 손님에게 위치를 묻는다(신고서 ② '매장·운영자가 켠 경우').
//   켠 매장은 시행일(LOCATION_TERMS_EFFECTIVE)부터 동의·위치가 없으면 QR 출석이 서버에서 거부된다. 좌표가 없으면 켤 수 없다(서버도 막는다).
//   저장은 set_venue_checkin_geo_required RPC, 확인은 서버 재조회(K-03).
import { useEffect, useRef, useState } from 'react';
import { getVenueCheckinSpot, setVenueCheckinGeoRequired } from '../../api/checkins';
import { LOCATION_TERMS_EFFECTIVE_KO, isGeoRequiredNow } from '../../lib/locationTerms';
import { setVenueCoords } from '../../api/community';
import { getCheckinPosition, isLowAccuracy, CheckinGeoError, useCheckinGeoEnabled } from '../../lib/checkinGeo';
import { naverMapConfigured, naverMapState, onNaverMapState, loadNaverMaps, geocodeAddress } from '../../lib/naverMap';
import { msgOf } from '../../lib/dbError';

type Spot = { lat: number | null; lng: number | null; address: string; geoRequired: boolean };
type Msg = { tone: 'ok' | 'err'; text: string } | null;

/** 네이버 지도 스크립트가 준비될 때까지(최대 10초). 실패·키 없음이면 false. */
function naverReady(): Promise<boolean> {
  if (!naverMapConfigured()) return Promise.resolve(false);
  const s0 = loadNaverMaps();
  if (s0 === 'ready') return Promise.resolve(true);
  if (s0 !== 'loading') return Promise.resolve(false);
  return new Promise((resolve) => {
    const off = onNaverMapState((s) => { if (s !== 'loading') { off(); window.clearTimeout(t); resolve(s === 'ready'); } });
    const t = window.setTimeout(() => { off(); resolve(naverMapState() === 'ready'); }, 10_000);
  });
}

export default function CheckinLocationSection({ venueId }: { venueId: string }) {
  const venueRef = useRef(venueId);
  venueRef.current = venueId;
  const [spot, setSpot] = useState<Spot | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState<'here' | 'addr' | 'geo' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  // 스위치 꺼짐이면 손님 출석은 아직 위치를 안 본다 — '출석할 수 없어요'는 그때 거짓이다.
  const geoOn = useCheckinGeoEnabled();

  useEffect(() => {
    let alive = true;
    setSpot(null); setLoadErr(false); setMsg(null); setBusy(null);
    (async () => {
      try {
        const s = await getVenueCheckinSpot(venueId);
        if (alive && venueRef.current === venueId) setSpot(s);
      } catch {
        if (alive && venueRef.current === venueId) setLoadErr(true);
      }
    })();
    return () => { alive = false; };
  }, [venueId]);

  /** 저장 → 서버 재조회로 확인. 재조회 값이 없으면 성공이라 말하지 않는다. */
  const saveAndVerify = async (id: string, lat: number, lng: number, how: string) => {
    await setVenueCoords(id, lat, lng);
    const s = await getVenueCheckinSpot(id);
    if (venueRef.current !== id) return;
    setSpot(s);
    if (s.lat == null || s.lng == null) setMsg({ tone: 'err', text: '저장 결과를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요' });
    else setMsg({ tone: 'ok', text: `${how} 출석 위치를 등록했습니다` });
  };

  const fail = (id: string, e: unknown, fallback: string) => {
    if (venueRef.current !== id) return;
    setMsg({ tone: 'err', text: e instanceof CheckinGeoError && e.code === 'denied'
      ? '위치 권한을 허용해야 지금 위치로 등록할 수 있습니다. 브라우저 설정에서 이 사이트의 위치 권한을 켜 주세요'
      : msgOf(e, fallback) });
  };

  const registerHere = async () => {
    const id = venueId;
    if (busy) return;
    setBusy('here'); setMsg(null);
    try {
      const pos = await getCheckinPosition();
      if (venueRef.current !== id) return;
      if (isLowAccuracy(pos.accuracy)
        && !window.confirm(`위치 오차가 약 ${Math.round(pos.accuracy)}m로 큽니다. 매장 안 창가 쪽에서 다시 시도하는 것이 좋습니다.\n그래도 이 위치로 등록하시겠습니까?`)) {
        return;
      }
      await saveAndVerify(id, pos.lat, pos.lng, '지금 위치로');
    } catch (e) { fail(id, e, '위치 등록에 실패했습니다'); }
    finally { if (venueRef.current === id) setBusy(null); }
  };

  const registerByAddress = async () => {
    const id = venueId;
    if (busy) return;
    setBusy('addr'); setMsg(null);
    try {
      // 주소는 서버에서 다시 읽는다 — 위 「위치 · 연락처」에서 방금 저장한 주소가 마운트 때 값보다 새롭다.
      const address = (await getVenueCheckinSpot(id)).address.trim();
      if (venueRef.current !== id) return;
      if (!address) throw new Error('매장 주소가 없습니다. 위 「위치 · 연락처」에서 주소를 먼저 저장해 주세요');
      if (!(await naverReady())) throw new Error('지도 서비스를 불러오지 못해 주소로 등록할 수 없습니다. 「지금 위치로 등록」을 써 주세요');
      const c = await geocodeAddress(address);
      if (venueRef.current !== id) return;
      if (!c) throw new Error('주소로 위치를 찾지 못했습니다. 주소를 확인하거나 「지금 위치로 등록」을 써 주세요');
      await saveAndVerify(id, c.lat, c.lng, '주소로');
    } catch (e) { fail(id, e, '주소 등록에 실패했습니다'); }
    finally { if (venueRef.current === id) setBusy(null); }
  };

  /** 「위치 확인 출석」 켜기/끄기 — 서버 저장 → 재조회 값으로만 상태·성공을 말한다. */
  const toggleGeo = async () => {
    const id = venueId;
    if (busy || spot == null) return;
    const next = !spot.geoRequired;
    setBusy('geo'); setMsg(null);
    try {
      await setVenueCheckinGeoRequired(id, next);
      const s = await getVenueCheckinSpot(id);
      if (venueRef.current !== id) return;
      setSpot(s);
      if (s.geoRequired !== next) setMsg({ tone: 'err', text: '저장 결과를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요' });
      else setMsg({ tone: 'ok', text: next ? '위치 확인 출석을 켰습니다' : '위치 확인 출석을 껐습니다' });
    } catch (e) { fail(id, e, '위치 확인 출석 설정을 저장하지 못했습니다'); }
    finally { if (venueRef.current === id) setBusy(null); }
  };

  const has = spot != null && spot.lat != null && spot.lng != null;
  const geoReq = spot?.geoRequired === true;
  return (
    <section data-testid="checkin-location" className="rounded-aura border card-aura p-3 space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-ink-primary">출석 위치</h3>
        <p className="text-2xs text-ink-muted">아래 「위치 확인 출석」을 켜면 손님은 이 위치 <span className="font-semibold text-accent-300">300m 안</span>에서 출석 QR로 출석합니다{geoOn ? '' : ' (운영 스위치가 켜진 뒤부터)'}.</p>
      </div>
      {loadErr ? (
        <p role="alert" className="rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs text-danger-light">출석 위치를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>
      ) : spot == null ? (
        <p aria-busy="true" className="py-2 text-2xs text-ink-muted">불러오는 중…</p>
      ) : has ? (
        <p data-testid="checkin-location-state" className="text-2xs text-ink-secondary">
          <span className="font-semibold text-emerald-400">등록됨</span>
          <span className="ml-1.5 tabular-nums text-ink-muted">{spot.lat!.toFixed(5)}, {spot.lng!.toFixed(5)}</span>
        </p>
      ) : (
        <p role="alert" data-testid="checkin-location-state" className="rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs font-semibold text-danger-light">
          {geoOn && geoReq ? '출석 위치가 등록되지 않아 손님이 출석할 수 없습니다' : '위치 확인 출석을 켜기 전에 출석 위치를 등록해 주세요'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={registerHere} disabled={!!busy || spot == null}
          className="btn-primary h-[44px] text-sm disabled:opacity-50">
          {busy === 'here' ? '위치 확인 중…' : '지금 위치로 등록'}
        </button>
        <button type="button" onClick={registerByAddress} disabled={!!busy || spot == null}
          className="btn-ghost h-[44px] border border-border-default text-sm disabled:opacity-50">
          {busy === 'addr' ? '주소 찾는 중…' : '주소로 등록'}
        </button>
      </div>
      <p className="text-2xs text-ink-muted">「지금 위치로 등록」은 <b className="text-ink-secondary">매장 안에서</b> 눌러 주세요. 이미 등록돼 있으면 새 위치로 바뀝니다.</p>
      <div data-testid="checkin-geo-required" className="space-y-1.5 border-t border-border-subtle pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p id="checkin-geo-required-label" className="text-sm font-bold text-ink-primary">위치 확인 출석</p>
            <p data-testid="checkin-geo-required-state" className="text-2xs text-ink-muted">
              {spot == null ? '불러오는 중…' : geoReq ? (geoOn ? '켜짐 — 손님에게 위치 확인을 요청합니다' : '켜짐 — 운영 스위치가 켜지면 적용됩니다') : '꺼짐 — 손님에게 위치를 묻지 않습니다'}
            </p>
          </div>
          <button type="button" role="switch" aria-checked={geoReq} aria-labelledby="checkin-geo-required-label"
            data-testid="checkin-geo-required-switch" onClick={toggleGeo}
            disabled={!!busy || spot == null || (!has && !geoReq)}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center disabled:opacity-50">
            <span className={['relative h-6 w-11 rounded-full transition-colors', geoReq ? 'bg-accent-300' : 'bg-surface-float'].join(' ')}>
              <span className={['absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform', geoReq ? 'translate-x-[1.15rem]' : 'translate-x-0'].join(' ')} />
            </span>
          </button>
        </div>
        <p className="text-2xs leading-relaxed text-ink-muted">
          켜면 손님이 이 매장 QR로 출석할 때 위치정보 이용 동의를 받고 현재 위치를 한 번 확인합니다(좌표는 저장하지 않습니다).
          {' '}<b className="text-ink-secondary">{LOCATION_TERMS_EFFECTIVE_KO}부터</b>는 동의하지 않거나 위치를 확인할 수 없는 손님의 <b className="text-ink-secondary">QR 출석이 되지 않습니다</b>{isGeoRequiredNow() ? '' : '(그 전에는 출석은 되고 위치만 확인합니다)'}.
          {' '}그런 손님은 직원이 장부에 직접 등록하거나 손님의 「참가 신청」을 승인해 주세요.
        </p>
        {!has && spot != null && <p className="text-2xs text-ink-muted">출석 위치를 먼저 등록해야 켤 수 있습니다.</p>}
      </div>
      {msg && (
        <p role="status" className={`text-2xs font-semibold ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-danger-light'}`}>{msg.text}</p>
      )}
    </section>
  );
}
