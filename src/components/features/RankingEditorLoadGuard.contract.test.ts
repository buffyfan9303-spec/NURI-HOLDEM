// F1(2026-09-13) — 매장 순위 편집기가 '조회 실패' 를 '저장된 순위 0건' 으로 그리고, 그 빈 폼의 저장이
// 서버의 (날짜+게임) 전체 삭제→재삽입을 태워 **이미 저장된 순위(와 활동점수)를 영구히 지우던** 결함의 배선 계약.
//
// 왜 계약인가: `getVenueRankings(...).catch(() => setAllEntries([]))` 는 한 줄이라 리팩터 중에 쉽게 되돌아온다.
//   같은 파일 StaffWageManager(loadErr → 저장 버튼 disabled + role="alert")가 이미 같은 사고(시급 0 덮어쓰기)를 막고 있어
//   그 패턴을 RankingEditor 에 그대로 이식했고, 여기서는 **이식이 살아 있는지**만 본다.
//
// 이 파일이 보는 것:
//   1. 조회 실패가 loadErr(msgOf) 에 남는다 — 빈 배열로 위장하지 않는다.
//   2. 실패 중에는 rows 를 emptyRow() 로 갈아끼우지 않는다(로더 effect 가 loadErr 에서 조기 반환).
//   3. save() 첫 줄이 loadErr 에서 조기 반환한다 — 버튼 disabled 만으로는 키보드·프로그램 호출을 못 막는다.
//   4. 저장 버튼이 saving 뿐 아니라 loadErr 에도 잠긴다.
//   5. role="alert" 안내 + 다시 시도가 있다.
// 못 보는 것: 문장의 존재만 본다. 실제 렌더·클릭은 e2e 몫이다. 이름을 바꾼 복제본은 못 잡는다.
// 음성 대조: VenueManageTab.tsx 의 `.catch((e: unknown) => { setAllEntries([]); setLoadErr(` 를 `.catch(() => setAllEntries([]))` 로,
//   `if (loading || loadErr) return;` 을 `if (loading) return;` 으로, `disabled={saving || !!loadErr}` 를 `disabled={saving}` 으로,
//   save() 의 `if (loadErr) return` 줄을 지우면 각각 1·2·4·3 이 실패한다.
// 실행: npx vitest run src/components/features/RankingEditorLoadGuard.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// StaffAccessState.contract.test.ts 와 같은 스트리퍼 — `accept="image/*"` 가 다음 `*/` 까지 삼키는 것을 막는다.
const strip = (s: string) => s.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
const VMT = strip(readFileSync(join(__dirname, 'VenueManageTab.tsx'), 'utf-8'));
const start = VMT.indexOf('function RankingEditor(');
expect(start, 'RankingEditor 를 찾지 못했다').toBeGreaterThan(-1);
const end = VMT.indexOf('\nfunction Lbl(', start);
expect(end, 'RankingEditor 의 끝(Lbl)을 찾지 못했다').toBeGreaterThan(start);
const RE = VMT.slice(start, end);

describe('F1 · 순위 편집기는 조회 실패 중에 저장하지 않는다', () => {
  it('🔴 getVenueRankings 실패가 loadErr 에 남는다 — `.catch(() => setAllEntries([]))` 로 위장하지 않는다', () => {
    expect(RE).toMatch(/const \[loadErr, setLoadErr\] = useState<string \| null>\(null\);/);
    expect(RE).not.toMatch(/\.catch\(\(\) => setAllEntries\(\[\]\)\)/);
    expect(RE).toMatch(/onLoaded: \(entries\) => \{ setAllEntries\(entries\); setLoadErr\(null\); \},/);
    expect(RE).toMatch(/onError: \(m\) => \{ setAllEntries\(\[\]\); setLoadErr\(m\); \},/);
  });

  // 독립 검증(2026-09-13)이 잡은 잔여 경합 — 늦은 A 날짜 응답이 B 날짜 rows 를 덮어 F1 과 같은 소실을 낸다.
  it('🔴 조회 effect 가 loadRankingsEffect 에 위임하고 그 cleanup 을 **반환**한다(대상이 바뀌면 이전 응답을 버린다)', () => {
    expect(VMT).toMatch(/import \{ loadRankingsEffect \} from '\.\.\/\.\.\/lib\/rankingsLoad';/);
    expect(RE).toMatch(/setLoading\(true\);\s*\n\s*return loadRankingsEffect\(\{\s*\n\s*fetch: \(\) => getVenueRankings\(venueId, date\),/);
    expect(RE).toMatch(/onSettled: \(\) => setLoading\(false\),\s*\n\s*\}\);\s*\n\s*\}, \[venueId, date, rankTick\]\);/);
    // 옛 인라인 then/catch/finally 체인이 남아 있지 않다(가드 없는 경로)
    expect(RE).not.toMatch(/getVenueRankings\(venueId, date\)\s*\.then\(/);
  });

  it('🔴 실패 중에는 rows 를 빈 줄로 갈아끼우지 않는다 — 로더 effect 가 loadErr 에서 조기 반환', () => {
    expect(RE).toMatch(/if \(loading \|\| loadErr\) return;\s*\n\s*const mine = allEntries\.filter/);
  });

  it('🔴 save() 첫 줄이 loadErr 에서 조기 반환한다 — 이 줄이 없으면 빈 폼 저장이 서버 전체 교체를 태운다', () => {
    const s = RE.indexOf('const save = async () => {');
    expect(s, 'save 를 찾지 못했다').toBeGreaterThan(-1);
    const head = RE.slice(s, s + 400);
    // 첫 문장이어야 한다 — clean/닉네임 검사보다 앞.
    expect(head).toMatch(/const save = async \(\) => \{\s*\n\s*if \(loadErr\) return toast\.show\(/);
    expect(head.indexOf('if (loadErr) return')).toBeLessThan(head.indexOf('const clean = rows.filter'));
  });

  it('🔴 저장 버튼이 loadErr 에도 잠긴다', () => {
    expect(RE).toMatch(/<button type="button" onClick=\{save\} disabled=\{saving \|\| !!loadErr\}/);
    expect(RE).not.toMatch(/onClick=\{save\} disabled=\{saving\}/);
  });

  it('실패 안내가 role="alert" 로 뜨고, 무엇이 지워질 수 있는지와 다시 시도를 말한다', () => {
    const i = RE.indexOf('{loadErr && (');
    expect(i, 'loadErr 안내 블록이 없다').toBeGreaterThan(-1);
    const block = RE.slice(i, i + 900);
    expect(block).toMatch(/role="alert"/);
    expect(block).toContain('이미 저장된 순위가 지워질 수 있어');
    expect(block).toMatch(/onClick=\{\(\) => setRankTick\(\(t\) => t \+ 1\)\}/);
    // 재시도 틱이 실제로 조회 effect 의 deps 에 있어야 버튼이 무언가를 한다.
    expect(RE).toMatch(/\}, \[venueId, date, rankTick\]\);/);
  });
});
