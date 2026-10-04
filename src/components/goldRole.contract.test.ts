// 금색 역할 계약 — 오너 결정 2026-10-05 'E+황동': 금색(gold 팔레트)은 **순위(1·2·3위)·트로피·업적 배지**에만 쓴다.
//   금액 숫자는 본문 색, 누르는 것은 황동(accent), 경고 신호(접수 마감·일시정지·D-day·급한 할 일)는 앰버.
// 파일 단위 허용 목록이다 — 새 파일에서 금색 유틸이 나오면 실패한다(그 자리가 순위·성취인지 사람이 보고 목록에 넣는다).
// 주석을 걷고 본다(주석 속 문자열로 거짓 실패/통과 금지). 클래스 이름 전체를 이 파일에 쓰지 않는다 — Tailwind 가 평문을 스캔해
//   죽은 CSS 를 만든다(CLAUDE.md 참고 메모). 실행: npx vitest run src/components/goldRole.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(process.cwd(), 'src');
const GOLD = new RegExp('\\b(?:text|bg|border|ring|from|via|to|fill|stroke|outline|divide|decoration|shadow)-' + 'go' + 'ld-\\d{3}');
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** 금색이 허용된 파일과 그 까닭(순위·트로피·업적만). */
const ALLOW: Record<string, string> = {
  'api/events.ts': '이벤트 1등',
  'components/features/AdminTab.tsx': '관리자 순위표 1위 색',
  'components/features/CommunityShoutBar.tsx': '외치기 등급(골드·보드 티어)',
  'components/features/CustomerDashboardPage.tsx': '내 대회 전적·순위 추이·에이스(AA)·시즌 우승 배지·최고 레벨',
  'components/features/PastTournaments.tsx': '지난 대회 우승자 트로피',
  'components/features/SeasonPanel.tsx': '시즌 리그·역대 챔피언',
  'components/features/StoreDashboard.tsx': '순위 입력 줄 트로피·주간 1위 줄',
  'components/features/TierLeaderboard.tsx': '명예의 전당·시상대 1위·상위 랭커',
  'components/features/VenuePage.tsx': '시즌 선두 왕관·시상대',
  'lib/loyalty.ts': '업적 배지(챔피언·기둥·개근·레전드)',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

describe('금색은 순위·트로피·업적에만(오너 2026-10-05)', () => {
  const users = walk(ROOT)
    .filter((p) => GOLD.test(strip(readFileSync(p, 'utf8'))))
    .map((p) => relative(ROOT, p).split(sep).join('/'))
    .sort();

  it('금색 유틸을 쓰는 파일은 허용 목록(순위·성취 화면) 안에만 있다', () => {
    const extra = users.filter((u) => !(u in ALLOW));
    expect(extra, `금색은 순위·트로피·업적 전용이다 — 금액은 본문 색, 누르는 것은 황동(accent), 경고는 앰버로 바꾸거나, 정말 순위·성취면 ALLOW 에 까닭과 함께 넣어라: ${extra.join(', ')}`).toEqual([]);
  });

  it('허용 목록이 낡지 않았다(금색을 다 걷은 파일은 목록에서도 뺀다)', () => {
    const stale = Object.keys(ALLOW).filter((a) => !users.includes(a));
    expect(stale, `더는 금색을 안 쓰는 파일이 허용 목록에 남아 있다: ${stale.join(', ')}`).toEqual([]);
  });

  it('검사가 실제로 파일을 본다(공허 통과 방지)', () => {
    expect(users.length).toBeGreaterThanOrEqual(5);
  });
});
