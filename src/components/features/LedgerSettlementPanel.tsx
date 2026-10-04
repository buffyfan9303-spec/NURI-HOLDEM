// src/components/features/LedgerSettlementPanel.tsx
// 5단계 '정산' — **그날 하루를 총체적으로 마무리하는 판**.
//
// 오너 2026-09-08: "5번 정산을 누르면 그날 정산이 나와야 하는데 왜 장부로 이동되는지 모르겠어.
//   정산 탭을 활성화 … 신규손님, 기존손님, 바인을 많이한 손님, 머니인을 한 순위, 미수, 총 매출,
//   기준엔트리 대비 매출 및 손익 등등 … 매장 업주들이 궁금해할 모든 것".
//
// 예전에는 '정산'이 판이 아니라 **장부 하단 정산바로 데려가는 이동**이었다(2026-09-06 판단).
// 그 판단을 오너가 뒤집었다 — 그날 마감은 장부 한 줄이 아니라 하루 전체의 결산이라는 것.
// 장부의 정산바·마감 모달은 그대로 둔다(그건 '이 게임 하나를 닫는' 도구다). 이 판은 그 위층이다.
//
// ⚠ 금액은 전부 settlementReport(=buyinFinance) 로만 만든다. 여기서 따로 합산하면
//   장부·통계·CSV 와 갈린다 — 실제로 CRM 이 그렇게 갈린 적이 있다(ledger.ts F04 주석).
// ⚠ 플랫폼: 매장 운영은 PC 99%(CLAUDE.md). 데스크톱 2열을 기본으로 두고 모바일은 1열로 접는다.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon, { type IconName } from '../atoms/Icon';
import { EmptyState } from '../atoms/Skeleton';
import {
  getLedgerRange, getLedgerPlayers, visitorLabel, wonToMan, ticketUsedT, posHasPassword, getVoucherUsesForDate, staffSeesSession,
  type LedgerBuyin, type LedgerPlayer, type LedgerSession,
} from '../../api/ledger';
import { ticketCheck, type TicketCheck } from '../../lib/ticketCheck';
import { kstToday } from '../../lib/kst';
import UnpaidCollectList from './UnpaidCollect';
import { unpaidItemsOf } from '../../lib/unpaidItems';
import { businessDateOf } from '../../lib/businessDate';
import { settlementReport, settlementReceipt, type SettlePlayer, type SettlementReport } from '../../lib/ledgerSettlement';
import { msgOf } from '../../lib/dbError';

