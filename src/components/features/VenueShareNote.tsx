// src/components/features/VenueShareNote.tsx — 매장 제공 한 줄 고지(처리방침 제9조②: "그 기능을 이용하는 화면에서 알리고").
// 2026-10-06 pr188-193-review P2-3(리드 선택: 화면 고지 추가 · 체크박스 없음). 예약 화면은 ScheduleDetailModal 의 긴 고지 상자가 이미 한다.
// 문구는 실제 서버 동작에서 왔다: 출석(checkins)은 _venue_customer_ids 에 들어가 손님 명단이 되고, 출석 요청(checkin_requests)은
// 업주 승인 때 출석이 된다. 참가(바인) 신청(ledger_buyin_requests)은 신청자 표시와 시각이 매장에 간다. 이용권은 보낸 매장의 명단에 남는다.
const TEXT = {
  checkin: '출석하면 이 매장에 닉네임과 출석 시각이 전달되고 매장 손님 명단에 들어갑니다. 원하지 않으면 출석하지 않고 매장에 직접 확인을 요청하셔도 됩니다',
  qr: 'QR로 출석·바인 요청을 하면 그 매장에 닉네임과 시각이 전달되고, 출석은 매장 손님 명단에 들어갑니다. 원하지 않으면 매장에 직접 확인을 요청하셔도 됩니다',
  request: '출석 요청을 보내면 이 매장에 닉네임과 요청 시각이 전달되고, 승인되면 매장 손님 명단에 들어갑니다. 원하지 않으면 보내지 않으셔도 됩니다',
  buyin: '참가 신청을 보내면 이 매장에 닉네임과 신청 시각이 전달됩니다. 원하지 않으면 매장 카운터에서 직접 참가하셔도 됩니다',
  voucher: '이용권을 보낸 매장에는 받은 회원의 닉네임이 이용권 명단으로 남습니다. 받고 싶지 않으면 그 매장에 말씀해 주세요',
} as const;
export type VenueShareKind = keyof typeof TEXT;

export default function VenueShareNote({ kind, className = '' }: { kind: VenueShareKind; className?: string }) {
  return (
    <p data-testid={`venue-share-note-${kind}`} className={`text-2xs leading-relaxed text-ink-muted ${className}`}>
      {/* 링크를 두지 않는다 — 매장 페이지 첫 화면 행동 예산(e2e venue-ia ≤6)을 고지가 먹지 않게. 전문은 하단 푸터 '개인정보처리방침'. */}
      {TEXT[kind]} (개인정보처리방침 제9조)
    </p>
  );
}
