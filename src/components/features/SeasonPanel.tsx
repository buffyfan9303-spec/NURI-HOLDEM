// src/components/features/SeasonPanel.tsx
// 매장 시즌(분기) 리그 — 현재 시즌 랭킹 + 운영자 시즌 생성/종료(상위3 자동 보상) + 지난 시즌 아카이브.
// canManage=true(운영자)면 생성/종료 UI 노출. 랭킹·아카이브는 누구나 조회(공개).
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { shareChampionCard, shareChampionCardKakao } from '../../lib/recordCard';
import { kakaoConfigured } from '../../lib/kakao';
import {
  listVenueSeasons, getCurrentSeasonStandings, getSeasonResults, getVenueHallOfFame,
  createVenueSeason, endVenueSeason, type VenueSeason, type SeasonStanding, type HallOfFameEntry,
} from '../../api/seasons';
import { subscribeRankings, getVenueRealNameOptIns } from '../../api/rankings';
import Icon from '../atoms/Icon';

const today = () => new Date().toLocaleDateString('en-CA');
const addDays = (iso: string, d: number) => { const t = new Date(iso); t.setDate(t.getDate() + d); return t.toLocaleDateString('en-CA'); };
const daysLeft = (endsOn: string) => Math.max(0, Math.ceil((new Date(endsOn + 'T23:59:59').getTime() - Date.now()) / 86400000));
// 2등 배지의 흰 글자는 slate-300 위에서 대비 **1.48:1** — 사실상 안 보인다(다크·라이트 공통).
// 밝은 은색 위에는 어두운 글자. 1등(보라)·3등(동)은 흰 글자로 4.5 이상이라 그대로 둔다.
const medal = (r: number) => (r === 1 ? 'bg-accent-300 text-white' : r === 2 ? 'bg-slate-300 text-slate-900' : r === 3 ? 'bg-amber-700 text-white' : 'bg-surface-float text-ink-secondary');
// ⚠ 교차검증 실측(2026-08-29, 375 다크, 매장 페이지 순위 탭): 아래 시즌명·점수의 `text-accent-300`
// 이 다크에서 #805FDA on surface = **4.0 / 3.71:1** 로 AA(4.5) 미달이었다(B5 로 지목됐지만 남아 있던 자리).
// `text-accent-200` 은 테마 인지 토큰이다 — 다크는 #BCA9F0(6.94:1), 라이트는 index.css 의
// `html.light .text-accent-200 { color:#6946C8 }` 오버라이드로 **라이트 accent-300 과 완전히 동일한 값**이라
// 라이트 렌더는 1px 도 변하지 않고 다크만 통과한다. 배경/보더의 accent-300 은 텍스트가 아니라 그대로 둔다.

