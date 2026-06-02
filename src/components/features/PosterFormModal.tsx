// src/components/features/PosterFormModal.tsx
import { useState, useEffect, useRef } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { uploadPoster } from '../../lib/storage';
import { filterContent } from '../../lib/content-filter';
import type { Schedule } from '../../api/schedules';

interface PosterFormModalProps {
  open: boolean;
  onClose: () => void;
  schedule?: Schedule | null;
  onSubmit: (data: PosterFormData) => void;
}

export interface PosterFormData {
  id?: string;
  title: string;
  date: string;
  startTime: string;
  regCloseTime: string;
  prizeType: 'GTD' | 'ENTRY';
  prizeAmount: number;
  buyIn: number;
  region: string;
  isCompetition: boolean; // '대회/이벤트' 분류 (Task 3) — 필터 [대회]에 노출
  paymentMethods: string[];
  partners: string[];     // 파트너 / 시드권 — 업주 직접 추가
  prizes: string[];
  posterUrl?: string;
}

const PAYMENT_BASE = ['현금', '카드', '매장이용권'];
const MAX_PAYMENTS = 10;
const MAX_PARTNERS = 10;
const MAX_PRIZES = 10;
const REGION_OPTIONS = [
  '서울', '경기도 남양주', '경기도 성남', '인천', '강남', '홍대', '부산', '대전', '대구', '광주',
];

