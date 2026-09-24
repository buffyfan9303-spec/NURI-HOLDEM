// src/components/features/VoucherManageModal.tsx
// 매장이용권 관리 — 업주: 배포/회수/삭제, 인증직원: 사용 처리. 금전적 가치(금액) 없음.
// VoucherManagePanel(인라인, 매장관리 메뉴) + VoucherManageModal(대시보드 카드용 모달).
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'qrcode';
import { checkinUrl } from '../../api/checkins';
import { buyinRequestUrl } from '../../api/ledger';
import { listVenueVouchers, isHeldVoucher, issueVoucher, deleteVouchers, revokeVouchers, findUserForTransfer, findUserByPhone, voucherHolderStats, isVoucherIssueApproved, voucherHolderProfiles, subscribeVenueVouchers, type Voucher, type VoucherHolderStats, type TransferTarget, type VoucherHolderProfile, type BulkResult, getVoucherQuota, requestVoucherQuota, myVoucherCreditRequests, type VoucherCreditRequest, venueVoucherReasonStats, voucherReasonKey, voucherStatsRange, voucherReasonTable, reasonStatBalanced, type VoucherReasonStat, type VoucherStatsRange, VOUCHER_REASONS, voucherReasonLabel, voucherHolderLabel, type VoucherReason } from '../../api/vouchers';
import { useIdentityEnabled } from '../../lib/identityFlag'; // 본인인증·매장이용권 통합 킬스위치(2026-08-29)
import { loadVenueVoucherPanel, loadVenueVoucherReasonRange } from '../../lib/venueVoucherLoad';
import { CHIP_HIT } from './gto/chip'; // 알약 한 기준: 보이는 32 · 누름 44(2026-09-24 리드 결정)
import type { RequestStamp } from '../../lib/staleResponse';
import { voucherGroupLabel, stripVenuePrefix } from '../../lib/voucherLabel'; // 손님 지갑 표기 규칙(오너 지시 #19)과 같은 함수로 미리보기
import { buildQrForVenue } from './venueQrPrint'; // FINAL-QR#PRINT-A-B — `await` 뒤 '지금 매장' 판정의 단일 출처
import { kstToday } from '../../lib/kst'; // 유효기간 계산은 기기 로컬이 아니라 KST — 서버 판정과 같은 기준

/** 발급 근거 픽 — 오너 지시(2026-09-19): '첫 방문 환영'·'방문 감사' 픽을 빼고 '이용권 지급'을 맨 앞에 둔다.
 *  2026-09-19 2차(마이그레이션 20260919a, 오너 결정 "내역도 '이용권 지급'으로 보이게 해라") — 처음엔
 *  서버 값을 안 늘리고 'welcome' 값에 '이용권 지급' 라벨만 임시로 덮어썼는데, 그러면 사유 없이 준
 *  발급도 나중에 '첫 방문 환영'으로 보여 데이터의 뜻이 섞였다(리드 확인 요청 답변에서 지적됨).
 *  그래서 서버에 진짜 값 'grant' 를 추가했고, 이제 라벨 오버라이드가 필요 없다 — welcome/visit 을
 *  픽에서만 빼면 VOUCHER_REASONS 의 'grant' 가 이미 배열 맨 앞(api/vouchers.ts 순서)이라 그대로 첫 픽이 된다.
 *  과거 welcome 발급분은 그대로 '첫 방문 환영'으로 보인다(voucherReasonLabel 이 원본 배열을 그대로 읽는다
 *  — 값·라벨 조회 경로를 안 건드렸다. 소급 변환 없음, 새 값은 오늘 이후 발급분에만 붙는다). */
const ISSUE_PICKS = VOUCHER_REASONS.filter((o) => o.value !== 'welcome' && o.value !== 'visit');

