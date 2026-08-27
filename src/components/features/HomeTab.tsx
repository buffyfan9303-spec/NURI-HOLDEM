// src/components/features/HomeTab.tsx
// 홈 — 오너 승인 P1(2026-08-27): '결정 3~5개' 원칙(Envato 2026·APIS 문법).
// 구성: 시간대 인사 → 지금 등록 가능(라이브 실측) → 포스터 캐러셀 → 오늘·내일 일정(P2).
// 검색·날짜·필터(탐색 장치)는 이 화면에 없다 — '전체 일정 ›'로 탐색 화면(구 일정 탭)에 위임.
// GTO(도구) 탭은 그대로 유지 — 탭에서 밀려난 것은 화면이 아니라 '탐색 장치'다.
import { useMemo } from 'react';
import Icon from '../atoms/Icon';
import PosterCarousel from './PosterCarousel';
import WeeklyBestStrip from './WeeklyBestStrip';
import ScheduleCard from './ScheduleCard';
import type { Schedule } from '../../api/schedules';
import type { RegInfo } from '../../lib/regStatus';
import { compareByStartThenBoost } from '../../lib/scheduleSort';
import { useTrainerProgress } from '../../lib/trainerProgress';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

const OPENNOW_SEEN = 'nuri:opennow-seen';
const openNowSeen = () => { try { return localStorage.getItem(OPENNOW_SEEN) === '1'; } catch { return false; } };


/** 시간대 인사 카피(APIS ⑩ 문법) — 장식이 아니라 '지금'의 맥락을 한 줄로 */
function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return '밤이 깊었어요';
  if (h < 11) return '좋은 아침이에요';
  if (h < 17) return '오후의 홀덤';
  if (h < 21) return '오늘 저녁, 어디로 갈까요';
  return '밤의 토너먼트가 열리는 시간';
}

