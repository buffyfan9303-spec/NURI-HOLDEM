// 손님 바인(참가) 요청을 '어느 게임 명단에 넣을지' 정하는 순수 규칙.
//
// 왜 화면 밖으로 뺐나: 카드에 '원함: 메인'까지 띄워 놓고 실제로는 현재 보고 있는 게임에
// 전원을 몰아넣던 사고가 있었다. 잘못 들어간 인원은 한 명씩 지워야 하고 바인까지 찍혔으면
// 취소 비밀번호가 필요해서, 승인 1탭 대비 원복 비용이 비대칭이다.
// 명단·정산·순위가 걸린 규칙이라 렌더와 분리해 테스트로 못 박는다.

export interface BuyinApprovalTarget {
  id: string;
  requestedGameSeq: number | null;
}

export interface BuyinApprovalPlan<T> {
  /** 실제로 승인할 묶음 — 게임 번호 오름차순 */
  groups: { gameSeq: number; items: T[] }[];
  /** 요청한 게임이 아직 열리지 않아 대기로 남기는 건 */
  skipped: T[];
  /** 대상 게임이 2개 이상 — 이때만 운영자에게 확인한다(접수대 마찰 최소화) */
  mixed: boolean;
}

/**
 * 요청 게임 우선, 미지정(null)만 현재 보고 있는 게임.
 *
 * openGameSeqs = 그날 실제로 열려 있는 장부(게임) 목록. 요청 게임이 현재 게임도 아니고
 * 아직 열리지도 않았으면 승인하지 않고 skipped 로 남긴다 — 조용히 현재 게임에 넣으면
 * '손님이 고른 게임을 버린다'는 같은 결함이 이름만 바꿔 반복되기 때문.
 *
 * 지금 보고 있는 게임은 세션 행이 아직 없어도 허용한다 —
 * '장부 열기 전 선접수'는 실제 운영 동선이라 여기서 막으면 접수대가 멈춘다.
 * (최종 판정은 서버가 한다 — 프런트는 '보내도 되는지'만 정하고 거절은 서버 메시지로 드러난다)
 */
export function planBuyinApprovals<T extends BuyinApprovalTarget>(
  reqs: readonly T[],
  currentGameSeq: number,
  openGameSeqs: readonly number[],
): BuyinApprovalPlan<T> {
  const groups: { gameSeq: number; items: T[] }[] = [];
  const skipped: T[] = [];
  for (const r of reqs) {
    const want = r.requestedGameSeq ?? currentGameSeq;
    if (want !== currentGameSeq && !openGameSeqs.includes(want)) { skipped.push(r); continue; }
    const g = groups.find((x) => x.gameSeq === want);
    if (g) g.items.push(r); else groups.push({ gameSeq: want, items: [r] });
  }
  groups.sort((a, b) => a.gameSeq - b.gameSeq);
  return { groups, skipped, mixed: groups.length > 1 };
}

/**
 * S-15(2026-10-01) — 이용권 승인 뒤 **같은 손님·같은 날**에 남은 이용권 요청 수.
 *
 * 서버(approve_buyin_request)는 한 번 승인에 필요한 장수(min(N, 참가비÷1만))만 묶는다. 참가비 5만·N=10 처럼
 * 손님이 포스터 안내대로 10장을 요청하면 5장만 쓰이고 5장이 대기로 남는데, 다음 승인 때 그 5장이
 * 같은 사람·같은 날 묶음으로 **의도하지 않은 두 번째 바인**이 된다. 남은 장수를 업주에게 알려 거절할 수 있게 한다.
 * (규칙 자체 — 포스터 저장 때 막을지 — 는 오너 결정 ① 재결정 대상이라 여기서 바꾸지 않는다.)
 */
export function voucherLeftover(
  approved: { id: string; userId: string | null; voucherId: string | null; sessionDate: string },
  pendingAfter: readonly { id: string; userId: string | null; voucherId: string | null; sessionDate: string; status?: string }[],
): number {
  if (!approved.voucherId || !approved.userId) return 0;
  return pendingAfter.filter((r) => r.id !== approved.id && r.voucherId != null && r.userId === approved.userId
    && r.sessionDate === approved.sessionDate && (r.status ?? 'pending') === 'pending').length;
}

export function voucherLeftoverText(playerName: string, n: number): string {
  return `${playerName} 님의 이용권 요청 ${n}장이 아직 대기 중입니다 — 다음 승인 때 바인 1회로 묶입니다. 의도하지 않았다면 거절하세요.`;
}
