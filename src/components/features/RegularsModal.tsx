// src/components/features/RegularsModal.tsx
// 단골 관리(CRM) — 매장 전체 고객을 장부 바인 기록 기준으로 나열 + 행 펼침 시 상세 활동(바인/방문/머니인/예약/누적/객단가).
// 새 테이블 없이 기존 장부 데이터만 사용. 관계자(직원)는 제외.
import { useEffect, useMemo, useState } from 'react';
import Modal from '../atoms/Modal';
import { getVenueRegulars, getCustomerActivity, type VenueRegular, type CustomerActivity } from '../../api/reservations';
import { wonToMan } from '../../api/ledger';
import { getCustomerProfile, saveCustomerProfile, getCoupons, issueCoupon, setCouponStatus, type Coupon } from '../../api/crm';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { SkeletonList } from '../atoms/Skeleton';
import { useToast } from '../atoms/Toast';

export default function RegularsModal({ open, onClose, venueId, exclude = [], onSendVoucher }: {
  open: boolean; onClose: () => void; venueId: string; exclude?: string[];
  /**
   * '매장이용권 보내기' — **넘어오면 권한이 있다는 뜻**이다(호출부가 caps.voucher 로 게이트한다).
   * 왜 여기 필요한가: 이용권 보내기가 대시보드 '고객·단골' 카드의 **TOP 5 행에만** 있었다.
   * 6위 이하 고객에게 보내려면 이름을 외워 이용권 화면에서 직접 검색하는 수밖에 없었다 —
   * 정작 전체 고객 목록은 이 모달이 들고 있는데. 쿠폰과는 다른 기능이라 합치지 않는다.
   */
  onSendVoucher?: (name: string) => void;
}) {
  const [list, setList] = useState<VenueRegular[] | null>(null);
  // 조회 실패를 빈 목록으로 위장하면 사장님이 '아직 손님이 없네'로 읽는다 — 실패는 실패로 말하고 재시도를 준다.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open) return;
    setQ(''); setList(null); setLoadError(null);
    getVenueRegulars(venueId).then((r) => { setList(r); setLoadError(null); }).catch((e) => setLoadError(e));
  }, [open, venueId, reloadTick]);

  const ex = useMemo(() => new Set(exclude.map((s) => s.trim())), [exclude]);
  const searching = q.trim().length > 0;
  // 순번은 '바인 많은 순' 순위다(getVenueRegulars 정렬). 검색 결과에 1부터 다시 매기면
  // 12위 손님이 1위 색을 달고 나온다 — 순위는 직원 제외 목록에서 한 번만 매기고, 검색은 거기서 고른다.
  const ranked = useMemo(
    () => (list ?? []).filter((r) => !ex.has(r.name.trim())).map((r, i) => ({ r, rank: i + 1 })),
    [list, ex],
  );
  const rows = searching ? ranked.filter(({ r }) => r.name.includes(q.trim())) : ranked;

  return (
    <Modal open={open} onClose={onClose} title="단골 관리" maxWidth="md" variant="sheet">
      <div className="space-y-3 p-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="고객 이름 검색…" className="input w-full text-sm" />
        {loadError ? (
          <LoadErrorCard error={loadError} what="고객 목록" compact
            onRetry={() => { setLoadError(null); setList(null); setReloadTick((v) => v + 1); }} />
        ) : list === null ? (
          // 실제 행 높이(px-3 py-2 + 본문 20px = 36px)와 같은 스켈레톤 — 로딩→목록 전환에서 아래 문구가 밀리지 않게.
          <SkeletonList rows={6} rowClassName="h-9" />
        ) : rows.length === 0 ? (
          // '아직 고객이 없다'와 '검색에 안 걸린다'는 다른 상태다 — 검색어를 지우면 되는지 사장님이 바로 알아야 한다.
          <p className="py-8 text-center text-2xs text-ink-muted">
            {searching ? <>‘{q.trim()}’과(와) 일치하는 고객이 없습니다.</> : '장부에 기록된 고객이 아직 없습니다.'}
          </p>
        ) : (
          <>
            {/* 열 머리 — 아래 숫자 열과 같은 폭·같은 우측 정렬. 머리가 없으면 어느 숫자가 바인인지 매 행에서 다시 읽어야 한다. */}
            <div className="flex items-center gap-2 px-3 text-[11px] text-ink-muted">
              <span className="w-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">고객</span>
              <span className="w-11 shrink-0 text-right">바인</span>
              <span className="w-11 shrink-0 text-right">방문</span>
              <span className="w-4 shrink-0" aria-hidden />
            </div>
            <ul className="space-y-1.5">
              {rows.map(({ r, rank }) => <RegularRow key={r.name} idx={rank} r={r} venueId={venueId} onSendVoucher={onSendVoucher} />)}
            </ul>
          </>
        )}
        <div className="space-y-0.5 text-2xs leading-relaxed text-ink-muted">
          <p>장부 바인 기록 기준 · 직원(관계자) 제외 · 5회 이상 ‘단골’</p>
          <p>완납 누적은 실제 수납된 참가비입니다(미수·이용권·가게지원 제외) · 통계·CSV와 같은 기준</p>
        </div>
      </div>
    </Modal>
  );
}

