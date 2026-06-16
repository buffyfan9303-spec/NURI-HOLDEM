// src/components/features/SeasonPanel.tsx
// 매장 시즌(분기) 리그 — 현재 시즌 랭킹 + 운영자 시즌 생성/종료(상위3 자동 보상) + 지난 시즌 아카이브.
// canManage=true(운영자)면 생성/종료 UI 노출. 랭킹·아카이브는 누구나 조회(공개).
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import {
  listVenueSeasons, getCurrentSeasonStandings, getSeasonResults,
  createVenueSeason, endVenueSeason, type VenueSeason, type SeasonStanding,
} from '../../api/seasons';

const today = () => new Date().toLocaleDateString('en-CA');
const addDays = (iso: string, d: number) => { const t = new Date(iso); t.setDate(t.getDate() + d); return t.toLocaleDateString('en-CA'); };
const daysLeft = (endsOn: string) => Math.max(0, Math.ceil((new Date(endsOn + 'T23:59:59').getTime() - Date.now()) / 86400000));
const medal = (r: number) => (r === 1 ? 'bg-gold-300 text-ink-inverse' : r === 2 ? 'bg-slate-300 text-ink-inverse' : r === 3 ? 'bg-amber-700 text-white' : 'bg-surface-float text-ink-secondary');

export default function SeasonPanel({ venueId, canManage = false }: { venueId: string; canManage?: boolean }) {
  const toast = useToast();
  const [seasons, setSeasons] = useState<VenueSeason[] | null>(null);
  const [standings, setStandings] = useState<SeasonStanding[]>([]);
  const [busy, setBusy] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [archiveRows, setArchiveRows] = useState<SeasonStanding[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(addDays(today(), 90));

  const load = () => {
    listVenueSeasons(venueId).then(setSeasons).catch(() => setSeasons([]));
    getCurrentSeasonStandings(venueId).then(setStandings).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [venueId]);

  const active = useMemo(() => seasons?.find((s) => s.status === 'active') ?? null, [seasons]);
  const archived = useMemo(() => seasons?.filter((s) => s.status === 'ended') ?? [], [seasons]);

  const doCreate = async () => {
    if (busy) return;
    if (!name.trim()) { toast.show('시즌 이름을 입력하세요', 'error'); return; }
    setBusy(true);
    try { await createVenueSeason(venueId, name.trim(), startsOn, endsOn); toast.show('시즌을 시작했어요', 'success'); setName(''); setCreating(false); load(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '생성 실패', 'error'); } finally { setBusy(false); }
  };
  const doEnd = async () => {
    if (busy || !active) return;
    if (!window.confirm('시즌을 종료하고 상위 3명에게 보상(활동점수)을 지급할까요? 되돌릴 수 없습니다.')) return;
    setBusy(true);
    try { const n = await endVenueSeason(active.id); toast.show(`시즌 종료 · ${n}명 기록 아카이브 + 상위 보상 지급`, 'success'); load(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '종료 실패', 'error'); } finally { setBusy(false); }
  };
  const openArchive = async (id: string) => {
    if (archiveId === id) { setArchiveId(null); return; }
    setArchiveId(id);
    setArchiveRows(await getSeasonResults(id).catch(() => []));
  };

  const Row = ({ s }: { s: SeasonStanding }) => (
    <li className="flex items-center gap-2.5 rounded-input border border-border-subtle bg-surface-low px-3 py-2">
      <span className={['flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-extrabold tabular-nums', medal(s.rank)].join(' ')}>{s.rank}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{s.nickname}{s.realName ? <span className="text-2xs font-normal text-ink-muted"> ({s.realName})</span> : null}</span>
      <span className="shrink-0 text-2xs text-ink-muted tabular-nums">{s.appearances}회 · 최고 {s.bestPosition}위</span>
      <span className="shrink-0 text-xs font-bold tabular-nums text-gold-300">{s.points}점</span>
    </li>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-primary">🏆 시즌 리그</h3>
        {canManage && !active && !creating && <button type="button" onClick={() => setCreating(true)} className="btn-primary px-3 py-1 text-2xs">+ 시즌 시작</button>}
      </div>

      {/* 시즌 생성 폼 */}
      {canManage && !active && creating && (
        <div className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="시즌 이름 (예: 2026 여름 시즌)" className="input w-full text-sm" />
          <div className="flex items-center gap-2 text-2xs text-ink-muted">
            <label className="flex-1">시작 <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="input mt-0.5 w-full text-xs" /></label>
            <label className="flex-1">종료 <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="input mt-0.5 w-full text-xs" /></label>
          </div>
          <p className="text-2xs text-ink-muted">종료일이 지나면 자동으로 마감·보상됩니다(상위 3명 활동점수 1000/500/300점).</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost flex-1 text-2xs">취소</button>
            <button type="button" onClick={doCreate} disabled={busy} className="btn-primary flex-1 text-2xs disabled:opacity-50">{busy ? '생성 중…' : '시즌 시작'}</button>
          </div>
        </div>
      )}

      {/* 현재 시즌 + 랭킹 */}
      {active ? (
        <div className="rounded-card border border-gold-400/30 bg-gold-300/[0.04] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gold-300">{active.name}</p>
              <p className="text-2xs text-ink-muted">{active.startsOn} ~ {active.endsOn} · <b className="text-ink-secondary">D-{daysLeft(active.endsOn)}</b></p>
            </div>
            {canManage && <button type="button" onClick={doEnd} disabled={busy} className="btn-ghost shrink-0 px-2.5 py-1 text-2xs text-amber-300 disabled:opacity-50">시즌 종료</button>}
          </div>
          {standings.length === 0 ? (
            <p className="py-4 text-center text-2xs text-ink-muted">아직 시즌 순위 기록이 없습니다 — 순위가 등록되면 집계됩니다.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">{standings.slice(0, 20).map((s) => <Row key={s.rank} s={s} />)}</ul>
          )}
        </div>
      ) : !creating && (
        <p className="rounded-card border border-border-subtle bg-surface-low py-4 text-center text-2xs text-ink-muted">진행 중인 시즌이 없습니다.{canManage ? " '시즌 시작'으로 분기 리그를 열어보세요." : ''}</p>
      )}

      {/* 지난 시즌 아카이브 */}
      {archived.length > 0 && (
        <div>
          <p className="mb-1.5 text-2xs font-bold text-ink-muted">📚 지난 시즌</p>
          <ul className="space-y-1.5">
            {archived.map((s) => (
              <li key={s.id} className="rounded-card border border-border-subtle bg-surface-low">
                <button type="button" onClick={() => openArchive(s.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                  <span className="min-w-0 truncate text-sm font-semibold text-ink-primary">{s.name}</span>
                  <span className="shrink-0 text-2xs text-ink-muted">{s.startsOn}~{s.endsOn} {archiveId === s.id ? '▲' : '▼'}</span>
                </button>
                {archiveId === s.id && (
                  <ul className="space-y-1.5 px-2 pb-2">
                    {archiveRows.length === 0 ? <li className="py-2 text-center text-2xs text-ink-muted">기록 없음</li> : archiveRows.slice(0, 20).map((r) => <Row key={r.rank} s={r} />)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
