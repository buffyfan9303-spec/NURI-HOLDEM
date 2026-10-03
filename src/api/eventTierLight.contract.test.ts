// 이벤트 등급 글자색은 **라이트 테마 값이 따로 있는 클래스**만 쓴다 — 2026-10-04 재점검 2회차 중-1.
// 3등이 `text-cyan-300`(라이트 오버라이드 없음)이라 흰 지면 위 범례 1.35 · 확률 공개 표 1.45 · 열린 카드 1.26 이었다.
// 이 앱의 테마는 `dark:` 변형이 아니라 index.css 의 `html.light .클래스` 규칙으로 뒤집힌다 — 그 규칙이 없는 색 클래스는
// 라이트에서 다크용 밝은 색 그대로 나온다. 실제 대비 수치는 재점검 하네스(픽셀)가 잰다 — 여기는 원인(규칙 부재)만 잠근다.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TIER_META } from './events';

// events.ts 는 supabase 클라이언트를 import 한다 — 네트워크·env 없이 상수만 읽게 막는다.
vi.mock('../lib/supabase', () => ({ IS_MOCK: false, supabase: { auth: { onAuthStateChange: () => {} } } }));

const CSS = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('이벤트 등급 글자색 — 라이트 오버라이드가 있는 클래스만', () => {
  for (const [tier, m] of Object.entries(TIER_META)) {
    it(`${tier}등 ${m.text}`, () => {
      expect(m.text.split(/\s+/), `${tier}등 글자색이 여러 클래스다 — 이 검사의 전제(한 클래스)가 깨졌다`).toHaveLength(1);
      const re = new RegExp(`html\\.light[^{}]*\\.${esc(m.text)}(?![\\w-])`);
      expect(CSS, `${tier}등 '${m.text}' 에 html.light 규칙이 없다 — 라이트 흰 지면 위에서 다크용 밝은 색이 그대로 나온다`).toMatch(re);
    });
  }
});
