// 닉네임 하나 계약 (오너 2026-09-24 — 이 파일은 2026-09-16 '받는 아이디 잠금' 계약을 대신한다)
//
// 오너: "받는 아이디와 닉네임은 동일하게. 누리홀덤에서 쓰는 것은 닉네임·실명 두 개뿐. 닉네임은 중복 방지 필수."
//       "닉네임 변경은 30일에 한 번만 가능하게, 하단에 공지도."
//
// 옛 계약(09-16)은 '받는 아이디(profiles.nickname)를 nickname_locked 로 잠근다' 였다. 20260924k 에서
// 잠금이 30일 1회 규칙(서버 trg_profiles_nickname_rules)으로 바뀌고 '닉네임'(profiles.name)과 한 칸으로 합쳐졌다.
// 그래서 이 파일은 이제 **두 칸이 되살아나지 않았는지**와 **닉네임이 전용 RPC 로만 바뀌는지**를 본다.
//
// 이 파일이 보는 것: 소스 계약. 못 보는 것: 실제 렌더(e2e/nickname-rules.spec.ts)·서버 판정(20260924k 리허설).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 줄끝 정규화 — core.autocrlf=true 라 체크아웃마다 작업트리 줄끝이 다르다. */
const eol = (s: string) => s.split('\r\n').join('\n');
/** 주석은 이력을 적는 자리다 — 실행 코드만 본다. */
const code = (s: string) => eol(s).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const MODAL = code(readFileSync(join(__dirname, 'ProfileModal.tsx'), 'utf-8'));
const SIGNUP = code(readFileSync(join(__dirname, 'AuthModal.tsx'), 'utf-8'));
const AUTH = code(readFileSync(join(__dirname, '..', '..', 'api', 'auth.ts'), 'utf-8'));

describe('공개 이름은 닉네임 하나', () => {
  it('🔴 설정 화면에 받는 아이디 칸이 따로 없다 — 닉네임 한 칸 + 실명(읽기 전용)', () => {
    expect(MODAL.includes('recv-id-input'), '받는 아이디 입력칸이 되살아났다').toBe(false);
    expect(MODAL.includes('받는 아이디'), "'받는 아이디' 라벨이 되살아났다").toBe(false);
    expect(MODAL, '닉네임 입력칸(testid)이 없다').toContain('data-testid="nickname-input"');
    expect(MODAL, '실명 줄(testid)이 없다').toContain('data-testid="real-name-row"');
  });

  it('🔴 닉네임은 set_my_nickname 으로만 바뀐다 — 프로필 패치에 name 을 싣지 않는다', () => {
    expect(MODAL, '닉네임 변경이 setMyNickname 을 타지 않는다').toMatch(/if \(nameChanged\) await setMyNickname\(/);
    const at = MODAL.indexOf('await updateProfile({');
    expect(at, 'updateProfile 호출을 못 찾았다 — 측정 대상이 틀렸다').toBeGreaterThan(0);
    const patch = MODAL.slice(at, MODAL.indexOf('});', at));
    expect(/\bname\s*:/.test(patch), '프로필 패치에 name 이 실렸다 — 30일·이력을 우회하는 두 번째 경로').toBe(false);
  });

  it('🔴 중복 검사와 프리필이 닉네임(profiles.nickname) 기준이다', () => {
    expect(MODAL, '중복 검사가 닉네임 RPC 가 아니다').toMatch(/useAvailabilityCheck\(checkNicknameAvailable/);
    expect(MODAL.includes('checkNameAvailable'), '옛 name 검사가 남아 있다').toBe(false);
    expect(MODAL, '프리필이 닉네임이 아니다').toMatch(/setName\(user\.nickname/);
  });

  it('🔴 30일 공지는 서버 기준 시각(nickname_changed_at)을 본다', () => {
    expect(AUTH, 'nameChangedAt 이 nickname_changed_at 을 싣지 않는다').toMatch(/'nickname_changed_at' in row \? row\.nickname_changed_at/);
    expect(MODAL, '공지 testid 가 없다').toContain('data-testid="name-cooldown-notice"');
    expect(MODAL, '공지 문구 함수가 없다').toContain("cooldownNotice('닉네임은'");
  });

  it('🔴 가입 화면도 닉네임 한 칸 — 이름과 아이디를 같은 값으로 보낸다', () => {
    expect(SIGNUP.includes('받는 아이디'), "가입 화면에 '받는 아이디' 가 남아 있다").toBe(false);
    expect(SIGNUP.includes('NameField'), '가입 화면에 이름 칸이 남아 있다').toBe(false);
    expect((SIGNUP.match(/\bname: nick\.value\.trim\(\), /g) ?? []).length, '일반·업주 가입 둘 다 name=닉네임이어야 한다').toBe(2);
  });
});
