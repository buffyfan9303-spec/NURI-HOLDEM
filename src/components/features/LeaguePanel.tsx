// 연합 리그 — 여러 매장이 공동 보드 운영. 생성 → 매장 초대(상대 매장에 알림) → 수락/거절 → 포인트 → 통합 순위.
import { useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import Icon from '../atoms/Icon';
import { SkeletonList } from '../atoms/Skeleton';
import { getAllVenues, type Venue } from '../../api/community';
import {
  getMyLeagues, createLeague, deleteLeague, inviteLeagueMember, respondLeagueInvite, removeLeagueMember,
  getLeagueEntries, addLeagueEntry, deleteLeagueEntry, leagueStandings,
  type League, type LeagueMember, type LeagueEntry, type LeagueMemberStatus,
} from '../../api/leagues';

const STATUS_BADGE: Record<LeagueMemberStatus, { label: string; cls: string }> = {
  pending:  { label: '대기', cls: 'bg-amber-500/15 text-amber-400' },
  accepted: { label: '수락', cls: 'bg-emerald-500/15 text-emerald-400' },
  declined: { label: '거절', cls: 'bg-danger/15 text-danger-light' },
};

export default function LeaguePanel({ venueId, canConfigure }: { venueId: string; canConfigure: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getMyLeagues>>>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => {
    getMyLeagues(venueId).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(() => { setLoading(true); reload(); /* eslint-disable-next-line */ }, [venueId]);

  const create = async () => {
    if (!name.trim()) return toast.show('리그 이름을 입력하세요', 'error');
    setBusy(true);
    try { await createLeague(venueId, name); setName(''); toast.show('연합 리그를 만들었습니다 — 매장을 초대해 보세요', 'success'); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '생성 실패', 'error'); }
    finally { setBusy(false); }
  };

  const invites = rows.filter((r) => r.myStatus === 'pending');
  const active = rows.filter((r) => r.myStatus !== 'pending' && r.myStatus !== 'declined');

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink-primary">연합 리그</h2>
        <p className="mt-0.5 text-2xs text-ink-muted">여러 매장이 함께 운영하는 공동 랭킹입니다. 초대 → 상대 매장 수락 → 각 매장이 포인트를 입력하면 통합 순위가 만들어집니다.</p>
      </div>

      {/* 받은 초대 */}
      {invites.length > 0 && (
        <section className="rounded-card border border-gold-400/50 bg-gold-300/[0.07] p-3 space-y-2">
          <h3 className="text-sm font-bold text-gold-300">받은 초대 {invites.length}건</h3>
          {invites.map(({ league, members }) => {
            const mine = members.find((m) => m.venueId === venueId);
            return (
              <div key={league.id} className="flex flex-wrap items-center gap-2 rounded-input border border-border-subtle bg-surface-base/60 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-primary">{league.name}</p>
                  <p className="text-[10px] text-ink-muted">주최: {league.ownerVenueName ?? '매장'} · 시즌 {league.seasonStart}~</p>
                </div>
                <button type="button" disabled={!canConfigure} onClick={async () => { if (!mine) return; try { await respondLeagueInvite(mine.id, true); toast.show('초대를 수락했습니다 🎉', 'success'); reload(); } catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); } }}
                  className="btn-primary shrink-0 px-3 py-1.5 text-xs disabled:opacity-50">수락</button>
                <button type="button" disabled={!canConfigure} onClick={async () => { if (!mine) return; try { await respondLeagueInvite(mine.id, false); toast.show('초대를 거절했습니다', 'info'); reload(); } catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); } }}
                  className="shrink-0 rounded-input border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger-light hover:bg-danger/10 disabled:opacity-50">거절</button>
              </div>
            );
          })}
          {!canConfigure && <p className="text-[10px] text-ink-muted">수락/거절은 업주만 가능합니다.</p>}
        </section>
      )}

      {/* 새 리그 만들기 */}
      {canConfigure && (
        <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-1.5">
          <h3 className="text-sm font-bold text-ink-primary">새 연합 리그 만들기</h3>
          <div className="flex gap-1.5">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="리그 이름 (예: 경기북부 챔피언십)" className="input min-w-0 flex-1 text-sm" />
            <button type="button" disabled={busy} onClick={create} className="btn-primary shrink-0 px-3 text-xs disabled:opacity-50">+ 만들기</button>
          </div>
        </section>
      )}

      {loading ? <SkeletonList rows={3} rowClassName="h-24" /> : active.length === 0 && invites.length === 0 ? (
        <p className="py-8 text-center text-2xs text-ink-muted">아직 참여 중인 연합 리그가 없습니다 — 리그를 만들어 이웃 매장을 초대해 보세요.</p>
      ) : (
        active.map(({ league, myStatus, members }) => (
          <LeagueCard key={league.id} league={league} isOwner={myStatus === 'owner'} members={members}
            venueId={venueId} canConfigure={canConfigure} onChanged={reload} />
        ))
      )}
    </div>
  );
}

