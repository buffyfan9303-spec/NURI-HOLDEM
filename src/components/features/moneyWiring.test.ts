// 돈 계산기의 **배선** 계약 — 함수가 존재하는 것과 화면이 그 함수를 부르는 것은 다르다.
//
// 2026-09-11 연동 감사에서 나온 네 건은 전부 같은 부류였다:
//   · splitMismatch  — 정의·문서·단위테스트까지 있는데 **프로덕션 호출부가 0곳**이었다.
//     그래서 10만 게임에 현금 4만 + 카드 4만을 넣어도 저장됐고, buyinFinance 가 그 8만을
//     value 로 받아 엔트리 0.8 로 셌다. 미수 칸은 0이라 사라진 2만은 어디에도 흔적이 없다.
//   · 인건비 조회 실패 — catch(() => {}) 라 시급이 빈 채로 남아 **'총 인건비 0원'이
//     정상 숫자처럼** 떴다. 돈 화면에서 '못 불러옴'과 '정말 0원'이 같아 보이면 안 된다.
//   · 딜러 급여   — dealer_shifts 는 행마다 시급이 붙은 **두 번째 급여 시스템**인데
//     '총 인건비' 합계에 전혀 반영되지 않았다.
//
// 단위테스트는 이 부류를 못 잡는다. splitMismatch 의 산술은 ledger.money / ledgerAgg /
// ledgerGolden 세 곳에서 이미 통과하고 있었다 — 틀린 것은 식이 아니라 **아무도 안 불렀다는 것**이다.
// 그래서 이 파일은 값이 아니라 '호출부가 살아 있는가'를 소스에서 확인한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FEAT = join(__dirname);
const read = (f: string) => readFileSync(join(FEAT, f), 'utf8');

