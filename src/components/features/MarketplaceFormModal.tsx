/* ============================================================================
 * [UI/UX 점검 및 자가 진단] MarketplaceFormModal — 중고장터 글쓰기 (Stage 2 뼈대)
 *  - 요구사항 4: "글쓰기 페이지(UI 및 기본 컴포넌트 뼈대) 생성 시작".
 *    → 등록에 필요한 핵심 필드를 갖춘 동작 가능한 폼으로 구현(카테고리/제목/가격/
 *      상태/지역/거래방법/내용/이미지). 실제 createListing 연동은 App에서 주입.
 *  - 카테고리: 게임머니 제외(요구사항 4) → [용품, 아이템, 기타]만 선택 가능.
 *  - 예외처리:
 *     · 제목 2자↓ / 가격 음수·공백 / 내용 공백 → 차단 + toast.
 *     · content-filter(filterListing) 통과 필수.
 *     · 이미지 최대 5장·5MB·이미지타입 검증, objectURL 정리.
 *  - 레이아웃: Modal sheet, 가격은 number+단위, 거래방법은 칩 토글(줄바꿈 flex-wrap).
 * ========================================================================== */
import { useState, useEffect, useRef } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { filterListing } from '../../lib/content-filter';
import { uploadListingImages } from '../../lib/storage';
import type { ListingCategory, ListingCondition } from '../../api/marketplace';

export interface MarketplaceFormData {
  title: string;
  category: ListingCategory;
  price: number;
  condition: ListingCondition;
  region: string;
  shippingAvailable: boolean;
  pickupOnly: boolean;
  description: string;
  images: string[];
}

interface MarketplaceFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: MarketplaceFormData) => Promise<void> | void;
}

// 게임머니 제외 — 용품/아이템/기타
const CATEGORY_OPTIONS: { id: ListingCategory; label: string }[] = [
  { id: 'pokerGear', label: '용품' },
  { id: 'item',      label: '아이템' },
  { id: 'etc',       label: '기타' },
];

const CONDITION_OPTIONS: { id: ListingCondition; label: string }[] = [
  { id: 'S', label: 'S (미사용)' },
  { id: 'A', label: 'A (상태 좋음)' },
  { id: 'B', label: 'B (사용감)' },
  { id: 'C', label: 'C (하자 있음)' },
];

const REGION_OPTIONS = ['서울', '강남', '강서', '경기남부', '경기북부', '인천', '부산', '대전', '대구', '광주', '제주'];

