// 외부 생성형 AI 표면 계약 (2026-09-11 오너 지시)
//
// 오너 결정: "웹에 과도하게 흩어진 외부 AI 기능을 제거하고 꼭 필요한 AI만 남긴다" —
// 남는 것은 **TDA 규칙 질의 하나뿐**이다.
//
// 이 테스트는 그 결정을 소스 수준에서 잠근다. 기능 테스트가 아니라 **표면(surface) 테스트**다:
// 누군가 편의를 위해 범용 AI 클라이언트를 다시 만들거나, 문의·후기·순위·장부·GTO 화면에
// 모델 호출을 되살리면 여기서 실패한다. 사람이 리뷰에서 놓치기 쉬운 종류의 회귀라 자동화한다.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');
const FUNCS = join(ROOT, 'supabase', 'functions');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');

/** 주석·문서 문자열이 아니라 **실제 호출**만 본다. 히스토리를 적은 주석까지 막으면 기록을 못 남긴다. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('외부 생성형 AI 표면 — TDA 규칙 질의 하나만 남는다', () => {
  const srcFiles = walk(SRC).filter((p) => !/\.test\.tsx?$/.test(p));

  it('클라이언트에서 supabase.functions.invoke 로 부르는 AI 함수는 tda-assist 뿐이다', () => {
    const offenders: string[] = [];
    for (const p of srcFiles) {
      const code = stripComments(readFileSync(p, 'utf-8'));
      for (const m of code.matchAll(/functions\.invoke\(\s*['"]([^'"]+)['"]/g)) {
        const fn = m[1];
        // AI 가 아닌 엣지 함수(본인인증·푸시·제재 안내)는 이 계약의 대상이 아니다.
        if (['verify-identity', 'send-push', 'notify-sanction'].includes(fn)) continue;
        if (fn === 'tda-assist') continue;
        offenders.push(`${rel(p)} → ${fn}`);
      }
    }
    expect(offenders, `AI 엣지 함수 호출이 새로 생겼다:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('범용 AI 클라이언트(aiGenerate/aiInspectImages)가 되살아나지 않았다', () => {
    const offenders = srcFiles.filter((p) => /\b(aiGenerate|aiInspectImages)\s*\(/.test(stripComments(readFileSync(p, 'utf-8'))));
    expect(offenders.map(rel), '범용 AI 헬퍼 호출이 다시 생겼다').toEqual([]);
  });

  it('src/api/ai.ts · gto.explain.ts 는 존재하지 않는다', () => {
    expect(existsSync(join(SRC, 'api', 'ai.ts')), 'src/api/ai.ts 가 되살아났다').toBe(false);
    expect(existsSync(join(SRC, 'components', 'features', 'gto', 'gto.explain.ts')), 'gto.explain.ts 가 되살아났다').toBe(false);
  });

  it('문의·후기·순위·장부·GTO 화면 어디에도 모델 호출이 없다', () => {
    const watched = [
      'src/components/features/AdminTab.tsx',
      'src/components/features/VenueReviews.tsx',
      'src/components/features/StoreDashboard.tsx',
      'src/components/features/LedgerStatsPanel.tsx',
      'src/components/features/gto/GtoDeepPanel.tsx',
      'src/components/features/tools/quizCards.tsx',
      'src/api/reviews.ts',
      'src/api/rankverify.ts',
    ];
    const offenders: string[] = [];
    for (const f of watched) {
      const p = join(ROOT, f);
      if (!existsSync(p)) continue;
      const code = stripComments(readFileSync(p, 'utf-8'));
      if (/functions\.invoke\(\s*['"](gemini|gto-explain|tda-assist)/.test(code)) offenders.push(f);
      if (/\b(aiGenerate|aiInspectImages|explainDeepSpot|explainQuizMiss)\b/.test(code)) offenders.push(f);
    }
    expect([...new Set(offenders)], 'AI 호출이 되살아난 화면').toEqual([]);
  });

  it('장부 운영 리포트는 결정론적 로컬 계산이다 — 네트워크 호출이 없다', () => {
    const code = stripComments(readFileSync(join(ROOT, 'src/components/features/LedgerStatsPanel.tsx'), 'utf-8'));
    expect(code).toContain('buildOpsReport');
    expect(/\bfetch\s*\(|functions\.invoke\(|supabase\.rpc\(/.test(code.split('function buildOpsReport')[1] ?? ''), '운영 리포트가 외부를 부른다').toBe(false);
  });

  it('엣지 함수 중 Gemini 를 부르는 것은 tda-assist 뿐이고, 옛 gemini 함수는 거절 스텁이다', () => {
    if (!existsSync(FUNCS)) return;
    const callers: string[] = [];
    for (const dir of readdirSync(FUNCS)) {
      const idx = join(FUNCS, dir, 'index.ts');
      if (!existsSync(idx)) continue;
      const code = stripComments(readFileSync(idx, 'utf-8'));
      if (code.includes('generativelanguage.googleapis.com')) callers.push(dir);
    }
    expect(callers.sort()).toEqual(['tda-assist']);

    const gemini = join(FUNCS, 'gemini', 'index.ts');
    if (existsSync(gemini)) {
      const code = readFileSync(gemini, 'utf-8');
      expect(code, '옛 범용 프록시가 거절 스텁이 아니다').toContain('410');
      expect(stripComments(code)).not.toContain('GEMINI_API_KEY');
    }
  });

  it('tda-assist 클라이언트는 질문과 규칙 키만 보낸다 — system/model/images 를 지정하지 않는다', () => {
    const code = readFileSync(join(SRC, 'api', 'tdaAssist.ts'), 'utf-8');
    expect(code).toContain('ruleKeys');
    for (const forbidden of ['system:', 'model:', 'images:', 'temperature:']) {
      expect(stripComments(code), `클라이언트가 ${forbidden} 를 보낸다`).not.toContain(forbidden);
    }
  });
});
