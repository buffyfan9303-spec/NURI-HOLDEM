// 게이트 시트 쌓임 층 계약 — FULL-ERROR-SWEEP-A(2026-09-25) 잔여.
//
// 무엇을 잠그나
//   전역 이벤트(REQUIRE_LOGIN_EVENT · REQUIRE_VERIFY_EVENT)로 **아무 모달 위에서나** 뜨는 게이트 시트 둘
//   (AuthModal · VerifyGateSheet)은 Modal 원자의 `layer="gate"`(z-[65])를 쓴다. 콘텐츠 시트(z-[60]) 와
//   같은 층이면 DOM 순서가 이겨 — App 이 AuthModal 을 매물 상세보다 **먼저** 렌더하므로 — 로그인 시트가
//   장터 매물 상세 뒤에 깔려 안 보였다(CTA 히트 0/46, e2e/login-gate-layer.spec.ts).
//
// 왜 소스 계약인가
//   e2e 는 장터 경로 하나를 잰다. 누군가 AuthModal 의 `layer` 를 지우거나 Modal 의 'gate' 매핑을 z-[60] 으로
//   되돌리면 다른 sheet 소비처(공지·문의·내 장터…)에서 같은 결함이 조용히 돌아온다 — 배선 자체를 여기서 잠근다.
//   ⚠ 층 숫자의 상하 관계(60 < 65 < 70 확인창 < 120 토스트)도 같이 단언한다 — 65 를 70 으로 올리면 확인창과 겹친다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const eol = (s: string) => s.split('\r\n').join('\n');
const src = (...p: string[]) => eol(readFileSync(join(__dirname, '..', '..', ...p), 'utf-8'));

const modal = src('components', 'atoms', 'Modal.tsx');
const auth = src('components', 'features', 'AuthModal.tsx');
const verify = src('components', 'features', 'VerifyGateSheet.tsx');
const toast = src('components', 'atoms', 'Toast.tsx');

const zOf = (s: string, re: RegExp) => Number(re.exec(s)?.[1]);

describe('게이트 시트 쌓임 층(Modal layer="gate")', () => {
  it("Modal 원자: layer='gate' 는 기본 z-[60] 보다 높고 확인창 z-[70]·토스트보다 낮은 z-[65] 다", () => {
    const line = modal.split('\n').find((l) => l.includes("layer === 'gate'") && l.includes('z-['));
    expect(line, "Modal.tsx 에 layer === 'gate' → z 클래스 분기가 없다").toBeDefined();
    const gate = zOf(line!, /layer === 'gate' \? 'z-\[(\d+)\]'/);
    const base = zOf(line!, /: 'z-\[(\d+)\]'/);
    expect(base).toBe(60);
    expect(gate).toBeGreaterThan(base);
    expect(gate).toBeLessThan(70); // 확인창(VoucherWallet·CustomerDashboardPage 등 z-[70])은 게이트 위에 남는다
    const toastZ = zOf(toast, /z-\[(\d+)\]/);
    expect(gate).toBeLessThan(toastZ); // 시트 위 토스트 계약
  });

  it('로그인 시트(AuthModal)의 본체 Modal 은 layer="gate" 를 쓴다', () => {
    const line = auth.split('\n').find((l) => l.includes('<Modal open={open} onClose={onClose}'));
    expect(line, 'AuthModal 본체 <Modal open={open} …> 를 못 찾았다').toBeDefined();
    expect(line).toContain('layer="gate"');
  });

  it('본인인증 안내 시트(VerifyGateSheet)도 같은 층을 쓴다', () => {
    const line = verify.split('\n').find((l) => l.includes('<Modal open={open}'));
    expect(line).toBeDefined();
    expect(line).toContain('layer="gate"');
  });

  it("양성 대조: 'gate' 문자열 리터럴이 소스에 있어 Tailwind content 스캔이 z-[65] 를 만든다", () => {
    expect(modal).toMatch(/'z-\[65\]'/);
  });
});
