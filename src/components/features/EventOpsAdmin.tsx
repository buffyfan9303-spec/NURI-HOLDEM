// 관리자 — 이벤트 운영(§6). 목록 → 초안 → 카드판 → 검증 → 공개 → 종료 → 다음 회차.
//
// 이 화면이 **하지 않는** 것(서버에도 경로가 없다 — 화면만 지워도 안전해지지 않는다는 뜻이다):
//   · 열린 카드 닫기 · 당첨자 변경 · 특정 사용자 당첨 강제 · 판 초기화.
//   · 진행 중 미개봉 당첨 **위치** 표시. 서버가 집계만 내려주므로 화면에는 그릴 데이터 자체가 없다.
//
// ⚠ 마이그레이션 20260912c 는 **아직 운영에 적용되지 않았다**(오너 승인 대기).
//   적용 전에는 모든 RPC 가 PGRST202 로 실패한다. 그때 이 화면은 '이벤트 0건' 이라고 말하지 않고
//   '서버 미적용' 이라고 말한다 — 그 구분이 없으면 관리자가 없는 이벤트를 새로 만들려다 또 실패한다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  adminListEventCampaigns, adminCreateEventCampaign, adminComposeEventCards,
  adminValidateEventCampaign, adminPublishEventCampaign, adminEndEventCampaign,
  adminDeleteEventDraft, adminSetEventCampaignHidden, isEventRpcMissing,
  evaluateEvent, eventNow, EVENT_STATE_LABEL, ADMIN_EVENT_STATES,
  rowsReportVisibility, loadEventMenuVisibility, saveEventMenuVisible, eventShareUrl,
  nextRoundDraft,
  type AdminEventCampaign, type EventState, type EventTierSpec, type EventValidation, type EventDraftInput,
} from '../../api/adminEvents';
// slug 허용 목록만 손님 모듈에서 가져온다 — 서버·손님 진입(`?event=`)과 같은 판정을 써야 한다.
import { isEventSlug } from '../../api/events';
import type { Venue } from '../../api/community';
import { useToast } from '../atoms/Toast';
import { msgOf } from '../../lib/dbError';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';

const PHASE_TONE: Record<EventState, string> = {
  unknown: 'bg-surface-high text-ink-muted',
  draft: 'bg-surface-high text-ink-secondary',
  scheduled: 'bg-cyan-400/15 text-cyan-300',
  live: 'bg-emerald-500/15 text-emerald-300',
  hidden: 'bg-amber-400/15 text-amber-300',
  expired: 'bg-surface-high text-ink-muted',
  soldout: 'bg-amber-400/15 text-amber-300',
  ended: 'bg-surface-high text-ink-muted',
};

