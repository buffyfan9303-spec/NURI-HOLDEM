import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import Icon from '../atoms/Icon';
import {
  getVenuePageConfig, setVenuePageConfig, getScoreEntries, addScoreEntry, deleteScoreEntry,
  getVenueRankingTotals, DEFAULT_PLACEMENT_POINTS, RANK_METRIC_LABEL, RANK_METRIC_DESC,
  type VenuePageConfig, type RankMetric, type ScoreEntry,
} from '../../api/rankings';

// 매장 페이지 탭(VenuePage와 동일 키)
const PAGE_TABS: { key: string; label: string }[] = [
  { key: 'about', label: '매장 소개' },
  { key: 'ranking', label: '순위' },
  { key: 'posters', label: '포스터' },
  { key: 'schedules', label: '진행 예정' },
  { key: 'community', label: '커뮤니티' },
];
const ALL_METRICS: RankMetric[] = ['score', 'prize', 'moneyin_count', 'moneyin_rate'];

/**
 * 매장 꾸미기 — 업주가 매장 페이지를 직접 구성.
 *  ① 탭 순서(위/아래 이동) ② 순위 탭 메트릭(1~2개) ③ 1~3등 칭호 ④ 등수→점수 매핑
 */
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

  const metrics = (cfg.rankMetrics ?? ['score', 'prize']).slice(0, 2);
  const toggleMetric = (m: RankMetric) => {
    setCfg((c) => {
      const cur = (c.rankMetrics ?? ['score', 'prize']).slice(0, 2);
      if (cur.includes(m)) {
        if (cur.length === 1) return c; // 최소 1개
        return { ...c, rankMetrics: cur.filter((x) => x !== m) };
      }
      if (cur.length >= 2) return { ...c, rankMetrics: [cur[1], m] }; // 오래된 것 교체
      return { ...c, rankMetrics: [...cur, m] };
    });
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
      await setVenuePageConfig(venueId, { ...cfg, tabOrder: order, rankMetrics: metrics });
      toast.show('매장 페이지 설정을 저장했습니다', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
    finally { setSaving(false); }
  };

  if (!loaded) return <p className="py-10 text-center text-2xs text-ink-muted">불러오는 중…</p>;

  return (
    <div className="space-y-3">
      {/* ① 탭 순서 */}
      <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
        <h3 className="text-sm font-bold text-ink-primary">매장 페이지 탭 순서</h3>
        <p className="text-2xs text-ink-muted">손님이 매장을 열었을 때 보이는 탭 순서를 정하세요. 첫 번째 탭이 기본 화면이 아니라도, 가장 왼쪽에 노출됩니다.</p>
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

      {/* ② 순위 탭 메트릭(1~2개) */}
      <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
        <h3 className="text-sm font-bold text-ink-primary">순위 탭 구성 <span className="text-2xs font-normal text-ink-muted">(1~2개 선택)</span></h3>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {ALL_METRICS.map((m) => {
            const on = metrics.includes(m);
            return (
              <button key={m} type="button" onClick={() => toggleMetric(m)}
                className={['rounded-input border p-2.5 text-left transition-colors',
                  on ? 'border-gold-400/60 bg-gold-300/[0.08]' : 'border-border-default bg-surface-high hover:border-gold-400/40'].join(' ')}>
                <span className="flex items-center gap-1.5">
                  <span className={['h-3.5 w-3.5 rounded-full border flex items-center justify-center', on ? 'border-gold-300 bg-gold-300' : 'border-ink-muted'].join(' ')}>
                    {on && <Icon name="check" size={10} className="text-ink-inverse" />}
                  </span>
                  <span className={['text-xs font-bold', on ? 'text-gold-300' : 'text-ink-primary'].join(' ')}>{RANK_METRIC_LABEL[m]}</span>
                </span>
                <span className="mt-1 block text-[10px] leading-snug text-ink-muted">{RANK_METRIC_DESC[m]}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-ink-muted">1개만 선택하면 토글 없이 해당 순위만 크게 보여줍니다.</p>
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

      {/* ④ 등수→점수 매핑 */}
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
        {saving ? '저장 중…' : '매장 페이지 설정 저장'}
      </button>
    </div>
  );
}

/**
 * 포인트 관리 — 임의 포인트 지급/차감(이벤트·미션 보상 등 스코어링 운영용).
 *  순위 입력과 별개로 자유 점수를 더해 매장 포인트 보드에 합산된다.
 */
export function ScorePointsPanel({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<ScoreEntry[]>([]);
  const [name, setName] = useState('');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<{ nickname: string; pts: number }[]>([]);

  const reload = () => {
    getScoreEntries(venueId).then(setRows).catch(() => {});
    // 보드 미리보기: 등수점수(기본/커스텀) + 수동 포인트 합산 상위 10
    Promise.all([getVenuePageConfig(venueId).catch(() => null), getScoreEntries(venueId).catch(() => [] as ScoreEntry[])])
      .then(async ([cfg, manual]) => {
        const totals = await getVenueRankingTotals(venueId, cfg).catch(() => []);
        const m = new Map<string, { nickname: string; pts: number }>();
        for (const t of totals) m.set(t.nickname.toLowerCase(), { nickname: t.nickname, pts: t.moneyPoints });
        for (const e of manual) {
          const k = e.name.trim().toLowerCase();
          const cur = m.get(k) ?? { nickname: e.name, pts: 0 };
          cur.pts += e.points;
          m.set(k, cur);
        }
        setBoard([...m.values()].sort((a, b) => b.pts - a.pts).slice(0, 10));
      })
      .catch(() => {});
  };
  useEffect(reload, [venueId]);

  const add = async (sign: 1 | -1) => {
    const p = Math.abs(Math.round(Number(points)));
    if (!name.trim()) return toast.show('이름(닉네임)을 입력하세요', 'error');
    if (!p) return toast.show('포인트를 입력하세요', 'error');
    setBusy(true);
    try {
      await addScoreEntry(venueId, { name, points: sign * p, reason });
      setName(''); setPoints(''); setReason('');
      toast.show(sign > 0 ? '포인트를 지급했습니다' : '포인트를 차감했습니다', 'success');
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
        <p className="text-2xs text-ink-muted mt-0.5">이벤트·미션 보상 등 순위 입력 외의 점수를 자유롭게 더하거나 뺍니다. 매장 포인트 순위에 바로 합산됩니다(금전적 가치 없음).</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름(닉네임)" maxLength={30} className="input min-w-0 flex-1 text-sm" />
        <input value={points} onChange={(e) => setPoints(e.target.value)} type="number" inputMode="numeric" placeholder="포인트" className="input w-24 text-sm tabular-nums" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유(선택)" maxLength={60} className="input min-w-0 flex-1 text-sm" />
        <button type="button" disabled={busy} onClick={() => add(1)} className="btn-primary shrink-0 px-3 text-xs disabled:opacity-50">지급</button>
        <button type="button" disabled={busy} onClick={() => add(-1)} className="shrink-0 rounded-input border border-danger/40 px-3 text-xs font-semibold text-danger-light hover:bg-danger/10 disabled:opacity-50">차감</button>
      </div>

      {board.length > 0 && (
        <div className="rounded-input border border-gold-400/25 bg-gold-300/[0.04] p-2.5">
          <p className="mb-1.5 text-2xs font-bold text-gold-300">매장 포인트 보드 미리보기 (TOP 10)</p>
          <ol className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {board.map((b, i) => (
              <li key={b.nickname} className="flex items-baseline gap-2 text-xs">
                <span className="w-4 text-right font-bold tabular-nums text-ink-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">{b.nickname}</span>
                <span className="font-bold tabular-nums text-gold-300">{b.pts.toLocaleString()}점</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {rows.length > 0 && (
        <div>
          <p className="mb-1 text-2xs font-semibold text-ink-secondary">최근 지급/차감 내역</p>
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-high px-2.5 py-1.5">
                <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">{r.entryDate.slice(5)}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{r.name}</span>
                {r.reason && <span className="min-w-0 max-w-[10rem] truncate text-[10px] text-ink-muted">{r.reason}</span>}
                <span className={['shrink-0 text-xs font-bold tabular-nums', r.points >= 0 ? 'text-gold-300' : 'text-danger-light'].join(' ')}>
                  {r.points >= 0 ? '+' : ''}{r.points.toLocaleString()}점
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