const MAX_IMAGES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function MarketplaceFormModal({ open, onClose, onSubmit }: MarketplaceFormModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title,     setTitle]     = useState('');
  const [category,  setCategory]  = useState<ListingCategory>('pokerGear');
  const [price,     setPrice]     = useState('');
  const [condition, setCondition] = useState<ListingCondition>('A');
  const [region,    setRegion]    = useState('서울');
  const [shipping,  setShipping]  = useState(true);
  const [pickup,    setPickup]    = useState(false);
  const [desc,      setDesc]      = useState('');
  const [files,     setFiles]     = useState<File[]>([]);
  const [previews,  setPreviews]  = useState<string[]>([]);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(''); setCategory('pokerGear'); setPrice(''); setCondition('A');
      setRegion('서울'); setShipping(true); setPickup(false); setDesc('');
      setFiles([]); setPreviews([]); setSaving(false);
    }
  }, [open]);

  useEffect(() => {
    return () => { previews.forEach((u) => URL.revokeObjectURL(u)); };
  }, [previews]);

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
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
    setFiles((prev) => [...prev, ...valid]);
    setPreviews((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))]);
  };

  const removeImage = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => {
      if (prev[idx]) URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.show('로그인이 필요합니다', 'error');
    const t = title.trim();
    const d = desc.trim();
    const priceNum = Number(price);
    if (t.length < 2)             return toast.show('제목을 2자 이상 입력해 주세요', 'error');
    if (!price || priceNum < 0 || Number.isNaN(priceNum)) return toast.show('가격을 올바르게 입력해 주세요', 'error');
    if (!d)                       return toast.show('상품 설명을 입력해 주세요', 'error');
    if (!shipping && !pickup)     return toast.show('거래 방법을 1개 이상 선택해 주세요', 'error');

    const check = filterListing(t, d, category);
    if (check.blocked) return toast.show(check.reason!, 'error');

    setSaving(true);
    try {
      let images: string[] = [];
      if (files.length > 0) images = await uploadListingImages(user.id, files, MAX_IMAGES);
      await onSubmit({
        title: t, category, price: priceNum, condition, region,
        shippingAvailable: shipping, pickupOnly: pickup, description: d, images,
      });
      toast.show('상품이 등록되었습니다', 'success');
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '상품 등록에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="중고장터 글쓰기" maxWidth="md" variant="sheet">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* 카테고리 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">카테고리</label>
          <div className="grid grid-cols-3 gap-1.5">
            {CATEGORY_OPTIONS.map((o) => (
              <button
                key={o.id} type="button" onClick={() => setCategory(o.id)}
                className={[
                  'py-2 text-xs font-semibold rounded-input border transition-colors focus:outline-none',
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
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            제목 <span className="text-danger ml-0.5">*</span>
          </label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            maxLength={60} placeholder="상품 제목" className="input" autoFocus />
        </div>

        {/* 가격 + 상태 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">
              가격 <span className="text-danger ml-0.5">*</span>
            </label>
            <div className="relative">
              <input type="number" inputMode="numeric" min={0} value={price}
                onChange={(e) => setPrice(e.target.value)} placeholder="0"
                className="input pr-8" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">원</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">상태</label>
            <select value={condition} onChange={(e) => setCondition(e.target.value as ListingCondition)} className="input">
              {CONDITION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* 지역 + 거래방법 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">지역 / 거래방법</label>
          <div className="flex gap-2">
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="input flex-1">
              {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button type="button" onClick={() => setShipping((v) => !v)}
              className={['px-3 rounded-input text-xs font-semibold border transition-colors',
                shipping ? 'bg-gold-300/20 border-gold-300 text-gold-300' : 'bg-surface-high border-border-default text-ink-muted'].join(' ')}>
              택배
            </button>
            <button type="button" onClick={() => setPickup((v) => !v)}
              className={['px-3 rounded-input text-xs font-semibold border transition-colors',
                pickup ? 'bg-gold-300/20 border-gold-300 text-gold-300' : 'bg-surface-high border-border-default text-ink-muted'].join(' ')}>
              직거래
            </button>
          </div>
        </div>

        {/* 설명 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            상품 설명 <span className="text-danger ml-0.5">*</span>
          </label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)}
            maxLength={3000} rows={5} placeholder="상품 상태, 거래 조건 등을 적어주세요"
            className="input resize-none" />
        </div>

        {/* 이미지 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-ink-secondary">
              사진 <span className="text-ink-muted">({previews.length}/{MAX_IMAGES})</span>
            </label>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={previews.length >= MAX_IMAGES}
              className="text-2xs font-semibold text-gold-300 hover:text-gold-200 disabled:opacity-40 disabled:cursor-not-allowed">
              + 사진 추가
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePickFiles} className="hidden" />
          {previews.length > 0 ? (
            <div className="grid grid-cols-5 gap-1.5">
              {previews.map((src, i) => (
                <div key={src} className="relative aspect-square rounded-input overflow-hidden border border-border-default">
                  <img src={src} alt={`사진 ${i + 1}`} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImage(i)} aria-label="사진 제거"
                    className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white text-xs hover:bg-danger transition-colors">✕</button>
                </div>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full py-6 rounded-input border border-dashed border-border-default text-2xs text-ink-muted hover:border-gold-400/50 hover:text-ink-secondary transition-colors">
              사진을 첨부하려면 클릭하세요 (최대 {MAX_IMAGES}장 · 5MB)
            </button>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">취소</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-60">
            {saving ? '등록 중…' : '등록하기'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
