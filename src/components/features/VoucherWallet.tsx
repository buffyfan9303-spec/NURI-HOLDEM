// src/components/features/VoucherWallet.tsx
// 매장이용권 지갑 — 보유(매장별 그룹) · 사용(회수 3경로) · 사용 내역의 **단일 정본**.
//
// 왜 컴포넌트로 뽑았나(2026-09-05, 오너 지시 "헤더 이용권 아이콘에도 이용권 내역과 관련 기능을"):
//   같은 지갑이 두 곳에 필요해졌다 — 내 정보(대시보드)와 헤더 [이용권 · 출석] 시트.
//   화면마다 목록을 손으로 다시 그리면 만료 D-day·인증 게이트·매장별 그룹핑·사용 내역이 반드시 갈라진다
//   (하루 전 그 중복을 만들었다가 되돌린 이력이 MyVoucherSheet 머리말에 남아 있다).
//   그래서 **데이터 로드부터 사용 시트까지 통째로** 이 파일이 갖고, 두 화면은 자리만 내준다.
//   부모는 vouchers 를 내려주지 않는다 — 각자 자기 것을 읽으므로 어느 진입점으로 들어와도 같은 값이다.
//
// ⚠ 유저↔유저 양도(전송)는 존재하지 않는다(§12-A 오너 결정 · 20260826b 마이그레이션 VCH-1 ①).
//   '전송'이라 부르는 3경로는 전부 **발급 매장으로의 회수**다: ① 바로 전송 ② 매장 QR ③ 매장 업주 전화번호.
//   findUserByPhone 은 '받는 업주 확인'이지 유저 간 전송이 아니다 — 헷갈리면 관광진흥법 지침 위반이 된다.
//
// ⚠ 전면 오버레이(RedeemSheet z-[70] · 차감 완료 z-[80])는 portal 을 쓰지 않는다.
//   시트 안에서 쓰일 때 Modal 의 포커스 트랩이 '내용 바깥'의 포커스를 도로 뺏어가므로(전화번호 입력 불가),
//   DOM 상 Modal 내용 안에 있어야 한다. fixed 는 조상에 transform 이 남지 않는 한 뷰포트 기준이고
//   (spring.ts 가 복귀 시 인라인 transform 을 지운다), Modal 껍데기가 이미 z-[60] 이라 탭바 위로 올라간다.
import { useCallback, useEffect, useState } from 'react';
import Icon from '../atoms/Icon';
import EmptyState from '../atoms/EmptyState';
import { SectionHead as Head } from '../atoms/SectionHeader';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useIdentityEnabled } from '../../lib/identityFlag'; // 본인인증·매장이용권 통합 킬스위치(2026-08-29)
import { stripVenuePrefix, voucherGroupLabel, voucherLineLabel } from '../../lib/voucherLabel'; // "어느 매장이 준 것인가" 표기 규칙(오너 지시 #19)
import type { Html5Qrcode } from 'html5-qrcode'; // 타입만(런타임 번들 제외) — 실제 라이브러리는 스캐너 열 때 동적 로드
import {
  listMyVouchers,
  redeemMyVoucher, redeemMyVoucherByQr, redeemMyVoucherByPhone,
  findUserByPhone,
  type Voucher, type TransferTarget,
} from '../../api/vouchers';

// venueName 이 nullable 인 이유: 매장명을 **모르는 상태**와 '기타 매장'이라는 이름을 구분해야
// 머리글이 '기타 매장 매장이용권' 같은 가짜 매장명을 만들어 내지 않는다(voucherGroupLabel 참조).
interface Stack { venueId: string; venueName: string | null; title: string; ids: string[]; expiries: (string | null)[] }

function parseVenueId(text: string): string | null {
  const t = text.trim();
  if (t.startsWith('NURIV-VENUE:')) return t.slice('NURIV-VENUE:'.length).trim();
  try { const u = new URL(t); const c = u.searchParams.get('checkin'); if (c) return c; } catch { /* not a url */ }
  if (/^[0-9a-fA-F-]{36}$/.test(t)) return t;
  return null;
}

const fmtDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

/** 매장 그룹 머리글 클래스 — 링크(button)와 평문(p) 두 껍데기가 같은 규격을 쓰도록 한 곳에 둔다. */
const GROUP_HEAD_CLS = 'mb-2 flex items-start gap-1.5 text-sm font-bold text-ink-primary';

