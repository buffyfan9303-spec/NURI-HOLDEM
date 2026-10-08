// src/components/features/PosterFormModal.tsx
import { Fold } from '../atoms/Fold';
import { useState, useEffect, useRef, useId } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { posterCoreChanged } from '../../lib/posterReview';
import { useAuth } from '../../contexts/AuthContext';
import { uploadPoster } from '../../lib/storage';
import { filterContent } from '../../lib/content-filter';
import type { Schedule, Promotion } from '../../api/schedules';
import { SCHEDULE_TITLE_MAX } from '../../api/schedules';
import { DISCOUNT_TYPES, retypePromotion, type DiscountType } from '../../lib/promotionLabel';
import { ledgerLabelOf } from '../../lib/posterDiscounts';
import { wonToMan, manToWon, TICKET_WON } from '../../lib/units';
import { REGION_CHIPS } from './IntegratedSearchBar';
import { generateBlinds } from '../../api/clock';
import { applyToPoster, presetFromPosterForm } from '../../lib/gameInherit';
import { saveGamePreset, type GamePreset } from '../../api/presets';
import PresetPicker from './PresetPicker';
import Icon from '../atoms/Icon';
import { regCloseLevelFromText } from '../../lib/regClose';
import { posterFormFromSchedule, posterSaveParts, sameJson, type PosterLevel, type PosterSaveForm, type PosterSaveParts } from '../../lib/posterPayload';
import { MAX_EARLY_TIERS, MAX_VOUCHER_PER_ENTRY, voucherPerEntryMismatch } from '../../lib/chipRules';
import { msgOf } from '../../lib/dbError';

/** 포스터 저장의 **실제 결과**. 반복 등록이 있어 '성공/실패' 두 값으로는 부족하다 —
 *  3주 중 2주만 나간 경우를 사용자가 구별할 수 있어야 한다(App 이 이미 그렇게 판정하고 있었다). */
export interface PosterSubmitResult {
  /** 요청한 것이 **전부** 저장됐나. 부분 성공은 false 다. */
  ok: boolean;
  /** 실제로 저장된 건수. */
  saved: number;
  /** 요청한 건수(반복 등록이면 주 수, 수정이면 1). */
  total: number;
  /** H03-07 — 반복 등록에서 이번까지 서버에 들어간 날짜(재시도는 이 날짜를 다시 보내지 않는다). */
  savedDates?: string[];
  /** H03-07 — 이번 시도에서 실패로 끝난 날짜(응답만 잃었을 수 있어 다음 시도에 서버 목록과 대조한다). */
  failedDates?: string[];
}

interface PosterFormModalProps {
  open: boolean;
  onClose: () => void;
  schedule?: Schedule | null;
  /** 🔴 2026-09-20 — 결과를 **돌려줘야 한다**. 종전에는 `=> void` 라 모달이 서버 결과를 보기 전에
   *  성공 토스트를 띄우고 닫아 버렸다(거짓 성공 + 입력 소실). 실제로는 App 이 `Promise.allSettled` 로
   *  부분 성공까지 정확히 판정하고 있었는데 그 결과가 폼까지 오지 않았다.
   *  `void` 반환도 계속 받는다 — 결과를 안 주면 종전대로 낙관 처리한다(기존 호출부 보호). */
  onSubmit: (data: PosterFormData) => void | PosterSubmitResult | Promise<PosterSubmitResult>;
  /** 관리자 직접 등록 시 선택 가능한 홀덤펍 목록. premium = 기간 안 프리미엄 매장(포스터 즉시 공개 안내용, 판정은 서버) */
  venues?: { id: string; name: string; region?: string; premium?: boolean }[];
  /** 신규 작성 시 "지난 포스터 불러오기" 후보(전체 일정 — 내부에서 내 것만 필터) */
  pastPosters?: Schedule[];
  /** 내 매장 전환기에서 고른 매장(2026-09-28) — 게임 프리셋을 그 매장 것으로 읽는다. 없으면 프로필 매장. */
  storeVenueId?: string | null;
  /** 그룹 포스터 모드(20261002h) — 그 그룹에 올린다. '전체 일정에도 공개 요청' 체크가 생기고 이미지는 그룹 폴더로 올라간다. */
  group?: { id: string; name: string } | null;
}

export interface PosterFormData extends PosterSaveForm {
  grade: 'daily' | 'satellite' | 'series' | null;
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
  /** 이벤트/프로모션(배지 + 내용 + 참가비 할인액·자동 적용 레벨) — 선택.
   *  ⚠ 공용 Promotion 을 그대로 쓴다. 예전엔 {badge,title} 로 좁혀 담아 detail 이 수정할 때마다 사라졌다. */
  events: Promotion[];
  /** 주간 반복 등록 횟수(생성 시에만 사용, 1=반복 없음) */
  repeatWeeks?: number;
  /** H03-07 — 같은 폼에서 이미 저장된 반복 날짜 / 지난 시도에 실패한 날짜(재시도 때만 실린다). */
  repeatSaved?: string[];
  repeatRetry?: string[];
  /** 포스터별 커스텀 블라인드 표(비우면 기본 자동 생성 표시). 브레이크 행은 원문 label(W-15)을 가진다. */
  blindLevels?: PosterLevel[];
  /** 제출 때 폼이 만든 저장 부분(lib/posterPayload) — App 은 **이것만** 싣는다(W-02: 저장본 병합·바뀐 칸만). */
  saveParts?: PosterSaveParts;
  /** `null` = **이미지를 지운다**. `undefined` = 이 항목을 건드리지 않는다.
   *  둘을 한 값(undefined)으로 쓰던 때는 '이미지 제거'가 App 의 `!== undefined` 게이트에서
   *  통째로 걸러져 서버에도 화면에도 반영되지 않았다(2026-09-17). 두 뜻은 두 값이어야 한다. */
  posterUrl?: string | null;
  // 관리자 직접 등록용 — 홀덤펍 선택(기존) 또는 직접 입력
  venueId?: string;
  pubName?: string;
  /** 그룹 포스터(20261002h) — 있으면 App 이 그 그룹으로 저장한다. */
  groupId?: string;
  groupName?: string;
  /** 그룹 포스터의 '전체 일정에도 공개 요청'. false = 그룹 전용(관리자 대기열 밖). 매장 포스터는 싣지 않는다. */
  feedRequest?: boolean;
}

const PAYMENT_BASE = ['현금', '카드', '매장이용권'];
const MAX_PAYMENTS = 10;
const MAX_PARTNERS = 10;
const MAX_PRIZES = 10;
const MAX_RANKS = 20;
const MAX_EVENTS = 10;
const MAX_SIDE_EVENTS = 5;

