// src/components/features/SupportInquiryModal.tsx
// 1:1 고객센터 — 회원이 문의를 접수하고, 운영자 답변을 확인. (접수/열람은 RLS로 본인 한정)
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { submitInquiry, getMyInquiries, deleteMyInquiry, INQUIRY_CATEGORIES, type SupportInquiry } from '../../api/support';

export default function SupportInquiryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<SupportInquiry[] | null>(null);
  const [cat, setCat] = useState<string>(INQUIRY_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => getMyInquiries().then(setList).catch(() => setList([]));
  useEffect(() => { if (open) load(); }, [open]);

  const submit = async () => {
    if (!title.trim() || !content.trim()) { toast.show('제목과 내용을 입력하세요', 'error'); return; }
    setBusy(true);
    try {
      await submitInquiry({ category: cat, title, content, userName: user?.nickname ?? user?.name });
      toast.show('문의를 접수했습니다. 운영자가 확인 후 답변드립니다.', 'success');
      setTitle(''); setContent(''); setCat(INQUIRY_CATEGORIES[0]); load();
    } catch (e) { toast.show(e instanceof Error ? e.message : '접수 실패', 'error'); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('이 문의를 삭제할까요?')) return;
    try { await deleteMyInquiry(id); load(); } catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); }
  };

  return (
    <Modal open={open} onClose={onClose} title="고객센터 · 1:1 문의" maxWidth="md" variant="sheet">
      <div className="space-y-4 p-4">
        {/* 접수 폼 */}
        <section className="space-y-2 rounded-card border border-border-default bg-surface-low p-3">
          <p className="text-2xs text-ink-muted">이용 중 불편하거나 궁금한 점을 남겨주세요. 운영자가 확인 후 답변드립니다. (운영시간 내 순차 처리)</p>
          <div className="flex flex-wrap gap-1.5">
            {INQUIRY_CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)}
                className={['rounded-input border px-2.5 py-1 text-2xs font-bold transition-colors',
                  cat === c ? 'border-accent-300 bg-accent-300/15 text-accent-300' : 'border-border-default bg-surface-high text-ink-muted hover:text-ink-secondary'].join(' ')}>
                {c}
              </button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="제목" className="input w-full text-sm" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} maxLength={1000} placeholder="문의 내용을 자세히 적어주세요" className="input w-full resize-none text-sm" />
          <button type="button" onClick={submit} disabled={busy} className="btn-primary w-full text-sm disabled:opacity-50">{busy ? '접수 중…' : '문의 접수'}</button>
        </section>

        {/* 내 문의 내역 */}
        <section className="space-y-2">
          <h3 className="text-xs font-bold text-ink-secondary">내 문의 내역</h3>
          {list === null ? <p className="py-4 text-center text-2xs text-ink-muted">불러오는 중…</p>
            : list.length === 0 ? <p className="rounded-card border border-border-subtle bg-surface-low py-5 text-center text-2xs text-ink-muted">접수한 문의가 없습니다.</p>
            : <ul className="space-y-2">{list.map((q) => (
                <li key={q.id} className="rounded-card border border-border-subtle bg-surface-low p-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-badge bg-surface-float px-1.5 py-0.5 text-[9px] font-bold text-ink-secondary">{q.category}</span>
                    <span className={['rounded-badge px-1.5 py-0.5 text-[9px] font-bold', q.status === 'answered' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'].join(' ')}>
                      {q.status === 'answered' ? '답변완료' : '답변대기'}
                    </span>
                    <span className="ml-auto text-[10px] text-ink-muted">{q.createdAt.slice(0, 10)}</span>
                    <button type="button" onClick={() => remove(q.id)} aria-label="삭제" className="text-ink-muted hover:text-danger-light text-xs">✕</button>
                  </div>
                  <p className="mt-1 text-sm font-bold text-ink-primary">{q.title}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-2xs leading-relaxed text-ink-secondary">{q.content}</p>
                  {q.answer && (
                    <div className="mt-2 rounded-input border border-accent-400/30 bg-accent-300/[0.05] p-2.5">
                      <p className="text-[10px] font-bold text-accent-300">운영자 답변 {q.answeredAt ? `· ${q.answeredAt.slice(0, 10)}` : ''}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-2xs leading-relaxed text-ink-primary">{q.answer}</p>
                    </div>
                  )}
                </li>
              ))}</ul>}
        </section>
      </div>
    </Modal>
  );
}