/** V2 — 유형별 표의 기간 칩과 열. pc=true 는 모바일(md 미만)에서 숨긴다(발급·보유·사용 3열만). */
const STAT_RANGES: [VoucherStatsRange, string][] = [['all', '전체'], ['month', '이번 달'], ['30d', '최근 30일']];
const STAT_COLS: { k: 'issued' | 'held' | 'used' | 'expired' | 'revoked'; label: string; pc: boolean }[] = [
  { k: 'issued', label: '발급', pc: false }, { k: 'held', label: '보유', pc: false }, { k: 'used', label: '사용', pc: false },
  { k: 'expired', label: '만료', pc: true }, { k: 'revoked', label: '회수', pc: true },
];
function fmtDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function VoucherManagePanel({ venueId, prefillReceiver, canIssue: canIssueProp }: {
  venueId: string;
  prefillReceiver?: string;
  /** 🔴 2026-09-20 (E2-F) — 발급 권한은 **서버 판정을 받아서 넣는다**(`canManagePos` 결과).
   *  종전에는 이 파일 안에서 `user.role === 'venue_owner' && user.venueId === venueId` 로 직접 판정했고,
   *  그건 서버보다 **좁았다**: 라이브 `issue_voucher` 는 `can_manage_pos` 를 쓰고 그 함수는
   *  admin ∪ venues.owner_id ∪ venue_owners(status='approved') — 즉 **승인 공동운영자를 포함**한다
   *  (라이브 pg_proc 직접 조회로 확인, 2026-09-20). 공동운영자는 서버가 허용하는데 화면이 안 보여 줬다.
   *  ⚠ 오너 결정(2026-09-20): "공동운영자에게 발급 줘. UI도 이에 맞춰서."
   *  ⚠ 안 주면 **닫힘(false)** 이다 — 모르면 막는 쪽이 안전하다. 클라이언트 게이트는 인가가 아니고
   *    최종 판정은 언제나 서버 `issue_voucher` 다. */
  canIssue?: boolean;
}) {
  const toast = useToast();
  const { user } = useAuth();
  // 킬스위치(2026-08-29) — 진입점은 전부 위에서 숨겼지만, 마지막 문(門)에서도 한 번 더 막는다.
  // 이유: 이 패널은 매장관리 하위탭과 대시보드 모달 두 곳에서 마운트되고, 마운트되는 순간
  // 이용권 목록·보유자 프로필·실시간 구독까지 자동으로 열린다(꺼진 기능이 조용히 네트워크를 쓰는 상태).
  const idOn = useIdentityEnabled();
  const isAdmin = user?.role === 'admin';
  const canIssue = isAdmin || canIssueProp === true;

  const [list, setList] = useState<Voucher[]>([]);
  // "아직 내역이 없습니다"를 먼저 보여주면 업주가 발급이 실패한 줄 알고 **다시 발급**한다
  const [loading, setLoading] = useState(true);
  // 같은 이유로 '조회 실패'도 빈 상태로 보이면 안 된다(2026-09-05 U4). 목록 조회는 RLS 게이트
  // 뒤에 있어, 권한이 빠진 직원 계정에서는 42501 로 떨어지고 화면은 '이용권 0장'이 됐다 —
  // 직원은 발급이 안 된 줄 알고 다시 발급하거나 손님에게 "없다"고 답한다. 그래서 실패는 실패로 말한다.
  const [listErr, setListErr] = useState<unknown>(null);
  // 이 매장의 이름 — 이미 불러온 이용권 행의 조인 값에서 읽는다(추가 조회 0). 첫 발급 전에는 null 이라 미리보기를 내린다.
  const venueName = list.find((v) => v.venueName)?.venueName ?? null;
  const [title, setTitle] = useState('매장이용권');
  // 발급 근거(2026-09-05 정책) — 서버가 기록·검증. 기본값은 ISSUE_PICKS 첫 픽('이용권 지급' = 'grant', 2026-09-19
  // 2차)과 맞춘다 — 예전엔 'visit'이 기본이자 픽 목록의 첫 칸이었는데, 2026-09-19에 그 칸을 뺐다.
  const [reason, setReason] = useState<VoucherReason>('grant');
  const [reasonNote, setReasonNote] = useState('');
  const [count, setCount] = useState(1);
  // 만료일(선택) — 비우면 무기한. 서버는 KST 자정 직전으로 저장돼 그날까지 사용 가능.
  const [expiry, setExpiry] = useState('');
  const [recvUserId, setRecvUserId] = useState<string | null>(null);
  const [recvDisplay, setRecvDisplay] = useState('');
  const [recvMode, setRecvMode] = useState<'none' | 'id' | 'phone'>('none');
  const [idInput, setIdInput] = useState('');
  const [cands, setCands] = useState<TransferTarget[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1); // 자동완성 키보드 하이라이트
  const [busy, setBusy] = useState(false);
  /** Q2(2026-09-20) — 발급 실행 전 최종 확인 단계(매장/받는 회원/장수/사유/만료). 확인 내용이 바뀌거나
   *  매장이 바뀌면 아래 effect 가 즉시 취소한다 — 다른 내용을 보여준 채로 실행되면 안 된다. */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stats, setStats] = useState<VoucherHolderStats | null>(null);
  const [statsErr, setStatsErr] = useState<unknown>(null);
  // V2(2026-09-24) 유형별 발급 통계 — 전체 기간(타일·'전체' 칩)은 패널 로더가, 기간 칩은 loadVenueVoucherReasonRange 가 든다.
  //   rangeRows 는 `매장|기간` 표를 달고 다닌다 — 렌더에서 지금 매장·기간과 다르면 그리지 않는다(QR 의 srcOf 와 같은 이중 가드).
  const [reasonAll, setReasonAll] = useState<VoucherReasonStat[] | null>(null);
  const [reasonErr, setReasonErr] = useState<unknown>(null);
  const [statRange, setStatRange] = useState<VoucherStatsRange>('all');
  const [rangeRows, setRangeRows] = useState<{ key: string; rows: VoucherReasonStat[] } | null>(null);
  const [rangeErr, setRangeErr] = useState<unknown>(null);
  const [reasonTick, setReasonTick] = useState(0);
  const reasonRangeReq = useRef<RequestStamp<string>>({ seq: 0, owner: '' });
  // Q5 — 매장에 매인 QR 은 `{venueId, src}` 로 들고 다닌다(아래 생성 effect 주석 참고).
  type VenueQr = { venueId: string; src: string } | null;
  const [qr, setQr] = useState<VenueQr>(null);
  const [signupQr, setSignupQr] = useState(''); // 고정 주소 — 매장과 무관해서 예외다
  const [checkinQr, setCheckinQr] = useState<VenueQr>(null);
  const [buyinQr, setBuyinQr] = useState<VenueQr>(null);
  const [qrFailed, setQrFailed] = useState(false);
  /** 지금 매장의 것일 때만 이미지를 내준다 — 늦은 응답·전환 잔재를 렌더 단계에서 한 번 더 막는다. */
  const srcOf = (q: VenueQr) => (q && q.venueId === venueId ? q.src : '');
  const [approved, setApproved] = useState(true);
  // 승인 상태 조회 실패 — 삼키면 초기값 true 가 남아 '운영자 승인 필요' 경고가 사라진다(N04-A). 서버가 P0001 로 막긴 하지만 화면이 거짓말한다.
  const [approvedErr, setApprovedErr] = useState<unknown>(null);
  // 발급 한도(쿼터) — null이면 구 DB(한도 미적용)라 표시 생략
  const [quota, setQuota] = useState<number | null>(null);
  // W2-1 VCH-1: 유상 충전 요청·조회 제거(§12-A-2) — 한도 표시는 유지
  // N04-A: 매장 전환 뒤 도착한 앞 매장 쿼터를 버린다(effect cleanup). 발급 뒤 재조회는 quotaTick 으로.
  const [quotaTick, setQuotaTick] = useState(0);
  const reloadQuota = () => setQuotaTick((t) => t + 1);
  useEffect(() => {
    if (!canIssue || !idOn) return;
    let alive = true;
    getVoucherQuota(venueId).then((q) => { if (alive) setQuota(q); }).catch(() => {});
    return () => { alive = false; };
  }, [venueId, canIssue, idOn, quotaTick]);
  const [holderQuery, setHolderQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [profileMap, setProfileMap] = useState<Map<string, VoucherHolderProfile>>(new Map());
  // 🔴 2026-09-24 오너: '매장이용권 발급' 칸은 **항상 펼침**(접기 토글 없음). 매장 QR 만 접힌 채로 시작한다.
  const [qrOpen, setQrOpen] = useState(false);       // QR 섹션 — 기본 접힘(PC 포함)
  const [ownerOpen, setOwnerOpen] = useState(false); // 보유자 현황·통계(업주 전용) — 기본 접힘

  // N04-A(2026-09-13, 적대 반증 생존): 이 패널은 매장 A→B 전환에 리마운트되지 않는데(VenueManageTab pane key·memo) 비동기 setter 에
  //   stale 가드가 0 이었다 — A 목록이 늦게 도착하면 B 화면에 A 이용권이 실리고 '회수'/'삭제'가 **A 매장 이용권 id** 로 나간다(admin 은
  //   can_manage_pos 통과 → 실제 회수·삭제). 지갑·시트와 같은 lib/staleResponse 계약(owner=venueId, seq=호출마다)을 lib/venueVoucherLoad 가 든다.
  //   독립 검증 D(2026-09-13)의 statsErr 관용구는 그 안에 그대로 있다.
  const voucherReq = useRef<RequestStamp<string>>({ seq: 0, owner: '' });
  const reload = () => {
    if (!idOn) return; // 킬스위치 OFF — 꺼진 기능이 조용히 조회를 돌지 않게(무료 egress 예산)
    loadVenueVoucherPanel(voucherReq, venueId, canIssue,
      { list: listVenueVouchers, stats: voucherHolderStats, profiles: voucherHolderProfiles, approved: isVoucherIssueApproved, reasonStats: venueVoucherReasonStats },
      { list: setList, listErr: setListErr, loading: setLoading,
        stats: setStats, profiles: (ps) => setProfileMap(new Map(ps.map((p) => [p.userId, p]))), statsErr: setStatsErr,
        approved: setApproved, approvedErr: setApprovedErr, reasonStats: setReasonAll, reasonStatsErr: setReasonErr });
    setReasonTick((t) => t + 1); // 발급·회수·실시간 갱신 뒤 기간 표도 다시 센다
  };
  // 매장이 바뀌면 앞 매장의 데이터를 **즉시** 지운다(지갑의 V04 와 같다) — 응답 격리와 별개로 한 프레임이라도 A 의 목록이 B 로 보이면 안 된다.
  //   받는 손님 선택도 A 화면에서 고른 것이라 함께 비운다(발급이 B 매장으로 나가면 안 된다).
  // FINAL-QR#PRINT-A-B — '지금 관리 중인 매장' 의 **살아 있는** 사본. `await` 뒤에서 클로저 변수를 보면
  //   항상 요청 당시 값이라 아무것도 못 막는다(printQr 주석 참고). 커밋된 매장만 반영되도록 effect 에서 쓰고,
  //   같은 cleanup 이 **언마운트도 처리**한다(null = '지금 매장 없음' → 인쇄 차단).
  //   ⚠ voucherReq 를 재사용하지 않는 이유: 저 ref 의 seq 는 목록 reload 마다 올라가서, 매장이 그대로인데도
  //     인쇄를 낡은 것으로 판정한다. 여기서 필요한 축은 **owner(매장) 하나**다.
  const venueIdRef = useRef<string | null>(venueId);
  useEffect(() => { venueIdRef.current = venueId; return () => { venueIdRef.current = null; }; }, [venueId]);
  useEffect(() => {
    voucherReq.current = { seq: voucherReq.current.seq + 1, owner: venueId };   // 진행 중인 앞 매장 응답을 전부 stale 로
    setList([]); setListErr(null); setStats(null); setStatsErr(null); setProfileMap(new Map());
    setReasonAll(null); setReasonErr(null); setRangeRows(null); setRangeErr(null);
    setQuota(null); setApproved(true); setApprovedErr(null);
    setRecvUserId(null); setRecvDisplay(''); setCands([]); setActiveIdx(-1); setExpanded(null);
    setConfirmOpen(false); // Q2 — 매장이 바뀌면 보여주던 확인 내용(매장·받는 회원 등)이 전부 낡은 것이라 취소한다
  }, [venueId]);
  // Q2 — 확인 화면에 적힌 내용(장수·사유·만료·받는 회원) 이 하나라도 바뀌면 확인을 취소한다.
  //   위와 별도 effect 인 이유: venueId 변경은 다른 상태들도 같이 지워야 하지만, 이 넷은 그대로 두고
  //   확인 단계로 되돌아가기만 하면 된다.
  useEffect(() => { setConfirmOpen(false); }, [count, reason, expiry, recvUserId]);
  useEffect(() => { reload(); }, [venueId, idOn]); // eslint-disable-line react-hooks/exhaustive-deps
  // V2 기간 칩 재조회. 'all' 로 돌아오면 스탬프만 올려 진행 중인 기간 응답을 버린다(표는 reasonAll 을 쓴다).
  useEffect(() => {
    if (!idOn || !canIssue || statRange === 'all') { reasonRangeReq.current = { seq: reasonRangeReq.current.seq + 1, owner: `${venueId}|all` }; return; }
    const range = voucherStatsRange(statRange);
    loadVenueVoucherReasonRange(reasonRangeReq, venueId, statRange, (id) => venueVoucherReasonStats(id, range),
      { rows: (rows) => setRangeRows({ key: `${venueId}|${statRange}`, rows }), err: setRangeErr });
  }, [venueId, idOn, canIssue, statRange, reasonTick]);
  // 실시간: 이 매장 이용권이 들어오면(사용/발급/회수) 즉시 갱신 — 권한은 RLS로 자동 게이트.
  // ⚠ 킬스위치 OFF 에서는 채널을 열지 않는다 — Realtime 동시연결은 무료 한도의 실질 천장이라
  //   '안 보이는 화면'이 연결을 하나 차지하면 클락 TV 구독까지 같이 열화된다.
  useEffect(() => (idOn ? subscribeVenueVouchers(venueId, () => reload()) : undefined), [venueId, idOn]); // eslint-disable-line react-hooks/exhaustive-deps
  // 🔴 Q5(2026-09-21) — QR 이미지는 **어느 매장 것인지**를 함께 들고 다닌다.
  //   종전에는 `QRCode.toDataURL(...).then(setXxxQr)` 만 있어서, 관리자가 매장을 A→B 로 바꾸면
  //   ① 전환 직후 잠깐 **A 의 QR 이 B 라벨 아래 그대로** 남고
  //   ② 늦게 끝난 A 의 Promise 가 **B 이미지를 덮을** 수 있었다(이 컴포넌트는 key 가 없어 리마운트되지 않는다).
  //   손님이 그 QR 을 찍으면 **다른 매장**에 출석·바인 요청이 들어간다 — 화면 문구로는 구별이 안 된다.
  //   그래서 상태를 `{venueId, src}` 로 묶고, 렌더에서 **지금 매장과 같은 것만** 통과시킨다.
  //   (Q3 의 목록 경합 가드는 이 이미지 상태와 별개다 — 그 가드는 이 자리를 보지 않았다.)
  //   고정 회원가입 QR 은 매장에 매이지 않으므로 예외다.
  useEffect(() => {
    let alive = true;
    setQr(null); setCheckinQr(null); setBuyinQr(null); // 매장이 바뀌는 **즉시** 이전 매장 이미지를 감춘다
    setQrFailed(false);
    const mk = (s: string) => QRCode.toDataURL(s, { width: 240, margin: 1 });
    const own = (src: string) => ({ venueId, src });
    Promise.all([mk(`NURIV-VENUE:${venueId}`), mk(checkinUrl(venueId)), mk(buyinRequestUrl(venueId))])
      .then(([v, c, b]) => {
        if (!alive) return; // 늦게 도착한 앞 매장 응답 — 지금 화면에 반영하지 않는다
        setQr(own(v)); setCheckinQr(own(c)); setBuyinQr(own(b));
      })
      .catch(() => { if (alive) setQrFailed(true); });
    return () => { alive = false; };
  }, [venueId]);
  useEffect(() => { QRCode.toDataURL('https://nuriholdem.com/?signup=1', { width: 240, margin: 1 }).then(setSignupQr).catch(() => {}); }, []);

  // 이용 내역 피드 — 발급(보낸 것)·사용(들어온 것)을 한 줄씩, 최신순. 실시간 구독이 reload를 부르므로 자동 갱신.
  const feed = useMemo(() => {
    // 보유자 표기 — 정본은 voucherHolderLabel(api/vouchers.ts). 스윕①(2026-09-19): 여기·holderLabel·
    // recentRecipients 세 곳이 각자 이 조합을 다시 구현하고 있었고, 그 복제 중 하나(아래 holderLabel)가
    // 실명은 있는데 닉네임이 없는 보유자를 '홍길동/매장 보관'처럼 없는 값과 붙여 보여줬다 — 같은 사람이
    // 이 창의 '이용 내역'과 '보유자별 상세'에서 다른 이름으로 보였다. '-' 는 정본의 '아무 정보 없음' 신호라
    // 이 피드의 원래 빈 문자열 규약(└→ '매장 보관' 대체 문구)과 맞춰 준다.
    const whoOf = (v: Voucher) => {
      const p = v.holderUserId ? profileMap.get(v.holderUserId) : undefined;
      const label = voucherHolderLabel({ realName: p?.realName, nickname: p?.nickname, holderName: v.holderName });
      return label === '-' ? '' : label;
    };
    const ev: { t: 'issued' | 'used'; at: string; title: string; who: string }[] = [];
    for (const v of list) {
      if (v.createdAt) ev.push({ t: 'issued', at: v.createdAt, title: v.title, who: whoOf(v) || '매장 보관' });
      if (v.usedAt) ev.push({ t: 'used', at: v.usedAt, title: v.title, who: whoOf(v) });
    }
    ev.sort((a, b) => b.at.localeCompare(a.at));
    // 같은 분(分)·종류·대상·제목은 한 줄로 묶고 ×N — 10장 발급이 10줄로 도배되지 않게
    const grouped: { t: 'issued' | 'used'; at: string; title: string; who: string; n: number }[] = [];
    for (const e of ev) {
      const last = grouped[grouped.length - 1];
      if (last && last.t === e.t && last.title === e.title && last.who === e.who && last.at.slice(0, 16) === e.at.slice(0, 16)) last.n += 1;
      else grouped.push({ ...e, n: 1 });
    }
    // 🔴 2026-09-24 오너: 목록은 20줄 높이까지만 보이고 그 안에서 스크롤 — 종전 `slice(0, 30)` 은 31번째 줄부터 **화면에서 사라졌다**.
    //   자르지 않고 전부 그린다(스크롤로 모두 닿는다). 원천 목록 자체의 상한(listVenueVouchers 1000행 · max_rows)은 별개 문제다.
    return grouped;
  }, [list, profileMap]);
  const fmtFeed = (iso: string) => { const d = new Date(iso); const p2 = (n: number) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };

  const pickRecv = (t: TransferTarget) => {
    if (t.verified === false) { toast.show('본인인증을 완료한 회원에게만 이용권을 발급할 수 있습니다', 'error'); return; }
    setRecvUserId(t.id); setRecvDisplay(t.display); setRecvMode('none'); setIdInput(''); setCands([]); setActiveIdx(-1);
  };
  // 최근 발급한 손님(단골) — 자주 주는 대상 빠른 선택. 이미 발급된 이력이라 본인인증 완료자로 간주(발급은 인증자만 가능).
  const recentRecipients = useMemo<TransferTarget[]>(() => {
    const seen = new Map<string, { display: string; at: string }>();
    for (const v of list) {
      if (!v.holderUserId) continue;
      const p = profileMap.get(v.holderUserId);
      const label = voucherHolderLabel({ realName: p?.realName, nickname: p?.nickname, holderName: v.holderName });
      const display = label === '-' ? '회원' : label;
      const at = v.createdAt ?? '';
      const prev = seen.get(v.holderUserId);
      if (!prev || at > prev.at) seen.set(v.holderUserId, { display, at });
    }
    return [...seen.entries()].sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 6)
      .map(([id, x]) => ({ id, display: x.display, verified: true }));
  }, [list, profileMap]);
  // '고객·단골' 의 이용권 보내기 진입(대시보드 카드 · 고객 목록 모달 둘 다) — 받는 사람 자동 입력·검색(1명 매치면 즉시 선택)
  useEffect(() => {
    const q = (prefillReceiver ?? '').trim();
    if (!q) return;
    setRecvMode('id');
    setIdInput(q);
    let alive = true;   // N04-A: 프리필이 바뀌거나 언마운트되면 늦은 검색 결과를 버린다
    findUserForTransfer(q)
      .then((f) => { if (!alive) return; if (f.length === 1) pickRecv(f[0]); else setCands(f); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillReceiver]);
  const resolveId = async () => {
    const q = idInput.trim();
    if (!q) return;
    const finder = recvMode === 'phone' ? findUserByPhone : findUserForTransfer;
    try {
      const f = await finder(q);
      if (!f.length) { toast.show(recvMode === 'phone' ? '해당 전화번호의 회원이 없습니다' : '해당 아이디(닉네임)의 회원이 없습니다', 'error'); setCands([]); return; }
      if (f.length === 1) pickRecv(f[0]); else setCands(f);
    } catch (e) { toast.show(e instanceof Error ? e.message : '조회 실패', 'error'); }
  };
  // 입력 시 라이브 자동완성 — 장부 바인 검색과 동일 UX(디바운스 280ms). 닉네임·전화 경로 공용.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if ((recvMode !== 'id' && recvMode !== 'phone') || recvUserId) return;
    const q = idInput.trim();
    if (!q) { setCands([]); return; }
    const finder = recvMode === 'phone' ? findUserByPhone : findUserForTransfer;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    let alive = true;   // N04-A: 타이머는 취소되지만 이미 나간 요청의 응답은 취소되지 않는다 — 다음 입력의 후보를 앞 응답이 덮지 않게
    searchTimer.current = setTimeout(() => { finder(q).then((f) => { if (!alive) return; setCands(f); setActiveIdx(-1); }).catch(() => { if (!alive) return; setCands([]); setActiveIdx(-1); }); }, 280);
    return () => { alive = false; if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [idInput, recvMode, recvUserId]);

  // 매장 비치용 인쇄 — 선택한 QR만 출력(종이가 작아 한꺼번에 불가). 3개 중 1~3개 선택.
  const QR_DEFS = [
    { id: 'voucher', title: '매장이용권 사용', data: () => QRCode.toDataURL(`NURIV-VENUE:${venueId}`, { width: 1024, margin: 2 }), desc: '대시보드 → 이용권 → 사용하기 → ‘매장 QR 스캔’' },
    { id: 'checkin', title: '출석', data: () => QRCode.toDataURL(checkinUrl(venueId), { width: 1024, margin: 2 }), desc: 'QR 스캔 → 오늘 출석(매장 점수 적립 · 출석왕 집계)' },
    { id: 'signup', title: '회원가입', data: () => QRCode.toDataURL('https://nuriholdem.com/?signup=1', { width: 1024, margin: 2 }), desc: 'QR 스캔 → 바로 회원가입' },
    { id: 'buyin', title: '바인(참가) 요청', data: () => QRCode.toDataURL(buyinRequestUrl(venueId), { width: 1024, margin: 2 }), desc: '손님 스캔 → 참가 요청(게임 선택) → 운영자가 장부에서 원탭 승인' },
    { id: 'buyinG1', title: '바인 요청 · 메인', data: () => QRCode.toDataURL(buyinRequestUrl(venueId, 1), { width: 1024, margin: 2 }), desc: '메인 테이블 비치 · 스캔 시 메인 게임 바로 요청' },
    { id: 'buyinG2', title: '바인 요청 · 사이드1', data: () => QRCode.toDataURL(buyinRequestUrl(venueId, 2), { width: 1024, margin: 2 }), desc: '사이드1 테이블 비치 · 스캔 시 사이드1 바로 요청' },
    { id: 'buyinG3', title: '바인 요청 · 사이드2', data: () => QRCode.toDataURL(buyinRequestUrl(venueId, 3), { width: 1024, margin: 2 }), desc: '사이드2 테이블 비치 · 스캔 시 사이드2 바로 요청' },
  ] as const;
  const [printSel, setPrintSel] = useState<Record<string, boolean>>({ voucher: true, checkin: false, signup: false, buyin: false, buyinG1: false, buyinG2: false, buyinG3: false });
  const togglePrint = (id: string) => setPrintSel((m) => ({ ...m, [id]: !m[id] }));
  const printQr = async () => {
    const chosen = QR_DEFS.filter((q) => printSel[q.id]);
    if (chosen.length === 0) { toast.show('인쇄할 QR을 1개 이상 선택하세요', 'error'); return; }
    // 🔴 Q5 / FINAL-QR#PRINT-A-B — 인쇄는 **누른 순간의 매장**으로 끝나야 한다. `q.data()` 는 지금 venueId 로
    //   만들지만 `await` 하는 동안 관리자가 매장을 바꾸면 라벨과 다른 매장의 QR 이 종이에 찍힌다.
    //   비치용이라 한 번 잘못 인쇄되면 그 매장에 계속 붙어 있게 된다 — 화면보다 되돌리기 어렵다.
    //
    //   ⚠ 2026-09-21 정정: 종전 가드 `const forVenue = venueId; … if (forVenue !== venueId)` 는
    //     **한 렌더 클로저의 같은 값 두 개**를 비교해 A→B 전환 뒤에도 항상 거짓이었다 — 0건도 못 막았다.
    //     `await` 뒤에 '지금 매장'을 볼 유일한 길은 렌더/언마운트를 따라가는 **ref 를 읽는 getter** 다.
    //     판정은 venueQrPrint.buildQrForVenue 한 곳에만 있고, 거기서만 getter 를 부른다.
    //   ⚠ 가입 QR 은 매장 무관이지만 선택 묶음에 매장 QR 이 하나라도 있으면 **묶음 전체를 한 매장 세대**로
    //     다룬다(종이 한 장에 같이 찍히므로 A 세대의 가입 QR 만 살려 둘 이유가 없다).
    //   ⚠ 창은 **`await` 앞, 클릭의 동기 구간에서** 연다. `await` 를 하나라도 지나면 사용자 제스처가
    //     소모돼 Chrome/Samsung 이 팝업으로 차단한다(차단은 throw 가 아니라 **null 반환**이라 try/catch 가
    //     안 잡는다). 같은 저장소의 `VenueManageTab.tsx:1568-1580 printPaperForm` 이 이미 이 순서다 —
    //     빈 창을 먼저 열고 내용을 나중에 채운다. QR 을 미리 구워 버튼을 잠그는 쪽보다 diff 도 비용도 작다.
    const forVenue = venueId;
    const w = window.open('', '_blank', 'width=480,height=860');
    if (!w) { toast.show('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도하세요.', 'error'); return; }
    try {
      const imgs = await buildQrForVenue(forVenue, () => venueIdRef.current, chosen.map((q) => q.data));
      // null = 준비 중에 매장이 바뀌었거나 이 창이 언마운트됐다. A 결과는 폐기하고 **열어 둔 빈 창도 닫는다** —
      // 빈 about:blank 를 남기면 업주가 그걸 인쇄물로 오인하거나 A 라벨을 기다리며 서 있게 된다.
      if (!imgs) { w.close(); toast.show('인쇄 준비 중에 매장이 바뀌었습니다. 다시 눌러 주세요.', 'error'); return; }
      const cards = chosen.map((q, i) => {
        const tbl = q.id.startsWith('buyinG') && q.title.includes('·') ? `<div class="table">${q.title.split('·')[1].trim()} 테이블</div>` : '';
        return `  <div class="card"><h2>${q.title}</h2>${tbl}<img src="${imgs[i]}" alt="${q.title} QR"/><p>${q.desc}</p></div>`;
      }).join('\n');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>NURI HOLDEM · 매장 비치 QR</title><style>
*{box-sizing:border-box;margin:0}body{font-family:system-ui,'Apple SD Gothic Neo',sans-serif;text-align:center;padding:28px 22px;color:#111}
.brandlogo{height:56px;width:auto;margin:0 auto 8px;display:block}
.logo{font-size:30px;font-weight:900;letter-spacing:.5px}.logo .h{color:#c9a43c}
.tag{font-size:14px;color:#444;font-weight:700;margin-top:8px}.url{font-size:14px;color:#c9a43c;font-weight:800;margin-top:2px}
.qrs{display:flex;flex-direction:column;align-items:center;gap:20px;margin-top:22px}
.card{border:2px solid #ececec;border-radius:16px;padding:16px 16px 12px;width:320px}
.card h2{font-size:17px;font-weight:800}.card .table{margin-top:8px;font-size:20px;font-weight:900;color:#1a1a1a;background:#f5e6c8;border-radius:8px;padding:6px 8px}.card img{width:236px;height:236px;margin-top:10px}.card p{font-size:12px;color:#666;margin-top:8px;line-height:1.4}
@media print{body{padding:10px}}
</style></head><body>
<img class="brandlogo" src="${window.location.origin}/nuri-logo.png" alt="" onerror="this.style.display='none'"/>
<div class="logo">NURI <span class="h">HOLDEM</span></div>
<div class="tag">국내 최고의 홀덤 커뮤니티</div>
<div class="url">nuriholdem.com</div>
<div class="qrs">
${cards}
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>
</body></html>`);
      w.document.close();
      // QR 생성 실패도 빈 창을 남기지 않는다 — 먼저 열어 둔 대가다.
    } catch (e) { w.close(); toast.show(e instanceof Error ? e.message : '인쇄 준비 실패', 'error'); }
  };
  const issue = async () => {
    if (reason === 'other' && !reasonNote.trim()) { toast.show('기타 사유는 비고에 발급 이유를 적어 주세요', 'error'); return; }
    // 오너 결정(2026-09-14): 손님 미지정 발급을 막는다 — 나중에 손님을 배정하는 기능이 없어 영원히 못 쓰는 표가 되고,
    // 서버도 보유자 없는 이용권의 사용 전이를 거절한다(20260914b). 버튼도 비활성화하지만 한 번 더 막는다.
    if (!recvUserId) { toast.show('받는 손님을 먼저 지정해 주세요', 'error'); return; }
    setBusy(true);
    try {
      const issued = await issueVoucher(venueId, { title, count, holderUserId: recvUserId ?? undefined, holderName: recvDisplay || undefined, expiresAt: expiry ? `${expiry}T23:59:59+09:00` : null, reason, note: reason === 'other' ? reasonNote.trim() || undefined : undefined });
      if (issued === count) {
        toast.show(`매장이용권 ${count}개를 ${recvDisplay ? recvDisplay + '님께 ' : ''}배포했습니다`, 'success');
      } else {
        // Q2 — 요청 장수와 실제 발급 수량이 다르면 자동 재시도하지 않는다(이미 서버에서 발급이 일어난
        //   뒤일 수 있어, 다시 부르면 중복 발급이 된다). 바로 아래 reload/reloadQuota 가 실제 상태를 보여준다.
        toast.show(`발급 결과 확인 필요 — 요청 ${count}개 · 실제 ${issued}개. 이용 내역에서 확인해 주세요`, 'error');
      }
      setTitle('매장이용권'); setCount(1); setExpiry(''); setRecvUserId(null); setRecvDisplay(''); setRecvMode('none'); setCands([]); setReasonNote('');
      reload(); reloadQuota();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '배포 실패';
      toast.show(msg, 'error');
      setConfirmOpen(false); // 실패 시 확인 화면에 머무르지 않고 조건을 다시 고칠 수 있게 되돌린다
      reloadQuota();
    }
    setBusy(false);
  };
  // ⚠ 만료를 함께 본다(2026-09-07). 예전엔 status === 'active' 만 봐서, 기한이 지난 이용권을
  //   업주 화면은 '보유'로 세고 손님 지갑(VoucherWallet.tsx:91 isHeldVoucher)은 0장으로 세었다 —
  //   같은 이용권을 두 사람이 다른 숫자로 보면 그 자리에서 다툼이 된다. 지갑과 **같은 술어**를 쓴다.
  const active = list.filter((v) => isHeldVoucher(v));
  // 보유자별 상세 — 활성/사용 분리(개별 나열 대신). 사용내역은 날짜·시간 포함.
  const holders = useMemo(() => {
    const m = new Map<string, { key: string; name: string; isStore: boolean; active: Voucher[]; used: Voucher[] }>();
    for (const v of list) {
      if (v.status === 'revoked' || v.status === 'expired') continue;
      const key = v.holderUserId ?? (v.holderName ? `n:${v.holderName}` : '__store__');
      // name 은 raw holderName 그대로 둔다('매장 보관' 대체 문구를 여기서 미리 넣지 않는다) — holderLabel 이
      // isStore 를 이미 따로 처리하고, 여기서 채우면 "실명 있음+닉네임 없음" 경로가 그 대체 문구를 주워
      // '홍길동/매장 보관'이 됐다(스윕①).
      const g = m.get(key) ?? { key, name: v.holderName ?? '', isStore: !v.holderUserId && !v.holderName, active: [], used: [] };
      if (v.status === 'used') g.used.push(v); else if (isHeldVoucher(v)) g.active.push(v); // 만료분은 어느 쪽도 아니다
      m.set(key, g);
    }
    return [...m.values()].filter((g) => g.active.length + g.used.length > 0)
      .sort((a, b) => (b.active.length - a.active.length) || (b.used.length - a.used.length));
  }, [list]);
  const holderCount = holders.filter((g) => !g.isStore && g.active.length > 0).length;
  // 표기 — 정본 voucherHolderLabel(api/vouchers.ts). g.name 은 raw holderName(위 holders 참고).
  const holderLabel = (g: { key: string; name: string; isStore: boolean }) => {
    if (g.isStore) return '매장 보관';
    const p = profileMap.get(g.key);
    return voucherHolderLabel({ realName: p?.realName, nickname: p?.nickname, holderName: g.name || null });
  };
  const hq = holderQuery.trim().toLowerCase();
  const shownHolders = hq ? holders.filter((g) => holderLabel(g).toLowerCase().includes(hq)) : holders;
  // 배치 결과를 사장님 말로 옮긴다 — 부분 성공(10장 중 3장만 처리)이 실제로 흔하다.
  const reportBulk = (verb: string, r: BulkResult) => {
    if (r.failed === 0) { toast.show(`${r.ok}장을 ${verb}했습니다`, 'success'); return; }
    if (r.ok === 0) { toast.show(`${verb}하지 못했습니다. ${r.reasons[0] ?? '알 수 없는 오류'}`, 'error'); return; }
    toast.show(`${r.ok}장 ${verb} · ${r.failed}장 실패 · ${r.reasons[0] ?? ''}`, 'error');
  };

  // 회수 — 오너 지시(2026-08-28) 여정의 마지막 칸인데 화면에 아예 없었다.
  //   잘못 보낸 이용권을 되돌릴 수단이 없어 '삭제'(매장 보관분만 가능)로도 손댈 수 없었다.
  // 왜 삭제가 아니라 회수인가: 삭제는 행을 지워 손님 지갑의 내역까지 없애지만,
  //   회수는 status=revoked 로 남아 '언제 무엇을 회수했는지'가 양쪽에 남는다.
  //   서버가 보유자에게 알림도 보낸다(지갑에서 소리 없이 사라지지 않게).
  const revokeGroup = async (g: { name: string; ids: string[] }) => {
    if (g.ids.length === 0) return;
    if (!window.confirm(`${g.name}의 미사용 이용권 ${g.ids.length}장을 회수할까요?\n\n`
      + '회수하면 손님 지갑에서 사용할 수 없게 되고, 손님에게 회수 알림이 갑니다.\n'
      + '이미 사용된 이용권은 회수되지 않고 내역으로 남습니다.')) return;
    setBusy(true);
    const r = await revokeVouchers(g.ids);
    reportBulk('회수', r); setBusy(false); reload();
  };
  // 삭제는 '미사용분'만 넘긴다 — 사용 완료분은 서버가 거절하고(손님 내역·장부 연동 보존),
  // 예전엔 used 까지 함께 넘겨 사용 기록이 통째로 증발했다(2026-08-29 실측).
  const deleteGroup = async (g: { name: string; ids: string[]; usedCount: number }) => {
    if (g.ids.length === 0) { toast.show('삭제할 미사용 이용권이 없습니다. 사용 완료분은 내역으로 보존됩니다', 'info'); return; }
    if (!window.confirm(`${g.name}의 미사용 이용권 ${g.ids.length}장을 완전히 삭제할까요? 되돌릴 수 없습니다.`
      + (g.usedCount > 0 ? `\n\n사용 완료 ${g.usedCount}장은 이용 내역이라 삭제되지 않습니다.` : ''))) return;
    setBusy(true);
    const r = await deleteVouchers(g.ids);
    reportBulk('삭제', r); setBusy(false); reload();
  };

  // 킬스위치 OFF — 진입점이 다 숨겨진 뒤에도 딥링크·구 탭 상태로 여기까지 오는 경로가 있을 수 있다.
  // '기능이 잠시 꺼졌다'를 말해 주는 것이 빈 화면·조용한 실패보다 낫다(레코드는 그대로 보존).
  if (!idOn) {
    return (
      <div className="rounded-aura border card-aura p-6 text-center">
        <Icon name="ticket" size={22} className="mx-auto text-ink-muted" />
        <p className="mt-2 text-sm font-bold text-ink-primary">매장이용권은 현재 비활성화되어 있습니다</p>
        <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">
          본인인증 준비가 끝나면 다시 열립니다. 발행·보유 기록은 그대로 보관되어 있으며 삭제되지 않았습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 0) 이용 내역 — 실시간(발급·사용). 장부/이용권 권한 직원도 열람 — 기본 열림 */}
      <div className="rounded-aura border card-aura p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-accent-300"><Icon name="ticket" size={14} /> 이용 내역 <span className="font-normal text-ink-muted">· 실시간</span></p>
          <button type="button" onClick={reload} disabled={loading}
            className="inline-flex h-7 items-center gap-1 rounded-input border border-border-subtle bg-surface-high/60 px-2 text-2xs font-bold text-ink-secondary hover:text-ink-primary disabled:opacity-50">
            <Icon name="refresh" size={12} className={loading ? 'animate-spin' : ''} /> 새로고침
          </button>
        </div>
        {listErr != null && list.length === 0 ? (
          // 실패가 빈 상태보다 먼저. 이미 받아 둔 목록이 있으면(재조회 실패) 보던 내역은 그대로 둔다.
          <LoadErrorCard error={listErr} what="이용권 내역" onRetry={reload} compact />
        ) : feed.length === 0 ? (
          <p className="py-3 text-center text-2xs text-ink-muted">아직 내역이 없습니다. 발급·사용되면 즉시 표시됩니다.</p>
        ) : (
          /* 20줄 창 = 줄 높이 h-7(1.75rem) × 20 + 줄 사이 space-y-1(0.25rem) × 19. 줄 높이를 고정해야 창이 정확히 20줄이다
             (글자 줄높이에 맡기면 폰트·배지에 따라 19.x 줄이 된다 — 실측 종전 28.69px/줄). */
          <ul data-testid="voucher-feed" className="max-h-[calc(20*1.75rem+19*0.25rem)] space-y-1 overflow-y-auto">
            {feed.map((e, i) => (
              <li key={i} className="flex h-7 items-center gap-2 rounded-input bg-surface-base/50 px-2 py-1.5 text-2xs">
                <span className={['shrink-0 rounded-badge px-1.5 py-0.5 font-bold leading-none',
                  e.t === 'used' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-accent-300/15 text-accent-300'].join(' ')}>
                  <Icon name={e.t === 'used' ? 'arrow-down-left' : 'arrow-up-right'} size={10} className="mr-0.5 inline-block align-[-1px] shrink-0" />{e.t === 'used' ? '사용(받음)' : '발급(보냄)'}
                </span>
                {/* ⚠ 회원명+이용권명이 길면 **몇 장을 발급/사용했는지**가 사라졌다 — 수량이 이 내역의 핵심이다. */}
                <span className="flex min-w-0 flex-1 items-center gap-1 text-ink-secondary">
                  <span className="min-w-0 truncate"><b className="text-ink-primary">{e.who || '회원'}</b> · {e.title}</span>
                  {e.n > 1 && <b className="shrink-0 text-accent-300">×{e.n}</b>}
                </span>
                <span className="shrink-0 tabular-nums text-ink-muted">{fmtFeed(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 1) 매장이용권 발급 — 접기 */}
      {canIssue ? (
        <div data-testid="voucher-issue" className="rounded-input border border-accent-400/30 bg-accent-300/[0.05]">
          <h3 data-testid="voucher-issue-head" className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
            <span className="text-xs font-bold text-accent-300">매장이용권 발급 {/* 오너 2026-09-24: 제목 옆 '업주·공동운영자' 라벨은 PC 에서도 뺀다(모바일은 이미 없었다). 발급 권한 범위는
                  펼친 안의 안내 박스(data-testid=voucher-issue-scope)가 그대로 말한다 — e2e 가 그 박스를 본다. */}{/* 스윕②(2026-09-19): 이 배지는 '개', 바로 아래 한도 증액 패널(QuotaRequestPanel)은 '장' — 같은
                  quota 값이 한 스크롤 안에서 단위만 바뀌었다. '장'으로 통일(이용권은 '장' 으로 세는 물건 —
                  발급 폼도 '개' 스테퍼가 아니라 옆에 '개'라고 적혀 있었을 뿐 실제 문구는 전부 장이다). */}
                {quota !== null && <span className={['ml-1.5 rounded-badge px-1.5 py-0.5 font-bold', quota < 50 ? 'bg-danger/15 text-danger-light' : 'bg-surface-high text-ink-secondary'].join(' ')}>잔여 한도 {quota.toLocaleString()}장</span>}</span>
          </h3>
          {(
            /* 🔴 V1(오너 2026-09-24) — 모바일(<768) 발급 폼 정리. 칸마다 높이(32·38.3·40.8)·폭·모서리가 제각각이라
               "제멋대로" 보였다. 모바일에서만: 조작 요소 높이 44px 한 값 · 칩은 격자(근거 2열 · 기간 5열)로 폭 균등 ·
               각 묶음은 '라벨 → 조작' 같은 문법(간격 6px). md 이상은 클래스가 전부 `max-md:`/`md:hidden` 이라 **무변경**. */
            <div className="space-y-1.5 px-2.5 pb-2.5 max-md:space-y-2.5">
              {!isAdmin && approvedErr == null && !approved && (
                <p className="flex items-start gap-1.5 rounded-input border border-danger/40 bg-danger/[0.08] px-2 py-1.5 text-2xs text-danger-light"><Icon name="alert" size={12} className="mt-0.5 shrink-0" /> 운영자 승인 후 발급할 수 있습니다.</p>
              )}
              {!isAdmin && approvedErr != null && (
                <LoadErrorCard what="발급 승인 상태" error={approvedErr} onRetry={reload} compact hint="승인 상태를 확인하기 전에는 발급할 수 없습니다." />
              )}
              <div className="flex gap-1.5 max-md:flex-col">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="이용권 이름 (예: 데일리 1회 참가권)" className="input min-w-0 flex-1 text-sm max-md:h-[44px] max-md:flex-none" />
                <div className="flex items-stretch gap-1 shrink-0 max-md:h-[44px] max-md:w-full">
                  <StepBtn label="−" onStep={() => setCount((c) => Math.max(1, c - 1))} />
                  <input type="number" inputMode="numeric" min={1} max={1000} value={count || ''} onChange={(e) => setCount(Math.min(1000, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    className="input w-16 text-sm tabular-nums text-center max-md:h-auto max-md:min-w-0 max-md:flex-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" aria-label="발급 갯수" />
                  <StepBtn label="+" onStep={() => setCount((c) => Math.min(1000, c + 1))} />
                  <span className="self-center pl-0.5 text-2xs text-ink-muted">개</span>
                </div>
              </div>
              {/* 발급 근거(2026-09-05 정책) — 모든 발급에 사유를 남긴다. 순위·시상 사유는 목록에 없고, 제목·비고에 적어도 서버가 거절한다. */}
              {/* ⚠ 2026-08-18엔 줄바꿈 대신 가로 스크롤을 썼다(그때 칩 5개, 마지막 줄에 한두 개만 남는
                  고아 줄이 생기고 고를 때마다 줄 수가 변해 아래가 튀는 문제였다).
                  2026-09-19: 오너 문장은 "이 부분이 끊켜있어" — 원한 건 "안 잘림" 이지 "스크롤 가능함을
                  보여주는 것"이 아니다(스크롤+페이드로 처음 대응했더니 리드가 반려: 390px 에서 여전히
                  +32px 넘쳐서 "스크롤할 수 있다"는 신호만 줄 뿐 안 잘리진 않았다). ISSUE_PICKS 를 4개로
                  줄인 지금은 **2×2 로 깔끔하게 두 줄이 된다**(고아 줄 없음) — flex-wrap 으로 복귀하고
                  가로 스크롤·페이드는 걷어냈다(스크롤이 없으니 페이드는 '더 있는데 가려졌다'는 거짓
                  신호가 된다 — 리드 지적). 라벨(특히 '기타(비고 필수)')은 그대로 둔다 — '(비고 필수)'는
                  "메모를 안 쓰면 발급이 안 된다"는 조건이라 줄이면 사용자가 왜 막히는지 모른다(§7). */}
              <div className="space-y-1.5">
              <p aria-hidden className="text-2xs font-semibold text-ink-secondary md:hidden">발급 근거</p>
              {/* 🔴 2026-09-24 리드 결정(알약 한 기준) — 모바일 칩은 보이는 44 가 아니라 **보이는 32 + CHIP_HIT(±8) = 누름 48**.
                  두 줄로 접히므로 줄 간격을 `gap-y-3.5`(14.875 ≥ 8+8 − 가장자리 여유)로 둬 윗줄·아랫줄 히트가 겹치지 않게 한다.
                  PC 는 종전 min-h-9 그대로(CHIP_HIT 는 ::before 뿐이라 rect 불변). */}
              <div className="flex flex-wrap gap-1.5 max-md:grid max-md:grid-cols-2 max-md:gap-y-3.5" role="group" aria-label="발급 근거">
                {ISSUE_PICKS.map((o) => (
                  <button key={o.value} type="button" onClick={() => setReason(o.value)} aria-pressed={reason === o.value} title={o.hint}
                    className={['min-h-9 shrink-0 whitespace-nowrap rounded-chip border px-2.5 text-2xs font-bold transition-colors max-md:min-h-[32px] max-md:px-1', CHIP_HIT,
                      reason === o.value ? 'border-transparent bg-accent-300 text-white' : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
                    {o.label}
                  </button>
                ))}
              </div>
              </div>
              {reason === 'other' && (
                <input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} maxLength={80} placeholder="기타 사유 — 발급 이유를 적어 주세요(필수)" className="input w-full text-sm" />
              )}
              <p className="text-2xs text-ink-muted">대회 순위·입상을 근거로 한 이용권은 발급할 수 없습니다(2026-09-05). 발급 근거는 기록에 남습니다.</p>
              {/* 손님 화면 미리보기(오너 지시 #19) — 매장명은 **자동으로 붙는다**.
                  왜 필요한가: 라이브 데이터 101장 중 100장의 제목에 업주가 '로티아레나'를 손으로 타이핑해
                  두었다. 이제 그럴 필요가 없고, 그렇게 해도 중복은 표시 단계에서 걷힌다는 걸 여기서 보여 준다.
                  매장명은 이 매장이 이미 발급한 이용권에서 읽는다(새 네트워크 0) — 모르면 줄 자체를 내린다. */}
              {venueName && (
                <p className="flex items-start gap-1.5 rounded-input bg-surface-high px-2 py-1.5 text-2xs leading-relaxed text-ink-muted">
                  <Icon name="eye" size={12} className="mt-0.5 shrink-0 text-accent-300" />
                  <span className="min-w-0 break-keep">손님 지갑에는 <b className="text-ink-primary">{voucherGroupLabel(venueName)}</b> 묶음 안에 <b className="text-ink-primary">{stripVenuePrefix(title, venueName)}</b> 로 보입니다. 이름에 매장명을 다시 넣지 않아도 됩니다.</span>
                </p>
              )}
              {/* 유효기간 — 만료 이용권은 사용 RPC 가 서버에서 거부하고 손님 지갑에서도 자동 제외된다(2026-08-17).
                🔴 2026-09-18 오너: "유효기간은 날짜를 직접 설정하게 하지말고 1일 3일 이런식으로 선택하게 제작".
                  달력 입력을 **기간 선택**으로 바꿨다. 업주는 발급할 때마다 달력을 열어 날짜를 세지 않는다.
                ⚠ 저장 형식은 그대로다 — `expiry`(YYYY-MM-DD) 문자열에 계산 결과를 넣을 뿐,
                  issueVoucher 로 가는 `${expiry}T23:59:59+09:00` 도, DB(store_vouchers.expires_at)도 안 바뀐다.
                ⚠ 'N일' 의 뜻을 화면에 **날짜로 적어** 둔다. 'N일' 만 적으면 발급 당일 자정인지 N일 뒤인지가
                  사람마다 다르게 읽히고, 그 차이로 손님이 못 쓰는 표가 나온다.
                  여기 규칙: N일 = **KST 오늘 + N일의 23:59:59** (1일 = 내일 밤까지). 종전 달력의 min 이
                  '내일'이었던 것과 같은 하한이라 당일 몇 시간짜리 표가 생기지 않는다. */}
              <div className="text-2xs text-ink-secondary">
                <div data-expiry-chips className="flex flex-wrap items-center gap-1.5 max-md:grid max-md:grid-cols-5">
                  <span className="shrink-0 font-semibold max-md:col-span-5">유효기간</span>
                  {EXPIRY_PRESETS.map((d) => {
                    const val = d === 0 ? '' : addKstDays(d);
                    const on = expiry === val;
                    return (
                      <button key={d} type="button" aria-pressed={on} onClick={() => setExpiry(val)}
                        className={[
                          'min-h-[32px] rounded-full border px-2.5 text-2xs font-bold transition-colors max-md:rounded-chip max-md:px-0', CHIP_HIT,
                          on ? 'border-accent-300/60 bg-accent-500/20 text-accent-100'
                             : 'border-border-default bg-surface-high text-ink-secondary hover:bg-surface-float/60',
                        ].join(' ')}>
                        {d === 0 ? '무기한' : `${d}일`}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-ink-muted">
                  {expiry
                    ? <>선택한 기간의 마지막 날은 <b className="tabular-nums text-ink-secondary">{expiry}</b> 입니다 — 그날 <b className="text-ink-secondary">밤 11시 59분</b>까지 쓸 수 있습니다.</>
                    : '무기한 — 만료일 없이 발급합니다.'}
                </p>
              </div>
              {/* 받는 손님 지정 — 아이디(닉네임)로 지정 */}
              {/* 🔴 V1(오너 2026-09-24) — '아이디/전화번호로 지정' 을 누르면 위 '받는 손님 필수' 라벨이 사라지며
                  입력칸이 생겨 **높이가 줄었다 늘었다** 했다(실측 390: 발급 판 −20.19px). 모바일에서는 세 상태
                  (미지정 · 입력 중 · 선택됨) 모두 **같은 라벨 + 44px 한 줄**로 맞춰 누를 때 높이 변화 0 이다.
                  최근 받은 손님 줄도 미지정 상태에서 같이 보여(모바일) 누르는 순간 줄이 새로 끼지 않는다.
                  PC 는 라벨·최근 줄이 `md:hidden` 이라 종전 그대로다. */}
              {recvUserId ? (
                <div className="max-md:space-y-1.5">
                  <p className="text-2xs font-semibold text-ink-secondary md:hidden">받는 손님 <span className="text-danger-light">필수</span></p>
                  <div className="flex items-center gap-2 rounded-input border border-accent-400/40 bg-accent-300/[0.06] px-2.5 py-1.5 max-md:h-[44px]">
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-primary">받는 손님: <b className="text-accent-300">{recvDisplay}</b></span>
                    <button type="button" onClick={() => { setRecvUserId(null); setRecvDisplay(''); }} className="shrink-0 text-2xs text-ink-muted max-md:-my-1.5 max-md:h-[44px] max-md:px-2">변경</button>
                  </div>
                </div>
              ) : (recvMode === 'id' || recvMode === 'phone') ? (
                <div className="space-y-1.5">
                  <p className="text-2xs font-semibold text-ink-secondary md:hidden">받는 손님 <span className="text-danger-light">필수</span></p>
                  {/* 최근 발급한 손님(단골) 빠른 선택 — 자주 주는 대상 원탭 */}
                  {recentRecipients.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="self-center text-2xs text-ink-muted">최근:</span>
                      {recentRecipients.map((r) => (
                        <button key={r.id} type="button" onClick={() => pickRecv(r)}
                          className="inline-flex items-center gap-1 rounded-full border border-accent-400/30 bg-accent-300/[0.06] px-2 py-0.5 text-[11px] text-ink-secondary hover:border-accent-400/60 hover:text-accent-300">
                          <Icon name="user" size={11} /> {r.display}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <input value={idInput} onChange={(e) => setIdInput(e.target.value)} autoFocus
                      role="combobox" aria-expanded={cands.length > 0} aria-autocomplete="list"
                      onKeyDown={(e) => {
                        // ⚠ 한글 조합 중의 확정 Enter 가 여기 들어오면, 화살표로 고르지도 않은 후보에게
                        //   이용권이 발급된다(activeIdx 가 남아 있으면 pickRecv 가 그대로 실행된다).
                        if (e.nativeEvent.isComposing) return; // 한글 조합 확정 Enter 를 제출로 오인하지 않게
                        if (e.key === 'ArrowDown' && cands.length) { e.preventDefault(); setActiveIdx((i) => Math.min(cands.length - 1, i + 1)); }
                        else if (e.key === 'ArrowUp' && cands.length) { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
                        else if (e.key === 'Enter') { e.preventDefault(); if (activeIdx >= 0 && activeIdx < cands.length) pickRecv(cands[activeIdx]); else resolveId(); }
                        else if (e.key === 'Escape') { setCands([]); setActiveIdx(-1); }
                      }}
                      inputMode={recvMode === 'phone' ? 'numeric' : 'text'}
                      placeholder={recvMode === 'phone' ? '전화번호 입력 · 자동완성 (↑/↓·Enter)' : '이름·아이디(닉네임) 입력 · 자동완성 (↑/↓·Enter)'} className="input min-w-0 flex-1 text-sm max-md:h-[44px]" />
                    <button type="button" onClick={() => { setRecvMode('none'); setCands([]); setIdInput(''); setActiveIdx(-1); }} className="shrink-0 rounded-input border border-border-default bg-surface-high px-3 text-2xs font-bold text-ink-muted hover:text-ink-secondary max-md:h-[44px]">취소</button>
                  </div>
                  {cands.length > 0 ? (
                    <ul role="listbox" className="max-h-40 space-y-1 overflow-y-auto rounded-input border border-accent-400/30 bg-surface-low p-1">
                      {cands.map((c, i) => {
                        const unverified = c.verified === false;
                        return (
                          <li key={c.id} role="option" aria-selected={i === activeIdx}>
                            <button type="button" disabled={unverified} onClick={() => pickRecv(c)} onMouseEnter={() => setActiveIdx(i)}
                              className={`flex w-full items-center gap-1.5 rounded-input px-2 py-1.5 text-left ${unverified ? 'cursor-not-allowed opacity-60' : i === activeIdx ? 'bg-surface-high' : 'hover:bg-surface-high'}`}>
                              <Icon name="user" size={12} className="shrink-0 text-ink-muted" />
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{c.display}</span>
                              {unverified && <span className="shrink-0 rounded bg-danger/15 px-1.5 py-0.5 text-2xs font-bold text-danger-light">미인증 · 발급 불가</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : idInput.trim() ? (
                    <p className="px-1 text-2xs text-ink-muted">일치하는 회원이 없습니다 — {recvMode === 'phone' ? '전화번호' : '아이디(닉네임)'}를 확인하세요.</p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-1 max-md:space-y-1.5">
                  {/* 2026-09-18 오너 확인: "전화번호 닉네임 둘다 가능" — 두 갈래를 **둘 다 유지**한다.
                      (처음 지시는 "닉네임으로만" 이었는데, 전화번호 경로가 이미 있다는 걸 알리고 확인받았다.
                       있던 기능을 말없이 없애지 않는다 — CLAUDE.md 기능 보존.) */}
                  <p className="text-2xs font-semibold text-ink-secondary">받는 손님 <span className="text-danger-light">필수</span></p>
                  {recentRecipients.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 md:hidden">
                      <span className="self-center text-2xs text-ink-muted">최근:</span>
                      {recentRecipients.map((r) => (
                        <button key={r.id} type="button" onClick={() => pickRecv(r)}
                          className="inline-flex items-center gap-1 rounded-full border border-accent-400/30 bg-accent-300/[0.06] px-2 py-0.5 text-[11px] text-ink-secondary hover:border-accent-400/60 hover:text-accent-300">
                          <Icon name="user" size={11} /> {r.display}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setRecvMode('id')} className="btn-ghost inline-flex flex-1 items-center justify-center gap-1 text-2xs max-md:h-[44px]"><Icon name="user" size={12} /> 아이디(닉네임)로 지정</button>
                    <button type="button" onClick={() => setRecvMode('phone')} className="btn-ghost inline-flex flex-1 items-center justify-center gap-1 text-2xs max-md:h-[44px]"><Icon name="phone" size={12} /> 전화번호로 지정</button>
                  </div>
                </div>
              )}
              {/* Q2(2026-09-20) — 실행 전 매장/받는 회원/장수/사유/만료 최종 확인. 위 effect 가 내용이
                  바뀌거나(count/reason/expiry/recvUserId) 매장이 바뀌면 이 단계를 즉시 취소한다. */}
              {confirmOpen ? (
                <div className="space-y-1.5 rounded-input border border-accent-400/50 bg-accent-300/[0.08] p-2.5 text-2xs">
                  <p className="font-bold text-accent-300">발급 확인</p>
                  <p>매장: <b className="text-ink-primary">{venueName ?? '우리 매장'}</b></p>
                  <p>받는 회원: <b className="text-ink-primary">{recvDisplay || '회원'}</b>{recvUserId && <span className="text-ink-muted"> · ID …{recvUserId.slice(-6)}</span>}</p>
                  <p>장수: <b className="text-ink-primary">{count}개</b></p>
                  <p>사유: <b className="text-ink-primary">{voucherReasonLabel(reason)}</b>{reason === 'other' && reasonNote.trim() && <span className="text-ink-muted"> · {reasonNote.trim()}</span>}</p>
                  <p>만료: <b className="text-ink-primary">{expiry || '무기한'}</b></p>
                  <div className="flex gap-1.5 pt-0.5">
                    <button type="button" onClick={() => setConfirmOpen(false)} className="min-h-[44px] flex-1 rounded-input border border-border-default bg-surface-high text-2xs font-bold text-ink-secondary">취소</button>
                    <button type="button" disabled={busy} onClick={issue} className="btn-primary min-h-[44px] flex-1 text-sm disabled:opacity-50">{busy ? '배포 중…' : `${count}개 발급 확정`}</button>
                  </div>
                </div>
              ) : (
                <button type="button" disabled={busy || !recvUserId || (!isAdmin && (!approved || approvedErr != null))}
                  onClick={() => setConfirmOpen(true)} className="btn-primary min-h-[44px] w-full text-sm disabled:opacity-50">
                  {recvUserId ? `+ ${count}개 발급 → ${recvDisplay}` : '받는 손님을 먼저 지정하세요'}
                </button>
              )}
              {/* 오너 결정(2026-09-14): 손님 미지정 발급은 나중에 배정할 방법이 없어 영원히 못 쓰는 표가 된다 —
                  '미지정이면 매장 보관용'은 더 이상 사실이 아니라 지웠다. 본인인증을 마친 회원 계정에만 발급되는 이유를 남긴다. */}
              {/* 🔴 법적 고지 — 오너 지시로 **필수**다(2026-09-18: "하단에 매장 업주에게만 가능 이라는 문구
                  필수 법적인 문제 때문에"). 지우지 마라. 문구를 바꿔야 하면 오너 확인을 받아라.
                  왜 여기인가: 이 화면이 **실제로 이용권을 만들어 내보내는 유일한 자리**다. 발급 버튼 바로 아래에
                  두어야 누르기 직전에 읽힌다 — 화면 맨 끝에 두면 스크롤 밖에 남는다(실측 대상 아님, 배치 원칙).
                  ⚠ 같은 취지의 문구가 출석 명단(CheckinModal)에도 있다. 거기도 이용권을 **보내는** 자리라서다.
                    두 곳의 문구가 갈리면 안 된다 — 한쪽을 고치면 다른 쪽도 같이 고쳐라. */}
              <p className="rounded-input border border-border-subtle bg-surface-high/40 p-2 text-2xs leading-relaxed text-ink-secondary">
                {/* 🔴 2026-09-20 — '인증된 매장 업주에게만' 은 서버와 어긋난 문구였다. 라이브 `issue_voucher` 는
                    `can_manage_pos`(admin ∪ 소유자 ∪ **승인 공동운영자**)를 보고, 그다음 `venues.voucher_issue_approved`
                    (운영자 승인)를 본다 — pg_proc 직접 조회로 확인(2026-09-20).
                    오너 결정: "공동운영자에게 발급 줘. UI도 이에 맞춰서." → 실제 범위를 그대로 적는다.
                    ⚠ 위 주석대로 CheckinModal 의 같은 문구와 **갈리면 안 된다** — 둘 다 같이 고쳤다. */}
                <b data-testid="voucher-issue-scope" className="text-ink-primary">매장이용권 발급은 운영자 승인을 받은 매장의 업주·공동운영자만 가능합니다.</b><br />
                손님끼리 주고받을 수 없으며, <b className="text-ink-primary">금전적 가치가 없습니다</b>(현금·상품권으로 교환·환불되지 않습니다).
              </p>
              <p className="text-2xs text-ink-muted">1회 최대 1000개 · 본인인증을 마친 회원 계정에만 발급됩니다(받는 손님 지정 필수). 받는 분은 <b className="text-ink-secondary">아이디(닉네임) 또는 전화번호</b>로 지정합니다. 손님은 ‘사용하기 → 매장 QR 스캔’으로 사용합니다.</p>

              {/* 🔴 2026-09-18 오너: "매장이용권 발행 한도 늘리는 요청(관리자에게)부터 시작해서 더 편하게",
                  "이용권 한도는 한도 증액 문구를 사용해서 전혀 금전적인게 없게".
                  종전엔 "운영자 문의 (유상 충전 종료)" 한 줄이 끝이었다 — 어디로 문의하는지도 없었다.
                ⚠ 금전 낱말(충전·구매·결제·금액)을 **한 개도 쓰지 않는다.** 오가는 것은 발행 가능 '장수'뿐이다.
                  유상 충전 경로(request_voucher_credit)는 §12-A-2 로 봉쇄된 채 그대로 두고, 그 옆에 낸 다른 길이다. */}
              <QuotaRequestPanel venueId={venueId} quota={quota} onGranted={reloadQuota} />
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-input border border-border-subtle bg-surface-low p-2.5 text-2xs text-ink-muted">배포·회수·삭제는 <b className="text-ink-secondary">업주</b> 전용. 직원은 열람·사용 처리만.</p>
      )}

      {/* 2) QR 코드 — 접기 */}
      {canIssue && qr && (
        <div className="rounded-input border border-accent-400/30 bg-accent-300/[0.05]">
          <button type="button" onClick={() => setQrOpen((v) => !v)} aria-expanded={qrOpen} className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
            <span className="text-xs font-bold text-accent-300">매장 QR <span className="font-normal text-ink-muted">· 이용권 · 출석 · 회원가입</span></span>
            <Icon name="chevron-down" size={14} className={['shrink-0 text-ink-muted transition-transform', qrOpen ? 'rotate-180' : ''].join(' ')} />
          </button>
          {qrOpen && (
            <div className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-3">
                {/* 🔴 Q5 — `srcOf` 로 **지금 매장의 이미지만** 통과시킨다. 비면 빈칸으로 두지 않고
                    '만드는 중 / 실패' 를 말한다 — 옛 매장 QR 을 그대로 두는 것보다 안전하고,
                    아무것도 없는 칸은 업주가 "왜 안 나오지" 하고 기다리게 만든다. */}
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-ink-secondary">이용권 사용 QR</p>
                  {srcOf(qr)
                    ? <img src={srcOf(qr)} alt="매장 이용권 QR" width={130} height={130} className="rounded bg-white p-1.5" />
                    : <div className="flex h-[130px] w-[130px] items-center justify-center rounded border border-border-subtle bg-surface-low text-2xs text-ink-muted">{qrFailed ? '만들지 못했어요' : '만드는 중…'}</div>}
                  <p className="text-center text-2xs leading-snug text-ink-muted">손님이 스캔해 사용 (고정)</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-ink-secondary">출석 QR</p>
                  {srcOf(checkinQr)
                    ? <img src={srcOf(checkinQr)} alt="출석 QR" width={130} height={130} className="rounded bg-white p-1.5" />
                    : <div className="flex h-[130px] w-[130px] items-center justify-center rounded border border-border-subtle bg-surface-low text-2xs text-ink-muted">{qrFailed ? '만들지 못했어요' : '만드는 중…'}</div>}
                  <p className="text-center text-2xs leading-snug text-ink-muted">손님 스캔 → 출석 · 출석왕 집계 (고정)</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-ink-secondary">회원가입 QR</p>
                  {signupQr && <img src={signupQr} alt="회원가입 QR" width={130} height={130} className="rounded bg-white p-1.5" />}
                  <p className="text-center text-2xs leading-snug text-ink-muted">스캔 시 회원가입 페이지로 이동</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-ink-secondary">바인 요청 QR</p>
                  {srcOf(buyinQr)
                    ? <img src={srcOf(buyinQr)} alt="바인 요청 QR" width={130} height={130} className="rounded bg-white p-1.5" />
                    : <div className="flex h-[130px] w-[130px] items-center justify-center rounded border border-border-subtle bg-surface-low text-2xs text-ink-muted">{qrFailed ? '만들지 못했어요' : '만드는 중…'}</div>}
                  <p className="text-center text-2xs leading-snug text-ink-muted">손님 스캔 → 참가 요청 → 장부에서 승인</p>
                </div>
              </div>
              {/* 인쇄할 QR 선택 — 종이가 작아 한꺼번에 안 됨. 1~3개 선택 */}
              <div className="mt-3 rounded-input border border-border-subtle bg-surface-low p-2">
                <p className="mb-1.5 text-2xs font-bold text-ink-secondary">인쇄할 QR 선택 (1~3개)</p>
                <div className="flex flex-wrap gap-1.5">
                  {QR_DEFS.map((q) => {
                    const on = printSel[q.id];
                    return (
                      <button key={q.id} type="button" onClick={() => togglePrint(q.id)}
                        className={['inline-flex items-center gap-1 rounded-badge border px-2 py-1 text-2xs font-bold transition-colors',
                          on ? 'border-accent-400/50 bg-accent-300/15 text-accent-300' : 'border-border-default bg-surface-high text-ink-muted'].join(' ')}>
                        {on && <Icon name="check" size={11} className="shrink-0" />} {q.title}
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={printQr} className="btn-ghost mt-2 inline-flex w-full items-center justify-center gap-1.5 px-3 text-2xs"><Icon name="printer" size={13} /> 선택한 QR 출력해 매장에 비치</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3) 보유자 현황·통계 — 업주 전용, 기본 접힘 */}
      {canIssue && (
        <button type="button" onClick={() => setOwnerOpen((v) => !v)} aria-expanded={ownerOpen}
          className="flex w-full items-center justify-between gap-2 rounded-input border border-border-subtle bg-surface-low px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-ink-secondary"><Icon name="chart" size={14} /> 보유자 현황·통계 <span className="font-normal text-ink-muted">· 업주 전용</span></span>
          <Icon name="chevron-down" size={14} className={['shrink-0 text-ink-muted transition-transform', ownerOpen ? 'rotate-180' : ''].join(' ')} />
        </button>
      )}
      {canIssue && ownerOpen && statsErr != null && <LoadErrorCard what="보유자 통계" error={statsErr} onRetry={reload} compact />}
      {canIssue && ownerOpen && statsErr == null && stats && (
        <div className="rounded-card border border-accent-400/30 bg-gradient-to-br from-accent-300/[0.07] via-surface-low to-surface-low p-3 space-y-2.5">
          {/* V2(2026-09-24) — 타일은 유형별 통계의 **전체 기간 합계**로 다시 센다(B2). 옛 voucher_holder_stats 의 active_count 는
              만료분을 포함해 '잔여' 가 지갑·보유자 목록보다 컸다. 보유 회원 수만은 유형별로 더할 수 없어(한 사람이 여러 유형) 옛 값을 쓴다.
              유형별 조회가 실패하면(권한 42501 포함) 타일도 그리지 않는다 — 거짓 '0' 대신 오류 카드. */}
          {reasonErr != null ? <LoadErrorCard what="유형별 통계" error={reasonErr} onRetry={reload} compact />
            : !reasonAll ? <p className="py-3 text-center text-2xs text-ink-muted">불러오는 중…</p>
            : (() => {
              const all = voucherReasonTable(reasonAll).total;
              const net = all.issued - all.revoked; // 발급(회수 제외) = 보유+사용+만료(+기타)
              const pct = net > 0 ? Math.round((all.used / net) * 100) : 0;
              return (<>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['users', stats.holderCount, '보유 회원', 'text-ink-primary'],
                    ['ticket', net, '발급', 'text-ink-primary'], // 회수분 제외 — 표 아래 안내문이 말한다(오너: 타일 라벨 줄바꿈 금지)
                    ['check-circle', all.held, '잔여 이용권', 'text-emerald-300'],
                  ] as const).map(([icon, val, label, cls]) => (
                    <div key={label} data-stat-tile className="rounded-input border border-border-subtle/60 bg-surface-base/60 p-2.5 text-center">
                      <Icon name={icon} size={14} className="mx-auto text-ink-muted" />
                      <p data-stat-val className={['mt-1 text-2xl font-extrabold tabular-nums leading-none', cls].join(' ')}>{val}</p>
                      <p data-stat-label={label} className="mt-1 whitespace-nowrap text-2xs text-ink-muted">{label}</p>
                    </div>
                  ))}
                </div>
                {net > 0 && (
                  <div>
                    <div className="flex items-baseline justify-between text-2xs text-ink-muted">
                      <span>사용률</span>
                      <span className="font-bold tabular-nums text-accent-300">{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-high">
                      <div className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-300 transition-[width] duration-[var(--dur-panel)]"
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold text-ink-secondary">유형별 발급</p>
                  <div role="group" aria-label="집계 기간" className="mt-1.5 flex flex-wrap items-center gap-1.5 max-md:grid max-md:grid-cols-3">
                    {STAT_RANGES.map(([k, label]) => {
                      const on = statRange === k;
                      return (
                        <button key={k} type="button" aria-pressed={on} onClick={() => { setRangeErr(null); setStatRange(k); }}
                          className={[
                            'min-h-[32px] rounded-full border px-2.5 text-2xs font-bold transition-colors max-md:rounded-chip max-md:px-0', CHIP_HIT,
                            on ? 'border-accent-300/60 bg-accent-500/20 text-accent-100'
                               : 'border-border-default bg-surface-high text-ink-secondary hover:bg-surface-float/60',
                          ].join(' ')}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const rows = statRange === 'all' ? reasonAll : (rangeRows?.key === `${venueId}|${statRange}` ? rangeRows.rows : null);
                    if (!rows) return rangeErr != null
                      ? <div className="mt-2"><LoadErrorCard what="유형별 통계" error={rangeErr} onRetry={reload} compact /></div>
                      : <p className="py-3 text-center text-2xs text-ink-muted">불러오는 중…</p>;
                    const t = voucherReasonTable(rows);
                    const cell = (hideMobile: boolean) => ['py-1.5 text-right', hideMobile ? 'hidden md:table-cell' : ''].join(' ');
                    return (<>
                      <table data-testid="voucher-reason-stats" className="mt-2 w-full table-fixed text-xs tabular-nums">
                        <thead>
                          <tr className="text-2xs text-ink-muted">
                            <th scope="col" className="w-[40%] py-1 text-left font-medium md:w-[34%]">유형</th>
                            {STAT_COLS.map((c) => <th key={c.k} scope="col" className={['py-1 text-right font-medium', c.pc ? 'hidden md:table-cell' : ''].join(' ')}>{c.label}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {t.rows.map((r) => (
                            <tr key={r.reasonKey} className="border-t border-border-subtle/60 text-ink-secondary">
                              <th scope="row" className="truncate py-1.5 text-left font-medium">{voucherReasonLabel(r.reasonKey) || r.reasonKey}</th>
                              {STAT_COLS.map((c) => <td key={c.k} className={cell(c.pc)}>{r[c.k]}</td>)}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border-default font-bold text-ink-primary">
                            <th scope="row" className="py-1.5 text-left">합계</th>
                            {STAT_COLS.map((c) => <td key={c.k} className={cell(c.pc)}>{t.total[c.k]}</td>)}
                          </tr>
                        </tfoot>
                      </table>
                      {!rows.every(reasonStatBalanced) && (
                        <p role="alert" className="mt-1 text-2xs text-danger-light">집계가 맞지 않는 유형이 있습니다(발급 ≠ 보유+사용+만료+회수). 새로고침해 주세요.</p>
                      )}
                    </>);
                  })()}
                  <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">삭제한 미사용 이용권은 집계되지 않습니다. 기간은 발급일(한국 시간) 기준입니다.<br />위 ‘발급’ 타일은 회수한 이용권을 뺀 수입니다.</p>
                </div>
              </>);
            })()}
        </div>
      )}

      {/* #4(오너 지시 2026-08-29) '사용처 TOP' 제거 — 이용권은 매장마다 개별이고, 서버의 사용 경로
          3개(redeem_my_voucher / _by_qr / _by_phone)가 모두 used_venue_id := venue_id 로 고정한다.
          즉 이 목록은 구조적으로 '우리 매장' 한 줄뿐이고, '타 매장' 배지는 절대 켜지지 않는 죽은 분기였다
          (라이브 실측 2026-08-29: store_vouchers 101건 중 used_venue_id <> venue_id 인 행 0건).
          매장 간 사용이라는 없는 개념을 화면이 암시하던 유일한 자리였다.
          사용 건수 자체는 바로 위 '활성/잔여 이용권 + 사용률' 카드가 이미 보여 준다 — 정보 손실 0. */}

      <div className={canIssue && ownerOpen ? '' : 'hidden'}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-ink-secondary">보유자 현황</p>
          <p className="text-2xs text-ink-muted">보유 인원 <b className="text-accent-300 tabular-nums">{holderCount}</b>명 · 보유 갯수 <b className="text-ink-primary tabular-nums">{active.length}</b>개</p>
        </div>
        {holders.length > 0 && (
          <input value={holderQuery} onChange={(e) => setHolderQuery(e.target.value)} placeholder="보유자 검색 (실명·닉네임)" className="input mb-1.5 w-full text-sm" />
        )}
        {loading ? <p className="py-3 text-center text-2xs text-ink-muted">불러오는 중…</p>
          : listErr != null && list.length === 0 ? <LoadErrorCard error={listErr} what="보유자 현황" onRetry={reload} compact />
          : holders.length === 0 ? <p className="py-3 text-center text-2xs text-ink-muted">배포된 이용권이 없습니다.</p>
          : shownHolders.length === 0 ? <p className="py-3 text-center text-2xs text-ink-muted">검색 결과가 없습니다.</p>
          : <ul className="space-y-1.5">
              {shownHolders.map((g) => {
                const open = expanded === g.key;
                return (
                  <li key={g.key} className="rounded-input border border-border-subtle bg-surface-low">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button type="button" onClick={() => setExpanded(open ? null : g.key)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold text-ink-primary">{holderLabel(g)}</p>
                        <p className="text-2xs text-ink-muted">보유 {g.active.length}개{g.used.length > 0 && <> · 사용 {g.used.length}회</>}</p>
                      </button>
                      <span className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-0.5 text-xs font-bold text-accent-300 tabular-nums">{g.active.length}</span>
                      {!g.isStore && <button type="button" onClick={() => setExpanded(open ? null : g.key)} className="btn-ghost shrink-0 px-2 text-2xs text-ink-secondary">{open ? '닫기' : '관리'}</button>}
                      {/* 스윕③(2026-09-19): h-9 w-9(38.25px) 뿐이라 히트박스가 아이콘 그림 크기였다. .hit 로
                          44px 확장 — 형제와의 gap-2(8.5px) 가 오버행((44−38.25)/2≈2.9px) 보다 커서 옆(관리/닫기
                          버튼)을 덮지 않는다(확인함). */}
                      {(isAdmin || g.isStore) && canIssue && <button type="button" disabled={busy} onClick={() => deleteGroup({ name: holderLabel(g), ids: g.active.map((v) => v.id), usedCount: g.used.length })} aria-label="삭제" className="hit flex h-9 w-9 shrink-0 items-center justify-center rounded-input text-ink-muted hover:text-danger-light disabled:opacity-50"><Icon name="trash" size={13} /></button>}
                    </div>
                    {open && !g.isStore && (
                      <div className="border-t border-border-subtle px-3 py-1.5">
                        {/* 회수 — 잘못 보낸 이용권을 되돌리는 유일한 수단(2026-08-29 신설).
                            미사용분에만 걸리고, 사용 완료분은 아래 내역으로 그대로 남는다. */}
                        {canIssue && (
                          <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border-subtle pb-1.5">
                            <p className="min-w-0 flex-1 text-2xs leading-relaxed text-ink-muted">
                              잘못 보냈나요? <b className="text-ink-secondary">미사용 {g.active.length}장</b>을 회수할 수 있어요
                              {g.used.length > 0 && <> · 사용 완료 {g.used.length}장은 내역으로 보존</>}
                            </p>
                            <button type="button" disabled={busy || g.active.length === 0}
                              onClick={() => revokeGroup({ name: holderLabel(g), ids: g.active.map((v) => v.id) })}
                              className="inline-flex h-11 shrink-0 items-center rounded-input border border-danger/40 bg-danger/[0.08] px-3.5 text-2xs font-bold text-danger-deep transition-colors hover:bg-danger/15 disabled:opacity-40 dark:text-danger-light">
                              회수
                            </button>
                          </div>
                        )}
                        {/* B3(V2) — 미사용분에도 유형을 붙인다. 표(유형별 발급)와 같은 키 규칙(voucherReasonKey = 서버 CASE). */}
                        {g.active.length > 0 && (<>
                          <p className="mb-0.5 text-2xs font-bold text-ink-muted">미사용 이용권</p>
                          <ul data-testid="holder-unused" className="mb-1.5 space-y-0.5">
                            {g.active.map((v) => (
                              <li key={v.id} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="min-w-0 flex-1 truncate text-ink-secondary">{v.title}<span className="ml-1 text-ink-muted">· {voucherReasonLabel(voucherReasonKey(v))}</span></span>
                                <span className="shrink-0 tabular-nums text-ink-muted">{v.expiresAt ? `${fmtDateTime(v.expiresAt)}까지` : '무기한'}</span>
                              </li>
                            ))}
                          </ul>
                        </>)}
                        <p className="mb-0.5 text-2xs font-bold text-ink-muted">이 매장 이용내역{g.used.length > 0 ? ' (최근순)' : ''}</p>
                        {g.used.length === 0 ? <p className="py-1 text-[11px] text-ink-muted">사용 내역이 없습니다.</p>
                          : <ul className="space-y-0.5">
                              {g.used.slice().sort((a, b) => (b.usedAt ?? '').localeCompare(a.usedAt ?? '')).map((v) => (
                                <li key={v.id} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="min-w-0 flex-1 truncate text-ink-secondary">{v.title}<span className="ml-1 text-ink-muted">· {voucherReasonLabel(voucherReasonKey(v))}</span></span>
                                  <span className="shrink-0 tabular-nums text-ink-muted">{fmtDateTime(v.usedAt)}</span>
                                </li>
                              ))}
                            </ul>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>}
      </div>
    </div>
  );
}

/** 유효기간 선택지(일). 0 = 무기한.
 *  🔴 오너 2026-09-18: "1일 3일 이런식으로 선택하게". 달력 직접 입력은 없앴다. */
const EXPIRY_PRESETS = [0, 1, 3, 7, 30] as const;
/** KST 오늘 + n일 → 'YYYY-MM-DD'.
 *  ⚠ 기기 로컬 날짜가 아니라 KST 로 센다 — 서버 판정(now() at time zone 'Asia/Seoul')과 기준이 갈리면
 *    해외·시계 오설정 기기에서 하루가 어긋난 표가 발급된다(src/lib/kst.ts 와 같은 이유). */
const addKstDays = (n: number, now: number = Date.now()): string => kstToday(now + n * 86_400_000);

/** 한도 증액 요청 — 업주가 운영자에게 '발행 가능 장수를 늘려 달라' 고 남기는 대기열.
 *
 *  ⚠ 결제가 아니다. 금액·가격·환불 개념이 없고, 승인은 운영자가 무상으로 해 주는 행위다.
 *  ⚠ 서버에 RPC 가 아직 없을 수 있다(마이그레이션 20260918d 적용 전). 그때는 **오류가 아니라
 *    '준비 중'** 으로 말한다 — 배포 순서 때문에 업주 화면에 빨간 오류가 뜨면 안 된다.
 */
function QuotaRequestPanel({ venueId, quota, onGranted }: { venueId: string; quota: number | null; onGranted: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(500);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<VoucherCreditRequest[]>([]);
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    myVoucherCreditRequests(venueId).then((rs) => {
      setMine(rs);
      setPending(rs.some((r) => r.status === 'pending'));
    }).catch(() => { /* 조회 실패는 목록만 비운다 — 요청 자체를 막지 않는다 */ });
  }, [venueId]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await requestVoucherQuota(venueId, amount, reason.trim() || undefined);
      if (r === 'not-deployed') {
        toast.show('한도 증액 요청 기능을 준비 중입니다 — 잠시 뒤 다시 시도해 주세요', 'error');
        return;
      }
      toast.show(`${amount.toLocaleString()}장 증액을 요청했습니다 — 운영자 확인 후 반영됩니다`, 'success');
      setReason('');
      load();
      onGranted();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '요청하지 못했습니다', 'error');
    } finally { setBusy(false); }
  };

  const BADGE: Record<string, { label: string; cls: string }> = {
    pending:  { label: '검토 중', cls: 'bg-amber-500/15 text-amber-400' },
    approved: { label: '반영됨', cls: 'bg-emerald-500/15 text-emerald-300' },
    rejected: { label: '반려', cls: 'bg-surface-float text-ink-muted' },
  };

  return (
    <div className="rounded-input border border-border-subtle bg-surface-low p-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-2xs">
        <span className="font-bold text-ink-secondary">
          한도 증액 요청
          {quota !== null && <span className="ml-1.5 font-normal text-ink-muted">· 지금 잔여 {quota.toLocaleString()}장</span>}
        </span>
        <Icon name="chevron-down" size={12} className={['shrink-0 text-ink-muted transition-transform', open ? 'rotate-180' : ''].join(' ')} />
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {/* 오너 2026-09-19: 라벨과 픽을 한 줄에 우겨넣지 말고 픽은 아랫줄로. '3000장' 삭제,
              요청 상한은 5000장(서버 request_voucher_credit 은 100000까지 받아 — 이 5000은 클라 쪽
              더 낮은 상한이라 서버 쪽은 손댈 게 없다). */}
          <div className="space-y-1.5">
            <span className="block text-2xs font-semibold text-ink-secondary">몇 장이 더 필요하신가요?</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[100, 300, 500, 1000, 5000].map((n) => (
                <button key={n} type="button" aria-pressed={amount === n} onClick={() => setAmount(n)}
                  className={[
                    'min-h-[32px] rounded-full border px-2.5 text-2xs font-bold tabular-nums transition-colors',
                    amount === n ? 'border-accent-300/60 bg-accent-500/20 text-accent-100'
                                 : 'border-border-default bg-surface-high text-ink-secondary hover:bg-surface-float/60',
                  ].join(' ')}>
                  {n.toLocaleString()}장
                </button>
              ))}
            </div>
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
            placeholder="필요한 이유 (선택) — 예) 주말 시리즈 3일 · 예상 참가 200명"
            className="input w-full text-sm" aria-label="증액이 필요한 이유" />
          <button type="button" disabled={busy || pending} onClick={submit}
            className="btn-primary w-full text-xs disabled:opacity-50">
            {busy ? '보내는 중…' : pending ? '이미 검토 중인 요청이 있습니다' : `${amount.toLocaleString()}장 증액 요청하기`}
          </button>
          {/* 🔴 비용이 없다는 사실을 **화면에** 적는다 — 업주가 '돈이 드나?' 로 읽으면 요청 자체를 안 한다. */}
          <p className="text-2xs leading-relaxed text-ink-muted">
            <b className="text-ink-secondary">비용은 없습니다.</b> 운영자가 확인한 뒤 발행 가능 장수만 늘려 드립니다.
            매장이용권은 금전적 가치가 없으며, 구매·충전 개념이 아닙니다.
          </p>

          {mine.length > 0 && (
            <ul className="space-y-1 border-t border-border-subtle pt-2">
              {mine.slice(0, 5).map((r) => {
                const b = BADGE[r.status] ?? BADGE.pending;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-1.5 text-2xs">
                    <span className={`shrink-0 rounded-badge px-1.5 py-0.5 font-bold ${b.cls}`}>{b.label}</span>
                    <span className="font-bold tabular-nums text-ink-secondary">{r.amount.toLocaleString()}장</span>
                    <span className="tabular-nums text-ink-muted">{r.createdAt.slice(0, 10)}</span>
                    {r.adminNote && <span className="w-full break-words text-ink-muted">운영자: {r.adminNote}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function VoucherManageModal({ open, onClose, venueId, prefillReceiver, canIssue }: { open: boolean; onClose: () => void; venueId: string; prefillReceiver?: string; canIssue?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title="매장이용권 관리" maxWidth="md" variant="sheet">
      <div className="p-4"><VoucherManagePanel venueId={venueId} prefillReceiver={prefillReceiver} canIssue={canIssue} /></div>
    </Modal>
  );
}

/** 가속 스테퍼 버튼 — 꾹 누르면 350ms→점점 빨라져 40ms 간격(iOS 타이머 패턴). 연타 불필요 */
function StepBtn({ label, onStep }: { label: string; onStep: () => void }) {
  // 리렌더에도 타이머가 살아있도록 ref — pointerup을 놓쳐도 leave에서 정지
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const run = (delay: number) => {
    onStep();
    timer.current = setTimeout(() => run(Math.max(40, delay * 0.82)), delay);
  };
  return (
    <button type="button" aria-label={label === '+' ? '증가' : '감소'}
      onPointerDown={() => { stop(); run(350); }}
      onPointerUp={stop} onPointerLeave={stop} onContextMenu={(e) => e.preventDefault()}
      className="w-9 shrink-0 rounded-input border border-border-default bg-surface-high text-base font-bold text-ink-secondary hover:text-ink-primary active:bg-surface-float select-none touch-none">
      {label}
    </button>
  );
}