export default function PosterFormModal({ open, onClose, schedule, onSubmit, venues = [], pastPosters = [], storeVenueId = null, group = null }: PosterFormModalProps) {
  const toast  = useToast();
  const { user } = useAuth();
  const isEdit = !!schedule;
  const isAdmin = user?.role === 'admin';

  // a11y: 라벨 연결용 고유 id
  const pastPosterId = useId();
  const venueSelectId = useId();
  const pubNameId    = useId();
  const titleId      = useId();
  const dateId       = useId();
  const repeatWeeksId = useId();
  const regLevelId   = useId();
  const regTimeId    = useId();
  const durationId   = useId();
  const blindsId     = useId();
  const prizeAmountId = useId();
  const prizePercentId = useId();
  const buyInId      = useId();
  const gameTypeId   = useId();
  const addonStackId = useId();
  const addonCostId  = useId();
  const startStackId = useId();
  const rebuyStackId = useId();
  const regionId     = useId();
  const rebuyPriceId = useId();
  const rebuyLimitId = useId();
  const addonEntryId = useId();
  const voucherPerEntryId = useId();
  const rebuyStacksId = useId();
  const earlyModeId  = useId();
  const rulesId      = useId();
  const descriptionId = useId();

  const empty: PosterFormData = {
    title: '', date: new Date().toLocaleDateString('en-CA'),
    startTime: '19:00', regCloseTime: '', duration: '', blinds: '',
    prizeType: 'GTD', prizeAmount: 0, prizePercent: 0, buyIn: 0, gameType: '', addonStack: 0, addonCost: 0, startStack: 0, rebuyStack: 0, region: '',
    isCompetition: false,
    grade: null as 'daily' | 'satellite' | 'series' | null,
    paymentMethods: ['현금'], partners: [], prizes: [],
    rankingPrizes: [], events: [], repeatWeeks: 1, blindLevels: [],
    venueId: '', pubName: '',
    rebuyPrice: 0, rebuyLimit: 0, rebuyStacks: [], earlyTiers: undefined, addonEntry: 0, voucherPerEntry: 0,
    description: '', rules: [], sideEvents: [],
  };
  /** 수정 폼을 열었을 때의 값 — 저장 때 '바뀐 칸만' 싣는 기준(W-02). 신규는 null. */
  const [initial, setInitial] = useState<PosterFormData | null>(null);

  const [form,       setForm]       = useState<PosterFormData>(empty);
  const [imgFile,    setImgFile]    = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string>('');
  const [uploading,  setUploading]  = useState(false);
  /** 저장 진행 중 — 버튼을 잠가 **중복 제출로 포스터가 두 벌 생기는 것**을 막는다.
   *  종전에는 결과를 안 기다리고 곧바로 닫혀서 이 상태가 있을 자리조차 없었다(그게 결함이었다). */
  const [saving,     setSaving]     = useState(false);
  // H03-07 — 더블 클릭: disabled 가 그려지기 전의 두 번째 submit 이 같은 날짜를 한 번 더 넣었다. 렌더와 무관한 ref 로 막는다.
  const busyRef = useRef(false);
  // H03-07 — 이 폼에서 이미 저장된 반복 날짜·지난 실패 날짜. 부분 성공 뒤 다시 누르면 남은 날짜만 보낸다.
  const repeatDoneRef = useRef<{ saved: string[]; failed: string[] }>({ saved: [], failed: [] });
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
  const setBlindRow = (i: number, patch: Partial<PosterLevel>) =>
    setBlinds((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addBlindRow = (isBreak: boolean) =>
    setBlinds((arr) => [...arr, isBreak ? { sb: 0, bb: 0, ante: 0, minutes: 8, isBreak: true } : { sb: 0, bb: 0, ante: 0, minutes: 20 }]);
  const removeBlindRow = (i: number) => setBlinds((arr) => arr.filter((_, idx) => idx !== i));
  const fileRef = useRef<HTMLInputElement>(null);
  // 세부 규칙 접힘 — 무언가 입력돼 있으면 머리에 개수를 보여 준다(접힌 채로도 '비어 있지 않음'을 안다)
  const [moreOpen, setMoreOpen] = useState(false);
  // 그룹 포스터의 '전체 일정에도 공개 요청' — 기본 꺼짐(그룹 전용). 수정이면 저장본 값.
  const [feedReq, setFeedReq] = useState(false);
  useEffect(() => { if (open) setFeedReq(schedule?.feedRequest ?? false); }, [open, schedule]);
  // 기간 안 프리미엄 매장이면 저장 즉시 공개(서버 auto_approve_verified_poster 가 정본 — 여기는 안내만)
  const premiumVenue = !group && !isAdmin && !!venues.find((v) => v.id === (form.venueId || storeVenueId || user?.venueId))?.premium;
  // 오너 결정 A(10-02 2차·확정): 프리미엄 즉시 공개는 새 등록과 '공개 중인 포스터의 수정' 에만 — 반려·승인 대기 포스터는
  //   프리미엄이라도 저장하면 다시 승인 요청(관리자 대기열)이고 공개는 관리자 승인 후다(서버 prevent_self_approve_poster 가 정본).
  const pendingPremium = premiumVenue && isEdit && !schedule?.approved;
  const rejectedPremium = pendingPremium && !!schedule?.rejectedAt;
  const prizeListed = form.rankingPrizes.some((r) => r.amount > 0) || form.prizes.length > 0;
  // KW-1b — 이용권 1장 = 1T = 1만원(오너 결정). N장 × 1만원이 참가비와 다르면 경고만(저장은 허용).
  const voucherMismatch = voucherPerEntryMismatch(form.voucherPerEntry, form.buyIn, TICKET_WON);
  const moreCount = [form.rebuyPrice > 0, form.rebuyLimit > 0, form.addonEntry > 0, form.voucherPerEntry > 0,
    form.rebuyStacks.length > 0, form.earlyTiers !== undefined, form.sideEvents.length > 0,
    form.rules.some((r) => r.trim()), form.description.trim() !== ''].filter(Boolean).length;

  useEffect(() => {
    if (schedule) {
      const loaded = { ...posterFormFromSchedule(schedule, schedule.date), id: schedule.id };
      setInitial(loaded);
      setForm(loaded);
      setImgFile(null);
      setImgPreview(schedule.posterUrl ?? '');
      // 기존 레지마감 문자열에서 레벨/시간 분리
      const rc = schedule.regCloseTime ?? '';
      const lv = regCloseLevelFromText(rc);
      const tm = rc.match(/(\d{1,2}:\d{2})/);
      setRegLevel(lv ? String(lv) : '');
      setRegTime(tm ? tm[1] : '');
    } else if (open) {
      setInitial(null);
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
    // 전 필드 그대로(할인액·LV·새 칸 포함), 날짜만 오늘. 포스터 이미지도 그대로 재사용.
    setForm(posterFormFromSchedule(s, new Date().toLocaleDateString('en-CA')));
    setImgFile(null);
    setImgPreview(s.posterUrl ?? '');
    const rc = s.regCloseTime ?? '';
    const lv = regCloseLevelFromText(rc);
    const tm = rc.match(/(\d{1,2}:\d{2})/);
    setRegLevel(lv ? String(lv) : '');
    setRegTime(tm ? tm[1] : '');
    toast.show('지난 포스터를 불러왔습니다. 날짜만 확인하고 등록하세요', 'success');
  };

  // ── PL2c: 게임 프리셋 → 포스터 폼(공용 PresetPicker + applyToPoster 어댑터) ──────
  // 채워진 항목만 덮는다 — 부분 프리셋(클락만 있는 프리셋)은 포스터 폼을 건드리지 않는다.
  const presetVenueId = isAdmin ? (form.venueId || '') : (form.venueId || storeVenueId || user?.venueId || '');
  const applyGamePreset = (p: GamePreset) => {
    const patch = applyToPoster(p.data);
    if (Object.keys(patch).length === 0) { toast.show(`'${p.name}'. 포스터에 적용할 항목이 없는 프리셋입니다`, 'info'); return; }
    setForm((f) => ({ ...f, ...patch }));
    if (patch.posterUrl) { setImgFile(null); setImgPreview(patch.posterUrl); }
    if (patch.regCloseTime !== undefined) {
      const rc = patch.regCloseTime ?? '';
      const lv = regCloseLevelFromText(rc);
      const tm = rc.match(/(\d{1,2}:\d{2})/);
      setRegLevel(lv ? String(lv) : '');
      setRegTime(tm ? tm[1] : '');
    }
    toast.show(`'${p.name}' 프리셋 적용 · 채워진 항목만 반영했어요(수정 가능)`, 'success');
  };
  // PL3: 등록 직후 프리셋 저장(부산물 authoring) — 체크 시 제출과 함께 게임 프리셋으로도 저장
  const [alsoPreset, setAlsoPreset] = useState(false);
  useEffect(() => { if (open) { setAlsoPreset(false); setMoreOpen(false); repeatDoneRef.current = { saved: [], failed: [] }; } }, [open]);

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
  // 오류 필드로 화면을 데려간다 — 긴 폼에서 토스트만 뜨면 업주가 문제 칸을 스크롤로 찾아야 했다
  const failAt = (id: string, msg: string) => {
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); (el as HTMLElement).focus?.({ preventScroll: true }); }
    toast.show(msg, 'error');
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    try { await submitOnce(); } finally { busyRef.current = false; }
  };
  const submitOnce = async () => {
    if (!form.title.trim())     return failAt(titleId, '게임 이름을 입력해 주세요');
    // 🔴 요구 C — native maxLength 를 우회한 programmatic 변경(자동완성·확장·테스트)을 여기서 막는다.
    //   단 **제목을 실제로 바꿨을 때만**이다. legacy 장문 포스터의 날짜만 고치는 저장은 통과해야 한다
    //   (App 이 그 경우 `patch.title` 을 안 싣는다 — 같은 규칙의 폼쪽 반쪽).
    if (form.title.trim() !== (schedule?.title ?? '').trim() && form.title.trim().length > SCHEDULE_TITLE_MAX) {
      return failAt(titleId, `게임 이름은 공백 포함 ${SCHEDULE_TITLE_MAX}자까지 입력할 수 있습니다`);
    }
    if (!form.region.trim())    return failAt(regionId, '지역을 선택해 주세요');
    if (form.buyIn <= 0)        return failAt(buyInId, '참가비 금액을 입력해 주세요');
    // KW-1b — 서버도 100 으로 자르지만(20260930g) 조용히 바뀌지 않게 여기서 먼저 알린다.
    if (form.voucherPerEntry > MAX_VOUCHER_PER_ENTRY) { setMoreOpen(true); return failAt(voucherPerEntryId, `참가 1회 이용권은 ${MAX_VOUCHER_PER_ENTRY}장까지 적을 수 있습니다`); }
    if (form.prizeType === 'GTD'   && form.prizeAmount <= 0)  return failAt(prizeAmountId, '보장 상금 금액을 입력해 주세요');
    // 비율 없이 순위별 시상(대회초대권·이용권)만 거는 엔트리 게임이 있다(키키) — 시상표가 있으면 비율을 비워도 된다.
    if (form.prizeType === 'ENTRY' && form.prizePercent <= 0 && !prizeListed) return failAt(prizePercentId, '상금 비율(%) 또는 순위별 상금을 입력해 주세요');
    const regClose = [regLevel.trim() ? `${regLevel.trim()}LV` : '', regTime.trim()].filter(Boolean).join(' ');
    if (!regClose)              return failAt(regLevelId, '레지마감은 레벨 또는 시간 중 하나 이상 입력해 주세요');
    // 과거 날짜 가드 — 신규 등록이 어제로 잡히면 첫 화면에서 '종료'로 시작한다(오타 사고 방지)
    if (form.date && form.date < new Date().toLocaleDateString('en-CA')
        && !window.confirm(`날짜가 과거(${form.date})입니다. 등록하면 바로 '종료' 처리됩니다. 그래도 등록할까요?`)) {
      return failAt(dateId, '날짜를 확인해 주세요');
    }

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
        posterUrl = await uploadPoster(user.id, imgFile, group?.id);
      } catch {
        toast.show('이미지 업로드에 실패했습니다. 다시 시도해 주세요.', 'error');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    // 🔴 2026-09-20 — **결과를 기다린다.** 종전에는 `onSubmit(...)` 을 부르고 곧바로
    //   성공 토스트 + `onClose()` 였다. 그래서 저장이 실패하면 업주는
    //   ① '포스터가 등록되었습니다'(성공) → ② '포스터 등록에 실패했습니다'(실패) 를 연달아 보고,
    //   그때 폼은 이미 닫혀 **입력이 통째로 사라진 뒤**였다. 3주 중 1주만 실패한 경우도 똑같이 '성공' 이었다.
    //   App 쪽은 이미 `Promise.allSettled` 로 부분 성공까지 정확히 판정하고 있었다 —
    //   그 결과가 폼까지 오지 않은 것이 결함이었다.
    setSaving(true);
    let res: PosterSubmitResult | void;
    try {
      const done = repeatDoneRef.current;
      res = await onSubmit({ ...form, regCloseTime: regClose, posterUrl, saveParts: posterSaveParts(schedule ?? null, isEdit ? initial : null, form),
        ...(!isEdit && { repeatSaved: done.saved, repeatRetry: done.failed }),
        ...(group && { groupId: group.id, groupName: group.name, feedRequest: feedReq }) });
    } catch {
      // onSubmit 이 던지는 경우까지 막는다 — 던져도 폼은 열린 채 남아야 한다.
      res = { ok: false, saved: 0, total: 1 };
    }
    setSaving(false);
    if (res?.savedDates || res?.failedDates) {
      const prev = repeatDoneRef.current;
      repeatDoneRef.current = { saved: [...new Set([...prev.saved, ...(res.savedDates ?? [])])], failed: res.failedDates ?? [] };
    }
    // 결과를 안 주는 호출부(구 계약)는 종전대로 낙관 처리한다.
    const ok = res == null || res.ok;
    if (!ok) return; // ⚠ 실패·부분 성공은 **닫지 않는다.** 구체적인 실패 문구는 App 이 이미 띄웠다.

    toast.show(group
      ? (feedReq ? '그룹에 올렸습니다 · 전체 일정 공개는 관리자 승인 후입니다' : '그룹에 올렸습니다 (그룹 전용)')
      : pendingPremium ? '포스터가 수정되었습니다 · 다시 승인 요청했습니다. 관리자 승인 후 공개됩니다'
      : premiumVenue ? (isEdit ? '포스터가 수정되었습니다 · 프리미엄 매장이라 바로 공개됩니다' : '포스터가 등록되었습니다 · 프리미엄 매장이라 바로 공개됩니다')
      : isEdit ? '포스터가 수정되었습니다' : '포스터가 등록되었습니다', 'success');
    // PL3: '이 설정을 프리셋으로도 저장' — 등록의 부산물로 프리셋이 쌓인다(프리셋 실패는 포스터와 무관).
    //   ⚠ 포스터가 **실제로 저장된 뒤**에만 만든다. 종전에는 저장 실패에도 프리셋이 남았다.
    if (alsoPreset && presetVenueId && form.title.trim()) {
      saveGamePreset(presetVenueId, form.title.trim(), presetFromPosterForm({ ...form, regCloseTime: regClose, posterUrl }))
        .then(() => toast.show('게임 프리셋으로도 저장했어요. 장부·클락에서 그대로 불러올 수 있어요', 'success'))
        .catch((err) => toast.show(msgOf(err, '프리셋 저장 실패'), 'error'));
    }
    onClose();
  };

  // 서버(prevent_self_approve_poster)와 같은 여섯 칸을 App 의 patch 규칙(prizePool = GTD ? 만원×10,000 : 0)으로 비교한다.
  //   ⚠ 서버는 buy_in 을 **통째로** 비교한다 — 리엔트리·스택·얼리처럼 참가비 외 칸을 바꿔도 재심사다. 실제로 실릴 buy_in 으로 판정한다.
  //   오너 결정 B(10-02 2차): 포스터 이미지(poster_url) 교체도 재심사 — 새 파일을 골랐거나 이미지를 지웠을 때.
  const imageChanged = isEdit && (imgFile !== null || (form.posterUrl ?? null) !== (schedule?.posterUrl ?? null));
  const coreChanged = !!schedule && (posterCoreChanged(form, schedule)
    || (() => { const bi = posterSaveParts(schedule, initial, form).buyIn; return !!bi && !sameJson(bi, schedule.buyIn); })());
  const reReview = isEdit && !isAdmin && !premiumVenue && !!schedule?.approved && (coreChanged || imageChanged);

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '포스터 수정' : '새 포스터 등록'} maxWidth="md" variant="sheet" dismissOnBackdrop={false}>
      <form onSubmit={submit} className="p-4 space-y-3">

        {/* ── 지난 포스터 불러오기(신규 전용) — 전 필드 자동 채움, 날짜만 새로 ── */}
        {!isEdit && loadCandidates.length > 0 && (
          <div className="rounded-card border border-accent-400/30 bg-accent-300/6 p-3">
            <label htmlFor={pastPosterId} className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-accent-300"><Icon name="clipboard" size={15} className="shrink-0" />지난 포스터 불러오기</label>
            <select
              id={pastPosterId}
              value=""
              onChange={(e) => {
                const found = loadCandidates.find((s) => s.id === e.target.value);
                if (found) applyPast(found);
              }}
              className="input w-full text-sm text-ink-muted"
            >
              <option value="" disabled>항목 자동 기입</option>
              {loadCandidates.map((s) => (
                <option key={s.id} value={s.id} className="text-ink-primary">{s.date.slice(5)} · {s.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── PL2c: 게임 프리셋 불러오기(신규 전용) — 포스터/장부/클락 공용 PresetPicker ── */}
        {!isEdit && presetVenueId && !group && (
          <PresetPicker venueId={presetVenueId} scope="poster" onApply={applyGamePreset} />
        )}

        {/* ── 포스터 이미지 업로드 ── */}
        <div>
          <span className="block text-xs font-medium text-ink-secondary mb-1">포스터 이미지</span>
          <div
            onClick={() => fileRef.current?.click()}
            className={[
              'relative w-full aspect-3/4 max-h-48 rounded-card overflow-hidden cursor-pointer',
              'border-2 border-dashed border-border-default hover:border-accent-400 transition-colors',
              'flex flex-col items-center justify-center gap-2 bg-surface-high',
            ].join(' ')}
          >
            {imgPreview ? (
              <img src={imgPreview} alt="포스터 미리보기" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <>
                {/* 🔴 2026-09-18: `stroke="#5A6175"` 가 박혀 있었다 — 바로 아래 안내 글자는 `text-ink-muted`
                    인데 아이콘만 임의의 회색이라, 라이트 테마에서 둘의 밝기가 어긋났다.
                    같은 뜻의 두 요소는 같은 토큰을 써야 한다. */}
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="text-ink-muted">
                  <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <p className="text-xs text-ink-muted">클릭하여 포스터 이미지 선택</p>
                <p className="text-2xs text-ink-muted">JPG, PNG, WEBP · 최대 10MB</p>
              </>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-surface-base/70 flex items-center justify-center">
                <span className="w-6 h-6 rounded-full border-2 border-accent-300 border-t-transparent animate-spin"/>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="hidden" onChange={handleImageChange} />
          {imgPreview && (
            <button type="button" onClick={() => { setImgFile(null); setImgPreview(''); update('posterUrl', null); }}
              className="mt-1 text-2xs text-ink-muted hover:text-danger transition-colors">
              이미지 제거
            </button>
          )}
        </div>

        {/* 관리자: 홀덤펍 선택(기존) 또는 직접 입력 */}
        {isAdmin && !group && (
          <FieldWrap label="홀덤펍 (매장)" required htmlFor={venueSelectId}>
            <div className="space-y-1.5">
              <select
                id={venueSelectId}
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
                <input id={pubNameId} aria-label="홀덤펍 이름 직접 입력" type="text" value={form.pubName ?? ''}
                  onChange={(e) => update('pubName', e.target.value)}
                  placeholder="홀덤펍 이름 직접 입력" className="input w-full text-sm" />
              )}
            </div>
          </FieldWrap>
        )}

        {/* 게임 이름 — 🔴 2026-09-22 요구 C: 공백 포함 12자 상한(`SCHEDULE_TITLE_MAX`).
            · 상한 정본은 `src/api/schedules.ts` 하나다. 여기서 숫자를 다시 적지 않는다.
            · native `maxLength` 가 키보드·붙여넣기를 같은 기준(UTF-16 길이)으로 막는다 —
              IME 조합 중 강제 slice 를 하지 않는다(조합이 깨진다). 최종 방어는 submit 검증과 API 다.
            · legacy(12자 초과로 이미 저장된) 제목은 **원문 그대로 보여 준다.** maxLength 는 새 입력만 막고
              기존 value 를 자르지 않는다. 제목을 안 건드리면 App 이 `patch.title` 을 아예 안 실어
              날짜·시각 같은 다른 수정은 그대로 저장된다. */}
        <FieldWrap label="게임 이름" required htmlFor={titleId}
          suffix={`${form.title.length}/${SCHEDULE_TITLE_MAX}`}>
          <input id={titleId} type="text" required value={form.title}
            maxLength={SCHEDULE_TITLE_MAX}
            onChange={(e) => update('title', e.target.value)}
            placeholder="예: 목요 딥스택" className="input" />
          <p className="mt-1 text-2xs text-ink-muted">
            {isEdit && (schedule?.title ?? '').trim().length > SCHEDULE_TITLE_MAX
              ? `기존 제목 · 변경 시 ${SCHEDULE_TITLE_MAX}자 이하로 고쳐 주세요`
              : `제목은 최대 ${SCHEDULE_TITLE_MAX}자이며 목록에는 한 줄로 표시됩니다`}
          </p>
        </FieldWrap>

        {/* 날짜 + 스타트시간 */}
        <div className="grid grid-cols-2 gap-2">
          <FieldWrap label="날짜" required htmlFor={dateId}>
            <input id={dateId} type="date" required value={form.date}
              onChange={(e) => update('date', e.target.value)} className="input" />
          </FieldWrap>
          <FieldWrap label="스타트 시간" required>
            <TimeSelect value={form.startTime} onChange={(v) => update('startTime', v)} />
          </FieldWrap>
        </div>

        {/* 반복 등록 (생성 시에만) — 매주 같은 요일/시간으로 N주 자동 생성 */}
        {!isEdit && (
          <FieldWrap label="반복 등록 (매주 같은 요일)" htmlFor={repeatWeeksId}>
            <select
              id={repeatWeeksId}
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
            className="w-full flex items-center justify-between px-3 py-2 rounded-input border border-border-default bg-surface-high text-sm font-semibold text-ink-secondary hover:text-accent-300 transition-colors">
            <span>{(form.blindLevels?.length ?? 0) > 0 ? `맞춤 ${form.blindLevels!.filter((l) => !l.isBreak).length}레벨 저장됨` : '블라인드 표 편집 열기 (비우면 기본 표)'}</span>
            <span className="text-2xs text-accent-300">{blindOpen ? '▲' : '▼'}</span>
          </button>
          <Fold open={blindOpen}>
            <div className="mt-2 space-y-2 rounded-input border border-border-subtle bg-surface-base p-2.5">
              <div className="flex items-center gap-2">
                <button type="button" onClick={fillBlinds} className="btn-ghost text-2xs px-2 text-accent-300">자동 생성(레지 {regLevel || '16'}LV·20분·25레벨)</button>
                {(form.blindLevels?.length ?? 0) > 0 && <button type="button" onClick={() => setBlinds(() => [])} className="btn-ghost text-2xs px-2 hover:text-danger-light">전체 비우기</button>}
              </div>
              {(form.blindLevels?.length ?? 0) === 0 ? (
                <p className="text-2xs text-ink-muted text-center py-3">비워두면 기본(파이널롤백) 표가 표시됩니다.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {(form.blindLevels ?? []).map((l, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="w-5 shrink-0 text-center text-2xs text-ink-muted">{l.isBreak ? '–' : (form.blindLevels!.slice(0, i + 1).filter((x) => !x.isBreak).length)}</span>
                      {l.isBreak ? (
                        <input value={l.label ?? ''} onChange={(e) => setBlindRow(i, { label: e.target.value })} maxLength={60}
                          aria-label={`브레이크 ${i + 1} 이름`} placeholder="BREAK (예: DINNER BREAK · 칩 레이스)"
                          className="input min-w-0 flex-1 px-1.5 py-1 text-2xs font-bold text-accent-300" />
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
          </Fold>
        </FieldWrap>

        <FieldWrap label="레지마감 (레벨 또는 시간 중 하나 이상)" required>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={regLevelId} className="block text-2xs text-ink-muted mb-1">레벨</label>
              <div className="relative">
                <input id={regLevelId} type="number" inputMode="numeric" min={1} value={regLevel}
                  onChange={(e) => setRegLevel(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="예: 16" className="input w-full text-sm pr-9" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted pointer-events-none">LV</span>
              </div>
            </div>
            <div>
              <label htmlFor={regTimeId} className="block text-2xs text-ink-muted mb-1">시간</label>
              <input id={regTimeId} type="time" value={regTime} onChange={(e) => setRegTime(e.target.value)} className="input w-full text-sm" />
            </div>
          </div>
          {(regLevel || regTime) && (
            <p className="mt-1 text-2xs font-semibold text-accent-300">
              레지마감: {[regLevel ? `${regLevel}LV` : '', regTime].filter(Boolean).join(' ')}
            </p>
          )}
        </FieldWrap>

        {/* 듀레이션 — 총 진행 시간/레벨 등 (포스터 정보) */}
        <FieldWrap label="듀레이션" htmlFor={durationId}>
          <input id={durationId} type="text" value={form.duration}
            onChange={(e) => update('duration', e.target.value)}
            placeholder="예: 25/15분 또는 약 5시간" className="input" />
        </FieldWrap>

        {/* 블라인드 구조 — 선택(입력 안 해도 됨) */}
        <FieldWrap label="블라인드 (선택)" htmlFor={blindsId}>
          <input id={blindsId} type="text" value={form.blinds}
            onChange={(e) => update('blinds', e.target.value)}
            placeholder="예: 100/200 (25분 레벨) · 비워둬도 됩니다" className="input" />
        </FieldWrap>

        {/* 상금 형태 */}
        <FieldWrap label="상금 형태" required>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="상금 형태">
            <RadioCard checked={form.prizeType === 'GTD'} onClick={() => update('prizeType', 'GTD')} title="GTD" desc="보장 상금" />
            <RadioCard checked={form.prizeType === 'ENTRY'} onClick={() => update('prizeType', 'ENTRY')} title="엔트리" desc="참가비 누적" />
          </div>
        </FieldWrap>

        {/* 대회 등급(선택) — waholdem 탐색 축: 손님이 '데일리만/새틀만' 골라 보게 된다 */}
        <FieldWrap label="대회 등급 (선택)">
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="대회 등급">
            {([[null, '일반'], ['daily', '데일리'], ['satellite', '새틀라이트'], ['series', '시리즈']] as const).map(([v, l]) => (
              <button key={l} type="button" role="radio" aria-checked={form.grade === v} onClick={() => update('grade', v)}
                className={['h-9 rounded-input border text-xs font-bold transition-colors',
                  form.grade === v ? 'chip-on' : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
                {l}
              </button>
            ))}
          </div>
        </FieldWrap>

        {/* (대회 분류는 관리자 설정 > 게시물 관리 > 포스터에서 지정) */}

        {/* 상금 + 바이인 */}
        <div className="grid grid-cols-2 gap-2">
          {form.prizeType === 'GTD' ? (
            <FieldWrap label="보장 상금" suffix="만원" required htmlFor={prizeAmountId}>
              <input id={prizeAmountId} type="number" inputMode="numeric" required min={0} value={form.prizeAmount || ''}
                onChange={(e) => update('prizeAmount', Number(e.target.value))} placeholder="1100" className="input" />
            </FieldWrap>
          ) : (
            <FieldWrap label="상금" suffix="%" required={!prizeListed} htmlFor={prizePercentId}>
              <input id={prizePercentId} type="number" inputMode="numeric" required={!prizeListed} min={0} max={100} value={form.prizePercent || ''}
                onChange={(e) => update('prizePercent', Number(e.target.value))} placeholder="예: 90" className="input" />
            </FieldWrap>
          )}
          <FieldWrap label="참가비" suffix="원" required htmlFor={buyInId}>
            <input id={buyInId} type="number" inputMode="numeric" required min={0} value={form.buyIn || ''}
              onChange={(e) => update('buyIn', Number(e.target.value))} placeholder="100000" className="input" />
            {/* 실시간 환산 — 옆 칸(만원)과 단위가 달라 0 하나 오차가 잦다 */}
            {form.buyIn > 0 && (
              <p className={['mt-1 text-2xs tabular-nums', form.buyIn < 1000 ? 'font-bold text-amber-400' : 'text-ink-muted'].join(' ')}>
                = {form.buyIn >= 10000 ? `${(form.buyIn / 10000).toLocaleString()}만원` : `${form.buyIn.toLocaleString()}원`}
                {form.buyIn < 1000 && '만원 단위로 적으셨나요? 이 칸은 원 단위입니다'}
              </p>
            )}
          </FieldWrap>
        </div>
        {form.prizeType === 'GTD' && form.prizeAmount > 0 && (
          <p className={['-mt-1 text-2xs tabular-nums', form.prizeAmount >= 100000 ? 'font-bold text-amber-400' : 'text-ink-muted'].join(' ')}>
            보장 상금 = {form.prizeAmount >= 10000 ? `${(form.prizeAmount / 10000).toLocaleString()}억원` : `${form.prizeAmount.toLocaleString()}만원`}
            {form.prizeAmount >= 100000 && '원 단위로 적으셨나요? 이 칸은 만원 단위입니다'}
          </p>
        )}

        {/* 게임 종류(자유 입력) — 포스터 상금 옆 뱃지로 표시. 애드온 게임이면 스택·비용 입력 */}
        <FieldWrap label="게임 종류" htmlFor={gameTypeId}>
          <input id={gameTypeId} type="text" value={form.gameType} maxLength={20}
            onChange={(e) => update('gameType', e.target.value)}
            placeholder="예: 프리즈아웃, 바운티, 애드온, 딥스택…" className="input" />
        </FieldWrap>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrap label="애드온 스택" suffix="칩" htmlFor={addonStackId}>
            <input id={addonStackId} type="number" inputMode="numeric" min={0} value={form.addonStack || ''}
              onChange={(e) => update('addonStack', Number(e.target.value))} placeholder="예: 20000" className="input" />
          </FieldWrap>
          <FieldWrap label="애드온 비용" suffix="원" htmlFor={addonCostId}>
            <input id={addonCostId} type="number" inputMode="numeric" min={0} value={form.addonCost || ''}
              onChange={(e) => update('addonCost', Number(e.target.value))} placeholder="예: 50000" className="input" />
          </FieldWrap>
          <FieldWrap label="스타팅 스택" suffix="칩" htmlFor={startStackId}>
            <input id={startStackId} type="number" inputMode="numeric" min={0} value={form.startStack || ''}
              onChange={(e) => update('startStack', Number(e.target.value))} placeholder="예: 50000" className="input" />
          </FieldWrap>
          <FieldWrap label="리바인 스택" suffix="칩" htmlFor={rebuyStackId}>
            <input id={rebuyStackId} type="number" inputMode="numeric" min={0} value={form.rebuyStack || ''}
              onChange={(e) => update('rebuyStack', Number(e.target.value))} placeholder="예: 70000" className="input" />
          </FieldWrap>
        </div>

        {/* 세부 규칙(선택) — W-16: 포스터 5장이 폼만으로 입력되게. 대부분의 게임은 안 쓰므로 접어 둔다. */}
        <FieldWrap label="세부 규칙 (선택)">
          <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-input border border-border-default bg-surface-high text-sm font-semibold text-ink-secondary hover:text-accent-300 transition-colors">
            <span className="min-w-0 truncate">{moreCount > 0 ? `세부 규칙 ${moreCount}개 입력됨` : '리엔트리 가격·한도 · 얼리칩 · 이용권 · 규정 · 설명'}</span>
            <span className="shrink-0 text-2xs text-accent-300">{moreOpen ? '▲' : '▼'}</span>
          </button>
          <Fold open={moreOpen}>
            <div className="mt-2 space-y-3 rounded-input border border-border-subtle bg-surface-base p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <FieldWrap label="리엔트리 참가비" suffix="원" htmlFor={rebuyPriceId}>
                  <input id={rebuyPriceId} type="number" inputMode="numeric" min={0} value={form.rebuyPrice || ''}
                    onChange={(e) => update('rebuyPrice', Number(e.target.value))} placeholder="참가비와 같으면 비움" className="input" />
                </FieldWrap>
                <FieldWrap label="리엔트리 최대" suffix="회" htmlFor={rebuyLimitId}>
                  <input id={rebuyLimitId} type="number" inputMode="numeric" min={0} value={form.rebuyLimit || ''}
                    onChange={(e) => update('rebuyLimit', parseInt(e.target.value, 10) || 0)} placeholder="제한 없으면 비움" className="input" />
                </FieldWrap>
                <FieldWrap label="애드온 1회 엔트리" htmlFor={addonEntryId}>
                  <input id={addonEntryId} type="number" inputMode="decimal" step="0.1" min={0} value={form.addonEntry || ''}
                    onChange={(e) => update('addonEntry', Math.max(0, parseFloat(e.target.value) || 0))} placeholder="예: 0.5" className="input" />
                </FieldWrap>
                <FieldWrap label="참가 1회 = 이용권" suffix="장" htmlFor={voucherPerEntryId}>
                  <input id={voucherPerEntryId} type="number" inputMode="numeric" min={0} max={MAX_VOUCHER_PER_ENTRY} step={1} value={form.voucherPerEntry || ''}
                    onChange={(e) => update('voucherPerEntry', Math.max(0, parseInt(e.target.value, 10) || 0))} placeholder="예: 10" className="input"
                    aria-describedby={voucherMismatch ? `${voucherPerEntryId}-warn` : undefined} />
                  {voucherMismatch && (
                    // 저장은 막지 않는다(오너 결정 대기) — 장부는 참가비 기준 T 로 기록된다는 사실만 알린다.
                    <p id={`${voucherPerEntryId}-warn`} data-testid="voucher-per-entry-warn" className="mt-1 text-2xs font-bold text-amber-400">
                      {form.voucherPerEntry}장 = {(form.voucherPerEntry * TICKET_WON).toLocaleString()}원 환산인데 참가비는 {form.buyIn.toLocaleString()}원입니다. 장부에는 참가비 기준으로 기록됩니다
                    </p>
                  )}
                </FieldWrap>
              </div>
              <FieldWrap label="회차별 리엔트리 스택 (마지막 값 반복)" suffix="칩" htmlFor={rebuyStacksId}>
                <NumListInput id={rebuyStacksId} value={form.rebuyStacks} onChange={(v) => update('rebuyStacks', v)}
                  placeholder="예: 70000, 70000, 80000" />
              </FieldWrap>
              <FieldWrap label={`얼리칩 (최대 ${MAX_EARLY_TIERS}단)`} htmlFor={earlyModeId}>
                <select id={earlyModeId} className="input w-full text-sm"
                  value={form.earlyTiers === undefined ? 'unset' : form.earlyTiers.length === 0 ? 'none' : 'tiers'}
                  onChange={(e) => update('earlyTiers', e.target.value === 'unset' ? undefined : e.target.value === 'none' ? [] : [{ level: 1, chips: 0 }])}>
                  <option value="unset">포스터에 없음 (클락 설정 그대로)</option>
                  <option value="none">얼리칩 없음</option>
                  <option value="tiers">단계 입력</option>
                </select>
                {(form.earlyTiers?.length ?? 0) > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {form.earlyTiers!.map((t, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-2xs text-ink-muted">
                        <input type="number" inputMode="numeric" min={1} value={t.level || ''} aria-label={`얼리 ${i + 1}단 마지막 레벨`}
                          onChange={(e) => update('earlyTiers', form.earlyTiers!.map((x, k) => (k === i ? { ...x, level: parseInt(e.target.value, 10) || 0 } : x)))}
                          className="input w-16 shrink-0 text-sm tabular-nums" />
                        <span className="shrink-0">LV까지 +</span>
                        <input type="number" inputMode="numeric" min={0} value={t.chips || ''} aria-label={`얼리 ${i + 1}단 추가 칩`} placeholder="칩"
                          onChange={(e) => update('earlyTiers', form.earlyTiers!.map((x, k) => (k === i ? { ...x, chips: parseInt(e.target.value, 10) || 0 } : x)))}
                          className="input min-w-0 flex-1 text-sm tabular-nums" />
                        <button type="button" aria-label={`얼리 ${i + 1}단 삭제`} onClick={() => update('earlyTiers', form.earlyTiers!.filter((_, k) => k !== i))}
                          className="shrink-0 px-1 text-xs text-ink-muted hover:text-danger-light">✕</button>
                      </li>
                    ))}
                    {form.earlyTiers!.length < MAX_EARLY_TIERS && (
                      <li><button type="button" className="btn-ghost w-full py-1 text-2xs"
                        onClick={() => update('earlyTiers', [...form.earlyTiers!, { level: (form.earlyTiers!.at(-1)?.level ?? 0) + 1, chips: 0 }])}>+ 단계 추가</button></li>
                    )}
                  </ul>
                )}
                <p className="mt-1 text-2xs text-ink-muted">'N LV까지' = N레벨이 끝나고 뒤 브레이크까지 입장한 손님 (포스터의 'N+1LV 시작 전')</p>
              </FieldWrap>
              <FieldWrap label={`사이드 이벤트 (${form.sideEvents.length}/${MAX_SIDE_EVENTS})`}>
                <div className="space-y-1">
                  {form.sideEvents.map((ev, i) => {
                    const setEv = (patch: Partial<typeof ev>) => update('sideEvents', form.sideEvents.map((x, k) => (k === i ? { ...x, ...patch } : x)));
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <input value={ev.name} onChange={(e) => setEv({ name: e.target.value })} maxLength={20} aria-label={`사이드 이벤트 ${i + 1} 이름`} placeholder="이름 (예: 핀볼)" className="input min-w-0 flex-1 text-sm" />
                        <input value={ev.startBefore} onChange={(e) => setEv({ startBefore: e.target.value })} maxLength={20} aria-label={`사이드 이벤트 ${i + 1} 시작`} placeholder="예: 17LV 시작 전" className="input min-w-0 flex-1 text-sm" />
                        <input value={ev.note ?? ''} onChange={(e) => setEv({ note: e.target.value })} maxLength={30} aria-label={`사이드 이벤트 ${i + 1} 메모`} placeholder="메모" className="input min-w-0 flex-1 text-sm" />
                        <button type="button" aria-label={`사이드 이벤트 ${i + 1} 삭제`} onClick={() => update('sideEvents', form.sideEvents.filter((_, k) => k !== i))}
                          className="shrink-0 px-1 text-xs text-ink-muted hover:text-danger-light">✕</button>
                      </div>
                    );
                  })}
                  {form.sideEvents.length < MAX_SIDE_EVENTS && (
                    <button type="button" className="btn-ghost w-full py-1 text-2xs"
                      onClick={() => update('sideEvents', [...form.sideEvents, { name: '', startBefore: '' }])}>+ 사이드 이벤트</button>
                  )}
                </div>
              </FieldWrap>
              <FieldWrap label="운영 규정 (한 줄에 하나)" htmlFor={rulesId}>
                <textarea id={rulesId} rows={4} value={form.rules.join('\n')}
                  onChange={(e) => update('rules', e.target.value.split('\n'))}
                  placeholder={'예: 2블라인드 자리비울시 먹처리됩니다.\n예: TDA 를 기준으로 하우스 룰을 우선 적용'} className="input w-full text-sm leading-relaxed" />
              </FieldWrap>
              <FieldWrap label="상세 설명" htmlFor={descriptionId}>
                <textarea id={descriptionId} rows={3} maxLength={1000} value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="포스터 문구·문의처 등 손님에게 보여 줄 설명" className="input w-full text-sm leading-relaxed" />
              </FieldWrap>
            </div>
          </Fold>
        </FieldWrap>

        {/* 지역 — 일정탐색 지역에서 선택 (직접입력 없음) */}
        <FieldWrap label="지역" required htmlFor={regionId}>
          <select
            id={regionId}
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
                      checked ? 'chip-on'
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
        <FieldWrap label={`이벤트 · 프로모션 (${form.events.length}/${MAX_EVENTS}) · 할인유형을 고르면 배지·내용 자동`}>
          <PromotionEditor items={form.events} onChange={(v) => update('events', v)} buyIn={form.buyIn} />
        </FieldWrap>

        {/* 순위별 상금 — 1등부터 머니인 구간까지 (선택, 단위 직접 입력) */}
        <FieldWrap label={`순위별 상금 (${form.rankingPrizes.length}/${MAX_RANKS})`}>
          <RankingPrizeList prizes={form.rankingPrizes} onChange={(rp) => update('rankingPrizes', rp)} />
        </FieldWrap>

        {/* 시상 */}
        <FieldWrap label={`시상 (${form.prizes.length}/${MAX_PRIZES})`}>
          <PrizeList prizes={form.prizes} onChange={(prizes) => update('prizes', prizes)} />
        </FieldWrap>

        {/* PL3: 등록 직후 프리셋 저장 인라인 — 프리셋이 별도 작업이 아니라 등록의 부산물로 쌓이게 */}
        {!isEdit && presetVenueId && !group && (
          <label className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-low px-3 py-2 text-xs text-ink-secondary">
            <input type="checkbox" checked={alsoPreset} onChange={(e) => setAlsoPreset(e.target.checked)} className="h-4 w-4 accent-accent-300" />
            이 설정을 <b className="text-ink-primary">게임 프리셋으로도 저장</b>
          </label>
        )}

        {/* 20260925g N14 — 승인된 포스터의 핵심 항목(제목·참가비·상금·보장·날짜·시작 시각)이 바뀌면 서버 트리거가 approved=false 로 되돌린다.
            업주가 모르고 저장하면 손님 화면에서 포스터가 내려가 놀란다 → **실제로 바뀌었을 때만** 저장 전에 알린다(관리자는 재심사 대상이 아니다). */}
        {/* 20261002h — 그룹 포스터: 그룹 페이지에는 바로 보이고, 전체 일정 피드는 관리자 승인 후에만 오른다. */}
        {group && (
          <label data-testid="poster-feed-request" className="flex items-start gap-2 rounded-input border border-border-default bg-surface-low px-3 py-2.5 text-xs text-ink-secondary">
            <input type="checkbox" checked={feedReq} onChange={(e) => setFeedReq(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-accent-300" />
            <span>
              <b className="text-ink-primary">전체 일정에도 공개 요청</b>
              <span className="block text-2xs text-ink-muted mt-0.5">{group.name} 그룹 페이지에는 바로 올라갑니다. 체크하면 관리자 승인 뒤 일정탐색에도 보입니다.</span>
            </span>
          </label>
        )}
        {premiumVenue && !pendingPremium && (
          <p role="status" data-testid="poster-premium-notice"
            className="rounded-input border border-accent-400/30 bg-accent-300/10 px-3 py-2 text-2xs leading-relaxed text-accent-200">
            프리미엄 매장 — 저장하면 관리자 승인 없이 <b>바로 공개</b>됩니다.
          </p>
        )}
        {pendingPremium && (
          <p role="status" data-testid={rejectedPremium ? 'poster-rejected-premium-notice' : 'poster-pending-premium-notice'}
            className="rounded-input border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-2xs leading-relaxed text-amber-400">
            {rejectedPremium ? '관리자가 반려한 포스터입니다. ' : '승인 대기 중인 포스터입니다. '}
            프리미엄 매장이라도 <b>저장하면 다시 승인 요청</b>되고, 관리자 승인 후 공개됩니다.
          </p>
        )}
        {reReview && (
          <p role="status" data-testid="poster-rereview-notice"
            className="rounded-input border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-2xs leading-relaxed text-amber-400">
            {coreChanged && imageChanged ? '제목·참가비·상금·보장·날짜·시작 시각과 포스터 이미지를 바꿨습니다. '
              : imageChanged ? '포스터 이미지를 바꿨습니다. '
              : '제목·참가비·상금·보장·날짜·시작 시각 중 하나를 바꿨습니다. '}
            <b>저장하면 다시 승인받아야 공개됩니다</b> — 승인될 때까지 '승인대기' 로 표시됩니다.
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">취소</button>
          <button type="submit" disabled={uploading || saving} className="btn-primary flex-1 disabled:opacity-60">
            {uploading ? '업로드 중…' : saving ? '저장 중…' : isEdit ? '수정 완료' : '등록하기'}
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
            <li key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-input bg-accent-300/5 border border-accent-400/30">
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
            onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; /* 한글 조합 확정 Enter 를 제출로 오인하지 않게 */ if (e.key === 'Enter') { e.preventDefault(); add(); } }}
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
                placeholder={`${i + 1}위`} className="input w-24 text-sm shrink-0" />
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

// 이벤트·프로모션 — 배지(50%·5만 등) + 내용 + 참가비 할인액. 포스터 상세에 배지로 노출되고,
// 할인액을 적은 줄은 장부가 '포스터 할인 가져오기'로 그대로 할인 프리셋에 담는다(오너 지시 2026-09-06).
// 입력 문법은 장부 시작 설정의 할인 편집기와 같다(할인액=만원 0.1 단위 · LV=자동 적용 레벨).
function PromotionEditor({ items, onChange, buyIn }: {
  items: Promotion[];
  onChange: (v: Promotion[]) => void;
  /** 참가비(원) — 할인액이 참가비를 넘으면 장부가 저장을 막으므로 여기서 미리 알린다. 0=미입력 */
  buyIn: number;
}) {
  // 프리셋도 각자 유형을 갖는다. 손으로 쓴 배지·내용(예: '50%')은 자동값과 다르므로 아래 규칙이 보존한다.
  const PRESETS: Promotion[] = [
    { discountType: 'firstVisit', badge: '50%', title: '첫 방문 50% 할인' }, // 비율 할인은 금액이 고정되지 않아 할인액 없이 문구로만
    // 포스터의 '1LV 바인 5만' 은 **1레벨에 5만원 할인**이라는 뜻이다(오너 확인 2026-09-06) —
    //   할인액 칸의 의미와 같다. 문구에 '할인'을 붙이는 것은 뜻을 바꾸는 게 아니라,
    //   제목 줄만 따로 공유될 때 '참가비가 5만'으로 읽히지 않게 못 박는 것이다.
    { discountType: 'level',      badge: '5만', title: '1LV 바인 5만 할인', discountWon: 50_000, level: 1 },
    // W-18 — 포스터 문구 '첫바인은 무조건 7만' 은 **7만에 들어온다**는 뜻이다 = 10만 게임에서 3만 할인(0.7엔트리).
    //   예전 프리셋은 '7만 할인'을 넣어 3만 수납·0.3엔트리가 됐다. 할인액 칸은 '깎아 주는 금액'이다.
    { discountType: 'firstBuyin', badge: '3만', title: '첫 바인 3만 할인', discountWon: 30_000 },
    { discountType: 'advance',    badge: '얼리칩', title: '사전예약 얼리칩' },
    { discountType: 'custom',     badge: 'NEW', title: '신규 이벤트' },
    { discountType: 'custom',     badge: '할인', title: '할인 이벤트' },
  ];
  const setAt = (i: number, patch: Partial<Promotion>) =>
    onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  // 유형·할인액·레벨 중 무엇이 바뀌든 태그·내용을 다시 만든다(사람이 고친 값은 보존 — lib/promotionLabel).
  const retype = (i: number, patch: Partial<Promotion>) => setAt(i, retypePromotion(items[i], patch));
  const add = (p?: Promotion) => {
    if (items.length >= MAX_EVENTS) return;
    onChange([...items, p ?? { badge: '', title: '' }]);
  };
  return (
    <div className="space-y-1.5">
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((p, i) => {
            const won = p.discountWon ?? 0;
            const over = won > 0 && buyIn > 0 && won > buyIn;
            // 미리보기·실제 삽입이 같은 말을 하도록 한 함수에서 뽑는다(유형 라벨 vs 업주가 쓴 문구 우선순위 포함).
            const ledgerLabel = won > 0 ? ledgerLabelOf(p) : null;
            return (
              <li key={i} className="space-y-1 rounded-input border border-border-subtle bg-surface-low p-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-2xs text-ink-muted">할인유형</span>
                  {/* 유형을 고르면 아래 배지·내용이 저절로 채워진다(손으로 고친 값은 그대로 둔다) */}
                  <select value={p.discountType ?? 'custom'} aria-label={`프로모션 ${i + 1} 할인유형`}
                    onChange={(e) => retype(i, { discountType: e.target.value as DiscountType })}
                    className="input min-w-0 flex-1 text-sm">
                    {DISCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.name}</option>)}
                  </select>
                  <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))}
                    aria-label="삭제" className="text-ink-muted hover:text-danger text-2xs px-1 shrink-0">✕</button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input value={p.badge ?? ''} onChange={(e) => setAt(i, { badge: e.target.value })} maxLength={6}
                    placeholder="배지" className="input w-20 shrink-0 text-center text-sm font-bold text-accent-300" />
                  <input value={p.title} onChange={(e) => setAt(i, { title: e.target.value })} maxLength={40}
                    placeholder="내용 (예: 첫 방문 50% 할인)" className="input flex-1 min-w-0 text-sm" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-2xs text-ink-muted">참가비 할인</span>
                  <div className="relative w-20 shrink-0">
                    <input type="number" inputMode="decimal" step="0.1" min="0" aria-label={`프로모션 ${i + 1} 할인액(만원)`}
                      value={won ? wonToMan(won) : ''} onChange={(e) => retype(i, { discountWon: manToWon(Math.max(0, parseFloat(e.target.value) || 0)) })}
                      placeholder="없음" aria-invalid={over}
                      className={['input w-full pr-6 text-sm tabular-nums', over ? 'border-danger text-danger-light' : ''].join(' ')} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">만</span>
                  </div>
                  <div className="relative w-16 shrink-0">
                    <input type="number" inputMode="numeric" min="0" max="60" aria-label={`프로모션 ${i + 1} 자동 적용 레벨`}
                      value={p.level || ''} onChange={(e) => retype(i, { level: Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)) })}
                      placeholder="자동" className="input w-full pr-6 text-sm tabular-nums" />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-2xs font-bold text-ink-muted">LV</span>
                  </div>
                  <p className="min-w-0 flex-1 break-keep text-2xs leading-tight text-ink-muted">
                    {over
                      ? <b className="text-danger-light">참가비({wonToMan(buyIn)}만)보다 큽니다 — 참가비 이하로 적어 주세요.</b>
                      : won > 0
                        ? <>장부가 <b className="text-accent-300">−{wonToMan(won)}만 할인</b>으로 가져갑니다{ledgerLabel ? <> · 라벨 <b className="text-accent-300">{ledgerLabel}</b></> : null}{p.level ? <> · <b className="text-accent-300">{p.level}LV</b>까지 자동</> : null}</>
                        : '금액을 적으면 장부 할인으로 쓸 수 있어요'}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {items.length < MAX_EVENTS && (
        <button type="button" onClick={() => add()} className="btn-ghost text-xs w-full py-1.5">+ 프로모션 추가</button>
      )}
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button key={(p.badge ?? '') + p.title} type="button"
            disabled={items.length >= MAX_EVENTS || items.some((x) => x.title === p.title)}
            onClick={() => add(p)}
            className="rounded-badge border border-border-default bg-surface-high px-2 py-0.5 text-2xs text-ink-secondary hover:text-accent-300 disabled:opacity-40">
            + <b className="text-accent-300">{p.badge}</b> {p.title}
          </button>
        ))}
      </div>
    </div>
  );
}

// 쉼표로 구분한 숫자 목록 입력 — 입력 중인 글자(끝의 쉼표 등)는 따로 들고, 바깥 값이 바뀌었을 때만 다시 쓴다.
function NumListInput({ id, value, onChange, placeholder }: {
  id: string; value: number[]; onChange: (v: number[]) => void; placeholder: string;
}) {
  const parse = (t: string) => t.split(/[,\s/]+/).map((x) => parseInt(x.replace(/[^0-9]/g, ''), 10) || 0).filter((n) => n > 0);
  const [draft, setDraft] = useState(value.join(', '));
  const [seen, setSeen] = useState(value);
  if (seen !== value) { // 렌더 중 동기화(effect 없이) — 폼을 새로 불러왔을 때
    setSeen(value);
    if (parse(draft).join() !== value.join()) setDraft(value.join(', '));
  }
  return (
    <input id={id} type="text" inputMode="numeric" value={draft} placeholder={placeholder} className="input w-full text-sm tabular-nums"
      onChange={(e) => { setDraft(e.target.value); onChange(parse(e.target.value)); }} />
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
            onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; /* 한글 조합 확정 Enter 를 제출로 오인하지 않게 */ if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={placeholder} maxLength={20} className="input flex-1 text-sm" />
          <button type="button" onClick={add} disabled={!draft.trim()}
            className="btn-ghost text-xs px-3 shrink-0 disabled:opacity-40">추가</button>
        </div>
      )}
    </div>
  );
}

// 주의: label 로 감싸면 빈 영역 클릭이 내부 첫 컨트롤(예: 결제수단 첫 버튼)을 토글하므로 div 사용
// a11y: 단일 컨트롤을 감쌀 때 htmlFor 를 넘기면 라벨 텍스트가 <label> 로 렌더되어 연결됨
function FieldWrap({ label, required, suffix, htmlFor, children }: {
  label: string; required?: boolean; suffix?: string; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="block">
      <div className="flex items-baseline justify-between mb-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-xs font-medium text-ink-secondary">
            {label}{required && <span className="text-danger ml-0.5">*</span>}
          </label>
        ) : (
          <span className="text-xs font-medium text-ink-secondary">
            {label}{required && <span className="text-danger ml-0.5">*</span>}
          </span>
        )}
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
    <div className="flex items-center gap-1">
      <select value={hh} onChange={(e) => onChange(`${e.target.value}:${mm}`)} className="input min-w-0 flex-1 px-2 text-sm tabular-nums">
        {hours.map((x) => <option key={x} value={x}>{x}시</option>)}
      </select>
      <span className="text-ink-muted font-bold">:</span>
      <select value={mm} onChange={(e) => onChange(`${hh}:${e.target.value}`)} className="input min-w-0 flex-1 px-2 text-sm tabular-nums">
        {mins.map((x) => <option key={x} value={x}>{x}분</option>)}
      </select>
    </div>
  );
}

function RadioCard({ checked, onClick, title, desc }: {
  checked: boolean; onClick: () => void; title: string; desc: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onClick}
      className={['p-3 rounded-input border-2 text-left transition-colors',
        checked ? 'border-accent-300 bg-accent-300/10' : 'border-border-default bg-surface-high hover:border-border-strong'].join(' ')}>
      <p className={['text-sm font-bold leading-none', checked ? 'text-accent-300' : 'text-ink-primary'].join(' ')}>{title}</p>
      <p className="text-2xs text-ink-muted mt-1">{desc}</p>
    </button>
  );
}