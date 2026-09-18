// src/components/features/VenueEventRequestPanel.tsx
// 내 매장 → **이벤트 신청 · 제안**(오너 지시 2026-09-18).
//
// 오너 원문: "내 매장에 이벤트 만드는 란을 만들어줘 ... 매장이용권 몇장을 하고싶다 이런식으로 하면
//   신청해서 원하는 날자를 넣고 승인하면 내가 7일 이내에 적용시켜주는 방식으로
//   그리고 이벤트 제안도 넣어줘서 이벤트 제안하게 만들어줘 전부다 내 매장 안에"
//
// 두 갈래를 **한 화면**에 둔다(표도 하나다 — migrations/20260918e).
//   · 이벤트 신청(campaign) — 이용권 N장 · 원하는 날짜. 승인되면 운영자가 7일 이내에 개설한다.
//   · 이벤트 제안(idea)     — 장수·날짜 없이 아이디어만.
// 갈래를 두 화면으로 나누면 업주는 "내가 보낸 게 어디 갔지" 를 두 곳에서 찾아야 한다.
//
// ⚠ 화면 게이트는 권한이 아니다. 서버(`request_venue_event`)가 첫 줄에서 can_manage_pos 를 본다.
// ⚠ 승인은 **'하겠다' 표시**다(오너 결정). 승인 즉시 이벤트가 생기지 않는다 — 그 사실을 화면에 적는다.
//   "곧 열립니다" 같은 말을 쓰면 업주가 손님에게 그대로 옮기고, 그 약속은 우리가 못 지킨다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { kstToday } from '../../lib/kst';
import {
  requestVenueEvent, myVenueEventRequests,
  type VenueEventKind, type VenueEventRequest,
} from '../../api/venueEvents';

/** 경품 장수 빠른 선택. 직접 입력도 함께 둔다 — 매장마다 규모가 다르다. */
const COUNT_PRESETS = [10, 30, 50, 100, 300] as const;

const STATUS = {
  pending:  { label: '검토 중', cls: 'bg-amber-500/15 text-amber-400' },
  approved: { label: '승인됨',  cls: 'bg-emerald-500/15 text-emerald-300' },
  rejected: { label: '반려',    cls: 'bg-surface-float text-ink-muted' },
} as const;

/** KST 오늘 + n일 → 'YYYY-MM-DD'. 기기 로컬이 아니라 KST 로 센다(서버 판정과 같은 기준). */
const addKstDays = (n: number): string => kstToday(Date.now() + n * 86_400_000);

