// 카카오 로그인 = 이메일 가입과 **같은 평가**(오너 2026-10-07: "카카오 로그인을 했다고 본인인증을 안 해도 되는 건 아니다").
//
// 잠그는 것
//  ① 게이트 판정 코드가 provider(로그인 방법)를 보지 않는다 — 동의 게이트·본인인증 게이트·제재 판정·닉네임 확인 칸.
//     provider 로 갈리는 곳은 탈퇴 재확인 방법(비밀번호 vs '영구 삭제' 입력) 한 곳뿐이고, 그건 관문을 여닫지 않는다.
//  ② 같은 프로필(동의 미이행·미인증)이면 이메일·구글·카카오 어느 쪽에서 왔든 ensureVerified 가 같은 답을 낸다.
//  ③ 번들에 박히는 VITE_* 에 카카오 비밀(REST 키·Client Secret·Admin 키)이 없다.
//  ④ '이미 가입된 명의' 에는 다음 행동(처음 가입한 방법으로 로그인) 안내가 붙는다.
// 서버 쪽 같은 평가(트리거·동의 RPC·verify_identity_commit·탈퇴 RPC)는 supabase/tests/20261007ka_rehearsal.sql 이 라이브 롤백으로 잰다.
// 실행: npx vitest run src/lib/socialGateParity.contract.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('./identityFlag', () => ({ identityEnabled: () => true }));
const verifyEvents: unknown[] = [];
Object.assign(globalThis, {
  window: { dispatchEvent: (e: unknown) => { verifyEvents.push(e); return true; } },
  CustomEvent: class { type: string; detail: unknown; constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } },
});
const { ensureVerified } = await import('./requireLogin');
const { dupGuide, DUP_IDENTITY_GUIDE } = await import('../api/identity');

const ROOT = join(__dirname, '..', '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** 주석을 뺀 코드 — 설명문의 'provider' 글자가 거짓 실패·거짓 통과를 만들지 않게 */
const code = (p: string) => src(p).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

const GATE_FILES = [
  'src/components/features/ConsentGateModal.tsx',
  'src/components/features/SocialNicknameField.tsx',
  'src/components/features/VerifyGateSheet.tsx',
  'src/lib/requireLogin.ts',
  'src/lib/legalVersion.ts',
  'src/contexts/AuthContext.tsx',
];

describe('① 게이트 판정은 provider 를 보지 않는다', () => {
  it.each(GATE_FILES)('%s — provider·app_metadata·identities 를 읽지 않는다', (f) => {
    const c = code(f);
    expect(c.length, `${f} 를 못 읽었다(거짓 통과 방지)`).toBeGreaterThan(200);
    expect(c).not.toMatch(/\bprovider\b|app_metadata|identities/);
  });

  it('App 의 동의 게이트 열기 조건은 프로필 값만 본다', () => {
    expect(src('src/App.tsx')).toContain("<ConsentGateModal open={!!user && user.agreedToTerms === false && user.role !== 'admin'} />");
  });

  it('src 전체에서 provider 로 갈리는 곳은 탈퇴 재확인 한 곳뿐이다', () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(join(ROOT, d))) {
        const p = `${d}/${n}`;
        if (statSync(join(ROOT, p)).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) && /app_metadata/.test(code(p))) hits.push(p);
      }
    };
    walk('src');
    expect(hits).toEqual(['src/components/features/ProfileModal.tsx']);
    expect(code('src/components/features/ProfileModal.tsx')).toMatch(/setSocial\(!!prov && prov !== 'email'\)/);
  });
});

describe('② 같은 프로필이면 같은 답', () => {
  // 프로필 행에는 provider 가 없다 — 이메일·구글·카카오 가입자의 첫 프로필은 트리거가 같은 값으로 만든다(리허설 P1).
  const base = { id: 'u', verified: false, agreedToTerms: false, role: 'user' as const };
  it.each([
    ['이메일', { ...base, email: 'a@example.com' }],
    ['구글', { ...base, email: 'g@gmail.com' }],
    ['카카오(이메일 없음)', { ...base, email: '' }],
  ])('%s — 미인증이면 막고 인증 시트를 연다', (_n, u) => {
    verifyEvents.length = 0;
    expect(ensureVerified(u)).toBe(false);
    expect(verifyEvents).toHaveLength(1);
    expect(ensureVerified({ ...u, verified: true })).toBe(true);
  });
});

describe('③ 카카오 비밀은 번들에 없다', () => {
  it('src·index.html·vite 설정 어디에도 VITE_ 로 시작하는 카카오 REST·시크릿·어드민 키 이름이 없다', () => {
    const files: string[] = ['index.html', 'vite.config.ts'];
    const walk = (d: string) => {
      for (const n of readdirSync(join(ROOT, d))) {
        const p = `${d}/${n}`;
        if (statSync(join(ROOT, p)).isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|mjs|html)$/.test(n) && !/\.test\.tsx?$/.test(n)) files.push(p);
      }
    };
    walk('src');
    const bad = files.filter((f) => /VITE_[A-Z_]*(KAKAO_(REST|CLIENT_SECRET|SECRET|ADMIN)|CLIENT_SECRET|SERVICE_ROLE)/.test(src(f)));
    expect(bad).toEqual([]);
  });

  it('카카오 모듈이 읽는 env 는 공개 스위치 하나뿐이다', () => {
    expect(code('src/lib/kakaoLogin.ts').match(/import\.meta\.env\.\w+/g)).toEqual(['import.meta.env.VITE_KAKAO_LOGIN_ENABLED']);
  });

  it('엣지 함수는 비밀을 Deno.env(Supabase secrets)에서만 읽는다', () => {
    const idx = code('supabase/functions/kakao-oidc-exchange/index.ts');
    expect(idx).toContain("Deno.env.get('KAKAO_REST_API_KEY')");
    expect(idx).toContain("Deno.env.get('KAKAO_CLIENT_SECRET')");
    expect(code('supabase/functions/kakao-oidc-exchange/logic.ts')).not.toMatch(/Deno\.env/);
  });
});

describe('④ 중복 명의 안내', () => {
  it("'이미 가입된 명의입니다.' → 처음 가입한 방법으로 로그인하라는 안내 · 다른 문장은 그대로", () => {
    expect(dupGuide('이미 가입된 명의입니다.')).toBe(DUP_IDENTITY_GUIDE);
    expect(DUP_IDENTITY_GUIDE).toMatch(/처음 가입한 방법/);
    expect(dupGuide('서비스 이용이 제한된 명의입니다. 고객센터로 문의해 주세요.')).toBe('서비스 이용이 제한된 명의입니다. 고객센터로 문의해 주세요.');
  });
});
