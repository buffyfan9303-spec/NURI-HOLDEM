// src/lib/voucherFeed.ts — 이용권 목록 → 장부 옆 레일에 흐르는 '사건' 목록.
//
// 컴포넌트에서 떼어낸 이유: 이건 업주가 손님과 다툴 때 근거로 보는 화면이다.
// "몇 시에 줬냐" 를 여기가 틀리게 말하면 그 다툼에서 지는 쪽이 생긴다. 화면 없이 검증돼야 한다.
//
// 규칙 셋:
//  ① 한 장의 이용권이 **두 사건**을 만든다 — 발급(입, created_at)과 사용(출, used_at).
//  ② **회수·만료는 사건이 아니라 상태**다. 회수 시각 컬럼이 없어서 시각을 지어낼 수 없다.
//     지어내면 순서가 거짓말이 된다 — 그래서 발급 행에 배지로만 붙인다.
//  ③ 최신이 위. 운영 중 흘깃 보는 판이라 아래로 쌓으면 매번 스크롤을 따라가야 한다.
import { isHeldVoucher, type Voucher } from '../api/vouchers';

export type FeedKind = 'issued' | 'used';
export interface FeedRow {
  key: string;
  kind: FeedKind;
  at: string;
  name: string;
  title: string;
  revoked: boolean;
  expired: boolean;
}

export function toFeedRows(vs: Voucher[], now = Date.now()): FeedRow[] {
  const out: FeedRow[] = [];
  for (const v of vs) {
    const name = v.holderName?.trim() || '이름 없음';
    // 만료 = 아직 안 썼고, 회수도 안 됐는데, 기한만 지난 것. 쓴 것에 '만료' 를 붙이면 거짓이다.
    const expired = !!v.expiresAt && new Date(v.expiresAt).getTime() <= now
      && v.status === 'active' && !v.usedAt;
    out.push({ key: `${v.id}:i`, kind: 'issued', at: v.createdAt, name, title: v.title, revoked: v.status === 'revoked', expired });
    if (v.usedAt) out.push({ key: `${v.id}:u`, kind: 'used', at: v.usedAt, name, title: v.title, revoked: false, expired: false });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** 이름·아이디로 '보냈는지' 한 줄 답 — 발급/사용/보유. 보유 판정은 지갑과 같은 술어를 쓴다. */
export function summarizeFor(vs: Voucher[], query: string, now = Date.now()) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const mine = vs.filter((v) => (v.holderName ?? '').toLowerCase().includes(q));
  return {
    issued: mine.length,
    used: mine.filter((v) => !!v.usedAt).length,
    held: mine.filter((v) => isHeldVoucher(v, now) && !v.usedAt).length,
  };
}
