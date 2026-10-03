// src/lib/voucherFeed.ts — 이용권 목록 → 장부 옆 레일에 흐르는 '사건' 목록.
//
// 컴포넌트에서 떼어낸 이유: 이건 업주가 손님과 다툴 때 근거로 보는 화면이다.
// "몇 시에 몇 장 줬냐" 를 여기가 틀리게 말하면 그 다툼에서 지는 쪽이 생긴다. 화면 없이 검증돼야 한다.
//
// 규칙 넷:
//  ① 한 장의 이용권이 **두 사건**을 만든다 — 발급(입, created_at)과 사용(출, used_at).
//  ② **회수·만료는 사건이 아니라 상태**다. 회수 시각 컬럼이 없어서 시각을 지어낼 수 없다.
//     지어내면 순서가 거짓말이 된다 — 그래서 발급 행에 배지로만 붙인다.
//  ③ 최신이 위. 운영 중 흘깃 보는 판이라 아래로 쌓으면 매번 스크롤을 따라가야 한다.
//  ④ **한 번에 보낸 것은 한 줄이다**(오너 2026-09-08). DB 는 1장당 한 행이라 20장을 보내면
//     레일에 20줄이 흘렀다 — 누가 몇 장 받았는지가 오히려 안 보였다. issue_voucher 는 N장을
//     한 번의 RPC 로 넣으므로 그 행들은 created_at 이 **같다**. 그 셋(받는 사람·제목·시각)이
//     같으면 한 번의 전송으로 보고 묶는다. DB 변경 없이 화면만 사실대로 말하게 하는 방법이다.
//     ⚠ '시각이 같으면 묶는다' 는 초 단위 반올림이 아니라 **문자열 동일**이다. 반올림하면
//       1초 안에 두 번 보낸 서로 다른 전송이 한 줄로 합쳐져 장부가 거짓말을 한다.
import { isHeldVoucher, type Voucher } from '../api/vouchers';

export type FeedKind = 'issued' | 'used';
export interface FeedRow {
  key: string;
  kind: FeedKind;
  at: string;
  name: string;
  title: string;
  /** 이 줄이 몇 장인가 — 한 번에 보낸 묶음의 크기(최소 1) */
  count: number;
  /** 묶음 중 회수된 장수(0 이면 없음). count 와 같으면 전량 회수다. */
  revokedCount: number;
  /** 묶음 중 만료된 장수(0 이면 없음) */
  expiredCount: number;
  /** 전량 회수 — 기존 배지 표시의 단일 정본 */
  revoked: boolean;
  /** 전량 만료 */
  expired: boolean;
  /** #8 — 사용 줄의 용도(접수대 승인 때 고른 것). 'addon' 이면 레일이 '애드온' 을 붙인다. 발급 줄·승인 전은 null. */
  usedFor: 'buyin' | 'addon' | null;
}

/** 묶음 키 — 받는 사람이 같고, 제목이 같고, 시각이 **완전히 같은** 것만 한 전송으로 본다. */
function batchKey(kind: FeedKind, holder: string, title: string, at: string): string {
  // ⚠ 구분자를 소스에 날 NUL 바이트로 넣으면 git 이 이 파일을 바이너리로 보아 diff·리뷰가 통째로 죽는다
  //   (2026-09-11 실측: 이 파일이 그 상태로 커밋돼 있었다). 값은 같고 소스만 ASCII 이스케이프로 쓴다.
  return `${kind}\u0000${holder}\u0000${title}\u0000${at}`;
}

