// 2026-09-27 장부 전 화면 점검 결함 1~13 — 화면 소스 계약. 실측 증거는 scratch func.cjs 로 수정 전/후 빌드를 대조했다.
//   브라우저 실측이 본 결함을 소스 수준에서 다시 막는다. 각 항목은 되돌리면 이 파일에서 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
const L = src('./NuriPosLedger.tsx');
const W = src('./LedgerWorkspace.tsx');
const fn = (name: string) => {
  const i = L.indexOf(`function ${name}(`);
  expect(i, name).toBeGreaterThan(0);
  const j = L.indexOf('\nfunction ', i + 10);
  return L.slice(i, j < 0 ? undefined : j);
};

describe('장부 점검 2026-09-27', () => {
  it('#1 비밀번호 미설정 매장 업주는 비밀번호 없이 플레이어 삭제(모달·가드 모두)', () => {
    expect(fn('PlayerEditModal')).toMatch(/!hasPw && canManage\s*\?\s*<button type="button" onClick=\{\(\) => onDelete\(''\)\}/);
    expect(L).toMatch(/if \(hasBuyins && hasPw && !password\)/);
    expect(L).not.toMatch(/if \(hasBuyins && !password\)/);
    expect(L).toMatch(/<PlayerEditModal[\s\S]{0,200}canManage=\{canManage\}/);
  });
  it('#2 QR 분할 금액은 0 미만을 받지 않는다', () => {
    expect(L).toMatch(/\[k\]: Math\.max\(0, parseInt\(e\.target\.value, 10\) \|\| 0\)/);
  });
  it('#3 장부 화면에 원문 오류 관용구가 남아 있지 않다', () => {
    expect(L).not.toMatch(/instanceof Error \? (e|err)\.message/);
  });
  it('#4 시작/저장 연타는 ref 로 막는다', () => {
    const f = fn('SessionForm');
    expect(f).toMatch(/if \(submittingRef\.current\) return;/);
    expect(f).toMatch(/disabled=\{cash <= 0 \|\| submitting\}/);
  });
  it('#5 늦게 누른 기기는 LEDGER_ALREADY_OPEN 을 알리고 다시 읽는다', () => {
    expect(L).toMatch(/e\.message === LEDGER_ALREADY_OPEN[\s\S]{0,300}await reloadSession\(\)/);
  });
  it('#6 이용권 레일은 모든 폭에서 표 아래(옆 2열 그리드 없음)', () => {
    expect(W).not.toMatch(/grid-cols-\[minmax\(0,1fr\)_19rem\]/);
    expect(W).toMatch(/className="mt-4 h-\[26rem\]/);
  });
  it('#7 플레이어 저장이 실패하면 모달을 닫지 않는다', () => {
    expect(L).toMatch(/if \(await savePlayer\(editPlayer\.id, patch\)\) setEditPlayer\(null\)/);
  });
  it('#8 [직전과 동일] 라벨은 직전 할인을 말하지 않는다', () => {
    expect(L).not.toMatch(/prev\.discountIndex > 0 \? ' ·할인'/);
  });
  it('#9 결제 창 제목은 바인 번호가 먼저', () => {
    expect(L).toMatch(/title=\{`\$\{cell\.entryNo\}바인 · \$\{cell\.playerName\}`\}/);
  });
  it('#10 기존 기록을 분납으로 고칠 때 수납 내역을 채운다', () => {
    expect(fn('PaymentModal')).toMatch(/buyinFinance\(cell\.buyin, session\)\.tender/);
  });
  it('#11 [← 빠른 입력] 과녁 32px + tap-y-44', () => {
    expect(L).toMatch(/className="tap-y-44 inline-flex min-h-\[32px\][^"]*">← 빠른 입력/);
  });
  it('#12 되돌릴 수 없는 확정 버튼은 rose-700', () => {
    expect((fn('PwConfirm').match(/btn-danger !bg-rose-700/g) ?? []).length).toBe(2);
  });
  it('#13 모바일 칩 과녁 확장', () => {
    expect(fn('Chip')).toMatch(/tap-y-44 min-h-\[32px\]/);
  });
  // 리드 추가(design-reviewer 실측) — 라이트 대비: border-strong 구분점 3.2~3.4 · 링크 취소 4.39.
  //   ⚠ 금지 클래스명을 문자열로 적지 않는다(Tailwind content 스캔이 주석·문자열에서도 규칙을 만든다) — 조각을 이어 붙여 찾는다.
  it('+ 구분점·취소 글자는 AA 토큰', () => {
    const weak = ['text', 'border', 'strong'].join('-');
    const S = src('./StoreDashboard.tsx');
    const C = src('./CustomerAnalytics.tsx');
    expect(L).not.toContain(`className="${weak}">·`);
    expect(S).not.toContain(`className="${weak}" aria-hidden>·`);
    expect(C).toMatch(/text-2xs text-ink-secondary">취소<\/button>/);
  });
  it('+ 라이트 4.5 미만 두 곳(마감 배지 4.0 · 인증 안내 4.4)은 한 단계 진한 토큰', () => {
    expect(src('./VenueManageTab.tsx')).toMatch(/g\.closed && <span className="text-2xs font-semibold text-ink-secondary">마감<\/span>/);
    expect(src('./VenueVerificationCard.tsx')).toMatch(/<p className="text-2xs text-ink-secondary">포스터\(요강\)가 운영자 승인 없이/);
  });
});