const man = (won: number) => `${wonToMan(won)}만`;
/** 엔트리 표시 — 금액 기준이라 소수가 나온다(5만 할인 = 0.5). 정수면 정수로 보인다. */
const ent = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
/** 이용권 **장수** 표시(2026-10-01 Fable 판정 ①: T = 차감된 장수). 원에서 거꾸로 만들지 않는다 — 12만·N=10 게임 10장은 '12만 · 10장'. */
const jang = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}장`;

export default function LedgerSettlementPanel({ venueId, date, active = true, canManage = true }: {
  venueId: string;
  /** 정산할 날짜(YYYY-MM-DD). 없으면 오늘. */
  date?: string | null;
  active?: boolean;
  /** can_manage_pos(업주·공동운영자·관리자). false(장부 권한 직원)면 매출 보고서 대신 **받을 미수 목록**만 —
   *  오너 2026-10-03 Q3 '직원에게 매출 합계는 숨겨' + Q2 '마감 뒤 미수는 직원도 비밀번호로 받는다'.
   *  서버(20261003h lb_select)도 직원에게 지난 날짜는 미수 행만 준다 — 그 행으로 매출을 그리면 작은 숫자가 정상처럼 보인다. */
  canManage?: boolean;
}) {
  const [day, setDay] = useState<string>(date ?? businessDateOf(venueId));   // B1 — 기본은 영업일
  // 부모(단계 바)가 다른 날짜를 실어 보내면 따라간다 — 사용자가 여기서 바꾼 날짜는 그대로 둔다.
  useEffect(() => { if (date) setDay(date); }, [date]);

  // 🔴 MYSTORE-PC-TAB-JANK(2026-09-24) — 자료에 **누구의 어느 날**인지(key=venueId|day)를 붙인다.
  //   종전엔 판이 다시 보일 때마다(active) setData(null) 로 비워서, keep-alive 인데도 재진입마다
  //   옛 보고서 → 스켈레톤 ~300ms → 보고서로 깜빡였다(오너 "정산 탭 깜빡임"). 같은 키면 보고서를 그대로 둔 채
  //   조용히 다시 읽고, 매장·날짜가 바뀐 경우에만 비운다(다른 날 숫자가 한 프레임이라도 보이면 안 된다).
  const [data, setData] = useState<{ key: string; sessions: LedgerSession[]; buyins: LedgerBuyin[]; players: LedgerPlayer[] } | null>(null);
  // F4-02(2026-10-04) — 그날 실제로 들어온 매장이용권(1행 = 1장). 실패는 정산 전체를 막지 않고 티켓 대조 카드에만 알린다(0장으로 삼키지 않는다).
  const [uses, setUses] = useState<{ key: string; rows: { playerName: string }[] | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reqKey = useRef('');
  const key = `${venueId}|${day}`;

  const load = useCallback(() => {
    if (!venueId) return;
    reqKey.current = key;
    setData((d) => (d && d.key === key ? d : null)); setErr(null);
    getVoucherUsesForDate(venueId, day)
      .then((rows) => { if (reqKey.current === key) setUses({ key, rows }); })
      .catch(() => { if (reqKey.current === key) setUses({ key, rows: null }); });
    getLedgerRange(venueId, day, day)
      .then(async ({ sessions, buyins }) => {
        // 명단은 게임별 조회밖에 없다. 하루의 게임은 보통 1~3개라 그대로 병렬로 부른다.
        // ⚠ 여기서 실패를 `.catch(() => [])` 로 삼키면 안 된다(2026-09-14 고침). 명단이 비면
        //   손님 유형이 전부 '미분류'가 되고 신규/기존이 0, 참여 인원이 줄어든 **그럴듯한 숫자**가 뜬다 —
        //   바로 아래 주석이 경계하는 "실패를 빈 화면으로 위장" 과 같은 사고인데 명단만 예외였다.
        //   Promise.all 은 첫 거부에서 바로 거부되므로 아래 .catch 가 그대로 받아 배너를 띄운다.
        const rosters = await Promise.all(sessions.map((s) => getLedgerPlayers(venueId, day, s.gameSeq)));
        if (reqKey.current !== key) return; // 날짜·매장이 바뀐 뒤 늦게 온 응답 — 지금 화면에 싣지 않는다
        setData({ key, sessions, buyins, players: rosters.flat() });
      })
      // 통계는 '0원'과 '못 불러옴'이 시각적으로 같아서 특히 위험하다 — 실패를 빈 화면으로 위장하지 않는다.
      .catch((e) => { if (reqKey.current === key) setErr(msgOf(e, '정산 자료를 불러오지 못했습니다')); });
  }, [venueId, day, key]);
  useEffect(() => { if (active) load(); }, [active, load]);
  // 직원 판의 '미수 받기'는 비밀번호 칸을 낼지 알아야 한다(바인 취소와 같은 규칙). 실패하면 '있음'으로 두고 서버 문구가 고친다.
  const [hasPw, setHasPw] = useState(true);
  useEffect(() => {
    if (!active || canManage || !venueId) return;
    let live = true;
    posHasPassword(venueId).then((v) => { if (live) setHasPw(v); }).catch(() => {});
    return () => { live = false; };
  }, [active, canManage, venueId]);

  const r: SettlementReport | null = useMemo(
    () => (data && data.key === key ? settlementReport(day, data.sessions, data.buyins, data.players) : null),
    [data, day, key],
  );
  // 직원은 서버(20261003h lb_select)가 지난 마감 장부의 완납 행을 주지 않는다 — 그 날짜로 대조하면 장부 티켓이 작게 나와 '부족 0' 으로 거짓 안심한다.
  //   그래서 그날 게임이 전부 직원 창 안(staffSeesSession — 서버 경계의 화면 쌍둥이)일 때만 숫자를 낸다. 레지 마감 직후(마감 17시간 안)는 창 안이다.
  const tc: TicketCheck | 'staffOld' | 'error' | null = useMemo(() => {
    if (!data || data.key !== key || !uses || uses.key !== key) return null;
    if (!canManage && !data.sessions.every((s) => staffSeesSession(s, businessDateOf(venueId), kstToday()))) return 'staffOld';
    if (!uses.rows) return 'error';
    return ticketCheck(data.sessions, data.buyins, uses.rows);
  }, [data, uses, key, canManage, venueId]);

  return (
    <section className="space-y-4">
      {/* ── 날짜 · 새로고침 ── */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="text-2xs font-semibold text-ink-muted">정산일</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value || businessDateOf(venueId))}
            className="input h-10 text-sm tabular-nums" aria-label="정산할 날짜" />
        </label>
        <button type="button" onClick={load} className="btn-ghost h-10 px-3 text-xs">새로고침</button>
        {r && r.games.length > 0 && (
          <span className={`inline-flex items-center gap-1 rounded-badge border px-2 py-1 text-2xs font-bold ${r.allClosed
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>
            <Icon name={r.allClosed ? 'check' : 'clock'} size={12} />
            {r.allClosed ? '전 게임 마감됨' : `미마감 ${r.games.filter((g) => !g.closed).length}게임`}
          </span>
        )}
      </div>

      {/* role=alert: 조회 실패를 보조기술에도 알린다(FORM-01) — AuthModal·LoadErrorCard 와 같은 계약 */}
      {err && (
        <p role="alert" className="rounded-input border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs text-danger-light">{err}</p>
      )}
      {!err && !r && (
        <div className="space-y-3" aria-busy="true">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-aura" />)}</div>
          <div className="skeleton h-40 rounded-aura" />
        </div>
      )}

      {!err && r && r.games.length === 0 && (
        <div className="rounded-aura border card-aura">
          <EmptyState icon={<Icon name="book-open" />} title="이 날짜에 연 장부가 없습니다."
            desc="그날 장부를 열면 정산이 만들어집니다" />
        </div>
      )}

      {!err && r && r.games.length > 0 && data && (canManage ? <Report r={r} ticket={tc} /> : (
        <div data-testid="settle-staff" className="space-y-3 rounded-aura border card-aura p-3">
          <p className="text-xs text-ink-secondary">매출·결제 합계는 업주만 볼 수 있어요. 여기서는 <b className="text-ink-primary">티켓 대조</b>와 <b className="text-ink-primary">받을 미수</b>를 보여 드려요.</p>
          <TicketCheckCard tc={tc} />
          {(() => {
            // 마감 전 게임의 미수는 여기서 받지 않는다(verifier 2026-10-03 경고 — 비밀번호를 넣은 뒤에야 '마감 전' 안내가 나왔다).
            //   열린 게임은 장부 칸에서 결제 수단을 바로 바꾼다.
            const sessOf = (b: LedgerBuyin) => data.sessions.find((s) => s.gameSeq === b.gameSeq);
            const items = unpaidItemsOf(data.buyins.filter((b) => sessOf(b)?.closed), sessOf);
            const openOwed = data.buyins.some((b) => !sessOf(b)?.closed && unpaidItemsOf([b], sessOf).length > 0);
            return <>
              <UnpaidCollectList items={items} hasPw={hasPw} canManage={false} showGame onDone={load} onPwState={setHasPw}
                emptyText="이 날짜 마감 장부에 받을 미수가 없어요." />
              {openOwed && <p className="text-2xs text-ink-muted">아직 마감 전 게임의 미수는 장부에서 결제 수단을 바로 바꿔 주세요.</p>}
            </>;
          })()}
        </div>
      ))}
    </section>
  );
}

