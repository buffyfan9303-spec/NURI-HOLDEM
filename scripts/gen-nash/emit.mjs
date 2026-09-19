// 산출 표를 src/lib/nash.data.ts 에 써넣는다 — 기본은 **빅앤티('ante') 서브트리만** 교체, 노앤티는 손대지 않는다.
// 파일은 바이트로 다루고(CRLF 보존) 세 객체 리터럴(한 줄 JSON)만 바꾼다. 앵커가 1회씩 맞지 않으면 아무것도 쓰지 않는다.
// 실행: node emit.mjs <solved.json> <nash.data.ts> [scope=ante|all] [stacks=7,8,9,10,12,15,20] [ks=1]
//   stacks 를 주면 **그 깊이만** 교체하고 나머지 깊이의 문자열은 옛 값 그대로 둔다(2026-09-19 리드 결정: 모델이 검증된 7bb+ 만).
//   ks 를 주면 **그 자리(뒤 인원)만** 교체한다. 스택 필터만으로는 "k=1 은 전 깊이 · k≥2 는 12bb+" 같은
//   2026-09-19 교체 범위를 한 번에 못 낸다 — 두 번 나눠 부른다(README 참고).
import { readFileSync, writeFileSync } from 'node:fs';

const [, , solvedFile, target, scope = 'ante', stacksArg, ksArg] = process.argv;
const onlyStacks = stacksArg ? new Set(stacksArg.split(',').map((s) => String(Number(s)))) : null;
const onlyKs = ksArg ? new Set(ksArg.split(',').map((s) => String(Number(s)))) : null;
const solved = JSON.parse(readFileSync(solvedFile, 'utf-8')).tables;
const raw = readFileSync(target);
const text = raw.toString('utf-8');
const NAMES = { shove: 'SHOVE', callBB: 'CALL_BB', callSB: 'CALL_SB' };
let out = text; let replaced = 0;
for (const [kind, name] of Object.entries(NAMES)) {
  const re = new RegExp(`(const ${name}: Record<string, Record<string, Record<string, string>>> = )(\\{[^\\r\\n]*\\})(;)`);
  const m = out.match(re);
  if (!m) throw new Error('anchor not found: ' + name);
  if (out.split(m[0]).length !== 2) throw new Error('anchor not unique: ' + name);
  const cur = JSON.parse(m[2]);
  // 깊이 필터: 옛 표 위에 산출 표를 **선택한 깊이만** 덮는다(없던 k 는 새로 만들지 않는다 — callSB k=1 같은 구조적 빈칸 보존)
  const merge = (oldA, newA) => {
    if (!onlyStacks && !onlyKs) return newA;
    const out = {};
    for (const k of new Set([...Object.keys(oldA ?? {}), ...Object.keys(newA ?? {})])) {
      out[k] = { ...(oldA?.[k] ?? {}) };
      if (onlyKs && !onlyKs.has(String(Number(k)))) continue;
      for (const s of Object.keys(newA?.[k] ?? {})) if ((!onlyStacks || onlyStacks.has(String(Number(s)))) && (oldA?.[k]?.[s] !== undefined || !oldA)) out[k][s] = newA[k][s];
    }
    return out;
  };
  const next = scope === 'all'
    ? { no: merge(cur.no, solved[kind].no), ante: merge(cur.ante, solved[kind].ante) }
    : { ...cur, ante: merge(cur.ante, solved[kind].ante) };
  // 키 순서 보존: 옛 파일과 같은 순서(no → ante · k 오름차순 · 스택 오름차순)
  const ordered = {};
  for (const a of ['no', 'ante']) {
    ordered[a] = {};
    for (const k of Object.keys(next[a]).map(Number).sort((x, y) => x - y)) {
      ordered[a][k] = {};
      for (const s of Object.keys(next[a][k]).map(Number).sort((x, y) => x - y)) ordered[a][k][s] = next[a][k][s];
    }
  }
  for (const a of ['no', 'ante']) for (const k of Object.keys(ordered[a])) for (const s of Object.keys(ordered[a][k])) {
    const v = ordered[a][k][s];
    if (typeof v !== 'string' || v.length !== 169 || /[^0-8]/.test(v)) throw new Error(`bad table ${kind}/${a}/${k}/${s}`);
  }
  out = out.replace(m[0], `${m[1]}${JSON.stringify(ordered)}${m[3]}`);
  replaced += 1;
}
if (replaced !== 3) throw new Error('expected 3 replacements');
writeFileSync(target, Buffer.from(out, 'utf-8'));
console.log(`wrote ${scope} tables into ${target} (CRLF preserved: ${raw.includes('\r\n') === out.includes('\r\n')})`);
