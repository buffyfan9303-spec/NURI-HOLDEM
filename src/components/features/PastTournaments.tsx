// src/components/features/PastTournaments.tsx — 일정 탐색 하단 '지난 대회' 아카이브. 2026-09-24 App.tsx 에서 옮겼다(번들 여유 D:
// 목록 아래이고 첫 화면(홈)에 없으므로 shellDeferred 청크로 받는다). 동작·마크업은 옮기기 전과 같다.
import { memo, useEffect, useState } from 'react';
import Icon from '../atoms/Icon';
import type { Schedule } from '../../api/schedules';
import type { RankingEntry } from '../../api/rankings';

// 순위 조회는 여전히 동적 import — criticalPathGraph.contract 의 rankings 금지 목록(12.5:1)과 같은 이유.
const rankingsMod = () => import('../../api/rankings');

// ── 🏁 지난 대회 아카이브 — 일정탐색 하단(완료 대회, 최근 5개) ─────────────────
// 순위가 입력된 대회면 행에 👑 우승자 표시 + 클릭 시 입상 순위 펼침(미입력이면 바로 상세).
const PastTournaments = memo(function PastTournaments({ schedules, onSelect }: { schedules: Schedule[]; onSelect: (s: Schedule) => void }) {
  const today = new Date().toLocaleDateString('en-CA');
  const past = [...schedules]
    .filter((s) => s.approved && s.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const [results, setResults] = useState<Record<string, RankingEntry[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  // ⚠ 의존성을 배열 참조([schedules])로 두면 실시간 갱신·창 복귀·당겨서 새로고침마다
  //   내용이 똑같아도 다시 돈다. 실제로 보는 값(매장·날짜 쌍)을 문자열 키로 만들어 그것에만 반응한다.
  const pastKey = past.map((s) => `${s.venueId ?? ''}:${s.date}`).join('|');
  useEffect(() => {
    const pairs = past.filter((s) => s.venueId).map((s) => ({ venueId: s.venueId as string, date: s.date }));
    if (pairs.length === 0) return;
    let alive = true;
    // 항목마다 1건씩 쏘던 것을 한 번에 — 5요청 → 1요청(데이터가 0행이어도 5건이 나가던 구조였다)
    rankingsMod().then((m) => m.getRankingsBulk(pairs))
      .then((byKey) => {
        if (!alive) return;
        const next: Record<string, RankingEntry[]> = {};
        for (const s of past) {
          const e = s.venueId ? byKey[`${s.venueId}|${s.date}`] : undefined;
          if (e && e.length > 0) next[s.id] = e;
        }
        setResults(next);
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastKey]);
  if (past.length === 0) return null;
  const day = (d: string) => ['일', '월', '화', '수', '목', '금', '토'][new Date(`${d}T00:00:00`).getDay()];
  const medal = (p: number) => (p === 1 ? '1위' : p === 2 ? '2위' : p === 3 ? '3위' : null);
  return (
    <section className="reveal mt-4 overflow-hidden rounded-card border border-border-subtle bg-surface-low">
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <h2 data-testid="past-tournaments" className="flex items-center gap-1 text-xs font-bold text-ink-secondary"><Icon name="trophy" size={13} /> 지난 대회</h2>
        
      </header>
      <ul>
        {past.map((s) => {
          const entries = results[s.id];
          const champ = entries?.find((e) => e.position === 1);
          const opened = openId === s.id;
          return (
            <li key={s.id} className="border-b border-border-subtle last:border-b-0">
              <button type="button"
                onClick={() => (entries ? setOpenId(opened ? null : s.id) : onSelect(s))}
                className={['flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-high/70', opened ? 'bg-surface-high/50' : ''].join(' ')}>
                <span className="shrink-0 rounded-badge bg-surface-high px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-ink-muted">
                  {s.date.slice(5).replace('-', '/')}({day(s.date)})
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{s.title}</span>
                {champ && <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-gold-300"><Icon name="trophy" size={12} />{champ.nickname}</span>}
                <span className="hidden shrink-0 text-xs text-ink-muted sm:inline">{s.pubName}</span>
                <Icon name="chevron-right" size={14} className="shrink-0 text-ink-muted" />
              </button>
              {opened && entries && (
                <div className="border-t border-border-subtle bg-surface-base/40 px-3 py-2 animate-fade-in">
                  <ul className="space-y-1">
                    {[...entries].sort((a, b) => a.position - b.position).slice(0, 5).map((e) => (
                      <li key={`${e.position}-${e.nickname}`} className="flex items-center gap-2 text-sm">
                        <span className="w-8 shrink-0 text-center text-xs font-bold tabular-nums text-ink-muted">
                          {medal(e.position) ?? `${e.position}위`}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">{e.nickname}</span>
                        {/* 상금 표기는 2026-09-05 제거(법적위험완화 v3) — 지난 대회 결과는 등수·닉네임만 */}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => onSelect(s)}
                    className="mt-1.5 text-xs font-semibold text-ink-muted transition-colors hover:text-accent-300">
                    대회 정보 전체 보기 →
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
});

export default PastTournaments;
