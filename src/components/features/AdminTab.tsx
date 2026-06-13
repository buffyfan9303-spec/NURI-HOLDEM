import { useState, useEffect, useCallback, type ReactNode } from 'react';
import DraggableList from './DraggableList';
import VenueManagement from './VenueManagement';
import ReportQueue from './ReportQueue';
import UserManagementTab from './UserManagementTab';
import SegmentedTabs from '../atoms/SegmentedTabs';
import type { Schedule } from '../../api/schedules';
import type { User } from '../../api/auth';
import type { CommunityPost, Venue, AdminStats, VenueVerificationStatus, VenueStaff } from '../../api/community';
import {
  getAdminStats, adminCreateVenue, adminUpdateVenue, setVenueVerification, deleteVenue,
  getVenueStaff, addVenueStaff, updateVenueStaff, removeVenueStaff,
  getPendingGroups, approveGroup, GROUP_KIND_LABEL, adminListVenueOwnerRequests, adminDecideVenueOwner, type OwnerRequest } from '../../api/community';
import { useToast } from '../atoms/Toast';
import { supabase } from '../../lib/supabase';
import { getAppSetting, setAppSetting, BOOST_CONTACT_EMAIL_KEY, BOOST_CONTACT_PHONE_KEY } from '../../api/settings';
import { getAllCommunityAds, saveCommunityAd, type CommunityAd } from '../../api/ads';
import {
  MISSIONS, adminListCustomMissions, adminSaveCustomMission, adminDeleteCustomMission,
  type CustomMissionRow, type MissionGoalType,
} from '../../lib/loyalty';
import { isVoucherIssueApproved, setVoucherIssueApproval, adminListVoucherCreditRequests, adminDecideVoucherCredit, type AdminCreditRequest } from '../../api/vouchers';
import { useBackClose } from '../../lib/backstack';
import { REGION_CHIPS } from './IntegratedSearchBar';
import SectionHeader from '../atoms/SectionHeader';
import NuriPosLedger from './NuriPosLedger';
import LedgerStatsPanel from './LedgerStatsPanel';
import { adminListRankVerifications, adminDecideRankVerification, signedVerifyUrl, type RankVerification, aiInspectVerification } from '../../api/rankverify';

interface AdminTabProps {
  schedules: Schedule[];
  venues: Venue[];
  users: User[];
  posts: CommunityPost[];
  onApproveSchedule: (id: string) => void;
  onRejectSchedule: (id: string) => void;
  onUpdateUser: (id: string, patch: Partial<User>) => void;
  onDeletePost: (id: string) => void;
  /** 매장 생성 후 목록 새로고침 */
  onReloadVenues?: () => void;
}

type Section = 'pending' | 'reorder' | 'users' | 'venues' | 'reports' | 'errors';
// 노출 순서 하위 항목: 포스터(요강) / 매장
type ReorderTarget = 'posters' | 'venues';

// ── ⚡ 부스트 문의 연락처(운영자) — 업주 '포스터 상단 고정' 카드에 표시될 메일·전화 ──
function BoostContactCard() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    getAppSetting(BOOST_CONTACT_EMAIL_KEY).then((v) => setEmail(v ?? '')).catch(() => {});
    getAppSetting(BOOST_CONTACT_PHONE_KEY).then((v) => setPhone(v ?? '')).catch(() => {});
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      await setAppSetting(BOOST_CONTACT_EMAIL_KEY, email.trim());
      await setAppSetting(BOOST_CONTACT_PHONE_KEY, phone.trim());
      toast.show('부스트 문의 연락처를 저장했습니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="rounded-card border border-gold-400/30 bg-gold-300/[0.05] p-3 space-y-2">
      <p className="text-sm font-bold text-gold-300">⚡ 부스트 문의 연락처</p>
      <p className="text-xs text-ink-muted">업주가 내 매장 → '포스터 상단 고정' 카드에서 보게 될 메일·전화입니다. 비워두면 "준비 중"으로 표시됩니다.</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={80}
          placeholder="문의 이메일 (예: boost@nuriholdem.com)" className="input w-full text-sm" />
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20}
          placeholder="문의 전화번호 (예: 010-1234-5678)" className="input w-full text-sm" />
      </div>
      <button type="button" onClick={save} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
        {saving ? '저장 중…' : '저장'}
      </button>
    </section>
  );
}

