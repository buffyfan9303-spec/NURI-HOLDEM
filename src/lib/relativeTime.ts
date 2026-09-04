// 상대 시간 한 벌 — 같은 함수가 7곳에 복붙돼 있었고, 넷이 서로 다르게 굴었다(2026-09-04 정리).
//
//  · '방금 전'(댓글·커뮤니티·알림) vs '방금'(장터·공지) — 같은 개념이 화면마다 다른 말이었다.
//  · 신고큐·회원관리는 60초 미만 분기가 아예 없어 **5초 전 항목이 '0분 전'** 으로 떴다.
//  · 공지만 7일이 지나면 'M.D' 날짜로 접었다 — 이건 목록이 길어지는 화면에서 실제로 쓸모가 있어
//    옵션으로 남긴다(다른 화면은 종전대로 '999일 전' 까지 간다).
//
// 카피는 다수(3파일)를 따라 '방금 전' 으로 통일했다 — '분 전'·'시간 전' 과 어미가 맞는 쪽이다.
export function relativeTime(iso: string, opts?: { dateAfterDays?: number }): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;

  const days = Math.floor(diff / 86400);
  const cut = opts?.dateAfterDays;
  if (cut !== undefined && days >= cut) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}.${d.getDate()}`;
  }
  return `${days}일 전`;
}
