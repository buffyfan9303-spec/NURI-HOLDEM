// UI 이모지 회귀 게이트 — "새 이모지가 화면에 들어오면 여기서 실패한다".
//
// 2026-08-29 에 UI 이모지 300곳을 SVG 로 옮겼다. 그 작업은 한 번 하면 끝나는 게 아니라
// 아무나 한 줄 붙이는 순간 되돌아온다 — 이모지는 타이핑이 제일 쉬운 그림이기 때문이다.
// 그래서 기준선(BASELINE)을 박아두고 거기서 하나라도 늘면 실패시킨다.
//
// **왜 정규식 스트리퍼가 아니라 TypeScript 파서인가**: 처음엔 `//`·`/* */` 를 손으로 걷어냈는데,
// 파일 중간의 따옴표 하나(예: JSX 텍스트의 `'`)에 상태가 어긋나면 그 뒤 주석이 전부 '화면'으로
// 잡혔다(VenueManageTab 에서 실제로 그랬다). 화면에 나가는 건 **문자열 리터럴과 JSX 텍스트뿐**이니
// 그것만 AST 에서 직접 꺼낸다 — 주석은 애초에 AST 에 없다. 오탐이 구조적으로 불가능해진다.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { findEmoji, isPolicyEmoji, SUIT_CP, SHOP_MARK_CP, hex } from './emojiPolicy';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p: string) => path.relative(SRC, p).split(path.sep).join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

export interface Hit { line: number; cp: number; text: string }