export default function VenueEventRequestPanel({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [kind, setKind] = useState<VenueEventKind>('campaign');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [count, setCount] = useState<number>(50);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  /** null = 아직 못 받음 / 'not-deployed' = 서버 준비 전 / 배열 = 받음 */
  const [mine, setMine] = useState<VenueEventRequest[] | 'not-deployed' | null>(null);
  const [loadErr, setLoadErr] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoadErr(null);
    myVenueEventRequests(venueId).then(setMine).catch(setLoadErr);
  }, [venueId]);
  useEffect(() => { load(); }, [load]);

  const rows = Array.isArray(mine) ? mine : [];
  const notDeployed = mine === 'not-deployed';
  /** 같은 갈래로 대기 중인 건이 있으면 서버가 거절한다 — 버튼에서 미리 말해 준다. */
  const pendingSame = useMemo(() => rows.filter((r) => r.kind === kind && r.status === 'pending').length, [rows, kind]);
  const blocked = kind === 'campaign' ? pendingSame >= 1 : pendingSame >= 3;

  const canSend = title.trim().length > 0
    && (kind === 'idea' || (count > 0 && !!start))
    && !blocked && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await requestVenueEvent(venueId, {
        kind,
        title: title.trim(),
        body: body.trim() || undefined,
        voucherCount: kind === 'campaign' ? count : undefined,
        desiredStart: kind === 'campaign' ? start : undefined,
        desiredEnd: kind === 'campaign' ? (end || undefined) : undefined,
      });
      if (r === 'not-deployed') {
        toast.show('이벤트 신청 기능을 준비 중입니다 — 잠시 뒤 다시 시도해 주세요', 'error');
        return;
      }
      toast.show(kind === 'campaign' ? '이벤트 신청을 보냈습니다' : '제안을 보냈습니다', 'success');
      setTitle(''); setBody(''); setStart(''); setEnd('');
      load();
    } catch (e) {
      // 서버 거절 문구를 그대로 보여 준다 — '중복 신청'·'지난 날짜'·'권한 없음'이 각각 다른
      // 조치를 요구하는데 '실패'로 뭉개면 업주가 무엇을 고쳐야 할지 알 수 없다.
      toast.show(e instanceof Error ? e.message : '보내지 못했습니다', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {/* ── 갈래 선택 ─────────────────────────────────────────────────────────
          두 갈래가 **무엇이 다른지**를 칩 밑에 한 줄로 적는다. 이름만으로는
          '신청'과 '제안'의 차이가 업주에게 전달되지 않는다. */}
      <div className="flex flex-wrap gap-1.5">
        {([
          { k: 'campaign' as const, label: '이벤트 신청', icon: 'ticket' as const },
          { k: 'idea' as const, label: '이벤트 제안', icon: 'sparkles' as const },
        ]).map(({ k, label, icon }) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
            className={[
              'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors',
              kind === k ? 'border-accent-300/60 bg-accent-500/20 text-accent-100'
                         : 'border-border-default bg-surface-high text-ink-secondary hover:bg-surface-float/60',
            ].join(' ')}>
            <Icon name={icon} size={13} className="shrink-0" />{label}
          </button>
        ))}
      </div>
      <p className="text-2xs leading-relaxed text-ink-muted">
        {kind === 'campaign'
          ? <>매장이용권을 경품으로 걸고 여는 이벤트입니다. 승인되면 운영자가 <b className="text-ink-secondary">7일 이내</b>에 열어 드립니다.</>
          : <>규모·날짜가 아직 없어도 됩니다. 하고 싶은 이벤트를 자유롭게 적어 주세요.</>}
      </p>

      {notDeployed && (
        <p className="rounded-input border border-border-subtle bg-surface-high/40 p-2 text-2xs leading-relaxed text-ink-muted">
          이벤트 신청 기능을 <b className="text-ink-secondary">준비 중</b>입니다. 곧 열립니다.
        </p>
      )}

      {/* ── 입력 ─────────────────────────────────────────────────────────────── */}
      <label className="block text-2xs font-semibold text-ink-secondary">
        {kind === 'campaign' ? '이벤트 이름' : '제안 제목'}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60}
          placeholder={kind === 'campaign' ? '예) 가을 카드 뽑기' : '예) 딜러 초청 이벤트 어떨까요'}
          className="input mt-0.5 w-full text-sm" />
      </label>

      {kind === 'campaign' && (
        <>
          <div className="text-2xs font-semibold text-ink-secondary">
            경품으로 걸 매장이용권
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {COUNT_PRESETS.map((n) => (
                <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)}
                  className={[
                    'min-h-[32px] rounded-full border px-2.5 text-2xs font-bold tabular-nums transition-colors',
                    count === n ? 'border-accent-300/60 bg-accent-500/20 text-accent-100'
                                : 'border-border-default bg-surface-high text-ink-secondary hover:bg-surface-float/60',
                  ].join(' ')}>
                  {n}장
                </button>
              ))}
              <input type="number" min={1} max={10000} value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
                aria-label="경품 장수 직접 입력"
                className="input h-9 w-20 text-sm tabular-nums" />
            </div>
            {/* 🔴 비용 구조를 숨기지 않는다 — 승인 시 **매장 발행 한도에서 빠진다**(오너 결정).
                이걸 안 적으면 업주는 '공짜로 더 주는 것' 으로 이해하고, 나중에 한도가 줄어 있는 걸
                보고 사고로 받아들인다. */}
            <p className="mt-1 font-normal leading-relaxed text-ink-muted">
              승인되면 이 장수만큼 <b className="text-ink-secondary">매장 발행 한도에서 빠집니다.</b>
              한도가 모자라면 승인이 보류되니, 그때는 <b className="text-ink-secondary">이용권 · QR</b> 탭에서
              한도 증액을 요청해 주세요. <b className="text-ink-secondary">비용은 없습니다.</b>
            </p>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2">
            <label className="text-2xs font-semibold text-ink-secondary">
              시작 희망일
              {/* ⚠ min 은 KST 오늘이다 — 서버도 (now() at time zone 'Asia/Seoul')::date 로 판정한다.
                  기기 로컬 날짜를 쓰면 해외·시계 오설정 기기에서 하루가 어긋나 서버가 거절한다. */}
              <input type="date" value={start} min={kstToday()} onChange={(e) => setStart(e.target.value)}
                className="input mt-0.5 w-full text-sm tabular-nums" />
            </label>
            <label className="text-2xs font-semibold text-ink-secondary">
              종료 희망일 <span className="font-normal text-ink-muted">· 선택</span>
              <input type="date" value={end} min={start || kstToday()} onChange={(e) => setEnd(e.target.value)}
                className="input mt-0.5 w-full text-sm tabular-nums" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-2xs text-ink-muted">빠른 선택</span>
            {[7, 14, 30].map((d) => (
              <button key={d} type="button" onClick={() => { setStart(addKstDays(d)); setEnd(''); }}
                className="min-h-[32px] rounded-full border border-border-default bg-surface-high px-2.5 text-2xs font-bold text-ink-secondary hover:bg-surface-float/60">
                {d}일 뒤
              </button>
            ))}
          </div>
        </>
      )}

      <label className="block text-2xs font-semibold text-ink-secondary">
        {kind === 'campaign' ? '남길 말 · 선택' : '내용'}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={3}
          placeholder={kind === 'campaign' ? '예) 주말 시리즈에 맞춰 3일간 진행하고 싶습니다' : '어떤 이벤트를 하고 싶으신가요?'}
          className="input mt-0.5 w-full resize-none text-sm" />
      </label>

      <button type="button" disabled={!canSend} onClick={submit}
        className="btn-primary w-full text-sm disabled:opacity-50">
        {busy ? '보내는 중…'
          : blocked ? (kind === 'campaign' ? '이미 검토 중인 신청이 있습니다' : '검토 중인 제안이 3건입니다')
            : kind === 'campaign' ? '이벤트 신청 보내기' : '제안 보내기'}
      </button>

      {/* ── 내 신청 이력 ──────────────────────────────────────────────────────
          보낸 뒤에 아무 흔적이 없으면 업주는 보냈는지조차 알 수 없다. */}
      {loadErr != null ? (
        <LoadErrorCard error={loadErr} what="내 신청 내역" onRetry={load} compact />
      ) : rows.length > 0 && (
        <ul className="space-y-1.5 border-t border-border-subtle pt-2">
          {rows.map((r) => {
            const st = STATUS[r.status];
            return (
              <li key={r.id} className="rounded-input border border-border-subtle bg-surface-low p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold ${st.cls}`}>{st.label}</span>
                  <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs font-bold text-ink-secondary">
                    {r.kind === 'campaign' ? '신청' : '제안'}
                  </span>
                  <span className="min-w-[4rem] flex-1 break-words text-xs font-bold text-ink-primary">{r.title}</span>
                  <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{r.createdAt.slice(0, 10)}</span>
                </div>
                {r.kind === 'campaign' && (
                  <p className="mt-0.5 text-2xs tabular-nums text-ink-muted">
                    이용권 {r.voucherCount?.toLocaleString()}장
                    {r.desiredStart && <> · {r.desiredStart}{r.desiredEnd ? ` ~ ${r.desiredEnd}` : ''}</>}
                  </p>
                )}
                {r.status === 'approved' && (
                  <p className="mt-0.5 text-2xs leading-relaxed text-emerald-300">
                    승인됐습니다 — 운영자가 7일 이내에 이벤트를 엽니다.
                  </p>
                )}
                {r.adminNote && <p className="mt-0.5 break-words text-2xs leading-relaxed text-ink-muted">운영자: {r.adminNote}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
