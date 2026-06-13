import { useEffect, useState, type ReactNode, useRef } from 'react';
import Icon from '../atoms/Icon';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import type { User, VenueInvite } from '../../api/auth';
import { getMyVenueStaff, getMyVenueInvites, inviteStaffByEmail, cancelStaffInvite, removeStaff, setStaffTitle, checkNicknameAvailable, searchMembersForRanking } from '../../api/auth';
import { getVenueRankings, saveVenueRankings, maskRealName, getVenuePageConfig, placementPointsOf, type VenuePageConfig } from '../../api/rankings';
import { canAccessLedger, canManagePos, getLedgerAccessUserIds, grantLedgerAccess, revokeLedgerAccess } from '../../api/ledger';
import { getAllVenues, type Venue } from '../../api/community';
import VenueVerificationCard from './VenueVerificationCard';
import NuriPosLedger, { type LedgerSeed } from './NuriPosLedger';
import LedgerStatsPanel, { PosSettingsPanel } from './LedgerStatsPanel';
import TournamentClock from './clock/TournamentClock';
import StaffSchedule from './StaffSchedule';
import { StaffWageManager, StaffSettlement, StaffWorkLog, StaffSelfAttendance } from './StaffPayroll';
import StoreDashboard from './StoreDashboard';
import { VoucherManagePanel } from './VoucherManageModal';
import { iCanViewVouchers, getVoucherAccessUserIds, grantVoucherAccess, revokeVoucherAccess, findUserForTransfer, issueVoucher } from '../../api/vouchers';
import MyPostersTab from './MyPostersTab';
import VenueCustomizePanel, { VenueRankHub } from './VenueCustomizePanel';
import LeaguePanel from './LeaguePanel';
import SectionHeader from '../atoms/SectionHeader';
import type { Schedule } from '../../api/schedules';
import { motion } from 'framer-motion';
import { getLedgerBuyins } from '../../api/ledger';

type Section = 'dashboard' | 'posters' | 'ledger' | 'stats' | 'ranking' | 'venueRank' | 'league' | 'staff' | 'settings' | 'clock' | 'attendance' | 'voucher' | 'page';

