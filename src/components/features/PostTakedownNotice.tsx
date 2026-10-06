// src/components/features/PostTakedownNotice.tsx — 게시물 자리의 권리침해 임시조치 안내(약관 제5조 ⑧·⑨ · 정보통신망법 §44의2②)
// 누구에게나(비로그인·작성자 본인 포함) '권리침해 신고로 임시조치된 게시물입니다' 와 기간을 보여 준다.
// 작성자 본인에게는 사유와 다시 게시 요청(이의제기) 수단을 더 준다 — 사유·이의 상태는 서버가 작성자·운영자에게만 싣는다.
import { useEffect, useState } from 'react';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import { getPostTakedownNotice, requestTakedownReview } from '../../api/reports';
import type { TakedownNotice } from '../../api/communityCore';
import { msgOf } from '../../lib/dbError';

const ymd = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

export default function PostTakedownNotice({ postId, initial, isAdmin }: { postId: string; initial?: TakedownNotice; isAdmin: boolean }) {
  const toast = useToast();
  const [n, setN] = useState<TakedownNotice | null>(initial ?? null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setN(initial ?? null); setOpen(false); setText('');
    getPostTakedownNotice(postId).then((r) => { if (active && r) setN(r); }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await requestTakedownReview(postId, text.trim());
      setN((c) => (c ? { ...c, objectionAt: new Date().toISOString() } : c));
      setOpen(false);
      toast.show('다시 게시 요청을 접수했습니다. 검토 결과를 알림으로 알려 드립니다', 'success');
    } catch (e) { toast.show(msgOf(e, '요청을 보내지 못했습니다'), 'error'); }
    finally { setBusy(false); }
  };

  // P2-2(리드 결정): 기간이 끝나도 자동으로 풀거나 지우지 않는다 — 운영자가 게시 재개·삭제를 정해 알린다.
  const period = n ? (n.status === 'kept' ? '운영자 검토 결과 계속 가림'
    : n.expired ? `임시조치 기간 종료(${ymd(n.endsAt)}) — 운영자가 게시 재개·삭제를 결정해 알려 드립니다`
    : `임시조치 기간: ${ymd(n.endsAt)}까지`) : null;
  // 직권(§44의3)은 신청이 없었다 — '신고로' 대신 '운영 정책에 따라'(서버 알림 문구와 같다)
  const headline = n?.exOfficio ? '운영 정책에 따라 임시조치된 게시물입니다' : '권리침해 신고로 임시조치된 게시물입니다';
  const canAsk = !!n?.mine && n.status === 'active' && !n.expired && !n.objectionAt;

  return (
    <div className="mt-3 space-y-2 rounded-card border border-danger/40 bg-danger/6 px-3 py-2" data-testid="post-takedown-notice" role="status">
      <p className="inline-flex items-center gap-1 text-xs font-bold text-danger-light" data-testid="post-takedown-headline"><Icon name="ban" size={12} className="shrink-0" />{headline}</p>
      {period && <p className="text-2xs text-ink-secondary">{period}</p>}
      {n?.mine && (
        <div className="space-y-1.5 text-2xs leading-relaxed text-ink-secondary">
          {n.reason && <p>사유: {n.reason}</p>}
          <p>임시조치 기간 안에 다시 게시를 요청할 수 있습니다(고객센터 ace@nuriholdem.com 으로도 가능). 운영자가 검토해 결과를 알림으로 알려 드립니다.</p>
          {n.objectionAt && <p className="font-semibold text-ink-primary">다시 게시 요청 접수됨 · {ymd(n.objectionAt)}</p>}
          {canAsk && !open && (
            <button type="button" data-testid="takedown-review-open" onClick={() => setOpen(true)}
              className="min-h-[44px] rounded-input border border-border-default px-3 text-2xs font-bold text-ink-secondary hover:text-ink-primary">다시 게시 요청</button>
          )}
          {canAsk && open && (
            <div className="space-y-1.5">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000}
                aria-label="다시 게시 요청 이유" placeholder="권리 침해가 아닌 이유를 적어 주세요(5자 이상)" className="input resize-none text-sm" />
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost min-h-[44px] px-3 text-2xs">취소</button>
                <button type="button" data-testid="takedown-review-send" disabled={busy || text.trim().length < 5} onClick={send}
                  className="btn-primary min-h-[44px] px-3 text-2xs disabled:opacity-60">{busy ? '보내는 중…' : '요청 보내기'}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {isAdmin && <p className="text-2xs text-ink-muted">관리자 → 신고 처리의 임시조치 목록에서 다시 게시·삭제·가림 유지를 정합니다.</p>}
    </div>
  );
}