export default function HomeTab({
  schedules, loaded, clocksLoaded, liveCount, regInfoBySchedule, onTools, onSelect, onVenue, onExplore, onLive, onRotiCommunity, active,
}: {
  schedules: Schedule[];
  loaded: boolean;
  /** 지금 클락이 돌아가는 게임 수(라이브 실측) */
  liveCount: number;
  /** 클락 응답 도착 여부 — 도착 전 '지금 등록 가능' 자리 예약 판단 */
  clocksLoaded: boolean;
  onTools: () => void;
  /** 캐러셀 로티아레나 배너 → 로티아레나 매장 커뮤니티 페이지 */
  onRotiCommunity: () => void;
  regInfoBySchedule: ReadonlyMap<string, RegInfo>;
  onSelect: (s: Schedule) => void;
  onVenue: (venueId: string) => void;
  onExplore: () => void;
  onLive: () => void;
  active: boolean;
}) {
  const now = new Date();
  const today = now.toLocaleDateString('en-CA');
  const tomorrow = new Date(now.getTime() + 86400_000).toLocaleDateString('en-CA');

  // 지금 등록 가능 — 클락 실측(regInfo)이 열려 있는 대회만(추정 아님)
  const openNow = useMemo(
    () => schedules
      .filter((s) => s.approved && (regInfoBySchedule.get(s.id)?.msLeft ?? 0) > 0)
      .sort(compareByStartThenBoost)
      .slice(0, 4),
    [schedules, regInfoBySchedule],
  );

  // 오늘·내일 일정(P2 승인: 홈 기본 범위) — 상단 3장에서 결정이 끝나게
  const upcoming = useMemo(
    () => schedules
      .filter((s) => s.approved && (s.date === today || s.date === tomorrow))
      .sort(compareByStartThenBoost)
      .slice(0, 8),
    [schedules, today, tomorrow],
  );

  // 학습 이어가기 — 로컬 트레이너 진행(신규 fetch 0). 학습 이력이 있는 기기만 노출.
  const trainer = useTrainerProgress();
  const showTrainer = trainer.xp > 0 || trainer.today > 0 || trainer.streak > 0;

  const fmtLeft = (ms: number) => {
    const m = Math.floor(ms / 60_000);
    return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
  };
  if (clocksLoaded) {
    try { localStorage.setItem(OPENNOW_SEEN, openNow.length > 0 ? '1' : '0'); } catch { /* noop */ }
  }

  return (
    <div className="hero-aurora pb-section">
      {/* 시간대 인사 + 라이브 맥락 — 홈의 첫 줄은 컨트롤이 아니라 '지금'.
          hero-aurora(딥 플럼 오로라 워시)·text-grad-violet(헤드라인 그라데이션)은
          어워드 레퍼런스 브랜드 모멘트 — 홈 히어로 1곳 한정(과용 금지). */}
      <div className="px-page-x pt-3">
        <p className="text-2xs text-ink-muted">
          {now.getMonth() + 1}/{now.getDate()}({DAYS_KO[now.getDay()]}) · {greeting(now)}
        </p>
        <h2 className="font-display text-xl font-bold tracking-tight text-ink-primary text-grad-violet">
          {liveCount > 0
            ? <>지금 <span className="tabular-nums text-emerald-400 text-grad-keep">{liveCount}</span>개 게임 진행 중</>
            : '오늘의 토너먼트를 찾아보세요'}
        </h2>
      </div>

      {/* 지금 등록 가능 — 라이브 실측이 열려 있을 때만. 지난 방문에 열린 대회가 있던
          기기는 클락 도착 '전'까지 자리를 예약해 삽입 밀림을 없앤다(도착하면 즉시 확정). */}
      {!clocksLoaded && openNowSeen() && openNow.length === 0 && (
        <section className="px-page-x pt-4" aria-hidden>
          <div className="skeleton mb-1.5 h-[22px] w-36" />
          <div className="skeleton h-[60px] rounded-card" />
        </section>
      )}
      {openNow.length > 0 && (
        <section className="px-page-x pt-4">
          <header className="flex items-baseline justify-between pb-1.5">
            <h3 className="font-display text-lg font-bold tracking-tight text-ink-primary">
              지금 등록 가능 <span className="text-sm tabular-nums text-emerald-400">{openNow.length}</span>
            </h3>
            <button type="button" onClick={onLive} className="flex items-center gap-0.5 py-2 -my-2 text-xs font-semibold text-ink-muted hover:text-ink-secondary">
              라이브 <Icon name="chevron-right" size={13} />
            </button>
          </header>
          <div className="divide-y divide-border-subtle overflow-hidden rounded-card bg-surface-low">
            {openNow.map((s) => {
              const reg = regInfoBySchedule.get(s.id);
              return (
                <button key={s.id} type="button" onClick={() => onSelect(s)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-high/50 active:bg-surface-high">
                  {/* 좌측 상태 바 — 선이 아니라 상태 표시(APIS 문법) */}
                  <span aria-hidden className="h-9 w-0.5 shrink-0 rounded-full bg-emerald-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink-primary">{s.title}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {s.pubName} · <span className="text-emerald-400">등록 가능</span>
                      {reg?.msLeft != null && reg.msLeft > 0 && reg.msLeft < 86400_000 && (
                        <span className="tabular-nums"> · 마감까지 {fmtLeft(reg.msLeft)}</span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-badge bg-accent-300/15 px-3 py-1.5 text-xs font-bold text-accent-300">참가</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 포스터 캐러셀 — 고정 배너(로티아레나·도구·NURI) + 부스트 우선 대회 포스터 */}
      <PosterCarousel
        schedules={schedules}
        onSelect={onSelect}
        onBanner={(a) => {
          if (a === 'nurimind') { window.open('https://www.nurimind.co.kr', '_blank', 'noopener'); return; }
          if (a === 'tools') onTools(); else if (a === 'explore') onExplore(); else onRotiCommunity();
        }}
      />

      {/* 오늘·내일 일정 */}
      <section className="px-page-x pt-4">
        <header className="flex items-baseline justify-between pb-1.5">
          <h3 className="font-display text-lg font-bold tracking-tight text-ink-primary">오늘·내일 일정</h3>
          <button type="button" onClick={onExplore} className="flex items-center gap-0.5 py-2 -my-2 text-xs font-semibold text-ink-muted hover:text-ink-secondary">
            전체 일정 <Icon name="chevron-right" size={13} />
          </button>
        </header>
        {!loaded ? (
          <div className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-surface-low" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <div className="skeleton h-16 w-16 shrink-0 rounded-input" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="skeleton h-3.5 w-1/3" />
                  <div className="skeleton h-[19px] w-3/4" />
                  <div className="skeleton h-3.5 w-1/2" />
                  <div className="skeleton h-3.5 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="rounded-card bg-surface-low px-3 py-4">
            <p className="text-sm text-ink-muted">오늘·내일 예정 대회가 아직 없어요.</p>
            <button type="button" onClick={onExplore}
              className="mt-2 inline-flex items-center gap-1 rounded-badge bg-surface-high px-3 py-2 text-xs font-bold text-ink-secondary transition-colors hover:bg-surface-float/70">
              전체 일정에서 찾아보기 <Icon name="chevron-right" size={13} />
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-surface-low">
            {upcoming.map((s, i) => (
              <ScheduleCard key={s.id} mode="list" schedule={s}
                regInfo={regInfoBySchedule.get(s.id)}
                onVenueClick={onVenue}
                onSelect={onSelect}
                priority={i < 4} />
            ))}
          </div>
        )}
      </section>

      {/* 학습 이어가기 — 트레이너 이력 있는 기기만(도구 탭 리텐션 루프의 홈 노출) */}
      {showTrainer && (
        <div className="px-page-x pt-3">
          <button type="button" onClick={onTools}
            className="flex w-full items-center gap-2.5 rounded-card bg-surface-low px-3 py-2.5 text-left transition-colors hover:bg-surface-high/60">
            <span className="text-gold-300"><Icon name="target" size={16} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink-primary">
                {trainer.goalMet ? '오늘 목표 달성 — 한 문제 더?' : `이어서 학습 — 오늘 ${trainer.today}/${trainer.goal}`}
              </span>
              <span className="block text-2xs tabular-nums text-ink-muted">
                {trainer.streak > 0 ? `${trainer.streak}일 연속 · ` : ''}XP {trainer.xp.toLocaleString()}
              </span>
            </span>
            <Icon name="chevron-right" size={15} className="shrink-0 text-ink-muted" />
          </button>
        </div>
      )}

      {/* 커뮤니티 인기글 1행은 오너 지시(2026-08-27)로 제거 — 홈은 일정·포스터에 집중 */}

      {/* 주간 머니인 킹(브라우즈에서 이사) — 홈의 마지막 줄 */}
      <WeeklyBestStrip active={active} />
    </div>
  );
}
