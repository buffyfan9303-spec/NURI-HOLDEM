// 연합 대회 파트너 매장 — 게시 → 신청 → 수락/거절 → 서로 연락처. 점수·상금·정산·순위 없음(§10 계층1 #3).
// 카드 문법은 DealerCommunity(구인·지원)를 본떴다. 버튼 라벨은 4~6자 + nowrap(375·320 한 줄).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import Icon from '../atoms/Icon';
import { SkeletonList } from '../atoms/Skeleton';
import {
  getOpenMatchPosts, getMyMatchPosts, getMyMatchResponses, getMatchResponses,
  createMatchPost, closeMatchPost, deleteMatchPost, respondMatchPost, decideMatchResponse, withdrawMatchResponse,
  type MatchPost, type MatchResponse, type MyMatchResponse, type MatchResponseStatus,
} from '../../api/venueMatch';

const RESP_BADGE: Record<MatchResponseStatus, { label: string; cls: string }> = {
  pending:  { label: '대기', cls: 'bg-amber-500/15 text-amber-400' },
  accepted: { label: '수락', cls: 'bg-emerald-500/15 text-emerald-400' },
  declined: { label: '거절', cls: 'bg-danger/15 text-danger-light' },
};
const BTN = 'shrink-0 whitespace-nowrap rounded-input border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50';
const BTN_OK = `${BTN} border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10`;
const BTN_NO = `${BTN} border-danger/40 text-danger-light hover:bg-danger/10`;
const BTN_MUTE = `${BTN} border-border-default text-ink-secondary hover:bg-surface-high`;
const dateLabel = (d: string | null) => (d ? d.slice(5).replace('-', '/') : '날짜 미정');
/** 파트너 모집 조건 — **한 칸 자유 문장 대신 항목별로** 받는다(오너 2026-09-18).
 *  순서가 곧 상대 화면에 보이는 순서다. 항목을 더하면 여기만 고치면 된다. */
const MATCH_FIELDS = [
  { key: 'buyIn', label: '참가비',  ph: '예) 10만원 / 5만 리바인' },
  { key: 'seats', label: '좌석',    ph: '예) 9테이블 81석' },
  { key: 'format', label: '형식',   ph: '예) MTT · 딥스택 · PKO' },
  { key: 'region', label: '지역',   ph: '예) 서울 강남 / 수도권' },
] as const;
type CondKey = (typeof MATCH_FIELDS)[number]['key'];
const EMPTY_COND: Record<CondKey, string> = { buyIn: '', seats: '', format: '', region: '' };
const msgOf = (e: unknown, fb: string) => (e instanceof Error ? e.message : fb);

function VenueChip({ name, region }: { name: string; region?: string }) {
  return <span className="min-w-0 truncate text-sm font-bold text-ink-primary">{name}{region && <span className="ml-1 text-2xs font-semibold text-ink-muted">{region}</span>}</span>;
}
function PhoneButton({ phone }: { phone?: string }) {
  return phone
    ? <a href={`tel:${phone}`} className={`${BTN_OK} inline-flex items-center gap-1`}><Icon name="hand" size={12} className="shrink-0" />전화하기</a>
    : <span className="shrink-0 whitespace-nowrap text-2xs text-ink-muted">전화 미등록</span>;
}

