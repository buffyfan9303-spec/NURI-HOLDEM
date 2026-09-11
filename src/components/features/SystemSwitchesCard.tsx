// src/components/features/SystemSwitchesCard.tsx
// 관리자 → 기능 스위치. **재배포 없이** 기능을 켜고 끄는 자리다.
//
// 왜 이 파일이 생겼나(2026-09-11 점검): app_settings 에 있는 운영 스위치 중
//   · boost_contact_*    → AdminTab BoostContactCard 로 관리됨
//   · community_ads_every → AdSlotsAdmin 로 관리됨
//   · clock_ad_image/size → 매장 클락 화면에서만 관리됨(전역 설정인데 매장 화면에 있었다)
//   · identity_voucher_enabled → **어디에서도 관리되지 않음**. src/lib/identityFlag.ts:19 는
//     "앱 → 관리자 탭 → app_settings 저장 경로" 라고 적어 뒀는데 그 화면이 존재하지 않았다.
//     본인인증과 매장이용권 **전체**를 여는 스위치를 SQL 로만 켤 수 있는 상태였다.
//
// 일부러 넣지 않은 것 — home_banner_fallback.
//   2026-09-10 에 하드코딩 포스터를 제거해 PosterCarousel 이 그 값을 더 이상 읽지 않는다.
//   토글을 만들면 **아무것도 바꾸지 않는 스위치**가 되고, 그게 바로 오너가 지적한 '이제 없는 것'이다.
import { useState, useEffect, useCallback } from 'react';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { uploadPoster } from '../../lib/storage';
import { getAppSetting, setAppSetting, CLOCK_AD_KEY, CLOCK_AD_SIZE_KEY } from '../../api/settings';
import { IDENTITY_FLAG_KEY, refreshIdentityFlag, useIdentityEnabled } from '../../lib/identityFlag';
import { publishClockSignal } from './clock/clockTheme';

type AdSize = 'sm' | 'md' | 'lg';
const AD_SIZES: { v: AdSize; label: string }[] = [
  { v: 'sm', label: '작게' }, { v: 'md', label: '보통' }, { v: 'lg', label: '크게' },
];
const isAdSize = (v: unknown): v is AdSize => v === 'sm' || v === 'md' || v === 'lg';

/** 저장값 → 사람이 읽는 상태. identityFlag 의 규약과 **같은 식**이어야 한다('on' 만 켜짐). */
const flagOn = (v: string | null | undefined) => v === 'on';

export default function SystemSwitchesCard() {
  return (
    <div className="space-y-3">
      <IdentityVoucherSwitch />
      <ClockAdCard />
    </div>
  );
}

