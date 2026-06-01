/* ============================================================================
 * [UI/UX 점검 및 자가 진단] PostFormModal — 커뮤니티 글쓰기 (Stage 2)
 *  - 입력: 카테고리(필수·기본 자유) / 제목(선택) / 내용(필수) / 이미지 첨부(최대4)
 *  - 예외처리:
 *     · 내용 공백 → 제출 차단 + toast. content-filter(금칙어)도 통과해야 등록.
 *     · 이미지 5MB↑ / 비이미지 → 개별 스킵 + 경고, 4장 초과분 잘림.
 *     · 업로드 실패 시 등록 중단(부분 저장 방지) + toast.
 *     · 모달 열릴 때 폼/미리보기/objectURL 초기화 → 메모리릭·이전상태 잔존 방지.
 *  - 레이아웃: Modal(variant=sheet)로 모바일 하단시트 + 데스크톱 중앙. 이미지
 *    프리뷰는 grid-cols-4 정사각 썸네일 → 줄바꿈/넘침 없음.
 *  - 로그인 필요: 비로그인 시 호출부에서 진입을 막지만, 방어적으로 user 없으면 제출 차단.
 * ========================================================================== */
import { useState, useEffect, useRef } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { filterContent } from '../../lib/content-filter';
import { uploadCommunityImages } from '../../lib/storage';
import type { PostCategory } from '../../api/community';

export interface PostFormData {
  category: PostCategory;
  title: string;
  content: string;
  images: string[];
}

interface PostFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PostFormData) => Promise<void> | void;
}

const CATEGORY_OPTIONS: { id: PostCategory; label: string }[] = [
  { id: 'free',     label: '💬 자유' },
  { id: 'question', label: '❓ 질문' },
  { id: 'info',     label: '📢 정보' },
  { id: 'review',   label: '⭐ 후기' },
];

const MAX_IMAGES = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function PostFormModal({ open, onClose, onSubmit }: PostFormModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<PostCategory>('free');
  const [title,    setTitle]    = useState('');
  const [content,  setContent]  = useState('');
  const [files,    setFiles]    = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving,   setSaving]   = useState(false);

  // 모달 열릴 때 초기화 + 닫힐 때 objectURL 해제
  useEffect(() => {
    if (open) {
      setCategory('free'); setTitle(''); setContent('');
      setFiles([]); setPreviews([]); setSaving(false);
    }
  }, [open]);

  useEffect(() => {
    // 언마운트/프리뷰 교체 시 objectURL 정리(메모리릭 방지)
    return () => { previews.forEach((u) => URL.revokeObjectURL(u)); };
  }, [previews]);

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 파일 재선택 허용
    if (picked.length === 0) return;

    const room = MAX_IMAGES - files.length;
    if (room <= 0) { toast.show(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다`, 'error'); return; }

    const valid: File[] = [];
    for (const f of picked.slice(0, room)) {
      if (!f.type.startsWith('image/')) { toast.show('이미지 파일만 첨부할 수 있습니다', 'error'); continue; }
      if (f.size > MAX_FILE_BYTES)      { toast.show('이미지는 5MB 이하만 가능합니다', 'error'); continue; }
      valid.push(f);
    }
    if (valid.length === 0) return;
    if (picked.length > room) toast.show(`최대 ${MAX_IMAGES}장까지만 첨부됩니다`, 'info');

    setFiles((prev) => [...prev, ...valid]);
    setPreviews((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))]);
  };

  const removeImage = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.show('로그인이 필요합니다', 'error');
    const body = content.trim();
    if (!body) return toast.show('내용을 입력해 주세요', 'error');

    const check = filterContent(`${title} ${body}`);
    if (check.blocked) return toast.show(check.reason!, 'error');

    setSaving(true);
    try {
      let images: string[] = [];
      if (files.length > 0) {
        images = await uploadCommunityImages(user.id, files, MAX_IMAGES);
      }
      await onSubmit({ category, title: title.trim(), content: body, images });
      toast.show('게시글이 등록되었습니다', 'success');
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '게시글 등록에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="글쓰기" maxWidth="md" variant="sheet">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* 카테고리 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">카테고리</label>
          <div className="grid grid-cols-4 gap-1.5">
            {CATEGORY_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setCategory(o.id)}
                className={[
                  'py-2 text-2xs font-semibold rounded-input border transition-colors focus:outline-none',
                  category === o.id
                    ? 'bg-gold-300/20 border-gold-300 text-gold-300'
                    : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary',
                ].join(' ')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="제목 (선택)"
            className="input"
          />
        </div>

        {/* 내용 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            내용 <span className="text-danger ml-0.5">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={4000}
            rows={6}
            placeholder="내용을 입력하세요"
            className="input resize-none"
            autoFocus
          />
          <p className="text-right text-2xs text-ink-muted mt-1">{content.length}/4000</p>
        </div>

        {/* 이미지 첨부 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-ink-secondary">
              이미지 <span className="text-ink-muted">({previews.length}/{MAX_IMAGES})</span>
            </label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={previews.length >= MAX_IMAGES}
              className="text-2xs font-semibold text-gold-300 hover:text-gold-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + 사진 추가
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePickFiles}
            className="hidden"
          />
          {previews.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5">
              {previews.map((src, i) => (
                <div key={src} className="relative aspect-square rounded-input overflow-hidden border border-border-default group">
                  <img src={src} alt={`첨부 이미지 ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    aria-label="이미지 제거"
                    className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white text-xs hover:bg-danger transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full py-6 rounded-input border border-dashed border-border-default text-2xs text-ink-muted hover:border-gold-400/50 hover:text-ink-secondary transition-colors"
            >
              사진을 첨부하려면 클릭하세요 (최대 {MAX_IMAGES}장 · 5MB)
            </button>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">취소</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-60">
            {saving ? '등록 중…' : '게시하기'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