/** TS/TSX 에서 '화면에 나갈 수 있는 텍스트'(문자열 리터럴·템플릿·JSX 텍스트)만 훑는다. */
function scanTs(src: string, fileName: string): Hit[] {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: Hit[] = [];
  const lines = src.split(/\r?\n/);
  const take = (node: ts.Node, text: string) => {
    const cps = findEmoji(text);
    if (!cps.length) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    for (const cp of cps) hits.push({ line: line + 1, cp, text: (lines[line] ?? '').trim() });
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node)
      || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
      || ts.isJsxText(node)
    ) take(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

/** CSS 는 블록 주석만 걷어내면 된다(줄 주석이 없고, 남는 건 content:"…" 같은 실렌더 문자열). */
function scanCss(src: string): Hit[] {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const hits: Hit[] = [];
  stripped.split(/\r?\n/).forEach((l, i) => {
    for (const cp of findEmoji(l)) hits.push({ line: i + 1, cp, text: l.trim() });
  });
  return hits;
}

const scanFile = (p: string) =>
  (p.endsWith('.css') ? scanCss(fs.readFileSync(p, 'utf8')) : scanTs(fs.readFileSync(p, 'utf8'), p));

/**
 * 기준선 — 파일별로 '이 코드포인트가 몇 개까지 있어도 되는가'.
 * 예외 2가지(수트·상점 마크)는 코드가 자동 통과시키므로 여기 없다.
 * 여기 남은 것은 **아직 못 고친 부채**이며, 각 줄에 왜 남았는지가 붙어 있다.
 *
 * ⚠ 실패했을 때 여기에 줄을 추가해 통과시키지 마라 — 그건 게이트를 끄는 것이다.
 *   Icon 으로 바꾸는 게 정답이고, 예외 2가지일 때만 근거와 함께 등록한다.
 */
const BASELINE: Record<string, Record<string, number>> = {
  // ── 다른 웨이브가 점유 중이라 이번 커밋에서 손대지 못한 파일 ──
  //    (교체 방법은 이 웨이브의 인수인계 `left` 에 파일:줄 단위로 적어 두었다)
  'App.tsx': { '1F389': 1 },                                   // 🎉 바인 승인 문구 — App.tsx 수정 금지 규약
  'components/features/clock/ClockDisplay.tsx': { '26F6': 1, '2922': 1 },   // ⛶ ⤢ 전체화면 토글
  'components/features/clock/TournamentClock.tsx': { '2921': 2, '2922': 1 }, // ⤡ ⤢ 전체화면 토글
  'components/features/CustomerDashboardPage.tsx': { '1F381': 3 },          // 🎁 카카오 공유 문구
  'components/features/VenueManageTab.tsx': { '270E': 1 },                  // ✎ 순위 초안 배너

  // ── 화면 밖으로 나가는 문자열(앱 UI 아님) ──
  // 카카오/OS 공유 시트로 넘어가는 '메시지 본문'이다. 받는 쪽 앱이 그리므로 우리 아이콘을
  // 넣을 수 없고, 지우면 카피가 바뀐다(기능·카피 보존 규약).
  'lib/recordCard.ts': { '1F3C6': 2, '1F449': 2 },

  // ── 모의 데이터(유저가 쓴 게시글 본문의 모사) ──
  // 실제 서비스에서 이 자리는 사용자가 직접 친 글이다. UI 크롬이 아니라 콘텐츠라 규약 밖.
  'mock/data.ts': { '1F3C6': 3, '1F381': 1 },
};

describe('UI 이모지 규약', () => {
  const files = walk(SRC);

  it('스캐너가 살아 있다 — 예외를 뺀 이모지를 실제로 잡는다(프로브 유효성)', () => {
    // 이 검사가 없으면 스캐너가 통째로 고장 나도 "이상 없음"으로 조용히 통과한다.
    expect(isPolicyEmoji(0x1f389)).toBe(true);   // 🎉
    expect(isPolicyEmoji(0x1f0a0)).toBe(true);   // 🂠 카드 뒷면
    expect(isPolicyEmoji(0x2318)).toBe(true);    // ⌘
    expect(isPolicyEmoji(0x2921)).toBe(true);    // ⤡
    expect(isPolicyEmoji(0xfe0f)).toBe(true);    // 변이 선택자
    expect(isPolicyEmoji(0x200d)).toBe(true);    // ZWJ
    expect(isPolicyEmoji(0x2192)).toBe(false);   // → 는 텍스트 기호
    expect(scanTs("const a = '🎉';", 'a.ts').length).toBe(1);
    expect(scanTs("const a = <b>🎉</b>;", 'a.tsx').length).toBe(1);
    expect(scanTs('// 주석 속 🎉 는 화면에 안 나온다', 'a.ts').length).toBe(0);
    expect(scanTs("const s = \"don't\";\n// 그 뒤 주석의 🎉 도 화면이 아니다", 'a.ts').length).toBe(0);
    expect(scanCss('/* 주석 🎉 */\n.a::after { content: "🎉"; }').length).toBe(1);
    expect(files.length).toBeGreaterThan(100);
  });

  it('예외 2가지 말고는 새 이모지가 화면에 들어오지 않았다', () => {
    const found: Record<string, Record<string, number>> = {};
    const detail: string[] = [];

    for (const f of files) {
      const name = rel(f);
      if (/\.test\.tsx?$/.test(name)) continue;              // 테스트 제목의 🔴/✅ 는 터미널이지 화면이 아니다
      const isMarkCatalog = name === 'lib/shopMarks.ts' || name === 'lib/loyalty.ts';

      for (const h of scanFile(f)) {
        if (SUIT_CP.has(h.cp)) continue;                     // 예외 ① 카드 수트
        if (isMarkCatalog && SHOP_MARK_CP.has(h.cp)) continue; // 예외 ② 상점 마크 카탈로그
        const key = hex(h.cp);
        (found[name] ??= {})[key] = ((found[name] ?? {})[key] ?? 0) + 1;
        detail.push(`${name}|${key}|${h.line} — ${h.text.slice(0, 110)}`);
      }
    }

    const over: string[] = [];
    for (const [name, counts] of Object.entries(found)) {
      for (const [cp, n] of Object.entries(counts)) {
        const allowed = BASELINE[name]?.[cp] ?? 0;
        if (n > allowed) {
          over.push(
            `${name}: U+${cp} ${n}개(허용 ${allowed}개)\n`
            + detail.filter((d) => d.startsWith(`${name}|${cp}|`)).map((d) => `    ${d}`).join('\n'),
          );
        }
      }
    }
    expect(
      over.join('\n'),
      '새 UI 이모지가 들어왔다. Icon.tsx 의 아이콘으로 바꿔라(없으면 LUCIDE 맵에 한 줄).\n'
      + '예외는 카드 수트와 랭킹 상점 마크뿐이다.',
    ).toBe('');
  });

  it('기준선이 실물보다 헐겁지 않다 — 고친 부채는 목록에서도 빠져야 한다', () => {
    // 이게 없으면 이모지를 지운 뒤에도 기준선이 남아, 같은 이모지가 되돌아와도 통과한다.
    const stale: string[] = [];
    for (const [name, counts] of Object.entries(BASELINE)) {
      const p = path.join(SRC, name);
      const actual: Record<string, number> = {};
      if (fs.existsSync(p)) {
        for (const h of scanFile(p)) {
          if (SUIT_CP.has(h.cp)) continue;
          actual[hex(h.cp)] = (actual[hex(h.cp)] ?? 0) + 1;
        }
      }
      for (const [cp, n] of Object.entries(counts)) {
        if ((actual[cp] ?? 0) < n) {
          stale.push(`${name}: U+${cp} 기준선 ${n}개인데 실제 ${actual[cp] ?? 0}개 — 기준선을 줄여라`);
        }
      }
    }
    expect(stale.join('\n')).toBe('');
  });

  it('ZWJ 시퀀스·변이 선택자·키캡이 화면 문자열에 없다', () => {
    // ZWJ 는 기기에서 분해되면 여러 글자로 보이고(👨‍👩‍👧 → 사람 셋),
    // FE0F 유무는 같은 글자를 흑백/컬러로 갈라놓는다. 둘 다 '기기마다 다르게 보이는' 대표 원인.
    const bad: string[] = [];
    for (const f of files) {
      for (const h of scanFile(f)) {
        if (h.cp === 0x200d || h.cp === 0xfe0f || h.cp === 0xfe0e || h.cp === 0x20e3) {
          bad.push(`${rel(f)}:${h.line} U+${hex(h.cp)} — ${h.text.slice(0, 100)}`);
        }
      }
    }
    expect(bad.join('\n')).toBe('');
  });
});
