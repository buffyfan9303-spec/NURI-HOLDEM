// src/components/features/TakedownList.tsx — 관리자: 권리침해 임시조치 목록(20261006t · 약관 제5조 ⑧~⑩)
// 임시조치는 30일이 지나도 자동으로 풀리지 않는다 — 기간이 지나면 '판단 필요' 로 보여 주고, 관리자가
// 다시 게시 · 삭제 · 가림 유지 중에서 정한다. 결과 알림(작성자·신청인)은 서버 RPC 가 보낸다.
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { getTakedowns, decideTakedown, takedownStateLabel, type TakedownEntry, type TakedownAction } from '../../api/reports';
import { msgOf } from '../../lib/dbError';

const BTN = 'text-2xs font-semibold px-2.5 py-1 rounded-badge border transition-colors disabled:opacity-50';
const ymd = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

export default function TakedownList() {
  const toast = useToast();
  const [rows, setRows] = useState<TakedownEntry[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    getTakedowns().then((r) => { setErr(null); setRows(r); })
      .catch((e) => setErr(e ?? new Error('임시조치 목록을 불러오지 못했습니다')));
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (t: TakedownEntry, action: TakedownAction) => {
    if (busy) return;
    const n = (note[t.id] ?? '').trim();
    if (action !== 'restore' && !n) { toast.show('작성자에게 알릴 사유를 입력해 주세요', 'error'); return; }
    const what = action === 'restore' ? '다시 게시' : action === 'remove' ? '삭제(되돌릴 수 없음)' : '가림 유지';
    if (!window.confirm(`이 게시물을 ${what}합니다. 작성자와 신청인에게 결과를 알립니다. 진행할까요?`)) return;
    setBusy(t.id);
    try {
      await decideTakedown(t.id, action, n || undefined);
      toast.show(`${what.replace('(되돌릴 수 없음)', '')}했습니다 · 결과를 알렸습니다`, 'success');
      load();
    } catch (e) { toast.show(msgOf(e, '처리에 실패했습니다'), 'error'); }
    finally { setBusy(null); }
  };

  if (err != null) return <LoadErrorCard error={err} what="임시조치 목록" onRetry={load} />;
  if (!rows || rows.length === 0) return null;   // 없으면 신고 큐만 보인다

  return (
    <section className="mb-3 space-y-1.5" data-testid="takedown-list" aria-label="권리침해 임시조치">
      <h3 className="text-xs font-bold text-ink-primary">권리침해 임시조치 {rows.length}건</h3>
      <ul className="space-y-1.5">
        {rows.map((t) => {
          const state = takedownStateLabel(t);
          const due = state.startsWith('기간 만료');
          return (
            <li key={t.id} className="rounded-aura border card-aura p-2.5 space-y-2" data-testid="takedown-row">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-2xs px-1.5 py-0.5 rounded-badge border font-semibold ${due ? 'bg-danger/15 text-danger-light border-danger/30' : 'bg-surface-high text-ink-secondary border-border-default'}`}>{state}</span>
                <span className="text-2xs text-ink-muted">{t.exOfficio ? '직권' : '신고 요청'} · {ymd(t.createdAt)}~{ymd(t.endsAt)}</span>
                {t.objectionAt && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">다시 게시 요청</span>}
              </div>
              <p className="text-xs font-semibold text-ink-primary line-clamp-1">{t.postTitle || '(제목 없음)'}{t.postId ? '' : ' · 작성자가 삭제한 글'}</p>
              <p className="text-2xs text-ink-secondary">사유: {t.reason}</p>
              {t.objectionText && <p className="text-2xs text-ink-secondary whitespace-pre-line rounded-input bg-surface-high px-2 py-1.5">작성자 요청: {t.objectionText}</p>}
              <input type="text" value={note[t.id] ?? ''} maxLength={300} aria-label="작성자에게 알릴 사유"
                onChange={(e) => setNote((m) => ({ ...m, [t.id]: e.target.value }))}
                placeholder="결과 사유(삭제·가림 유지는 필수 — 작성자·신청인에게 알립니다)" className="input text-xs" />
              <div className="flex flex-wrap gap-1.5 justify-end">
                {t.postId && (
                  <button type="button" onClick={() => window.open(`/?post=${encodeURIComponent(t.postId!)}`, '_blank', 'noopener')}
                    className={`${BTN} bg-surface-high text-ink-secondary border-border-default hover:text-ink-primary`}>글 보기</button>
                )}
                {t.postId && (
                  <button type="button" data-testid="takedown-restore" disabled={busy === t.id} onClick={() => decide(t, 'restore')}
                    className={`${BTN} bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25`}>다시 게시</button>
                )}
                {t.status === 'active' && t.postId && (
                  <button type="button" data-testid="takedown-keep" disabled={busy === t.id} onClick={() => decide(t, 'keep')}
                    className={`${BTN} bg-surface-high text-ink-secondary border-border-default hover:text-ink-primary`}>가림 유지</button>
                )}
                <button type="button" data-testid="takedown-remove" disabled={busy === t.id} onClick={() => decide(t, 'remove')}
                  className={`${BTN} bg-danger/15 text-danger-light border-danger/30 hover:bg-danger/25`}>{t.postId ? '삭제' : '기록 종결'}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
