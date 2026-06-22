import { useEffect, useState, useDeferredValue, type ReactNode, useRef } from 'react';
import Icon from '../atoms/Icon';
import { useAuth } from '../../contexts/AuthContext';
import { useBackClose } from '../../lib/backstack';
import { useToast } from '../atoms/Toast';
import type { User, VenueInvite } from '../../api/auth';
import { getMyVenueStaff, getMyVenueInvites, inviteStaffByEmail, cancelStaffInvite, removeStaff, setStaffTitle, checkNicknameAvailable, searchMembersForRanking } from '../../api/auth';
import { getVenueRankings, saveVenueRankings, getVenuePageConfig, placementPointsOf, type VenuePageConfig, type RankingEntry } from '../../api/rankings';
import { canAccessLedger, canManagePos, getLedgerAccessUserIds, grantLedgerAccess, revokeLedgerAccess } from '../../api/ledger';
import { getAllVenues, createMyVenue, type Venue } from '../../api/community';
import { uploadPoster } from '../../lib/storage';
import VenueVerificationCard from './VenueVerificationCard';
import NuriPosLedger, { type LedgerSeed } from './NuriPosLedger';
import LedgerStatsPanel, { PosSettingsPanel } from './LedgerStatsPanel';
import TournamentClock from './clock/TournamentClock';
import AnnouncePanel from './AnnouncePanel';
import SeasonPanel from './SeasonPanel';
import PresetManager from './PresetManager';
import KillSwitch from './KillSwitch';
import StaffSchedule from './StaffSchedule';
import { StaffWageManager, StaffSettlement, StaffWorkLog, StaffSelfAttendance } from './StaffPayroll';
import StoreDashboard from './StoreDashboard';
import { VoucherManagePanel } from './VoucherManageModal';
import { iCanViewVouchers, getVoucherAccessUserIds, grantVoucherAccess, revokeVoucherAccess, findUserForTransfer, issueVoucher } from '../../api/vouchers';
import MyPostersTab from './MyPostersTab';
import VenueCustomizePanel, { VenueRankHub } from './VenueCustomizePanel';
import LeaguePanel from './LeaguePanel';
import SectionHeader from '../atoms/SectionHeader';
import { getSchedules, type Schedule } from '../../api/schedules';
import { motion } from 'framer-motion';
import { getLedgerBuyins, getLedgerSession } from '../../api/ledger';

type Section = 'dashboard' | 'posters' | 'presets' | 'ledger' | 'stats' | 'ranking' | 'venueRank' | 'league' | 'staff' | 'settings' | 'clock' | 'attendance' | 'voucher' | 'page';

