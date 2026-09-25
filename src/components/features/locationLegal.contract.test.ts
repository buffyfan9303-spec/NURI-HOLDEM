// LOCATION-READY(2026-09-26) — 위치기반서비스 이용약관이 법이 요구하는 항목을 빠뜨리지 않았는지(소스 계약).
// 근거: 위치정보법 제19조제1항 각 호 · 제24조 · 제28조(2025-10-01 시행본, 국가법령정보센터 Open API 원문 대조).
// 실행: npx vitest run src/components/features/locationLegal.contract.test.ts
// 음성 대조: LOCATION 절에서 '제5조(위치정보 이용·제공사실 확인자료' 한 줄을 지우면 '4호'가, '방송미디어통신위원회'를
//   옛 이름으로 되돌리면 '옛 기관명'이 실패한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, 'LegalDocsModal.tsx'), 'utf8');
const loc = src.slice(src.indexOf('const LOCATION = `'), src.indexOf('const REFUND = `'));

describe('위치기반서비스 이용약관(LOCATION 절)', () => {
  it('제19조① 1호 — 상호·주소·전화 등 연락처', () => {
    expect(loc).toMatch(/상호 \$\{BIZ\.company\}.*주소 \$\{BIZ\.addr\}.*전화 \$\{BIZ\.phone\}/);
  });
  it('제19조① 2호 — 권리와 행사방법(철회·일시중지·열람)', () => {
    expect(loc).toMatch(/동의의 전부 또는 일부를 철회/);
    expect(loc).toMatch(/일시적인 중지/);
    expect(loc).toMatch(/열람 또는 고지/);
    expect(loc).toMatch(/내 정보 › 보안/);
  });
  it('제19조① 3호 — 실제 쓰는 위치 기능 두 가지(가까운 순 · 출석 위치 확인)', () => {
    expect(loc).toMatch(/가까운 순 정렬/);
    expect(loc).toMatch(/단말 안에서만/);
    expect(loc).toMatch(/출석 위치 확인\(선택\)/);
    expect(loc).toMatch(/반경 300미터/);
  });
  it('제19조① 4호 — 확인자료 보유근거·보유기간', () => {
    expect(loc).toMatch(/제5조\(위치정보 이용·제공사실 확인자료의 보유근거 및 보유기간\)/);
    expect(loc).toMatch(/제16조제2항/);
    expect(loc).toMatch(/6개월/);
  });
  it('제19조① 4의2호 — 개인위치정보 보유목적·보유기간', () => {
    expect(loc).toMatch(/제4조\(개인위치정보의 보유목적 및 보유기간\)/);
    expect(loc).toMatch(/저장하지 않으며 판정이 끝나는 즉시 파기/);
  });
  it('제3자 제공 없음 명시 · 위치정보관리책임자 칸', () => {
    expect(loc).toMatch(/제3자에게 제공하지 않습니다/);
    expect(loc).toMatch(/위치정보관리책임자: \$\{BIZ\.locationOfficer\}/);
  });
  it('옛 기관명 없음 — 2025-10-01 개정 뒤 방송미디어통신위원회(제28조)', () => {
    expect(loc).not.toMatch(/방송통신위원회/);
    expect(loc).toMatch(/방송미디어통신위원회/);
  });
  it('시행일·판은 lib/locationConsent 한 곳에서 온다(동의 기록의 terms_version 과 같은 값)', () => {
    expect(loc).toMatch(/시행일: \$\{LOCATION_TERMS_EFFECTIVE\}/);
    expect(loc).toMatch(/제\$\{LOCATION_TERMS_VERSION\}판/);
  });
});
