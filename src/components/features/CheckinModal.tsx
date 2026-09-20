// src/components/features/CheckinModal.tsx — 업주/직원용: 체크인 QR 표시 + 오늘 체크인 명단(실시간).
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { listVenueCheckins, subscribeCheckins, checkinUrl, type Checkin } from '../../api/checkins';
import { getVenueVisitorStats } from '../../api/crm';
import { issueVoucher, VOUCHER_REASONS } from '../../api/vouchers';
import { isStaleResponse, type RequestStamp } from '../../lib/staleResponse';

/**
 * 🔴 2026-09-18 오너: "홈 화면에 출석체크를 매장이용권도 추가해줘 어차피 매장이용권을 보낼 때
 * QR로 보낼텐데 그럼 출석체크하고 같으니까 ... 닉네임으로 보낼 수 있게 ...
 * 하단에 '매장 업주에게만 가능' 이라는 문구 필수 법적인 문제 때문에"
 *
 * 여기가 그 둘이 실제로 만나는 자리다. 오늘 출석한 손님 명단은 **이미 user_id 를 들고 있어서**
 * 닉네임을 다시 검색할 필요가 없다 — 그 자리에서 바로 보낸다(종전엔 이 명단을 보고
 * 이용권 모달을 따로 열어 같은 사람을 닉네임으로 다시 찾아야 했다).
 *
 * ⚠ 권한은 화면이 아니라 **서버가** 막는다. `issue_voucher` 가 첫 줄에서 `can_manage_pos`(소유자·
 *   승인 공동운영자·운영자)를 보고, 그다음 `venues.voucher_issue_approved`(운영자 승인),
 *   받는 사람 `is_ci_verified`(본인인증), 발급 한도, 킬스위치를 차례로 본다.
 *   아래 `canIssue` 는 **버튼을 그릴지 말지**일 뿐이고 권한이 아니다.
 */
/** Q3(2026-09-20) — 발급 직전 재검사(순수 함수, 렌더 없이 단위 테스트). `c` 는 늦게 도착한 다른
 *  매장의 체크인 행일 수 있다 — 지금 보고 있는 venueId 와 같아야 하고, 권한·수신자·양의 정수 장수가
 *  전부 있어야 '보낼 수 있다' 다. 하나라도 어긋나면 호출부는 issueVoucher 를 아예 부르지 않는다(변이 0회). */
// 계약 테스트가 이 순수 가드를 직접 부른다. 별도 파일로 빼면 "발급 직전 재검사" 가 화면에서
//   한 칸 멀어져 다음 사람이 호출을 빠뜨리기 쉽다 — `ToolsPanel.tsx` 도 같은 이유로 같은 예외를 쓴다.
//   ⚠ 이 disable 주석은 **바로 다음 줄**에만 걸린다. 사이에 주석을 끼우면 무효다(2026-09-21에 실제로 겪었다).
// eslint-disable-next-line react-refresh/only-export-components
export function canSendVoucher(c: Pick<Checkin, 'venueId' | 'userId'>, venueId: string, canIssue: boolean, count: number): boolean {
  return c.venueId === venueId && canIssue && !!c.userId && Number.isInteger(count) && count > 0;
}

