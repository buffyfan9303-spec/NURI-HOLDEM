// 토스트 등장·퇴장·성공 체크 모션 계약(2026-10-08 M04).
// ① 퇴장에 쓰는 translate 유틸(Tailwind v4)은 빌드에서 CSS `translate` 속성으로 나온다 — 전환 목록에 명시돼 있어야 한다.
// ② 성공 체크 그리기는 동작 줄이기에서 꺼지고 언마운트 때 취소된다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('./ToastView.tsx', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');

describe('ToastView 모션', () => {
  it('퇴장 클래스가 translate 유틸을 쓰면 전환 속성 목록에 translate 가 있다', () => {
    const exitUsesTranslate = /out \? '[^']*\btranslate-y-/.test(src);
    expect(exitUsesTranslate).toBe(true);
    const prop = src.match(/transitionProperty:\s*'([^']*)'/)?.[1] ?? '';
    expect(prop.split(',').map((s) => s.trim())).toEqual(expect.arrayContaining(['translate', 'opacity']));
  });
  it('성공 체크 그리기: 동작 줄이기 분기 + 언마운트 취소 + 160~220ms', () => {
    const body = src.slice(src.indexOf('function SuccessIcon'));
    expect(body).toMatch(/prefers-reduced-motion: reduce/);
    expect(body).toMatch(/return \(\) => a\.cancel\(\)/);
    const dur = Number(body.match(/duration:\s*(\d+)/)?.[1]);
    expect(dur).toBeGreaterThanOrEqual(160);
    expect(dur).toBeLessThanOrEqual(220);
  });
});
