// src/components/features/PosterFormModal.tsx
import { useState, useEffect, useRef } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { uploadPoster } from '../../lib/storage';
import { filterContent } from '../../lib/content-filter';
import type { Schedule } from '../../api/schedules';
import { REGION_CHIPS } from './IntegratedSearchBar';
import { generateBlinds } from '../../api/clock';

interface PosterFormModalProps {
  open: boolean;
  onClose: () => void;
  schedule?: Schedule | null;
  onSubmit: (data: PosterFormData) => void;
  /** 관리자 직접 등록 시 선택 가능한 홀덤펍 목록 */
  venues?: { id: string; name: string; region?: string }[];
  /** 신규 작성 시 "지난 포스터 불러오기" 후보(전체 일정 — 내부에서 내 것만 필터) */
  pastPosters?: Schedule[];
}

export interface PosterFormData {
  id?: string;
  title: string;
  date: string;
  startTime: string;
  regCloseTime: string;
  duration: string;               // 듀레이션(총 진행 시간 등) — 직접 입력
  blinds: string;                 // 블라인드 구조 — 직접 입력(선택)
  prizeType: 'GTD' | 'ENTRY';
  prizeAmount: number;            // GTD: 보장 상금(만원)
  prizePercent: number;           // ENTRY: 프라이즈 비율(%)
  buyIn: number;
  gameType: string;               // 게임 종류 자유 입력(프리즈아웃·바운티·애드온 등) — 선택
  addonStack: number;             // 애드온 스택(애드온 게임) — 선택
  addonCost: number;              // 애드온 비용 — 선택
  startStack: number;             // 스타팅 스택(칩) — 선택
  rebuyStack: number;             // 리바인 스택(칩) — 선택
  region: string;
  isCompetition: boolean; // '대회/이벤트' 분류 (Task 3) — 필터 [대회]에 노출
  paymentMethods: string[];
  partners: string[];     // 파트너 / 시드권 — 업주 직접 추가
  prizes: string[];
  rankingPrizes: { rank: string; amount: number; unit: string }[]; // 순위별 상금(값+단위 직접 입력) — 선택
  events: { badge?: string; title: string }[]; // 이벤트/프로모션(배지 + 내용) — 선택
  /** 주간 반복 등록 횟수(생성 시에만 사용, 1=반복 없음) */
  repeatWeeks?: number;
  /** 포스터별 커스텀 블라인드 표(비우면 기본 자동 생성 표시) */
  blindLevels?: { sb: number; bb: number; ante: number; minutes: number; isBreak?: boolean }[];
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

export default function PosterFormModal({ open, onClose, schedule, onSubmit, venues = [], pastPosters = [] }: PosterFormModalProps) {
  const toast  = useToast();
  const { user } = useAuth();
  const isEdit = !!schedule;
  const isAdmin = user?.role === 'admin';

  const empty: PosterFormData = {
    title: '', date: new Date().toLocaleDateString('en-CA'),
    startTime: '19:00', regCloseTime: '', duration: '', blinds: '',
    prizeType: 'GTD', prizeAmount: 0, prizePercent: 0, buyIn: 0, gameType: '', addonStack: 0, addonCost: 0, startStack: 0, rebuyStack: 0, region: '',
    isCompetition: false,
    paymentMethods: ['현금'], partners: [], prizes: [],
    rankingPrizes: [], events: [], repeatWeeks: 1, blindLevels: [],
    venueId: '', pubName: '',
  };

  const [form,       setForm]       = useState<PosterFormData>(empty);
  const [imgFile,    setImgFile]    = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string>('');
  const [uploading,  setUploading]  = useState(false);
  // 레지마감: 레벨/시간 분리 입력 (둘 중 하나 이상 필수). 저장 시 'NLV HH:MM' 형태로 합쳐 regCloseTime 에 반영
  const [regLevel,   setRegLevel]   = useState('');
  const [regTime,    setRegTime]    = useState('');
  // 블라인드 표 직접 편집(선택)
  const [blindOpen, setBlindOpen] = useState(false);
  const setBlinds = (fn: (arr: NonNullable<PosterFormData['blindLevels']>) => NonNullable<PosterFormData['blindLevels']>) =>
    setForm((f) => ({ ...f, blindLevels: fn(f.blindLevels ?? []) }));
  const fillBlinds = () => {
    const rc = Math.min(Math.max(parseInt(regLevel, 10) || 16, 1), 25);
    setBlinds(() => generateBlinds(rc, 25, 20, 20).map((l) => ({ sb: l.sb, bb: l.bb, ante: l.ante, minutes: l.minutes, isBreak: l.kind === 'break' })));
  };
  const setBlindRow = (i: number, patch: Partial<{ sb: number; bb: number; ante: number; minutes: number; isBreak: boolean }>) =>
    setBlinds((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addBlindRow = (isBreak: boolean) =>
    setBlinds((arr) => [...arr, isBreak ? { sb: 0, bb: 0, ante: 0, minutes: 8, isBreak: true } : { sb: 0, bb: 0, ante: 0, minutes: 20 }]);
  const removeBlindRow = (i: number) => setBlinds((arr) => arr.filter((_, idx) => idx !== i));
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (schedule) {
      setForm({
        id: schedule.id, title: schedule.title, date: schedule.date,
        startTime: schedule.startTime,
        regCloseTime: schedule.regCloseTime ?? '',
        duration: schedule.duration ?? '',
        blinds: schedule.blinds ?? '',
        prizeType: schedule.guaranteed ? 'GTD' : 'ENTRY',
        prizeAmount: schedule.prizePool ? Math.round(schedule.prizePool / 10000) : 0,
        prizePercent: schedule.prizePercent ?? 0,
        buyIn: schedule.buyIn.amount, gameType: schedule.buyIn.gameType ?? '', addonStack: schedule.buyIn.addonStack ?? 0, addonCost: schedule.buyIn.addon ?? 0, startStack: schedule.buyIn.startStack ?? 0, rebuyStack: schedule.buyIn.rebuyStack ?? 0, region: schedule.region,
        isCompetition: schedule.isCompetition ?? false,
        paymentMethods: schedule.paymentMethods ?? ['현금'],
        partners: schedule.partners ?? [],
        prizes: schedule.seats?.map((s) => `${s.label} ${s.count}석`) ?? [],
        rankingPrizes: schedule.rankingPrizes?.map((r) => ({ rank: r.rank, amount: r.amount, unit: r.unit ?? '' })) ?? [],
        events: schedule.promotions?.map((p) => ({ badge: p.badge, title: p.title })) ?? [],
        blindLevels: schedule.structure?.levels ?? [],
        posterUrl: schedule.posterUrl,
        venueId: schedule.venueId, pubName: schedule.pubName,
      });
      setImgPreview(schedule.posterUrl ?? '');
      // 기존 레지마감 문자열에서 레벨/시간 분리
      const rc = schedule.regCloseTime ?? '';
      const lv = rc.match(/(\d+)\s*LV/i);
      const tm = rc.match(/(\d{1,2}:\d{2})/);
      setRegLevel(lv ? lv[1] : '');
      setRegTime(tm ? tm[1] : '');
    } else if (open) {
      setForm(empty);
      setImgFile(null);
      setImgPreview('');
      setRegLevel('');
      setRegTime('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, open]);

  const update = <K extends keyof PosterFormData>(key: K, value: PosterFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── 지난 포스터 불러오기(신규 작성 전용) — 전 필드 복사, 날짜만 오늘로 ─────────
  const loadCandidates = pastPosters
    .filter((s) => isAdmin || s.ownerId === user?.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);
  const applyPast = (s: Schedule) => {
    setForm({
      title: s.title, date: new Date().toLocaleDateString('en-CA'),
      startTime: s.startTime,
      regCloseTime: s.regCloseTime ?? '',
      duration: s.duration ?? '',
      blinds: s.blinds ?? '',
      prizeType: s.guaranteed ? 'GTD' : 'ENTRY',
      prizeAmount: s.prizePool ? Math.round(s.prizePool / 10000) : 0,
      prizePercent: s.prizePercent ?? 0,
      buyIn: s.buyIn.amount, gameType: s.buyIn.gameType ?? '', addonStack: s.buyIn.addonStack ?? 0, addonCost: s.buyIn.addon ?? 0, startStack: s.buyIn.startStack ?? 0, rebuyStack: s.buyIn.rebuyStack ?? 0, region: s.region,
      isCompetition: s.isCompetition ?? false,
      paymentMethods: s.paymentMethods ?? ['현금'],
      partners: s.partners ?? [],
      prizes: s.seats?.map((x) => `${x.label} ${x.count}석`) ?? [],
      rankingPrizes: s.rankingPrizes?.map((r) => ({ rank: r.rank, amount: r.amount, unit: r.unit ?? '' })) ?? [],
      events: s.promotions?.map((p) => ({ badge: p.badge, title: p.title })) ?? [],
      repeatWeeks: 1,
      blindLevels: s.structure?.levels ?? [],
      posterUrl: s.posterUrl, // 포스터 이미지도 그대로 재사용
      venueId: s.venueId, pubName: s.pubName,
    });
    setImgFile(null);
    setImgPreview(s.posterUrl ?? '');
    const rc = s.regCloseTime ?? '';
    const lv = rc.match(/(\d+)\s*LV/i);
    const tm = rc.match(/(\d{1,2}:\d{2})/);
    setRegLevel(lv ? lv[1] : '');
    setRegTime(tm ? tm[1] : '');
    toast.show('지난 포스터를 불러왔습니다 — 날짜만 확인하고 등록하세요', 'success');
  };

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
    if (form.prizeType === 'GTD'   && form.prizeAmount <= 0)  return toast.show('보장 상금 금액을 입력해 주세요', 'error');
    if (form.prizeType === 'ENTRY' && form.prizePercent <= 0) return toast.show('프라이즈 비율(%)을 입력해 주세요', 'error');
    const regClose = [regLevel.trim() ? `${regLevel.trim()}LV` : '', regTime.trim()].filter(Boolean).join(' ');
    if (!regClose)              return toast.show('레지마감은 레벨 또는 시간 중 하나 이상 입력해 주세요', 'error');

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

    onSubmit({ ...form, regCloseTime: regClose, posterUrl });
    toast.show(isEdit ? '포스터가 수정되었습니다' : '포스터가 등록되었습니다', 'success');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '포스터 수정' : '새 포스터 등록'} maxWidth="md" variant="sheet" dismissOnBackdrop={false}>
      <form onSubmit={submit} className="p-4 space-y-3">

        {/* ── 지난 포스터 불러오기(신규 전용) — 전 필드 자동 채움, 날짜만 새로 ── */}
        {!isEdit && loadCandidates.length > 0 && (
          <div className="rounded-card border border-gold-400/30 bg-gold-300/[0.06] p-3">
            <label className="mb-1.5 block text-sm font-bold text-gold-300">📋 지난 포스터 불러오기</label>
            <select
              value=""
              onChange={(e) => {
                const found = loadCandidates.find((s) => s.id === e.target.value);
                if (found) applyPast(found);
              }}
              className="input w-full text-sm"
            >
              <option value="">선택하면 모든 항목이 자동으로 채워집니다 (날짜만 새로)</option>
              {loadCandidates.map((s) => (
                <option key={s.id} value={s.id}>{s.date.slice(5)} · {s.title}</option>
              ))}
            </select>
          </div>
        )}

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
            <TimeSelect value={form.startTime} onChange={(v) => update('startTime', v)} />
          </FieldWrap>
        </div>

        {/* 반복 등록 (생성 시에만) — 매주 같은 요일/시간으로 N주 자동 생성 */}
        {!isEdit && (
          <FieldWrap label="반복 등록 (매주 같은 요일)">
            <select
              value={form.repeatWeeks ?? 1}
              onChange={(e) => update('repeatWeeks', Number(e.target.value))}
              className="input"
            >
              <option value={1}>반복 없음 (1회)</option>
              <option value={4}>매주 · 4주</option>
              <option value={8}>매주 · 8주</option>
              <option value={12}>매주 · 12주</option>
            </select>
          </FieldWrap>
        )}

        {/* 레지마감 — 레벨/시간 분리 (둘 중 하나 이상 필수) */}
        {/* 블라인드 표 직접 편집(선택) — 저장 시 포스터 상세 '블라인드 구조'에 그대로 표시 */}
        <FieldWrap label="블라인드 표 직접 편집 (선택)">
          <button type="button" onClick={() => setBlindOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-input border border-border-default bg-surface-high text-sm font-semibold text-ink-secondary hover:text-gold-300 transition-colors">
            <span>{(form.blindLevels?.length ?? 0) > 0 ? `맞춤 ${form.blindLevels!.filter((l) => !l.isBreak).length}레벨 저장됨` : '블라인드 표 편집 열기 (비우면 기본 표)'}</span>
            <span className="text-2xs text-gold-300">{blindOpen ? '▲' : '▼'}</span>
          </button>
          {blindOpen && (
            <div className="mt-2 space-y-2 rounded-input border border-border-subtle bg-surface-base p-2.5">
              <div className="flex items-center gap-2">
                <button type="button" onClick={fillBlinds} className="btn-ghost text-2xs px-2 text-gold-300">자동 생성(레지 {regLevel || '16'}LV·20분·25레벨)</button>
                {(form.blindLevels?.length ?? 0) > 0 && <button type="button" onClick={() => setBlinds(() => [])} className="btn-ghost text-2xs px-2 hover:text-danger-light">전체 비우기</button>}
              </div>
              {(form.blindLevels?.length ?? 0) === 0 ? (
                <p className="text-2xs text-ink-muted text-center py-3">자동 생성 후 값을 수정하거나 행을 추가하세요. 비워두면 기본(파이널롤백) 표가 표시됩니다.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {(form.blindLevels ?? []).map((l, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="w-5 shrink-0 text-center text-2xs text-ink-muted">{l.isBreak ? '–' : (form.blindLevels!.slice(0, i + 1).filter((x) => !x.isBreak).length)}</span>
                      {l.isBreak ? (
                        <span className="flex-1 text-2xs font-bold text-gold-300">BREAK</span>
                      ) : (
                        <>
                          <input type="number" inputMode="numeric" value={l.sb || ''} onChange={(e) => setBlindRow(i, { sb: parseInt(e.target.value, 10) || 0 })} placeholder="SB" className="input min-w-0 flex-1 px-1.5 py-1 text-2xs tabular-nums" />
                          <input type="number" inputMode="numeric" value={l.bb || ''} onChange={(e) => setBlindRow(i, { bb: parseInt(e.target.value, 10) || 0 })} placeholder="BB" className="input min-w-0 flex-1 px-1.5 py-1 text-2xs tabular-nums" />
                          <input type="number" inputMode="numeric" value={l.ante || ''} onChange={(e) => setBlindRow(i, { ante: parseInt(e.target.value, 10) || 0 })} placeholder="앤티" className="input min-w-0 flex-1 px-1.5 py-1 text-2xs tabular-nums" />
                        </>
                      )}
                      <input type="number" inputMode="numeric" value={l.minutes || ''} onChange={(e) => setBlindRow(i, { minutes: parseInt(e.target.value, 10) || 0 })} placeholder="분" className="input w-11 shrink-0 px-1.5 py-1 text-2xs tabular-nums" />
                      <button type="button" onClick={() => removeBlindRow(i)} aria-label="행 삭제" className="shrink-0 px-1 text-xs text-ink-muted hover:text-danger-light">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => addBlindRow(false)} className="btn-ghost flex-1 text-2xs px-2">+ 레벨 추가</button>
                <button type="button" onClick={() => addBlindRow(true)} className="btn-ghost flex-1 text-2xs px-2">+ 브레이크</button>
              </div>
            </div>
          )}
        </FieldWrap>

        <FieldWrap label="레지마감 (레벨 또는 시간 중 하나 이상)" required>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-2xs text-ink-muted mb-1">레벨</span>
              <div className="relative">
                <input type="number" inputMode="numeric" min={1} value={regLevel}
                  onChange={(e) => setRegLevel(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="예: 16" className="input w-full text-sm pr-9" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted pointer-events-none">LV</span>
              </div>
            </div>
            <div>
              <span className="block text-2xs text-ink-muted mb-1">시간</span>
              <input type="time" value={regTime} onChange={(e) => setRegTime(e.target.value)} className="input w-full text-sm" />
            </div>
          </div>
          {(regLevel || regTime) && (
            <p className="mt-1 text-2xs font-semibold text-gold-300">
              레지마감: {[regLevel ? `${regLevel}LV` : '', regTime].filter(Boolean).join(' ')}
            </p>
          )}
        </FieldWrap>

        {/* 듀레이션 — 총 진행 시간/레벨 등 (포스터 정보) */}
        <FieldWrap label="듀레이션">
          <input type="text" value={form.duration}
            onChange={(e) => update('duration', e.target.value)}
            placeholder="예: 25/15분 또는 약 5시간" className="input" />
        </FieldWrap>

        {/* 블라인드 구조 — 선택(입력 안 해도 됨) */}
        <FieldWrap label="블라인드 (선택)">
          <input type="text" value={form.blinds}
            onChange={(e) => update('blinds', e.target.value)}
            placeholder="예: 100/200 (25분 레벨) · 비워둬도 됩니다" className="input" />
        </FieldWrap>

        {/* 상금 형태 */}
        <FieldWrap label="상금 형태" required>
          <div className="grid grid-cols-2 gap-2">
            <RadioCard checked={form.prizeType === 'GTD'} onClick={() => update('prizeType', 'GTD')} title="GTD" desc="보장 상금" />
            <RadioCard checked={form.prizeType === 'ENTRY'} onClick={() => update('prizeType', 'ENTRY')} title="엔트리" desc="참가비 누적" />
          </div>
        </FieldWrap>

        {/* (대회 분류는 관리자 설정 > 게시물 관리 > 포스터에서 지정) */}

        {/* 상금 + 바이인 */}
        <div className="grid grid-cols-2 gap-2">
          {form.prizeType === 'GTD' ? (
            <FieldWrap label="보장 상금" suffix="만원" required>
              <input type="number" required min={0} value={form.prizeAmount || ''}
                onChange={(e) => update('prizeAmount', Number(e.target.value))} placeholder="1100" className="input" />
            </FieldWrap>
          ) : (
            <FieldWrap label="프라이즈" suffix="%" required>
              <input type="number" required min={0} max={100} value={form.prizePercent || ''}
                onChange={(e) => update('prizePercent', Number(e.target.value))} placeholder="예: 90" className="input" />
            </FieldWrap>
          )}
          <FieldWrap label="바이인" suffix="원" required>
            <input type="number" required min={0} value={form.buyIn || ''}
              onChange={(e) => update('buyIn', Number(e.target.value))} placeholder="100000" className="input" />
          </FieldWrap>
        </div>

        {/* 게임 종류(자유 입력) — 포스터 상금 옆 뱃지로 표시. 애드온 게임이면 스택·비용 입력 */}
        <FieldWrap label="게임 종류">
          <input type="text" value={form.gameType} maxLength={20}
            onChange={(e) => update('gameType', e.target.value)}
            placeholder="예: 프리즈아웃, 바운티, 애드온, 딥스택…" className="input" />
        </FieldWrap>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrap label="애드온 스택" suffix="칩">
            <input type="number" min={0} value={form.addonStack || ''}
              onChange={(e) => update('addonStack', Number(e.target.value))} placeholder="예: 20000" className="input" />
          </FieldWrap>
          <FieldWrap label="애드온 비용" suffix="원">
            <input type="number" min={0} value={form.addonCost || ''}
              onChange={(e) => update('addonCost', Number(e.target.value))} placeholder="예: 50000" className="input" />
          </FieldWrap>
          <FieldWrap label="스타팅 스택" suffix="칩">
            <input type="number" min={0} value={form.startStack || ''}
              onChange={(e) => update('startStack', Number(e.target.value))} placeholder="예: 50000" className="input" />
          </FieldWrap>
          <FieldWrap label="리바인 스택" suffix="칩">
            <input type="number" min={0} value={form.rebuyStack || ''}
              onChange={(e) => update('rebuyStack', Number(e.target.value))} placeholder="예: 70000" className="input" />
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

        {/* 이벤트 · 프로모션 — 배지 + 내용 (포스터에 50%·5만 등 배지로 표시) */}
        <FieldWrap label={`이벤트 · 프로모션 (${form.events.length}/${MAX_EVENTS}) · 50%·5만 등 배지`}>
          <PromotionEditor items={form.events} onChange={(v) => update('events', v)} />
        </FieldWrap>

        {/* 순위별 상금 — 1등부터 머니인 구간까지 (선택, 단위 직접 입력) */}
        <FieldWrap label={`순위별 상금 (${form.rankingPrizes.length}/${MAX_RANKS})`}>
          <RankingPrizeList prizes={form.rankingPrizes} onChange={(rp) => update('rankingPrizes', rp)} />
        </FieldWrap>

        {/* 시상 */}
        <FieldWrap label={`시상 (${form.prizes.length}/${MAX_PRIZES})`}>
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

// 순위별 상금(1등~머니인) — 선택. 값 + 단위(직접 입력). 현금 단위 표기 없음.
function RankingPrizeList({ prizes, onChange }: {
  prizes: { rank: string; amount: number; unit: string }[];
  onChange: (v: { rank: string; amount: number; unit: string }[]) => void;
}) {
  const add = () => {
    if (prizes.length >= MAX_RANKS) return;
    onChange([...prizes, { rank: `${prizes.length + 1}위`, amount: 0, unit: '' }]);
  };
  const setAt = (i: number, patch: Partial<{ rank: string; amount: number; unit: string }>) =>
    onChange(prizes.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-1.5">
      {prizes.length > 0 && (
        <ul className="space-y-1">
          {prizes.map((p, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <input value={p.rank} onChange={(e) => setAt(i, { rank: e.target.value })} maxLength={12}
                placeholder={`${i + 1}위`} className="input w-16 text-sm shrink-0" />
              <input type="number" inputMode="numeric" value={p.amount || ''}
                onChange={(e) => setAt(i, { amount: parseInt(e.target.value, 10) || 0 })}
                placeholder="값" className="input flex-1 text-sm tabular-nums min-w-0" />
              <input value={p.unit} onChange={(e) => setAt(i, { unit: e.target.value })} maxLength={10}
                placeholder="단위 (예: 석, P, 시드권)" className="input w-28 text-sm shrink-0" />
              <button type="button" onClick={() => onChange(prizes.filter((_, k) => k !== i))}
                aria-label="삭제" className="text-ink-muted hover:text-danger text-2xs px-1 shrink-0">✕</button>
            </li>
          ))}
        </ul>
      )}
      {prizes.length < MAX_RANKS && (
        <button type="button" onClick={add} className="btn-ghost text-xs w-full py-1.5">
          + 순위 추가 {prizes.length === 0 && '(1등부터 머니인까지 · 단위 직접 입력)'}
        </button>
      )}
    </div>
  );
}

// 이벤트·프로모션 — 배지(50%·5만 등) + 내용. 포스터 상세에 배지로 노출.
function PromotionEditor({ items, onChange }: {
  items: { badge?: string; title: string }[];
  onChange: (v: { badge?: string; title: string }[]) => void;
}) {
  const PRESETS: { badge: string; title: string }[] = [
    { badge: '50%', title: '첫 방문 50% 할인' },
    { badge: '5만', title: '1LV 바인 5만' },
    { badge: '7만', title: '첫 바인 7만' },
    { badge: '얼리칩', title: '사전예약 얼리칩' },
    { badge: 'NEW', title: '신규 이벤트' },
    { badge: '할인', title: '할인 이벤트' },
  ];
  const setAt = (i: number, patch: Partial<{ badge?: string; title: string }>) =>
    onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const add = (p?: { badge: string; title: string }) => {
    if (items.length >= MAX_EVENTS) return;
    onChange([...items, p ?? { badge: '', title: '' }]);
  };
  return (
    <div className="space-y-1.5">
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((p, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <input value={p.badge ?? ''} onChange={(e) => setAt(i, { badge: e.target.value })} maxLength={6}
                placeholder="배지" className="input w-16 shrink-0 text-center text-sm font-bold text-gold-300" />
              <input value={p.title} onChange={(e) => setAt(i, { title: e.target.value })} maxLength={40}
                placeholder="내용 (예: 첫 방문 50% 할인)" className="input flex-1 min-w-0 text-sm" />
              <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))}
                aria-label="삭제" className="text-ink-muted hover:text-danger text-2xs px-1 shrink-0">✕</button>
            </li>
          ))}
        </ul>
      )}
      {items.length < MAX_EVENTS && (
        <button type="button" onClick={() => add()} className="btn-ghost text-xs w-full py-1.5">+ 프로모션 추가</button>
      )}
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button key={p.badge + p.title} type="button"
            disabled={items.length >= MAX_EVENTS || items.some((x) => x.title === p.title)}
            onClick={() => add(p)}
            className="rounded-badge border border-border-default bg-surface-high px-2 py-0.5 text-2xs text-ink-secondary hover:text-gold-300 disabled:opacity-40">
            + <b className="text-gold-300">{p.badge}</b> {p.title}
          </button>
        ))}
      </div>
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

// 시/분 선택형 시간 입력 — 분을 선택하면 드롭다운이 닫히며 즉시 저장(모바일 친화)
function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m0 = value?.match(/^(\d{1,2}):(\d{2})/); // 'HH:MM' 또는 'HH:MM:SS'(초 포함) 모두 허용
  const safe = m0 ? `${m0[1]}:${m0[2]}` : '19:00';
  const [h, m] = safe.split(':');
  const hh = h.padStart(2, '0');
  const mm = m.padStart(2, '0');
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const baseMins = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
  const mins = baseMins.includes(mm) ? baseMins : [mm, ...baseMins].sort();
  return (
    <div className="flex items-center gap-1.5">
      <select value={hh} onChange={(e) => onChange(`${e.target.value}:${mm}`)} className="input flex-1 text-sm tabular-nums">
        {hours.map((x) => <option key={x} value={x}>{x}시</option>)}
      </select>
      <span className="text-ink-muted font-bold">:</span>
      <select value={mm} onChange={(e) => onChange(`${hh}:${e.target.value}`)} className="input flex-1 text-sm tabular-nums">
        {mins.map((x) => <option key={x} value={x}>{x}분</option>)}
      </select>
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