export default function SeasonPanel({ venueId, canManage = false, venueName }: { venueId: string; canManage?: boolean; venueName?: string }) {
  const toast = useToast();
  const [seasons, setSeasons] = useState<VenueSeason[] | null>(null);
  const [standings, setStandings] = useState<SeasonStanding[]>([]);
  const [busy, setBusy] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [archiveRows, setArchiveRows] = useState<SeasonStanding[]>([]);
  const [hof, setHof] = useState<HallOfFameEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(addDays(today(), 90));

  // 오너 #14 — 시즌 리그·역대 챔피언도 순위표다. 실명은 본인이 '실명'을 고른 경우에만 붙인다.
  //   기본값은 빈 집합(=전원 닉네임)이라 응답 전에도, 조회가 실패해도 실명이 새지 않는다.
  //   조회는 매장 페이지의 순위 패널과 같은 캐시를 타므로 요청이 늘지 않는다.
  const [realNameOptIns, setRealNameOptIns] = useState<ReadonlySet<string>>(() => new Set<string>());
  const showsRealName = (nickname: string) => realNameOptIns.has(nickname.trim().toLowerCase());

  const load = () => {
    listVenueSeasons(venueId).then(setSeasons).catch(() => setSeasons([]));
    getCurrentSeasonStandings(venueId).then(setStandings).catch(() => {});
    getVenueHallOfFame(venueId).then(setHof).catch(() => {});
    getVenueRealNameOptIns(venueId).then(setRealNameOptIns).catch(() => {});
  };
  // 순위 입력(venue_rankings 변경) 시 시즌 standings·HOF 즉시 갱신(실시간). 퍼블리케이션 등록 완료.
  useEffect(() => { load(); return subscribeRankings(venueId, load); }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{s.nickname}{s.realName && showsRealName(s.nickname) ? <span className="text-2xs font-normal text-ink-muted"> ({s.realName})</span> : null}</span>
      <span className="shrink-0 text-2xs text-ink-muted tabular-nums">{s.appearances}회 · 최고 {s.bestPosition}위</span>
      <span className="shrink-0 text-xs font-bold tabular-nums text-accent-200">{s.points}점</span>
    </li>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-primary"><Icon name="trophy" size={15} className="shrink-0 text-gold-300" />시즌 리그</h3>
        {canManage && !active && !creating && <button type="button" onClick={() => setCreating(true)} className="btn-primary px-3 py-1 text-2xs">+ 시즌 시작</button>}
      </div>

      {/* 시즌 생성 폼 */}
      {canManage && !active && creating && (
        <div className="rounded-aura border card-aura p-3 space-y-2">
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
        <div className="rounded-card border border-accent-400/30 bg-accent-300/[0.04] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-accent-200">{active.name}</p>
              <p className="text-2xs text-ink-muted">{active.startsOn} ~ {active.endsOn} · <b className="text-ink-secondary">D-{daysLeft(active.endsOn)}</b></p>
            </div>
            {canManage && <button type="button" onClick={doEnd} disabled={busy} className="btn-ghost shrink-0 px-2.5 py-1 text-2xs text-amber-300 disabled:opacity-50">시즌 종료</button>}
          </div>
          {standings.length === 0 ? (
            <p className="py-4 text-center text-2xs text-ink-muted">아직 시즌 순위 기록이 없습니다. 순위가 등록되면 집계됩니다.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">{standings.slice(0, 20).map((s) => <Row key={s.rank} s={s} />)}</ul>
          )}
        </div>
      ) : !creating && (
        <p className="rounded-aura border card-aura py-4 text-center text-2xs text-ink-muted">진행 중인 시즌이 없습니다.{canManage ? " '시즌 시작'으로 분기 리그를 열어보세요." : ''}</p>
      )}

      {/* 🏆 역대 챔피언(명예의 전당) */}
      {hof.length > 0 && (
        <div className="rounded-card border border-accent-400/30 bg-accent-300/[0.05] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gold-300"><Icon name="trophy" size={15} className="shrink-0" />역대 챔피언</p>
          <ul className="space-y-1.5">
            {hof.map((h) => (
              <li key={h.seasonId} className="flex items-center gap-2.5 rounded-input border border-accent-400/20 bg-surface-low px-3 py-2">
                <Icon name="crown" size={17} className="shrink-0 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-primary">{h.nickname}{h.realName && showsRealName(h.nickname) ? <span className="text-2xs font-normal text-ink-muted"> ({h.realName})</span> : null}</p>
                  <p className="truncate text-2xs text-ink-muted">{h.seasonName} · {h.endsOn}</p>
                </div>
                <span className="shrink-0 text-xs font-bold tabular-nums text-accent-200">{h.points}점</span>
                <button type="button" title="챔피언 카드 공유"
                  onClick={async () => {
                    const d = { nickname: h.nickname, seasonName: h.seasonName, venueName, points: h.points };
                    try {
                      if (kakaoConfigured() && await shareChampionCardKakao(d)) { toast.show('카카오톡으로 공유했어요', 'success'); return; }
                      const r = await shareChampionCard(d);
                      toast.show(r === 'shared' ? '챔피언 카드를 공유했어요' : '챔피언 카드를 저장했어요', 'success');
                    } catch { toast.show('카드 생성 실패', 'error'); }
                  }}
                  aria-label="챔피언 카드 공유" className="btn-ghost grid shrink-0 place-items-center px-1.5 py-1"><Icon name="share" size={14} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 지난 시즌 아카이브 */}
      {archived.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-2xs font-bold text-ink-muted"><Icon name="archive" size={12} className="shrink-0" />지난 시즌</p>
          <ul className="space-y-1.5">
            {archived.map((s) => (
              <li key={s.id} className="rounded-aura border card-aura">
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
