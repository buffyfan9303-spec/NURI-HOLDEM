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
  it('좌표 없음 경고 문구 — 스위치 꺼짐이면 "출석할 수 없어요"라고 말하지 않는다', () => {
    expect(body).toMatch(/geoOn \? '출석 위치가 등록되지 않아 손님이 출석할 수 없어요' : '출석 위치 확인을 켜기 전에/);
  });
  it('출석 QR 안내의 위치 권한 문구는 스위치가 켜졌을 때만', () => {
    const modal = readFileSync(fileURLToPath(new URL('./CheckinModal.tsx', import.meta.url)), 'utf8');
    expect(modal).toMatch(/\{geoOn && <>[^}]*매장 안에서 위치 권한을 허용해야 출석돼요/);
    expect(modal.match(/매장 안에서 위치 권한을 허용해야 출석돼요/g)).toHaveLength(1);
  });
});
