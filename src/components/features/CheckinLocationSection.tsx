// 업주 설정 › 매장 페이지 › '출석 위치' (CHECKIN-GEO 2단계, 오너 결정 2026-09-23)
//
// 서버 check_in 은 매장 좌표가 없으면 손님 출석을 거부한다(20260923b). 좌표를 채우는 문은 둘이다:
//   (a) 관리자가 손님 매장 페이지 '소개' 탭을 열면 지도 지오코딩이 조용히 저장(VenuePage onCoords — 기존, 좌표 없을 때만)
//   (b) 이 칸 — 업주가 매장 안에서 「지금 위치로 등록」 또는 「주소로 등록」.
// 저장은 set_venue_coords RPC(서버가 can_manage_venue 로 검사). 저장 뒤 **서버 값을 다시 읽어** 보여 준다(거짓 성공 금지 K-03).
// 매장 전환 늦은 응답: await 뒤마다 venueRef.current(지금 매장)와 시작 때 매장을 비교한다(§C).
import { useEffect, useRef, useState } from 'react';
import { getVenueCheckinSpot } from '../../api/checkins';
import { setVenueCoords } from '../../api/community';
import { getCheckinPosition, isLowAccuracy, CheckinGeoError, useCheckinGeoEnabled } from '../../lib/checkinGeo';
import { naverMapConfigured, naverMapState, onNaverMapState, loadNaverMaps, geocodeAddress } from '../../lib/naverMap';

type Spot = { lat: number | null; lng: number | null; address: string };
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
  const [busy, setBusy] = useState<'here' | 'addr' | null>(null);
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
    if (s.lat == null || s.lng == null) setMsg({ tone: 'err', text: '저장 결과를 확인하지 못했어요. 새로고침 후 다시 확인해 주세요' });
    else setMsg({ tone: 'ok', text: `${how} 출석 위치를 등록했어요` });
  };

  const fail = (id: string, e: unknown, fallback: string) => {
    if (venueRef.current !== id) return;
    setMsg({ tone: 'err', text: e instanceof CheckinGeoError && e.code === 'denied'
      ? '위치 권한을 허용해야 지금 위치로 등록할 수 있어요. 브라우저 설정에서 이 사이트의 위치 권한을 켜 주세요'
      : e instanceof Error && e.message ? e.message : fallback });
  };

  const registerHere = async () => {
    const id = venueId;
    if (busy) return;
    setBusy('here'); setMsg(null);
    try {
      const pos = await getCheckinPosition();
      if (venueRef.current !== id) return;
      if (isLowAccuracy(pos.accuracy)
        && !window.confirm(`위치 오차가 약 ${Math.round(pos.accuracy)}m 로 커요. 매장 안 창가 쪽에서 다시 시도하는 게 좋아요.\n그래도 이 위치로 등록할까요?`)) {
        return;
      }
      await saveAndVerify(id, pos.lat, pos.lng, '지금 위치로');
    } catch (e) { fail(id, e, '위치 등록에 실패했어요'); }
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
      if (!address) throw new Error('매장 주소가 없어요. 위 「위치 · 연락처」에서 주소를 먼저 저장해 주세요');
      if (!(await naverReady())) throw new Error('지도 서비스를 불러오지 못해 주소로 등록할 수 없어요. 「지금 위치로 등록」을 써 주세요');
      const c = await geocodeAddress(address);
      if (venueRef.current !== id) return;
      if (!c) throw new Error('주소로 위치를 찾지 못했어요. 주소를 확인하거나 「지금 위치로 등록」을 써 주세요');
      await saveAndVerify(id, c.lat, c.lng, '주소로');
    } catch (e) { fail(id, e, '주소 등록에 실패했어요'); }
    finally { if (venueRef.current === id) setBusy(null); }
  };

  const has = spot != null && spot.lat != null && spot.lng != null;
  return (
    <section data-testid="checkin-location" className="rounded-aura border card-aura p-3 space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-ink-primary">출석 위치</h3>
        <p className="text-2xs text-ink-muted">손님은 이 위치 <span className="font-semibold text-accent-300">300m 안</span>에서만 출석 QR 로 출석할 수 있어요{geoOn ? '' : ' (위치 확인이 켜진 뒤부터)'}.</p>
      </div>
      {loadErr ? (
        <p role="alert" className="rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs text-danger-light">출석 위치를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>
      ) : spot == null ? (
        <p className="py-2 text-2xs text-ink-muted">불러오는 중…</p>
      ) : has ? (
        <p data-testid="checkin-location-state" className="text-2xs text-ink-secondary">
          <span className="font-semibold text-emerald-400">등록됨</span>
          <span className="ml-1.5 tabular-nums text-ink-muted">{spot.lat!.toFixed(5)}, {spot.lng!.toFixed(5)}</span>
        </p>
      ) : (
        <p role="alert" data-testid="checkin-location-state" className="rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs font-semibold text-danger-light">
          {geoOn ? '출석 위치가 등록되지 않아 손님이 출석할 수 없어요' : '출석 위치 확인을 켜기 전에 출석 위치를 등록해 주세요'}
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
      {msg && (
        <p role="status" className={`text-2xs font-semibold ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-danger-light'}`}>{msg.text}</p>
      )}
    </section>
  );
}
