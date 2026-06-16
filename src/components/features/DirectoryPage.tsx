// src/components/features/DirectoryPage.tsx
// SEO 콘텐츠 허브 — 지역별 홀덤펍 디렉토리 + 대회 아카이브.
//   "강남 홀덤", "분당 토너먼트" 류 long-tail 검색용 색인 페이지(딥링크 ?directory=<region>).
//   매장/대회/타 지역 링크를 모두 <a href> 로 렌더 → 크롤러가 따라가는 내부 링크 그래프 형성.
//   SEO 메타·ItemList JSON-LD 는 applyDirectorySeo 가 담당(닫으면 App 의 effect 가 복원).
import { useEffect } from 'react';
import Icon from '../atoms/Icon';
import { applyDirectorySeo } from '../../lib/seo';
import { expandRegions, REGION_CHIPS } from './IntegratedSearchBar';
import type { Venue } from '../../api/community';
import type { Schedule } from '../../api/schedules';

const today = () => new Date().toLocaleDateString('en-CA');
const MAN = 10000;
const venueCode = (v: { slug?: string | null; id: string }) => v.slug || v.id.slice(0, 8);

export default function DirectoryPage({ region, venues, schedules, onVenue, onSchedule, onRegion, onClose }: {
  region: string;
  venues: Venue[];
  schedules: Schedule[];
  onVenue: (id: string) => void;
  onSchedule: (s: Schedule) => void;
  onRegion: (region: string) => void;
  onClose: () => void;
}) {
  const keys = expandRegions([region]);
  const inRegion = (r?: string) => !!r && keys.some((k) => r.includes(k));
  const venuesIn = venues.filter((v) => inRegion(v.region));
  const schedIn = schedules.filter((s) => inRegion(s.region) && s.approved);
  const upcoming = schedIn.filter((s) => s.date >= today()).sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
  const past = schedIn.filter((s) => s.date < today()).sort((a, b) => b.date.localeCompare(a.date));

  // 동적 SEO — 진입 시(데이터 로드 후) 적용. App 의 동기화 effect 는 directoryRegion 일 때 이 함수를 호출하지만,
  // 여기서도 venuesIn/schedIn 이 바뀔 때 갱신해 데이터가 늦게 와도 정확히 반영.
  useEffect(() => {
    applyDirectorySeo(region, venuesIn, schedIn.length);
  }, [region, venuesIn.length, schedIn.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface-base">
      <header className="flex h-header-h shrink-0 items-center gap-2 border-b border-border-subtle px-page-x">
        <button type="button" onClick={onClose} aria-label="닫기" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-high">
          <Icon name="back" size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-ink-primary">{region} 홀덤펍 · 홀덤 대회</h1>
          <p className="truncate text-2xs text-ink-muted">홀덤펍 {venuesIn.length}곳 · 대회 {schedIn.length}개</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-page-x py-section">
          {/* 인트로(검색 노출용 텍스트) */}
          <p className="text-sm leading-relaxed text-ink-secondary">
            <b className="text-ink-primary">{region}</b> 지역 홀덤펍과 홀덤 토너먼트 일정·바이인·상금·결과를 한곳에서 확인하세요.
            {region}에서 홀덤 칠 곳을 찾는다면 NURI HOLDEM 디렉토리에서 매장과 대회를 둘러볼 수 있습니다.
          </p>

          {/* 홀덤펍 목록 */}
          <section>
            <h2 className="mb-2 text-sm font-bold text-ink-primary">🏪 {region} 홀덤펍 <span className="text-gold-300">{venuesIn.length}</span></h2>
            {venuesIn.length === 0 ? (
              <p className="py-4 text-center text-2xs text-ink-muted">아직 등록된 홀덤펍이 없습니다.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {venuesIn.map((v) => (
                  <li key={v.id}>
                    <a href={`/?v=${venueCode(v)}`} onClick={(e) => { e.preventDefault(); onVenue(v.id); }}
                      className="flex items-center gap-2 rounded-card border border-border-subtle bg-surface-low px-3 py-2.5 transition-colors hover:border-gold-400/40">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-sm font-bold text-gold-300">{v.name.slice(0, 1)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-primary">{v.name}</span>
                        <span className="block truncate text-2xs text-ink-muted">{v.region}{v.address ? ` · ${v.address}` : ''}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 예정 대회 */}
          <section>
            <h2 className="mb-2 text-sm font-bold text-ink-primary">📅 예정 대회 <span className="text-gold-300">{upcoming.length}</span></h2>
            {upcoming.length === 0 ? (
              <p className="py-4 text-center text-2xs text-ink-muted">예정된 대회가 없습니다.</p>
            ) : (
              <ul className="space-y-1.5">
                {upcoming.slice(0, 40).map((s) => <TournRow key={s.id} s={s} onSchedule={onSchedule} fmtDate={fmtDate} />)}
              </ul>
            )}
          </section>

          {/* 지난 대회(결과 아카이브) */}
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold text-ink-primary">🏁 지난 대회 <span className="text-ink-muted">{past.length}</span> <span className="text-2xs font-normal text-ink-muted">— 결과·정보</span></h2>
              <ul className="space-y-1.5">
                {past.slice(0, 30).map((s) => <TournRow key={s.id} s={s} onSchedule={onSchedule} fmtDate={fmtDate} past />)}
              </ul>
            </section>
          )}

          {/* 다른 지역 — 내부 링크(크롤 + 사용자 탐색) */}
          <section className="border-t border-border-subtle pt-4">
            <h2 className="mb-2 text-2xs font-bold text-ink-muted">다른 지역 홀덤펍 둘러보기</h2>
            <nav className="flex flex-wrap gap-1.5" aria-label="지역 디렉토리">
              {REGION_CHIPS.filter((r) => r !== region).map((r) => (
                <a key={r} href={`/?directory=${encodeURIComponent(r)}`} onClick={(e) => { e.preventDefault(); onRegion(r); }}
                  className="rounded-full border border-border-subtle bg-surface-low px-3 py-1.5 text-2xs font-semibold text-ink-secondary transition-colors hover:border-gold-400/40 hover:text-gold-300">
                  {r} 홀덤
                </a>
              ))}
            </nav>
          </section>
        </div>
      </div>
    </div>
  );
}

function TournRow({ s, onSchedule, fmtDate, past }: { s: Schedule; onSchedule: (s: Schedule) => void; fmtDate: (d: string) => string; past?: boolean }) {
  return (
    <li>
      <a href={`/?s=${s.id}`} onClick={(e) => { e.preventDefault(); onSchedule(s); }}
        className={['flex items-center gap-2.5 rounded-card border px-3 py-2.5 transition-colors', past ? 'border-border-subtle bg-surface-low/60 hover:border-border-default' : 'border-gold-400/25 bg-surface-low hover:border-gold-400/50'].join(' ')}>
        <span className="shrink-0 rounded-badge bg-surface-high px-1.5 py-0.5 text-2xs font-bold tabular-nums text-gold-300">{fmtDate(s.date)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink-primary">{s.title}</span>
          <span className="block truncate text-2xs text-ink-muted">
            {s.pubName}{s.startTime ? ` · ${s.startTime}` : ''}{s.guaranteed && s.prizePool ? ` · ${Math.round(s.prizePool / MAN).toLocaleString()}만 GTD` : ''}
          </span>
        </span>
      </a>
    </li>
  );
}