export function toFeedRows(vs: Voucher[], now = Date.now()): FeedRow[] {
  // 받는 사람은 userId 가 있으면 그것으로 묶는다 — 동명이인이 한 줄로 합쳐지지 않게.
  const groups = new Map<string, FeedRow>();
  const add = (kind: FeedKind, at: string, v: Voucher, name: string, flags: { revoked: boolean; expired: boolean }) => {
    const holder = v.holderUserId ?? `name:${name}`;
    const usedFor = kind === 'used' ? (v.usedFor ?? null) : null;
    // 용도가 다르면 같은 순간이어도 다른 줄이다 — 애드온 사용이 바인 사용 묶음에 섞여 사라지면 안 된다.
    const k = batchKey(kind, holder, v.title, at) + (usedFor ? `\u0000${usedFor}` : '');
    const g = groups.get(k);
    if (g) {
      g.count += 1;
      if (flags.revoked) g.revokedCount += 1;
      if (flags.expired) g.expiredCount += 1;
      return;
    }
    groups.set(k, {
      // key 는 묶음 정체성이어야 한다 — 첫 장의 id 를 쓰면 그 장만 회수돼도 key 가 살아남아
      // 리액트가 다른 묶음으로 오해할 수 있다.
      key: `${kind}:${k}`,
      kind, at, name, title: v.title,
      count: 1,
      revokedCount: flags.revoked ? 1 : 0,
      expiredCount: flags.expired ? 1 : 0,
      revoked: false, expired: false,
      usedFor,
    });
  };

  for (const v of vs) {
    const name = v.holderName?.trim() || '이름 없음';
    // 만료 = 아직 안 썼고, 회수도 안 됐는데, 기한만 지난 것. 쓴 것에 '만료' 를 붙이면 거짓이다.
    const expired = !!v.expiresAt && new Date(v.expiresAt).getTime() <= now
      && v.status === 'active' && !v.usedAt;
    add('issued', v.createdAt, v, name, { revoked: v.status === 'revoked', expired });
    if (v.usedAt) add('used', v.usedAt, v, name, { revoked: false, expired: false });
  }

  const out = [...groups.values()];
  for (const r of out) {
    // '전량' 일 때만 예전처럼 배지를 단다. 일부만 회수된 묶음은 숫자로 말한다(아래 revokedCount).
    r.revoked = r.revokedCount > 0 && r.revokedCount === r.count;
    r.expired = r.expiredCount > 0 && r.expiredCount === r.count;
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

/** 이용권 관리 창의 '이용 내역' 줄 — 전송(created_at)·사용(used_at)을 최신순으로, 같은 분·종류·대상·제목·용도는 한 줄 ×N.
 *  전송 취소(revoked)는 위 규칙 ②와 같다 — 시각 컬럼이 없어 따로 줄을 만들지 않고 **그 전송 줄에 장수(revoked)** 로 붙인다.
 *  종전엔 이 장수를 버려 유형별 표('전송 취소 1')와 내역이 맞지 않았다(dummy-1003 D2).
 *  항등: Σ전송 줄 n = 전송 장수(취소 포함) · Σ revoked = 전송 취소 장수 · Σ사용 줄 n = 사용 장수. */
export interface ManageFeedRow { t: 'issued' | 'used'; at: string; title: string; who: string; addon?: boolean; n: number; revoked: number }
export function manageFeedRows(list: readonly Voucher[], whoOf: (v: Voucher) => string): ManageFeedRow[] {
  const ev: Omit<ManageFeedRow, 'n'>[] = [];
  for (const v of list) {
    if (v.createdAt) ev.push({ t: 'issued', at: v.createdAt, title: v.title, who: whoOf(v) || '매장 보관', revoked: v.status === 'revoked' ? 1 : 0 });
    if (v.usedAt) ev.push({ t: 'used', at: v.usedAt, title: v.title, who: whoOf(v), addon: v.usedFor === 'addon', revoked: 0 });
  }
  ev.sort((a, b) => b.at.localeCompare(a.at));
  const out: ManageFeedRow[] = [];
  for (const e of ev) {
    const last = out[out.length - 1];
    if (last && last.t === e.t && last.title === e.title && last.who === e.who && !!last.addon === !!e.addon && last.at.slice(0, 16) === e.at.slice(0, 16)) {
      last.n += 1; last.revoked += e.revoked;
    } else out.push({ ...e, n: 1 });
  }
  return out;
}