// ── ① 본인인증 · 매장이용권 통합 스위치 ─────────────────────────────────────
function IdentityVoucherSwitch() {
  const toast = useToast();
  /** 앱 전체가 **지금 쓰는** 값(구독형). 저장 뒤 이 값이 따라오는지가 곧 '연동됐는가' 다. */
  const live = useIdentityEnabled();
  /** 서버에 실제로 저장된 값. undefined=아직 못 읽음 / null=행 없음(=꺼짐) */
  const [server, setServer] = useState<string | null | undefined>(undefined);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadErr(null);
    setServer(undefined);
    getAppSetting(IDENTITY_FLAG_KEY).then(setServer).catch(setLoadErr);
  }, []);
  useEffect(() => { load(); }, [load]);

  const apply = async (next: boolean) => {
    setBusy(true);
    try {
      await setAppSetting(IDENTITY_FLAG_KEY, next ? 'on' : 'off');
      // 저장했다고 믿지 않고 **되읽는다** — set_app_setting 은 admin 이 아니면 거절하는데,
      // 그 거절을 낙관적 UI 로 덮으면 '껐다 켰다' 가 화면에서만 일어난다.
      setServer(await getAppSetting(IDENTITY_FLAG_KEY));
      // 앱 전체(다른 탭·다른 컴포넌트)가 즉시 따라오게 한다 — useSyncExternalStore 구독자에게 통지된다.
      const nowOn = await refreshIdentityFlag();
      toast.show(nowOn ? '본인인증·매장이용권을 켰습니다' : '본인인증·매장이용권을 껐습니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '변경하지 못했습니다', 'error');
      load();   // 화면을 서버 값으로 되돌린다
    } finally {
      setBusy(false);
    }
  };

  const known = server !== undefined;
  const saved = flagOn(server);
  /** 서버 값과 이 앱이 쓰는 값이 어긋나 있는가 — 어긋나면 저장이 안 먹었거나 반영이 안 된 것이다. */
  const drift = known && saved !== live;

  return (
    <section className="rounded-card border border-border-default bg-surface-mid p-3 space-y-2" data-testid="switch-identity">
      <p className="flex items-center gap-1.5 text-sm font-bold text-ink-primary">
        <Icon name="shield" size={15} className="shrink-0" />본인인증 · 매장이용권
      </p>
      <p className="text-xs leading-relaxed text-ink-muted">
        둘은 <b className="text-ink-secondary">한 스위치</b>입니다. 인증이 꺼진 채 이용권만 켜면 서버는 인증을 요구하는데
        인증 화면이 없어 손님이 넘어갈 수 없습니다. 끄면 기능이 <b className="text-ink-secondary">삭제가 아니라 숨김</b>이라 언제든 되돌립니다.
      </p>

      {loadErr != null && <LoadErrorCard error={loadErr} what="스위치 상태" onRetry={load} compact />}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={known ? saved : false}
          aria-label="본인인증 · 매장이용권"
          disabled={busy || !known}
          onClick={() => apply(!saved)}
          data-testid="switch-identity-toggle"
          className={[
            'relative inline-flex h-[28px] w-[52px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
            saved ? 'bg-emerald-500' : 'bg-surface-high border border-border-default',
          ].join(' ')}
        >
          <span className={['inline-block h-[22px] w-[22px] rounded-full bg-white transition-transform', saved ? 'translate-x-[27px]' : 'translate-x-[3px]'].join(' ')} />
        </button>
        <span className="text-sm font-bold" data-testid="switch-identity-state">
          {!known ? <span className="text-ink-muted">불러오는 중…</span>
            : saved ? <span className="text-emerald-400">켜짐</span>
              : <span className="text-ink-secondary">꺼짐</span>}
        </span>
        {busy && <span className="text-2xs text-ink-muted">적용 중…</span>}
      </div>

      {/* 연동 확인 — '저장됐는가' 와 '앱이 그 값을 쓰는가' 는 다른 질문이다. 둘 다 보여 준다. */}
      {known && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-input bg-surface-base/50 p-2 text-2xs">
          <dt className="text-ink-muted">서버 저장값</dt>
          <dd className="text-right font-mono text-ink-secondary" data-testid="switch-identity-server">{server ?? '(없음)'}</dd>
          <dt className="text-ink-muted">이 앱이 쓰는 값</dt>
          <dd className="text-right font-mono text-ink-secondary" data-testid="switch-identity-live">{live ? 'on' : 'off'}</dd>
        </dl>
      )}
      {drift && (
        <p className="text-2xs text-danger-light">
          서버 값과 화면이 다릅니다 — 저장 권한이 없거나 반영이 되지 않았습니다. 운영자 계정인지 확인해 주세요.
        </p>
      )}

      {/* 켜기 전에 반드시 끝나 있어야 하는 것. 스위치 옆이 아니면 아무도 안 읽는다. */}
      {!saved && (
        <p className="rounded-input border border-amber-400/30 bg-amber-400/[0.07] p-2 text-2xs leading-relaxed text-ink-secondary">
          <b className="text-amber-300">켜기 전에</b> 마이그레이션 <span className="font-mono">20260911g</span> 를 운영 DB 에 적용하세요.
          지금 켜면 같은 날 같은 매장에 이용권을 <b>두 장 쓰는 손님의 두 번째 장이 반드시 실패</b>합니다
          (대기 요청 유니크 인덱스). 그날 현장결제 요청을 보낸 손님은 한 장도 쓰지 못합니다.
        </p>
      )}
    </section>
  );
}

