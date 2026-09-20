// Q3(2026-09-20) — CheckinModal 의 매장 전환 경합 가드를 잠근다.
//
// 재현(독립 조사가 확정): 관리자로 매장 A 에서 CheckinModal 을 연 채(listVenueCheckins(A) 인플라이트)
//   '관리할 매장 선택' 에서 B 로 전환 → 이 컴포넌트는 리마운트되지 않고(key={venueId} 가 없다)
//   venueId prop 만 B 로 바뀐다 → 늦게 온 A 목록이 B 화면을 덮고, 그 A 행의 '이용권' 을 누르면
//   send() 가 **현재 prop 인 B** 로 발급한다.
//
// 고침: ① 순수 함수 canSendVoucher — 발급 직전 매장·권한·수신자·장수 재검사(렌더 없이 단위 테스트).
//       ② lib/staleResponse 표준 가드(owner=venueId) — 구세대 응답(reload)·구세대 성공/실패(send) 무시.
//       ③ 모달 닫기·매장 변경 시 목록·통계·선택·확인을 즉시 비운다.
//
// 음성 대조: canSendVoucher 를 항상 true 로 바꾸거나, reload()/send() 의 stale 가드를 지우면
//   아래 테스트가 실패한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canSendVoucher } from './CheckinModal';
import type { Checkin } from '../../api/checkins';

const SRC = readFileSync(join(__dirname, 'CheckinModal.tsx'), 'utf-8');

const checkin = (over: Partial<Checkin> = {}): Checkin =>
  ({ id: 'c1', venueId: 'venue-a', userId: 'user-1', displayName: '홍길동', createdAt: '2026-09-20T00:00:00Z', ...over });

describe('canSendVoucher — 발급 직전 재검사(순수 함수)', () => {
  it('매장·권한·수신자·장수가 전부 유효하면 true', () => {
    expect(canSendVoucher(checkin(), 'venue-a', true, 2)).toBe(true);
  });

  it('🔴 늦게 도착한 A 매장 행을 지금 보고 있는 B 매장으로 보내면 막는다 — Q3 핵심 반례', () => {
    expect(canSendVoucher(checkin({ venueId: 'venue-a' }), 'venue-b', true, 1)).toBe(false);
  });

  it('canIssue 가 꺼져 있으면(화면 권한 없음) 막는다', () => {
    expect(canSendVoucher(checkin(), 'venue-a', false, 1)).toBe(false);
  });

  it('수신자 userId 가 없으면 막는다', () => {
    expect(canSendVoucher(checkin({ userId: '' }), 'venue-a', true, 1)).toBe(false);
  });

  it('장수가 0 이하·소수·NaN 이면 막는다', () => {
    expect(canSendVoucher(checkin(), 'venue-a', true, 0)).toBe(false);
    expect(canSendVoucher(checkin(), 'venue-a', true, -3)).toBe(false);
    expect(canSendVoucher(checkin(), 'venue-a', true, 1.5)).toBe(false);
    expect(canSendVoucher(checkin(), 'venue-a', true, NaN)).toBe(false);
  });
});

describe('CheckinModal.tsx — 소스 배선 계약(렌더 트리 없이 확인)', () => {
  it('staleResponse 계약을 가져와 쓴다(새 가드를 따로 만들지 않는다)', () => {
    expect(SRC).toContain("from '../../lib/staleResponse'");
    expect(SRC).toContain('isStaleResponse(');
  });

  it('reload() 의 두 조회(목록·방문통계) 모두 낡은 응답을 가드한다', () => {
    const m = SRC.match(/const reload = \(\) => \{[\s\S]*?\n {2}\};/);
    expect(m, 'reload() 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    expect(body).toContain('owner: venueId');
    const guardCount = (body.match(/if \(stale\(\)\) return;/g) ?? []).length;
    expect(guardCount, 'listVenueCheckins.then/.catch · getVenueVisitorStats.then 셋 다 가드해야 한다').toBeGreaterThanOrEqual(3);
  });

  it('🔴 재조회 실패(catch)는 list 를 지우지 않는다 — listErr 만 세팅한다', () => {
    expect(SRC).toContain('.catch(() => { if (stale()) return; setListErr(true); });');
  });

  it('send() 는 발급 직전 canSendVoucher 로 재검사하고, 실패하면 issueVoucher 를 부르지 않는다', () => {
    const m = SRC.match(/const send = async \(c: Checkin, count: number\) => \{[\s\S]*?\n {2}\};/);
    expect(m, 'send() 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    const guardIdx = body.indexOf('canSendVoucher(');
    const issueIdx = body.indexOf('issueVoucher(');
    expect(guardIdx, 'canSendVoucher 호출이 없다').toBeGreaterThanOrEqual(0);
    expect(issueIdx, 'issueVoucher 호출이 없다').toBeGreaterThanOrEqual(0);
    expect(guardIdx, '재검사가 발급보다 먼저 와야 한다').toBeLessThan(issueIdx);
    expect(body).toMatch(/if \(!canSendVoucher\(c, venueId, canIssue, count\)\) \{ setConfirm\(null\); return; \}/);
  });

  it('send() 의 세대 가드가 then/catch/finally 세 곳 모두에 있다 — 구세대 성공·실패를 둘 다 무시', () => {
    const m = SRC.match(/const send = async \(c: Checkin, count: number\) => \{[\s\S]*?\n {2}\};/);
    const body = m![0];
    const guardCount = (body.match(/isStaleResponse\(gen, mountGenRef\.current\)/g) ?? []).length;
    expect(guardCount).toBeGreaterThanOrEqual(3);
  });

  it('🔴 send() 는 reload() 와 별도의 세대 참조(mountGenRef)를 쓴다 — 같은 ref 를 쓰면 불일치 분기의' +
    ' reload() 자신의 seq 증가가 send() 를 stale 로 오판해 finally 의 setSendBusy(false) 가 영영 실행되지 않는다', () => {
    const send = SRC.match(/const send = async \(c: Checkin, count: number\) => \{[\s\S]*?\n {2}\};/)![0];
    expect(send).toContain('const gen = mountGenRef.current;');
    expect(send, 'send() 안에서 reqRef 를 직접 stale 비교에 쓰면 안 된다').not.toMatch(/isStaleResponse\(gen, reqRef\.current\)/);

    const reload = SRC.match(/const reload = \(\) => \{[\s\S]*?\n {2}\};/)![0];
    expect(reload, 'reload() 는 reqRef 만 bump 해야 한다(mountGenRef 를 건드리면 이 둘을 분리한 의미가 없다)').not.toContain('mountGenRef');
  });

  it('모달 닫기·매장 변경(effect deps [open, venueId])에서 목록·통계·선택·확인을 즉시 비운다', () => {
    const m = SRC.match(/useEffect\(\(\) => \{\s*reqRef\.current = \{ seq: reqRef\.current\.seq \+ 1, owner: venueId \};[\s\S]*?\}, \[open, venueId\]\);/);
    expect(m, '즉시-비움 effect 를 찾지 못했다').not.toBeNull();
    const body = m![0];
    for (const setter of ['setList([])', 'setListErr(false)', 'setVisits({})', 'setSendTo(null)', 'setConfirm(null)', 'setCustomCount(\'\')']) {
      expect(body, `${setter} 가 즉시-비움 effect 에 없다`).toContain(setter);
    }
  });
});
