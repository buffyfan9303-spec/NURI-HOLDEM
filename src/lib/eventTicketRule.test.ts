// 이벤트 참여권 지급 규칙의 계약 게이트 — 마이그레이션이 조용히 되돌리는 것을 막는다.
//
// 왜 필요한가 (2026-09-07 감사에서 실제로 벌어진 일):
//   참여권의 지급 조건이 "checkins 행이 생겼는가" 하나뿐인데, 그 행을 만드는 문이 둘이고
//   **둘 다 현장 증빙이 없었다.** 출석 QR 은 공개된 매장 UUID 만 있으면 되고(중복 방지는 매장별 4시간),
//   이용권 '바로 전송(사용)'은 매장을 아예 검증하지 않았다(경품이 이용권이라 자기증식까지 됐다).
//   실측: 승인 매장 2곳 기준 1인 하루 12장 — 카드 100장이면 한 사람이 8일이면 전부 가져간다.
//
//   오너 승인(A+B)으로 두 문을 막았다:
//     A) redeem_my_voucher(무증빙) 실행 권한 회수 — 손님 경로는 매장 QR·업주 전화번호만 남는다.
//     B) _grant_event_tickets 가 '그 매장에 오늘 첫 출석'일 때만 지급한다.
//
//   이 둘은 **DB 함수 안에** 있어서 앱 테스트로는 안 잡힌다. 그리고 나중에 누군가
//   `create or replace function public._grant_event_tickets()` 를 다시 쓰면서 가드를 빠뜨리면
//   아무도 모르게 원상복구된다 — 실제로 이번 감사가 찾아낸 결함들이 그런 식으로 생겼다.
//   그래서 **마지막으로 정의된 본문**을 파일에서 찾아 계약을 확인한다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort(); // 파일명 = 적용 순서

/** 그 함수를 마지막으로 정의한 마이그레이션의 본문을 돌려준다(뒤 파일이 앞 파일을 덮는다). */
function lastDefinitionOf(fn: string): { file: string; body: string } | null {
  let hit: { file: string; body: string } | null = null;
  for (const f of files) {
    const t = readFileSync(join(DIR, f), 'utf8');
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i');
    const m = re.exec(t);
    if (!m) continue;
    hit = { file: f, body: t.slice(m.index) };
  }
  return hit;
}

describe('이벤트 참여권 — 현장 증명 계약', () => {
  it('마이그레이션 폴더를 실제로 읽었다(경로가 바뀌면 조용히 통과하는 것을 막는다)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('🔴 _grant_event_tickets 는 "그 매장에 오늘 첫 출석"일 때만 지급한다', () => {
    const def = lastDefinitionOf('_grant_event_tickets');
    expect(def, '_grant_event_tickets 정의를 찾을 수 없다 — 함수명이 바뀌었는지 확인하라').toBeTruthy();

    // 같은 (사용자, 매장)의 **오늘** 기존 출석을 조회하는 가드가 있어야 한다.
    // 세 조각을 함께 본다 — 하나만 보면 우연히 통과한다.
    expect(def!.body, `${def!.file}: 같은 사용자·매장의 기존 출석을 확인하는 가드가 없다`).toMatch(/from\s+public\.checkins/i);
    expect(def!.body, `${def!.file}: KST 날짜 비교가 없다 — '오늘' 판정이 사라졌다`).toMatch(/Asia\/Seoul/);
    expect(def!.body, `${def!.file}: 방금 들어온 행을 제외하는 조건(c.id <> new.id)이 없다 — 자기 자신을 보고 항상 건너뛴다`)
      .toMatch(/c\.id\s*<>\s*new\.id/);
  });

  it('🔴 무증빙 사용 경로(redeem_my_voucher)의 실행 권한이 회수돼 있다', () => {
    // 마지막으로 이 함수의 권한을 건드린 마이그레이션이 authenticated 를 **회수**해야 한다.
    let lastGrant: { file: string; line: string } | null = null;
    for (const f of files) {
      for (const line of readFileSync(join(DIR, f), 'utf8').split('\n')) {
        if (!/redeem_my_voucher\s*\(\s*uuid\s*\)/i.test(line)) continue;
        if (!/^\s*(revoke|grant)\b/i.test(line)) continue;
        if (!/authenticated/i.test(line)) continue;
        lastGrant = { file: f, line: line.trim() };
      }
    }
    expect(lastGrant, 'redeem_my_voucher 의 authenticated 권한을 다루는 구문을 찾을 수 없다').toBeTruthy();
    expect(lastGrant!.line, `${lastGrant!.file}: 무증빙 사용 경로가 다시 손님에게 열렸다 — 집에서 참여권을 만들 수 있게 된다`)
      .toMatch(/^revoke/i);
  });

  it('증빙 있는 두 경로(_by_qr · _by_phone)는 손님에게 열려 있어야 한다 — 막으면 매장에서 이용권을 못 쓴다', () => {
    const all = files.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
    for (const fn of ['redeem_my_voucher_by_qr', 'redeem_my_voucher_by_phone']) {
      expect(all, `${fn} 정의가 사라졌다 — 손님이 이용권을 쓸 길이 없어진다`)
        .toContain(fn);
    }
  });
});
