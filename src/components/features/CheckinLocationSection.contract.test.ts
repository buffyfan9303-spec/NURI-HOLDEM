// 업주 '출석 위치' 칸 계약(CHECKIN-GEO) — 소스 계약이라 단독으로는 약하다. 동작은 checkins.geo.test.ts 와 실화면 실측이 본다.
// 여기서는 반복 결함 두 부류만 잠근다: §C 늦은 응답(매장 전환) · K-03 거짓 성공(저장 후 재조회 없이 '등록했어요').
// 실행: npx vitest run src/components/features/CheckinLocationSection.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('./CheckinLocationSection.tsx', import.meta.url)), 'utf8');
const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const panel = readFileSync(fileURLToPath(new URL('./VenueCustomizePanel.tsx', import.meta.url)), 'utf8');

describe('CheckinLocationSection', () => {
  it('매장 설정 › 매장 페이지에 실제로 렌더된다', () => {
    expect(panel).toMatch(/<CheckinLocationSection venueId=\{venueId\} \/>/);
  });
  it('무가드 .then(set…) 배선이 없다', () => {
    expect(body).not.toMatch(/\.then\(set[A-Z]/);
  });
  it('await 뒤 setState 전에 지금 매장(ref)과 비교한다', () => {
    expect(body).toMatch(/venueRef\.current = venueId/);
    const awaits = body.match(/await (getCheckinPosition|getVenueCheckinSpot|geocodeAddress)\(/g) ?? [];
    const guards = body.match(/venueRef\.current !== id\) return/g) ?? [];
    expect(awaits.length).toBeGreaterThanOrEqual(3);
    expect(guards.length).toBeGreaterThanOrEqual(awaits.length - 1);
  });
  it('저장 뒤 서버 재조회 값으로만 성공을 말한다', () => {
    const fn = body.slice(body.indexOf('const saveAndVerify'), body.indexOf('const fail'));
    const iSave = fn.indexOf('await setVenueCoords(');
    const iRead = fn.indexOf('await getVenueCheckinSpot(');
    const iOk = fn.indexOf("tone: 'ok'");
    expect(iSave).toBeGreaterThan(-1);
    expect(iRead).toBeGreaterThan(iSave);
    expect(iOk).toBeGreaterThan(iRead);
    expect(fn).toMatch(/s\.lat == null \|\| s\.lng == null/);
  });
  it('좌표 없음 경고 문구 — 운영 스위치와 매장 스위치가 둘 다 켜졌을 때만 "출석할 수 없어요"라고 말한다', () => {
    expect(body).toMatch(/geoOn && geoReq \? '출석 위치가 등록되지 않아 손님이 출석할 수 없습니다' : '위치 확인 출석을 켜기 전에/);
  });
  it('출석 QR 안내의 위치 문구는 운영 스위치 + 이 매장의 위치 확인 출석이 켜졌을 때만(20261004d — 안 켠 매장은 위치를 안 본다)', () => {
    const modal = readFileSync(fileURLToPath(new URL('./CheckinModal.tsx', import.meta.url)), 'utf8');
    expect(modal).toMatch(/const geoHint = geoOn && venueGeo\?\.venueId === venueId && venueGeo\.on;/);
    expect(modal).toMatch(/\{geoHint && <><br \/><b data-testid="checkin-geo-hint"/);
    expect(modal).not.toMatch(/\{geoOn && <>/);
    expect(modal).toMatch(/그 밖의 손님은 장부에 직접 등록하거나 참가 신청을 승인해 주세요/);
  });
});

// 20261004d(오너 결정 (다)) — 「위치 확인 출석」 매장 스위치. 저장은 RPC, 확인은 서버 재조회, 좌표 없으면 켤 수 없다.
// 음성 대조: toggleGeo 에서 `await getVenueCheckinSpot(id)` 를 빼면 '재조회', disabled 의 `(!has && !geoReq)` 를 빼면 '좌표 없음' 이 빨개진다.
describe('CheckinLocationSection — 위치 확인 출석 스위치', () => {
  const fn = body.slice(body.indexOf('const toggleGeo'), body.indexOf('const has ='));
  it('토글을 찾았다(공허한 통과 방지)', () => {
    expect(fn.length).toBeGreaterThan(100);
  });
  it('RPC 저장 → 서버 재조회 → 재조회 값으로만 성공을 말한다 · 매장 전환 가드', () => {
    const iSave = fn.indexOf('await setVenueCheckinGeoRequired(id, next)');
    const iRead = fn.indexOf('await getVenueCheckinSpot(id)');
    const iGuard = fn.indexOf('if (venueRef.current !== id) return;');
    const iOk = fn.indexOf("tone: 'ok'");
    expect(iSave).toBeGreaterThan(-1);
    expect(iRead).toBeGreaterThan(iSave);
    expect(iGuard).toBeGreaterThan(iRead);
    expect(iOk).toBeGreaterThan(iGuard);
    expect(fn).toMatch(/if \(s\.geoRequired !== next\)/);
  });
  it('switch 역할·이름·44px · 좌표가 없으면(켜져 있지 않은 한) 켤 수 없다', () => {
    expect(body).toMatch(/role="switch" aria-checked=\{geoReq\} aria-labelledby="checkin-geo-required-label"/);
    expect(body).toMatch(/disabled=\{!!busy \|\| spot == null \|\| \(!has && !geoReq\)\}/);
    expect(body).toMatch(/min-h-\[44px\] min-w-\[44px\]/);
  });
  it('업주에게 시행일·거부 효과·대체 처리(장부 직접 등록·참가 신청 승인)를 알린다', () => {
    expect(body).toMatch(/\{LOCATION_TERMS_EFFECTIVE_KO\}부터/);
    expect(body).toMatch(/QR 출석이 되지 않습니다/);
    expect(body).toMatch(/장부에 직접 등록하거나 손님의 「참가 신청」을 승인해 주세요/);
  });
});