export default function VoucherWallet({ onNeedVerify, onVenue, compact = false }: {
  /** 본인인증 화면으로 — 대시보드는 보안 탭, 시트는 내 정보를 연다. **안 넘기면 인증 CTA 를 그리지 않는다**(무반응 클릭 금지) */
  onNeedVerify?: () => void;
  /** 발급 매장으로 — 사슬 끝에서 막다른 길을 만들지 않는다. 안 넘기면 머리글은 평문 그대로다 */
  onVenue?: (venueId: string) => void;
  /** 시트처럼 좁은 면에서 쓸 때 자체 세로 리듬을 갖는다(대시보드에서는 페이지의 space-y 를 그대로 물려받아야 하므로 fragment) */
  compact?: boolean;
}) {
  const { user } = useAuth();
  const idOn = useIdentityEnabled();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  // 로그인 상태면 **불러오는 중**으로 시작한다. false 로 두면 재열림 첫 프레임이 빈 상태 경로로
  // 떨어져 "보유한 매장이용권이 없습니다"(사실과 다름)를 그린 뒤 목록이 도착하며 아래가 밀린다
  // — CLAUDE.md 의 '주르륵 밀림 = CLS' 금지에 걸린다(2026-09-05 검증에서 잡힘).
  const [loading, setLoading] = useState(() => Boolean(user?.id));
  const [redeem, setRedeem] = useState<Stack | null>(null);
  // 차감 성공 전면 확인 화면(Phase 15-1) — 3초 자동 닫힘.
  const [redeemDone, setRedeemDone] = useState<{ title: string; venueName: string | null; remain: number } | null>(null);

  const uid = user?.id ?? null;
  const load = useCallback(() => {
    // 킬스위치 OFF — 지갑을 안 그리므로 조회도 하지 않는다(무료 egress 예산). 레코드는 그대로 남아 있다.
    if (!uid || !idOn) { setVouchers([]); return; }
    setLoading(true);
    listMyVouchers().then(setVouchers).catch(() => {}).finally(() => setLoading(false));
  }, [uid, idOn]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!redeemDone) return;
    const t = setTimeout(() => setRedeemDone(null), 3000);
    return () => clearTimeout(t);
  }, [redeemDone]);

  if (!idOn) return null;

  // 만료일 지난 이용권은 status 가 active 여도 사용 불가(서버 가드) — 지갑에서도 제외한다.
  const nowMs = Date.now();
  const active = vouchers.filter((v) => v.status === 'active' && (!v.expiresAt || new Date(v.expiresAt).getTime() > nowMs));
  // 이용권 사용 내역(Phase 15-1 '모든 차감은 즉시 이 리스트에') — used 상태를 시간 역순으로.
  const usedHistory = vouchers
    .filter((v) => v.status === 'used' && v.usedAt)
    .sort((a, b) => new Date(b.usedAt!).getTime() - new Date(a.usedAt!).getTime())
    .slice(0, 20);
  // 매장별 묶음 — 이용권은 '매장마다 개별'이라(오너 지시 #4) 발급 매장이 곧 이용권의 정체성이다.
  // 묶어 두면 매장명을 그룹 머리글에서 한 번만 크게 말하면 되고(375px 에서 줄마다 반복하면 제목이 밀린다),
  // 서로 다른 매장 이용권을 손님이 한 덩어리로 착각하지 않는다.
  const venueMap = new Map<string, { name: string | null; stacks: Map<string, Stack> }>();
  for (const v of active) {
    const vid = v.venueId; const vname = v.venueName;
    if (!venueMap.has(vid)) venueMap.set(vid, { name: vname, stacks: new Map() });
    const g = venueMap.get(vid)!;
    if (!g.stacks.has(v.title)) g.stacks.set(v.title, { venueId: vid, venueName: vname, title: v.title, ids: [], expiries: [] });
    // 임박한 만료가 먼저 소진되도록 만료 오름차순 정렬 삽입(무기한은 뒤)
    const st = g.stacks.get(v.title)!;
    const expMs = v.expiresAt ? new Date(v.expiresAt).getTime() : Infinity;
    let ins = st.ids.length;
    for (let i = 0; i < st.ids.length; i++) {
      const cur = st.expiries[i] ? new Date(st.expiries[i]!).getTime() : Infinity;
      if (expMs < cur) { ins = i; break; }
    }
    st.ids.splice(ins, 0, v.id);
    st.expiries.splice(ins, 0, v.expiresAt);
  }
  const venueGroups = [...venueMap.entries()]
    .map(([vid, g]) => ({ vid, name: g.name, label: voucherGroupLabel(g.name), count: [...g.stacks.values()].reduce((n, s) => n + s.ids.length, 0), stacks: [...g.stacks.values()] }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));

  const body = (
    <>
      <section className="space-y-2">
        <Head icon="ticket" tone="cyan" title="내 매장이용권" count={active.length} unit="장" />
        {/* 본인인증 게이트를 '사용 시점'이 아니라 '지갑을 여는 시점'에 알린다.
            왜: 서버 트리거(trg_voucher_verified)가 status='used' 전이를 막는데,
            예전엔 그 거절이 접수대 앞에서 토스트로만 떴다 — 손님은 이미 매장에 서 있고,
            업주는 왜 안 되는지 모른다. 인증 전에 이미 받아 둔 이용권도 사용만 막히므로
            (2026-08-27 게이트 도입 이전 발급분이 실제로 남아 있다) 여기서 미리 짚는다. */}
        {!loading && !user?.verified && active.length > 0 && (
          <div className="mb-2 rounded-aura border border-danger/40 bg-danger/[0.08] p-3">
            <p className="flex items-start gap-1.5 text-xs font-bold text-danger-deep dark:text-danger-light">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              본인인증을 완료해야 이용권을 사용할 수 있어요
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">
              보유하신 {active.length}장은 그대로 남아 있습니다 — 인증만 마치면 바로 사용할 수 있어요.
              매장에 도착하기 전에 <b className="text-ink-primary">프로필 &gt; 본인인증</b>을 먼저 끝내 주세요.
            </p>
            {onNeedVerify && (
              <button type="button" onClick={onNeedVerify}
                className="btn-primary mt-2 h-10 w-full text-sm">프로필에서 본인인증하기</button>
            )}
          </div>
        )}
        {loading ? (
            /* 실제 매장 카드와 같은 높이로 자리를 예약한다. 한 줄짜리 '불러오는 중…' 은
               목록이 도착하는 순간 아래를 밀어 올린다 — 이 지갑이 고치려던 그 CLS 다. */
            <div className="space-y-3" aria-busy="true">
              {[0, 1].map((i) => <div key={i} className="skeleton h-[104px] rounded-aura" />)}
            </div>
          )
          : venueGroups.length === 0 ? <div className="rounded-aura border card-aura"><EmptyState icon={<Icon name="ticket" />} title="보유한 매장이용권이 없습니다." /></div>
            : <div className="space-y-3">{venueGroups.map((g) => {
              // 머리글이 '{매장명} 매장이용권'을 통째로 말한다(오너 지시 #19).
              // truncate 가 아니라 줄바꿈인 이유: 375px 에서 긴 매장명을 한 줄로 자르면
              // 정체성(매장명)이 잘려 나간다 — 잘라야 할 것은 매장명이 아니다.
              // break-keep 은 한글을 어절 단위로 접어 낱글자가 갈라지는 절단을 막는다.
              const head = (
                <>
                  <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent-300" />
                  <span className="min-w-0 flex-1 break-keep text-left [overflow-wrap:anywhere]">{g.label}</span>
                  <span className="mt-0.5 shrink-0 text-2xs font-bold tabular-nums text-accent-300">{g.count}장</span>
                </>
              );
              return (
                <div key={g.vid} className="card-glow-hover rounded-aura border card-aura p-3">
                  {onVenue
                    ? <button type="button" onClick={() => onVenue(g.vid)}
                        className={`${GROUP_HEAD_CLS} w-full rounded-input transition-colors duration-[var(--dur-fast)] hover:bg-surface-high/50`}>{head}</button>
                    : <p className={GROUP_HEAD_CLS}>{head}</p>}
                  <ul className="space-y-1.5">{g.stacks.map((s) => (
                    <li key={s.title} className="flex items-center gap-2 rounded-input border border-accent-400/40 bg-accent-300/[0.05] px-3 py-2 transition-colors duration-[var(--dur-fast)] hover:bg-accent-300/[0.10] hover:border-accent-400/60">
                      <Icon name="ticket" size={18} className="shrink-0 text-accent-300" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">
                        {/* 머리글이 이미 매장명을 말했다. 업주가 제목에 손으로 박아 둔 매장명까지 그대로 두면
                            '로티아레나 로티아레나 매장이용권'이 된다(라이브 101장 중 100장이 그 형태). */}
                        {stripVenuePrefix(s.title, g.name)} <span className="text-2xs text-ink-muted">×{s.ids.length}</span>
                        {s.expiries[0] && (() => {
                          const d = Math.ceil((new Date(s.expiries[0]!).getTime() - Date.now()) / 86400000);
                          return (
                            <span className={['ml-1.5 align-middle text-2xs font-bold tabular-nums', d <= 7 ? 'text-danger-light' : 'text-ink-muted'].join(' ')}>
                              ~{new Date(s.expiries[0]!).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}{d <= 7 ? ` · D-${Math.max(0, d)}` : ''}
                            </span>
                          );
                        })()}
                      </span>
                      {/* 미인증이면 열지 않는다 — 열어 봐야 '되돌릴 수 없습니다' 확인 뒤 서버에서 막힌다 */}
                      <button type="button" disabled={!user?.verified} onClick={() => setRedeem(s)}
                        title={user?.verified ? undefined : '본인인증 후 사용할 수 있어요. 프로필에서 인증을 완료해 주세요'}
                        className="btn-primary h-9 shrink-0 px-3 text-2xs disabled:cursor-not-allowed disabled:opacity-40">
                        {user?.verified ? '사용하기' : '인증 필요'}
                      </button>
                    </li>
                  ))}</ul>
                </div>
              );
            })}</div>}
      </section>

      {/* 이용권 사용 내역(Phase 15-1) — '모든 차감은 즉시 이 리스트에 나타나야 한다'.
          와홀덤 '사용 내역 자동 기록'과 같은 신뢰 장치: 언제·어디서·무엇이 차감됐는지. */}
      {usedHistory.length > 0 && (
        <section className="space-y-2">
          <Head icon="ticket" tone="cyan" title="이용권 사용 내역" count={usedHistory.length} unit="건" />
          <ul className="space-y-1">{usedHistory.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-input border card-aura-sub px-3 py-2 text-2xs transition-colors duration-[var(--dur-fast)] hover:bg-surface-high/50">
              <span className="shrink-0 text-ink-muted tabular-nums">{fmtDate(v.usedAt!)}</span>
              {/* #4: 이용권은 발급 매장에서만 쓸 수 있다(서버 redeem_* 3경로 모두 used_venue_id := venue_id).
                  usedVenueName 을 앞세우면 '다른 매장에서 썼을 수도 있다'는 없는 개념을 암시한다. */}
              <span className="min-w-0 flex-1 truncate text-ink-secondary">{voucherLineLabel(v.title, v.venueName)}</span>
              <span className="shrink-0 font-bold text-danger-light tabular-nums">-1장</span>
            </li>
          ))}</ul>
        </section>
      )}

      {/* ⚠ 전면 오버레이를 '박스를 만들지 않는' 래퍼에 담는다. 부모(대시보드 space-y-4 · 시트 space-y-3)의
          `> * + *` margin-top 이 fixed inset-0 요소에 붙으면 그만큼 아래로 밀리고 키가 줄어 —
          딤이 화면 위 16px 을 못 덮는다.
          display:contents 요소도 `> * + *` 에는 **매칭된다** — 마진이 안 붙는 이유는 셀렉터에서
          빠져서가 아니라 박스를 만들지 않는 요소에 마진이 적용되지 않기 때문이다(자식에 전파되지도 않는다). */}
      <div className="contents">
      {redeem && <RedeemSheet stack={redeem} onClose={() => setRedeem(null)}
        onDone={(used) => { setRedeem(null); setRedeemDone(used); load(); }} />}
      {/* 차감 성공 전면 확인(Phase 15-1) — 직원과 고객이 한 화면을 같이 확인하는 것이
          실제 사용 장면이다. 큰 체크 + 수량 + 남은 잔량, 3초 뒤 자동 닫힘. */}
      {redeemDone && (
        <div role="status" className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-emerald-600 px-6 text-white animate-fade-in"
          onClick={() => setRedeemDone(null)}>
          <svg width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" opacity="0.35" /><path d="M7 12.5l3.2 3.2L17 9" />
          </svg>
          <p className="text-2xl font-extrabold">이용권 1장 사용 완료</p>
          <p className="text-sm font-semibold opacity-90">{voucherLineLabel(redeemDone.title, redeemDone.venueName)}</p>
          <p className="text-4xl font-extrabold tabular-nums">남은 이용권 {redeemDone.remain}장</p>
          <p className="mt-2 text-xs opacity-75">화면을 탭하면 닫힙니다</p>
        </div>
      )}
      </div>
    </>
  );

  // 대시보드는 fragment 그대로 — 페이지 컨테이너의 space-y-4 가 두 섹션 사이 간격을 계속 준다(레이아웃 무변화).
  return compact ? <div className="space-y-3">{body}</div> : body;
}