export default function PosterFormModal({ open, onClose, schedule, onSubmit }: PosterFormModalProps) {
  const toast  = useToast();
  const { user } = useAuth();
  const isEdit = !!schedule;

  const empty: PosterFormData = {
    title: '', date: new Date().toISOString().slice(0, 10),
    startTime: '19:00', regCloseTime: '',
    prizeType: 'GTD', prizeAmount: 0, buyIn: 0, region: '',
    isCompetition: false,
    paymentMethods: ['현금'], partners: [], prizes: [],
  };

  const [form,       setForm]       = useState<PosterFormData>(empty);
  const [imgFile,    setImgFile]    = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string>('');
  const [uploading,  setUploading]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (schedule) {
      setForm({
        id: schedule.id, title: schedule.title, date: schedule.date,
        startTime: schedule.startTime,
        regCloseTime: schedule.regCloseTime ?? schedule.duration ?? '',
        prizeType: schedule.guaranteed ? 'GTD' : 'ENTRY',
        prizeAmount: schedule.prizePool ? Math.round(schedule.prizePool / 10000) : 0,
        buyIn: schedule.buyIn.amount, region: schedule.region,
        isCompetition: schedule.isCompetition ?? false,
        paymentMethods: schedule.paymentMethods ?? ['현금'],
        partners: schedule.partners ?? [],
        prizes: schedule.seats?.map((s) => `${s.label} ${s.count}석`) ?? [],
        posterUrl: schedule.posterUrl,
      });
      setImgPreview(schedule.posterUrl ?? '');
    } else if (open) {
      setForm(empty);
      setImgFile(null);
      setImgPreview('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, open]);

  const update = <K extends keyof PosterFormData>(key: K, value: PosterFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── 이미지 선택 ──────────────────────────────────────────────────────────
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.show('이미지 크기는 10MB 이하여야 합니다.', 'error');
      return;
    }
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
  };

  // ── 제출 ─────────────────────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim())     return toast.show('게임 이름을 입력해 주세요', 'error');
    if (!form.region.trim())    return toast.show('지역을 선택해 주세요', 'error');
    if (form.buyIn <= 0)        return toast.show('바이인 금액을 입력해 주세요', 'error');
    if (form.prizeAmount <= 0)  return toast.show('상금 금액을 입력해 주세요', 'error');

    // 법적 필터링
    const check = filterContent(`${form.title} ${form.prizes.join(' ')}`);
    if (check.blocked) {
      return toast.show(check.reason!, 'error');
    }

    let posterUrl = form.posterUrl;

    // 이미지 업로드
    if (imgFile && user) {
      setUploading(true);
      try {
        posterUrl = await uploadPoster(user.id, imgFile);
      } catch {
        toast.show('이미지 업로드에 실패했습니다. 다시 시도해 주세요.', 'error');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    onSubmit({ ...form, posterUrl });
    toast.show(isEdit ? '포스터가 수정되었습니다' : '포스터가 등록되었습니다', 'success');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '포스터 수정' : '새 포스터 등록'} maxWidth="md" variant="sheet">
      <form onSubmit={submit} className="p-4 space-y-3">

        {/* ── 포스터 이미지 업로드 ── */}
        <div>
          <span className="block text-xs font-medium text-ink-secondary mb-1">포스터 이미지</span>
          <div
            onClick={() => fileRef.current?.click()}
            className={[
              'relative w-full aspect-[3/4] max-h-48 rounded-card overflow-hidden cursor-pointer',
              'border-2 border-dashed border-border-default hover:border-gold-400 transition-colors',
              'flex flex-col items-center justify-center gap-2 bg-surface-high',
            ].join(' ')}
          >
            {imgPreview ? (
              <img src={imgPreview} alt="포스터 미리보기" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5A6175" strokeWidth="1.5" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <p className="text-xs text-ink-muted">클릭하여 포스터 이미지 선택</p>
                <p className="text-2xs text-ink-muted">JPG, PNG, WEBP · 최대 10MB</p>
              </>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-surface-base/70 flex items-center justify-center">
                <span className="w-6 h-6 rounded-full border-2 border-gold-300 border-t-transparent animate-spin"/>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="hidden" onChange={handleImageChange} />
          {imgPreview && (
            <button type="button" onClick={() => { setImgFile(null); setImgPreview(''); update('posterUrl', undefined); }}
              className="mt-1 text-2xs text-ink-muted hover:text-danger transition-colors">
              이미지 제거
            </button>
          )}
        </div>

        {/* 게임 이름 */}
        <FieldWrap label="게임 이름" required>
          <input type="text" required value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="예: 로티 단독 파이널롤백20" className="input" />
        </FieldWrap>

        {/* 날짜 + 스타트시간 */}
        <div className="grid grid-cols-2 gap-2">
          <FieldWrap label="날짜" required>
            <input type="date" required value={form.date}
              onChange={(e) => update('date', e.target.value)} className="input" />
          </FieldWrap>
          <FieldWrap label="스타트 시간" required>
            <input type="time" required value={form.startTime}
              onChange={(e) => update('startTime', e.target.value)} className="input" />
          </FieldWrap>
        </div>

        {/* 레지마감 */}
        <FieldWrap label="레지마감 시간">
          <input type="text" value={form.regCloseTime}
            onChange={(e) => update('regCloseTime', e.target.value)}
            placeholder="예: 16LV (00:12) 또는 23:30" className="input" />
        </FieldWrap>

        {/* 상금 형태 */}
        <FieldWrap label="상금 형태" required>
          <div className="grid grid-cols-2 gap-2">
            <RadioCard checked={form.prizeType === 'GTD'} onClick={() => update('prizeType', 'GTD')} title="GTD" desc="보장 상금" />
            <RadioCard checked={form.prizeType === 'ENTRY'} onClick={() => update('prizeType', 'ENTRY')} title="엔트리" desc="참가비 누적" />
          </div>
        </FieldWrap>

        {/* 대회/이벤트 분류 — 캘린더 '대회' 필터에 노출 (Task 3) */}
        <FieldWrap label="대회/이벤트 분류">
          <button
            type="button"
            role="switch"
            aria-checked={form.isCompetition}
            onClick={() => update('isCompetition', !form.isCompetition)}
            className={['w-full flex items-center justify-between p-3 rounded-input border-2 text-left transition-all',
              form.isCompetition ? 'border-gold-300 bg-gold-300/10' : 'border-border-default bg-surface-high hover:border-border-strong'].join(' ')}
          >
            <span>
              <span className={['block text-sm font-bold leading-none', form.isCompetition ? 'text-gold-300' : 'text-ink-primary'].join(' ')}>
                대회/이벤트로 표시
              </span>
              <span className="block text-2xs text-ink-muted mt-1">캘린더의 [대회] 필터에 노출됩니다 (정규 대회·시리즈·이벤트)</span>
            </span>
            <span aria-hidden className={['shrink-0 w-9 h-5 rounded-full relative transition-colors',
              form.isCompetition ? 'bg-gold-300' : 'bg-surface-float'].join(' ')}>
              <span className={['absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                form.isCompetition ? 'left-[1.125rem]' : 'left-0.5'].join(' ')} />
            </span>
          </button>
        </FieldWrap>

        {/* 상금 + 바이인 */}
        <div className="grid grid-cols-2 gap-2">
          <FieldWrap label={form.prizeType === 'GTD' ? '보장 상금' : '예상 상금'} suffix="만원" required>
            <input type="number" required min={0} value={form.prizeAmount || ''}
              onChange={(e) => update('prizeAmount', Number(e.target.value))} placeholder="1100" className="input" />
          </FieldWrap>
          <FieldWrap label="바이인" suffix="원" required>
            <input type="number" required min={0} value={form.buyIn || ''}
              onChange={(e) => update('buyIn', Number(e.target.value))} placeholder="100000" className="input" />
          </FieldWrap>
        </div>

        {/* 지역 */}
        <FieldWrap label="지역" required>
          <div className="space-y-1.5">
            <input type="text" required value={form.region}
              onChange={(e) => update('region', e.target.value)}
              placeholder="예: 경기도 남양주" className="input" list="region-suggestions" />
            <datalist id="region-suggestions">
              {REGION_OPTIONS.map((r) => <option key={r} value={r} />)}
            </datalist>
            <div className="flex flex-wrap gap-1">
              {REGION_OPTIONS.slice(0, 6).map((r) => (
                <button key={r} type="button" onClick={() => update('region', r)}
                  className={['text-2xs px-2 py-0.5 rounded-badge border transition-colors',
                    form.region === r ? 'bg-gold-300/15 border-gold-300 text-gold-300'
                      : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </FieldWrap>

        {/* 결제 수단 — 기본(현금/카드/매장이용권) + 업주 직접 추가(최대 10) */}
        <FieldWrap label={`결제 수단 (${form.paymentMethods.length}/${MAX_PAYMENTS})`} required>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_BASE.map((p) => {
                const checked = form.paymentMethods.includes(p);
                return (
                  <button key={p} type="button"
                    onClick={() => update('paymentMethods', checked
                      ? form.paymentMethods.filter((m) => m !== p)
                      : (form.paymentMethods.length >= MAX_PAYMENTS ? form.paymentMethods : [...form.paymentMethods, p]))}
                    className={['px-2.5 py-1 rounded-badge text-xs font-semibold border transition-colors',
                      checked ? 'bg-gold-300/15 border-gold-300 text-gold-300'
                        : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
                    {checked ? '✓ ' : ''}{p}
                  </button>
                );
              })}
            </div>
            <TagAdder
              items={form.paymentMethods.filter((m) => !PAYMENT_BASE.includes(m))}
              max={MAX_PAYMENTS}
              total={form.paymentMethods.length}
              placeholder="기타 결제수단 직접 입력 (예: 토스, 상품권)"
              onAdd={(v) => { if (!form.paymentMethods.includes(v)) update('paymentMethods', [...form.paymentMethods, v]); }}
              onRemove={(v) => update('paymentMethods', form.paymentMethods.filter((m) => m !== v))}
            />
          </div>
        </FieldWrap>

        {/* 파트너 / 시드권 — 업주 직접 추가(최대 10) */}
        <FieldWrap label={`파트너 / 시드권 (${form.partners.length}/${MAX_PARTNERS})`}>
          <TagAdder
            items={form.partners}
            max={MAX_PARTNERS}
            total={form.partners.length}
            placeholder="예: KPT, WPT, 시드권 제휴처"
            onAdd={(v) => { if (!form.partners.includes(v)) update('partners', [...form.partners, v]); }}
            onRemove={(v) => update('partners', form.partners.filter((p) => p !== v))}
          />
        </FieldWrap>

        {/* 시상품 */}
        <FieldWrap label={`시상품 (${form.prizes.length}/${MAX_PRIZES})`}>
          <PrizeList prizes={form.prizes} onChange={(prizes) => update('prizes', prizes)} />
        </FieldWrap>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">취소</button>
          <button type="submit" disabled={uploading} className="btn-primary flex-1 disabled:opacity-60">
            {uploading ? '업로드 중…' : isEdit ? '수정 완료' : '등록하기'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

function PrizeList({ prizes, onChange }: { prizes: string[]; onChange: (prizes: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || prizes.length >= MAX_PRIZES) return;
    onChange([...prizes, v]); setDraft('');
  };
  return (
    <div className="space-y-1.5">
      {prizes.length > 0 && (
        <ul className="space-y-1">
          {prizes.map((p, i) => (
            <li key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-input bg-gold-300/5 border border-gold-400/30">
              <span className="text-xs text-ink-primary flex-1 truncate">{p}</span>
              <button type="button" onClick={() => onChange(prizes.filter((_, idx) => idx !== i))}
                aria-label="삭제" className="text-ink-muted hover:text-danger text-2xs px-1">✕</button>
            </li>
          ))}
        </ul>
      )}
      {prizes.length < MAX_PRIZES && (
        <div className="flex gap-1.5">
          <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="예: KPT 메인 1석" className="input flex-1 text-sm" />
          <button type="button" onClick={add} disabled={!draft.trim()}
            className="btn-ghost text-xs px-3 shrink-0 disabled:opacity-40">추가</button>
        </div>
      )}
    </div>
  );
}

// 직접 추가형 태그 입력(결제수단/파트너 공통). total = 전체 합(기본칩 포함) 기준 한도 체크.
function TagAdder({ items, max, total, placeholder, onAdd, onRemove }: {
  items: string[];
  max: number;
  total: number;
  placeholder: string;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || total >= max) return;
    onAdd(v); setDraft('');
  };
  return (
    <div className="space-y-1.5">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={it} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-badge text-xs font-semibold bg-surface-high border border-border-default text-ink-primary">
              {it}
              <button type="button" onClick={() => onRemove(it)} aria-label={`${it} 삭제`}
                className="text-ink-muted hover:text-danger text-2xs">✕</button>
            </span>
          ))}
        </div>
      )}
      {total < max && (
        <div className="flex gap-1.5">
          <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={placeholder} maxLength={20} className="input flex-1 text-sm" />
          <button type="button" onClick={add} disabled={!draft.trim()}
            className="btn-ghost text-xs px-3 shrink-0 disabled:opacity-40">추가</button>
        </div>
      )}
    </div>
  );
}

function FieldWrap({ label, required, suffix, children }: {
  label: string; required?: boolean; suffix?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-ink-secondary">
          {label}{required && <span className="text-danger ml-0.5">*</span>}
        </span>
        {suffix && <span className="text-2xs text-ink-muted">단위: {suffix}</span>}
      </div>
      {children}
    </label>
  );
}

function RadioCard({ checked, onClick, title, desc }: {
  checked: boolean; onClick: () => void; title: string; desc: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={['p-3 rounded-input border-2 text-left transition-all',
        checked ? 'border-gold-300 bg-gold-300/10' : 'border-border-default bg-surface-high hover:border-border-strong'].join(' ')}>
      <p className={['text-sm font-bold leading-none', checked ? 'text-gold-300' : 'text-ink-primary'].join(' ')}>{title}</p>
      <p className="text-2xs text-ink-muted mt-1">{desc}</p>
    </button>
  );
}