function RegularRow({ idx, r, venueId, onSendVoucher }: { idx: number; r: VenueRegular; venueId: string; onSendVoucher?: (name: string) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState<CustomerActivity | null>(null);
  const [actError, setActError] = useState<unknown>(null);
  const [bday, setBday] = useState('');
  const [savingBday, setSavingBday] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponBusy, setCouponBusy] = useState(false);
  const [crmLoaded, setCrmLoaded] = useState(false);
  // 생일·쿠폰 조회 실패는 '빈 생일 + 활성 쿠폰 0장'과 똑같이 보였다 —
  // 그 상태로 저장하면 기존 생일을 지우고, 이미 준 쿠폰을 또 발급한다. 실패는 실패로 말하고 재시도를 준다.
  const [crmError, setCrmError] = useState<unknown>(null);
  const loadAct = () => {
    setActError(null);
    getCustomerActivity(venueId, r.name).then((a) => { setAct(a); setActError(null); }).catch((e) => setActError(e));
  };
  const loadCrm = () => {
    setCrmError(null);
    Promise.all([getCustomerProfile(venueId, r.name), getCoupons(venueId, r.name)])
      .then(([p, c]) => { setBday(p?.birthday ?? ''); setCoupons(c); setCrmLoaded(true); })
      .catch((e) => setCrmError(e));
  };
  const toggle = () => {
    const n = !open; setOpen(n);
    if (n && !act && !actError) loadAct();
    if (n && !crmLoaded && !crmError) loadCrm();
  };
  // 저장 결과를 말하지 않으면 사장님이 같은 버튼을 또 누른다 — 저장 중엔 잠그고, 성공·실패를 모두 알린다.
  const saveBday = async () => {
    if (savingBday) return;
    setSavingBday(true);
    try { await saveCustomerProfile(venueId, r.name, { birthday: bday || null }); toast.show('생일을 저장했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '생일 저장에 실패했습니다', 'error'); }
    finally { setSavingBday(false); }
  };
  // 서버에는 반영됐는데 재조회만 실패한 경우를 '실패'로 말하면 사장님이 같은 쿠폰을 또 발급한다 — 둘을 갈라 말한다.
  const refreshCoupons = async (okMsg: string) => {
    try { setCoupons(await getCoupons(venueId, r.name)); setCrmError(null); toast.show(okMsg, 'success'); }
    catch { toast.show('처리는 됐지만 쿠폰 목록 갱신에 실패했습니다. 카드를 닫았다 열어 확인해 주세요', 'info'); }
  };
  const addCoupon = async () => {
    if (couponBusy) return;
    const t = window.prompt('쿠폰 내용 (예: 5만 바인권 / 첫방문 50%)');
    if (!t) return;
    setCouponBusy(true);
    try { await issueCoupon(venueId, r.name, t); }
    catch (e) { toast.show(e instanceof Error ? e.message : '쿠폰 발급에 실패했습니다', 'error'); setCouponBusy(false); return; }
    await refreshCoupons('쿠폰을 발급했습니다');
    setCouponBusy(false);
  };
  // 쿠폰 사용 처리 — 'use' 접두어가 훅으로 오인되지 않도록 redeem 으로 명명
  const redeemCoupon = async (id: string) => {
    if (couponBusy) return;
    setCouponBusy(true);
    try { await setCouponStatus(id, 'used'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '쿠폰 사용 처리에 실패했습니다', 'error'); setCouponBusy(false); return; }
    await refreshCoupons('쿠폰을 사용 처리했습니다');
    setCouponBusy(false);
  };
  return (
    <li className="rounded-input border border-border-subtle bg-surface-low">
      {/* 펼침 토글과 '이용권 보내기'는 **형제**다 — 버튼 안에 버튼을 넣으면 유효하지 않은 마크업이고
          키보드로 안쪽 버튼에 닿지 못한다. 열 폭(바인/방문)은 위 열 머리와 계속 같은 값을 쓴다. */}
      <div className="flex items-center">
        <button type="button" onClick={toggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
          <span className={`w-5 shrink-0 text-center text-2xs font-bold tabular-nums ${idx === 1 ? 'text-accent-300' : 'text-ink-muted'}`}>{idx}</span>
          {/* 긴 닉네임이 숫자 열을 밀지 않게 truncate — 대신 title 로 전체 이름을 볼 수 있게 남긴다. */}
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="min-w-0 truncate text-sm font-semibold text-ink-primary" title={r.name}>{r.name}</span>
            {r.buyins >= 5 && <span className="shrink-0 text-2xs font-bold text-accent-300">단골</span>}
          </span>
          <span className="w-11 shrink-0 text-right text-2xs tabular-nums text-ink-secondary">{r.buyins}</span>
          <span className="w-11 shrink-0 text-right text-2xs tabular-nums text-ink-secondary">{r.visits}</span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} className="w-4 shrink-0 text-ink-muted" />
        </button>
        {onSendVoucher && (
          // 터치 영역 40px 확보(min-h-10) — 라벨은 아이콘만이 아니라 글자도 남긴다(색·아이콘만으로 뜻을 전하지 않는다).
          <button type="button" onClick={() => onSendVoucher(r.name)} title={`${r.name}님에게 매장이용권 보내기`}
            className="mr-2 inline-flex min-h-10 shrink-0 items-center gap-1 rounded-badge border border-accent-400/40 bg-accent-300/10 px-2 text-2xs font-bold text-accent-300 transition-colors hover:bg-accent-300/20">
            <Icon name="gift" size={11} className="shrink-0" />이용권
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-border-subtle px-3 py-2">
          {actError ? (
            <LoadErrorCard error={actError} what="활동 내역" compact onRetry={loadAct} />
          ) : !act ? (
            // 아래 지표 격자(2행 × 2.6rem)와 같은 높이 — 도착하는 순간 카드가 아래로 밀리지 않게.
            <SkeletonList rows={2} rowClassName="h-[2.6rem]" />
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              <Cell label="바인" v={`${act.buyins}회`} />
              <Cell label="방문" v={`${act.visits}회`} />
              <Cell label="머니인" v={`${act.moneyIn}회`} />
              <Cell label="예약" v={`${act.reservations}회`} />
              {/* '누적'만 쓰면 실제 받은 돈인지 평가액인지 알 수 없다 — 통계 '완납 매출'과 같은 기준임을 라벨로 못박는다 */}
              <Cell label="완납 누적" v={`${wonToMan(act.amount)}만`} gold />
              <Cell label="완납 객단가" v={act.buyins ? `${wonToMan(Math.round(act.amount / act.buyins))}만` : '-'} />
              <Cell label="미수" v={`${wonToMan(act.unpaid)}만`} />
              <Cell label="회수 이용권" v={`${Math.round(act.ticket * 10) / 10}T`} />
              <Cell label="가게지원" v={`${act.support}회`} />
            </div>
          )}
          <div className="mt-2 space-y-1.5 border-t border-border-subtle pt-2">
            {crmError ? (
              // 못 불러온 채 생일 칸을 열어두면 빈 값 저장으로 기존 생일이 지워진다 — 조회가 성공해야 입력을 연다.
              <LoadErrorCard error={crmError} what="생일·쿠폰" compact onRetry={loadCrm} />
            ) : !crmLoaded ? (
              // 생일 행(.input)·쿠폰 머리 행(.btn) 둘 다 min-h-[2.4rem] 이고 사이 간격도 space-y-1.5 로 같다 —
              // 뼈대를 같은 값으로 잡아야 도착하는 순간 아래 행들이 밀리지 않는다.
              <SkeletonList rows={2} rowClassName="h-[2.4rem]" />
            ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-2xs text-ink-muted">생일</span>
                <input type="date" value={bday} onChange={(e) => setBday(e.target.value)} className="input flex-1 text-2xs" />
                <button type="button" onClick={saveBday} disabled={savingBday} className="btn-ghost shrink-0 px-2 text-2xs text-accent-300 disabled:opacity-50">{savingBday ? '저장 중…' : '저장'}</button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-2xs text-ink-muted">활성 쿠폰 {coupons.filter((c) => c.status === 'active').length}장</span>
                <button type="button" onClick={addCoupon} disabled={couponBusy} className="btn-ghost px-2 text-2xs text-accent-300 disabled:opacity-50">+ 쿠폰 발급</button>
              </div>
              {coupons.filter((c) => c.status === 'active').map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded bg-surface-high px-2 py-1">
                  <span className="flex min-w-0 flex-1 items-center gap-1 text-2xs text-ink-secondary"><Icon name="ticket" size={11} className="shrink-0" /><span className="truncate" title={c.title}>{c.title}</span></span>
                  <button type="button" onClick={() => redeemCoupon(c.id)} disabled={couponBusy} className="shrink-0 text-2xs font-bold text-accent-300 disabled:opacity-50">사용</button>
                </div>
              ))}
            </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Cell({ label, v, gold }: { label: string; v: string; gold?: boolean }) {
  return (
    <div className="rounded bg-surface-high py-1.5 text-center">
      <p className={`text-sm font-bold leading-none tabular-nums ${gold ? 'text-accent-300' : 'text-ink-primary'}`}>{v}</p>
      <p className="mt-0.5 text-2xs text-ink-muted">{label}</p>
    </div>
  );
}
