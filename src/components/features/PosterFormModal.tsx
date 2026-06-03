// src/components/features/PosterFormModal.tsx
import { useState, useEffect, useRef } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { uploadPoster } from '../../lib/storage';
import { filterContent } from '../../lib/content-filter';
import type { Schedule } from '../../api/schedules';
import { REGION_CHIPS } from './IntegratedSearchBar';

interface PosterFormModalProps {
  open: boolean;
  onClose: () => void;
  schedule?: Schedule | null;
  onSubmit: (data: PosterFormData) => void;
  /** 관리자 직접 등록 시 선택 가능한 홀덤펍 목록 */
  venues?: { id: string; name: string; region?: string }[];
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
  rankingPrizes: { rank: string; amount: number }[]; // 순위별 상금(1등~머니인) — 선택
  events: string[];       // 이벤트/프로모션(신규·할인 등) — 선택
  posterUrl?: string;
  // 관리자 직접 등록용 — 홀덤펍 선택(기존) 또는 직접 입력
  venueId?: string;
  pubName?: string;
}

const PAYMENT_BASE = ['현금', '카드', '매장이용권'];
const MAX_PAYMENTS = 10;
const MAX_PARTNERS = 10;
const MAX_PRIZES = 10;
const MAX_RANKS = 20;
const MAX_EVENTS = 10;
// 빠른 추가용 이벤트 프리셋
const EVENT_PRESETS = ['신규 이벤트', '할인 이벤트', '얼리버드', '해피아워', '리바이 1+1'];

export default function PosterFormModal({ open, onClose, schedule, onSubmit, venues = [] }: PosterFormModalProps) {
  const toast  = useToast();
  const { user } = useAuth();
  const isEdit = !!schedule;
  const isAdmin = user?.role === 'admin';

  const empty: PosterFormData = {
    title: '', date: new Date().toISOString().slice(0, 10),
    startTime: '19:00', regCloseTime: '',
    prizeType: 'GTD', prizeAmount: 0, buyIn: 0, region: '',
    isCompetition: false,
    paymentMethods: ['현금'], partners: [], prizes: [],
    rankingPrizes: [], events: [],
    venueId: '', pubName: '',
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
        rankingPrizes: schedule.rankingPrizes?.map((r) => ({ rank: r.rank, amount: r.amount })) ?? [],
        events: schedule.promotions?.map((p) => p.title) ?? [],
        posterUrl: schedule.posterUrl,
        venueId: schedule.venueId, pubName: schedule.pubName,
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

        {/* 관리자: 홀덤펍 선택(기존) 또는 직접 입력 */}
        {isAdmin && (
          <FieldWrap label="홀덤펍 (매장)" required>
            <div className="space-y-1.5">
              <select
                value={form.venueId || ''}
                onChange={(e) => {
                  const v = venues.find((x) => x.id === e.target.value);
                  update('venueId', e.target.value);
                  if (v) { update('pubName', v.name); if (v.region) update('region', v.region); }
                }}
                className="input w-full text-sm"
              >
                <option value="">직접 입력</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}{v.region ? ` (${v.region})` : ''}</option>
                ))}
              </select>
              {!form.venueId && (
                <input type="text" value={form.pubName ?? ''}
                  onChange={(e) => update('pubName', e.target.value)}
                  placeholder="홀덤펍 이름 직접 입력" className="input w-full text-sm" />
              )}
            </div>
          </FieldWrap>
        )}

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

        {/* 지역 — 일정탐색 지역에서 선택 (직접입력 없음) */}
        <FieldWrap label="지역" required>
          <select
            value={form.region}
            onChange={(e) => update('region', e.target.value)}
            className="input w-full"
          >
            <option value="">지역 선택</option>
            {REGION_CHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="기타">기타</option>
          </select>
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

        {/* 이벤트 / 프로모션 — 선택 (신규·할인 등) */}
        <FieldWrap label={`이벤트 / 프로모션 (${form.events.length}/${MAX_EVENTS})`}>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {EVENT_PRESETS.map((ev) => {
                const on = form.events.includes(ev);
                return (
                  <button key={ev} type="button"
                    onClick={() => update('events', on
                      ? form.events.filter((e) => e !== ev)
                      : (form.events.length >= MAX_EVENTS ? form.events : [...form.events, ev]))}
                    className={['px-2.5 py-1 rounded-badge text-xs font-semibold border transition-colors',
                      on ? 'bg-gold-300/15 border-gold-300 text-gold-300'
                        : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
                    {on ? '✓ ' : ''}{ev}
                  </button>
                );
              })}
            </div>
            <TagAdder
              items={form.events.filter((e) => !EVENT_PRESETS.includes(e))}
              max={MAX_EVENTS}
              total={form.events.length}
              placeholder="기타 이벤트 직접 입력 (예: 오픈 기념 이벤트)"
              onAdd={(v) => { if (!form.events.includes(v)) update('events', [...form.events, v]); }}
              onRemove={(v) => update('events', form.events.filter((e) => e !== v))}
            />
          </div>
        </FieldWrap>

        {/* 순위별 상금 — 1등부터 머니인 구간까지 (선택) */}
        <FieldWrap label={`순위별 상금 (${form.rankingPrizes.length}/${MAX_RANKS})`} suffix="만원">
          <RankingPrizeList prizes={form.rankingPrizes} onChange={(rp) => update('rankingPrizes', rp)} />
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

// 순위별 상금(1등~머니인) — 선택. 금액은 만원 단위.
function RankingPrizeList({ prizes, onChange }: {
  prizes: { rank: string; amount: number }[];
  onChange: (v: { rank: string; amount: number }[]) => void;
}) {
  const add = () => {
    if (prizes.length >= MAX_RANKS) return;
    onChange([...prizes, { rank: `${prizes.length + 1}위`, amount: 0 }]);
  };
  const setAt = (i: number, patch: Partial<{ rank: string; amount: number }>) =>
    onChange(prizes.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-1.5">
      {prizes.length > 0 && (
        <ul className="space-y-1">
          {prizes.map((p, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <input value={p.rank} onChange={(e) => setAt(i, { rank: e.target.value })} maxLength={12}
                placeholder={`${i + 1}위`} className="input w-20 text-sm" />
              <input type="number" inputMode="numeric" value={p.amount || ''}
                onChange={(e) => setAt(i, { amount: parseInt(e.target.value, 10) || 0 })}
                placeholder="상금(만원)" className="input flex-1 text-sm tabular-nums" />
              <span className="text-2xs text-ink-muted shrink-0">만</span>
              <button type="button" onClick={() => onChange(prizes.filter((_, k) => k !== i))}
                aria-label="삭제" className="text-ink-muted hover:text-danger text-2xs px-1">✕</button>
            </li>
          ))}
        </ul>
      )}
      {prizes.length < MAX_RANKS && (
        <button type="button" onClick={add} className="btn-ghost text-xs w-full py-1.5">
          + 순위 추가 {prizes.length === 0 && '(1등부터 머니인까지 선택 입력)'}
        </button>
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

// 주의: label 로 감싸면 빈 영역 클릭이 내부 첫 컨트롤(예: 결제수단 첫 버튼)을 토글하므로 div 사용
function FieldWrap({ label, required, suffix, children }: {
  label: string; required?: boolean; suffix?: string; children: React.ReactNode;
}) {
  return (
    <div className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-ink-secondary">
          {label}{required && <span className="text-danger ml-0.5">*</span>}
        </span>
        {suffix && <span className="text-2xs text-ink-muted">단위: {suffix}</span>}
      </div>
      {children}
    </div>
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