function LeagueCard({ league, isOwner, members, venueId, canConfigure, onChanged }: {
  league: League; isOwner: boolean; members: LeagueMember[]; venueId: string; canConfigure: boolean; onChanged: () => void;
}) {
  const toast = useToast();
  const [entries, setEntries] = useState<LeagueEntry[]>([]);
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [inviteId, setInviteId] = useState('');
  const [pName, setPName] = useState('');
  const [pPts, setPPts] = useState('');
  const [busy, setBusy] = useState(false);
  const [openLog, setOpenLog] = useState(false);

  const reloadEntries = () => { getLeagueEntries(league.id).then(setEntries).catch(() => {}); };
  useEffect(reloadEntries, [league.id]);
  useEffect(() => { if (isOwner) getAllVenues().then(setAllVenues).catch(() => {}); }, [isOwner]);

  const standings = leagueStandings(entries, league.seasonStart);
  const memberVenueIds = new Set([league.ownerVenueId, ...members.map((m) => m.venueId)]);
  const inviteCandidates = allVenues.filter((v) => !memberVenueIds.has(v.id));

  const invite = async () => {
    if (!inviteId) return;
    setBusy(true);
    try { await inviteLeagueMember(league.id, inviteId); setInviteId(''); toast.show('초대를 보냈습니다 — 상대 매장에 알림이 전송됐어요', 'success'); onChanged(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '초대 실패', 'error'); }
    finally { setBusy(false); }
  };

  const addPoints = async () => {
    const p = Math.round(Number(pPts));
    if (!pName.trim() || !p) return toast.show('이름과 포인트를 입력하세요', 'error');
    setBusy(true);
    try { await addLeagueEntry(league.id, venueId, { name: pName, points: p }); setPName(''); setPPts(''); toast.show('리그 포인트를 기록했습니다', 'success'); reloadEntries(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '기록 실패 — 멤버 수락 상태와 장부 권한을 확인하세요', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-ink-primary">🏆 {league.name}</p>
          <p className="text-[10px] text-ink-muted">주최 {league.ownerVenueName ?? '매장'} · 시즌 {league.seasonStart}~ {isOwner && <span className="text-gold-300 font-bold">· 내가 리그장</span>}</p>
        </div>
        {isOwner && canConfigure && (
          <button type="button" onClick={async () => { try { await deleteLeague(league.id); toast.show('리그를 해산했습니다', 'info'); onChanged(); } catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); } }}
            aria-label="리그 해산" className="shrink-0 text-ink-muted hover:text-danger-light"><Icon name="close" size={14} /></button>
        )}
      </div>

      {/* 멤버 매장 — 수락/대기/거절 전부 표시 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-badge bg-gold-300/15 px-2 py-0.5 text-[10px] font-bold text-gold-300">{league.ownerVenueName ?? '주최'} (리그장)</span>
        {members.map((m) => (
          <span key={m.id} className={['inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-[10px] font-bold', STATUS_BADGE[m.status].cls].join(' ')}>
            {m.venueName ?? '매장'} · {STATUS_BADGE[m.status].label}
            {isOwner && canConfigure && m.status !== 'accepted' && (
              <button type="button" onClick={async () => { await removeLeagueMember(m.id).catch(() => {}); onChanged(); }} aria-label="초대 취소" className="opacity-70 hover:opacity-100">×</button>
            )}
          </span>
        ))}
      </div>

      {/* 리그장: 매장 초대 */}
      {isOwner && canConfigure && (
        <div className="flex gap-1.5">
          <select value={inviteId} onChange={(e) => setInviteId(e.target.value)} className="input min-w-0 flex-1 text-sm">
            <option value="">초대할 매장 선택…</option>
            {inviteCandidates.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.region}</option>)}
          </select>
          <button type="button" disabled={busy || !inviteId} onClick={invite} className="btn-primary shrink-0 px-3 text-xs disabled:opacity-50">초대</button>
        </div>
      )}

      {/* 통합 스탠딩 */}
      <div className="rounded-input border border-gold-400/25 bg-gold-300/[0.04] p-2.5">
        <p className="mb-1.5 text-2xs font-bold text-gold-300">통합 순위 (TOP 10 · 시즌 {league.seasonStart}~)</p>
        {standings.length === 0 ? (
          <p className="py-2 text-center text-2xs text-ink-muted">아직 기록이 없습니다 — 아래에서 포인트를 입력하면 모든 멤버 매장 합산 순위가 만들어져요.</p>
        ) : (
          <ol className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {standings.slice(0, 10).map((s, i) => (
              <li key={s.name} className="flex items-baseline gap-2 text-xs">
                <span className={['w-4 text-right font-bold tabular-nums', i < 3 ? 'text-gold-300' : 'text-ink-muted'].join(' ')}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">{s.name}</span>
                <span className="shrink-0 text-[10px] text-ink-muted">{s.venues}개 매장</span>
                <span className="font-bold tabular-nums text-gold-300">{s.points.toLocaleString()}점</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* 우리 매장 포인트 입력 */}
      <div className="flex flex-wrap gap-1.5">
        <input value={pName} onChange={(e) => setPName(e.target.value)} maxLength={30} placeholder="이름(닉네임)" className="input min-w-0 flex-1 text-sm" />
        <input value={pPts} onChange={(e) => setPPts(e.target.value)} type="number" inputMode="numeric" placeholder="포인트" className="input w-24 text-sm tabular-nums" />
        <button type="button" disabled={busy} onClick={addPoints} className="btn-primary shrink-0 px-3 text-xs disabled:opacity-50">기록</button>
      </div>

      {/* 입력 내역(최근) */}
      <button type="button" onClick={() => setOpenLog((v) => !v)} className="text-2xs font-semibold text-gold-300 hover:text-gold-200">
        {openLog ? '내역 접기 ▲' : `전체 입력 내역 보기 (${entries.length}) ▼`}
      </button>
      {openLog && (
        <ul className="max-h-52 space-y-1 overflow-y-auto pr-1">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-high px-2.5 py-1.5">
              <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">{e.entryDate.slice(5)}</span>
              <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-[9px] font-bold text-ink-secondary">{e.venueName ?? '매장'}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{e.name}</span>
              <span className={['shrink-0 text-xs font-bold tabular-nums', e.points >= 0 ? 'text-gold-300' : 'text-danger-light'].join(' ')}>{e.points >= 0 ? '+' : ''}{e.points}</span>
              {(e.venueId === venueId || isOwner) && (
                <button type="button" onClick={async () => { await deleteLeagueEntry(e.id).catch(() => {}); reloadEntries(); }} aria-label="삭제" className="shrink-0 text-ink-muted hover:text-danger-light"><Icon name="close" size={12} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