/** 업주/직원 전용 "매장 관리" 탭 — 장부(POS) · 통계 · 순위 입력 · (업주) 직원 관리 */
export default function VenueManageTab({ schedules, onCreatePoster, onEditPoster, onDeletePoster, deepSection, onConsumeDeepSection }: {
  schedules: Schedule[]; onCreatePoster: () => void; onEditPoster: (id: string) => void; onDeletePoster: (id: string) => void;
  /** 알림 딥링크 등 외부 진입 — 지정 섹션으로 바로 이동(1회 소비) */
  deepSection?: Section | null;
  onConsumeDeepSection?: () => void;
}) {
  const { user } = useAuth();
  const isOwner = user?.role === 'venue_owner';
  const isAdmin = user?.role === 'admin';
  const canStaff = isOwner || isAdmin; // 직원 관리·POS 설정 접근
  const canPosters = isOwner || isAdmin; // 포스터·예약 관리
  const [adminVenues, setAdminVenues] = useState<Venue[]>([]);
  const [adminVenueId, setAdminVenueId] = useState<string | null>(null);
  // 운영자는 선택한 매장, 그 외는 본인 소속 매장
  const venueId: string | null = isAdmin ? adminVenueId : (user?.venueId ?? null);
  const [section, setSection] = useState<Section | null>(null);
  const [ledgerOk, setLedgerOk] = useState(false); // 장부 접근(업주/운영자/권한직원)
  const [manageOk, setManageOk] = useState(false); // 통계·설정(업주/운영자)
  const [voucherView, setVoucherView] = useState(false); // 매장이용권 내역 열람(업주/권한직원)
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [rankingDraft, setRankingDraft] = useState<{ date: string; names: string[] } | null>(null);
  const [clockSeed, setClockSeed] = useState<string | null>(null); // 장부→클락 연동 날짜
  const [ledgerSeed, setLedgerSeed] = useState<LedgerSeed | null>(null); // 게임관리→장부 바로가기

  // 섹션 이동 공통 — 장부를 메뉴로 직접 열 땐 게임관리 시드를 지워 일반 진입으로
  const gotoSection = (s: Section) => {
    if (s === 'ledger') setLedgerSeed(null);
    setSection(s);
  };

  // 알림 딥링크("📒 장부 시작" 클릭 등) — 권한 확인이 끝나면 지정 섹션으로 1회 이동
  useEffect(() => {
    if (!deepSection || !permsLoaded) return;
    gotoSection(deepSection);
    onConsumeDeepSection?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepSection, permsLoaded]);

  // 메뉴 즐겨찾기 — 매장별 최대 5개를 상단 고정(★ 토글, localStorage)
  const [favs, setFavs] = useState<Section[]>([]);
  useEffect(() => {
    if (!venueId) return;
    try { setFavs(JSON.parse(localStorage.getItem(`nuri:fav-sections:${venueId}`) ?? '[]')); }
    catch { setFavs([]); }
  }, [venueId]);
  const toggleFav = (id: Section) => {
    setFavs((f) => {
      const has = f.includes(id);
      if (!has && f.length >= 5) return f; // 최대 5개
      const next = has ? f.filter((x) => x !== id) : [...f, id];
      if (venueId) localStorage.setItem(`nuri:fav-sections:${venueId}`, JSON.stringify(next));
      return next;
    });
  };

  // 운영자: 전체 매장 목록 로드(선택용)
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    getAllVenues()
      .then((vs) => { if (alive) { setAdminVenues(vs); setAdminVenueId((cur) => cur ?? vs[0]?.id ?? null); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAdmin]);

  // 권한 확인 후 첫 화면 결정 — 장부 우선(없으면 통계 → 순위). 운영자는 전권이라 조회 생략.
  useEffect(() => {
    if (!venueId) { setPermsLoaded(false); return; }
    let alive = true;
    if (isAdmin) {
      setLedgerOk(true); setManageOk(true); setVoucherView(true);
      setSection((s) => s ?? 'dashboard');
      setPermsLoaded(true);
      return () => { alive = false; };
    }
    setPermsLoaded(false);
    Promise.all([canAccessLedger(venueId), canManagePos(venueId), iCanViewVouchers(venueId)])
      .then(([l, m, vv]) => {
        if (!alive) return;
        setLedgerOk(l); setManageOk(m); setVoucherView(vv);
        setSection((s) => s ?? 'dashboard');
      })
      .catch(() => { if (alive) setSection(null); })
      .finally(() => { if (alive) setPermsLoaded(true); });
    return () => { alive = false; };
  }, [venueId, isAdmin]);

  // 섹션 노출 규칙:
  //  · 직원이 부여받을 수 있는 권한(장부·이용권)은 권한 없어도 '잠금' 탭으로 노출 → 클릭 시 "권한 없음" 안내(휑한 화면 방지).
  //  · 장부에 종속된 순위·클락·출근은 장부 권한이 있을 때만 노출(중복 잠금 방지).
  //  · 업주만 가능한 섹션(포스터·통계·직원·POS)은 직원에게 아예 숨김.
  const available: { id: Section; label: string; locked?: boolean }[] = [{ id: 'dashboard', label: '대시보드' }];
  if (canPosters) available.push({ id: 'posters', label: '포스터·예약' });
  available.push({ id: 'ledger', label: '장부', locked: !ledgerOk });
  if (manageOk) available.push({ id: 'stats',  label: '통계' });
  if (ledgerOk) available.push({ id: 'ranking', label: '순위 입력' });
  if (ledgerOk) available.push({ id: 'venueRank', label: '매장 랭킹' });
  if (ledgerOk) available.push({ id: 'league', label: '연합 리그' });
  if (ledgerOk) available.push({ id: 'clock', label: '클락' });
  if (ledgerOk) available.push({ id: 'attendance', label: '출근 관리' });
  available.push({ id: 'voucher', label: '매장이용권', locked: !(manageOk || voucherView) });
  if (canStaff) available.push({ id: 'page', label: '매장 꾸미기' });
  if (canStaff) available.push({ id: 'staff', label: '직원 관리' });
  if (canStaff) available.push({ id: 'settings', label: '설정' });
  const curItem = available.find((a) => a.id === section);

  if (!user) return null;
  // 업주·직원: 소속 매장이 없으면 안내 (운영자는 매장 선택기로 진행)
  if (!isAdmin && !venueId) {
    return (
      <div className="py-16 text-center text-sm text-ink-muted">
        소속된 매장이 없습니다. 매장 승인 또는 직원 승인 후 이용할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3 mx-auto w-full max-w-5xl">
      {/* 운영자: 전 매장 접근 — 관리할 매장 선택 */}
      {isAdmin && (
        <div className="rounded-card border border-gold-400/40 bg-gold-300/[0.06] p-2.5 space-y-1.5">
          <p className="text-2xs font-bold text-gold-300">운영자 전체 접근 · 관리할 매장 선택</p>
          <select value={venueId ?? ''} onChange={(e) => setAdminVenueId(e.target.value || null)} className="input text-sm">
            {adminVenues.length === 0 && <option value="">불러오는 중…</option>}
            {adminVenues.map((v) => (
              <option key={v.id} value={v.id}>{v.name} · {v.region}{v.approved ? '' : ' (미승인)'}</option>
            ))}
          </select>
        </div>
      )}

      {isOwner && <VenueVerificationCard />}

      {!venueId ? (
        <p className="py-16 text-center text-sm text-ink-muted">관리할 매장을 선택하세요.</p>
      ) : !permsLoaded ? (
        <p className="py-16 text-center text-sm text-ink-muted">불러오는 중…</p>
      ) : section === null ? (
        <p className="py-16 text-center text-sm text-ink-muted">이 매장에서 사용 가능한 메뉴가 없습니다.<br />업주에게 장부 권한을 요청하세요.</p>
      ) : (
        <div className="lg:flex lg:gap-4">
          {available.length > 1 && (
            <nav className="grid grid-cols-3 gap-1 rounded-card bg-surface-high p-1 lg:sticky lg:top-16 lg:flex lg:w-44 lg:shrink-0 lg:flex-col lg:self-start lg:bg-transparent lg:p-0">
              {[...available]
                // 즐겨찾기 우선 정렬(★ 누른 순서 유지) — 나머지는 기존 순서
                .sort((a, b) => {
                  const fi = (id: Section) => { const i = favs.indexOf(id); return i < 0 ? 999 : i; };
                  return fi(a.id) - fi(b.id);
                })
                .map((a) => (
                  <SectionBtn key={a.id} icon={SECTION_ICON[a.id]} active={section === a.id} locked={a.locked}
                    fav={favs.includes(a.id)} onToggleFav={() => toggleFav(a.id)}
                    onClick={() => gotoSection(a.id)}>{a.label}</SectionBtn>
                ))}
            </nav>
          )}

          <div className="mt-3 min-w-0 flex-1 space-y-3 lg:mt-0">
            {curItem?.locked ? (
              <div className="rounded-card border border-border-default bg-surface-low p-6 text-center space-y-2.5">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-high text-ink-muted"><Icon name="lock" size={22} /></div>
                <p className="text-sm font-bold text-ink-primary">{curItem.label} · 접근 권한이 없습니다</p>
                <p className="text-2xs leading-relaxed text-ink-muted">이 기능은 업주가 권한을 부여해야 사용할 수 있어요.<br />매장 업주에게 <span className="font-semibold text-gold-300">{curItem.id === 'voucher' ? '이용권 내역' : '장부·순위'} 권한</span>을 요청하세요.</p>
              </div>
            ) : (<>
            {/* 공용 섹션 헤더 — 모든 섹션의 제목·설명·주 액션 위치/크기를 한 규격으로 */}
            <SectionHeader
              title={curItem?.label ?? ''}
              desc={SECTION_DESC[section]}
              action={section === 'posters' && canPosters
                ? <button type="button" onClick={onCreatePoster} className="btn-primary">+ 새 게임</button>
                : undefined}
            />
            {section === 'dashboard' && <StoreDashboard venueId={venueId} schedules={schedules} onGoto={(s) => gotoSection(s as Section)} onCreatePoster={onCreatePoster}
              caps={{ ledger: ledgerOk, manage: manageOk, voucher: manageOk || voucherView, posters: canPosters, staff: canStaff }} />}
            {section === 'posters' && canPosters && <MyPostersTab schedules={schedules} onCreate={onCreatePoster} onEdit={onEditPoster} onDelete={onDeletePoster}
              onGotoRanking={ledgerOk ? (date) => { setRankingDraft({ date, names: [] }); setSection('ranking'); } : undefined}
              onOpenLedger={ledgerOk ? (s, existingDate) => {
                const schedDate = new Date(s.date).toLocaleDateString('en-CA');
                setLedgerSeed(existingDate
                  ? { date: existingDate, scheduleId: s.id, isNew: false }
                  : { date: schedDate, scheduleId: s.id, isNew: true, title: s.title, buyinAmount: s.buyIn?.amount ?? 0, gtd: !!s.guaranteed });
                setSection('ledger');
              } : undefined} />}
            {section === 'ledger'  && ledgerOk && (
              <NuriPosLedger venueId={venueId} canManage={manageOk} seed={ledgerSeed}
                onMakeRankingDraft={(d, names) => { setRankingDraft({ date: d, names }); setSection('ranking'); }}
                onOpenClock={(d) => { setClockSeed(d); setSection('clock'); }}
                onOpenStats={manageOk ? () => setSection('stats') : undefined} />
            )}
            {section === 'stats'    && manageOk && <LedgerStatsPanel venueId={venueId} />}
            {section === 'ranking'  && ledgerOk && <RankingEditor venueId={venueId} canEdit={isAdmin || user.approved === true} draft={rankingDraft} />}
            {section === 'venueRank' && ledgerOk && <VenueRankHub venueId={venueId} canConfigure={manageOk} />}
            {section === 'league'   && ledgerOk && <LeaguePanel venueId={venueId} canConfigure={manageOk} />}
            {section === 'page'     && canStaff && <VenueCustomizePanel venueId={venueId} />}
            {section === 'clock'    && ledgerOk && <TournamentClock venueId={venueId} canManage={ledgerOk} seedSessionDate={clockSeed} />}
            {section === 'attendance' && ledgerOk && <StaffSelfAttendance venueId={venueId} />}
            {section === 'staff'    && canStaff && <StaffHub venueId={venueId} />}
            {section === 'settings' && canStaff && <PosSettingsPanel venueId={venueId} />}
            {section === 'voucher'  && (manageOk || voucherView || ledgerOk) && <VoucherManagePanel venueId={venueId} />}
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}

// 섹션 설명 — 공용 SectionHeader에 표시(제목·설명·액션 규격 통일)
const SECTION_DESC: Record<Section, string> = {
  dashboard: '매장 운영 현황을 한눈에 — 오늘 장부·클락·추세·단골',
  posters: '게임(포스터)별 예약 관리 — 게임을 누르면 예약 리스트가 펼쳐집니다',
  ledger: '게임(세션)별 장부 — 날짜·게임명으로 검색해 열람·수정하세요',
  stats: '기간별 매출·엔트리·요일 분석',
  ranking: '대회 순위 등록 — 닉네임이 일치하는 회원에게 점수가 자동 반영됩니다',
  venueRank: '매장 커뮤니티 순위 탭에 노출될 랭킹 보드 설정(금전적 가치 없음)',
  league: '여러 매장이 함께 운영하는 공동 랭킹 — 초대 → 수락 → 통합 순위',
  clock: '토너먼트 타이머 — 장부 연동 시 엔트리·생존이 자동 반영됩니다',
  attendance: '내 출퇴근 기록',
  voucher: '매장이용권 발행·회수·사용 내역(금전적 가치 없음)',
  page: '매장 페이지 꾸미기 — 탭 순서·링크·소개',
  staff: '구성원·권한·출근 스케줄·인건비',
  settings: 'POS 비밀번호·결제수단·할인 프리셋',
};

// 섹션 아이콘(라인 스타일 통일: 16px, stroke 1.8)
const ic = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const SECTION_ICON: Record<Section, ReactNode> = {
  dashboard: ic(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>),
  posters: ic(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-4.5-4.5L6 21" /></>),
  ledger: ic(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>),
  stats: ic(<><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="9" /><line x1="18" y1="20" x2="18" y2="4" /></>),
  ranking: ic(<><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.7V18M14 14.7V18" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>),
  clock: ic(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  attendance: ic(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></>),
  voucher: ic(<><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v14" /></>),
  staff: ic(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  page: ic(<><path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="m2 2 7.586 7.586" /><circle cx="11" cy="11" r="2" /></>),
  venueRank: ic(<><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 7.7l5.4-.8L12 2z" /><path d="M4 22h16" /></>),
  league: ic(<><circle cx="6" cy="8" r="3" /><circle cx="18" cy="8" r="3" /><path d="M3 20v-1a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v1" /><path d="M15 20v-1a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v1" /><path d="M9 8h6" /></>),
  settings: ic(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>),
};

function SectionBtn({ active, onClick, icon, children, locked, fav, onToggleFav }: {
  active: boolean; onClick: () => void; icon?: ReactNode; children: ReactNode; locked?: boolean;
  fav?: boolean; onToggleFav?: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      // 글씨 13px·세로 패딩 확대 — 매일 쓰는 운영 메뉴라 가독·터치 우선
      className={['group/nav relative flex flex-col items-center justify-center gap-1 whitespace-nowrap rounded-[7px] px-1 py-2.5 text-xs font-semibold transition-colors duration-300 focus:outline-none touch-manipulation lg:w-full lg:flex-row lg:justify-start lg:gap-2 lg:px-3 lg:text-[13px]',
        active ? 'text-ink-inverse' : locked ? 'text-ink-muted/60 hover:text-ink-secondary lg:hover:bg-surface-high' : 'text-ink-secondary hover:text-ink-primary lg:hover:bg-surface-high'].join(' ')}>
      {active && (
        <motion.span layoutId="manage-nav-pill" aria-hidden
          className="absolute inset-0 rounded-[7px] bg-gold-300"
          transition={{ type: 'spring', stiffness: 700, damping: 42 }} />
      )}
      <span className="relative shrink-0" aria-hidden>{icon}</span>
      <span className="relative">{children}</span>
      {locked && <Icon name="lock" size={11} className={['hidden lg:block ml-auto shrink-0', active ? 'text-ink-inverse/70' : 'text-ink-muted'].join(' ')} />}
      {/* ★ 즐겨찾기 토글 — 즐겨찾기는 상시, 나머지는 PC 호버 시 표시(최대 5개 상단 고정) */}
      {onToggleFav && !locked && (
        <span
          role="button" tabIndex={-1} aria-label={fav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
          className={[locked ? '' : 'lg:ml-auto', 'hidden lg:inline shrink-0 px-0.5 text-sm leading-none transition-opacity',
            fav ? (active ? 'text-ink-inverse' : 'text-gold-300') + ' opacity-100'
                : 'opacity-0 group-hover/nav:opacity-60 ' + (active ? 'text-ink-inverse' : 'text-ink-muted')].join(' ')}
        >{fav ? '★' : '☆'}</span>
      )}
    </button>
  );
}


// ── 일일 순위 입력 ────────────────────────────────────────────────────────────
interface Row { nickname: string; realName: string; prize: string; voucher: string; note: string; member?: boolean | null; }
const emptyRow = (): Row => ({ nickname: '', realName: '', prize: '', voucher: '', note: '' });

function RankingEditor({ venueId, canEdit, draft }: { venueId: string; canEdit: boolean; draft?: { date: string; names: string[] } | null }) {
  const toast = useToast();
  const today = new Date().toLocaleDateString('en-CA'); // 로컬 날짜 — UTC 자정 넘김 방지
  const [date, setDate] = useState(draft?.date ?? today);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 등수→점수 매핑(매장 꾸미기에서 설정) — 입력 시 점수 미리보기에 사용
  const [cfg, setCfg] = useState<VenuePageConfig | null>(null);
  useEffect(() => { getVenuePageConfig(venueId).then(setCfg).catch(() => {}); }, [venueId]);

  // 장부에서 넘어온 초안: 해당 날짜로 이동
  useEffect(() => { if (draft?.date) setDate(draft.date); }, [draft]);

  useEffect(() => {
    setLoading(true);
    getVenueRankings(venueId, date)
      .then(({ entries }) => {
        if (entries.length) {
          setRows(entries.map((e) => ({ nickname: e.nickname, realName: e.realName, prize: e.prize ?? '', voucher: '', note: '' })));
        } else if (draft && draft.date === date && draft.names.length) {
          // 정산 마감 참가자 명단을 닉네임으로 미리 채움(순서는 업주가 정리)
          setRows(draft.names.map((n) => ({ nickname: n, realName: '', prize: '', voucher: '', note: '' })));
        } else {
          setRows([emptyRow()]);
        }
      })
      .catch(() => setRows([emptyRow()]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, date]);

  const update = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i
      ? { ...row, [k]: v, ...(k === 'nickname' ? { member: null } : {}) } // 닉네임 바뀌면 매칭 재확인
      : row)));
  // 닉네임 blur 시 회원 여부 표시 — 미가입 닉네임도 순위 기록은 되지만 점수·이용권은 안 가는 걸 입력 단계에서 미리 보여준다
  // 자동완성: ①그날 장부 명단 ②비회원 등록 ③회원 검색(닉네임/실명 — 동명이인은 실명으로 구분)
  const [ledgerNames, setLedgerNames] = useState<string[]>([]);
  useEffect(() => {
    getLedgerBuyins(venueId, date)
      .then((bs) => setLedgerNames([...new Set(bs.map((b) => b.playerName).filter(Boolean))]))
      .catch(() => setLedgerNames([]));
  }, [venueId, date]);
  const [sugRow, setSugRow] = useState<number | null>(null);     // 드롭다운 열린 행
  const [memCands, setMemCands] = useState<{ nickname: string; realName: string }[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNickInput = (i: number, v: string) => {
    update(i, 'nickname', v);
    setSugRow(v.trim() ? i : null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!v.trim()) { setMemCands([]); return; }
    searchTimer.current = setTimeout(() => {
      searchMembersForRanking(v).then(setMemCands).catch(() => setMemCands([]));
    }, 280);
  };
  const pickSuggestion = (i: number, kind: 'ledger' | 'guest' | 'member', nickname: string, realName?: string) => {
    setRows((r) => r.map((row, idx) => (idx === i
      ? { ...row, nickname, realName: realName ?? row.realName, member: kind === 'member' ? true : kind === 'guest' ? false : row.member ?? null }
      : row)));
    setSugRow(null); setMemCands([]);
    if (kind === 'ledger') void checkMember(i, nickname); // 장부명이 회원인지 보조 확인
  };
  const checkMember = async (i: number, nickname: string) => {
    const n = nickname.trim();
    if (!n) return;
    try {
      const available = await checkNicknameAvailable(n); // available=true → 그 닉네임의 회원이 없음
      setRows((r) => r.map((row, idx) => (idx === i && row.nickname.trim() === n ? { ...row, member: !available } : row)));
    } catch { /* 조회 실패 시 표시 생략 */ }
  };
  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  const save = async () => {
    const clean = rows.filter((r) => r.nickname.trim() || r.realName.trim() || r.prize.trim());
    if (clean.length === 0) return toast.show('순위를 한 명 이상 입력해 주세요', 'error');
    if (clean.some((r) => !r.nickname.trim()))
      return toast.show('각 줄에 닉네임을 입력해 주세요 (실명·프라이즈는 선택)', 'error');
    setSaving(true);
    try {
      await saveVenueRankings(venueId, date, clean.map(({ nickname, realName, prize }) => ({ nickname, realName, prize })));
      // 매장이용권 지급 — 갯수>0 줄: 닉네임으로 가입자 조회 후 발급(본인인증 회원만, 서버 강제)
      let issued = 0, failed = 0;
      for (const r of clean) {
        const cnt = parseInt(r.voucher, 10);
        if (!cnt || cnt < 1) continue;
        try {
          const found = await findUserForTransfer(r.nickname.trim());
          if (!found.length) { failed++; continue; }
          await issueVoucher(venueId, { title: '순위 시상', count: Math.min(1000, cnt), holderUserId: found[0].id, holderName: found[0].display, note: r.note.trim() || '순위 시상' });
          issued += Math.min(1000, cnt);
        } catch { failed++; }
      }
      toast.show(
        issued > 0
          ? `순위 저장 + 이용권 ${issued}개 지급${failed ? ` · 미지급 ${failed}명(미가입/미인증)` : ''}`
          : '순위 저장 완료 — 닉네임이 일치하는 회원에게 포인트가 반영됩니다',
        'success',
      );
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
        <span className="text-gold-300 font-semibold">닉네임은 필수</span>, 실명·프라이즈는 선택입니다. 프라이즈는 <span className="text-gold-300 font-semibold">매장 커뮤니티 순위 점수</span>로만 쓰입니다(금전적 가치 없음). 실명을 넣으면 손님에게는 <span className="text-gold-300 font-semibold">이름 일부를 가려(예: 나*리)</span> 표시됩니다.
      </p>

      {loading ? (
        <p className="text-center py-8 text-2xs text-ink-muted">불러오는 중…</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li key={i}
              className="grid grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] lg:grid-cols-[2.25rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_minmax(0,1.4fr)_2rem] items-center gap-1.5 rounded-input border border-border-subtle bg-surface-low/40 p-1.5">
              <span className="text-center">
                <span className="block text-sm font-bold text-gold-300 tabular-nums">{i + 1}</span>
                {/* 등수→점수 미리보기(매장 꾸미기 '기준 점수' 반영) */}
                <span className="block text-[9px] font-semibold text-ink-muted tabular-nums">+{placementPointsOf(i + 1, cfg)}점</span>
              </span>
              <div className="relative min-w-0">
                <input
                  type="text" value={row.nickname} maxLength={30}
                  onChange={(e) => onNickInput(i, e.target.value)}
                  onFocus={() => { if (row.nickname.trim()) setSugRow(i); }}
                  onBlur={() => { setTimeout(() => setSugRow((r) => (r === i ? null : r)), 180); checkMember(i, row.nickname); }}
                  placeholder="닉네임 *"
                  className="input w-full min-w-0 text-sm py-2"
                />
                {/* 자동완성 — 장부 명단 → 비회원 등록 → 회원(닉네임 · 실명) 순. 번호 없이 탭해서 선택 */}
                {sugRow === i && row.nickname.trim() !== '' && (
                  <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-input border border-border-default bg-surface-float shadow-dialog">
                    {ledgerNames.filter((n) => n.includes(row.nickname.trim())).slice(0, 4).map((n) => (
                      <li key={'l' + n}>
                        <button type="button" onMouseDown={(e) => { e.preventDefault(); pickSuggestion(i, 'ledger', n); }}
                          className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-surface-high">
                          <span className="shrink-0 rounded-badge bg-gold-300/15 px-1.5 py-0.5 text-[9px] font-bold text-gold-300">장부</span>
                          <span className="truncate font-semibold text-ink-primary">{n}</span>
                        </button>
                      </li>
                    ))}
                    <li>
                      <button type="button" onMouseDown={(e) => { e.preventDefault(); pickSuggestion(i, 'guest', row.nickname.trim()); }}
                        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-surface-high">
                        <span className="shrink-0 rounded-badge bg-surface-high px-1.5 py-0.5 text-[9px] font-bold text-ink-muted">비회원</span>
                        <span className="truncate text-ink-secondary">'{row.nickname.trim()}' 비회원으로 등록</span>
                      </button>
                    </li>
                    {memCands.map((c, ci) => (
                      <li key={'m' + ci}>
                        <button type="button" onMouseDown={(e) => { e.preventDefault(); pickSuggestion(i, 'member', c.nickname, c.realName); }}
                          className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-surface-high">
                          <span className="shrink-0 rounded-badge bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">회원</span>
                          <span className="truncate font-semibold text-ink-primary">{c.nickname}{c.realName ? <span className="font-normal text-ink-muted"> · {c.realName}</span> : null}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {/* 회원 매칭 뱃지 — 미가입이면 기록만 되고 점수·이용권은 안 간다 */}
                {row.member != null && row.nickname.trim() !== '' && (
                  <span className={['pointer-events-none absolute -top-1.5 right-1 rounded-badge px-1 py-0.5 text-[9px] font-bold leading-none',
                    row.member ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-float text-ink-muted'].join(' ')}>
                    {row.member ? '✓ 회원' : '비회원'}
                  </span>
                )}
              </div>
              <input
                type="text" value={row.realName} maxLength={20}
                onChange={(e) => update(i, 'realName', e.target.value)}
                placeholder="실명"
                className="input w-full min-w-0 text-sm py-2"
              />
              <input
                type="text" inputMode="numeric" value={row.prize} maxLength={12}
                onChange={(e) => update(i, 'prize', e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter' && i === rows.length - 1) addRow(); }}
                placeholder="프라이즈"
                className="input w-full min-w-0 text-sm py-2"
              />
              <button
                type="button" onClick={() => removeRow(i)} aria-label="줄 삭제"
                className="h-8 w-8 justify-self-center flex items-center justify-center rounded-input text-ink-muted hover:text-danger-light transition-colors lg:order-last"
              >
                <Icon name="close" size={14} />
              </button>
              {/* 모바일 2줄(고정 그리드로 칸 경계 정렬) · PC는 같은 행에 이어짐 */}
              <div className="relative col-start-2 lg:col-start-5 lg:col-auto min-w-0 lg:w-auto">
                <input type="number" inputMode="numeric" value={row.voucher} onChange={(e) => update(i, 'voucher', e.target.value.replace(/[^\d]/g, ''))} placeholder="이용권" className="input w-full text-sm py-2 pr-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">개</span>
              </div>
              <input type="text" value={row.note} onChange={(e) => update(i, 'note', e.target.value)} maxLength={50} placeholder="비고" className="input col-span-2 lg:col-span-1 w-full min-w-0 text-sm py-2" />
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

// ── 직원 관리 허브(아코디언) ──────────────────────────────────────────────────
function StaffHub({ venueId }: { venueId: string }) {
  const [open, setOpen] = useState<string>('members'); // 한 번에 하나(스크롤 절약)
  const items: { id: string; label: string; node: ReactNode }[] = [
    { id: 'members',  label: '구성원 목록',                 node: <StaffManager venueId={venueId} /> },
    { id: 'schedule', label: '딜러 출근 스케줄',            node: <StaffSchedule venueId={venueId} /> },
    { id: 'wage',     label: '인건비 관리 (시급·급여일·휴무)', node: <StaffWageManager venueId={venueId} /> },
    { id: 'settle',   label: '인건비 정산 (월 급여·총 인건비)', node: <StaffSettlement venueId={venueId} /> },
    { id: 'log',      label: '직원 출근일지',                node: <StaffWorkLog venueId={venueId} /> },
  ];
  return (
    <div className="space-y-2">
      {items.map((it) => {
        const isOpen = open === it.id;
        return (
          <div key={it.id} className="rounded-card border border-border-default bg-surface-low overflow-hidden">
            <button type="button" onClick={() => setOpen(isOpen ? '' : it.id)}
              className="w-full flex items-center justify-between px-3 py-3 text-left hover:bg-surface-high transition-colors">
              <span className="text-sm font-bold text-ink-primary">{it.label}</span>
              <span className="text-gold-300 text-xs">{isOpen ? '▲ 접기' : '▼ 펼치기'}</span>
            </button>
            {isOpen && <div className="px-3 pb-3 border-t border-border-subtle pt-3">{it.node}</div>}
          </div>
        );
      })}
    </div>
  );
}

function StaffManager({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [staff, setStaff] = useState<User[]>([]);
  const [invites, setInvites] = useState<VenueInvite[]>([]);
  const [access, setAccess] = useState<string[]>([]); // 장부·순위 권한 보유 직원 id
  const [vouch, setVouch] = useState<string[]>([]); // 이용권 내역 열람 권한 보유 직원 id
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    Promise.all([getMyVenueStaff(venueId), getMyVenueInvites(venueId), getLedgerAccessUserIds(venueId), getVoucherAccessUserIds(venueId)])
      .then(([s, i, a, va]) => { setStaff(s); setInvites(i); setAccess(a); setVouch(va); })
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
  const toggleVoucher = async (id: string) => {
    const has = vouch.includes(id);
    setVouch((a) => has ? a.filter((x) => x !== id) : [...a, id]);
    try { if (has) await revokeVoucherAccess(venueId, id); else await grantVoucherAccess(venueId, id); }
    catch (e) { toast.show(e instanceof Error ? e.message : '권한 변경 실패', 'error'); reload(); }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setInviting(true);
    try {
      await inviteStaffByEmail(addr, venueId);
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
        <p className="text-center py-6 text-2xs text-ink-muted">불러오는 중…</p>
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
                    <div className="flex flex-wrap items-center gap-2">
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
                      <button type="button" onClick={() => toggleVoucher(s.id)}
                        className={['shrink-0 text-2xs font-bold px-2.5 py-1.5 rounded-badge border transition-colors',
                          vouch.includes(s.id) ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'bg-surface-float text-ink-muted border-border-default'].join(' ')}>
                        이용권내역 {vouch.includes(s.id) ? '✓' : '✗'}
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
