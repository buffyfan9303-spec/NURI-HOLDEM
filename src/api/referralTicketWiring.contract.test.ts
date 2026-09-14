// 오너 #9 (2026-09-15) — 친구 초대 보상: 활동점수 → 이벤트 참여권(뽑기권)
//   오너 결정 (A) 추천인·가입자 둘 다 1장 · (B) 진행 중인 이벤트가 없으면 다음 이벤트에 지급(보류)
//
// ── 이 계약이 막는 사고 ─────────────────────────────────────────────────────
//   (B) 때문에 "확정" 과 "전달" 이 분리됐다. 전달은 **크론이 아니라 당사자가 들어올 때** 일어난다
//   (마이그레이션 20260915a §5 `claim_my_pending_referral_tickets`).
//   ⇒ **화면이 그 RPC 를 안 부르면 대기가 영원히 안 풀린다.** 서버만 적용하고 끝내는 사고를
//     이 저장소는 이미 겪었다(nuri-lead 지적 2026-09-15). 그래서 호출부의 **존재**를 계약으로 잠근다.
//   ⇒ 그리고 대기가 **화면에서 조용히 사라지지 않아야** 한다(오너 조건). 안내 문구도 함께 잠근다.
//
// 왜 소스 계약인가: vitest 환경이 node 라 컴포넌트 렌더 테스트가 없다.
//   동작(PGRST202 → null)은 아래 단위 테스트가 보고, 여기서는 **배선되어 있는가**만 본다.
//
// 음성 대조 (해당 줄만 손으로 되돌렸다가 즉시 복원 — `git stash`·`checkout` 금지). 2026-09-15 실측:
//   · CustomerDashboardPage 의 `claimPendingReferralTickets()` 줄을 지우면 '호출부' 가 실패한다
//   · 대기 안내 블록(`tickets.pending > 0`)을 지우면 '조용히 사라지지 않는다' 가 실패한다
//   · referrals.ts 의 `PGRST202` 분기를 `return { granted: 0, pending: 0 }` 로 되돌리면 '0 으로 위장하지 않는다' 가 실패한다
//
// 실행: npx vitest run src/api/referralTicketWiring.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BOM = String.fromCharCode(0xFEFF);
const read = (p: string) => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const s = readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
  return s.startsWith(BOM) ? s.slice(1) : s;
};
/** 주석은 뺀다 — "예전엔 …" 설명이 계약을 대신 만족시키면 안 된다. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(^|[^:'"`])\/\/(?![^'"`\n]*['"`]).*$/gm, '$1');

const REF = read('./referrals.ts');
const REFC = stripComments(REF);
const DASH = read('../components/features/CustomerDashboardPage.tsx');
const DASHC = stripComments(DASH);

describe('오너 #9 ① 밀린 참여권을 당겨 가는 통로가 실재한다', () => {
  it('🔴 claimPendingReferralTickets 가 서버 RPC 를 부른다', () => {
    expect(REFC).toMatch(/export async function claimPendingReferralTickets\(\)/);
    expect(REFC).toContain("supabase.rpc('claim_my_pending_referral_tickets')");
    // 지급과 대기 수를 **한 RPC** 로 받는다 — 둘로 나누면 화면 숫자와 실제 지급이 갈린다.
    expect(REFC).toMatch(/granted:[\s\S]{0,80}pending:/);
  });

  it('🔴 RPC 가 아직 없을 때(PGRST202) 0 으로 위장하지 않는다 — 0 장은 사실 주장이다', () => {
    expect(REFC).toContain("error.code === 'PGRST202'");
    // 미적용 창에서 { granted: 0, pending: 0 } 을 돌려주면 화면이 '대기 없음'을 단언하게 된다.
    expect(REFC).not.toMatch(/PGRST202'\s*\)\s*\{[^}]*granted:\s*0/);
    expect(REFC).toMatch(/Promise<ReferralTicketClaim \| null>/);
  });
});

describe('오너 #9 ② 화면이 그 통로를 실제로 부른다 — 안 부르면 대기가 영원히 안 풀린다', () => {
  it('🔴 내 정보 화면이 진입할 때 claimPendingReferralTickets 를 부른다', () => {
    expect(DASH).toContain('claimPendingReferralTickets');
    expect(DASHC, '조회 묶음 안에서 불러야 계정 전환·재조회와 같은 생명주기를 탄다')
      .toMatch(/claimPendingReferralTickets\(\)/);
    // 결과가 상태로 들어가야 화면이 쓸 수 있다(부르기만 하고 버리면 안내가 영영 안 뜬다).
    expect(DASHC).toMatch(/setRefTickets\(/);
  });

  it('🔴 받은 결과를 InviteSection 까지 내려보낸다', () => {
    expect(DASHC).toMatch(/<InviteSection[^>]*tickets=\{refTickets\}/);
    expect(DASHC).toMatch(/tickets: ReferralTicketClaim \| null/);
  });
});

describe('오너 #9 ③ 대기가 조용히 사라지지 않는다', () => {
  it('🔴 대기 장수와 "다음 이벤트에 지급" 안내가 화면에 있다', () => {
    expect(DASHC).toMatch(/tickets && tickets\.pending > 0/);
    expect(DASH).toContain('다음 이벤트가 열리면 지급');
    expect(DASH).toMatch(/이벤트 참여권 \{tickets\.pending\}장/);
  });

  it('🔴 모르는 상태(null)를 "대기 0장"으로 그리지 않는다', () => {
    // `tickets &&` 가드가 빠지면 null 에서 터지거나 0 장을 단언하게 된다.
    const i = DASHC.indexOf('tickets.pending > 0');
    expect(i, '대기 안내 블록을 찾지 못했다').toBeGreaterThan(-1);
    expect(DASHC.slice(Math.max(0, i - 40), i)).toContain('tickets &&');
  });
});

describe('오너 #9 ④ 보상 문구가 서버와 같은 말을 한다', () => {
  it('🔴 초대 보상을 아직 활동점수라고 말하는 곳이 없다', () => {
    // 서버가 참여권을 주는데 화면이 +500/+300 이라고 적으면 그게 거짓말이다.
    const invite = DASHC.slice(DASHC.indexOf('function InviteSection'));
    expect(invite).not.toMatch(/활동점수/);
    expect(invite).not.toMatch(/\+500|\+300/);
    expect(DASH).toContain('이벤트 참여권 1장');
  });

  it('🔴 "점수 올리는 법" 목록에 친구 초대가 남아 있지 않다', () => {
    const i = DASHC.indexOf('점수 올리는 법');
    expect(i, '점수 안내 블록을 찾지 못했다').toBeGreaterThan(-1);
    const block = DASHC.slice(i, i + 400);
    expect(block, '점수가 오를 것처럼 읽힌다').not.toMatch(/친구 초대\(본인인증\) \+/);
  });
});