// ── 순위 인증 승인(운영자) — 외부 대회 입상 증빙 검토. 승인/거절 시 신분증 즉시 삭제 ──
function VenueOwnerRequestsCard() {
  const toast = useToast();
  const [reqs, setReqs] = useState<OwnerRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => { adminListVenueOwnerRequests().then(setReqs).catch(() => {}); };
  useEffect(load, []);
  const decide = async (r: OwnerRequest, approve: boolean) => {
    setBusy(r.venueId + r.userId);
    try {
      await adminDecideVenueOwner(r.venueId, r.userId, approve);
      toast.show(approve ? `${r.nickname} 사장님을 ${r.venueName} 공동 업주로 승인했습니다` : '요청을 거절했습니다', approve ? 'success' : 'info');
      load();
    } catch (e) { toast.show(e instanceof Error ? e.message : '처리 실패', 'error'); }
    setBusy(null);
  };
  if (reqs.length === 0) return null;
  return (
    <section className="rounded-card border border-gold-400/30 bg-gold-300/[0.04] p-3 space-y-2">
      <h3 className="text-sm font-bold text-gold-300">👔 공동 업주(사장님) 초대 승인 <span className="text-2xs font-normal text-ink-muted">· 승인 시 공동 업주 활성</span></h3>
      <ul className="space-y-1.5">
        {reqs.map((r) => (
          <li key={r.venueId + r.userId} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-low px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink-primary truncate">{r.name ? `${r.name}(${r.nickname})` : r.nickname} <span className="text-gold-300">→ {r.venueName}</span></p>
              <p className="text-2xs text-ink-muted truncate">초대: {r.invitedBy || '업주'} · {new Date(r.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <button type="button" disabled={busy === r.venueId + r.userId} onClick={() => decide(r, true)} className="btn-primary shrink-0 px-3 py-1.5 text-2xs disabled:opacity-50">승인</button>
            <button type="button" disabled={busy === r.venueId + r.userId} onClick={() => decide(r, false)} className="btn-ghost shrink-0 px-2 py-1.5 text-2xs hover:text-danger-light">거절</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VoucherQuotaAdminCard() {
  const toast = useToast();
  const [reqs, setReqs] = useState<AdminCreditRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => { adminListVoucherCreditRequests().then(setReqs).catch(() => {}); };
  useEffect(load, []);
  const decide = async (r: AdminCreditRequest, approve: boolean) => {
    setBusy(r.id);
    try {
      await adminDecideVoucherCredit(r.id, approve);
      toast.show(approve ? `${r.venueName} 한도 ${r.amount.toLocaleString()}개 충전 완료` : '요청을 거절했습니다', approve ? 'success' : 'info');
      load();
    } catch (e) { toast.show(e instanceof Error ? e.message : '처리 실패', 'error'); }
    setBusy(null);
  };
  if (reqs.length === 0) return null;
  return (
    <section className="rounded-card border border-gold-400/30 bg-gold-300/[0.04] p-3 space-y-2">
      <h3 className="text-sm font-bold text-gold-300">🛒 이용권 충전 요청 <span className="text-2xs font-normal text-ink-muted">· 승인 시 즉시 충전</span></h3>
      <ul className="space-y-1.5">
        {reqs.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-low px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink-primary truncate">{r.venueName} <span className="text-gold-300">+{r.amount.toLocaleString()}개</span></p>
              <p className="text-2xs text-ink-muted truncate">{r.requester}{r.note ? ` · ${r.note}` : ''} · {new Date(r.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <button type="button" disabled={busy === r.id} onClick={() => decide(r, true)} className="btn-primary shrink-0 px-3 py-1.5 text-2xs disabled:opacity-50">승인</button>
            <button type="button" disabled={busy === r.id} onClick={() => decide(r, false)} className="btn-ghost shrink-0 px-2 py-1.5 text-2xs hover:text-danger-light">거절</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RankVerifyAdminCard() {
  const toast = useToast();
  const [list, setList] = useState<RankVerification[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // AI 검사 소견(신청 id별) — 참고용, 최종 판단은 운영자
  const [aiNotes, setAiNotes] = useState<Record<string, string>>({});
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const inspect = async (v: RankVerification) => {
    setAiBusy(v.id);
    try {
      const note = await aiInspectVerification(v);
      setAiNotes((m) => ({ ...m, [v.id]: note }));
    } catch (e) { toast.show(e instanceof Error ? e.message : 'AI 검사 실패', 'error'); }
    setAiBusy(null);
  };
  const reload = () => { adminListRankVerifications().then(setList).catch(() => {}); };
  useEffect(() => { reload(); }, []);
  const view = async (path?: string | null) => {
    if (!path) return;
    try { window.open(await signedVerifyUrl(path), '_blank', 'noopener'); }
    catch { toast.show('이미지 열람 실패', 'error'); }
  };
  const decide = async (v: RankVerification, ok: boolean) => {
    setBusy(v.id);
    try { await adminDecideRankVerification(v, ok); toast.show(ok ? '승인 — 국내 순위에 합산됩니다' : '반려했습니다', 'success'); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '처리 실패', 'error'); }
    finally { setBusy(null); }
  };
  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
      <p className="text-sm font-bold text-ink-primary">🏆 순위 인증 승인 <span className="text-xs font-normal text-ink-muted">— 승인/거절 시 신분증 즉시 삭제</span></p>
      {list.length === 0 ? <p className="py-2 text-center text-2xs text-ink-muted">대기 중인 신청이 없습니다.</p> : (
        <ul className="space-y-1.5">
          {list.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-1.5 rounded-input border border-border-subtle bg-surface-high/40 p-2 text-2xs">
              <span className="font-bold text-ink-primary">{v.nickname}</span>
              <span className="min-w-0 flex-1 truncate text-ink-secondary">{v.eventName} · <b className="text-emerald-300 tabular-nums">{(v.amountWon / 10000).toLocaleString()}만</b></span>
              <button type="button" onClick={() => view(v.proofPath)} className="rounded-input border border-border-default px-2 py-1 font-bold text-ink-secondary hover:text-ink-primary">증빙</button>
              <button type="button" disabled={aiBusy === v.id} onClick={() => inspect(v)} className="rounded-input border border-sky-500/40 bg-sky-500/10 px-2 py-1 font-bold text-sky-300 disabled:opacity-50">{aiBusy === v.id ? '검사 중…' : '🤖 AI 검사'}</button>
              <button type="button" onClick={() => view(v.idCardPath)} className="rounded-input border border-border-default px-2 py-1 font-bold text-ink-secondary hover:text-ink-primary">신분증</button>
              <button type="button" disabled={busy === v.id} onClick={() => decide(v, true)} className="btn-primary px-2.5 py-1 text-2xs disabled:opacity-50">승인</button>
              <button type="button" disabled={busy === v.id} onClick={() => decide(v, false)} className="rounded-input border border-danger/40 px-2.5 py-1 font-bold text-danger-light hover:bg-danger/10 disabled:opacity-50">반려</button>
              {aiNotes[v.id] && (
                <div className={['w-full rounded-input border p-2 text-[11px] leading-relaxed whitespace-pre-wrap',
                  aiNotes[v.id].includes('[위조 의심]') ? 'border-danger/40 bg-danger/[0.06] text-danger-light'
                  : aiNotes[v.id].includes('[주의 필요]') ? 'border-amber-500/40 bg-amber-500/[0.06] text-amber-200'
                  : 'border-emerald-500/30 bg-emerald-500/[0.05] text-ink-secondary'].join(' ')}>
                  <b className="text-ink-primary">AI 소견(참고)</b> · 최종 판단은 운영자{'\n'}{aiNotes[v.id]}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 커뮤니티 광고 5칸(운영자) — 게시판 한 줄 리스트 사이 [AD] 행 게재 관리 ───────
function CommunityAdsCard() {
  const toast = useToast();
  const [ads, setAds] = useState<CommunityAd[]>([]);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  useEffect(() => { getAllCommunityAds().then(setAds).catch(() => {}); }, []);
  const patch = (slot: number, p: Partial<CommunityAd>) =>
    setAds((arr) => arr.map((a) => (a.slot === slot ? { ...a, ...p } : a)));
  const save = async (ad: CommunityAd) => {
    setSavingSlot(ad.slot);
    try {
      await saveCommunityAd(ad);
      toast.show(`광고 ${ad.slot}번 칸을 저장했습니다${ad.title.trim() ? '' : ' (비워서 게재 중단)'}`, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장 실패', 'error');
    } finally {
      setSavingSlot(null);
    }
  };
  const today = new Date().toLocaleDateString('en-CA');
  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
      <p className="text-sm font-bold text-ink-primary">📢 커뮤니티 광고 5칸 <span className="text-xs font-normal text-ink-muted">— 게시판 글 4개마다 [AD] 한 줄. 제목 비우면 게재 중단</span></p>
      <ul className="space-y-1.5">
        {ads.map((ad) => {
          const live = !!ad.title.trim() && (!ad.expiresAt || ad.expiresAt >= today);
          return (
            <li key={ad.slot} className="flex flex-wrap items-center gap-1.5 rounded-input border border-border-subtle bg-surface-high/40 p-1.5">
              <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold', live ? 'bg-gold-300 text-ink-inverse' : 'bg-surface-float text-ink-muted'].join(' ')}>{ad.slot}번 {live ? '게재중' : '비어있음'}</span>
              <input value={ad.title} onChange={(e) => patch(ad.slot, { title: e.target.value })} maxLength={40}
                placeholder="광고 문구" className="input min-w-[10rem] flex-1 text-sm" />
              <input value={ad.linkUrl} onChange={(e) => patch(ad.slot, { linkUrl: e.target.value })} maxLength={200}
                placeholder="링크(선택)" className="input w-40 text-sm" />
              <input value={ad.advertiser} onChange={(e) => patch(ad.slot, { advertiser: e.target.value })} maxLength={20}
                placeholder="광고주" className="input w-28 text-sm" />
              <input type="date" value={ad.expiresAt ?? ''} onChange={(e) => patch(ad.slot, { expiresAt: e.target.value || null })}
                className="input w-36 text-sm" title="만료일(지나면 자동 내림)" />
              <button type="button" onClick={() => save(ad)} disabled={savingSlot === ad.slot}
                className="btn-primary px-3 py-1.5 text-xs disabled:opacity-60">저장</button>
              <button type="button" disabled={savingSlot === ad.slot || !live && !ad.title}
                onClick={() => { const empty = { ...ad, title: '', linkUrl: '', advertiser: '', expiresAt: null }; patch(ad.slot, empty); void save(empty); }}
                className="px-2.5 py-1.5 rounded-input border border-danger/40 text-xs font-bold text-danger-light hover:bg-danger/10 transition-colors disabled:opacity-40">삭제</button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ink-muted">가격 운영 예: 3일 10만 / 7일 20만 — 만료일만 맞춰 입력하면 끝나는 날 자동으로 내려갑니다.</p>
    </section>
  );
}

// ── 주간 미션 관리(운영자) — 고정 3종 외 커스텀 미션 추가·수정·중단 ─────────────
const GOAL_TYPE_OPTIONS: { value: MissionGoalType; label: string }[] = [
  { value: 'checkin', label: '매장 체크인 N회' },
  { value: 'post', label: '게시글 N개 쓰기' },
  { value: 'moneyin', label: '머니인 N회' },
];
function MissionsAdminCard() {
  const toast = useToast();
  const [rows, setRows] = useState<CustomMissionRow[]>([]);
  const [busy, setBusy] = useState(false);
  // 새 미션 입력
  const [title, setTitle] = useState('');
  const [goalType, setGoalType] = useState<MissionGoalType>('checkin');
  const [goal, setGoal] = useState(3);
  const [reward, setReward] = useState(30);
  const [editRow, setEditRow] = useState<CustomMissionRow | null>(null);
  const reload = useCallback(() => { adminListCustomMissions().then(setRows).catch(() => {}); }, []);
  useEffect(() => { reload(); }, [reload]);

  const resetForm = () => { setEditRow(null); setTitle(''); setGoalType('checkin'); setGoal(3); setReward(30); };
  const startEdit = (m: CustomMissionRow) => { setEditRow(m); setTitle(m.title); setGoalType(m.goal_type); setGoal(m.goal); setReward(m.reward); };
  const save = async () => {
    if (!title.trim()) { toast.show('미션 이름을 입력해 주세요', 'error'); return; }
    setBusy(true);
    try {
      await adminSaveCustomMission(editRow
        ? { ...editRow, title, goal_type: goalType, goal, reward }
        : { title, goal_type: goalType, goal, reward });
      toast.show(editRow ? '미션을 수정했습니다 — 랭킹 보드에 바로 반영됩니다' : '미션을 추가했습니다 — 랭킹 > 미션 보드에 바로 노출됩니다', 'success');
      resetForm(); reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : (editRow ? '수정 실패' : '추가 실패'), 'error');
    } finally { setBusy(false); }
  };
  const toggle = async (m: CustomMissionRow) => {
    setBusy(true);
    try {
      await adminSaveCustomMission({ ...m, active: !m.active });
      toast.show(m.active ? '미션을 중단했습니다(보상 수령도 차단)' : '미션을 다시 켰습니다', 'success');
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '변경 실패', 'error');
    } finally { setBusy(false); }
  };
  const remove = async (m: CustomMissionRow) => {
    if (!window.confirm(`'${m.title}' 미션을 삭제할까요? (이미 받은 점수는 유지됩니다)`)) return;
    setBusy(true);
    try {
      await adminDeleteCustomMission(m.id);
      toast.show('미션을 삭제했습니다', 'success');
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '삭제 실패', 'error');
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
      <p className="text-sm font-bold text-ink-primary">🎯 주간 미션 관리 <span className="text-xs font-normal text-ink-muted">— 랭킹 &gt; 미션 보드에 노출. 매주 월요일 진행도 리셋</span></p>
      {/* 고정 미션 안내 */}
      <ul className="space-y-1">
        {MISSIONS.map((m) => (
          <li key={m.key} className="flex items-center gap-1.5 rounded-input bg-surface-high/40 px-2 py-1.5 text-xs">
            <span className="rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs font-bold text-ink-muted">기본</span>
            <span className="font-bold text-ink-secondary">{m.title}</span>
            <span className="ml-auto font-bold text-emerald-400">+{m.reward}점</span>
          </li>
        ))}
        {rows.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-1.5 rounded-input border border-border-subtle bg-surface-high/40 px-2 py-1.5 text-xs">
            <span className={['rounded-badge px-1.5 py-0.5 text-2xs font-bold', m.active ? 'bg-gold-300 text-ink-inverse' : 'bg-surface-float text-ink-muted'].join(' ')}>
              {m.active ? '진행중' : '중단'}
            </span>
            <span className="font-bold text-ink-primary">{m.title}</span>
            <span className="text-ink-muted">{GOAL_TYPE_OPTIONS.find((o) => o.value === m.goal_type)?.label.replace('N', String(m.goal))}</span>
            <span className="font-bold text-emerald-400">+{m.reward}점</span>
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => startEdit(m)} disabled={busy} className="btn-ghost px-2 py-1 text-2xs text-gold-300 disabled:opacity-60">수정</button>
              <button type="button" onClick={() => toggle(m)} disabled={busy} className="btn-ghost px-2 py-1 text-2xs disabled:opacity-60">
                {m.active ? '중단' : '재개'}
              </button>
              <button type="button" onClick={() => remove(m)} disabled={busy} className="btn-ghost px-2 py-1 text-2xs text-danger-light disabled:opacity-60">삭제</button>
            </span>
          </li>
        ))}
      </ul>
      {/* 새 미션 추가 */}
      <div className={['flex flex-wrap items-center gap-1.5 rounded-input border border-dashed p-2', editRow ? 'border-gold-400/60 bg-gold-300/[0.05]' : 'border-border-strong'].join(' ')}>
        {editRow && <span className="w-full text-2xs font-bold text-gold-300">✏️ ‘{editRow.title}’ 수정 중 — 저장하면 덮어씁니다</span>}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30}
          placeholder="미션 이름 (예: 이번 주 3회 출석 도전)" className="input min-w-[11rem] flex-1 text-sm" />
        <select value={goalType} onChange={(e) => setGoalType(e.target.value as MissionGoalType)} className="input w-auto text-sm">
          {GOAL_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-ink-muted">목표
          <input type="number" min={1} max={50} value={goal} onChange={(e) => setGoal(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="input w-16 text-sm" />회
        </label>
        <label className="flex items-center gap-1 text-xs text-ink-muted">보상
          <input type="number" min={1} max={500} value={reward} onChange={(e) => setReward(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} className="input w-20 text-sm" />점
        </label>
        <button type="button" onClick={save} disabled={busy} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-60">{editRow ? '수정 저장' : '+ 추가'}</button>
        {editRow && <button type="button" onClick={resetForm} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-60">취소</button>}
      </div>
      <p className="text-xs text-ink-muted">유형은 체크인·게시글·머니인 3가지 — 달성 검증은 서버(claim_mission RPC)가 자동으로 합니다.</p>
    </section>
  );
}

// ── 오류 로그(운영자) — 전역 에러 감시망 수집분 열람·정리 ───────────────────────
interface ClientErrorRow { id: string; message: string; stack: string | null; url: string | null; user_agent: string | null; created_at: string }
function ErrorLogPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<ClientErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('client_errors')
      .select('*').order('created_at', { ascending: false }).limit(50);
    setRows((data ?? []) as ClientErrorRow[]);
    setLoading(false);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const clearAll = async () => {
    if (!confirm('오류 로그를 전부 비울까요?')) return;
    const { error } = await supabase.from('client_errors').delete().gte('created_at', '1970-01-01');
    if (error) toast.show(error.message, 'error');
    else { toast.show('오류 로그를 비웠습니다', 'success'); reload(); }
  };
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-primary">수집 내역 <span className="text-xs font-normal text-ink-muted">(최근 {rows.length}건)</span></h3>
        <div className="flex gap-1.5">
          <button type="button" onClick={reload} className="btn-ghost px-2.5 text-xs">새로고침</button>
          {rows.length > 0 && <button type="button" onClick={clearAll} className="btn-ghost px-2.5 text-xs text-danger">전부 비우기</button>}
        </div>
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-ink-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">수집된 오류가 없습니다 — 깨끗합니다 ✨</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {rows.map((r) => (
            <li key={r.id} className="py-2">
              <button type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)} className="flex w-full items-start gap-2 text-left">
                <span className="shrink-0 rounded-badge bg-danger/10 px-1.5 py-0.5 text-2xs font-bold tabular-nums text-danger">{fmt(r.created_at)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-primary">{r.message}</span>
              </button>
              {openId === r.id && (
                <div className="mt-1.5 space-y-1 rounded-input bg-surface-high p-2 text-xs text-ink-secondary">
                  {r.url && <p className="break-all"><b>URL</b> {r.url}</p>}
                  {r.user_agent && <p className="break-all text-ink-muted">{r.user_agent}</p>}
                  {r.stack && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-2xs text-ink-muted">{r.stack}</pre>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 그룹 개설 승인(운영자) ────────────────────────────────────────────────────
function PendingGroupsPanel({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [groups, setGroups] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = () => { setLoading(true); getPendingGroups().then(setGroups).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { reload(); }, []);
  const approve = async (g: Venue) => {
    try { await approveGroup(g.id); toast.show(`'${g.name}' 그룹을 승인했습니다`, 'success'); reload(); onChanged(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
  };
  const reject = async (g: Venue) => {
    if (!confirm(`'${g.name}' 개설 신청을 거절(삭제)하시겠습니까?`)) return;
    try { await deleteVenue(g.id); toast.show('거절했습니다', 'info'); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
  };
  if (loading) return <p className="py-3 text-center text-2xs text-ink-muted">불러오는 중…</p>;
  return (
    <section className="rounded-card border border-gold-400/30 bg-surface-low p-3 space-y-2">
      <h3 className="text-sm font-bold text-gold-300">그룹 개설 승인 ({groups.length})</h3>
      {groups.length === 0 ? (
        <p className="text-2xs text-ink-muted py-1">대기 중인 그룹 개설 신청이 없습니다</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id} className="rounded-input border border-border-default bg-surface-high p-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="rounded-badge bg-gold-300/15 px-1.5 py-0.5 text-2xs font-bold text-gold-300">{GROUP_KIND_LABEL[g.kind ?? 'other']}</span>
                <span className="text-sm font-semibold text-ink-primary">{g.name}</span>
                {g.region && <span className="text-2xs text-ink-muted">{g.region}</span>}
              </div>
              {g.description && <p className="mt-1 text-2xs text-ink-secondary line-clamp-2">{g.description}</p>}
              <div className="mt-1.5 flex gap-1.5">
                <button type="button" onClick={() => approve(g)} className="btn-primary text-2xs px-3 py-1">승인</button>
                <button type="button" onClick={() => reject(g)} className="rounded-input border border-border-default px-3 py-1 text-2xs text-ink-muted hover:text-danger-light">거절</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const aic = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
// 섹션 설명 — 공용 SectionHeader(내 매장과 동일 규격)
const ADMIN_DESC: Record<Section, string> = {
  pending: '업주가 등록한 포스터 검수 — 승인하면 일정 탐색에 노출됩니다',
  reorder: '노출 순서 · 부스트 · 커뮤니티 광고 · 주간 미션 관리',
  users: '회원 검색 · 등급 · 제재',
  venues: '매장 생성 · 인증 · 그룹 승인',
  reports: '신고 접수 처리',
  errors: '실유저 화면에서 자동 수집된 오류',
};

const ADMIN_SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: 'pending', label: '포스터 승인', icon: aic(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></>) },
  { id: 'reorder', label: '게시물 관리', icon: aic(<><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>) },
  { id: 'users', label: '회원 관리', icon: aic(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>) },
  { id: 'venues', label: '매장', icon: aic(<><path d="M3 9.5 5 4h14l2 5.5" /><path d="M4 9.5V20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5" /><path d="M9 21v-6h6v6" /></>) },
  { id: 'reports', label: '신고', icon: aic(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>) },
  { id: 'errors', label: '오류 로그', icon: aic(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>) },
];

function AdminNavBtn({ active, onClick, icon, badge, children }: { active: boolean; onClick: () => void; icon: ReactNode; badge?: number; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={['flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[6px] px-3 py-2 text-xs font-semibold transition-colors focus:outline-none touch-manipulation lg:w-full lg:justify-start',
        active ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary lg:hover:bg-surface-high'].join(' ')}>
      <span className="shrink-0" aria-hidden>{icon}</span>
      <span className="flex-1 lg:text-left">{children}</span>
      {badge ? <span className="inline-flex h-4 min-w-[1.1rem] items-center justify-center rounded-full bg-danger px-1 text-2xs font-bold tabular-nums text-white">{badge}</span> : null}
    </button>
  );
}

export default function AdminTab({
  schedules, venues, users, posts, onApproveSchedule, onRejectSchedule, onUpdateUser, onDeletePost, onReloadVenues,
}: AdminTabProps) {
  const [section, setSection] = useState<Section>('pending');
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget>('posters');

  const pending = schedules.filter((s) => !s.approved);

  return (
    <div className="space-y-3 mx-auto w-full max-w-5xl">
      <StatsPanel />
      <div className="lg:flex lg:gap-4">
        <nav className="flex gap-1 overflow-x-auto scrollbar-none rounded-input bg-surface-high p-0.5 lg:sticky lg:top-16 lg:w-44 lg:shrink-0 lg:flex-col lg:self-start lg:overflow-visible lg:bg-transparent lg:p-0">
          {ADMIN_SECTIONS.map((a) => (
            <AdminNavBtn key={a.id} icon={a.icon} active={section === a.id} onClick={() => setSection(a.id)} badge={a.id === 'pending' && pending.length > 0 ? pending.length : undefined}>{a.label}</AdminNavBtn>
          ))}
        </nav>

        <div className="mt-3 min-w-0 flex-1 space-y-3 lg:mt-0">
          {/* 공용 섹션 헤더 — 내 매장과 동일 규격(17px 제목+12px 설명+헤어라인) */}
          <SectionHeader
            title={ADMIN_SECTIONS.find((a) => a.id === section)?.label ?? ''}
            desc={ADMIN_DESC[section]}
          />
          {section === 'venues' && (
            <div className="space-y-3">
              <PendingGroupsPanel onChanged={() => onReloadVenues?.()} />
              <VenueCreateCard venues={venues} users={users} onCreated={() => onReloadVenues?.()} />
            </div>
          )}

          {section === 'pending' && (
            <PendingApprovalSection pending={pending} onApprove={onApproveSchedule} onReject={onRejectSchedule} />
          )}
          {section === 'reorder' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
                <SubPill active={reorderTarget === 'posters'} onClick={() => setReorderTarget('posters')}>포스터</SubPill>
                <SubPill active={reorderTarget === 'venues'} onClick={() => setReorderTarget('venues')}>매장</SubPill>
              </div>
              {reorderTarget === 'posters'
                ? (
                  <>
                    <BoostContactCard />
                    <CommunityAdsCard />
          <VenueOwnerRequestsCard />
          <VoucherQuotaAdminCard />
          <RankVerifyAdminCard />
                    <MissionsAdminCard />
                    <DraggableList initialItems={schedules.filter((s) => s.approved)} />
                  </>
                )
                : <VenueManagement />}
            </div>
          )}
          {section === 'users' && (
            <UserManagementTab
              users={users}
              posts={posts.map((p) => ({ id: p.id, userName: p.userName, content: p.content, createdAt: p.createdAt, category: p.category }))}
              onUpdateUser={onUpdateUser}
              onDeletePost={onDeletePost}
            />
          )}
          {section === 'reports' && <ReportQueue />}
          {section === 'errors' && <ErrorLogPanel />}
        </div>
      </div>
    </div>
  );
}

// ── 홀덤펍 생성 + 관리 업주 임명 ─────────────────────────────────────────────

function VenueCreateCard({ venues, users, onCreated }: { venues: Venue[]; users: User[]; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [busy, setBusy] = useState(false);

  // 업주로 임명 가능한 후보 — 관리자 제외
  const candidates = users.filter((u) => u.role !== 'admin');

  const submit = async () => {
    if (!name.trim() || !region.trim()) { toast.show('매장명과 지역은 필수입니다', 'error'); return; }
    setBusy(true);
    try {
      await adminCreateVenue({ name, region, address, ownerId: ownerId || undefined });
      toast.show('홀덤펍을 생성했습니다', 'success');
      setName(''); setRegion(''); setAddress(''); setOwnerId('');
      onCreated();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '생성에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent p-3 space-y-2">
        <h3 className="text-sm font-bold text-gold-300">홀덤펍 생성 + 관리 업주 임명</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-2xs text-ink-secondary mb-1">매장명 <span className="text-danger">*</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="예: 강남 로얄 홀덤" className="input w-full text-sm" />
          </label>
          <label className="block">
            <span className="block text-2xs text-ink-secondary mb-1">지역 <span className="text-danger">*</span></span>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="input w-full text-sm">
              <option value="">선택</option>
              {REGION_CHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="기타">기타</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">주소 (선택)</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={80} placeholder="도로명 주소" className="input w-full text-sm" />
        </label>
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">관리 업주 임명 (선택)</span>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input w-full text-sm">
            <option value="">미지정 (나중에 임명)</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.nickname ?? u.name} · {u.email}</option>
            ))}
          </select>
          <span className="block text-[10px] text-ink-muted mt-1">임명 시 해당 회원이 업주(인증)로 전환되어 이 매장을 관리합니다.</span>
        </label>
        <div className="flex justify-end">
          <button type="button" onClick={submit} disabled={busy} className="btn-primary px-4 text-xs disabled:opacity-60">매장 생성</button>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-ink-primary mb-1.5">등록된 홀덤펍 ({venues.length}) · 매장별 관리</h3>
        {venues.length === 0 ? (
          <p className="text-center py-6 text-2xs text-ink-muted">등록된 홀덤펍이 없습니다</p>
        ) : (
          <ul className="space-y-1.5">
            {venues.map((v) => (
              <VenueAdminRow key={v.id} venue={v} candidates={candidates} onChanged={onCreated} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── 매장 1건 관리(수정/업주 변경/인증/삭제) ──────────────────────────────────
function VenueAdminRow({ venue, candidates, onChanged }: { venue: Venue; candidates: User[]; onChanged: () => void }) {
  const toast = useToast();
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState(venue.name);
  const [region, setRegion]   = useState(venue.region);
  const [address, setAddress] = useState(venue.address ?? '');
  const [ownerId, setOwnerId] = useState(venue.ownerId ?? '');
  const [verif, setVerif]     = useState<VenueVerificationStatus>(venue.verificationStatus ?? 'unverified');
  const [busy, setBusy]       = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [vIssue, setVIssue]   = useState<boolean | null>(null); // 매장이용권 발급 승인

  const owner = candidates.find((u) => u.id === venue.ownerId);

  useEffect(() => { isVoucherIssueApproved(venue.id).then(setVIssue).catch(() => {}); }, [venue.id]);
  const toggleVIssue = async () => {
    const next = !vIssue;
    setVIssue(next);
    try { await setVoucherIssueApproval(venue.id, next); toast.show(next ? '매장이용권 발급을 승인했습니다' : '발급 승인을 해제했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); setVIssue(!next); }
  };

  const save = async () => {
    if (!name.trim() || !region.trim()) { toast.show('매장명과 지역은 필수입니다', 'error'); return; }
    setBusy(true);
    try {
      await adminUpdateVenue({ venueId: venue.id, name, region, address, ownerId: ownerId || null });
      if (verif !== (venue.verificationStatus ?? 'unverified')) {
        await setVenueVerification(venue.id, verif);
      }
      toast.show('매장 정보를 수정했습니다', 'success');
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '수정에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`'${venue.name}' 매장을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try {
      await deleteVenue(venue.id);
      toast.show('매장을 삭제했습니다', 'info');
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '삭제에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };

  return (
    <li className="rounded-input bg-surface-high border border-border-subtle overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-primary truncate">{venue.name}</p>
          <p className="text-2xs text-ink-muted truncate">{venue.region} · 업주: {owner ? (owner.nickname ?? owner.name) : '미지정'}</p>
        </div>
        {venue.verificationStatus === 'verified' && (
          <span className="shrink-0 text-2xs font-bold text-gold-300 bg-gold-300/15 px-1.5 py-0.5 rounded-badge">인증</span>
        )}
        <button
          type="button"
          onClick={() => setPosOpen(true)}
          className="shrink-0 text-2xs font-semibold px-2.5 py-1 rounded-input border border-gold-400/40 text-gold-300 hover:bg-gold-300/10 transition-colors"
        >
          장부·통계
        </button>
        <button
          type="button"
          onClick={toggleVIssue}
          title="매장이용권 발급 승인"
          className={['shrink-0 text-2xs font-semibold px-2.5 py-1 rounded-input border transition-colors',
            vIssue ? 'border-gold-400/40 text-gold-300 bg-gold-300/10' : 'border-border-default text-ink-muted hover:text-ink-primary'].join(' ')}
        >
          이용권발급 {vIssue == null ? '…' : vIssue ? '✓' : '✗'}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-2xs font-semibold px-2.5 py-1 rounded-input border border-border-default text-ink-secondary hover:text-ink-primary hover:border-gold-400/50 transition-colors"
        >
          {open ? '닫기' : '관리'}
        </button>
      </div>

      {posOpen && <AdminVenuePos venueId={venue.id} venueName={venue.name} onClose={() => setPosOpen(false)} />}

      {open && (
        <div className="px-3 pb-3 pt-2 space-y-2 border-t border-border-subtle animate-slide-up">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-2xs text-ink-secondary mb-1">매장명 <span className="text-danger">*</span></span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="input w-full text-sm" />
            </label>
            <label className="block">
              <span className="block text-2xs text-ink-secondary mb-1">지역 <span className="text-danger">*</span></span>
              <select value={region} onChange={(e) => setRegion(e.target.value)} className="input w-full text-sm">
                {region && !(REGION_CHIPS as readonly string[]).includes(region) && region !== '기타' && <option value={region}>{region}</option>}
                {REGION_CHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value="기타">기타</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-2xs text-ink-secondary mb-1">주소</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={80} placeholder="도로명 주소" className="input w-full text-sm" />
          </label>
          <label className="block">
            <span className="block text-2xs text-ink-secondary mb-1">관리 업주</span>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input w-full text-sm">
              <option value="">미지정</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>{u.nickname ?? u.name} · {u.email}</option>
              ))}
            </select>
            <span className="block text-[10px] text-ink-muted mt-1">변경 시 새 업주가 인증 업주로 전환되어 이 매장을 관리합니다.</span>
          </label>
          <label className="block">
            <span className="block text-2xs text-ink-secondary mb-1">인증 상태</span>
            <select value={verif} onChange={(e) => setVerif(e.target.value as VenueVerificationStatus)} className="input w-full text-sm">
              <option value="unverified">미인증</option>
              <option value="pending">인증 대기</option>
              <option value="verified">인증 완료</option>
            </select>
          </label>

          {/* 매장 직원 관리 */}
          <VenueStaffManager venueId={venue.id} />

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-2xs font-semibold px-2.5 py-1.5 rounded-input border bg-danger/10 text-danger-light border-danger/30 hover:bg-danger/20 transition-colors disabled:opacity-50"
            >
              매장 삭제
            </button>
            <button type="button" onClick={save} disabled={busy} className="btn-primary px-4 text-xs disabled:opacity-60">
              저장
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ── 운영자: 임의 매장 장부/통계 전체 열람 (실시간) ────────────────────────────
function AdminVenuePos({ venueId, venueName, onClose }: { venueId: string; venueName: string; onClose: () => void }) {
  const [tab, setTab] = useState<'stats' | 'ledger'>('stats');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  // 뒤로가기 → 운영자 장부 뷰 닫기
  useBackClose(true, onClose);

  return (
    <div className="fixed inset-0 z-[60] bg-surface-base overflow-y-auto transform-gpu animate-fade-in">
      <header className="sticky top-0 z-10 h-header-h px-page-x flex items-center gap-2 bg-surface-base/95 backdrop-blur-md border-b border-border-subtle">
        <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-secondary hover:text-ink-primary">← 닫기</button>
        <span className="text-sm font-bold text-ink-primary truncate">{venueName} · 장부/통계</span>
        <span className="ml-auto shrink-0 text-2xs font-bold text-gold-300 bg-gold-300/15 px-2 py-0.5 rounded-badge">운영자 전체 접근</span>
      </header>
      <div className="max-w-6xl mx-auto px-page-x py-3">
        <SegmentedTabs grow size="md" className="w-full mb-3"
          items={[{ key: 'stats', label: '통계' }, { key: 'ledger', label: '장부 (실시간)' }]}
          value={tab} onChange={setTab} />
        {tab === 'stats'
          ? <LedgerStatsPanel venueId={venueId} />
          : <NuriPosLedger venueId={venueId} canManage venueName={venueName} />}
      </div>
    </div>
  );
}

// ── 매장 직원(스태프) 관리 ────────────────────────────────────────────────────
function VenueStaffManager({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [staff, setStaff]     = useState<VenueStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [login, setLogin]     = useState('');
  const [position, setPosition] = useState('');
  const [busy, setBusy]       = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getVenueStaff(venueId).then(setStaff).catch(() => {}).finally(() => setLoading(false));
  }, [venueId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!login.trim()) { toast.show('직원 아이디(닉네임 또는 이메일)를 입력해 주세요', 'error'); return; }
    setBusy(true);
    try {
      await addVenueStaff({ venueId, login: login.trim(), position: position.trim() || undefined });
      toast.show('직원을 추가했습니다', 'success');
      setLogin(''); setPosition('');
      load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '직원 추가에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-input border border-border-default bg-surface-low p-2.5 space-y-2">
      <p className="text-2xs font-bold text-ink-secondary">직원 관리</p>

      {/* 직원 추가 */}
      <div className="flex items-end gap-1.5">
        <label className="flex-1 block min-w-0">
          <span className="block text-[10px] text-ink-muted mb-0.5">직원 아이디 (닉네임/이메일)</span>
          <input value={login} onChange={(e) => setLogin(e.target.value)} maxLength={60} placeholder="예: dealer_kim" className="input w-full text-sm" />
        </label>
        <label className="w-20 shrink-0 block">
          <span className="block text-[10px] text-ink-muted mb-0.5">직책</span>
          <input value={position} onChange={(e) => setPosition(e.target.value)} maxLength={20} placeholder="딜러" className="input w-full text-sm" />
        </label>
        <button type="button" onClick={add} disabled={busy} className="btn-primary text-xs px-3 h-9 shrink-0 disabled:opacity-60">추가</button>
      </div>

      {/* 직원 목록 */}
      {loading ? (
        <p className="text-center py-2 text-2xs text-ink-muted">불러오는 중…</p>
      ) : staff.length === 0 ? (
        <p className="text-center py-2 text-2xs text-ink-muted">등록된 직원이 없습니다. 위에서 아이디로 추가하세요.</p>
      ) : (
        <ul className="space-y-1.5">
          {staff.map((s) => <StaffRow key={s.id} staff={s} onChanged={load} />)}
        </ul>
      )}
    </div>
  );
}

function StaffRow({ staff, onChanged }: { staff: VenueStaff; onChanged: () => void }) {
  const toast = useToast();
  const [position, setPosition] = useState(staff.position ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = position.trim() !== (staff.position ?? '');

  const save = async () => {
    setBusy(true);
    try {
      await updateVenueStaff({ staffId: staff.id, position });
      toast.show('직원 정보를 수정했습니다', 'success');
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '수정에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`직원 '${staff.name || staff.login}'을(를) 삭제하시겠습니까?`)) return;
    setBusy(true);
    try {
      await removeVenueStaff(staff.id);
      toast.show('직원을 삭제했습니다', 'info');
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '삭제에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };

  return (
    <li className="flex items-center gap-1.5 px-2 py-1.5 rounded-input bg-surface-high border border-border-subtle">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-ink-primary truncate">
          {staff.name || staff.login}
          {staff.userId
            ? <span className="ml-1 text-[10px] font-normal text-emerald-400">계정연결</span>
            : <span className="ml-1 text-[10px] font-normal text-ink-muted">미가입</span>}
        </p>
        <p className="text-[10px] text-ink-muted truncate">아이디: {staff.login}</p>
      </div>
      <input
        value={position}
        onChange={(e) => setPosition(e.target.value)}
        maxLength={20}
        placeholder="직책"
        className="input w-16 shrink-0 text-xs !py-1"
      />
      {dirty && (
        <button type="button" onClick={save} disabled={busy} className="shrink-0 text-2xs font-bold text-gold-300 disabled:opacity-50">저장</button>
      )}
      <button type="button" onClick={remove} disabled={busy} className="shrink-0 text-2xs text-ink-muted hover:text-danger-light transition-colors">삭제</button>
    </li>
  );
}

// ── 관리자 통계 패널 ─────────────────────────────────────────────────────────

function StatsPanel() {
  const [s, setS] = useState<AdminStats | null>(null);
  useEffect(() => {
    let active = true;
    getAdminStats().then((x) => { if (active) setS(x); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!s) return null;
  const cards = [
    { label: '전체 회원', v: s.users },        { label: '업주', v: s.owners },            { label: '승인대기 업주', v: s.pendingOwners },
    { label: '제재 회원', v: s.suspended },     { label: '게시글', v: s.posts },           { label: '매물', v: s.listings },
    { label: '포스터', v: s.schedules },        { label: '승인대기 포스터', v: s.pendingSchedules }, { label: '7일 신규가입', v: s.signups7d },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c) => (
        <div key={c.label} className="rounded-input border border-border-default bg-surface-low py-2 text-center">
          <p className="text-lg font-bold text-ink-primary tabular-nums leading-none">{c.v.toLocaleString()}</p>
          <p className="text-2xs text-ink-muted mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── 포스터 승인 대기 목록 ─────────────────────────────────────────────────────

function PendingApprovalSection({
  pending, onApprove, onReject,
}: {
  pending: Schedule[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-ink-muted">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30" aria-hidden><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <p className="text-sm">승인 대기 중인 포스터가 없습니다</p>
        <p className="text-2xs">업주가 등록한 포스터가 여기에서 검토됩니다</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {pending.map((s) => (
        <PendingRow key={s.id} schedule={s} onApprove={() => onApprove(s.id)} onReject={() => onReject(s.id)} />
      ))}
    </ul>
  );
}

function PendingRow({
  schedule, onApprove, onReject,
}: { schedule: Schedule; onApprove: () => void; onReject: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const d = new Date(schedule.date);

  return (
    <li className="flex items-center gap-3 p-3 rounded-card bg-surface-low border border-amber-500/30">
      {/* 썸네일 */}
      <div
        className="w-12 h-16 shrink-0 rounded-input overflow-hidden flex items-center justify-center"
        style={schedule.posterUrl
          ? undefined
          : { background: `linear-gradient(135deg, ${schedule.posterColor ?? '#1a1d24'}ee, #0a0c0f)` }}
      >
        {schedule.posterUrl
          ? <img src={schedule.posterUrl} alt={`${schedule.title} 포스터`} className="w-full h-full object-cover" loading="lazy" />
          : <span className="text-2xl opacity-30">♠</span>}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1 py-0.5 text-2xs font-semibold leading-none">
            승인대기
          </span>
          <span className="rounded-badge bg-surface-high text-ink-secondary border border-border-default px-1 py-0.5 text-2xs font-semibold leading-none">
            {schedule.format}
          </span>
        </div>
        <p className="text-sm font-medium text-ink-primary truncate">{schedule.title}</p>
        <p className="text-2xs text-ink-muted mt-0.5 truncate">
          {schedule.pubName || '매장 미지정'} · {d.getMonth() + 1}/{d.getDate()} {schedule.startTime} · 바이인 {schedule.buyIn.amount.toLocaleString()}
        </p>
      </div>

      {/* 액션 */}
      <div className="flex items-center gap-1 shrink-0">
        {rejecting ? (
          <>
            <button type="button" onClick={() => setRejecting(false)} className="btn-ghost text-xs px-2">
              취소
            </button>
            <button type="button" onClick={() => { onReject(); setRejecting(false); }} className="btn-danger text-xs px-2">
              반려 확정
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onApprove}
              className="text-xs font-semibold px-3 py-1.5 rounded-input bg-gold-300 text-ink-inverse hover:bg-gold-200 transition-colors"
            >
              승인
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="text-xs px-2 py-1.5 rounded-input text-ink-muted hover:text-danger-light transition-colors"
            >
              반려
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// 노출 순서 하위 탭(포스터/매장)용 작은 토글 버튼
function SubPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-[6px] transition-all focus:outline-none',
        active ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

