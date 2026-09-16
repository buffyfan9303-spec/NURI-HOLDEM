// 본인인증 게이트의 적용 범위 계약 (오너 결정 2026-09-16)
//
// 무엇을 잠그나
//   오너: **"본인인증이 글쓰기와 중고장터는 상관없어. 두 개는 본인인증 없이 사용할 수 있게."**
//   그래서 본인인증 게이트(`ensureVerified`)는 **이용권·참가가 걸린 곳 둘**에만 남는다.
//     ✅ 남는다  — 이벤트 참여(EventPage) · 대회 예약(ScheduleDetailModal)
//     ❌ 빠졌다  — 글쓰기 · 중고장터 등록 (로그인 가드 `ensureLogin` 만)
//
// 왜 계약으로 잠그나
//   이건 코드에서 읽히지 않는 **제품 결정**이다. 다음 사람이 "민감 기능이니 인증을 요구해야지" 하고
//   되돌리기 쉽고, 되돌리면 손님이 글도 못 쓰게 된다 — 2026-09-16 에 실제로 그 상태였다
//   (본인인증 채널이 PortOne 쪽에서 막혀 5명 중 4명이 글쓰기·중고장터·이벤트·예약에서 전부 튕겼다).
//
// 양성 대조를 같이 둔다
//   '글쓰기에 ensureVerified 가 없다' 만 검사하면 **게이트를 통째로 지운 고장**도 통과한다.
//   그래서 인증이 살아 있어야 하는 두 곳을 반대 방향으로 함께 단언한다.
//
// 못 보는 것: 서버측 판정. 이 파일은 **화면 배선**만 본다 — 이용권 발급·예약의 진짜 가드는 RLS/RPC 다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 줄끝 정규화 — core.autocrlf=true 라 체크아웃마다 작업트리 줄끝이 다르다(CLAUDE.md 참고 메모). */
const eol = (s: string) => s.split('\r\n').join('\n');
const src = (...p: string[]) => eol(readFileSync(join(__dirname, '..', '..', ...p), 'utf-8'));

const APP = src('App.tsx');
const EVENT = src('components', 'features', 'EventPage.tsx');
const SCHEDULE = src('components', 'features', 'ScheduleDetailModal.tsx');

/** 주석을 지운 실행 코드만 — 설명문에 적은 함수 이름이 계약을 오탐시키지 않게. */
const code = (s: string) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

describe('본인인증 게이트 범위 (오너 2026-09-16)', () => {
  it('🔴 글쓰기·중고장터는 본인인증을 요구하지 않는다 — App.tsx 에 ensureVerified 호출이 없다', () => {
    const calls = code(APP).match(/ensureVerified\s*\(/g) ?? [];
    expect(
      calls,
      'App.tsx 에서 ensureVerified 가 다시 쓰였다. 오너 결정은 "글쓰기·중고장터는 본인인증과 무관" 이다 — ensureLogin 을 써라.',
    ).toEqual([]);
  });

  it('🔴 그렇다고 게이트를 지운 것은 아니다 — 글쓰기·중고장터는 여전히 로그인을 요구한다(양성 대조)', () => {
    expect(code(APP), '글쓰기 경로의 로그인 가드가 사라졌다').toMatch(/ensureLogin\s*\(\s*user\s*\)/);
    expect(
      (code(APP).match(/ensureLogin\s*\(/g) ?? []).length,
      '로그인 가드 호출이 3곳(글쓰기 2 · 중고장터 1) 미만이다',
    ).toBeGreaterThanOrEqual(3);
  });

  it('🔴 이용권·참가가 걸린 두 곳은 본인인증이 그대로 살아 있다(양성 대조)', () => {
    expect(code(EVENT), '이벤트 참여에서 본인인증 가드가 사라졌다').toMatch(/ensureVerified\s*\(/);
    expect(code(SCHEDULE), '대회 예약에서 본인인증 가드가 사라졌다').toMatch(/ensureVerified\s*\(/);
  });
});
