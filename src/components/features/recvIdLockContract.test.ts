// '받는 아이디' 잠금 판정 계약 (오너 리포트 2026-09-16)
//
// 오너: "받는 아이디 초기 가입시 변경이 가능해야하는데 저건 어디서 나온 아이디인지 모르겠고 변경이 불가하게 되어있어"
//
// 무엇이 잘못돼 있었나
//   화면이 `{user.nickname ? 잠금 : 입력}` 으로 갈랐다. 그런데 소셜 가입 트리거
//   (`supabase/migrations/20260909a_social_signup_consent_gate.sql:56-58`)가 가입 순간
//   `이름 + '_' + uuid앞4자` 를 **자동으로 넣는다**. 그래서 소셜 가입자는 **한 번도 고른 적 없는 아이디**에
//   즉시 잠겼다(오너가 본 `이준_7f98` 의 `7f98` 이 uuid 앞 4자다).
//
//   서버는 처음부터 옳았다 — `set_my_nickname` 은 `nickname_locked` 만 보고,
//   중복 검사도 `id <> auth.uid()` 로 본인을 제외한다. **막고 있던 것은 화면뿐이었다.**
//   라이브 실측(2026-09-16): profiles 5명 중 닉네임 보유 5 · `nickname_locked` 4 → **1명이 화면 때문에 갇혀 있었다.**
//
// 이 파일이 보는 것: 잠금 판정이 `nicknameLocked`(서버 플래그)로 되어 있고 `nickname` 존재 여부로 돌아가지 않았는지.
// 못 보는 것: 실제 렌더·서버 동작. 서버 계약은 `set_my_nickname` 이 스스로 강제한다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 줄끝 정규화 — core.autocrlf=true 라 체크아웃마다 작업트리 줄끝이 다르다. */
const eol = (s: string) => s.split('\r\n').join('\n');
/** 주석은 이력을 적는 자리다 — 실행 코드만 본다. */
const code = (s: string) => eol(s).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const MODAL = code(readFileSync(join(__dirname, 'ProfileModal.tsx'), 'utf-8'));
const AUTH = code(readFileSync(join(__dirname, '..', '..', 'api', 'auth.ts'), 'utf-8'));

describe("'받는 아이디' 잠금은 서버 플래그로 판정한다", () => {
  it('🔴 매퍼가 nickname_locked 를 화면으로 들여온다', () => {
    expect(AUTH, 'User 타입에 nicknameLocked 가 없다').toMatch(/nicknameLocked\??:\s*boolean/);
    expect(AUTH, 'rowToUser 가 nickname_locked 를 매핑하지 않는다').toContain('row.nickname_locked');
  });

  it('🔴 잠금 분기가 nicknameLocked 를 쓴다 — nickname 존재 여부로 돌아가지 않았다', () => {
    expect(MODAL, '잠금 판정에 user.nicknameLocked 가 없다').toContain('user.nicknameLocked ?');
    expect(
      MODAL.includes('{user.nickname ? ('),
      "잠금 판정이 `user.nickname` 존재 여부로 되돌아갔다 — 소셜 가입자는 자동 생성 아이디에 영원히 갇힌다",
    ).toBe(false);
  });

  it('🔴 확정 전에는 자동 생성된 아이디를 프리필한다 — 빈칸이면 무엇이 쓰이는지 알 수 없다', () => {
    expect(MODAL, '프리필(setRecvId(user.nickname …))이 없다').toMatch(/setRecvId\(user\.nickname/);
  });

  it('🔴 내 값 그대로 확정할 때는 사전 중복검사를 건너뛴다 — 안 그러면 확정이 영원히 불가능하다', () => {
    // is_nickname_available 는 본인 행을 제외하지 않는다(라이브 확인). 서버 set_my_nickname 은 제외한다.
    expect(MODAL, '동일 값 예외(same)가 없다 — 자동 아이디를 그대로 확정하면 "이미 사용 중"으로 막힌다')
      .toMatch(/const same\s*=\s*v\.toLowerCase\(\)/);
    expect(MODAL, '중복검사가 same 조건과 묶여 있지 않다').toMatch(/!same\s*&&\s*!\(await checkNicknameAvailable/);
  });
});
