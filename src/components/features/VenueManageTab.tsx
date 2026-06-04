import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import type { User, VenueInvite } from '../../api/auth';
import { getMyVenueStaff, getMyVenueInvites, inviteStaffByEmail, cancelStaffInvite, removeStaff, setStaffTitle } from '../../api/auth';
import { getVenueRankings, saveVenueRankings, maskRealName } from '../../api/rankings';
import { canAccessLedger, canManagePos, getLedgerAccessUserIds, grantLedgerAccess, revokeLedgerAccess } from '../../api/ledger';
import VenueVerificationCard from './VenueVerificationCard';
import NuriPosLedger from './NuriPosLedger';
import LedgerStatsPanel, { PosSettingsPanel } from './LedgerStatsPanel';

type Section = 'ledger' | 'stats' | 'ranking' | 'staff' | 'settings';

/** 업주/직원 전용 "매장 관리" 탭 — 장부(POS) · 통계 · 순위 입력 · (업주) 직원 관리 */
export default function VenueManageTab({ onAddPoster }: { onAddPoster?: () => void }) {
  const { user } = useAuth();
  const isOwner = user?.role === 'venue_owner';
  const venueId = user?.venueId;
  const [section, setSection] = useState<Section | null>(null);
  const [ledgerOk, setLedgerOk] = useState(false); // 장부 접근(업주/운영자/권한직원)
  const [manageOk, setManageOk] = useState(false); // 통계·설정(업주/운영자)
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [rankingDraft, setRankingDraft] = useState<{ date: string; names: string[] } | null>(null);

  // 권한 확인 후 첫 화면 결정 — 장부 우선(없으면 통계 → 순위)
  useEffect(() => {
    if (!venueId) return;
    let alive = true;
    Promise.all([canAccessLedger(venueId), canManagePos(venueId)])
      .then(([l, m]) => {
        if (!alive) return;
        setLedgerOk(l); setManageOk(m);
        setSection(l ? 'ledger' : (m ? 'stats' : null));
      })
      .catch(() => { if (alive) setSection(null); })
      .finally(() => { if (alive) setPermsLoaded(true); });
    return () => { alive = false; };
  }, [venueId]);

  // 사용 가능한 섹션(권한): 장부·순위 = 업주 또는 승인된(장부권한) 직원 / 통계·직원관리 = 업주만
  const available: { id: Section; label: string }[] = [];
  if (ledgerOk) available.push({ id: 'ledger', label: '장부' });
  if (manageOk) available.push({ id: 'stats',  label: '통계' });
  if (ledgerOk) available.push({ id: 'ranking', label: '순위 입력' });
  if (isOwner)  available.push({ id: 'staff', label: '직원 관리' });
  if (isOwner)  available.push({ id: 'settings', label: 'POS 설정' });

  if (!user || !venueId) {
    return (
      <div className="py-16 text-center text-sm text-ink-muted">
        소속된 매장이 없습니다. 매장 승인 또는 직원 승인 후 이용할 수 있습니다.
      </div>
    );
  }
  if (!permsLoaded) {
    return <p className="py-16 text-center text-sm text-ink-muted">불러오는 중…</p>;
  }
  if (section === null) {
    return <p className="py-16 text-center text-sm text-ink-muted">이 매장에서 사용 가능한 메뉴가 없습니다.<br />업주에게 장부 권한을 요청하세요.</p>;
  }

  return (
    <div className="space-y-3">
      {isOwner && onAddPoster && (
        <button type="button" onClick={onAddPoster}
          className="btn-primary w-full flex items-center justify-center gap-1.5 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          포스터 추가
        </button>
      )}
      {isOwner && <VenueVerificationCard />}
      {available.length > 1 && (
        <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5 overflow-x-auto scrollbar-none">
          {available.map((a) => (
            <TabBtn key={a.id} active={section === a.id} onClick={() => setSection(a.id)}>{a.label}</TabBtn>
          ))}
        </div>
      )}

      {section === 'ledger'  && ledgerOk && (
        <NuriPosLedger venueId={venueId} canManage={manageOk}
          onMakeRankingDraft={(d, names) => { setRankingDraft({ date: d, names }); setSection('ranking'); }} />
      )}
      {section === 'stats'    && manageOk && <LedgerStatsPanel venueId={venueId} />}
      {section === 'ranking'  && <RankingEditor venueId={venueId} canEdit={user.approved === true} draft={rankingDraft} />}
      {section === 'staff'    && isOwner && <StaffManager venueId={venueId} />}
      {section === 'settings' && isOwner && <PosSettingsPanel venueId={venueId} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={['flex-1 py-2 text-xs font-semibold rounded-[6px] transition-all focus:outline-none',
        active ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
      {children}
    </button>
  );
}

// ── 일일 순위 입력 ────────────────────────────────────────────────────────────
interface Row { nickname: string; realName: string; prize: string; }
const emptyRow = (): Row => ({ nickname: '', realName: '', prize: '' });

function RankingEditor({ venueId, canEdit, draft }: { venueId: string; canEdit: boolean; draft?: { date: string; names: string[] } | null }) {
  const toast = useToast();
  const today = new Date().toLocaleDateString('en-CA'); // 로컬 날짜 — UTC 자정 넘김 방지
  const [date, setDate] = useState(draft?.date ?? today);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 장부에서 넘어온 초안: 해당 날짜로 이동
  useEffect(() => { if (draft?.date) setDate(draft.date); }, [draft]);

  useEffect(() => {
    setLoading(true);
    getVenueRankings(venueId, date)
      .then(({ entries }) => {
        if (entries.length) {
          setRows(entries.map((e) => ({ nickname: e.nickname, realName: e.realName, prize: e.prize ?? '' })));
        } else if (draft && draft.date === date && draft.names.length) {
          // 정산 마감 참가자 명단을 닉네임으로 미리 채움(순서는 업주가 정리)
          setRows(draft.names.map((n) => ({ nickname: n, realName: '', prize: '' })));
        } else {
          setRows([emptyRow()]);
        }
      })
      .catch(() => setRows([emptyRow()]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, date]);

  const update = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  const save = async () => {
    const clean = rows.filter((r) => r.nickname.trim() || r.realName.trim() || r.prize.trim());
    if (clean.length === 0) return toast.show('순위를 한 명 이상 입력해 주세요', 'error');
    if (clean.some((r) => !r.nickname.trim()))
      return toast.show('각 줄에 닉네임을 입력해 주세요 (실명·프라이즈는 선택)', 'error');
    setSaving(true);
    try {
      await saveVenueRankings(venueId, date, clean);
      toast.show('순위 저장 완료 — 닉네임이 일치하는 회원에게 포인트가 반영됩니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="py-16 text-center text-sm text-ink-muted">
        매장(직원) 승인 완료 후 순위를 입력할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 날짜 */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value || today)}
          className="input flex-1 text-sm"
        />
        {date !== today && (
          <button type="button" onClick={() => setDate(today)} className="btn-ghost text-xs px-3 shrink-0">오늘</button>
        )}
      </div>

      <p className="text-2xs text-ink-muted">
        <span className="text-gold-300 font-semibold">닉네임은 필수</span>, 실명·프라이즈는 선택입니다. 프라이즈는 <span className="text-gold-300 font-semibold">만원 단위 숫자</span>로 입력하세요 — 순위는 머니인 점수, 프라이즈는 누적 금액으로 매장 커뮤니티 순위에 자동 반영됩니다. 실명을 넣으면 손님에게는 <span className="text-gold-300 font-semibold">도토리(나*리)</span> 처럼 가려서 표시됩니다.
      </p>

      {loading ? (
        <p className="text-center py-8 text-2xs text-ink-muted">불러오는 중...</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-center text-sm font-bold text-gold-300 tabular-nums">{i + 1}</span>
              <input
                type="text" value={row.nickname} maxLength={30}
                onChange={(e) => update(i, 'nickname', e.target.value)}
                placeholder="닉네임 *"
                className="input flex-[1.2] min-w-0 text-sm py-2"
              />
              <input
                type="text" value={row.realName} maxLength={20}
                onChange={(e) => update(i, 'realName', e.target.value)}
                placeholder="실명(선택)"
                className="input flex-1 min-w-0 text-sm py-2"
              />
              <input
                type="text" inputMode="numeric" value={row.prize} maxLength={12}
                onChange={(e) => update(i, 'prize', e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter' && i === rows.length - 1) addRow(); }}
                placeholder="프라이즈(만원)"
                className="input flex-1 min-w-0 text-sm py-2"
              />
              <button
                type="button" onClick={() => removeRow(i)} aria-label="줄 삭제"
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-input text-ink-muted hover:text-danger-light transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={addRow}
        className="w-full py-2 rounded-input border border-dashed border-border-default text-xs font-semibold text-ink-secondary hover:text-ink-primary hover:border-gold-400/50 transition-colors">
        + 줄 추가
      </button>

      {/* 미리보기 */}
      {rows.some((r) => r.nickname.trim()) && (
        <div className="rounded-input bg-surface-high border border-border-subtle p-3">
          <p className="text-2xs font-semibold text-ink-muted mb-1.5">미리보기 (손님 화면)</p>
          <div className="flex flex-wrap gap-1.5">
            {rows.filter((r) => r.nickname.trim()).map((r, i) => (
              <span key={i} className="text-2xs px-2 py-0.5 rounded-badge bg-surface-float text-ink-primary">
                {i + 1}. {r.nickname.trim()}{r.realName.trim() ? `(${maskRealName(r.realName)})` : ''}{r.prize.trim() ? ` · ${r.prize.trim()}만` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <button type="button" onClick={save} disabled={saving} className="btn-primary w-full disabled:opacity-60">
        {saving ? '저장 중…' : `${date === today ? '오늘' : date} 순위 저장`}
      </button>
    </div>
  );
}

// ── 직원 관리(업주) ───────────────────────────────────────────────────────────
const TITLE_SUGGEST = ['매니저', '플로어', '딜러', '칩러너', '매장장', '직원'];

function StaffManager({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [staff, setStaff] = useState<User[]>([]);
  const [invites, setInvites] = useState<VenueInvite[]>([]);
  const [access, setAccess] = useState<string[]>([]); // 장부·순위 권한 보유 직원 id
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    Promise.all([getMyVenueStaff(), getMyVenueInvites(), getLedgerAccessUserIds(venueId)])
      .then(([s, i, a]) => { setStaff(s); setInvites(i); setAccess(a); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tick, venueId]);
  const reload = () => setTick((t) => t + 1);

  const saveTitle = async (id: string, title: string) => {
    const prev = staff.find((s) => s.id === id)?.staffTitle ?? '';
    if (title.trim() === prev.trim()) return;
    setStaff((arr) => arr.map((s) => (s.id === id ? { ...s, staffTitle: title.trim() || undefined } : s)));
    try { await setStaffTitle(id, title.trim()); }
    catch (e) { toast.show(e instanceof Error ? e.message : '직책 저장 실패', 'error'); reload(); }
  };
  const toggleAccess = async (id: string) => {
    const has = access.includes(id);
    setAccess((a) => has ? a.filter((x) => x !== id) : [...a, id]);
    try { if (has) await revokeLedgerAccess(venueId, id); else await grantLedgerAccess(venueId, id); }
    catch (e) { toast.show(e instanceof Error ? e.message : '권한 변경 실패', 'error'); reload(); }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setInviting(true);
    try {
      await inviteStaffByEmail(addr);
      toast.show('초대를 보냈습니다', 'success');
      setEmail('');
      reload();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '초대에 실패했습니다', 'error');
    } finally {
      setInviting(false);
    }
  };

  const cancel = async (id: string) => {
    try { await cancelStaffInvite(id); toast.show('초대를 취소했습니다', 'info'); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패했습니다', 'error'); }
  };
  const remove = async (s: User) => {
    if (!confirm(`${s.name} 구성원을 제거하시겠습니까? (일반 회원으로 전환)`)) return;
    try { await removeStaff(s.id); toast.show('구성원을 제거했습니다', 'success'); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패했습니다', 'error'); }
  };

  return (
    <div className="space-y-4">
      {/* 구성원 초대 */}
      <form onSubmit={invite} className="space-y-1.5">
        <label className="block text-xs font-semibold text-ink-secondary">구성원 초대</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="초대할 회원 이메일"
            autoComplete="off"
            className="input flex-1 text-sm"
          />
          <button type="submit" disabled={inviting || !email.trim()} className="btn-primary px-4 shrink-0 disabled:opacity-60">초대</button>
        </div>
        <p className="text-2xs text-ink-muted">초대 대상은 먼저 일반 회원으로 가입돼 있어야 합니다. 가입한 이메일로 초대하면, 상대가 알림에서 수락 시 구성원이 됩니다.</p>
      </form>

      {loading ? (
        <p className="text-center py-6 text-2xs text-ink-muted">불러오는 중...</p>
      ) : (
        <>
          {/* 대기중 초대 */}
          {invites.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-ink-secondary">대기중 초대 ({invites.length})</p>
              <ul className="space-y-1.5">
                {invites.map((iv) => (
                  <li key={iv.id} className="flex items-center gap-2 p-2.5 rounded-input bg-surface-low border border-amber-500/30">
                    <span className="flex-1 min-w-0 truncate">
                      <span className="text-sm text-ink-primary">{iv.name}</span>
                      <span className="text-2xs text-ink-muted"> · {iv.email}</span>
                      <span className="text-2xs text-amber-400"> · 수락 대기</span>
                    </span>
                    <button type="button" onClick={() => cancel(iv.id)} className="text-2xs px-2 py-1 rounded-input text-ink-muted hover:text-danger-light transition-colors">취소</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 구성원 목록 */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-ink-secondary">구성원 ({staff.length})</p>
            <p className="text-[10px] text-ink-muted">직책은 표시용 라벨이고, <span className="text-gold-300 font-semibold">장부·순위 권한</span>은 별도로 켜야 적용됩니다. 권한 받은 직원만 장부 담당자로 지정·운영할 수 있습니다.</p>
            <datalist id="staff-title-suggest">
              {TITLE_SUGGEST.map((t) => <option key={t} value={t} />)}
            </datalist>
            {staff.length === 0 ? (
              <p className="py-6 text-center text-2xs text-ink-muted">아직 구성원이 없습니다. 닉네임으로 초대해 보세요.</p>
            ) : (
              <ul className="space-y-2">
                {staff.map((s) => {
                  const hasAccess = access.includes(s.id);
                  return (
                  <li key={s.id} className="p-3 rounded-card bg-surface-low border border-border-subtle space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: s.avatarColor ?? '#5A6175' }}>
                        {s.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-ink-primary truncate">
                          {s.name}{s.staffTitle ? <span className="ml-1.5 text-2xs font-bold text-gold-300">· {s.staffTitle}</span> : null}
                        </span>
                        <p className="text-2xs text-ink-muted truncate">{s.nickname ? `@${s.nickname}` : s.email}</p>
                      </div>
                      <button type="button" onClick={() => remove(s)} className="text-2xs px-2 py-1 rounded-input text-ink-muted hover:text-danger-light transition-colors">제거</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text" defaultValue={s.staffTitle ?? ''} list="staff-title-suggest" maxLength={20}
                        onBlur={(e) => saveTitle(s.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        placeholder="직책 (매니저·딜러 등)"
                        className="input flex-1 min-w-0 text-xs py-1.5"
                      />
                      <button type="button" onClick={() => toggleAccess(s.id)}
                        className={['shrink-0 text-2xs font-bold px-2.5 py-1.5 rounded-badge border transition-colors',
                          hasAccess ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'bg-surface-float text-ink-muted border-border-default'].join(' ')}>
                        장부·순위 {hasAccess ? '권한 ✓' : '권한 없음'}
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
