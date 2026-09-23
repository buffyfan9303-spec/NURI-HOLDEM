// 팔로워 알림 패널 계약 (2026-09-23, 오너 결정 FOLLOWER-PUSH-FIX)
//
// 무엇을 막는가
//   1) 없는 기능("D-1 리마인더")을 안내 문구에 적어두는 것 — 오너 결정: 자동 발송 문구는 사실대로만 적는다.
//   2) `getVenueAnnounceStatus(venueId).then(setStatus)` 형태로 상태를 그대로 바인딩하는 것.
//      이 형태는 (a) 실패를 조용히 삼키는 `.catch(() => {})` 와 붙어 있었고,
//      (b) 매장 전환 가드가 없어 늦게 도착한 이전 매장 응답이 새 매장 상태를 덮어쓸 수 있었다.
//      `.then(set...)` 직결 바인딩이 다시 생기면 두 함정이 같이 돌아온다.
//
// 이 테스트가 못 보는 것
//   실제 매장 전환 레이스(느린 응답 순서)는 소스 정적 검사로는 못 잡는다 — 그건 read-page 소비쪽
//   실측(design-reviewer/root-cause-debugger) 몫이고, 여기서는 재발하기 쉬운 코드 형태만 막는다.
//
// 실행: npx vitest run src/components/features/AnnouncePanel.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'AnnouncePanel.tsx'), 'utf8');

describe('AnnouncePanel 계약', () => {
  it('존재하지 않는 D-1 리마인더를 안내 문구에 적지 않는다', () => {
    expect(SRC).not.toMatch(/D-1/);
    expect(SRC).not.toMatch(/리마인더/);
  });

  it('상태 setter 에 응답을 직결 바인딩하지 않는다(매장 전환 가드 우회 재발 방지)', () => {
    expect(SRC).not.toMatch(/\.then\(set[A-Z]/);
  });

  it('상태 조회 실패를 조용히 삼키지 않는다(빈 catch 로 잠기는 결함 재발 방지)', () => {
    expect(SRC).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/);
  });
});