function Report({ r, ticket }: { r: SettlementReport; ticket: TicketCheck | 'staffOld' | 'error' | null }) {
  const t = r.total;
  // 기준 대비 — 기준 엔트리가 없으면 아무 말도 하지 않는다(0 대비 퍼센트는 의미가 없다).
  const hasTarget = t.targetEntries > 0;
  // 달성률의 분자는 **금액 엔트리**다(횟수가 아니다) — 기준 엔트리가 GTD 목표라 반값 손님은 0.5 명분만 채운다.
  const entryRate = hasTarget ? Math.round((t.entries / t.targetEntries) * 100) : 0;
  // 차액은 달성률과 **같은 모집단**(금액 엔트리) — (엔트리 − 기준 엔트리) × 단가(Fable 판정 ②, ledgerSettlement.gapWon).
  const gapWon = t.gapWon;
  // #9(2026-09-29) — '받은 방법' 대차표는 바인 + 애드온 한 벌(settlementReceipt 주석: 이용권 타일만 더하면 대차가 깨지고 이중 계상된다).
  const rc = settlementReceipt(t);

  return (
    <div className="space-y-4">
      {/* ── ① 오늘의 숫자 넷 ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {/* 애드온(2026-09-28)은 바인과 따로 세고 여기서만 더한다 — 엔트리·바인 횟수에는 들어가지 않는다. */}
        <Kpi testId="kpi-revenue" label="완납 매출" value={man(t.revenue + t.addon.revenue)} tone="emerald"
          hint={t.addon.count > 0 ? `바인 ${man(t.revenue)} + 애드온 ${man(t.addon.revenue)}` : '현금 + 카드 + 이체'} />
        <Kpi testId="kpi-unpaid" label="미수금" value={man(t.unpaid + t.addon.unpaid)} tone={t.unpaid + t.addon.unpaid > 0 ? 'danger' : 'muted'}
          hint={t.addon.unpaid > 0 ? `바인 ${man(t.unpaid)} + 애드온 ${man(t.addon.unpaid)}` : '아직 못 받은 참가비'} />
        <Kpi testId="kpi-buyins" label="총 바인" value={`${t.buyinCount.toLocaleString()}회`} tone="accent"
          hint={`첫 바인 ${t.firstBuyins} · 리바인 ${t.rebuys} · 엔트리 ${ent(t.entries)}`} />
        <Kpi label="참여 인원" value={`${r.people}명`} tone="accent"
          hint={`신규 ${r.newPeople} · 기존 ${r.regularPeople}`} />
      </div>

      {/* 이 판은 **그날 기록 전부**로 만든다(settlementReport 의 excludedBy 를 넘기지 않는다).
          장부 화면의 '정산 제외'(관계자·가게지원 등)는 그 화면에서만 살아 있는 일회성 필터라,
          같은 날짜인데 장부 정산바와 여기 숫자가 다를 수 있다. 둘이 다른 이유를 화면에 밝혀 둔다 —
          숫자가 갈리는 것보다, 갈리는 이유를 모르는 것이 더 위험하다. */}
      {/* 감사 S-3(2026-10-02) — 3줄 → 한 문장. 뜻(장부 화면의 정산 제외는 여기 안 들어가 정산바와 다를 수 있다)은 그대로. */}
      <p className="text-2xs leading-relaxed text-ink-muted">
        <b className="text-ink-secondary">그날 장부 바인 전부</b> 기준 · ‘정산 제외’ 미반영이라 정산바와 다를 수 있어요
      </p>

      {/* ── ② 기준 엔트리 대비 ── */}
      <Card title="기준 엔트리 대비" icon="target"
        note="엔트리는 금액 기준(10만 게임 5만 할인 = 바인 1회·엔트리 0.5). '차액'은 순이익이 아니라 기준 매출과의 차이입니다.">
        {hasTarget ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Line label="엔트리" value={ent(t.entries)} sub={`달성 ${entryRate}% · 바인 ${t.buyinCount}회`}
              tone={entryRate >= 100 ? 'emerald' : entryRate >= 80 ? 'amber' : 'danger'} />
            <Line label="기준 엔트리" value={`${t.targetEntries.toLocaleString()}`} sub="세션에 설정한 GTD 목표" />
            <Line label="기준 매출" value={man(t.targetRevenue)} sub="기준 엔트리 × 현금 단가" />
            {/* 엔트리(이용권·미수·지원 포함)와 같은 모집단 — 현금이 얼마나 들어왔나는 아래 '받은 방법'의 현금성 수납이다. */}
            <Line label="기준 대비 차액" value={`${gapWon >= 0 ? '+' : '−'}${man(Math.abs(gapWon))}`}
              sub={`(엔트리 − 기준) × 단가 · ${gapWon >= 0 ? '기준을 넘었습니다' : '기준에 못 미쳤습니다'}`}
              tone={gapWon >= 0 ? 'emerald' : 'danger'} />
          </div>
        ) : (
          <p className="text-2xs text-ink-muted"><b className="text-ink-secondary">기준 엔트리</b>가 없어 대비를 계산하지 않았어요 · 장부 세션 정보에서 설정</p>
        )}
      </Card>

      {/* ── ③ 수단 분해(대차표) ── */}
      <Card title="받은 방법" icon="wallet"
        note="총 정상가 − 할인 = 수납 완료 + 미수 + 매장지원(애드온 포함)">
        {/* 2026-09-11: 매장지원·미수를 수납과 **같은 줄에 두지 않는다** — 지원은 매장이 부담한 것이고
            미수는 아직 못 받은 돈이라, 현금·카드·이체·이용권과 같은 위계로 서면 수납액처럼 읽힌다. */}
        <p className="mb-1.5 text-2xs font-semibold text-ink-secondary">수납 완료</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="현금" value={man(rc.tender.cash)} />
          <Tile label="카드" value={man(rc.tender.card)} />
          <Tile label="이체" value={man(rc.tender.transfer)} />
          {/* #9(2026-09-29) — 값에 애드온 이용권 포함(오너 결정). 장수는 이용권 사용 T 정본(ticketUsedT, 바인+애드온).
              2026-10-01 — 원(값)과 장(꼬리표)을 따로 적는다. 장수 ≠ 원 ÷ 1만 인 게임(N 설정·min 규칙)이 있어 환산 문구는 뗐다. */}
          <Tile label="매장이용권" value={man(rc.tender.ticket)} sub={t.addon.ticketT > 0
            ? `${jang(ticketUsedT({ ticketPaid: t.ticketT }, t.addon))} · 바인 ${jang(t.ticketT)} + 애드온 ${jang(t.addon.ticketT)}`
            : jang(t.ticketT)} />
        </div>
        <p className="mb-1.5 mt-3 text-2xs font-semibold text-ink-secondary">수납이 아닌 것</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="미수금" value={man(rc.tender.unpaid)} tone={rc.tender.unpaid > 0 ? 'danger' : undefined} />
          <Tile label="매장지원" value={man(t.tender.support)} sub={t.support > 0 ? `${t.support}건 · 매장 부담` : undefined} />
        </div>
        <dl className="mt-3 grid gap-2 border-t border-border-subtle pt-3 sm:grid-cols-3">
          <Row label="총 정상가" value={man(rc.gross)} sub={rc.addonTotal > 0 ? `바인 ${man(t.gross)} + 애드온 ${man(rc.addonTotal)}` : undefined} />
          <Row label="할인" value={`${t.discount.count}건 · ${man(t.discount.total)}`}
            sub={t.discount.cashTotal > 0 ? `덜 받은 현금 ${man(t.discount.cashTotal)}` : undefined} />
          <Row label="적용 후 금액" value={man(rc.value)} />
          <Row label="수납 완료" value={man(rc.received)}
            sub={`현금성 ${man(rc.cashlike)} + 이용권 ${man(rc.tender.ticket)}`} />
          <Row label="현금성 수납" value={man(rc.cashlike)} sub="현금 + 카드 + 이체" />
          <Row label="할인이 없었다면 현금성 매출" value={man(rc.cashlike + t.discount.cashTotal)} />
        </dl>
        {/* F7(2026-09-29): 애드온 타일은 3장이다 — 4열이면 PC 오른쪽 25%(230px)가 비어 sm:grid-cols-3. */}
        {t.addon.count > 0 && (
          <div data-testid="settle-addon">
            {/* #9 — 위 대차표에 이미 들어 있는 부분집합이다(더하면 이중 계상). 엔트리·바인 횟수에는 들어가지 않는다. */}
            <p className="mb-1.5 mt-3 text-2xs font-semibold text-ink-secondary">그중 애드온 {t.addon.count}건 · 위 합계에 포함</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Tile label="애드온 매출" value={man(t.addon.revenue)} sub="현금 + 카드 + 이체" />
              <Tile label="애드온 이용권" value={man(t.addon.ticketWon)} sub={jang(t.addon.ticketT)} />
              <Tile label="애드온 미수" value={man(t.addon.unpaid)} tone={t.addon.unpaid > 0 ? 'danger' : undefined} />
            </div>
          </div>
        )}
        {t.removed.count > 0 && (
          <p className="mt-3 rounded-input border border-amber-500/40 bg-amber-500/8 px-3 py-2 text-2xs text-ink-secondary">
            정산에서 제외된 행 <b className="tabular-nums">{t.removed.count}건</b>
            {' '}(바인 {t.removed.count}회 · 엔트리 {ent(t.removed.entries)} · 매출 {man(t.removed.revenue)})은 위 합계에 들어 있지 않습니다.
          </p>
        )}
      </Card>

      <TicketCheckCard tc={ticket} />

      {/* ── ④ 손님 구성 ── */}
      <Card title="손님 구성" icon="users" note="유형을 안 적은 손님은 '미분류'로 모입니다">
        <ul className="flex flex-wrap gap-2">
          {r.visitors.map((v) => (
            <li key={v.key || '_'} className="rounded-input border card-aura-sub px-3 py-2">
              <p className="text-2xs font-semibold text-ink-muted">{visitorLabel(v.key) || '미분류'}</p>
              <p className="text-base font-extrabold tabular-nums text-ink-primary">{v.people}<span className="ml-0.5 text-2xs font-semibold text-ink-muted">명</span></p>
              <p className="text-2xs tabular-nums text-ink-muted">바인 {v.buyins}건 · {man(v.moneyIn)}</p>
            </li>
          ))}
        </ul>
      </Card>

      {/* ── ⑤ 순위 셋 ── */}
      {/* 감사 S-1 — 등높이 그리드라 '미수 손님' 카드 안이 467px 비었다. 카드 높이는 내용대로. */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Rank title="바인을 많이 한 손님" icon="chip-stack" rows={r.topByBuyins}
          value={(p) => `${p.buyins}회`} sub={(p) => man(p.moneyIn)}
          empty="바인 기록이 없습니다." />
        <Rank title="머니인 순위" icon="trending-up" rows={r.topByMoneyIn}
          value={(p) => man(p.moneyIn)} sub={(p) => `바인 ${p.buyins}회`}
          note="머니인 = 게임에 넣은 가치(이용권·가게지원 포함). 받은 현금과 다릅니다."
          empty="머니인 기록이 없습니다." />
        <Rank title="미수 손님" icon="alert" rows={r.unpaidPlayers}
          value={(p) => man(p.unpaid)} sub={(p) => `받은 금액 ${man(p.paid)}`} tone="danger"
          empty="미수가 없습니다." />
      </div>

      {/* ── ⑥ 게임별 내역 ── */}
      {r.games.length > 1 && (
        <Card title="게임별 내역" icon="layers" note="'바인'은 앉은 횟수, '엔트리'는 금액 기준">
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl text-left text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-2xs text-ink-muted">
                  <th className="py-1.5 pr-2 font-semibold">게임</th>
                  <th className="py-1.5 px-2 text-right font-semibold">바인</th>
                  <th className="py-1.5 px-2 text-right font-semibold">엔트리</th>
                  <th className="py-1.5 px-2 text-right font-semibold">기준</th>
                  <th className="py-1.5 px-2 text-right font-semibold">완납 매출</th>
                  <th className="py-1.5 px-2 text-right font-semibold">미수</th>
                  <th className="py-1.5 pl-2 text-right font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {r.games.map((g) => (
                  <tr key={g.gameSeq} className="border-b border-border-subtle/60 last:border-0">
                    <td className="py-2 pr-2 font-semibold text-ink-primary">{g.title}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-ink-secondary">{g.buyinCount.toLocaleString()}회</td>
                    <td className="py-2 px-2 text-right tabular-nums text-ink-secondary">{ent(g.entries)}</td>
                    <td className="py-2 px-2 text-right text-ink-muted">{g.targetEntries > 0 ? g.targetEntries : '—'}</td>
                    <td className="py-2 px-2 text-right font-bold text-emerald-700 dark:text-emerald-300">{man(g.revenue + g.addon.revenue)}</td>
                    <td className={`py-2 px-2 text-right ${g.unpaid + g.addon.unpaid > 0 ? 'font-bold text-danger-light' : 'text-ink-muted'}`}>{man(g.unpaid + g.addon.unpaid)}</td>
                    <td className="py-2 pl-2 text-right text-2xs">
                      {/* ⚠ 2026-09-14 라이트 실측: text‑amber‑500 '진행' 2.15 · emerald-600 글자색 '마감' 3.30(11.7px) 으로 AA 미달.
                          두 색 다 라이트 보정 목록에 없던 유틸이라, 보정이 들어 있는 stat-* 토큰으로 바꾼다. */}
                      {g.closed ? <span className="stat-emerald">마감</span> : <span className="text-amber-400">진행</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── ⑦ 손님별 전체 ── */}
      <Card title="손님별 정산" icon="list-ordered" note="머니인 많은 순. 명단에만 있고 바인이 없는 손님도 인원에는 들어갑니다.">
        <div className="max-h-112 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-lg text-left text-xs">
            <thead className="sticky top-0 z-10 bg-surface-mid">
              <tr className="border-b border-border-subtle text-2xs text-ink-muted">
                <th className="py-1.5 pr-2 font-semibold">손님</th>
                <th className="py-1.5 px-2 font-semibold">유형</th>
                <th className="py-1.5 px-2 text-right font-semibold">바인</th>
                <th className="py-1.5 px-2 text-right font-semibold">머니인</th>
                <th className="py-1.5 px-2 text-right font-semibold">받은 금액</th>
                <th className="py-1.5 pl-2 text-right font-semibold">미수</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.players.map((p) => (
                <tr key={p.name} className="border-b border-border-subtle/60 last:border-0">
                  <td className="py-2 pr-2 font-semibold text-ink-primary">{p.name}</td>
                  <td className="py-2 px-2 text-2xs text-ink-muted">{visitorLabel(p.visitorType) || '—'}</td>
                  <td className="py-2 px-2 text-right text-ink-secondary">{p.buyins}</td>
                  <td className="py-2 px-2 text-right text-ink-secondary">{man(p.moneyIn)}</td>
                  <td className="py-2 px-2 text-right text-emerald-700 dark:text-emerald-300">{man(p.paid)}</td>
                  <td className={`py-2 pl-2 text-right ${p.unpaid > 0 ? 'font-bold text-danger-light' : 'text-ink-muted'}`}>{man(p.unpaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── 티켓 대조(F4-02) ─────────────────────────────────────────────────────────
// 장수만 보인다(금액 없음) — 장부 권한 직원도 레지 마감 때 확인한다(오너 2026-10-04). 정의는 lib/ticketCheck.ts 머리.
function TicketCheckCard({ tc }: { tc: TicketCheck | 'staffOld' | 'error' | null }) {
  const n = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const short = tc && typeof tc === 'object' ? tc.rows.filter((x) => x.shortT > 0) : [];
  return (
    <section data-testid="ticket-check" className="rounded-aura border card-aura p-3.5">
      <div className="mb-2.5 flex items-center gap-2 border-b border-border-subtle pb-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad" aria-hidden>
          <Icon name="ticket" size={14} />
        </span>
        <h3 className="text-sm font-bold text-ink-primary">티켓 대조</h3>
      </div>
      {tc === null && <div className="skeleton h-16 rounded-input" aria-busy="true" />}
      {tc === 'error' && <p role="alert" className="text-xs text-danger-light">들어온 이용권 기록을 불러오지 못했어요 · 새로고침해 주세요</p>}
      {tc === 'staffOld' && <p className="text-xs text-ink-muted">지난 마감 장부의 티켓 대조는 업주가 볼 수 있어요. 오늘 장부(마감 뒤 17시간까지)는 여기서 확인할 수 있어요.</p>}
      {tc && typeof tc === 'object' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="장부 티켓" value={`${n(tc.ledgerT)}장`} sub={`티켓 바인 ${tc.ticketBuyins}회`} />
            <Tile label="들어온 이용권" value={`${n(tc.receivedT)}장`} sub={tc.extraT > 0 ? `장부 미기록 ${n(tc.extraT)}장` : '손님 지갑에서 차감'} />
            <div data-testid="ticket-short"><Tile label="부족" value={`${n(tc.shortT)}장`} tone={tc.shortT > 0 ? 'danger' : 'emerald'}
              sub={tc.shortT > 0 ? '장부에 적었는데 안 들어온 이용권' : '장부와 맞아요'} /></div>
          </div>
          {short.length > 0 && (
            <ul className="mt-2.5 space-y-1 text-xs" aria-label="확인할 손님">
              {short.map((x) => (
                <li key={x.name} className="flex items-center justify-between gap-2 rounded-input border card-aura-sub px-3 py-1.5 tabular-nums">
                  <span className="min-w-0 truncate font-semibold text-ink-primary">{x.name}</span>
                  <span className="shrink-0 text-ink-muted">장부 {n(x.ledgerT)}장 · 들어옴 {x.receivedT}장 · <b className="text-danger-light">부족 {n(x.shortT)}장</b></span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="mt-2.5 text-2xs leading-relaxed text-ink-muted">
        장부 티켓 = 장부에 이용권으로 받았다고 적은 장수(바인 + 애드온, 가불 제외). 들어온 이용권 = 이 날짜에 이 매장에서 실제로 사용된 이용권(승인 대기 포함).
        손님은 이름으로 맞춰요 — 장부에 다른 이름으로 적었으면 따로 보일 수 있어요.
      </p>
    </section>
  );
}

// ── 작은 부품 ────────────────────────────────────────────────────────────────

const TONE: Record<string, string> = {
  emerald: 'text-emerald-700 dark:text-emerald-300',
  danger: 'text-danger-light',
  amber: 'text-amber-600 dark:text-amber-300',
  accent: 'text-accent-200',
  muted: 'text-ink-secondary',
};

function Kpi({ label, value, hint, tone = 'muted', testId }: { label: string; value: string; hint?: string; tone?: keyof typeof TONE | string; testId?: string }) {
  return (
    <div className="rounded-aura border card-aura px-3 py-2.5">
      <p data-testid={testId} className="text-2xs font-semibold text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-extrabold tabular-nums ${TONE[tone] ?? TONE.muted}`}>{value}</p>
      {/* C1 S-2(2026-10-02) — 390 에서 '첫 바인 270 · 리바인 811 · 엔…' 이 잘렸다(196/146px). 보조줄은 줄바꿈을 허용한다. */}
      {hint && <p className="mt-0.5 break-keep text-2xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function Card({ title, icon, note, children }: { title: string; icon: IconName; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-aura border card-aura p-3.5">
      <div className="mb-2.5 flex items-center gap-2 border-b border-border-subtle pb-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad" aria-hidden>
          <Icon name={icon} size={14} />
        </span>
        <h3 className="text-sm font-bold text-ink-primary">{title}</h3>
      </div>
      {children}
      {note && <p className="mt-2.5 text-2xs leading-relaxed text-ink-muted">{note}</p>}
    </section>
  );
}

function Line({ label, value, sub, tone = 'muted' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-input border card-aura-sub px-3 py-2">
      <p className="text-2xs font-semibold text-ink-muted">{label}</p>
      <p className={`whitespace-nowrap text-lg font-extrabold tabular-nums ${TONE[tone] ?? TONE.muted}`}>{value}</p>
      {sub && <p className="text-2xs text-ink-muted">{sub}</p>}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-input border card-aura-sub px-2.5 py-2">
      <p className="truncate text-2xs font-semibold text-ink-muted" title={label}>{label}</p>
      <p className={`text-sm font-extrabold tabular-nums ${tone ? TONE[tone] : 'text-ink-primary'}`}>{value}</p>
      {sub && <p className="text-2xs tabular-nums text-ink-muted">{sub}</p>}
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="shrink-0 text-2xs font-semibold text-ink-muted">{label}</dt>
      <dd className="text-sm font-bold tabular-nums text-ink-primary">{value}{sub && <span className="ml-1 text-2xs font-normal text-ink-muted">{sub}</span>}</dd>
    </div>
  );
}

function Rank({ title, icon, rows, value, sub, empty, note, tone }: {
  title: string; icon: IconName; rows: SettlePlayer[];
  value: (p: SettlePlayer) => string; sub: (p: SettlePlayer) => string;
  empty: string; note?: string; tone?: string;
}) {
  // 상위 8명 — 그 아래는 '손님별 정산' 표가 전부 보여준다. 잘랐다는 사실은 밝힌다.
  const top = rows.slice(0, 8);
  return (
    <Card title={title} icon={icon} note={note}>
      {top.length === 0 ? (
        <p className="py-3 text-center text-2xs text-ink-muted">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {top.map((p, i) => (
            <li key={p.name} className="flex items-center gap-2 rounded-input border card-aura-sub px-2.5 py-1.5">
              <span className="w-4 shrink-0 text-center text-2xs font-bold tabular-nums text-ink-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary" title={p.name}>{p.name}</span>
              <span className="shrink-0 text-right">
                <span className={`block text-xs font-extrabold tabular-nums ${tone ? TONE[tone] : 'text-ink-primary'}`}>{value(p)}</span>
                <span className="block text-2xs tabular-nums text-ink-muted">{sub(p)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {rows.length > top.length && (
        <p className="mt-2 text-2xs text-ink-muted">상위 {top.length}명만 표시 — 나머지 {rows.length - top.length}명은 아래 ‘손님별 정산’에 있습니다.</p>
      )}
    </Card>
  );
}