/** 업주/직원 전용 "매장 관리" 탭 — 장부(POS) · 통계 · 순위 입력 · (업주) 직원 관리 */
export default function VenueManageTab({ schedules, onCreatePoster, onEditPoster, onDeletePoster, deepSection, onConsumeDeepSection }: {
  schedules: Schedule[]; onCreatePoster: () => void; onEditPoster: (id: string) => void; onDeletePoster: (id: string) => void;
  /** 알림 딥링크 등 외부 진입 — 지정 섹션으로 바로 이동(1회 소비) */
  deepSection?: Section | null;
  onConsumeDeepSection?: () => void;
}) {
  const { user, refreshProfile } = useAuth();
  const isOwner = user?.role === 'venue_owner';
  const isAdmin = user?.role === 'admin';
  const canStaff = isOwner || isAdmin; // 직원 관리·POS 설정 접근
  const canPosters = isOwner || isAdmin; // 포스터·예약 관리
  const [adminVenues, setAdminVenues] = useState<Venue[]>([]);
  const [adminVenueId, setAdminVenueId] = useState<string | null>(null);
  // 운영자는 선택한 매장, 그 외는 본인 소속 매장
  const venueId: string | null = isAdmin ? adminVenueId : (user?.venueId ?? null);
  const [section, setSection] = useState<Section | null>(null);
  const [navOpen, setNavOpen] = useState(false); // 모바일 메뉴 아코디언 펼침
  const [ledgerOk, setLedgerOk] = useState(false); // 장부 접근(업주/운영자/권한직원)
  const [manageOk, setManageOk] = useState(false); // 통계·설정(업주/운영자)
  const [voucherView, setVoucherView] = useState(false); // 매장이용권 내역 열람(업주/권한직원)
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [rankingDraft, setRankingDraft] = useState<{ date: string; names: string[]; event?: string } | null>(null);
  const [clockSeed, setClockSeed] = useState<string | null>(null); // 장부→클락 연동 날짜
  const [clockSeedGame, setClockSeedGame] = useState(1); // 장부→클락 연동 게임(game_seq)
  const [ledgerSeed, setLedgerSeed] = useState<LedgerSeed | null>(null); // 게임관리→장부 바로가기
  const [visited, setVisited] = useState<Section[]>([]); // 방문 섹션(최근순) — 마운트 유지(깜빡임 제거), 상한 초과 시 가장 오래된 섹션 정리(메모리 가드)

  // 섹션 이동 공통 — 장부를 메뉴로 직접 열 땐 게임관리 시드를 지워 일반 진입으로
  const gotoSection = (s: Section) => {
    if (s === 'ledger') setLedgerSeed(null);
    setSection(s);
  };
  // 뒤로가기 — 비대시보드 섹션에선 먼저 대시보드로 돌아오고, 그 다음에야 탭을 빠져나가게(일정탐색으로 바로 튐 방지)
  useBackClose(!!section && section !== 'dashboard', () => gotoSection('dashboard'));
  // 방문 섹션을 최근순으로 기록 + 상한(8) 초과 시 가장 오래된 섹션 언마운트(메모리 가드).
  // 잰크는 active 게이팅(클락·라이브·장부)으로 이미 차단했고, 이건 순수 메모리/구독 누적 방지용.
  useEffect(() => {
    if (!section) return;
    setVisited((v) => {
      const next = [...v.filter((x) => x !== section), section];
      return next.length > 8 ? next.slice(next.length - 8) : next;
    });
  }, [section]);

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

  // L4: 권한을 부여받은 직후 창에 다시 포커스되면 권한 재조회 → 재진입/새로고침 없이 탭 갱신
  useEffect(() => {
    if (!venueId || isAdmin) return;
    const recheck = () => {
      Promise.all([canAccessLedger(venueId), canManagePos(venueId), iCanViewVouchers(venueId)])
        .then(([l, m, vv]) => { setLedgerOk(l); setManageOk(m); setVoucherView(vv); })
        .catch(() => { /* keep current */ });
    };
    window.addEventListener('focus', recheck);
    return () => window.removeEventListener('focus', recheck);
  }, [venueId, isAdmin]);

  // 섹션 노출 규칙:
  //  · 직원이 부여받을 수 있는 권한(장부·이용권)은 권한 없어도 '잠금' 탭으로 노출 → 클릭 시 "권한 없음" 안내(휑한 화면 방지).
  //  · 장부에 종속된 순위·클락·출근은 장부 권한이 있을 때만 노출(중복 잠금 방지).
  //  · 업주만 가능한 섹션(포스터·통계·직원·POS)은 직원에게 아예 숨김.
  const available: { id: Section; label: string; locked?: boolean }[] = [{ id: 'dashboard', label: '대시보드' }];
  if (canPosters) available.push({ id: 'posters', label: '포스터·예약' });
  if (canPosters) available.push({ id: 'presets', label: '게임 프리셋' });
  available.push({ id: 'ledger', label: '장부', locked: !ledgerOk });
  if (manageOk) available.push({ id: 'stats',  label: '통계' });
  if (ledgerOk) available.push({ id: 'ranking', label: '순위 입력' });
  if (ledgerOk) available.push({ id: 'venueRank', label: '매장 랭킹' });
  if (ledgerOk) available.push({ id: 'league', label: '연합 리그' });
  if (ledgerOk) available.push({ id: 'clock', label: '클락' });
  if (ledgerOk) available.push({ id: 'attendance', label: '출근 관리' });
  available.push({ id: 'voucher', label: '매장이용권/QR', locked: !(manageOk || voucherView) });
  if (canStaff) available.push({ id: 'page', label: '매장 꾸미기' });
  if (canStaff) available.push({ id: 'staff', label: '직원 관리' });
  if (canStaff) available.push({ id: 'settings', label: '설정' });
  const curItem = available.find((a) => a.id === section);
  // 콘텐츠 전환은 deferred — 내비(탭 하이라이트)는 즉시 반응하고, 무거운 섹션 렌더는 메인스레드를 막지 않고 양보.
  // 폰(저사양 CPU)에서 메뉴 이동 시 동기 렌더가 프레임을 막아 생기던 "치직임/끊김"을 제거.
  const renderSection = useDeferredValue(section);
  const dItem = available.find((a) => a.id === renderSection); // deferred 기준 — 헤더·잠금화면·콘텐츠가 한 번에 원자적으로 전환

  if (!user) return null;
  // 업주: 소속 매장이 없으면 '매장 생성' 화면. 직원: 매장/직원 승인 대기 안내.
  if (!isAdmin && !venueId) {
    if (isOwner) return <VenueCreateForm onCreated={refreshProfile} />;
    return (
      <div className="py-16 text-center text-sm text-ink-muted">
        소속된 매장이 없습니다. 직원 승인 후 이용할 수 있습니다.
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
          {available.length > 1 && (() => {
            const sorted = [...available].sort((a, b) => {
              const fi = (id: Section) => { const i = favs.indexOf(id); return i < 0 ? 999 : i; };
              return fi(a.id) - fi(b.id);
            });
            return (<>
              {/* 모바일: 아코디언 — 현재 메뉴만 보이고, 탭하면 전체 펼침(위로 다 몰지 않게) */}
              <div className="lg:hidden">
                <button type="button" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen}
                  className="flex w-full items-center gap-2 rounded-card border border-gold-400/30 bg-surface-high px-3 py-2.5">
                  <span className="shrink-0 text-gold-300" aria-hidden>{SECTION_ICON[section as Section]}</span>
                  <span className="min-w-0 flex-1 text-left text-sm font-bold text-ink-primary truncate">{curItem?.label ?? '메뉴'}</span>
                  <span className="text-2xs text-ink-muted">{navOpen ? '닫기' : '메뉴'}</span>
                  <Icon name="chevron-down" size={16} className={['shrink-0 text-ink-muted transition-transform', navOpen ? 'rotate-180' : ''].join(' ')} />
                </button>
                {navOpen && (
                  <>
                    <div className="mt-1 grid grid-cols-2 gap-1 rounded-card border border-border-subtle bg-surface-high p-1 animate-slide-up">
                      {sorted.map((a) => {
                        const on = section === a.id;
                        const fav = favs.includes(a.id);
                        return (
                          // 메뉴 이동(좌)과 즐겨찾기 토글(우 ★)을 분리된 탭 타겟으로 — 별이 항상 보여 토글 가능함이 명확
                          <div key={a.id} className={['flex items-center rounded-input transition-colors',
                            on ? 'bg-gold-300' : a.locked ? '' : 'hover:bg-surface-float'].join(' ')}>
                            <button type="button" onClick={() => { gotoSection(a.id); setNavOpen(false); }}
                              className={['flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-2.5 text-xs font-bold',
                                on ? 'text-ink-inverse' : a.locked ? 'text-ink-muted/60' : 'text-ink-secondary'].join(' ')}>
                              <span className="shrink-0" aria-hidden>{SECTION_ICON[a.id]}</span>
                              <span className="min-w-0 flex-1 text-left truncate">{a.label}</span>
                              {a.locked && <Icon name="lock" size={11} className="shrink-0 opacity-70" />}
                            </button>
                            {!a.locked && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); toggleFav(a.id); }}
                                aria-label={fav ? '즐겨찾기 해제' : '즐겨찾기 추가'} aria-pressed={fav}
                                className={['shrink-0 px-2.5 py-2.5 text-base leading-none transition-colors active:scale-90',
                                  fav ? (on ? 'text-ink-inverse' : 'text-gold-300') : (on ? 'text-ink-inverse/45' : 'text-ink-muted/40')].join(' ')}>
                                {fav ? '★' : '☆'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-1 px-1 text-[10px] text-ink-muted">★ 별을 누르면 즐겨찾기로 상단에 고정돼요</p>
                  </>
                )}
              </div>
              {/* PC: 세로 사이드바(기존) */}
              <nav className="hidden lg:flex lg:sticky lg:top-16 lg:w-44 lg:shrink-0 lg:flex-col lg:self-start lg:gap-1">
                {sorted.map((a) => (
                  <SectionBtn key={a.id} icon={SECTION_ICON[a.id]} active={section === a.id} locked={a.locked}
                    fav={favs.includes(a.id)} onToggleFav={() => toggleFav(a.id)}
                    onClick={() => gotoSection(a.id)}>{a.label}</SectionBtn>
                ))}
              </nav>
            </>);
          })()}

          <div className="mt-3 min-w-0 flex-1 space-y-3 lg:mt-0">
            {dItem?.locked && (
              <div className="rounded-card border border-border-default bg-surface-low p-6 text-center space-y-2.5">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-high text-ink-muted"><Icon name="lock" size={22} /></div>
                <p className="text-sm font-bold text-ink-primary">{dItem.label} · 접근 권한이 없습니다</p>
                <p className="text-2xs leading-relaxed text-ink-muted">이 기능은 업주가 권한을 부여해야 사용할 수 있어요.<br />매장 업주에게 <span className="font-semibold text-gold-300">{dItem.id === 'voucher' ? '이용권 내역' : '장부·순위'} 권한</span>을 요청하세요.</p>
              </div>
            )}
            {/* 공용 섹션 헤더 — 모든 섹션의 제목·설명·주 액션 위치/크기를 한 규격으로(콘텐츠와 함께 deferred 전환) */}
            {!dItem?.locked && (
              <SectionHeader
                title={dItem?.label ?? ''}
                desc={renderSection ? SECTION_DESC[renderSection] : ''}
                action={renderSection === 'posters' && canPosters
                  ? <button type="button" onClick={onCreatePoster} className="btn-primary">+ 새 게임</button>
                  : undefined}
              />
            )}
            {/* 방문한 섹션은 마운트 유지 — display 토글만(전환 시 unmount/remount·재fetch·깜빡임 제거). 토글 기준은 deferred 섹션 */}
            {(() => {
              const box = (s: Section, node: ReactNode) => (
                <div key={s} style={renderSection === s && !dItem?.locked ? undefined : { display: 'none' }}>{node}</div>
              );
              return (<>
                {visited.includes('dashboard') && box('dashboard', <>
                  <StoreDashboard venueId={venueId} schedules={schedules} onGoto={(s) => gotoSection(s as Section)} onCreatePoster={onCreatePoster}
                    active={renderSection === 'dashboard'}
                    caps={{ ledger: ledgerOk, manage: manageOk, voucher: manageOk || voucherView, posters: canPosters, staff: canStaff }} />
                  {manageOk && <div className="mt-4"><AnnouncePanel venueId={venueId} /></div>}
                </>)}
                {visited.includes('posters') && canPosters && box('posters', <MyPostersTab schedules={schedules} onCreate={onCreatePoster} onEdit={onEditPoster} onDelete={onDeletePoster}
                  onGotoRanking={ledgerOk ? (date) => { setRankingDraft({ date, names: [] }); setSection('ranking'); } : undefined}
                  onOpenLedger={ledgerOk ? (s, existingDate) => {
                    const schedDate = new Date(s.date).toLocaleDateString('en-CA');
                    setLedgerSeed(existingDate
                      ? { date: existingDate, scheduleId: s.id, isNew: false }
                      : { date: schedDate, scheduleId: s.id, isNew: true, title: s.title, buyinAmount: s.buyIn?.amount ?? 0, gtd: !!s.guaranteed });
                    setSection('ledger');
                  } : undefined} />)}
                {visited.includes('presets') && canPosters && box('presets', <PresetManager venueId={venueId} />)}
                {visited.includes('ledger') && ledgerOk && box('ledger', <NuriPosLedger venueId={venueId} canManage={manageOk} active={renderSection === 'ledger'} seed={ledgerSeed}
                  onMakeRankingDraft={(d, names, ev) => { setRankingDraft({ date: d, names, event: ev ?? '' }); setSection('ranking'); }}
                  onOpenClock={(d, g) => { setClockSeed(d); setClockSeedGame(g); setSection('clock'); }}
                  onOpenStats={manageOk ? () => setSection('stats') : undefined} />)}
                {visited.includes('stats') && manageOk && box('stats', <LedgerStatsPanel venueId={venueId} />)}
                {visited.includes('ranking') && ledgerOk && box('ranking', <RankingEditor venueId={venueId} canEdit={isAdmin || user.approved === true || ledgerOk} draft={rankingDraft} />)}
                {visited.includes('venueRank') && ledgerOk && box('venueRank', <>
                  <SeasonPanel venueId={venueId} canManage={manageOk} />
                  <div className="mt-5 border-t border-border-subtle pt-4"><VenueRankHub venueId={venueId} canConfigure={manageOk} /></div>
                </>)}
                {visited.includes('league') && ledgerOk && box('league', <LeaguePanel venueId={venueId} canConfigure={manageOk} />)}
                {visited.includes('page') && canStaff && box('page', <VenueCustomizePanel venueId={venueId} />)}
                {visited.includes('clock') && ledgerOk && box('clock', <TournamentClock venueId={venueId} canManage={ledgerOk} seedSessionDate={clockSeed} seedGameSeq={clockSeedGame} active={renderSection === 'clock'} />)}
                {visited.includes('attendance') && ledgerOk && box('attendance', <StaffSelfAttendance venueId={venueId} />)}
                {visited.includes('staff') && canStaff && box('staff', <StaffHub venueId={venueId} />)}
                {visited.includes('settings') && canStaff && box('settings', <PosSettingsPanel venueId={venueId} />)}
                {visited.includes('voucher') && (manageOk || voucherView) && box('voucher', <VoucherManagePanel venueId={venueId} />)}
              </>);
            })()}
          </div>
        </div>
      )}

      {/* 위험 구역 — 매장 킬스위치(전체 영구 삭제). 매장 대표 업주에게만 노출. */}
      {isOwner && venueId && <KillSwitch venueId={venueId} />}
    </div>
  );
}

// 섹션 설명 — 공용 SectionHeader에 표시(제목·설명·액션 규격 통일)
const SECTION_DESC: Record<Section, string> = {
  dashboard: '매장 운영 현황을 한눈에 — 오늘 장부·클락·추세·단골',
  posters: '게임(포스터)별 예약 관리 — 게임을 누르면 예약 리스트가 펼쳐집니다',
  presets: '게임 내용·듀레이션을 템플릿으로 저장 — 포스터/장부 없이 만들고 수정',
  ledger: '게임(세션)별 장부 — 날짜·게임명으로 검색해 열람·수정하세요',
  stats: '기간별 매출·엔트리·요일 분석',
  ranking: '대회 순위 등록 — 닉네임이 일치하는 회원에게 점수가 자동 반영됩니다',
  venueRank: '매장 커뮤니티 순위 탭에 노출될 랭킹 보드 설정(금전적 가치 없음)',
  league: '여러 매장이 함께 운영하는 공동 랭킹 — 초대 → 수락 → 통합 순위',
  clock: '토너먼트 타이머 — 장부 연동 시 엔트리·생존이 자동 반영됩니다',
  attendance: '내 출퇴근 기록',
  voucher: '매장이용권 발행·사용 내역 + 매장 QR(이용권·출석 체크인·가입) 인쇄',
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
  presets: ic(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>),
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
  // 모바일: 가로 스크롤 칩 바 — 선택된 칩이 항상 화면 안에 오도록 부드럽게 센터링
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (active && ref.current && window.innerWidth < 1024) {
      ref.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active]);
  return (
    <button type="button" onClick={onClick} ref={ref}
      // 모바일=인라인 칩(아이콘+라벨 한 줄, 1행 가로 스크롤) / PC=세로 리스트. 글씨 13px 가독 유지
      className={['group/nav relative flex shrink-0 snap-start flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-2 text-xs font-semibold transition-colors duration-300 focus:outline-none touch-manipulation lg:w-full lg:shrink lg:justify-start lg:gap-2 lg:py-2.5 lg:text-[13px]',
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
          className={[locked ? '' : 'lg:ml-auto', 'relative hidden lg:inline shrink-0 px-0.5 text-sm leading-none transition-opacity',
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
// 그날 열린 게임 후보 — 메인(포스터 제목) · 사이드(포스터 sideEvents) · 장부(장부만 있는 게임)
type GameOpt = { name: string; kind: 'main' | 'side' | 'ledger' };

function RankingEditor({ venueId, canEdit, draft }: { venueId: string; canEdit: boolean; draft?: { date: string; names: string[]; event?: string } | null }) {
  const toast = useToast();
  const today = new Date().toLocaleDateString('en-CA'); // 로컬 날짜 — UTC 자정 넘김 방지
  const [date, setDate] = useState(draft?.date ?? today);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  // 같은 날 여러 게임(메인+사이드) — 게임(이벤트)별로 순위를 따로 저장. ''=기본 게임
  const [eventName, setEventName] = useState('');
  const [allEntries, setAllEntries] = useState<RankingEntry[]>([]);
  // 그날 열린 게임 후보 = 그날 포스터 제목 + 그날 장부 제목(둘 다 '어떤 게임인지' 선택지)
  const [dayGames, setDayGames] = useState<GameOpt[]>([]);
  useEffect(() => {
    Promise.all([
      getSchedules().then((all: Schedule[]) => all.filter((sc) => sc.venueId === venueId && new Date(sc.date).toLocaleDateString('en-CA') === date)).catch(() => [] as Schedule[]),
      getLedgerSession(venueId, date).then((ls) => (ls.title ? ls.title.trim() : '')).catch(() => ''),
    ]).then(([posters, ledgerTitle]) => {
      const opts: GameOpt[] = [];
      // 포스터 1장 = 메인 게임(제목) + 사이드 게임 여러 개(sideEvents[])
      for (const sc of posters) {
        const t = sc.title.trim();
        if (t) opts.push({ name: t, kind: 'main' });
        for (const se of sc.sideEvents ?? []) {
          const n = (se.name ?? '').trim();
          if (n) opts.push({ name: n, kind: 'side' });
        }
      }
      // 포스터엔 없고 장부만 있는 게임
      if (ledgerTitle && !opts.some((o) => o.name === ledgerTitle)) opts.push({ name: ledgerTitle, kind: 'ledger' });
      // 이름 중복 제거(먼저 등록된 분류 우선: main > side > ledger)
      const seen = new Set<string>();
      setDayGames(opts.filter((o) => (seen.has(o.name) ? false : (seen.add(o.name), true))));
    });
  }, [venueId, date]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 지류 양식 출력용 매장명 + 인증 여부(인증 펍만 지류 발급)
  const [venueName, setVenueName] = useState('');
  const [venueVerified, setVenueVerified] = useState(false);
  useEffect(() => {
    getAllVenues().then((vs) => {
      const v = vs.find((x) => x.id === venueId);
      setVenueName(v?.name ?? '');
      setVenueVerified(v?.verificationStatus === 'verified');
    }).catch(() => {});
  }, [venueId]);
  // 지류(공식 결과 기록지) 출력 — 인증 펍 전용. 수기 기입형(NAME/COUNTRY/EVENT/PLACE/PRIZE/TD SIGN)
  const printPaperForm = () => {
    if (!venueVerified) {
      window.alert('공식 결과 기록지(지류 양식)는 NURI HOLDEM 인증 매장만 사용할 수 있습니다.\n\n비인증 매장은 발급이 불가하니 운영자(관리자)에게 인증을 문의해 주세요.');
      return;
    }
    const w = window.open('', '_blank', 'width=560,height=900');
    if (!w) { toast.show('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도하세요.', 'error'); return; }
    const field = (label: string, sub: string) => `<div class="f"><div class="lb">${label} <span>${sub}</span></div><div class="ln"></div></div>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>NURI HOLDEM · 공식 결과 기록지</title><style>
*{box-sizing:border-box;margin:0}body{font-family:Georgia,'Apple SD Gothic Neo',serif;color:#111;padding:34px 38px}
.top{text-align:center;border-bottom:3px double #1a1a1a;padding-bottom:14px}
.logo{font-size:34px;font-weight:900;letter-spacing:2px}.logo .h{color:#b8932f}
.sub{font-size:12px;letter-spacing:4px;color:#555;margin-top:4px}
.venue{font-size:19px;font-weight:800;margin-top:10px}
.note{font-size:10px;color:#888;margin-top:4px}
.fs{margin-top:26px;display:flex;flex-direction:column;gap:24px}
.f .lb{font-size:13px;font-weight:800;letter-spacing:1px}.f .lb span{font-weight:400;color:#888;font-size:10px;margin-left:6px}
.f .ln{border-bottom:1.6px solid #222;height:34px}
.foot{margin-top:30px;display:flex;justify-content:space-between;align-items:flex-end;font-size:10px;color:#777}
.foot b{color:#b8932f}
@media print{body{padding:18px 24px}}
</style></head><body>
<div class="top">
  <div class="logo">NURI <span class="h">HOLDEM</span></div>
  <div class="sub">OFFICIAL RESULT SLIP</div>
  <div class="venue">${venueName || '매장명'}</div>
  <div class="note">NURI HOLDEM 인증 펍 전용 양식 — 인증 펍 외 사용·발급은 무효입니다.</div>
</div>
<div class="fs">
  ${field('NAME', '성명')}
  ${field('COUNTRY', '국가')}
  ${field('EVENT', '대회명')}
  ${field('PLACE', '순위')}
  ${field('PRIZE', '프라이즈')}
  ${field('TD SIGN', '토너먼트 디렉터 서명')}
</div>
<div class="foot"><span>DATE: ________________</span><span><b>nuriholdem.com</b> · 본 기록지는 금전적 가치가 없습니다</span></div>
<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
</body></html>`);
    w.document.close();
  };
  // 등수→점수 매핑(매장 꾸미기에서 설정) — 입력 시 점수 미리보기에 사용
  const [cfg, setCfg] = useState<VenuePageConfig | null>(null);
  useEffect(() => { getVenuePageConfig(venueId).then(setCfg).catch(() => {}); }, [venueId]);

  // 장부에서 넘어온 초안: 해당 날짜로 이동 + 그 게임(메인/사이드) 제목으로 게임칩 자동 선택
  useEffect(() => {
    if (draft?.date) setDate(draft.date);
    setEventName(draft?.event ?? ''); // 사이드 마감→순위입력 시 그 사이드 title로 바로(메인은 '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    setLoading(true);
    getVenueRankings(venueId, date)
      .then(({ entries }) => { setAllEntries(entries); })
      .catch(() => setAllEntries([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, date]);

  // 선택한 게임(이벤트)의 줄만 편집 — 게임 전환 시 해당 저장본/장부 초안 로드
  useEffect(() => {
    if (loading) return;
    const mine = allEntries.filter((e) => (e.eventName ?? '') === eventName);
    if (mine.length) {
      setRows(mine.map((e) => ({ nickname: e.nickname, realName: e.realName, prize: e.prize ?? '', voucher: '', note: '' })));
    } else if (draft && draft.date === date && draft.names.length && (allEntries.length === 0 || (draft.event ?? '') === eventName)) {
      // 정산 마감 참가자 명단을 닉네임으로 미리 채움(순서는 업주가 정리)
      setRows(draft.names.map((n) => ({ nickname: n, realName: '', prize: '', voucher: '', note: '' })));
    } else {
      setRows([emptyRow()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, allEntries, eventName]);

  const update = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i
      ? { ...row, [k]: v, ...(k === 'nickname' ? { member: null } : {}) } // 닉네임 바뀌면 매칭 재확인
      : row)));
  // 닉네임 blur 시 회원 여부 표시 — 미가입 닉네임도 순위 기록은 되지만 점수·이용권은 안 가는 걸 입력 단계에서 미리 보여준다
  // 자동완성: ①그날 장부 명단 ②비회원 등록 ③회원 검색(닉네임/실명 — 동명이인은 실명으로 구분)
  const [ledgerNames, setLedgerNames] = useState<string[]>([]);
  // 그날 장부 명단(인원·바인 수) — 순위입력에서 '장부 보기'로 펼쳐 참고/추가
  const [ledgerPlayers, setLedgerPlayers] = useState<{ name: string; buyins: number }[]>([]);
  const [ledgerPanelOpen, setLedgerPanelOpen] = useState(false);
  useEffect(() => {
    getLedgerBuyins(venueId, date)
      .then((bs) => {
        setLedgerNames([...new Set(bs.map((b) => b.playerName).filter(Boolean))]);
        const counts = new Map<string, number>();
        for (const b of bs) { const n = (b.playerName ?? '').trim(); if (n) counts.set(n, (counts.get(n) ?? 0) + 1); }
        setLedgerPlayers([...counts.entries()].map(([name, buyins]) => ({ name, buyins })));
      })
      .catch(() => { setLedgerNames([]); setLedgerPlayers([]); });
  }, [venueId, date]);
  const [sugRow, setSugRow] = useState<number | null>(null);     // 드롭다운 열린 행
  const [memCands, setMemCands] = useState<{ nickname: string; realName: string; verified: boolean }[]>([]);
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
  // 장부 명단 → 순위에 추가: 빈 칸 있으면 채우고, 없으면 새 줄. 이미 있으면 무시
  const checkMemberByName = async (n0: string) => {
    const n = n0.trim(); if (!n) return;
    try { const available = await checkNicknameAvailable(n); setRows((r) => r.map((row) => (row.nickname.trim() === n ? { ...row, member: !available } : row))); } catch { /* skip */ }
  };
  const addFromLedger = (name: string) => {
    const n = name.trim(); if (!n) return;
    setRows((r) => {
      if (r.some((row) => row.nickname.trim() === n)) return r;
      const emptyIdx = r.findIndex((row) => !row.nickname.trim() && !row.realName.trim() && !row.prize.trim());
      if (emptyIdx >= 0) return r.map((row, idx) => (idx === emptyIdx ? { ...row, nickname: n, member: null } : row));
      return [...r, { ...emptyRow(), nickname: n }];
    });
    void checkMemberByName(n);
  };
  const addAllFromLedger = () => { for (const p of ledgerPlayers) addFromLedger(p.name); };
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  const save = async () => {
    const clean = rows.filter((r) => r.nickname.trim() || r.realName.trim() || r.prize.trim());
    if (clean.length === 0) return toast.show('순위를 한 명 이상 입력해 주세요', 'error');
    if (clean.some((r) => !r.nickname.trim()))
      return toast.show('각 줄에 닉네임을 입력해 주세요 (실명·프라이즈는 선택)', 'error');
    setSaving(true);
    try {
      await saveVenueRankings(venueId, date, clean.map(({ nickname, realName, prize }) => ({ nickname, realName, prize })), eventName);
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
        <button type="button" onClick={printPaperForm} title="공식 결과 기록지(수기 양식) 인쇄 — 인증 펍 전용"
          className="btn-ghost text-xs px-3 shrink-0 text-gold-300">🖨 지류 양식</button>
      </div>

      {/* 어떤 게임의 순위인지 — 메인(포스터)·사이드(사이드 포스터)·장부·기타로 구분해 선택 */}
      {(() => {
        const saved = new Set(allEntries.map((e) => e.eventName ?? ''));
        const mains = [...new Set(dayGames.filter((g) => g.kind === 'main').map((g) => g.name))];
        const sides = [...new Set(dayGames.filter((g) => g.kind === 'side').map((g) => g.name))];
        const ledgers = [...new Set(dayGames.filter((g) => g.kind === 'ledger').map((g) => g.name))];
        const known = new Set<string>(['', ...mains, ...sides, ...ledgers]);
        // 포스터·장부엔 없지만 이미 저장됐거나(과거 직접추가) 지금 입력 중인 커스텀 게임
        const extras = [...new Set([
          ...[...saved].filter((s) => s && !known.has(s)),
          ...(eventName && !known.has(eventName) ? [eventName] : []),
        ])];

        const chip = (ev: string, k: string, label?: string) => {
          const on = eventName === ev;
          const has = saved.has(ev);
          return (
            <button key={k} type="button" onClick={() => setEventName(ev)}
              className={['text-xs font-bold px-2.5 py-1.5 rounded-input border transition-colors',
                on ? 'bg-gold-300 text-ink-inverse border-gold-300' : 'bg-surface-float text-ink-secondary border-border-default hover:text-ink-primary'].join(' ')}>
              {label ?? ev}{has ? ' ✓' : ''}
            </button>
          );
        };
        const Section = ({ icon, label, hint, children }: { icon: string; label: string; hint: string; children: ReactNode }) => (
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-ink-muted">{icon} {label}<span className="font-normal text-ink-muted/70"> · {hint}</span></p>
            <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
          </div>
        );

        return (
          <div className="rounded-card border border-gold-400/30 bg-gold-300/[0.05] p-2.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-2xs font-bold text-ink-muted shrink-0">🎯 입력 중인 게임</span>
              <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-gold-300">{eventName || '메인 게임(기본)'}</span>
            </div>

            {/* 메인 게임 — 기본 + 그날 포스터 제목 */}
            <Section icon="🏆" label="메인 게임" hint="포스터 메인">
              {chip('', 'g-main-base', '메인(기본)')}
              {mains.map((n) => chip(n, 'g-m-' + n))}
            </Section>

            {/* 사이드 게임 — 사이드 포스터에서 등록된 이벤트(여러 개) */}
            {sides.length > 0 && (
              <Section icon="🎲" label="사이드 게임" hint="사이드 포스터">
                {sides.map((n) => chip(n, 'g-s-' + n))}
              </Section>
            )}

            {/* 장부 게임 — 포스터 없이 장부만 있는 게임 */}
            {ledgers.length > 0 && (
              <Section icon="📒" label="장부 게임" hint="장부에서">
                {ledgers.map((n) => chip(n, 'g-l-' + n))}
              </Section>
            )}

            {/* 기타 — 포스터·장부 없는 게임(직접 추가) */}
            <Section icon="✏️" label="기타 게임" hint="포스터·장부 없음">
              {extras.map((n) => chip(n, 'g-x-' + n))}
              <button type="button"
                onClick={() => { const v = window.prompt('게임 이름 직접 입력 (예: 사이드 2, 새틀라이트, 하이롤러)'); if (v && v.trim()) setEventName(v.trim().slice(0, 40)); }}
                className="text-xs font-bold px-2.5 py-1.5 rounded-input border bg-surface-float text-gold-300 border-dashed border-gold-400/40 hover:bg-gold-300/10">+ 직접 추가</button>
            </Section>

            <p className="text-[10px] leading-relaxed text-ink-muted">하루에 게임이 여러 개면 <b className="text-ink-secondary">게임마다 따로</b> 골라 입력하세요. 메인·사이드·기타를 선택해 순위를 넣으면 그 게임 순위만 따로 저장·표시됩니다. <b className="text-gold-300">✓</b> 표시는 이미 입력된 게임입니다.</p>
          </div>
        );
      })()}

      {/* 그날 장부 명단 — 펼쳐서 참고하며 순위 입력(장부↔순위 직접 연동) */}
      <div className="rounded-card border border-emerald-500/25 bg-emerald-500/[0.04] overflow-hidden">
        <button type="button" onClick={() => setLedgerPanelOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
          <span className="text-2xs font-bold text-emerald-300">📒 그날 장부 명단 {ledgerPlayers.length > 0 ? <span className="text-ink-secondary">({ledgerPlayers.length}명)</span> : <span className="font-normal text-ink-muted">— 연결된 장부 없음</span>}</span>
          <span className="text-2xs text-ink-muted">{ledgerPanelOpen ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>
        {ledgerPanelOpen && (
          <div className="space-y-1.5 border-t border-emerald-500/20 p-2">
            {ledgerPlayers.length === 0 ? (
              <p className="py-1.5 text-center text-2xs text-ink-muted">이 날짜에 연결된 장부 바인 명단이 없습니다. 장부에서 바인을 먼저 기록하면 여기에 손님 명단이 뜹니다.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-ink-muted">장부에 바인한 손님 — <b className="text-emerald-300">＋</b>로 순위에 추가</p>
                  <button type="button" onClick={addAllFromLedger} className="rounded-input border border-emerald-500/40 px-2 py-1 text-2xs font-bold text-emerald-300 hover:bg-emerald-500/10">전체 추가</button>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {ledgerPlayers.map((p) => {
                    const added = rows.some((row) => row.nickname.trim() === p.name);
                    return (
                      <li key={p.name}>
                        <button type="button" onClick={() => addFromLedger(p.name)} disabled={added}
                          className={['flex items-center gap-1 rounded-input border px-2 py-1 text-2xs font-semibold transition-colors',
                            added ? 'border-border-subtle bg-surface-high/40 text-ink-muted' : 'border-emerald-500/40 text-ink-secondary hover:bg-emerald-500/10 hover:text-ink-primary'].join(' ')}>
                          <span>{p.name}</span>
                          <span className="tabular-nums text-ink-muted">{p.buyins}바인</span>
                          <span className={added ? 'text-emerald-400' : 'text-emerald-300'}>{added ? '✓' : '＋'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-2xs text-ink-muted">
        <span className="text-gold-300 font-semibold">닉네임은 필수</span>, 실명·프라이즈는 선택입니다. 등수마다 <span className="text-gold-300 font-semibold">기준 점수(+N점)</span>가 자동 부여되고, 프라이즈는 <span className="text-gold-300 font-semibold">매장 커뮤니티 순위 점수</span>로만 쓰입니다(금전적 가치 없음). 손님 화면엔 <span className="text-gold-300 font-semibold">실명(닉네임) 형식</span>으로 닉네임 일부를 가려 표시됩니다(예: 누리홀덤(나*리)).
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
                  className="input w-full min-w-0 text-sm py-2 pr-7"
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
                          {!c.verified && (
                            <span className="shrink-0 rounded-badge bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-300"
                              title="미인증 회원 — 본인인증 전이라 순위 기록은 되지만 점수·이용권은 사후 미지급될 수 있어요">미인증 ⚠️</span>
                          )}
                          <span className="truncate font-semibold text-ink-primary">{c.nickname}{c.realName ? <span className="font-normal text-ink-muted"> · {c.realName}</span> : null}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {/* 회원 여부 — 체크=회원, 회색 원=비회원(미가입이면 점수·이용권 안 감). 칸 안 작은 아이콘 */}
                {row.member != null && row.nickname.trim() !== '' && (
                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-sm leading-none"
                    title={row.member ? '회원' : '비회원'}>
                    {row.member ? '✅' : '⚪'}
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


      <button type="button" onClick={save} disabled={saving} className="btn-primary w-full disabled:opacity-60">
        {saving ? '저장 중…' : `${date === today ? '오늘' : date} · ${eventName || '메인'} 순위 저장`}
      </button>
    </div>
  );
}

function Lbl({ t, children }: { t: string; children: ReactNode }) {
  return (<label className="block"><span className="mb-1 block text-2xs font-bold text-ink-secondary">{t}</span>{children}</label>);
}

// ── 업주 셀프 매장 생성 폼 — 소속 매장이 없는 업주 진입 화면 ────────────────────
function VenueCreateForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [kakao, setKakao] = useState('');
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState('');
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState('');
  const [busy, setBusy] = useState(false);

  const pickImage = (f: File | null) => {
    setImgFile(f);
    setImgPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ''; });
  };
  const ready = !!(name.trim() && address.trim() && phone.trim());
  const submit = async () => {
    if (!ready) { toast.show('매장 이름·주소·전화번호는 필수입니다', 'error'); return; }
    setBusy(true);
    try {
      let imageUrl: string | undefined;
      if (imgFile && user) imageUrl = await uploadPoster(user.id, imgFile);
      await createMyVenue({
        name: name.trim(), region: region.trim(), address: address.trim(), phone: phone.trim(),
        imageUrl, kakaoUrl: kakao.trim() || undefined, description: desc.trim() || undefined, businessHours: hours.trim() || undefined,
      });
      toast.show('매장이 생성되었습니다 — 운영자 승인 후 일정탐색·커뮤니티에 공개됩니다', 'success');
      await onCreated();
    } catch (e) { toast.show(e instanceof Error ? e.message : '매장 생성 실패', 'error'); }
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 py-6">
      <div className="text-center space-y-1">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-300/15 text-2xl">🏪</div>
        <h2 className="text-base font-extrabold text-ink-primary">내 매장 만들기</h2>
        <p className="text-2xs leading-relaxed text-ink-muted">매장 정보를 입력하면 NURI HOLDEM 커뮤니티에 매장이 등록됩니다.<br />운영자 승인 후 일정탐색·커뮤니티에 공개돼요.</p>
      </div>

      <div className="space-y-3 rounded-card border border-border-default bg-surface-low p-4">
        {/* 대표 이미지(선택) */}
        <div>
          <p className="mb-1 text-2xs font-bold text-ink-secondary">대표 이미지 <span className="font-normal text-ink-muted">(선택)</span></p>
          <label className="flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-input border border-dashed border-border-default bg-surface-base hover:border-gold-400/50">
            {imgPreview
              ? <img src={imgPreview} alt="미리보기" className="h-full w-full object-cover" />
              : <span className="text-2xs text-ink-muted">탭하여 매장 사진 업로드</span>}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <Lbl t="매장 이름 *"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="예) 로티아레나" className="input w-full text-sm" /></Lbl>
        <Lbl t="주소 *"><input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={120} placeholder="예) 서울 강남구 …" className="input w-full text-sm" /></Lbl>
        <div className="grid grid-cols-2 gap-2">
          <Lbl t="전화번호 *"><input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder="02-000-0000" className="input w-full text-sm" /></Lbl>
          <Lbl t="지역 (선택)"><input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={40} placeholder="예) 경기북부" className="input w-full text-sm" /></Lbl>
        </div>
        <Lbl t="카카오톡 채팅방 링크 (선택)"><input value={kakao} onChange={(e) => setKakao(e.target.value)} maxLength={200} placeholder="https://open.kakao.com/…" className="input w-full text-sm" /></Lbl>
        <Lbl t="영업시간 (선택)"><input value={hours} onChange={(e) => setHours(e.target.value)} maxLength={60} placeholder="예) 매일 18:00~익일 04:00" className="input w-full text-sm" /></Lbl>
        <Lbl t="매장 소개 (선택)"><textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={3} placeholder="매장 분위기·특징·이벤트 등을 자유롭게" className="input w-full resize-none text-sm" /></Lbl>

        <button type="button" disabled={!ready || busy} onClick={submit} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-50">
          {busy ? '생성 중…' : '+ 매장 생성하기'}
        </button>
        <p className="text-[10px] text-ink-muted">* 표시는 필수입니다. 생성 후 ‘매장 꾸미기·설정’에서 추가 정보(갤러리·테마·블라인드 등)를 채울 수 있어요.</p>
      </div>
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