/** 상태는 색만으로 전달하지 않는다(§11) — 라벨 글자가 늘 함께 간다. */
function PhaseBadge({ phase }: { phase: EventState }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-bold ${PHASE_TONE[phase]}`}>
      {EVENT_STATE_LABEL[phase]}
    </span>
  );
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** 오류 → 한 문장. ⚠ `e.message` 를 직접 쓰지 않는다 — `msgOf` 만이 내부 SQLSTATE 원문
 *  (`permission denied for function admin_list_…`)을 걸러내고 42501 을 행동 가능한 문장으로 옮긴다.
 *  직접 쓰던 시절 그 문자열이 실제 DOM 에 그려졌다(보안 표준 6번). */
const errText = (e: unknown, fallback = '처리하지 못했습니다') => msgOf(e, fallback);

/** 서버 미적용 안내 — '0건' 으로 위장하지 않기 위한 전용 카드. */
function RpcMissingCard({ onRetry }: { onRetry: () => void }) {
  return (
    <section data-testid="event-ops-rpc-missing" className="rounded-card border border-amber-400/40 bg-amber-400/[0.06] p-3 space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-amber-300">
        <Icon name="alert" size={15} className="shrink-0" />이벤트 관리 기능이 서버에 아직 없습니다
      </h3>
      <p className="text-2xs leading-relaxed text-ink-secondary">
        마이그레이션 <code className="rounded bg-surface-high px-1">20260912c_admin_event_ops.sql</code> 이 운영 DB 에 적용되지 않았습니다.
        <strong className="text-ink-primary"> 이벤트가 0건이라는 뜻이 아닙니다</strong> — 목록을 읽을 방법이 아직 없다는 뜻입니다.
        적용 전에는 만들기·공개·종료가 모두 거절되며, 이미 진행 중인 이벤트에는 아무 영향이 없습니다.
      </p>
      <button type="button" onClick={onRetry} className="btn-ghost px-2 py-1.5 text-2xs">다시 확인</button>
    </section>
  );
}

// ── ① 사이트 이벤트 메뉴 표시 ────────────────────────────────────────────────
// 세 가지 제어 중 **첫 번째**다. 나머지 둘(캠페인 공개/숨김 · 행사 종료)과 같은 것처럼 보이면 안 되므로
// 카드를 따로 두고, 이 스위치가 **하지 않는 일**을 카드 안에서 분명히 적는다.
//
// ⚠ 이 카드는 캠페인 목록 RPC 와 **독립이다**(app_settings 는 20260912c 와 무관하다).
//   그래서 목록이 '서버 미적용' 이어도 메뉴 스위치는 그대로 쓸 수 있어야 한다.
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'failed'; error: unknown };

function EventMenuCard() {
  const [visible, setVisible] = useState(true);      // 조회 실패·미설정은 **표시**가 기본이다
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  // 연타·재진입 차단은 ref 로 한다 — setState 는 배칭돼서 두 번째 클릭이 먼저 통과한다.
  const busy = useRef(false);

  const load = useCallback(() => {
    void loadEventMenuVisibility().then(({ visible: v, error }) => {
      setVisible(v); setLoadErr(error); setLoaded(true);
    });
  }, []);
  useEffect(load, [load]);

  const apply = async (next: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setSave({ kind: 'saving' });
    try {
      // ⚠ 성공 표시는 **서버 응답 뒤에만**. 그리고 화면 값은 내가 보낸 값이 아니라 서버가 돌려준 값으로 맞춘다
      //   (다른 관리자가 그 사이 바꿨을 수 있다).
      const server = await saveEventMenuVisible(next);
      setVisible(server);
      setLoadErr(null);
      setSave({ kind: 'saved' });
    } catch (e) {
      // 실패하면 화면 값을 바꾸지 않는다 — 꺼졌는지 켜졌는지 모르는 채로 켜진 것처럼 보이면 안 된다.
      setSave({ kind: 'failed', error: e });
    } finally { busy.current = false; }
  };

  const saving = save.kind === 'saving';
  return (
    <section data-testid="event-menu-card" className="rounded-aura border card-aura p-3 space-y-2">
      <h3 className="text-sm font-bold text-ink-primary">사이트 이벤트 메뉴 표시</h3>
      <p className="text-2xs leading-relaxed text-ink-secondary">
        홈과 내비게이션에 <strong className="text-ink-primary">이벤트 진입점</strong>을 보여줍니다.
        진행 중인 행사가 없어도 안내 화면으로 들어갈 수 있습니다.
      </p>
      <p className="rounded-input bg-surface-base px-2 py-1.5 text-2xs leading-relaxed text-ink-muted">
        ⓘ <strong className="text-ink-secondary">메뉴를 숨겨도 행사는 계속 진행됩니다.</strong>{' '}
        참여를 멈추려면 아래 목록에서 해당 캠페인을 <strong className="text-ink-secondary">숨기기</strong> 하거나
        <strong className="text-ink-secondary"> 행사 종료</strong>를 쓰세요. 서로 다른 설정입니다.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="event-menu-state" className="text-2xs font-bold text-ink-secondary">
          현재: {loaded ? (visible ? '표시 중' : '숨김') : '불러오는 중…'}
        </span>
        <button
          type="button" data-testid="event-menu-toggle" disabled={saving || !loaded}
          onClick={() => void apply(!visible)}
          className="btn-ghost px-3 py-1.5 text-2xs disabled:opacity-50"
        >
          {saving ? '저장 중…' : visible ? '메뉴 숨기기' : '메뉴 표시하기'}
        </button>
        {save.kind === 'saved' && (
          <span data-testid="event-menu-saved" className="text-2xs text-emerald-300">저장했습니다</span>
        )}
        {save.kind === 'failed' && (
          <span data-testid="event-menu-failed" className="flex items-center gap-1 text-2xs text-danger-light">
            <Icon name="alert" size={12} className="shrink-0" />
            {errText(save.error, '저장하지 못했습니다')} — 설정은 바뀌지 않았습니다
          </span>
        )}
      </div>

      {loadErr != null && (
        // ⚠ 조회 실패를 '메뉴 숨김' 으로 해석하지 않는다(문서 §8-2). 진입 경로는 열어 둔 채 오류만 알린다.
        <p data-testid="event-menu-load-error" className="flex items-start gap-1 text-2xs text-amber-300">
          <Icon name="alert" size={12} className="mt-px shrink-0" />
          <span className="break-words">
            {errText(loadErr, '설정을 불러오지 못했습니다')} — 지금 표시는 <strong>기본값(표시)</strong>이며 실제 저장값이 아닙니다.{' '}
            <button type="button" onClick={load} className="underline">다시 확인</button>
          </span>
        </p>
      )}
    </section>
  );
}

// ── 목록 ────────────────────────────────────────────────────────────────────
export default function EventOpsAdmin({ venues }: { venues: Venue[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<AdminEventCampaign[]>([]);
  const [err, setErr] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<'all' | EventState>('all');
  const [venueFilter, setVenueFilter] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [seed, setSeed] = useState<EventDraftInput | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminListEventCampaigns()
      .then((r) => { setErr(null); setRows(r); })
      /* ⚠ 여기서 시계를 보정하지 않는다.
         예전에는 `noteServerTime(r[0].createdAt)` 이 있었다. 목록은 `created_at desc` 라 `r[0]` 은
         **가장 최근에 만든 캠페인의 생성 시각** — 즉 언제나 과거다. 그 값을 '서버의 지금' 으로 먹으면
         관리자 화면의 '지금' 이 캠페인의 나이만큼 뒤로 밀려, 진행 중이 '시작 전' 으로 · 끝난 것이
         '진행 중' 으로 보였다(숨기기·행사 종료 오판). 오차는 캠페인을 새로 만들 때만 줄어들었다.
         게다가 `eventNow()` 는 같은 모듈의 전역이라 그 오염이 **손님 화면 판정까지** 번졌다.
         보정을 되살리려면 근거는 **서버가 '지금' 이라고 말한 값**이어야 한다(응답 Date 헤더 또는
         RPC 가 함께 싣는 now()). 그런 값이 생기기 전까지는 보정 없이 기기 시계를 쓴다 —
         최종 판정은 어차피 서버 RPC 가 한다. */
      // ⚠ 실패를 빈 목록으로 바꾸지 않는다. rows 는 비우되 err 가 화면을 지배한다.
      .catch((e) => { setErr(e); setRows([]); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  // 목록이 공개 여부를 싣고 있는가 = 20260912d 적용 여부. 모르면 화면이 '확인 불가' 라고 말한다.
  const visibilityKnown = useMemo(() => rowsReportVisibility(rows), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (venueFilter && c.venueId !== venueFilter) return false;
      if (phaseFilter !== 'all' && evaluateEvent(c, eventNow()).state !== phaseFilter) return false;
      if (!needle) return true;
      return [c.title, c.slug, c.venueName ?? '', c.voucherTitle].some((s) => s.toLowerCase().includes(needle));
    });
  }, [rows, q, phaseFilter, venueFilter]);

  // 필터를 바꾸면 필터 밖으로 나간 상세는 닫는다 — 보이지 않는 대상을 계속 조작하지 않게 한다(§11).
  useEffect(() => {
    if (openId && !shown.some((c) => c.id === openId)) setOpenId(null);
  }, [shown, openId]);

  const copy = async (c: AdminEventCampaign) => {
    const url = eventShareUrl(c.slug);
    try { await navigator.clipboard.writeText(url); toast.show('공유 링크를 복사했습니다', 'success'); }
    catch { toast.show(url, 'info'); }
  };

  // ⚠ 목록 RPC 가 없어도 **메뉴 스위치는 남긴다** — 둘은 서로 다른 저장소(app_settings vs event_campaigns)다.
  if (isEventRpcMissing(err)) {
    return (
      <div className="space-y-3">
        <EventMenuCard />
        <RpcMissingCard onRetry={load} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <EventMenuCard />

      {!visibilityKnown && (
        <p data-testid="event-visibility-unsupported" className="flex items-start gap-1 rounded-card border border-amber-400/40 bg-amber-400/[0.06] px-2.5 py-2 text-2xs leading-relaxed text-amber-300">
          <Icon name="alert" size={12} className="mt-px shrink-0" />
          <span className="break-words">
            캠페인 <strong>공개 여부</strong>를 서버가 아직 알려주지 않습니다(마이그레이션 20260912d 미적용).
            지금은 숨기기·다시 공개가 거절되며, 목록의 공개 상태는 <strong>확인 불가</strong>입니다.
            진행 중인 행사에는 아무 영향이 없습니다.
          </span>
        </p>
      )}

      {/* 검색·필터 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="relative min-w-[9rem] flex-1">
          <span className="sr-only">이벤트 검색</span>
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="제목 · 링크 주소 · 매장"
            className="input w-full py-1.5 pl-7 text-xs"
          />
          <Icon name="search" size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
        </label>
        <select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} className="input py-1.5 text-xs">
          <option value="">전체 매장</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value as 'all' | EventState)} className="input py-1.5 text-xs">
          <option value="all">전체 상태</option>
          {ADMIN_EVENT_STATES.map((p) =>
            <option key={p} value={p}>{EVENT_STATE_LABEL[p]}</option>)}
        </select>
        <button type="button" onClick={load} className="btn-ghost shrink-0 px-2 py-1.5 text-2xs">새로고침</button>
        <button type="button" data-testid="event-ops-new" onClick={() => { setSeed(null); setCreating(true); }} className="btn-primary shrink-0 px-3 py-1.5 text-2xs">새 이벤트</button>
      </div>

      {creating && (
        <DraftForm
          venues={venues} seed={seed}
          onCancel={() => { setCreating(false); setSeed(null); }}
          onCreated={(id) => { setCreating(false); setSeed(null); setOpenId(id); load(); }}
        />
      )}

      {err != null && <LoadErrorCard error={err} what="이벤트 목록" onRetry={load} compact />}

      {/* 0건과 조회 실패를 구분한다 — 실패는 위 카드가 말하고, 여기는 정말 0건일 때만 */}
      {err == null && !loading && rows.length === 0 && (
        <p className="rounded-aura border card-aura px-3 py-6 text-center text-2xs text-ink-muted">
          아직 만든 이벤트가 없습니다. ‘새 이벤트’로 초안을 만들어 보세요.
        </p>
      )}
      {err == null && !loading && rows.length > 0 && shown.length === 0 && (
        <p className="rounded-aura border card-aura px-3 py-6 text-center text-2xs text-ink-muted">
          검색·필터 조건에 맞는 이벤트가 없습니다 (전체 {rows.length}건).
        </p>
      )}
      {loading && <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>}

      <ul className="space-y-2">
        {shown.map((c) => (
          <EventRow
            key={c.id} c={c} open={openId === c.id} visibilityKnown={visibilityKnown}
            onToggle={() => setOpenId(openId === c.id ? null : c.id)}
            onCopy={() => copy(c)}
            onChanged={load}
            onNextRound={() => { setSeed(nextRoundDraft(c, '')); setCreating(true); }}
          />
        ))}
      </ul>
    </div>
  );
}

// ── 한 줄 + 상세 ────────────────────────────────────────────────────────────
function EventRow({ c, open, visibilityKnown, onToggle, onCopy, onChanged, onNextRound }: {
  c: AdminEventCampaign; open: boolean; visibilityKnown: boolean;
  onToggle: () => void; onCopy: () => void;
  onChanged: () => void; onNextRound: () => void;
}) {
  const phase = evaluateEvent(c, eventNow()).state;
  // 실제 조치가 필요한 것 — 목록에서 바로 보여야 한다(§6 목록).
  const alerts: string[] = [];
  if (!c.venueApproved) alerts.push('매장 이용권 발급 미승인');
  if (c.totalVouchers > c.venueQuota && phase !== 'ended') alerts.push(`발급 한도 부족 (필요 ${c.totalVouchers} / 남은 한도 ${c.venueQuota})`);
  if (phase === 'soldout') alerts.push('카드 소진 — 참여권 지급이 멈춰 있습니다');
  if (phase === 'draft' && c.totalCards === 0) alerts.push('카드판 미구성');
  if (phase === 'hidden') alerts.push('숨김 — 손님에게 보이지 않고 새 참여가 멈춰 있습니다 (이력은 보존)');
  if (phase === 'expired') alerts.push('기간 종료 — 새 참여가 끝났습니다. 목록을 정리하려면 ‘행사 종료’를 누르세요');

  return (
    <li className="rounded-aura border card-aura">
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className="flex flex-wrap items-center gap-1.5">
            <PhaseBadge phase={phase} />
            <span className="text-xs font-bold text-ink-primary break-all">{c.title}</span>
            <span className="text-2xs text-ink-muted break-all">/?event={c.slug}</span>
          </p>
          <p className="mt-0.5 text-2xs text-ink-muted break-words">
            {c.venueName ?? '(삭제된 매장)'} · {fmtDate(c.startsAt)} ~ {fmtDate(c.endsAt)} · 참여권 지급 {c.ticketVenueName ?? '모든 매장'}
            {' · 손님에게 '}
            {/* 초안은 애초에 손님에게 안 나간다 — '공개' 라고 쓰면 세 제어가 다시 섞여 보인다. */}
            <strong data-testid="event-visibility-label" className={c.hiddenAt == null && c.status !== 'draft' ? 'text-ink-secondary' : 'text-amber-300'}>
              {c.status === 'draft' ? '비공개 (초안)'
                : !visibilityKnown ? '확인 불가'
                  : c.hiddenAt == null ? '공개' : '숨김'}
            </strong>
          </p>
          <p className="mt-0.5 text-2xs tabular-nums text-ink-secondary break-words">
            카드 {c.openedCards}/{c.totalCards} 개봉 · 남은 당첨 {c.remainPrizeCards}/{c.prizeCards} ·
            {' '}참여권 {c.ticketsUsed}/{c.ticketsIssued} 사용 · 이용권 {c.vouchersUsed}/{c.vouchersIssued} 사용
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onCopy} className="btn-ghost px-2 py-1.5 text-2xs">공유 링크</button>
          <button type="button" onClick={onToggle} className="btn-ghost px-2 py-1.5 text-2xs">{open ? '닫기' : '열기'}</button>
        </div>
      </div>
      {alerts.length > 0 && (
        <ul className="border-t border-border-subtle px-2.5 py-1.5 space-y-0.5">
          {alerts.map((a) => (
            <li key={a} className="flex items-start gap-1 text-2xs text-amber-300">
              <Icon name="alert" size={12} className="mt-px shrink-0" /><span className="break-words">{a}</span>
            </li>
          ))}
        </ul>
      )}
      {open && <EventDetail c={c} visibilityKnown={visibilityKnown} onChanged={onChanged} onNextRound={onNextRound} />}
    </li>
  );
}

function EventDetail({ c, visibilityKnown, onChanged, onNextRound }: {
  c: AdminEventCampaign; visibilityKnown: boolean; onChanged: () => void; onNextRound: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<EventValidation | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [endReason, setEndReason] = useState('');
  const phase = evaluateEvent(c, eventNow()).state;
  const hidden = c.hiddenAt != null;
  // 연타 차단은 ref 로도 건다 — setBusy 는 배칭돼서 같은 프레임의 두 번째 클릭이 통과한다.
  const inflight = useRef(false);

  const run = async (label: string, fn: () => Promise<unknown>, after?: () => void) => {
    if (busy || inflight.current) return;   // 중복 클릭 방지 — 응답 전 두 번째 요청을 만들지 않는다
    inflight.current = true;
    setBusy(true);
    // ⚠ 성공 표시는 서버 응답 뒤에만. 실패하면 아무것도 '완료' 라고 말하지 않는다.
    try { await fn(); toast.show(`${label} 완료`, 'success'); after?.(); onChanged(); }
    catch (e) { toast.show(errText(e, `${label} 실패`), 'error'); }
    finally { setBusy(false); inflight.current = false; }
  };

  const validate = async () => {
    if (busy) return;
    setBusy(true);
    try { setCheck(await adminValidateEventCampaign(c.id)); }
    catch (e) { toast.show(errText(e, '검증에 실패했습니다'), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="border-t border-border-subtle p-2.5 space-y-2.5">
      {c.status === 'draft' && <CardComposer campaignId={c.id} current={c} onDone={() => { setCheck(null); onChanged(); }} />}

      <section className="rounded-input border border-border-subtle bg-surface-base p-2.5 space-y-1.5">
        <h4 className="text-2xs font-bold text-ink-secondary">검증</h4>
        <button type="button" disabled={busy} onClick={validate} className="btn-ghost px-2 py-1.5 text-2xs">검증 실행</button>
        {check && (check.ok
          ? <p className="text-2xs text-emerald-300">문제 없음 — 카드 {check.summary.totalCards}장 · 당첨 {check.summary.prizeCards}장 · 이용권 {check.summary.totalVouchers}장 (매장 한도 {check.summary.venueQuota}장)</p>
          : (
            <ul className="space-y-0.5">
              {check.problems.map((p) => (
                <li key={p.code} className="flex items-start gap-1 text-2xs text-danger-light">
                  <Icon name="alert" size={12} className="mt-px shrink-0" /><span className="break-words">{p.message}</span>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <div className="flex flex-wrap gap-1.5">
        {c.status === 'draft' && (
          <button
            type="button" disabled={busy} data-testid="event-ops-publish"
            onClick={() => run('공개', () => adminPublishEventCampaign(c.id))}
            className="btn-primary px-3 py-1.5 text-2xs"
          >공개하기</button>
        )}
        {/* ② 개별 캠페인 공개/숨김 — lifecycle 과 **별도 축**이라 status 는 'live' 그대로 남는다. */}
        {c.status === 'live' && (
          <button
            type="button" disabled={busy} data-testid={hidden ? 'event-ops-unhide' : 'event-ops-hide'}
            onClick={() => {
              if (hidden) { void run('다시 공개', () => adminSetEventCampaignHidden(c.id, false)); return; }
              const reason = window.prompt(
                `‘${c.title}’(${c.venueName ?? '매장 미상'})을 손님에게 숨깁니다.\n\n`
                + '· 손님 화면과 공유 링크에서 보이지 않습니다\n'
                + '· 새 참여가 멈춥니다 (카드 열기·참여권 지급 중단)\n'
                + '· 관리자는 계속 볼 수 있고, 이미 받은 이용권·당첨·이력은 그대로 남습니다\n'
                + '· 행사 종료가 아닙니다 — 언제든 다시 공개할 수 있습니다\n\n'
                + '사유를 적어 주세요 (감사기록에 남습니다)',
              );
              if (reason === null) return;
              void run('숨기기', () => adminSetEventCampaignHidden(c.id, true, reason));
            }}
            className="rounded-input border border-border-default px-3 py-1.5 text-2xs text-ink-secondary"
          >{hidden ? '다시 공개' : '숨기기'}</button>
        )}
        {/* ③ 행사 종료 — 되돌릴 수 없다. 확인창에 **매장·캠페인 이름과 실제 효과**를 적는다. */}
        {c.status === 'live' && !confirmEnd && (
          <button
            type="button" disabled={busy} data-testid="event-ops-end"
            onClick={() => { setEndReason(''); setConfirmEnd(true); }}
            className="rounded-input border border-border-default px-3 py-1.5 text-2xs text-ink-secondary hover:text-danger-light"
          >행사 종료</button>
        )}
        {c.status === 'draft' && (
          <button
            type="button" disabled={busy}
            onClick={() => {
              if (!window.confirm('이 초안을 삭제합니다. 참여권·개봉·발급 이력이 있으면 서버가 거절합니다.')) return;
              void run('초안 삭제', () => adminDeleteEventDraft(c.id));
            }}
            className="rounded-input border border-border-default px-3 py-1.5 text-2xs text-ink-muted hover:text-danger-light"
          >초안 삭제</button>
        )}
        {(c.status === 'ended' || phase === 'soldout') && (
          <button type="button" onClick={onNextRound} className="rounded-input border border-border-default px-3 py-1.5 text-2xs text-ink-secondary">
            다음 회차 만들기 (설정만 복사)
          </button>
        )}
      </div>
      {confirmEnd && (
        <section data-testid="event-ops-end-confirm" className="rounded-input border border-danger-light/40 bg-danger-light/[0.06] p-2.5 space-y-2">
          <h4 className="text-2xs font-bold text-danger-light">행사 종료 — 되돌릴 수 없습니다</h4>
          <p className="text-2xs leading-relaxed text-ink-secondary break-words">
            <strong className="text-ink-primary">{c.venueName ?? '매장 미상'}</strong> 의{' '}
            <strong className="text-ink-primary">‘{c.title}’</strong> 행사를 종료합니다.
          </p>
          <ul className="space-y-0.5 text-2xs leading-relaxed text-ink-muted">
            <li>· 새 참여가 끝납니다 — 카드 열기와 참여권 지급이 멈춥니다.</li>
            <li>· <strong className="text-ink-secondary">기존 당첨 이용권과 사용 이력은 유지됩니다.</strong> 손님 지갑에서 그대로 쓸 수 있습니다.</li>
            <li>· 이미 나간 참여권 {c.ticketsIssued - c.ticketsUsed}장은 쓸 곳이 없어집니다.</li>
            <li>· 종료한 행사는 다시 열 수 없습니다 — 다음 행사는 <strong className="text-ink-secondary">새 회차</strong>로 만듭니다.</li>
            <li>· 잠시 멈추려는 것이라면 종료 대신 <strong className="text-ink-secondary">숨기기</strong>를 쓰세요.</li>
          </ul>
          <label className="block space-y-0.5">
            <span className="text-2xs text-ink-secondary">종료 사유 (감사기록에 남습니다)</span>
            <input value={endReason} onChange={(e) => setEndReason(e.target.value)} className="input w-full py-1.5 text-xs" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button" disabled={busy} data-testid="event-ops-end-confirm-go"
              onClick={() => void run('행사 종료', () => adminEndEventCampaign(c.id, endReason), () => setConfirmEnd(false))}
              className="rounded-input border border-danger-light/60 px-3 py-1.5 text-2xs font-bold text-danger-light disabled:opacity-50"
            >{busy ? '종료하는 중…' : '행사 종료'}</button>
            <button type="button" disabled={busy} onClick={() => setConfirmEnd(false)} className="btn-ghost px-3 py-1.5 text-2xs">취소</button>
          </div>
        </section>
      )}

      <p className="text-2xs leading-relaxed text-ink-muted">
        공개 이후에는 카드 배치·개봉 결과를 바꿀 수 없습니다. 다음 행사는 기존 판 초기화가 아니라 새 회차로 만듭니다.
        종료해도 결과·발급된 이용권·감사 이력은 그대로 보존됩니다.
      </p>
      <p className="text-2xs leading-relaxed text-ink-muted">
        <strong className="text-ink-secondary">숨기기</strong>는 이 행사만 손님에게 감추고 새 참여를 멈춥니다(관리자는 계속 보임, 이력 보존).
        <strong className="text-ink-secondary"> 행사 종료</strong>는 새 참여를 끝냅니다.
        맨 위의 <strong className="text-ink-secondary">메뉴 표시</strong>는 진입점만 감출 뿐이라 참여가 멈추지 않습니다 — 세 가지는 서로 다릅니다.
        {!visibilityKnown && ' (숨기기·다시 공개는 마이그레이션 20260912d 적용 전에는 서버가 거절합니다.)'}
      </p>
    </div>
  );
}

// ── 카드판 구성 (초안 전용) ──────────────────────────────────────────────────
const DEFAULT_TIERS: EventTierSpec[] = [
  { tier: 1, cards: 1, vouchers: 10 },
  { tier: 2, cards: 2, vouchers: 5 },
  { tier: 3, cards: 3, vouchers: 2 },
  { tier: 4, cards: 11, vouchers: 1 },
];

function CardComposer({ campaignId, current, onDone }: { campaignId: string; current: AdminEventCampaign; onDone: () => void }) {
  const toast = useToast();
  const [total, setTotal] = useState(current.totalCards || 100);
  const [tiers, setTiers] = useState<EventTierSpec[]>(DEFAULT_TIERS);
  const [busy, setBusy] = useState(false);

  const prize = tiers.reduce((s, t) => s + (t.cards || 0), 0);
  const vouchers = tiers.reduce((s, t) => s + (t.cards || 0) * (t.vouchers || 0), 0);
  const blanks = total - prize;
  // 필드 가까이 설명한다(§6 입력 검증). 서버 가드는 그대로 있고, 여기는 왕복 전 안내다.
  const local: string[] = [];
  if (!Number.isInteger(total) || total < 1 || total > 1000) local.push('총 카드 수는 1~1000 사이의 정수여야 합니다');
  if (blanks < 0) local.push(`등급별 카드 수의 합(${prize}장)이 총 카드 수(${total}장)보다 많습니다`);
  if (prize === 0) local.push('당첨 카드가 0장입니다');
  if (tiers.some((t) => t.cards > 0 && t.vouchers < 1)) local.push('당첨 등급의 이용권 장수는 1장 이상이어야 합니다');
  if (tiers.some((t) => !Number.isInteger(t.cards) || !Number.isInteger(t.vouchers) || t.cards < 0 || t.vouchers < 0)) {
    local.push('카드 수·이용권 장수는 0 이상의 정수여야 합니다');
  }
  if (vouchers > current.venueQuota) local.push(`필요한 이용권 ${vouchers}장이 매장 발급 한도 ${current.venueQuota}장을 넘습니다`);

  const set = (i: number, k: 'cards' | 'vouchers', v: number) =>
    setTiers(tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)));

  const submit = async () => {
    if (busy || local.length > 0) return;
    setBusy(true);
    try {
      const r = await adminComposeEventCards(campaignId, total, tiers.filter((t) => t.cards > 0));
      toast.show(`카드 ${r.totalCards}장 생성 · 당첨 ${r.prizeCards}장 · 이용권 ${r.totalVouchers}장`, 'success');
      onDone();
    } catch (e) { toast.show(errText(e, '카드판을 만들지 못했습니다'), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-input border border-border-subtle bg-surface-base p-2.5 space-y-2">
      <h4 className="text-2xs font-bold text-ink-secondary">카드판 구성 (초안에서만)</h4>
      <p className="text-2xs leading-relaxed text-ink-muted">
        수량만 정하면 <strong className="text-ink-secondary">자리 배치는 서버가 무작위로</strong> 만듭니다.
        만든 사람도 어느 번호가 당첨인지 알 수 없습니다.
        {current.totalCards > 0 && <> 지금 {current.totalCards}장이 구성돼 있고, 다시 만들면 <strong className="text-ink-secondary">배치가 새로 섞입니다.</strong></>}
      </p>
      <label className="flex items-center gap-2 text-2xs text-ink-secondary">
        <span className="w-20 shrink-0">총 카드 수</span>
        <input
          type="number" min={1} max={1000} value={total}
          onChange={(e) => setTotal(Number(e.target.value))}
          className="input w-24 py-1 text-xs tabular-nums"
        />
        <span className="text-ink-muted">꽝 {blanks}장</span>
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[18rem] text-2xs">
          <thead className="text-ink-muted">
            <tr><th className="py-1 text-left font-normal">등급</th><th className="py-1 text-left font-normal">카드 수</th><th className="py-1 text-left font-normal">이용권/장</th><th className="py-1 text-left font-normal">합계</th></tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={t.tier}>
                <td className="py-0.5 pr-2 text-ink-secondary">{t.tier}등</td>
                <td className="py-0.5 pr-2">
                  <label><span className="sr-only">{t.tier}등 카드 수</span>
                    <input type="number" min={0} value={t.cards} onChange={(e) => set(i, 'cards', Number(e.target.value))} className="input w-20 py-1 text-2xs tabular-nums" />
                  </label>
                </td>
                <td className="py-0.5 pr-2">
                  <label><span className="sr-only">{t.tier}등 이용권 장수</span>
                    <input type="number" min={0} value={t.vouchers} onChange={(e) => set(i, 'vouchers', Number(e.target.value))} className="input w-20 py-1 text-2xs tabular-nums" />
                  </label>
                </td>
                <td className="py-0.5 tabular-nums text-ink-muted">{(t.cards || 0) * (t.vouchers || 0)}장</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-2xs tabular-nums text-ink-secondary">당첨 {prize}장 · 이용권 합계 {vouchers}장 · 매장 남은 한도 {current.venueQuota}장</p>
      {local.map((m) => (
        <p key={m} className="flex items-start gap-1 text-2xs text-danger-light">
          <Icon name="alert" size={12} className="mt-px shrink-0" /><span className="break-words">{m}</span>
        </p>
      ))}
      <button type="button" disabled={busy || local.length > 0} onClick={submit} className="btn-primary px-3 py-1.5 text-2xs disabled:opacity-50">
        {current.totalCards > 0 ? '카드판 다시 만들기' : '카드판 만들기'}
      </button>
    </section>
  );
}

// ── 초안 만들기 ─────────────────────────────────────────────────────────────
/** datetime-local 값 → ISO. 빈 값은 null(= 제한 없음). */
const toIso = (v: string): string | null => (v ? new Date(v).toISOString() : null);

function DraftForm({ venues, seed, onCancel, onCreated }: {
  venues: Venue[]; seed: EventDraftInput | null; onCancel: () => void; onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [venueId, setVenueId] = useState(seed?.venueId ?? '');
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState(seed?.title ?? '');
  const [subtitle, setSubtitle] = useState(seed?.subtitle ?? '');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  // 기본값은 **해당 매장 출석 → 해당 판 참여권**(§7). 모든 매장 지급은 사업 정책이라 기본이 아니다.
  const [ticketVenueId, setTicketVenueId] = useState(seed?.ticketVenueId ?? '');
  const [voucherTitle, setVoucherTitle] = useState(seed?.voucherTitle ?? '매장이용권');
  const [voucherExpiresAt, setVoucherExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);

  const problems: string[] = [];
  if (!venueId) problems.push('매장을 선택해 주세요');
  if (!isEventSlug(slug)) problems.push('링크 주소는 영문·숫자로 시작하고 영문·숫자·-·_ 만 쓸 수 있습니다');
  else if (slug !== slug.toLowerCase()) problems.push('링크 주소는 소문자로 입력해 주세요');
  if (!title.trim()) problems.push('이벤트 제목을 입력해 주세요');
  if (!voucherTitle.trim()) problems.push('경품 이용권 이름을 입력해 주세요');
  if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) problems.push('종료 시각이 시작 시각보다 빠르거나 같습니다');
  if (voucherExpiresAt && endsAt && new Date(voucherExpiresAt) < new Date(endsAt)) {
    problems.push('경품 이용권이 이벤트 종료보다 먼저 만료됩니다');
  }

  const submit = async () => {
    if (busy || problems.length > 0) return;
    setBusy(true);
    try {
      // ⚠ 발급 주체를 보내지 않는다 — 서버가 auth.uid() 로 유도한다.
      const r = await adminCreateEventCampaign({
        venueId, slug: slug.toLowerCase(), title: title.trim(),
        subtitle: subtitle.trim() || null,
        startsAt: toIso(startsAt), endsAt: toIso(endsAt),
        ticketVenueId: ticketVenueId || null,
        voucherTitle: voucherTitle.trim(),
        voucherExpiresAt: toIso(voucherExpiresAt),
      });
      toast.show('초안을 만들었습니다 — 카드판을 구성하세요', 'success');
      onCreated(r.id);
    } catch (e) {
      // 입력을 지우지 않는다(§3 저장) — 실패하면 그대로 두고 고쳐서 다시 보낼 수 있어야 한다.
      toast.show(errText(e, '초안을 만들지 못했습니다'), 'error');
    } finally { setBusy(false); }
  };

  const field = 'input w-full py-1.5 text-xs';
  return (
    <section data-testid="event-ops-draft-form" className="rounded-card border border-accent-400/30 bg-accent-300/[0.04] p-3 space-y-2">
      <h3 className="text-sm font-bold text-accent-300">새 이벤트 초안</h3>
      <p className="text-2xs text-ink-muted">초안은 손님에게 보이지 않고 참여권도 나가지 않습니다. 공개를 눌러야 시작됩니다.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-0.5"><span className="text-2xs text-ink-secondary">매장 (이용권을 발급할 곳)</span>
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className={field}>
            <option value="">선택</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <label className="space-y-0.5"><span className="text-2xs text-ink-secondary">참여권 지급 대상 매장</span>
          <select value={ticketVenueId} onChange={(e) => setTicketVenueId(e.target.value)} className={field}>
            <option value="">모든 매장 출석 (별도 정책 — 서버가 중복을 거절합니다)</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name} 출석만</option>)}
          </select>
        </label>
        <label className="space-y-0.5"><span className="text-2xs text-ink-secondary">링크 주소 (?event=)</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="card-open-2026-10" className={field} />
        </label>
        <label className="space-y-0.5"><span className="text-2xs text-ink-secondary">이벤트 제목</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <label className="space-y-0.5 sm:col-span-2"><span className="text-2xs text-ink-secondary">설명 (선택)</span>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={field} />
        </label>
        <label className="space-y-0.5"><span className="text-2xs text-ink-secondary">시작 시각 (비우면 공개 즉시)</span>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} />
        </label>
        <label className="space-y-0.5"><span className="text-2xs text-ink-secondary">종료 시각 (비우면 카드 소진까지)</span>
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={field} />
        </label>
        <label className="space-y-0.5"><span className="text-2xs text-ink-secondary">경품 이용권 이름</span>
          <input value={voucherTitle} onChange={(e) => setVoucherTitle(e.target.value)} className={field} />
        </label>
        <label className="space-y-0.5"><span className="text-2xs text-ink-secondary">경품 이용권 유효기간 (선택)</span>
          <input type="datetime-local" value={voucherExpiresAt} onChange={(e) => setVoucherExpiresAt(e.target.value)} className={field} />
        </label>
      </div>
      {problems.map((m) => (
        <p key={m} className="flex items-start gap-1 text-2xs text-danger-light">
          <Icon name="alert" size={12} className="mt-px shrink-0" /><span className="break-words">{m}</span>
        </p>
      ))}
      <div className="flex gap-1.5">
        <button type="button" disabled={busy || problems.length > 0} onClick={submit} className="btn-primary px-3 py-1.5 text-2xs disabled:opacity-50">초안 만들기</button>
        <button type="button" onClick={onCancel} className="btn-ghost px-3 py-1.5 text-2xs">취소</button>
      </div>
    </section>
  );
}
