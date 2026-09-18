// src/components/features/VenueEventAdminCard.tsx
// 운영자: 매장이 보낸 **이벤트 개설 신청 · 제안** 대기열(오너 지시 2026-09-18).
//
// 🔴 이 파일이 왜 업주 화면과 **같은 커밋**에 있나:
//   오늘(2026-09-18) 이용권 한도 증액에서 요청 화면만 만들고 승인 화면을 빠뜨렸다.
//   마이그레이션까지 적용한 뒤라, 업주가 요청을 보내면 '검토 중'에서 영원히 멈추는
//   막다른 길이 됐다(전수 점검이 잡았다 — 오너가 반복해서 지적하던 "눌러도 아무 일 없는" 부류).
//   요청을 **받는 화면과 처리하는 화면은 반드시 같은 작업에서** 만든다.
//
// ⚠ 승인은 '하겠다' 표시다(오너 결정). 승인해도 event_campaigns 가 자동 생성되지 않는다 —
//   실제 개설은 '이벤트 관리' 화면에서 운영자가 직접 한다. 그 사실을 카드에 적어 둔다.
// ⚠ 경품 이용권은 신청 매장의 발행 한도에서 차감된다. 한도가 모자라면 **서버가 승인을 거절**하고
//   "잔여 N장 · 필요 M장" 을 돌려준다 — 그 문구를 그대로 보여 준다(다음 행동을 말해 주는 문구다).
import { useCallback, useEffect, useState } from 'react';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import LoadErrorCard from '../atoms/LoadErrorCard';
import {
  adminListVenueEventRequests, adminDecideVenueEvent,
  type AdminVenueEventRequest,
} from '../../api/venueEvents';

export default function VenueEventAdminCard() {
  const toast = useToast();
  /** null = 아직 못 받음 / 'not-deployed' = 서버 준비 전 / 배열 = 받음 */
  const [reqs, setReqs] = useState<AdminVenueEventRequest[] | 'not-deployed' | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    adminListVenueEventRequests().then((r) => { setErr(null); setReqs(r); }).catch((e) => { setErr(e); setReqs([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = Array.isArray(reqs) ? reqs : [];

  const decide = async (r: AdminVenueEventRequest, approve: boolean) => {
    setBusy(r.id);
    try {
      const left = await adminDecideVenueEvent(r.id, approve, note[r.id]?.trim() || undefined);
      toast.show(
        approve
          ? `${r.venueName} · ${r.title} 승인${r.voucherCount ? ` · 한도에서 ${r.voucherCount.toLocaleString()}장 차감(잔여 ${left?.toLocaleString() ?? '?'}장)` : ''}`
          : '반려했습니다',
        approve ? 'success' : 'info',
      );
      setNote((n) => { const m = { ...n }; delete m[r.id]; return m; });
      load();
    } catch (e) {
      // 한도 부족은 '실패' 가 아니라 **다음에 할 일이 있는 상태**다. 서버 문구를 그대로 보여 준다.
      toast.show(e instanceof Error ? e.message : '처리 실패', 'error');
    } finally { setBusy(null); }
  };

  // 실패 시에는 카드를 남긴다(형제 관리 카드와 같은 이유 — 사라지면 대기열의 존재 자체가 숨는다).
  // 서버 미배포이거나 대기 0건이면 조용히 접는다.
  if (reqs === 'not-deployed') return null;
  if (err == null && rows.length === 0) return null;

  return (
    <section className="rounded-card border border-accent-400/30 bg-accent-300/[0.04] p-3 space-y-2">
      <h3 className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-accent-300">
        <Icon name="sparkles" size={15} className="shrink-0" />매장 이벤트 신청 · 제안
        <span className="text-2xs font-normal text-ink-muted">· 승인은 &lsquo;하겠다&rsquo; 표시 · 개설은 이벤트 관리에서</span>
      </h3>
      {err != null ? <LoadErrorCard error={err} what="이벤트 신청" onRetry={load} compact /> : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const short = r.voucherCount != null && r.venueQuota < r.voucherCount;
            return (
              <li key={r.id} className="rounded-input border border-border-subtle bg-surface-low p-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs font-bold text-ink-secondary">
                    {r.kind === 'campaign' ? '개설 신청' : '제안'}
                  </span>
                  <span className="min-w-[5rem] flex-1 break-words text-xs font-bold text-ink-primary">
                    {r.venueName} <span className="font-normal text-ink-secondary">· {r.title}</span>
                  </span>
                  <span className="shrink-0 text-2xs tabular-nums text-ink-muted">
                    {new Date(r.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {r.kind === 'campaign' && (
                  // 🔴 한도를 **승인 전에** 보여 준다. 서버가 어차피 막지만, 막힌 뒤에 알면
                  //   운영자는 이미 눌러 본 뒤다 — 누르기 전에 보이는 것이 낫다.
                  <p className={`text-2xs tabular-nums ${short ? 'font-bold text-danger-light' : 'text-ink-muted'}`}>
                    이용권 {r.voucherCount?.toLocaleString()}장 · 매장 잔여 한도 {r.venueQuota.toLocaleString()}장
                    {short && ' — 한도 부족(먼저 한도를 늘려야 승인됩니다)'}
                    {r.desiredStart && <> · 희망 {r.desiredStart}{r.desiredEnd ? ` ~ ${r.desiredEnd}` : ''}</>}
                  </p>
                )}
                {r.body && <p className="break-words text-2xs leading-relaxed text-ink-secondary">{r.body}</p>}
                <p className="text-2xs text-ink-muted">신청 {r.requester || '(알 수 없음)'}</p>

                <input value={note[r.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                  maxLength={200} placeholder="업주에게 남길 말 (선택)" aria-label="운영자 메모"
                  className="input w-full text-sm" />

                <div className="flex flex-wrap items-center gap-1.5">
                  {/* 승인이 먼저다 — 대기열의 기본 동작은 '들어준다' 이고 반려가 예외다. */}
                  <button type="button" disabled={busy === r.id} onClick={() => decide(r, true)}
                    className="shrink-0 rounded-input border border-emerald-500/50 px-2.5 py-1.5 text-2xs font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40">
                    {busy === r.id ? '처리 중…' : '승인'}
                  </button>
                  <button type="button" disabled={busy === r.id} onClick={() => decide(r, false)}
                    className="btn-ghost shrink-0 px-2 py-1.5 text-2xs hover:text-danger-light">반려</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