export default function VenueMatchPanel({ venueId, canConfigure }: { venueId: string; canConfigure: boolean }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [openPosts, setOpenPosts] = useState<MatchPost[]>([]);
  const [myPosts, setMyPosts] = useState<MatchPost[]>([]);
  const [myResponses, setMyResponses] = useState<MyMatchResponse[]>([]);
  const [received, setReceived] = useState<Record<string, MatchResponse[]>>({});
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [cond, setCond] = useState<Record<CondKey, string>>(EMPTY_COND);
  const [busy, setBusy] = useState(false);
  const [applyId, setApplyId] = useState<string | null>(null);
  const [applyMsg, setApplyMsg] = useState('');

  const reload = useCallback(async () => {
    try {
      const [open, mine, sent] = await Promise.all([getOpenMatchPosts(), getMyMatchPosts(venueId), getMyMatchResponses(venueId)]);
      const recv = await Promise.all(mine.map((p) => getMatchResponses(p.id).then((r) => [p.id, r] as const)));
      setOpenPosts(open); setMyPosts(mine); setMyResponses(sent); setReceived(Object.fromEntries(recv)); setErr(false);
    } catch { setErr(true); }
    finally { setLoading(false); }
  }, [venueId]);
  useEffect(() => { setLoading(true); reload(); }, [reload]);

  const run = async (fn: () => Promise<void>, ok: string, fb: string) => {
    setBusy(true);
    try { await fn(); toast.show(ok, 'success'); await reload(); }
    catch (e) { toast.show(msgOf(e, fb), 'error'); }
    finally { setBusy(false); }
  };

  /** 항목 입력 → 서버로 보낼 한 칸(note) 조립.
   *  ⚠ 빈 항목은 줄 자체를 만들지 않는다 — '참가비: ' 같은 빈 라벨이 상대 화면에 남으면
   *    '적었는데 안 보인다' 로 읽힌다. 500자는 DB check 제약(1~500)이라 여기서 잘라 보낸다. */
  const composedNote = useMemo(() => {
    const lines = MATCH_FIELDS
      .map((f) => [f.label, cond[f.key].trim()] as const)
      .filter(([, v]) => v)
      .map(([label, v]) => `ㆍ${label}: ${v}`);
    const extra = note.trim();
    if (extra) lines.push(extra);
    return lines.join('\n').slice(0, 500);
  }, [cond, note]);

  const others = openPosts.filter((p) => p.venue.id !== venueId);
  const sentByPost = new Map(myResponses.map((r) => [r.postId, r]));

  if (loading) return <SkeletonList rows={3} rowClassName="h-24" />;
  if (err) return (
    <div className="flex items-center justify-between gap-2 rounded-input border border-danger/40 bg-danger/5 px-3 py-2.5 text-xs text-danger-light">
      <span>불러오지 못했습니다</span>
      <button type="button" onClick={() => { setLoading(true); reload(); }} className={BTN_MUTE}>다시 시도</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {canConfigure && (
        <section className="rounded-aura border card-aura p-3 space-y-2">
          <h3 className="text-sm font-bold text-ink-primary">함께 열 매장 찾기</h3>
          {/* 🔴 2026-09-18 오너: "조건- 이러면서 이걸 적게 되어 있는데 이거 전체 삭제 한개한개 따로 적게 해줘야해".
              종전엔 참가비·좌석·형식·지역을 **한 칸에 자유 문장**으로 적게 했다. 업주마다 적는 순서와
              단위가 달라 상대 매장이 비교를 못 했다.
            ⚠ 저장은 여전히 `venue_match_posts.note`(text 1~500) 한 칸이다 — 컬럼을 쪼개려면
              마이그레이션이 필요하고 라이브 DB 변경은 오너 승인 사항이라, 지금은 **입력만** 항목별로 받고
              서버로 보낼 때 'ㆍ참가비: …' 줄로 조립한다. 읽는 쪽(공개 게시판·내 게시)은 whitespace-pre-wrap
              이라 줄바꿈이 그대로 보인다.
            ⚠ 이 방식의 한계는 숨기지 않는다: 항목별 **검색·정렬·집계는 안 된다**(문자열이라서).
              그게 필요해지면 컬럼 분리 마이그레이션이 정답이다. */}
          <div className="grid gap-1.5 sm:grid-cols-2">
            <label className="text-2xs font-semibold text-ink-secondary">
              대회 날짜
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input mt-0.5 w-full text-sm" />
            </label>
            {MATCH_FIELDS.map((f) => (
              <label key={f.key} className="text-2xs font-semibold text-ink-secondary">
                {f.label}
                <input value={cond[f.key]} onChange={(e) => setCond((c) => ({ ...c, [f.key]: e.target.value }))}
                  maxLength={80} placeholder={f.ph} className="input mt-0.5 w-full text-sm" />
              </label>
            ))}
          </div>
          <label className="block text-2xs font-semibold text-ink-secondary">
            그 밖의 조건 · 선택
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2}
              placeholder="예) 딜러 2명 지원 가능 · 방송 장비 있음" className="input mt-0.5 w-full resize-none text-sm" />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || !composedNote.trim()}
              onClick={() => run(() => createMatchPost(venueId, { eventDate: date || null, note: composedNote })
                .then(() => { setDate(''); setNote(''); setCond(EMPTY_COND); }), '게시했습니다', '게시 실패')}
              className="btn-primary shrink-0 whitespace-nowrap px-3 text-xs disabled:opacity-50">게시하기</button>
            <span className="text-2xs text-ink-muted">
              {composedNote.trim() ? `${composedNote.length}/500자` : '한 항목 이상 적어야 게시할 수 있습니다'}
            </span>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-ink-primary">내 게시 <span className="text-ink-muted">{myPosts.length}</span></h3>
        {myPosts.length === 0 ? (
          <p className="py-4 text-center text-2xs text-ink-muted">게시한 대회가 없습니다</p>
        ) : myPosts.map((p) => {
          const rs = received[p.id] ?? [];
          return (
            <article key={p.id} className="rounded-card border border-border-subtle bg-surface-low p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs font-bold tabular-nums text-ink-secondary">{dateLabel(p.eventDate)}</span>
                <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold', p.status === 'open' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-float text-ink-muted'].join(' ')}>{p.status === 'open' ? '모집 중' : '마감'}</span>
                {canConfigure && (
                  <span className="ml-auto flex gap-1.5">
                    {p.status === 'open' && <button type="button" disabled={busy} onClick={() => run(() => closeMatchPost(p.id), '마감했습니다', '마감 실패')} className={BTN_MUTE}>마감하기</button>}
                    <button type="button" disabled={busy} onClick={() => { if (window.confirm('이 게시를 삭제할까요?')) run(() => deleteMatchPost(p.id), '삭제했습니다', '삭제 실패'); }} className={BTN_NO}>삭제하기</button>
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-ink-primary">{p.note}</p>
              <ul className="space-y-1">
                {rs.length === 0
                  ? <li className="text-2xs text-ink-muted">받은 신청 없음</li>
                  : rs.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-input bg-surface-base/60 px-2.5 py-2">
                      <VenueChip name={r.venue.name} region={r.venue.region} />
                      <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold', RESP_BADGE[r.status].cls].join(' ')}>{RESP_BADGE[r.status].label}</span>
                      {r.message && <span className="w-full text-2xs text-ink-secondary break-words">{r.message}</span>}
                      <span className="ml-auto flex gap-1.5">
                        {r.status === 'pending' && canConfigure && <>
                          <button type="button" disabled={busy} onClick={() => run(() => decideMatchResponse(r.id, true), '수락했습니다', '실패')} className={BTN_OK}>수락하기</button>
                          <button type="button" disabled={busy} onClick={() => run(() => decideMatchResponse(r.id, false), '거절했습니다', '실패')} className={BTN_NO}>거절하기</button>
                        </>}
                        {r.status === 'accepted' && <PhoneButton phone={r.venue.phone} />}
                      </span>
                    </li>
                  ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-ink-primary">다른 매장 게시 <span className="text-ink-muted">{others.length}</span></h3>
        {others.length === 0 ? (
          <p className="py-4 text-center text-2xs text-ink-muted">모집 중인 대회가 없습니다</p>
        ) : others.map((p) => {
          const sent = sentByPost.get(p.id);
          return (
            <article key={p.id} className="rounded-card border border-border-subtle bg-surface-low p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <VenueChip name={p.venue.name} region={p.venue.region} />
                <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs font-bold tabular-nums text-ink-secondary">{dateLabel(p.eventDate)}</span>
                <span className="ml-auto flex gap-1.5">
                  {sent
                    ? <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold', RESP_BADGE[sent.status].cls].join(' ')}>{RESP_BADGE[sent.status].label}</span>
                    : canConfigure && applyId !== p.id && <button type="button" disabled={busy} onClick={() => { setApplyId(p.id); setApplyMsg(''); }} className={BTN_OK}>신청하기</button>}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-ink-primary">{p.note}</p>
              {applyId === p.id && !sent && (
                <div className="flex flex-wrap gap-1.5 border-t border-border-subtle pt-2">
                  {/* 320 에서 버튼 둘과 한 줄에 두면 placeholder 가 잘린다(실측 '한마디(선틱') — 입력은 전체 폭 */}
                  <input value={applyMsg} onChange={(e) => setApplyMsg(e.target.value)} maxLength={300} placeholder="한마디(선택)" className="input w-full text-sm" />
                  <button type="button" disabled={busy} onClick={() => run(() => respondMatchPost(p.id, venueId, applyMsg).then(() => setApplyId(null)), '신청했습니다', '신청 실패')} className="btn-primary shrink-0 whitespace-nowrap px-3 text-xs disabled:opacity-50">신청 보내기</button>
                  <button type="button" onClick={() => setApplyId(null)} className={BTN_MUTE}>입력 닫기</button>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-ink-primary">내 신청 <span className="text-ink-muted">{myResponses.length}</span></h3>
        {myResponses.length === 0 ? (
          <p className="py-4 text-center text-2xs text-ink-muted">보낸 신청이 없습니다</p>
        ) : myResponses.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-card border border-border-subtle bg-surface-low px-3 py-2.5">
            <VenueChip name={r.post.venue.name} region={r.post.venue.region} />
            <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs font-bold tabular-nums text-ink-secondary">{dateLabel(r.post.eventDate)}</span>
            <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold', RESP_BADGE[r.status].cls].join(' ')}>{RESP_BADGE[r.status].label}</span>
            <span className="ml-auto flex gap-1.5">
              {r.status === 'accepted' && <PhoneButton phone={r.post.venue.phone} />}
              {r.status === 'pending' && canConfigure && <button type="button" disabled={busy} onClick={() => run(() => withdrawMatchResponse(r.id), '취소했습니다', '취소 실패')} className={BTN_MUTE}>취소하기</button>}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
