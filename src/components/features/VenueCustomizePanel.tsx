import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import Icon from '../atoms/Icon';
import {
  getVenuePageConfig, setVenuePageConfig, getScoreEntries, addScoreEntry, deleteScoreEntry,
  getVenueRankingTotals, getVenuePlayerCounts, DEFAULT_PLACEMENT_POINTS,
  boardLabel, boardDesc, boardUnit, isCustomBoard, customKeyOf, boardPeriodStart, BOARD_PERIOD_LABEL,
  type VenuePageConfig, type RankBoardId, type CustomBoard, type ScoreEntry, type PlayerCounts,
} from '../../api/rankings';
import { searchRegisteredPlayers, type RegisteredPlayer } from '../../api/ledger';
import { getVenueSlug, isSlugAvailable, setVenueSlug } from '../../api/community';

// 매장 페이지 탭(VenuePage와 동일 키)
const PAGE_TABS: { key: string; label: string }[] = [
  { key: 'about', label: '매장 소개' },
  { key: 'ranking', label: '순위' },
  { key: 'posters', label: '포스터' },
  { key: 'schedules', label: '진행 예정' },
  { key: 'community', label: '커뮤니티' },
];
// 웹 데이터로 자동 산출되는 기본 보드 6종
const BUILTIN_METRICS: RankBoardId[] = ['score', 'prize', 'moneyin_count', 'moneyin_rate', 'buyin_count', 'visit_count'];
const MAX_CUSTOM_BOARDS = 3;

