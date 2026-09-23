// src/components/features/gto/modeToggle.test.ts
// GTO 핸드 분석 '특정 핸드 ↔ 레인지 프리셋' 토글 번쩍임 (오너 신고 2026-09-23 · GTO-MODE-TOGGLE-FLASH)
//
// 실측 원인(390×844 · CPU 4x): ① 레인지로 가며 빌런을 지워 되돌아오면 결과 카드 언마운트 + QQ 소실
//   ② 결과 카드 재마운트마다 animate-fade-in(opacity .45 + blur 3px) ③ 계산 중 카드 460→157px 붕괴
//   ④ 모드 전환 첫 프레임에 이전 모드 에퀴티(46%)가 'BTN 오픈' 라벨로 그려짐 ⑤ Villain 폭 교체로 Hero 52px 흔들림
// vitest 가 node 환경이라 렌더하지 않는다 — 순수 함수는 값으로, 화면 배선은 소스 계약으로 잠근다.
// 실행: npx vitest run src/components/features/gto/modeToggle.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { restoreVillain, equitySignature, visibleEquity, type EquityCache } from './useDeepGto';
import type { Card } from './gto.types';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const HOOK = strip(readFileSync(join(__dirname, 'useDeepGto.ts'), 'utf-8'));
const PANEL = strip(readFileSync(join(__dirname, 'GtoDeepPanel.tsx'), 'utf-8'));

const c = (id: string): Card => ({ rank: id[0], suit: id[1] } as Card);
const AK = [c('As'), c('Ks')];
const QQ = [c('Qh'), c('Qd')];
const NOBOARD: (Card | null)[] = [null, null, null, null, null];

describe('① 모드 왕복 뒤 빌런 카드 보존', () => {
  it('보관한 QQ 를 그대로 되살린다', () => {
    expect(restoreVillain(QQ, AK, NOBOARD)).toEqual(QQ);
  });
  it('레인지 모드 동안 보드로 쓰인 카드는 그 슬롯만 비운다(같은 카드 두 장 금지)', () => {
    expect(restoreVillain(QQ, AK, [c('Qh'), null, null, null, null])).toEqual([null, c('Qd')]);
  });
  it('훅은 레인지 진입 때 빌런을 보관하고, 돌아올 때 restoreVillain 으로 되살린다', () => {
    const m = HOOK.match(/const setVillainMode = useCallback\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/);
    expect(m, 'setVillainMode 를 찾지 못했다').not.toBeNull();
    expect(m![0]).toContain('savedVillainRef.current = villain;');
    expect(m![0]).toMatch(/restoreVillain\(savedVillainRef\.current, hero, board\)/);
    expect(m![0], '같은 모드 재클릭이 보관본을 덮는다').toContain('if (m === villainMode) return;');
  });
});

describe('④ 다른 모드의 에퀴티는 절대 보이지 않는다', () => {
  const eq = { hero: 0.46, villain: 0.54, tie: 0 };
  const handSig = equitySignature('hand', AK, QQ, NOBOARD, 'rfi_btn');
  const rangeSig = equitySignature('range', AK, [null, null], NOBOARD, 'rfi_btn');
  it('서명의 첫 토막이 모드다 — 같은 카드여도 모드가 다르면 서명이 다르다', () => {
    expect(handSig).not.toBe(rangeSig);
  });
  it('특정 핸드 결과만 있을 때 레인지 모드에선 null (수정 전: 46% 가 BTN 오픈 라벨로 한 프레임)', () => {
    const cache: EquityCache = { hand: { sig: handSig, equity: eq, kind: 'monte_carlo' } };
    expect(visibleEquity(cache, 'range', rangeSig)).toBeNull();
    expect(visibleEquity(cache, 'hand', handSig)?.equity.hero).toBe(0.46);
  });
  it('같은 모드라도 입력이 바뀌면(보드 추가) 이전 값을 내주지 않는다', () => {
    const cache: EquityCache = { hand: { sig: handSig, equity: eq, kind: undefined } };
    const withFlop = equitySignature('hand', AK, QQ, [c('2c'), c('7d'), c('9h'), null, null], 'rfi_btn');
    expect(visibleEquity(cache, 'hand', withFlop)).toBeNull();
  });
  it('equity·calculating 은 캐시에서 파생한다 — effect 안 setState 로 뒤따라 맞추지 않는다', () => {
    expect(HOOK).toMatch(/const current = inputReady \? visibleEquity\(equityCache, villainMode, sig\) : null;/);
    expect(HOOK).toMatch(/const calculating = inputReady && !current;/);
    expect(HOOK).not.toMatch(/setCalculating|setEquity\(/);
  });
});

describe('②③⑤ 화면 — 같은 카드, 같은 높이, 같은 자리', () => {
  it('결과 카드에 등장 애니메이션(animate-fade-in blur)이 없다', () => {
    expect(PANEL).not.toMatch(/<CalcCard className="[^"]*animate-fade-in/);
  });
  it('계산 중 자리표시는 결과와 같은 모양(막대 h-5 · h-7)이고 숫자를 그리지 않는다', () => {
    expect(PANEL).toMatch(/<div className="h-5 rounded-input bg-surface-high" \/>/);
    expect(PANEL).toMatch(/<div className="h-7 rounded-input bg-surface-high" \/>/);
    expect(PANEL).toMatch(/\{eq \? `\$\{\(c\.v \* 100\)\.toFixed\(1\)\}%` : '—'\}/);
  });
  it('시트·공유 줄은 레인지 모드에서 사라지지 않고 비활성이 된다(높이 54px 변동 제거)', () => {
    expect(PANEL).not.toMatch(/\{!rangeMode && \(\s*<div className="flex gap-2">/);
    expect(PANEL.match(/disabled=\{rangeMode\}/g)?.length).toBe(2);
  });
  it('Villain 자리는 두 모드가 같은 폭 상자를 쓰고 select 는 그 상자를 채운다', () => {
    expect(PANEL).toMatch(/<div className="w-\[11rem\] min-w-0 shrink">\s*\{deep\.villainMode === 'hand' \? \(/);
    expect(PANEL).toContain('className="input h-12 w-full text-xs font-bold"');
  });
});