// ── ② 클락 광고(전 매장 공통) ───────────────────────────────────────────────
// 전역 설정인데 지금까지 **매장 클락 화면에서만** 만질 수 있었다. set_app_setting 은 admin 만
// 통과하므로 업주에게는 조용히 실패했고, 전역 값이라 한 매장에서 바꾸면 모든 매장 클락이 바뀐다.
// 관리 자리를 여기로 올린다(클락 화면의 기능은 그대로 둔다 — 운영자가 현장에서 쓰던 동선이다).
function ClockAdCard() {
  const toast = useToast();
  const { user } = useAuth();
  const [img, setImg] = useState<string | null>(null);
  const [size, setSize] = useState<AdSize>('sm');
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadErr(null); setLoaded(false);
    Promise.all([getAppSetting(CLOCK_AD_KEY), getAppSetting(CLOCK_AD_SIZE_KEY)])
      .then(([i, s]) => { setImg(i && i.trim() ? i : null); setSize(isAdSize(s) ? s : 'sm'); setLoaded(true); })
      .catch(setLoadErr);
  }, []);
  useEffect(() => { load(); }, [load]);

  const changeSize = async (s: AdSize) => {
    if (!loaded || s === size) return;
    const prev = size;
    setSize(s);                       // 낙관적 — 실패하면 아래에서 되돌린다
    try {
      await setAppSetting(CLOCK_AD_SIZE_KEY, s);
      publishClockSignal('ad');   // 같은 탭에 열린 클락은 즉시, 다른 창·기기는 폴링(30초)으로 따라온다
    } catch (e) {
      setSize(prev);                  // ⚠ 되돌리지 않으면 '바꿨는데 새로고침하면 원래대로' 가 된다
      toast.show(e instanceof Error ? e.message : '크기를 저장하지 못했습니다', 'error');
    }
  };

  const upload = async (file: File | null) => {
    if (!file || !user) return;
    setBusy(true);
    try {
      const url = await uploadPoster(user.id, file);
      await setAppSetting(CLOCK_AD_KEY, url);
      publishClockSignal('ad');
      setImg(url);
      toast.show('클락 광고를 등록했습니다 — 전 매장 클락에 적용됩니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '업로드하지 못했습니다', 'error');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm('클락 광고를 삭제할까요? 전 매장 클락에서 사라집니다.')) return;
    setBusy(true);
    try {
      await setAppSetting(CLOCK_AD_KEY, '');
      publishClockSignal('ad');
      setImg(null);
      toast.show('클락 광고를 삭제했습니다', 'info');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '삭제하지 못했습니다', 'error');
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-card border border-border-default bg-surface-mid p-3 space-y-2" data-testid="switch-clock-ad">
      <p className="flex items-center gap-1.5 text-sm font-bold text-ink-primary">
        <Icon name="image" size={15} className="shrink-0" />클락 광고 <span className="text-2xs font-semibold text-ink-muted">전 매장 공통</span>
      </p>
      <p className="text-xs leading-relaxed text-ink-muted">
        대회 클락 송출 화면 하단에 뜹니다. <b className="text-ink-secondary">모든 매장에 같이 적용</b>되는 값이라 여기서 관리합니다.
        송출 중인 클락은 최대 30초 안에 따라옵니다.
      </p>

      {loadErr != null && <LoadErrorCard error={loadErr} what="클락 광고 설정" onRetry={load} compact />}

      {img
        ? <img src={img} alt="현재 클락 광고" className="max-h-24 rounded-input border border-border-subtle object-contain" />
        : <p className="rounded-input bg-surface-base/50 p-2 text-2xs text-ink-muted">등록된 광고가 없습니다 — 클락 화면 하단이 비어 있습니다.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className={['btn-ghost cursor-pointer px-3 py-1.5 text-xs', busy || !loaded ? 'pointer-events-none opacity-50' : ''].join(' ')}>
          {busy ? '올리는 중…' : img ? '교체' : '등록'}
          <input type="file" accept="image/*" className="hidden" disabled={busy || !loaded}
            onChange={(e) => { void upload(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </label>
        {img && (
          <button type="button" onClick={remove} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs text-danger-light disabled:opacity-50">
            삭제
          </button>
        )}
        <div className="ml-auto flex items-center gap-1 rounded-input bg-surface-high p-0.5" role="group" aria-label="클락 광고 크기">
          {AD_SIZES.map((s) => (
            <button key={s.v} type="button" aria-pressed={size === s.v} disabled={!loaded}
              onClick={() => { void changeSize(s.v); }}
              className={['rounded-[6px] px-2.5 py-1 text-2xs font-semibold transition-colors disabled:opacity-50',
                size === s.v ? 'bg-accent-300 text-white' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
