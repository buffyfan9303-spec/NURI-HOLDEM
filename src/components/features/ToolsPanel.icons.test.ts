// GTO 탭 도구 카탈로그 아이콘 게이트(2026-09-03) — ① 26개 도구는 서로 다른 lucide 아이콘 ② 모두 Icon 아톰이 아는 이름.
// vitest 는 node 환경이라 ToolsPanel.tsx(에퀴티 엔진·컨텍스트 트리)를 import 하지 않고 소스 문자열에서 읽는다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* eslint-disable security/detect-non-literal-fs-filename -- 테스트가 옆 소스 두 개를 읽는다(고정 상대경로) */
const src = readFileSync(new URL('./ToolsPanel.tsx', import.meta.url), 'utf8');
const iconSrc = readFileSync(new URL('../atoms/Icon.tsx', import.meta.url), 'utf8');
/* eslint-enable security/detect-non-literal-fs-filename */

const toolsBlock = src.slice(src.indexOf('const TOOLS:'), src.indexOf('const LANES:'));
const toolIcons = [...toolsBlock.matchAll(/icon: '([a-z0-9-]+)'/g)].map((m) => m[1]);
const knownNames = new Set([...iconSrc.slice(iconSrc.indexOf('export type IconName'), iconSrc.indexOf('const PATHS')).matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));

describe('ToolsPanel 도구 아이콘', () => {
  it('26개 도구가 서로 다른 아이콘을 쓴다', () => {
    expect(toolIcons).toHaveLength(26);
    expect(new Set(toolIcons).size).toBe(26);
  });
  it('모든 도구·레인 아이콘이 Icon 아톰에 등록된 이름이다', () => {
    const laneIcons = [...src.slice(src.indexOf('const LANES:'), src.indexOf('export const STORE_TOOL_KEYS')).matchAll(/icon: '([a-z0-9-]+)'/g)].map((m) => m[1]);
    expect(laneIcons).toHaveLength(4);
    for (const n of [...toolIcons, ...laneIcons]) expect(knownNames.has(n), n).toBe(true);
  });
});