/** 주석·문서를 빼고 **실행되는 코드**만 남긴다 — 주석에 이름이 적혀 있다고 배선된 게 아니다. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // 블록 주석
    .replace(/^\s*\/\/.*$/gm, ' ')       // 줄 주석
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' '); // JSX 주석
}

describe('분납 저장 게이트 — splitMismatch 가 실제로 걸려 있는가', () => {
  const src = code(read('NuriPosLedger.tsx'));

  it('splitMismatch 를 호출한다', () => {
    expect(src, 'splitMismatch 호출부가 사라졌습니다 — 분납 합계 검증이 다시 죽습니다')
      .toMatch(/splitMismatch\s*\(/);
  });

  it('저장 가능 판정에 그 결과가 들어간다', () => {
    // canSaveSplit 이 mismatch 를 보지 않으면, 경고만 뜨고 저장은 되는 '보여주기 검증'이 된다.
    const m = /const\s+canSaveSplit\s*=([^;]+);/.exec(src);
    expect(m, 'canSaveSplit 정의를 찾지 못했습니다').not.toBeNull();
    expect(m![1], 'canSaveSplit 이 mismatch 를 보지 않습니다 — 경고만 뜨고 저장은 됩니다')
      .toMatch(/mismatch/);
  });
});

describe('인건비 — 조회 실패를 0원으로 위장하지 않는다', () => {
  for (const f of ['StaffPayroll.tsx', 'StoreDashboard.tsx']) {
    it(`${f}: 시급 조회 실패를 삼키지 않는다`, () => {
      const src = code(read(f));
      // getStaffWages(...) 의 catch 가 빈 블록이면 실패가 '시급 0원'으로 둔갑한다.
      const swallowed = /getStaffWages\([^)]*\)[\s\S]{0,200}?\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.exec(src);
      expect(swallowed?.[0], '시급 조회 실패를 빈 catch 로 삼키고 있습니다 — 총 인건비가 0원으로 보입니다')
        .toBeUndefined();
    });
  }
});

describe('인건비 — 급여 시스템 두 벌을 모두 센다', () => {
  for (const f of ['StaffPayroll.tsx', 'StoreDashboard.tsx']) {
    it(`${f}: 딜러 로테이션(dealer_shifts) 급여가 합계에 들어간다`, () => {
      const src = code(read(f));
      expect(src, '딜러 시프트를 조회하지 않습니다 — 딜러 급여가 총 인건비에서 통째로 빠집니다')
        .toMatch(/getDealerShifts\s*\(/);
      expect(src, '딜러 근무시간을 계산하지 않습니다 — 조회만 하고 합산하지 않는 상태입니다')
        .toMatch(/shiftHours\s*\(/);
    });
  }
});

// ── 2026-09-13 연동 감사 F13·F15 — 같은 부류(배선이 없어 화면이 거짓말한다) ─────────────
//
// F13: PostModeration 에는 postsErr 분기(LoadErrorCard)가 처음부터 있었는데, AdminTab →
//      UserManagementTab → PostModeration 로 내려오는 prop 이 없어 **영원히 도달 불가**였다.
//      그래서 조회가 실패한 세션에서 이 서브탭만 '관리할 게시글이 없습니다' 라고 단정했고,
//      같은 실패를 노출관리>게시물(PostsAdminPanel)과 커뮤니티 피드는 오류 카드로 보여줬다.
// F15: 삭제 성공 토스트를 onDelete 직후 같은 동기 블록에서 띄워, 성공 시 같은 문구가 두 번,
//      실패 시 '삭제되었습니다' → 2.4초 뒤 '실패했습니다' 순으로 떴다.
//
// ⚠ 이 부류는 '그 문장이 소스에 있는가' 로는 못 잡는다 — 있었는데 **도달을 못 했다**.
//    그래서 아래는 개수와 위치(앞뒤 순서)까지 못박는다.
const ROOT2 = join(__dirname, '..', '..');
const readSrc = (rel: string) => readFileSync(join(ROOT2, rel), 'utf8');

/** 이름 있는 최상위 함수 본문을 통째로 떼어 온다 — '파일 어딘가에 있다' 가 아니라 '이 함수 안에 있다'. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `${name} 함수를 찾지 못했습니다 — 이름이 바뀌었으면 이 계약도 같이 고치세요`).toBeGreaterThanOrEqual(0);
  // 끝은 **0열의 닫는 중괄호 한 줄**이다. `src.indexOf('\n}')` 로는 구조분해 인자의
  // `}: { posts: ModPost[] … }` 줄에 먼저 걸려 본문을 통째로 놓친다(2026-09-13 실측).
  const rest = src.slice(start);
  const m = /\n\}\s*(\n|$)/.exec(rest);
  expect(m, `${name} 함수의 끝을 찾지 못했습니다`).not.toBeNull();
  return rest.slice(0, m!.index);
}

describe('F13 — 게시글 조회 실패가 관리자 화면에서 "없음" 으로 위장되지 않는다', () => {
  const admin  = code(read('AdminTab.tsx'));
  const usrMgt = code(read('UserManagementTab.tsx'));

  it('AdminTab 이 UserManagementTab 에 postsErr·onRetryPosts 를 내린다', () => {
    const m = /<UserManagementTab\b[\s\S]*?\/>/.exec(admin);
    expect(m, '<UserManagementTab .../> 호출부를 찾지 못했습니다').not.toBeNull();
    expect(m![0], 'postsErr 를 내리지 않습니다 — 조회 실패가 "관리할 게시글이 없습니다" 로 위장됩니다')
      .toMatch(/postsErr=\{postsErr\}/);
    expect(m![0], 'onRetryPosts 를 내리지 않습니다 — 빠져나갈 수단 없는 막다른 오류 카드가 됩니다')
      .toMatch(/onRetryPosts=\{onRetryPosts\}/);
  });

  it('UserManagementTab 이 그 둘을 PostModeration 까지 전달한다', () => {
    expect(usrMgt, 'UserManagementTabProps 에 postsErr 가 없습니다').toMatch(/postsErr\?:\s*unknown/);
    const m = /<PostModeration\b[^>]*\/>/.exec(usrMgt);
    expect(m, '<PostModeration .../> 호출부를 찾지 못했습니다').not.toBeNull();
    expect(m![0], 'PostModeration 에 postsErr 가 안 내려갑니다 — 분기가 다시 도달 불가가 됩니다')
      .toMatch(/postsErr=\{postsErr\}/);
    expect(m![0], 'PostModeration 에 onRetryPosts 가 안 내려갑니다')
      .toMatch(/onRetryPosts=\{onRetryPosts\}/);
  });

  it('PostModeration 안에서 실패 분기가 빈 상태 문구보다 **먼저** 온다(도달성)', () => {
    const body = fnBody(usrMgt, 'PostModeration');
    const errAt   = body.search(/<LoadErrorCard\b/);
    const emptyAt = body.indexOf('관리할 게시글이 없습니다');
    expect(errAt, 'PostModeration 에 LoadErrorCard 가 없습니다').toBeGreaterThanOrEqual(0);
    expect(emptyAt, '빈 상태 문구를 찾지 못했습니다 — 문구를 바꿨으면 이 계약도 같이 고치세요').toBeGreaterThanOrEqual(0);
    expect(errAt, '실패 분기가 빈 상태보다 뒤에 있습니다 — 실패해도 "없음" 이 먼저 그려집니다')
      .toBeLessThan(emptyAt);
    // 오류 카드에 재시도가 붙어 있는가 — 없으면 막다른 화면이다.
    expect(/<LoadErrorCard[\s\S]*?\/>/.exec(body)![0], '오류 카드에 onRetry 가 없습니다')
      .toMatch(/onRetry=\{onRetryPosts\}/);
  });

  it('서브탭 라벨의 개수도 실패 시 0 이라고 단정하지 않는다', () => {
    const m = /label="게시글 관리"\s+count=\{([^}]+)\}/.exec(usrMgt);
    expect(m, '게시글 관리 SectionPill 을 찾지 못했습니다').not.toBeNull();
    expect(m![1], '실패해도 posts.length(=0) 를 그대로 씁니다 — 라벨이 "(0)" 으로 거짓말합니다')
      .toMatch(/postsErr/);
  });
});

describe('F15 — 삭제 성공 토스트는 서버 응답 뒤 한 번만', () => {
  const SUCCESS = '게시글이 삭제되었습니다';

  it('성공 문구를 내는 곳은 앱 전체에서 한 곳뿐이다', () => {
    const files = ['App.tsx', 'components/features/UserManagementTab.tsx', 'components/features/PostDetailModal.tsx',
                   'components/features/CommunityTab.tsx', 'components/features/AdminTab.tsx'];
    const owners = files.filter((f) => code(readSrc(f)).includes(SUCCESS));
    expect(owners, `'${SUCCESS}' 토스트가 ${owners.length}곳입니다 — 성공 시 같은 문구가 여러 번 뜹니다`)
      .toEqual(['App.tsx']);
  });

  it('UserManagementTab 의 삭제는 토스트를 띄우지 않고, 확인창은 남긴다', () => {
    const body = fnBody(code(read('UserManagementTab.tsx')), 'PostModeration');
    expect(body, '삭제 확인창이 사라졌습니다 — 파괴적 동작의 안전 확인은 보존합니다')
      .toMatch(/confirm\(\s*'이 게시글을 삭제하시겠습니까\?'\s*\)/);
    expect(body, 'onDelete 직후 토스트를 띄웁니다 — 서버 응답 전에 "삭제되었습니다" 가 뜹니다')
      .not.toMatch(/toast\.show/);
  });

  it('App 의 단일 토스트는 deletePost 의 then 안에서만 뜬다', () => {
    const app = code(readSrc('App.tsx'));
    const m = /deletePost\(id\)[\s\S]{0,600}?\.catch\([^\n]*\)/.exec(app);
    expect(m, 'handleDeletePost 의 deletePost(id) 체인을 찾지 못했습니다').not.toBeNull();
    const chain = m![0];
    const thenAt = chain.indexOf('.then(');
    const okAt   = chain.indexOf(SUCCESS);
    const catchAt = chain.indexOf('.catch(');
    expect(thenAt, '성공 토스트가 then 체인 밖에 있습니다 — 응답 전에 뜹니다').toBeGreaterThanOrEqual(0);
    expect(okAt, '성공 토스트가 체인 안에 없습니다').toBeGreaterThan(thenAt);
    expect(okAt, '성공 토스트가 catch 뒤에 있습니다').toBeLessThan(catchAt);
    expect(chain.slice(catchAt), '실패 토스트가 없습니다 — 실패가 조용히 지나갑니다')
      .toMatch(/삭제에 실패했습니다/);
  });
});
