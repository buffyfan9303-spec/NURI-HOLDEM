// 연합리그 제거 + 파트너 매칭 신설 계약 (오너 2026-09-17: "연합리그 기능은 다 없애고 연합리그 매칭만 제작").
//
//   A. 제거 — LeaguePanel·api/leagues 는 없고, 아무도 다시 import 하지 않는다. 옛 알림 alias(league→dashboard)는 남긴다.
//   B. 배선 — 파트너 매장 판이 VenueManageTab 에 실제로 달려 있다(정의만 있고 안 달면 화면은 영원히 안 뜬다).
//   C. 안전 — 매칭은 짝만 지어 준다: 돈·점수 컬럼 0 · 옛 notify_league_* 재사용 0 · RPC 0 · 라벨 4~6자 nowrap.
//   D. 문서 — 없는 기능(연합 리그)을 안내하는 문서가 없고, 매뉴얼 절 번호가 이어진다.
//   E. 함정 — loyalty.ts 의 leagueTierOf(코스메틱 티어)는 연합리그가 아니다. grep league 로 지우면 안 된다.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs|js)$/.test(e)) out.push(p);
  }
  return out;
};

describe('A. 연합리그 화면·클라이언트 제거', () => {
  it('LeaguePanel.tsx · api/leagues.ts 가 없다', () => {
    expect(existsSync(join(ROOT, 'src/components/features/LeaguePanel.tsx'))).toBe(false);
    expect(existsSync(join(ROOT, 'src/api/leagues.ts'))).toBe(false);
  });
  it('src 어디에도 LeaguePanel · api/leagues 참조가 없다(주석 제외)', () => {
    const hits = walk(join(ROOT, 'src'))
      .filter((p) => !p.endsWith('venueMatch.contract.test.ts'))
      .filter((p) => /LeaguePanel|api\/leagues|from ['"]\.\/leagues['"]/.test(code(readFileSync(p, 'utf8'))));
    expect(hits, hits.join('\n')).toEqual([]);
  });
  it('옛 알림 딥링크 alias(league → dashboard)는 남아 있다 — 기발송 알림의 무음 실패 방지', () => {
    expect(code(read('src/components/features/VenueManageTab.tsx'))).toMatch(/league:\s*'dashboard'/);
  });
});

describe('B. 파트너 매장 판 배선', () => {
  const vmt = code(read('src/components/features/VenueManageTab.tsx'));
  it("Section 에 'partners' 가 있고 nav 는 업주(manageOk)에게만 열린다", () => {
    expect(vmt).toMatch(/type Section = [^\n]*'partners'/);
    expect(vmt).toMatch(/if \(manageOk\) available\.push\(\{ id: 'partners', label: '파트너 매장'/);
  });
  it('판이 실제로 box() 에 달려 있고 VenueMatchPanel 을 렌더한다', () => {
    // S6-2(2026-09-19): 지역 Suspense 경계가 box(…) 와 VenueMatchPanelM 사이에 끼었다(첫 방문 lazy 청크
    // 로딩이 App.tsx 최상위 폴백까지 번져 내 매장 전체가 사라지던 것을 막는 경계) — 그 한 겹은 허용.
    expect(vmt).toMatch(/box\('partners',\s*(<Suspense fallback=\{[^}]*\}>\s*)?<VenueMatchPanelM venueId=\{venueId\} canConfigure=\{manageOk\}/);
    expect(vmt).toMatch(/import\('\.\/VenueMatchPanel'\)/);
    expect(vmt).toMatch(/partners:\s*'partners'/); // 알림 /my-store/partners 딥링크 alias
  });
});

describe('C. 매칭은 짝만 지어 준다 (§10 계층1 #3)', () => {
  const mig = read('supabase/migrations/20260917f_venue_match_partners.sql');
  const api = code(read('src/api/venueMatch.ts'));
  const panel = code(read('src/components/features/VenueMatchPanel.tsx'));
  it('마이그레이션에 돈·점수 컬럼이 없다', () => {
    const cols = [...mig.matchAll(/^\s{2}([a-z_]+)\s+(uuid|text|date|timestamptz|integer|numeric|boolean|jsonb)/gm)].map((m) => m[1]);
    expect(cols.length).toBeGreaterThan(10);
    expect(cols.filter((c) => /(point|prize|amount|buy_in|buyin|entr|seat|money|price|fee|score)/.test(c))).toEqual([]);
  });
  it('옛 notify_league_* 를 재사용하지 않고 새 함수 셋의 실행권을 회수한다', () => {
    expect(mig.replace(/--.*$/gm, '')).not.toMatch(/notify_league_/); // 주석(머리말)은 제외 — 실행 SQL 만 본다
    for (const f of ['notify_venue_match_response', 'notify_venue_match_decision', 'venue_match_response_guard']) {
      expect(mig, f).toMatch(new RegExp(`revoke execute on function public\\.${f}\\(\\) from public, anon, authenticated;`));
    }
    expect(mig).toMatch(/set search_path = public, pg_temp/);
    expect(mig).toMatch(/created_by is not distinct from auth\.uid\(\)/);
  });
  it('클라이언트는 표 접근뿐 — RPC 호출·집계 없음', () => {
    expect(api).not.toMatch(/\.rpc\(/);
    expect(api).not.toMatch(/points|prize|entries/);
  });
  it("버튼 라벨은 4~6자 + nowrap, '리그' 라는 말은 화면에 없다", () => {
    expect(panel).not.toMatch(/리그/);
    // onClick 화살표(=>)에 '>' 가 들어 있어 [^>]* 로는 못 가른다 — 여는 태그부터 닫는 태그까지 통째로 잘라 본다.
    const buttons = [...panel.matchAll(/<button[\s\S]*?<\/button>/g)]
      .map((m) => m[0])
      .map((b) => ({ cls: /className=\{?["'`]?([^}"'`]*)/.exec(b)?.[1] ?? '', label: />([^<>{}]+)<\/button>$/.exec(b)?.[1]?.trim() ?? '' }))
      .filter((b) => b.label);
    expect(buttons.length).toBeGreaterThanOrEqual(8);
    for (const { cls, label } of buttons) {
      const nowrap = /whitespace-nowrap/.test(cls) || /\bBTN(_OK|_NO|_MUTE)?\b/.test(cls);
      expect(nowrap, `'${label}' 가 두 줄로 접힐 수 있습니다`).toBe(true);
      expect(label.length, `'${label}' 라벨 길이`).toBeGreaterThanOrEqual(4);
      expect(label.length, `'${label}' 라벨 길이`).toBeLessThanOrEqual(6);
    }
    expect(panel).toMatch(/const BTN = 'shrink-0 whitespace-nowrap/);
  });
});

describe('D. 문서가 없는 기능을 안내하지 않는다', () => {
  it('업주 매뉴얼·가이드에 연합 리그 안내가 없다', () => {
    for (const p of ['public/guide/manual.html', 'docs/owner-guide/업주가이드.html']) {
      const s = read(p);
      expect(s, p).not.toMatch(/연합\s?리그|alliance-league/);
    }
  });
  it('매뉴얼 절 번호가 1부터 빈틈없이 이어진다(목차·제목 각 1회)', () => {
    const ns = [...read('public/guide/manual.html').matchAll(/<span class="n">(\d+)<\/span>/g)].map((m) => Number(m[1]));
    const max = Math.max(...ns);
    for (let i = 1; i <= max; i++) expect(ns.filter((n) => n === i).length, `절 ${i}`).toBe(2);
  });
});

describe('E. league 두 개념 함정', () => {
  it('loyalty.ts(코스메틱 활동점수 — §10 이 지목한 안전 설계의 표본)는 지워지지 않았다', () => {
    // 2026-09-17 실측: leagueTierOf 심볼은 이미 없고 주석에 weekly_league 만 남아 있다 — 이름이 아니라 파일 존재로 잠근다.
    expect(existsSync(join(ROOT, 'src/lib/loyalty.ts'))).toBe(true);
    expect(read('src/lib/loyalty.ts')).toMatch(/주간 리그\(weekly_league\)/);
  });
});
