// F16 — 스팟 공유는 **확인 시트를 거쳐야** 올라간다.
//
// 왜 소스 계약인가: vitest 환경이 `node` 라 SpotReport 를 렌더할 수 없다(auth·toast·모달까지 붙는다).
//   본문 짓기는 spotShareBody.test.ts 가 순수 함수로 잠갔고, **그 판정이 실제로 배선돼 있는지**
//   — 공유 버튼이 네트워크를 부르지 않고, 게시가 확인 시트 안에서만 일어나고, 취소 경로에
//   호출이 하나도 없는지 — 를 여기서 본다(nuriSpotWiring.contract.test.ts 와 같은 결).
//   도달성까지는 e2e/nuri-spot-board.spec.ts 의 '확인 시트를 거친다' 두 건이 본다.
// 실행: npx vitest run src/components/features/gto/spotShareConfirm.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'SpotReport.tsx'), 'utf-8');
// 주석에도 shareSpotPost 가 나온다(왜 옮겼는지 적어 두었다) — 코드만 본다.
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+\/\/.*$/gm, '');

const fn = (name: string, head: string) => {
  const re = new RegExp(`const ${name} = ${head} \\{[\\s\\S]*?\\n  \\};`);
  const m = code.match(re);
  expect(m, `${name} 핸들러를 찾지 못했다`).not.toBeNull();
  expect(code.match(new RegExp(`const ${name} = `, 'g')), `${name} 앵커가 1회가 아니다`).toHaveLength(1);
  return m![0];
};

describe('공유 버튼은 아무것도 올리지 않는다', () => {
  it('게시 RPC 호출은 파일 전체에 딱 한 곳이다', () => {
    expect(code.match(/shareSpotPost\(/g), '공유 호출이 여러 곳이면 확인 시트를 우회하는 길이 생긴다').toHaveLength(1);
  });

  it('onShare 는 확인 시트를 열 뿐이다 — 네트워크가 없다', () => {
    const body = fn('onShare', '\\(\\) =>');
    expect(body).toContain('setConfirming(true)');
    expect(body, '공유 버튼이 곧장 게시한다(F16 회귀)').not.toContain('shareSpotPost');
    expect(body, '확인 전에 await 가 있으면 무엇인가 이미 나갔다는 뜻이다').not.toContain('await');
    // 시트에 채울 메모는 원본에서 복사한다 — 원본 spot 은 건드리지 않는다.
    expect(body).toContain('setDraftNote(');
  });

  it('취소 경로에는 호출이 하나도 없다 — 취소하면 공개 글 0', () => {
    const body = fn('onCancelShare', '\\(\\) =>');
    expect(body).toContain('setConfirming(false)');
    expect(body).not.toContain('shareSpotPost');
    expect(body).not.toContain('await');
  });

  it('게시는 확인 뒤 한 번, RPC 한 번 — 쪼개지 않는다(부분 성공 방지)', () => {
    const body = fn('onConfirmShare', 'async \\(\\) =>');
    expect(body).toContain('shareSpotPost(spotWithNote(spot, draftNote), evaluation)');
    expect(body.match(/await /g), '저장 요청이 두 번 이상이면 share_spot_post 의 원자성이 깨진다').toHaveLength(1);
    expect(body).toContain('gotoBoardPost(postId)');
  });
});

describe('확인 시트가 실제로 화면에 배선돼 있다', () => {
  it('리포트가 시트를 1회 렌더하고 세 경로가 모두 연결돼 있다', () => {
    const m = code.match(/<ShareConfirmSheet[\s\S]*?\/>/);
    expect(m, '시트가 렌더에 없다').not.toBeNull();
    expect(code.match(/<ShareConfirmSheet/g)).toHaveLength(1);
    expect(m![0]).toContain('open={confirming}');
    expect(m![0]).toContain('onCancel={onCancelShare}');
    expect(m![0]).toContain('onConfirm={onConfirmShare}');
    expect(m![0]).toContain('onNote={setDraftNote}');
  });

  it('미리보기가 실제 본문 빌더를 쓴다 — 화면이 따로 문자열을 짓지 않는다', () => {
    expect(code).toContain("from './spotShareBody'");
    expect(code.match(/buildShareBody\(/g)).toHaveLength(1);
    expect(code).toMatch(/const body = buildShareBody\(spot, note\);/);
    expect(code.match(/data-share-preview/g), '미리보기 영역이 1곳이 아니다').toHaveLength(1);
  });

  it('메모가 공개된다는 고지가 시트 안에 있다', () => {
    const sheet = code.slice(code.indexOf('function ShareConfirmSheet'));
    expect(sheet.length, 'ShareConfirmSheet 정의를 찾지 못했다').toBeGreaterThan(0);
    expect(sheet, '메모 공개 고지가 없다').toContain('적어 둔 메모도 함께 공개됩니다');
    // 고지는 미리보기보다 **위**에 있어야 먼저 읽힌다.
    expect(sheet.indexOf('적어 둔 메모도 함께 공개됩니다')).toBeLessThan(sheet.indexOf('data-share-preview'));
    // 그 자리에서 고치고 지울 수 있다.
    expect(sheet).toContain('<textarea');
    expect(sheet).toContain("onClick={() => onNote('')}");
  });

  it('접근성·관행 — 공용 Modal 을 쓰고 배경 클릭으로 닫히지 않으며 버튼은 44px', () => {
    const sheet = code.slice(code.indexOf('function ShareConfirmSheet'));
    // Escape·포커스 복귀·스크롤 잠금은 공용 Modal 의 계약이다(새 UI 라이브러리를 들이지 않는다).
    expect(code).toContain("import Modal from '../../atoms/Modal'");
    expect(sheet).toContain('<Modal open={open}');
    expect(sheet).toContain('dismissOnBackdrop={false}');
    expect((sheet.match(/min-h-\[44px\]/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