export default function CheckinModal({ open, onClose, venueId, venueName, canIssue = false }: { open: boolean; onClose: () => void; venueId: string; venueName?: string; canIssue?: boolean }) {
  const toast = useToast();
  /** 지금 이용권을 보낼 손님(체크인 행 id). null 이면 아무 행도 안 펼쳐져 있다. */
  const [sendTo, setSendTo] = useState<string | null>(null);
  const [customCount, setCustomCount] = useState('');
  /** Q2(2026-09-20) — 최종 확인 대기 중인 발급(행 + 장수). null 이면 확인 단계가 아니다. */
  const [confirm, setConfirm] = useState<{ c: Checkin; count: number } | null>(null);
  const [sendBusy, setSendBusy] = useState(false);

  // Q3(2026-09-20) — 관리자가 이 모달을 연 채로 '관리할 매장' 을 A→B 로 바꿔도 이 컴포넌트는
  //   리마운트되지 않는다(어디에도 key={venueId} 가 없다) — venueId prop 만 바뀐다. 그 사이 도착하는
  //   A 매장 응답이 B 화면을 덮지 않게 lib/staleResponse 의 표준 가드(owner=venueId)를 쓴다
  //   (VoucherManageModal 의 lib/venueVoucherLoad 와 같은 계약 — 새 패턴을 만들지 않는다).
  // ⚠ reload() 전용(reqRef) 과 send() 전용(mountGenRef) 을 **분리**한다 — 하나를 같이 쓰면 send() 가
  //   불일치를 만나 reload() 를 부를 때 그 reload() 자신의 seq 증가가 send() 의 '구세대' 판정을
  //   오염시켜(실제 매장 전환이 없었는데도) sendBusy 가 영원히 true 로 남는다(2026-09-20 직접 재현).
  const reqRef = useRef<RequestStamp<string>>({ seq: 0, owner: '' });
  const mountGenRef = useRef<RequestStamp<string>>({ seq: 0, owner: '' });

  const [list, setList] = useState<Checkin[]>([]);
  // 🔴 2026-09-20 (R1-3) — '조회 실패' 와 '진짜 0명' 을 구별한다. 종전엔 `.catch(() => {})` 로 오류를
  //   삼켜 실패해도 '아직 출석한 손님이 없습니다' 가 떴다 — 업주는 아무도 안 온 줄 안다.
  const [listErr, setListErr] = useState(false);
  const [visits, setVisits] = useState<Record<string, number>>({}); // user_id→누적 방문횟수(CRM 단골/첫방문 배지)
  // #15 로컬 생성(외부 api.qrserver.com 의존 제거 — 가용성·프라이버시)
  // 🔴 Q5(2026-09-21) — 이미지에 **어느 매장 것인지**를 함께 들고 다닌다. 종전에는 `.then(setQr)` 뿐이라
  //   관리자가 매장을 A→B 로 바꾸면 ① 전환 직후 A QR 이 B 라벨 아래 남고 ② 늦게 끝난 A 의 Promise 가
  //   B 이미지를 덮을 수 있었다(이 컴포넌트는 key 가 없어 리마운트되지 않는다 — Q3 주석 참고).
  //   손님이 그걸 찍으면 **다른 매장에 출석**한다. Q3 의 목록 가드는 이 이미지 상태를 보지 않는다.
  const [qr, setQr] = useState<{ venueId: string; src: string } | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setQr(null); setQrFailed(false); // 매장이 바뀌는 즉시 이전 매장 이미지를 감춘다
    QRCode.toDataURL(checkinUrl(venueId), { width: 240, margin: 2 })
      .then((src) => { if (alive) setQr({ venueId, src }); })
      .catch(() => { if (alive) setQrFailed(true); });
    return () => { alive = false; }; // 늦게 도착한 앞 매장 응답은 화면에 반영하지 않는다
  }, [venueId]);
  /** 지금 매장의 것일 때만 내준다 — 렌더 단계의 2차 방어. */
  const qrSrc = qr && qr.venueId === venueId ? qr.src : '';

  // Q3 — 모달 닫기·매장 변경 즉시: 출석 목록·방문 통계·선택 수신자·오류를 비우고 진행 중인 앞 매장
  //   요청을 전부 낡은 것으로 만든다(seq 증가). 아래 reload() 의 응답 격리와 별개로, 한 프레임도
  //   A 의 데이터가 B 화면에 남으면 안 된다.
  useEffect(() => {
    reqRef.current = { seq: reqRef.current.seq + 1, owner: venueId };
    mountGenRef.current = { seq: mountGenRef.current.seq + 1, owner: venueId };
    setList([]); setListErr(false); setVisits({});
    setSendTo(null); setConfirm(null); setCustomCount(''); setSendBusy(false);
  }, [open, venueId]);

  const reload = () => {
    const stamp: RequestStamp<string> = { seq: reqRef.current.seq + 1, owner: venueId };
    reqRef.current = stamp;
    const stale = () => isStaleResponse(stamp, reqRef.current);
    const s = new Date(); s.setHours(0, 0, 0, 0);
    listVenueCheckins(venueId, s.toISOString())
      .then((r) => { if (stale()) return; setList(r); setListErr(false); })
      .catch(() => { if (stale()) return; setListErr(true); });
    getVenueVisitorStats(venueId).then((v) => { if (stale()) return; setVisits(v); }).catch(() => {});
  };
  useEffect(() => {
    if (!open) return;
    reload();
    return subscribeCheckins(venueId, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, venueId]);

  const send = async (c: Checkin, count: number) => {
    // Q3 — 발급 직전 재검사: 매장·권한·수신자·장수가 지금도 유효해야 한다. 하나라도 어긋나면 변이 0회.
    if (!canSendVoucher(c, venueId, canIssue, count)) { setConfirm(null); return; }
    const gen = mountGenRef.current; // 지금 세대 — 응답 도착 시 세대가 바뀌었으면(매장 전환·모달 닫기) 성공·실패 모두 화면에 반영하지 않는다.
    //   ⚠ reqRef 가 아니라 mountGenRef 를 쓴다 — 아래 mismatch 분기의 reload() 가 reqRef 를 또 bump 하는데,
    //   그걸로 이 send() 를 stale 판정하면 매장 전환이 없었는데도 finally 의 setSendBusy(false) 가
    //   영영 실행되지 않는다(위 ref 선언부 주석 참고).
    setSendBusy(true);
    try {
      // 발급 근거 'visit' — 이 경로는 정의상 '오늘 방문한 손님' 이다(서버가 근거를 기록·검증한다).
      const issued = await issueVoucher(venueId, { title: '매장이용권', count, holderUserId: c.userId, holderName: c.displayName ?? undefined, reason: 'visit' });
      if (isStaleResponse(gen, mountGenRef.current)) return; // 구세대 성공 — 이미 다른 매장 화면이라 반영하지 않는다
      if (issued === count) {
        toast.show(`${c.displayName ?? '회원'}님께 매장이용권 ${count}장을 보냈습니다`, 'success');
      } else {
        // Q2 — 요청 장수와 실제 발급 수량이 다르면 자동 재시도하지 않는다(이미 서버에서 발급이 일어난
        //   뒤일 수 있어, 다시 부르면 중복 발급이 된다). 목록을 다시 불러 실제 상태를 보여준다.
        toast.show(`발급 결과 확인 필요 — 요청 ${count}장 · 실제 ${issued}장. 목록을 다시 확인하세요`, 'error');
        reload();
      }
      setSendTo(null); setConfirm(null); setCustomCount('');
    } catch (e) {
      // 서버 거절 문구를 그대로 보여 준다 — '승인 전 매장'·'한도 부족'·'본인인증 안 된 손님' 이
      //   각각 다른 조치를 요구하는데 '실패' 로 뭉개면 업주가 무엇을 해야 할지 알 수 없다.
      if (!isStaleResponse(gen, mountGenRef.current)) toast.show(e instanceof Error ? e.message : '보내지 못했습니다', 'error');
    } finally {
      if (!isStaleResponse(gen, mountGenRef.current)) setSendBusy(false);
    }
  };

  const copy = async () => { try { await navigator.clipboard.writeText(checkinUrl(venueId)); toast.show('출석 링크를 복사했습니다', 'success'); } catch { /* noop */ } };
  const fmt = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const openPicker = (id: string) => { setSendTo((v) => (v === id ? null : id)); setConfirm(null); setCustomCount(''); };
  // Q2 — 방문 감사 사유 라벨·힌트를 정본(api/vouchers.ts VOUCHER_REASONS)에서 그대로 읽는다(복제 금지).
  const visitReason = VOUCHER_REASONS.find((r) => r.value === 'visit');

  return (
    <Modal open={open} onClose={onClose} title="예약·출석" maxWidth="md" variant="sheet" dragToClose>
      <div className="space-y-3 p-4">
        <div className="flex flex-col items-center gap-2 rounded-aura border card-aura p-4">
          {/* Q5 — `qrSrc` 는 지금 매장의 것일 때만 값이 있다. 실패는 스켈레톤으로 위장하지 않는다
              (영원히 도는 스켈레톤은 업주를 무한정 기다리게 만든다 — R1-3 과 같은 이유). */}
          {qrSrc
            ? <img src={qrSrc} alt="출석 QR" width={200} height={200} className="rounded-lg bg-white p-2" />
            : qrFailed
              ? <div className="flex h-[200px] w-[200px] items-center justify-center rounded-lg border border-border-subtle bg-surface-low text-2xs text-ink-muted">QR 을 만들지 못했어요</div>
              : <div className="h-[200px] w-[200px] animate-pulse rounded-lg bg-ink-primary/10" aria-label="QR 생성 중" />}
          <p className="text-center text-2xs text-ink-muted"><b className="text-accent-300">고정 QR</b> · 손님이 스캔하면 <b className="text-ink-secondary">{venueName ?? '우리 매장'}</b>에 출석 처리됩니다.<br />로그인 회원만 · 4시간 내 중복 방지. 손님이 매장이용권을 사용하면 방문이 자동 기록됩니다.</p>
          <button type="button" onClick={copy} className="btn-ghost px-3 text-2xs">출석 링크 복사</button>
        </div>
        <div>
          <p className="mb-1 text-2xs font-bold text-ink-secondary">오늘 방문 {listErr ? '—' : `${list.length}명`}</p>
          {listErr ? (
            <p className="py-3 text-center text-2xs text-danger-light">출석 명단을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>
          ) : list.length === 0 ? <p className="py-3 text-center text-2xs text-ink-muted">아직 출석한 손님이 없습니다.</p>
            : <ul className="space-y-1">{list.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between rounded-input border border-border-subtle bg-surface-low px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-primary">{c.displayName ?? '회원'}</span>
                {(() => {
                  const v = visits[c.userId] ?? 0;
                  const label = v >= 5 ? `단골 ${v}회` : v <= 1 ? '첫 방문' : `${v}회`;
                  const cls = v >= 5 ? 'bg-accent-300/15 text-accent-300' : v <= 1 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-surface-float text-ink-secondary';
                  return <span className={`mr-2 shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold ${cls}`}>{label}</span>;
                })()}
                <span className="shrink-0 text-2xs text-ink-muted tabular-nums">{fmt(c.createdAt)}</span>
                {canIssue && (
                  <button type="button" onClick={() => openPicker(c.id)}
                    aria-expanded={sendTo === c.id}
                    className="ml-2 min-h-[44px] shrink-0 whitespace-nowrap rounded-input border border-accent-400/40 px-2.5 text-2xs font-bold text-accent-200 hover:bg-accent-500/10">
                    {sendTo === c.id ? '닫기' : '이용권'}
                  </button>
                )}
                {/* Q2 — 1단계: 장수 선택(버튼은 선택만, 발급 RPC 를 부르지 않는다) 또는 직접 입력 */}
                {canIssue && sendTo === c.id && !(confirm && confirm.c.id === c.id) && (
                  <span className="mt-1.5 flex w-full flex-wrap items-center gap-1.5 border-t border-border-subtle pt-1.5">
                    <span className="text-2xs text-ink-muted">몇 장 보낼까요?</span>
                    {[1, 2, 3, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setConfirm({ c, count: n })}
                        className="min-h-[44px] rounded-input border border-border-default bg-surface-high px-2.5 text-2xs font-bold text-ink-secondary hover:bg-surface-float/60">
                        {n}장
                      </button>
                    ))}
                    <span className="flex items-center gap-1">
                      <input type="number" inputMode="numeric" min={1} step={1} value={customCount}
                        onChange={(e) => setCustomCount(e.target.value)} placeholder="직접 입력" aria-label="직접 입력 장수"
                        className="input h-[44px] w-16 text-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                      <button type="button" disabled={!(Number.isInteger(Number(customCount)) && Number(customCount) > 0)}
                        onClick={() => { const n = Math.trunc(Number(customCount)); if (n > 0) setConfirm({ c, count: n }); }}
                        className="min-h-[44px] rounded-input border border-accent-400/40 px-2.5 text-2xs font-bold text-accent-200 disabled:opacity-40">
                        적용
                      </button>
                    </span>
                  </span>
                )}
                {/* Q2 — 2단계: 매장/받는 회원/장수/사유/만료 최종 확인. 실행 전 별도 확인, 취소 가능 —
                    확인 내용이 바뀌거나(다른 장수 재선택) 매장이 바뀌면(위 clear effect) 이 단계 자체가 사라진다. */}
                {canIssue && confirm && confirm.c.id === c.id && (
                  <div className="mt-1.5 flex w-full flex-col gap-1 rounded-input border border-accent-400/40 bg-accent-300/[0.06] p-2 text-2xs">
                    <p className="font-bold text-ink-secondary">발급 확인</p>
                    <p>매장: <b className="text-ink-primary">{venueName ?? '우리 매장'}</b></p>
                    <p>받는 회원: <b className="text-ink-primary">{c.displayName ?? '회원'}</b> · ID …{c.userId.slice(-6)}</p>
                    <p>장수: <b className="text-ink-primary">{confirm.count}장</b></p>
                    <p>사유: <b className="text-ink-primary">{visitReason?.label ?? '방문 감사'}</b>{visitReason?.hint ? ` (${visitReason.hint})` : ''}</p>
                    <p>만료: <b className="text-ink-primary">무기한</b></p>
                    <div className="mt-1 flex gap-1.5">
                      <button type="button" onClick={() => setConfirm(null)}
                        className="min-h-[44px] flex-1 rounded-input border border-border-default bg-surface-high text-2xs font-bold text-ink-secondary">취소</button>
                      <button type="button" disabled={sendBusy} onClick={() => send(c, confirm.count)}
                        className="min-h-[44px] flex-1 rounded-input bg-accent-300 text-2xs font-bold text-white disabled:opacity-50">
                        {sendBusy ? '보내는 중…' : `${confirm.count}장 발급`}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}</ul>}
          {/* 🔴 법적 고지 — 오너 지시로 **필수**다. 지우지 마라.
              매장이용권은 매장이 자기 손님에게 주는 것이고, 유저끼리 주고받는 물건이 아니다.
              그 사실을 발급 화면에 적어 두는 것이 이 문구의 목적이다. */}
          {canIssue && (
            <p className="mt-2 rounded-input border border-border-subtle bg-surface-high/40 p-2 text-2xs leading-relaxed text-ink-muted">
              {/* 🔴 2026-09-20 — '인증된 매장 업주에게만' 은 **서버와 어긋난 문구**였다.
                  라이브 `issue_voucher` 는 `can_manage_pos` 를 쓰고 그 함수는
                  admin ∪ venues.owner_id ∪ venue_owners(status='approved') 다 — **승인 공동운영자를 포함**한다
                  (pg_proc 직접 조회, 2026-09-20). 게다가 같은 함수가 `venues.voucher_issue_approved` 도 요구한다.
                  오너 결정(2026-09-20): "공동운영자에게 발급 줘. UI도 이에 맞춰서." → 문구를 서버에 맞춘다.
                  ⚠ 아래 '손님끼리 주고받을 수 없다 / 금전적 가치 없음' 은 **법적 고지라 지우지 마라.** */}
              매장이용권 발급은 <b className="text-ink-secondary">운영자 승인을 받은 매장의 업주·공동운영자만 가능</b>합니다.
              손님끼리 주고받을 수 없고, <b className="text-ink-secondary">금전적 가치가 없습니다</b>.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