function RedeemSheet({ stack, onClose, onDone }: { stack: Stack; onClose: () => void; onDone: (used: { title: string; venueName: string | null; remain: number }) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'menu' | 'qr' | 'phone'>('menu');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const vid = stack.ids[0];

  const doDirect = async () => {
    if (!window.confirm(`'${stack.venueName ?? '발급 매장'}'에서 이용권을 사용(전송)할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try { await redeemMyVoucher(vid); onDone({ title: stack.title, venueName: stack.venueName, remain: stack.ids.length - 1 }); }
    catch (e) { toast.show(e instanceof Error ? e.message : '사용 실패', 'error'); setBusy(false); }
  };
  const doQr = async (text: string) => {
    const venueId = parseVenueId(text);
    if (!venueId) { toast.show('매장 QR이 아닙니다', 'error'); setMode('menu'); return; }
    setBusy(true);
    try { await redeemMyVoucherByQr(vid, venueId); onDone({ title: stack.title, venueName: stack.venueName, remain: stack.ids.length - 1 }); }
    catch (e) { toast.show(e instanceof Error ? e.message : '사용 실패', 'error'); setBusy(false); setMode('menu'); }
  };
  // 전화번호 경로 2단계(Phase 15-2/S6): 번호만 치고 원탭 전송하면 오타 = 오전송이다.
  // 1단계 조회로 받는 쪽(업주)을 확인 카드로 보여주고, 2단계에서만 실제 차감한다.
  const [phoneTarget, setPhoneTarget] = useState<TransferTarget | null>(null);
  const lookupPhone = async () => {
    setBusy(true);
    try {
      // ⚠ find_user_by_phone 은 **매장 운영자·admin 전용 RPC** 다 — 이용권을 든 일반 유저에게는
      //   항상 0행이 온다(에러가 아니라 빈 배열이라 catch 에도 안 걸린다). 예전엔 그걸 '번호를 다시
      //   확인해 주세요'로 돌려 이 경로가 일반 유저에게 영구히 안 열렸다(2026-09-05 검증).
      //   서버(redeem_my_voucher_by_phone)가 이미 입력 번호와 업주 번호 일치를 강제하므로,
      //   조회는 '되면 좋은 확인'으로 낮추고 안 되면 **매장명**으로 확인 카드를 세워 진행시킨다.
      const t = (await findUserByPhone(phone))[0] ?? null;
      setPhoneTarget(t ?? { id: '', display: stack.venueName ?? '발급 매장' });
      setBusy(false);
    } catch { setPhoneTarget({ id: '', display: stack.venueName ?? '발급 매장' }); setBusy(false); }
  };
  const doPhone = async () => {
    setBusy(true);
    try { await redeemMyVoucherByPhone(vid, phone); onDone({ title: stack.title, venueName: stack.venueName, remain: stack.ids.length - 1 }); }
    catch (e) { toast.show(e instanceof Error ? e.message : '사용 실패', 'error'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 overscroll-contain bg-black/70" />
      <div className="relative w-full max-w-md space-y-3 rounded-t-dialog border border-border-default bg-surface-mid p-4 animate-sheet-up sm:rounded-dialog">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 break-keep text-sm font-bold text-ink-primary [overflow-wrap:anywhere]">{voucherLineLabel(stack.title, stack.venueName)}</p>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        {mode === 'menu' && (<>
          <p className="text-2xs text-ink-muted">발급 매장(<b className="text-ink-secondary">{stack.venueName ?? '확인 중'}</b>)에서만 사용됩니다. 방법을 선택하세요.</p>
          <button type="button" disabled={busy} onClick={doDirect} className="btn-primary inline-flex w-full items-center justify-center gap-1.5 text-sm disabled:opacity-50"><Icon name="check-circle" size={16} /> 이 매장으로 바로 전송(사용)</button>
          <button type="button" onClick={() => setMode('qr')} className="btn-ghost inline-flex w-full items-center justify-center gap-1.5 text-sm"><Icon name="qr" size={16} /> 매장 QR 스캔해서 사용</button>
          <button type="button" onClick={() => setMode('phone')} className="btn-ghost inline-flex w-full items-center justify-center gap-1.5 text-sm"><Icon name="phone" size={16} /> 매장 업주 전화번호로 전송</button>
        </>)}
        {mode === 'qr' && (
          <div className="space-y-2">
            <p className="text-2xs text-ink-muted">매장에 비치된 QR을 비춰 주세요. (카메라 권한 필요)</p>
            <QrScanner onResult={doQr} onError={(m) => { toast.show(m, 'error'); setMode('menu'); }} />
            <button type="button" onClick={() => setMode('menu')} className="btn-ghost w-full text-2xs">취소</button>
          </div>
        )}
        {mode === 'phone' && (
          <div className="space-y-2">
            <p className="text-2xs text-ink-muted">발급 매장 <b className="text-ink-secondary">업주 전화번호</b>를 입력하세요.</p>
            <input value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneTarget(null); }} inputMode="tel" autoComplete="tel" placeholder="010-0000-0000" className="input w-full text-sm" />
            {phoneTarget && (
              <div className="flex items-center gap-2 rounded-input border border-emerald-500/40 bg-emerald-500/[0.08] px-3 py-2.5">
                <Icon name={phoneTarget.id ? 'user' : 'store'} size={16} className="shrink-0 text-emerald-400" />
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink-primary">{phoneTarget.display}</p>
                {/* 조회로 사람이 확인된 경우와, 매장명으로만 확인한 경우를 구분해 말한다 —
                    같은 문구를 쓰면 확인되지 않은 것을 확인된 것처럼 말하게 된다 */}
                <span className="shrink-0 text-2xs font-bold text-emerald-400">{phoneTarget.id ? '받는 사람 확인' : '이 매장에 사용'}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setMode('menu'); setPhoneTarget(null); }} className="btn-ghost flex-1 text-sm">뒤로</button>
              {phoneTarget ? (
                <button type="button" disabled={busy} onClick={doPhone} className="btn-primary inline-flex flex-1 items-center justify-center gap-1 text-sm disabled:opacity-50">{busy ? '처리 중…' : <><Icon name="check" size={14} /> {phoneTarget.id ? `${phoneTarget.display}에게 사용 확정` : `${phoneTarget.display}에 사용 확정`}</>}</button>
              ) : (
                <button type="button" disabled={busy || phone.replace(/\D/g, '').length < 10} onClick={lookupPhone} className="btn-primary flex-1 text-sm disabled:opacity-50">{busy ? '조회 중…' : '받는 사람 확인'}</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QrScanner({ onResult, onError }: { onResult: (text: string) => void; onError: (msg: string) => void }) {
  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let done = false;
    const stop = () => { const s = scanner; scanner = null; if (s) { s.stop().then(() => s.clear()).catch(() => {}); } };
    (async () => {
      try {
        const { Html5Qrcode: QrLib } = await import('html5-qrcode'); // 동적 로드 — 스캐너를 열 때만 다운로드(초기 번들 제외)
        scanner = new QrLib('nuri-qr-reader');
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 },
          (text) => { if (!done) { done = true; const r = text; stop(); onResult(r); } },
          () => {});
      } catch (e) { onError(e instanceof Error ? e.message : '카메라를 열 수 없습니다. 권한을 확인하세요.'); }
    })();
    return () => { done = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div id="nuri-qr-reader" className="mx-auto w-full max-w-[280px] overflow-hidden rounded-input bg-black" style={{ minHeight: 220 }} />;
}