/** 매장 꾸미기 — 매장 페이지 탭 순서. (순위 보드·칭호·점수는 「매장 랭킹」 탭) */
export default function VenueCustomizePanel({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<VenuePageConfig>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    getVenuePageConfig(venueId)
      .then((c) => { if (alive) setCfg(c ?? {}); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [venueId]);

  const order: string[] = useMemo(() => {
    const saved = (cfg.tabOrder ?? []).filter((k) => PAGE_TABS.some((t) => t.key === k));
    return [...saved, ...PAGE_TABS.map((t) => t.key).filter((k) => !saved.includes(k))];
  }, [cfg.tabOrder]);

  const move = (key: string, dir: -1 | 1) => {
    const idx = order.indexOf(key);
    const to = idx + dir;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[idx], next[to]] = [next[to], next[idx]];
    setCfg((c) => ({ ...c, tabOrder: next }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await setVenuePageConfig(venueId, { ...cfg, tabOrder: order });
      toast.show('매장 페이지 설정을 저장했습니다', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
    finally { setSaving(false); }
  };

  if (!loaded) return <p className="py-10 text-center text-2xs text-ink-muted">불러오는 중…</p>;

  return (
    <div className="space-y-3">
      <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
        <h3 className="text-sm font-bold text-ink-primary">매장 페이지 탭 순서</h3>
        <p className="text-2xs text-ink-muted">손님이 매장을 열었을 때 보이는 탭 순서를 정하세요. 가장 위가 가장 왼쪽에 노출됩니다.</p>
        <ul className="space-y-1">
          {order.map((k, i) => {
            const t = PAGE_TABS.find((x) => x.key === k)!;
            return (
              <li key={k} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-high px-2.5 py-1.5">
                <span className="w-5 text-center text-2xs font-bold text-gold-300 tabular-nums">{i + 1}</span>
                <span className="flex-1 text-sm font-semibold text-ink-primary">{t.label}</span>
                <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(k, -1)}
                  className="h-7 w-7 rounded-input border border-border-default text-ink-secondary disabled:opacity-30 hover:border-gold-400/50">↑</button>
                <button type="button" aria-label="아래로" disabled={i === order.length - 1} onClick={() => move(k, 1)}
                  className="h-7 w-7 rounded-input border border-border-default text-ink-secondary disabled:opacity-30 hover:border-gold-400/50">↓</button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 내 매장 링크(커스텀 슬러그) — nuriholdem.com/s/<원하는이름> */}
      <SlugEditor venueId={venueId} />

      <p className="text-2xs text-ink-muted">순위 탭에 보일 <span className="font-semibold text-gold-300">랭킹 보드 종류·1~3등 칭호·기준 점수·포인트 지급</span>은 「매장 랭킹」 탭에서 설정합니다.</p>

      <button type="button" onClick={save} disabled={saving} className="btn-primary w-full text-sm py-2.5 disabled:opacity-50">
        {saving ? '저장 중…' : '탭 순서 저장'}
      </button>
    </div>
  );
}

/** 내 매장 링크 — nuriholdem.com/s/<슬러그>. 중복·형식은 서버에서도 강제(set_venue_slug). */
function SlugEditor({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [slug, setSlug] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [check, setCheck] = useState<'idle' | 'ok' | 'taken' | 'invalid'>('idle');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getVenueSlug(venueId).then((s) => { if (alive) { setSaved(s); setSlug(s ?? ''); } }).catch(() => {});
    return () => { alive = false; };
  }, [venueId]);

  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
  const valid = /^[a-z0-9][a-z0-9-]{1,19}$/.test(slug);

  const doCheck = async () => {
    if (!valid) { setCheck('invalid'); return; }
    if (slug === saved) { setCheck('ok'); return; }
    const ok = await isSlugAvailable(slug);
    setCheck(ok ? 'ok' : 'taken');
  };

  const save = async () => {
    setBusy(true);
    try {
      await setVenueSlug(venueId, slug);
      setSaved(slug || null);
      setCheck('idle');
      toast.show(slug ? `내 매장 링크가 nuriholdem.com/s/${slug} 로 설정됐습니다` : '커스텀 링크를 해제했습니다', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
      <h3 className="text-sm font-bold text-ink-primary">내 매장 링크 <span className="text-2xs font-normal text-ink-muted">(공유 주소를 원하는 이름으로)</span></h3>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-muted">nuriholdem.com/s/</span>
        <input value={slug}
          onChange={(e) => { setSlug(normalize(e.target.value)); setCheck('idle'); }}
          placeholder="예: roti-arena" maxLength={20}
          className="input min-w-0 flex-1 text-sm lowercase" />
        <button type="button" onClick={doCheck} disabled={!slug}
          className="btn-ghost shrink-0 px-3 text-xs disabled:opacity-50">중복 확인</button>
        <button type="button" onClick={save} disabled={busy || (slug !== '' && check !== 'ok') || slug === (saved ?? '')}
          className="btn-primary shrink-0 px-3 text-xs disabled:opacity-50">저장</button>
      </div>
      {check === 'ok' && <p className="text-2xs font-semibold text-emerald-400">✓ 사용할 수 있는 링크입니다 — 저장을 누르세요.</p>}
      {check === 'taken' && <p className="text-2xs font-semibold text-danger-light">✕ 이미 사용 중인 링크입니다 — 다른 이름을 시도하세요.</p>}
      {check === 'invalid' && <p className="text-2xs font-semibold text-danger-light">✕ 영문 소문자·숫자·하이픈(-)으로 2~20자여야 합니다.</p>}
      <p className="text-[10px] text-ink-muted">
        {saved ? <>현재 링크: <span className="font-bold text-gold-300">nuriholdem.com/s/{saved}</span> · 비우고 저장하면 기본 링크로 돌아갑니다.</>
          : '설정하면 매장 페이지 「링크 공유」가 이 주소로 나갑니다. 기존 기본 링크도 계속 작동해요.'}
      </p>
    </section>
  );
}

/**
 * 매장 랭킹 — 매장 커뮤니티 순위 탭에 적용되는 랭킹 시스템 허브.
 *  ① 보드 종류: 웹 데이터 자동 산출 6종 + 직접 만든 커스텀 보드 중 1~2개 노출
 *  ② 커스텀 보드 만들기(최대 3 — 이름·단위, 명단은 ④에서 직접 입력)
 *  ③ 1~3등 칭호 · 기준 점수  ④ 포인트 지급/차감(보드 선택)  ⑤ 보드 미리보기
 */
export function VenueRankHub({ venueId, canConfigure }: { venueId: string; canConfigure: boolean }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<VenuePageConfig>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nbName, setNbName] = useState('');
  const [nbUnit, setNbUnit] = useState('');
  const [nbPeriod, setNbPeriod] = useState<'all' | 'month' | 'season'>('all');

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    getVenuePageConfig(venueId)
      .then((c) => { if (alive) setCfg(c ?? {}); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [venueId]);

  const customBoards = cfg.customBoards ?? [];
  const allBoards: RankBoardId[] = [...BUILTIN_METRICS, ...customBoards.map((b) => `custom:${b.key}`)];
  const metrics = (cfg.rankMetrics ?? ['score', 'prize']).filter((m) => allBoards.includes(m)).slice(0, 2);

  const toggleMetric = (m: RankBoardId) => {
    setCfg((c) => {
      const cur = ((c.rankMetrics ?? ['score', 'prize']) as RankBoardId[]).filter((x) => allBoards.includes(x)).slice(0, 2);
      if (cur.includes(m)) {
        if (cur.length === 1) return c; // 최소 1개
        return { ...c, rankMetrics: cur.filter((x) => x !== m) };
      }
      if (cur.length >= 2) return { ...c, rankMetrics: [cur[1], m] }; // 오래된 것 교체
      return { ...c, rankMetrics: [...cur, m] };
    });
  };

  const addBoard = () => {
    const name = nbName.trim();
    if (!name) return toast.show('보드 이름을 입력하세요', 'error');
    if (customBoards.length >= MAX_CUSTOM_BOARDS) return toast.show(`커스텀 보드는 최대 ${MAX_CUSTOM_BOARDS}개입니다`, 'error');
    const key = `c${Math.random().toString(36).slice(2, 8)}`;
    const seasonStart = nbPeriod === 'season' ? new Date().toLocaleDateString('en-CA') : undefined;
    setCfg((c) => ({ ...c, customBoards: [...(c.customBoards ?? []), { key, name, unit: nbUnit.trim() || undefined, period: nbPeriod, seasonStart }] }));
    setNbName(''); setNbUnit(''); setNbPeriod('all');
    toast.show('커스텀 보드를 추가했습니다 — 저장을 눌러 반영하세요', 'info');
  };
  const removeBoard = (key: string) => {
    setCfg((c) => ({
      ...c,
      customBoards: (c.customBoards ?? []).filter((b) => b.key !== key),
      rankMetrics: (c.rankMetrics ?? []).filter((m) => m !== `custom:${key}`),
    }));
  };
  // 시즌 보드 리셋 — 시즌 시작일을 오늘로(이전 기록은 보존되지만 집계에서 제외)
  const resetSeason = (key: string) => {
    const today = new Date().toLocaleDateString('en-CA');
    setCfg((c) => ({
      ...c,
      customBoards: (c.customBoards ?? []).map((b) => (b.key === key ? { ...b, seasonStart: today } : b)),
    }));
    toast.show('시즌 시작일을 오늘로 리셋했습니다 — 저장을 눌러 반영하세요', 'info');
  };

  const points = cfg.placementPoints?.length ? cfg.placementPoints : DEFAULT_PLACEMENT_POINTS;
  const setPoint = (i: number, v: number) => {
    const next = [...points];
    next[i] = Math.max(0, Math.min(9999, Math.round(v) || 0));
    setCfg((c) => ({ ...c, placementPoints: next }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await setVenuePageConfig(venueId, { ...cfg, rankMetrics: metrics });
      toast.show('매장 랭킹 설정을 저장했습니다 — 매장 커뮤니티 순위 탭에 바로 반영됩니다', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
    finally { setSaving(false); }
  };

  if (!loaded) return <p className="py-10 text-center text-2xs text-ink-muted">불러오는 중…</p>;

  // 제목·설명은 VenueManageTab 공용 SectionHeader가 렌더(섹션 간 규격 통일)
  return (
    <div className="space-y-3">
      {canConfigure && (<>
        {/* ① 보드 종류 — 자동 산출 6종 + 커스텀 */}
        <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
          <h3 className="text-sm font-bold text-ink-primary">랭킹 보드 종류 <span className="text-2xs font-normal text-ink-muted">(1~2개 선택 · 웹 데이터 자동 산출)</span></h3>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {allBoards.map((m) => {
              const on = metrics.includes(m);
              return (
                <button key={m} type="button" onClick={() => toggleMetric(m)}
                  className={['rounded-input border p-2.5 text-left transition-colors',
                    on ? 'border-gold-400/60 bg-gold-300/[0.08]' : 'border-border-default bg-surface-high hover:border-gold-400/40'].join(' ')}>
                  <span className="flex items-center gap-1.5">
                    <span className={['h-3.5 w-3.5 rounded-full border flex items-center justify-center', on ? 'border-gold-300 bg-gold-300' : 'border-ink-muted'].join(' ')}>
                      {on && <Icon name="check" size={10} className="text-ink-inverse" />}
                    </span>
                    <span className={['text-xs font-bold', on ? 'text-gold-300' : 'text-ink-primary'].join(' ')}>{boardLabel(m, cfg)}</span>
                    {isCustomBoard(m) && <span className="rounded-badge bg-violet-500/15 px-1 py-0.5 text-[9px] font-bold text-violet-300">커스텀</span>}
                  </span>
                  <span className="mt-1 block text-[10px] leading-snug text-ink-muted">{boardDesc(m, cfg)}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-ink-muted">1개만 선택하면 토글 없이 해당 순위만 크게 보여줍니다.</p>
        </section>

        {/* ② 커스텀 보드 만들기 — 목록에 없는 랭킹을 직접 */}
        <section className="rounded-card border border-violet-500/30 bg-violet-500/[0.04] p-3 space-y-2">
          <h3 className="text-sm font-bold text-ink-primary">커스텀 보드 만들기 <span className="text-2xs font-normal text-ink-muted">(최대 {MAX_CUSTOM_BOARDS}개)</span></h3>
          <p className="text-2xs text-ink-muted">위 목록에 없는 랭킹(예: 월요 토너 킹, 6월 이벤트 랭킹)을 직접 만들고, 명단·점수는 아래 「포인트 지급 · 차감」에서 보드를 골라 입력하세요.</p>
          {customBoards.length > 0 && (
            <ul className="space-y-1">
              {customBoards.map((b) => (
                <li key={b.key} className="flex flex-wrap items-center gap-2 rounded-input border border-border-subtle bg-surface-high px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink-primary">
                    {b.name} <span className="font-normal text-ink-muted">(단위: {b.unit || '점'})</span>
                  </span>
                  <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-[9px] font-bold text-ink-secondary">
                    {BOARD_PERIOD_LABEL[b.period ?? 'all']}{b.period === 'season' && b.seasonStart ? ` · ${b.seasonStart.slice(5)}~` : ''}
                  </span>
                  {b.period === 'season' && (
                    <button type="button" onClick={() => resetSeason(b.key)} className="shrink-0 rounded-badge border border-gold-400/40 px-1.5 py-0.5 text-[9px] font-bold text-gold-300 hover:bg-gold-300/10">시즌 리셋</button>
                  )}
                  <button type="button" onClick={() => removeBoard(b.key)} aria-label="보드 삭제" className="shrink-0 text-ink-muted hover:text-danger-light"><Icon name="close" size={13} /></button>
                </li>
              ))}
            </ul>
          )}
          {customBoards.length < MAX_CUSTOM_BOARDS && (
            <div className="flex flex-wrap gap-1.5">
              <input value={nbName} onChange={(e) => setNbName(e.target.value)} maxLength={16} placeholder="보드 이름 (예: 월요 토너 킹)" className="input min-w-0 flex-1 text-sm" />
              <input value={nbUnit} onChange={(e) => setNbUnit(e.target.value)} maxLength={4} placeholder="단위(점)" className="input w-20 text-sm" />
              <select value={nbPeriod} onChange={(e) => setNbPeriod(e.target.value as 'all' | 'month' | 'season')} className="input w-auto shrink-0 text-sm" aria-label="집계 기간">
                <option value="all">누적</option>
                <option value="month">월간(매월 리셋)</option>
                <option value="season">시즌(오늘부터)</option>
              </select>
              <button type="button" onClick={addBoard} className="btn-primary shrink-0 px-3 text-xs">+ 추가</button>
            </div>
          )}
        </section>

        {/* ③ 1~3등 칭호 */}
        <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
          <h3 className="text-sm font-bold text-ink-primary">1~3등 칭호 <span className="text-2xs font-normal text-ink-muted">(예: 로티아레나 포식자)</span></h3>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {[1, 2, 3].map((r) => (
              <label key={r} className="space-y-1">
                <span className="text-2xs font-semibold text-ink-secondary">{r}등 칭호</span>
                <input value={cfg.rankTitles?.[String(r)] ?? ''} maxLength={16}
                  onChange={(e) => setCfg((c) => ({ ...c, rankTitles: { ...(c.rankTitles ?? {}), [String(r)]: e.target.value } }))}
                  placeholder={r === 1 ? '챔피언' : r === 2 ? '준우승' : '3위'} className="input w-full text-sm" />
              </label>
            ))}
          </div>
        </section>

        {/* ④ 기준 점수 */}
        <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
          <h3 className="text-sm font-bold text-ink-primary">기준 점수 <span className="text-2xs font-normal text-ink-muted">(순위 등록 시 등수별 부여 점수 · 그 외 등수는 1점)</span></h3>
          <div className="grid grid-cols-5 gap-1.5">
            {points.map((p, i) => (
              <label key={i} className="space-y-0.5 text-center">
                <span className="text-[10px] font-semibold text-ink-muted">{i + 1}등</span>
                <input type="number" inputMode="numeric" value={p}
                  onChange={(e) => setPoint(i, Number(e.target.value))}
                  className="input w-full text-center text-sm tabular-nums" />
              </label>
            ))}
          </div>
          <button type="button" onClick={() => setCfg((c) => ({ ...c, placementPoints: [...DEFAULT_PLACEMENT_POINTS] }))} className="btn-ghost text-2xs px-2">기본값(10·7·5·3·2)으로</button>
        </section>

        <button type="button" onClick={save} disabled={saving} className="btn-primary w-full text-sm py-2.5 disabled:opacity-50">
          {saving ? '저장 중…' : '매장 랭킹 설정 저장'}
        </button>
      </>)}

      {/* ⑤ 포인트 지급/차감 — 보드 선택(기본/커스텀), 장부 권한 직원도 가능 */}
      <ScorePointsPanel venueId={venueId} customBoards={customBoards} />

      {/* ⑥ 일별 기록 달력 — 날짜별로 누가 몇 점 받았는지 한눈에 */}
      <ScoreCalendar venueId={venueId} customBoards={customBoards} />

      {/* ⑦ 보드 미리보기 — 전체 보드 */}
      <RankBoardPreview venueId={venueId} cfg={cfg} />
    </div>
  );
}

/** 포인트 지급/차감 — 보드별 자유 점수 입력(기본=매장 포인트 합산, 커스텀=해당 보드 전용). */
export function ScorePointsPanel({ venueId, customBoards = [] }: { venueId: string; customBoards?: CustomBoard[] }) {
  const toast = useToast();
  const today = new Date().toLocaleDateString('en-CA');
  const [rows, setRows] = useState<ScoreEntry[]>([]);
  const [board, setBoard] = useState('');   // '' = 기본(매장 포인트)
  const [name, setName] = useState('');
  const [date, setDate] = useState(today);  // 매일매일 기록 — 지난 날짜 소급 입력 가능
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // 닉네임 자동완성(가입 회원 연동) — 오타로 명단이 갈라지는 것 방지
  const [suggest, setSuggest] = useState<RegisteredPlayer[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const reload = () => { getScoreEntries(venueId).then(setRows).catch(() => {}); };
  useEffect(reload, [venueId]);

  // 입력 디바운스 검색(300ms) — 실명·닉네임·이 매장 방문횟수
  useEffect(() => {
    const q = name.trim();
    if (!suggestOpen || q.length < 1) { setSuggest([]); return; }
    const t = setTimeout(() => {
      searchRegisteredPlayers(venueId, q).then((r) => setSuggest(r.slice(0, 6))).catch(() => setSuggest([]));
    }, 300);
    return () => clearTimeout(t);
  }, [name, venueId, suggestOpen]);

  const boardName = (key: string | null) => key ? (customBoards.find((b) => b.key === key)?.name ?? '커스텀') : '매장 포인트';

  const add = async (sign: 1 | -1) => {
    const p = Math.abs(Math.round(Number(points)));
    if (!name.trim()) return toast.show('이름(닉네임)을 입력하세요', 'error');
    if (!p) return toast.show('포인트를 입력하세요', 'error');
    setBusy(true);
    try {
      await addScoreEntry(venueId, { name, points: sign * p, reason, boardKey: board || null, entryDate: date || undefined });
      setName(''); setPoints(''); setReason(''); setSuggest([]);
      toast.show(sign > 0 ? `「${boardName(board || null)}」에 지급했습니다 (${date})` : `「${boardName(board || null)}」에서 차감했습니다 (${date})`, 'success');
      reload();
    } catch (e) { toast.show(e instanceof Error ? e.message : '실패했습니다', 'error'); }
    finally { setBusy(false); }
  };

  const del = async (id: string) => {
    try { await deleteScoreEntry(id); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); }
  };

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-ink-primary">포인트 지급 · 차감</h3>
        <p className="text-2xs text-ink-muted mt-0.5">이벤트·미션 보상 등 자유 점수를 <span className="font-semibold text-gold-300">날짜·보드별</span>로 매일 기록합니다. 커스텀 보드는 여기서 입력한 명단으로만 순위가 만들어집니다.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <select value={board} onChange={(e) => setBoard(e.target.value)} className="input w-full text-sm sm:w-auto sm:min-w-[10rem]">
          <option value="">매장 포인트(기본)</option>
          {customBoards.map((b) => <option key={b.key} value={b.key}>{b.name} (커스텀)</option>)}
        </select>
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)}
          className="input w-auto shrink-0 text-sm tabular-nums" aria-label="기록 날짜" />
        <div className="relative min-w-0 flex-1">
          <input value={name}
            onChange={(e) => { setName(e.target.value); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            placeholder="이름(닉네임)" maxLength={30} className="input w-full text-sm" />
          {/* 가입 회원 자동완성 — 클릭 시 닉네임으로 채움 */}
          {suggestOpen && suggest.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-input border border-gold-400/40 bg-surface-base shadow-lg">
              {suggest.map((s) => {
                const fill = s.nickname || s.realName || '';
                return (
                  <li key={s.userId}>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); setName(fill); setSuggestOpen(false); }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface-high transition-colors">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">
                        {s.nickname ?? '(닉네임 없음)'}{s.realName ? <span className="ml-1 text-[10px] text-ink-muted">{s.realName}</span> : null}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">방문 {s.visits}회</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <input value={points} onChange={(e) => setPoints(e.target.value)} type="number" inputMode="numeric" placeholder="포인트" className="input w-24 text-sm tabular-nums" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유(선택)" maxLength={60} className="input min-w-0 flex-1 text-sm" />
        <button type="button" disabled={busy} onClick={() => add(1)} className="btn-primary shrink-0 px-3 text-xs disabled:opacity-50">지급</button>
        <button type="button" disabled={busy} onClick={() => add(-1)} className="shrink-0 rounded-input border border-danger/40 px-3 text-xs font-semibold text-danger-light hover:bg-danger/10 disabled:opacity-50">차감</button>
      </div>

      {rows.length > 0 && (
        <div>
          <p className="mb-1 text-2xs font-semibold text-ink-secondary">최근 지급/차감 내역</p>
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-high px-2.5 py-1.5">
                <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">{r.entryDate.slice(5)}</span>
                <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-[9px] font-bold', r.boardKey ? 'bg-violet-500/15 text-violet-300' : 'bg-gold-300/15 text-gold-300'].join(' ')}>{boardName(r.boardKey)}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{r.name}</span>
                {r.reason && <span className="hidden min-w-0 max-w-[9rem] truncate text-[10px] text-ink-muted sm:block">{r.reason}</span>}
                <span className={['shrink-0 text-xs font-bold tabular-nums', r.points >= 0 ? 'text-gold-300' : 'text-danger-light'].join(' ')}>
                  {r.points >= 0 ? '+' : ''}{r.points.toLocaleString()}
                </span>
                <button type="button" onClick={() => del(r.id)} aria-label="삭제" className="shrink-0 text-ink-muted hover:text-danger-light"><Icon name="close" size={12} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** 일별 기록 달력 — 날짜별 포인트 입력 내역을 월 달력으로 한눈에(클릭 시 그날 상세) */
export function ScoreCalendar({ venueId, customBoards = [] }: { venueId: string; customBoards?: CustomBoard[] }) {
  const toast = useToast();
  const today = new Date();
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: today.getFullYear(), m: today.getMonth() }); // m: 0-based
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const [sel, setSel] = useState<string | null>(new Date().toLocaleDateString('en-CA'));

  const reload = () => { getScoreEntries(venueId, 500).then(setEntries).catch(() => {}); };
  useEffect(reload, [venueId]);

  const boardName = (key: string | null) => key ? (customBoards.find((b) => b.key === key)?.name ?? '커스텀') : '매장 포인트';

  // 해당 월의 날짜별 그룹
  const monthKey = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;
  const byDay = useMemo(() => {
    const m: Record<string, ScoreEntry[]> = {};
    for (const e of entries) {
      if (!e.entryDate.startsWith(monthKey)) continue;
      (m[e.entryDate] ??= []).push(e);
    }
    return m;
  }, [entries, monthKey]);

  const firstDow = new Date(ym.y, ym.m, 1).getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const todayIso = today.toLocaleDateString('en-CA');
  const move = (d: -1 | 1) => {
    setYm(({ y, m }) => {
      const nm = m + d;
      return nm < 0 ? { y: y - 1, m: 11 } : nm > 11 ? { y: y + 1, m: 0 } : { y, m: nm };
    });
    setSel(null);
  };

  const selEntries = sel ? (byDay[sel] ?? []) : [];
  const del = async (id: string) => {
    try { await deleteScoreEntry(id); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); }
  };

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-ink-primary">일별 기록 달력</h3>
          <p className="text-2xs text-ink-muted">날짜를 누르면 그날 누가 몇 점 받았는지 보입니다.</p>
        </div>
        <button type="button" onClick={() => move(-1)} aria-label="이전 달" className="h-8 w-8 shrink-0 rounded-input border border-border-default text-ink-secondary hover:border-gold-400/50">‹</button>
        <span className="shrink-0 text-sm font-bold tabular-nums text-gold-300">{ym.y}.{String(ym.m + 1).padStart(2, '0')}</span>
        <button type="button" onClick={() => move(1)} aria-label="다음 달" className="h-8 w-8 shrink-0 rounded-input border border-border-default text-ink-secondary hover:border-gold-400/50">›</button>
      </div>

      {/* 요일 헤더 + 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <span key={d} className={['text-[10px] font-semibold', i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-ink-muted'].join(' ')}>{d}</span>
        ))}
        {Array.from({ length: firstDow }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const iso = `${monthKey}-${String(day).padStart(2, '0')}`;
          const list = byDay[iso] ?? [];
          const sum = list.reduce((a, e) => a + e.points, 0);
          const isSel = sel === iso;
          return (
            <button key={iso} type="button" onClick={() => setSel(iso)}
              className={['flex min-h-[3rem] flex-col items-center justify-start rounded-input border px-0.5 pt-1 transition-colors',
                isSel ? 'border-gold-300 bg-gold-300/[0.1]'
                : list.length ? 'border-gold-400/35 bg-gold-300/[0.04] hover:bg-gold-300/[0.08]'
                : 'border-border-subtle bg-surface-high/40 hover:bg-surface-high'].join(' ')}>
              <span className={['text-2xs font-bold tabular-nums leading-none', iso === todayIso ? 'text-gold-300' : 'text-ink-secondary'].join(' ')}>{day}</span>
              {list.length > 0 && (<>
                <span className="mt-0.5 rounded-badge bg-gold-300/20 px-1 text-[9px] font-bold leading-tight text-gold-300 tabular-nums">{list.length}건</span>
                <span className={['text-[9px] font-semibold tabular-nums leading-tight', sum >= 0 ? 'text-ink-muted' : 'text-danger-light'].join(' ')}>{sum > 0 ? '+' : ''}{sum}</span>
              </>)}
            </button>
          );
        })}
      </div>

      {/* 선택일 상세 */}
      {sel && (
        <div className="rounded-input border border-border-subtle bg-surface-high p-2.5">
          <p className="mb-1.5 text-2xs font-bold text-ink-secondary">{sel} 기록 {selEntries.length ? `(${selEntries.length}건)` : ''}</p>
          {selEntries.length === 0 ? (
            <p className="py-2 text-center text-2xs text-ink-muted">이 날짜의 기록이 없습니다 — 위 「포인트 지급 · 차감」에서 날짜를 골라 입력하세요.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
              {selEntries.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-input bg-surface-base/60 px-2 py-1.5">
                  <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-[9px] font-bold', r.boardKey ? 'bg-violet-500/15 text-violet-300' : 'bg-gold-300/15 text-gold-300'].join(' ')}>{boardName(r.boardKey)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{r.name}</span>
                  {r.reason && <span className="hidden max-w-[8rem] truncate text-[10px] text-ink-muted sm:block">{r.reason}</span>}
                  <span className={['shrink-0 text-xs font-bold tabular-nums', r.points >= 0 ? 'text-gold-300' : 'text-danger-light'].join(' ')}>{r.points >= 0 ? '+' : ''}{r.points.toLocaleString()}</span>
                  <button type="button" onClick={() => del(r.id)} aria-label="삭제" className="shrink-0 text-ink-muted hover:text-danger-light"><Icon name="close" size={12} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** 보드 미리보기 — 보드 선택해 TOP 10 즉시 확인(매장 커뮤니티 순위 탭과 동일 계산) */
function RankBoardPreview({ venueId, cfg }: { venueId: string; cfg: VenuePageConfig }) {
  const [metric, setMetric] = useState<RankBoardId>('score');
  const [rows, setRows] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const options: RankBoardId[] = [...BUILTIN_METRICS, ...(cfg.customBoards ?? []).map((b) => `custom:${b.key}`)];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        if (isCustomBoard(metric)) {
          const key = customKeyOf(metric);
          const start = boardPeriodStart((cfg.customBoards ?? []).find((b) => b.key === key));
          const entries = await getScoreEntries(venueId).catch(() => [] as ScoreEntry[]);
          const agg: Record<string, { name: string; value: number }> = {};
          for (const e of entries) {
            if (e.boardKey !== key) continue;
            if (start && e.entryDate < start) continue; // 월간/시즌 — 기간 밖 기록 제외
            const k = e.name.trim().toLowerCase();
            agg[k] = { name: agg[k]?.name ?? e.name, value: (agg[k]?.value ?? 0) + e.points };
          }
          const r = Object.values(agg).filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
          if (alive) setRows(r);
          return;
        }
        if (metric === 'buyin_count' || metric === 'visit_count') {
          const pc: PlayerCounts[] = await getVenuePlayerCounts(venueId);
          const r = pc.map((p) => ({ name: p.name, value: metric === 'buyin_count' ? p.buyins : p.visits }))
            .filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
          if (alive) setRows(r);
          return;
        }
        const [totals, manual, pc] = await Promise.all([
          getVenueRankingTotals(venueId, cfg),
          getScoreEntries(venueId).catch(() => [] as ScoreEntry[]),
          metric === 'moneyin_rate' ? getVenuePlayerCounts(venueId) : Promise.resolve([] as PlayerCounts[]),
        ]);
        const manualBy: Record<string, number> = {};
        for (const e of manual) { if (e.boardKey) continue; const k = e.name.trim().toLowerCase(); manualBy[k] = (manualBy[k] ?? 0) + e.points; }
        const buyinBy: Record<string, number> = {};
        for (const p of pc) buyinBy[p.name.toLowerCase()] = p.buyins;
        const base = totals.map((t) => {
          const k = t.nickname.toLowerCase();
          const buyins = buyinBy[k] ?? 0;
          const value = metric === 'score' ? t.moneyPoints + (manualBy[k] ?? 0)
            : metric === 'prize' ? t.prizeMan
            : metric === 'moneyin_count' ? t.appearances
            : buyins >= 5 ? Math.round((t.appearances / buyins) * 100) : -1;
          return { name: t.nickname, value };
        });
        if (metric === 'score') {
          for (const [k, pts] of Object.entries(manualBy)) {
            if (!base.some((b) => b.name.toLowerCase() === k)) {
              const src = manual.find((e) => !e.boardKey && e.name.trim().toLowerCase() === k);
              base.push({ name: src?.name ?? k, value: pts });
            }
          }
        }
        const r = base.filter((b) => b.value >= 0).sort((a, b) => b.value - a.value).slice(0, 10);
        if (alive) setRows(r);
      } catch { if (alive) setRows([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, metric, cfg.customBoards, cfg.placementPoints]);

  const unit = boardUnit(metric, cfg);

  return (
    <section className="rounded-card border border-gold-400/25 bg-gold-300/[0.04] p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-bold text-gold-300">보드 미리보기 (TOP 10)</h3>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} className="input w-auto shrink-0 text-2xs py-1.5">
          {options.map((m) => <option key={m} value={m}>{boardLabel(m, cfg)}</option>)}
        </select>
      </div>
      {loading ? <p className="py-4 text-center text-2xs text-ink-muted">불러오는 중…</p>
        : rows.length === 0 ? <p className="py-4 text-center text-2xs text-ink-muted">데이터가 없습니다 — 순위 입력·장부 기록·포인트 입력이 쌓이면 표시됩니다.</p>
        : (
          <ol className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {rows.map((b, i) => (
              <li key={b.name} className="flex items-baseline gap-2 text-xs">
                <span className={['w-4 text-right font-bold tabular-nums', i < 3 ? 'text-gold-300' : 'text-ink-muted'].join(' ')}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">{b.name}</span>
                <span className="font-bold tabular-nums text-gold-300">{b.value.toLocaleString()}{unit}</span>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
