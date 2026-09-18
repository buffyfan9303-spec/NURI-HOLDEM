// 최상위 탭 pane 구조 규약 — "한 탭만 다른 방식으로 렌더된다" 를 컴파일 밖에서 잡는다.
//
// 왜 필요한가(2026-09-15 오너 3번 "관리자 설정이 자꾸 이질감이 느껴진다"):
//   관리자 pane 만 `{activeTab === 'admin' && …}` 라 **떠났다 오면 통째로 재마운트**됐다.
//   그 하나의 차이가 실측으로 셋이 됐다(1440 프로덕션 빌드, 같은 하네스):
//     · 진입 CLS   관리자 0.1297 vs 커뮤니티 0.0029   (본문이 늦게 자라 푸터를 205px 끌어내린다)
//     · root 전환  관리자 **0개** vs 커뮤니티 vt-push-out-l 220ms / vt-push-in-r 300ms
//     · 섹션 상태  떠날 때 '포스터 승인' → 돌아오니 '운영 분석'
//   keep-alive(display 토글)로 맞춘 뒤: 관리자 CLS **0.0084** · root 전환 커뮤니티와 **동일**.
//
//   ⚠ 이 규약이 없으면 되돌아가도 **아무 테스트도 실패하지 않는다.** 모션과 CLS 는 조용히 사라지는
//     부류고(에러도 경고도 없다), 그게 이 결함이 오래 남아 있던 이유다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔴 **주석을 걷어내고 읽는다.** 2026-09-19 에 이것 때문에 거짓 실패가 났다.
 *   아래 정규식은 파일 전체에서 **첫 매치**를 잡는데, 누군가 주석에
 *   `<main data-tab="my-store">` 라는 리터럴을 설명용으로 적자 **실제 엘리먼트(4166행)보다
 *   먼저 나오는 그 주석**이 잡혀 "tab-pane 클래스가 없다" 고 말했다. 코드는 멀쩡했다.
 *   CLAUDE.md 가 기록한 "Tailwind content 는 평문 스캔이라 주석에 적은 클래스도 CSS 를 만든다 —
 *   금지하려는 클래스명을 주석에 그대로 쓰지 마라" 와 **같은 부류**다.
 *   주석을 못 쓰게 하는 대신 **검사가 코드만 보게** 고친다 — 사람이 조심하는 것보다 확실하다.
 *   ⚠ 줄 수는 보존한다(줄번호를 보고할 수 있어야 한다 — lazyModalOpener 계약과 같은 조리법).
 */
const codeOnly = (input: string): string =>
  input
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

const APP = codeOnly(readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8'));

/** keep-alive 로 렌더되는 최상위 탭 pane 들. 값은 `<main data-tab="…">` 의 탭 id. */
const KEEP_ALIVE_PANES = ['my-store', 'admin'] as const;

describe('최상위 탭 pane 은 같은 방식으로 렌더된다', () => {
  for (const tab of KEEP_ALIVE_PANES) {
    it(`🔴 ${tab} pane 은 display 토글로 유지된다(재마운트 금지)`, () => {
      const m = new RegExp(`<main data-tab="${tab}"[^>]*`).exec(APP);
      expect(m, `<main data-tab="${tab}"> 가 없다 — pane 셀렉터·스타일이 전부 이 속성을 본다`).not.toBeNull();
      const tag = m![0];
      expect(tag, `${tab} pane 에 tab-pane 클래스가 없다(진입 애니 무효화 목록이 이 클래스를 본다)`)
        .toContain('tab-pane');
      expect(tag, `${tab} pane 이 display 토글이 아니다 — 숨길 때 언마운트되면 재방문이 재마운트가 된다`)
        .toContain(`activeTab !== '${tab}'`);
      expect(APP, `${tab} pane 의 렌더 조건에 visitedTabs 가 없다 — 떠나는 순간 사라진다`)
        .toMatch(new RegExp(`visitedTabs\\.has\\('${tab}'\\)`));
    });
  }

  it('🔴 관리자만 조건부 렌더로 되돌아가지 않았다', () => {
    // 되돌린 모양: `{activeTab === 'admin' && (` — 이 한 줄이 위 세 수치를 전부 되살린다.
    expect(APP, "관리자 pane 이 다시 `activeTab === 'admin' &&` 조건부 렌더가 됐다")
      .not.toMatch(/\{\s*activeTab === 'admin' && \(/);
  });

  it('🔴 관리자 pane 은 역할 게이트를 유지한다 — 권한이 빠지면 숨은 채로도 남지 않는다', () => {
    expect(APP).toMatch(/\{isAdmin && \(activeTab === 'admin' \|\| visitedTabs\.has\('admin'\)\)/);
  });

  it('🔴 숨은 pane 이 뒤로가기 겹을 들고 있지 않다 — tabActive 배선', () => {
    // keep-alive 의 대가: 숨은 pane 이 `useBackClose` 겹을 계속 들고 있으면 홈에서 누른 뒤로가기가
    // **보이지 않는 곳에서** 소비된다(실측 2026-09-15: 화면 변화 0, 숨은 관리자 섹션만 '포스터 승인'→'운영 분석').
    // 막는 방법은 pane 마다 `tabActive` 를 내려 자식이 스스로 겹을 접는 것 — 내 매장이 쓰던 그 규칙이다.
    for (const [comp, tab] of [['VenueManageTabM', 'my-store'], ['AdminTab', 'admin']] as const) {
      const m = new RegExp(`<${comp}[\\s\\S]{0,1200}?/>`).exec(APP);
      expect(m, `<${comp}> 렌더를 못 찾았다`).not.toBeNull();
      expect(m![0], `${tab} pane 이 tabActive 를 안 내린다 — 숨은 겹이 뒤로가기를 먹는다`)
        .toContain(`tabActive={activeTab === '${tab}'}`);
    }
  });
});
