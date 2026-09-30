// src/components/features/clock/ClockPagesEditor.tsx — 클락 왼쪽 칸 편집(K단계, 2026-09-30).
//
// 한 벌을 두 곳에서 쓴다: [설정](새로 시작 전) · 라이브의 [TV 페이지](진행 중 — config 의 prizes·extraPages 만 바꾼다, 레벨·인원 불변).
//   · 시상 줄: 등수 · 금액(단위) · 업장 문구(text — 있으면 TV 는 금액 대신 이 글자) · 메모.
//   · 추가 페이지(최대 2): 바운티/이벤트/공지/직접 입력/팀 점수(W-11) + 줄(이름표·내용·메모).
//   **머무는 시간 칸은 없다** — 매장 페이지 30초 · 광고 10초는 코드 상수다(lib/clockSlides).
// 상한은 lib/clockSlides 상수(서버 트리거 20260930h 와 같은 수) — maxLength 로 먼저 막는다.
import type { ClockPrizeRow } from '../../../api/clock';
import {
  EXTRA_PAGES_MAX, EXTRA_ROWS_MAX, EXTRA_TITLE_MAX, EXTRA_LABEL_MAX, EXTRA_CONTENT_MAX, EXTRA_NOTE_MAX,
  PRIZE_TEXT_MAX, PRIZE_NOTE_MAX, TEAM_POINTS_MAX, EXTRA_KIND_LABEL, teamStandings,
  type ClockExtraKind, type ClockExtraPage, type ClockExtraRow,
} from '../../../lib/clockSlides';
import { prizeTotalOf, prizeRowShown } from './prizeFit';

/** 깐부 예시 점수표(1st 14 … 12th 1) — 팀 점수 페이지를 새로 만들 때 채워 둔다. 매장이 고친다. */
const TEAM_POINTS_DEFAULT = [14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export default function ClockPagesEditor({ prizes, extraPages, onChange }: {
  prizes: ClockPrizeRow[];
  extraPages: ClockExtraPage[];
  onChange: (patch: { prizes?: ClockPrizeRow[]; extraPages?: ClockExtraPage[] }) => void;
}) {
  const setPrize = (i: number, patch: Partial<ClockPrizeRow>) => onChange({ prizes: prizes.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const addPrize = () => onChange({ prizes: [...prizes, { place: `${prizes.length + 1}위`, amount: 0 }] });
  const removePrize = (i: number) => onChange({ prizes: prizes.filter((_, k) => k !== i) });

  const setPage = (i: number, patch: Partial<ClockExtraPage>) => onChange({ extraPages: extraPages.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const addPage = () => onChange({ extraPages: [...extraPages, { kind: 'bounty', title: '', rows: [{ label: '', content: '' }] }] });
  const removePage = (i: number) => onChange({ extraPages: extraPages.filter((_, k) => k !== i) });
  const setRow = (pi: number, ri: number, patch: Partial<ClockExtraRow>) =>
    setPage(pi, { rows: extraPages[pi].rows.map((r, k) => (k === ri ? { ...r, ...patch } : r)) });
  const setKind = (pi: number, kind: ClockExtraKind) =>
    setPage(pi, kind === 'team' ? { kind, points: extraPages[pi].points?.length ? extraPages[pi].points : TEAM_POINTS_DEFAULT } : { kind });

  const total = prizeTotalOf(prizes.filter(prizeRowShown));

  return (
    <div className="space-y-3">
      {/* 시상 */}
      <section className="rounded-aura border card-aura p-3 space-y-2">
        <p className="text-2xs font-semibold text-ink-secondary">
          상금 <span className="font-normal text-ink-muted">· 금액은 원 단위로 입력 (예: 50만원 → 500000) · 금액 대신 문구를 쓰면 TV 에 문구가 그대로 나갑니다</span>
        </p>
        <div className="space-y-1.5">
          {prizes.map((p, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <input value={p.place} onChange={(e) => setPrize(i, { place: e.target.value })} aria-label={`${i + 1}번째 줄 등수`} className="input w-20 text-sm shrink-0" />
                {/* 단위 표시가 없어 '50'(만원)과 '500000'(원)이 뒤섞였다 → 단위를 명시한다.
                    (이 표는 클락 화면 표시용이다 — 2026-09-05 부터 순위 저장으로 흐르지 않는다.) */}
                <div className="relative flex-1 min-w-0">
                  <input type="number" inputMode="numeric" value={p.amount || ''} onChange={(e) => setPrize(i, { amount: +e.target.value || 0 })}
                    placeholder="500000" aria-label={`${i + 1}번째 줄 금액`} className="input w-full text-sm tabular-nums pr-8" />
                  {/* W-25 — 포스터에서 온 T·GP·포인트 행은 그 단위를 그대로 보여 준다(원으로 환산하지 않는다). */}
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">{p.unit || '원'}{(p.count ?? 1) > 1 ? ` ×${p.count}` : ''}</span>
                </div>
                <button type="button" onClick={() => removePrize(i)} aria-label="상금 줄 삭제" className="hit grid h-8 w-11 shrink-0 place-items-center text-xs text-ink-muted hover:text-danger-light">✕</button>
              </div>
              <div className="flex items-center gap-1.5 pl-[5.375rem] pr-[3.125rem]">
                <input value={p.text ?? ''} maxLength={PRIZE_TEXT_MAX} onChange={(e) => setPrize(i, { text: e.target.value || undefined })}
                  placeholder="문구 (예: 시드권 + 트로피)" aria-label={`${i + 1}번째 줄 시상 문구`} className="input min-w-0 flex-1 text-xs" />
                <input value={p.note ?? ''} maxLength={PRIZE_NOTE_MAX} onChange={(e) => setPrize(i, { note: e.target.value || undefined })}
                  placeholder="메모" aria-label={`${i + 1}번째 줄 메모`} className="input min-w-0 flex-1 text-xs" />
              </div>
            </div>
          ))}
        </div>
        {total && total.amount > 0 && (
          // W-12 — 범위 순위(×자리 수)까지 더한 합. 단위가 섞였으면 합계를 말하지 않는다(TV 와 같은 prizeTotalOf). 문구 줄은 합에 안 들어간다.
          <p className="text-right text-2xs text-ink-muted">
            합계 <b className="text-ink-secondary tabular-nums">{total.amount.toLocaleString()}{total.unit || '원'}</b>
            {!total.unit && total.amount >= 10000 ? ` (${Math.round(total.amount / 10000).toLocaleString()}만원)` : ''}
          </p>
        )}
        <button type="button" onClick={addPrize} className="w-full py-1.5 rounded-input border border-dashed border-border-default text-2xs text-ink-secondary hover:text-accent-300">+ 상금</button>
      </section>

      {/* 추가 페이지 */}
      <section data-testid="clk-extra-editor" className="rounded-aura border card-aura p-3 space-y-2">
        <p className="text-2xs font-semibold text-ink-secondary">
          추가 페이지 <span className="font-normal text-ink-muted">· 최대 {EXTRA_PAGES_MAX}장 · TV 왼쪽 칸에서 시상 다음에 30초씩 넘어갑니다(시간은 고정)</span>
        </p>
        {extraPages.map((pg, pi) => (
          <div key={pi} className="space-y-1.5 rounded-input border border-border-subtle bg-surface-base p-2">
            <div className="flex items-center gap-1.5">
              <select value={pg.kind} onChange={(e) => setKind(pi, e.target.value as ClockExtraKind)} aria-label={`추가 페이지 ${pi + 1} 종류`} className="input w-28 shrink-0 text-xs">
                {(Object.keys(EXTRA_KIND_LABEL) as ClockExtraKind[]).map((k) => <option key={k} value={k}>{EXTRA_KIND_LABEL[k]}</option>)}
              </select>
              <input value={pg.title} maxLength={EXTRA_TITLE_MAX} onChange={(e) => setPage(pi, { title: e.target.value })}
                placeholder="제목 (TV 에 크게)" aria-label={`추가 페이지 ${pi + 1} 제목`} className="input min-w-0 flex-1 text-sm" />
              <button type="button" onClick={() => removePage(pi)} aria-label={`추가 페이지 ${pi + 1} 삭제`} className="hit grid h-8 w-11 shrink-0 place-items-center text-xs text-ink-muted hover:text-danger-light">✕</button>
            </div>
            {pg.kind === 'team' && (
              <label className="block">
                <span className="block text-[11px] text-ink-secondary mb-1">등수별 점수 (1등부터 쉼표로, 최대 {TEAM_POINTS_MAX}개)</span>
                {/* 제어 입력으로 두면 '14, ' 의 쉼표가 즉시 지워져 다음 수를 칠 수 없다 — 칸을 떠날 때 읽는다. */}
                <input key={(pg.points ?? []).join(',')} defaultValue={(pg.points ?? []).join(', ')} aria-label="등수별 점수"
                  onBlur={(e) => setPage(pi, { points: e.target.value.split(/[^0-9]+/).filter(Boolean).map(Number).slice(0, TEAM_POINTS_MAX) })}
                  className="input w-full text-xs tabular-nums" />
              </label>
            )}
            {pg.rows.map((r, ri) => (
              <div key={ri} className="flex items-center gap-1.5">
                <input value={r.label} maxLength={EXTRA_LABEL_MAX} onChange={(e) => setRow(pi, ri, { label: e.target.value })}
                  placeholder={pg.kind === 'team' ? '팀 이름' : '이름표'} aria-label={`페이지 ${pi + 1} ${ri + 1}줄 이름표`} className="input w-28 shrink-0 text-xs" />
                <input value={r.content} maxLength={EXTRA_CONTENT_MAX} onChange={(e) => setRow(pi, ri, { content: e.target.value })}
                  placeholder={pg.kind === 'team' ? '팀원 등수 (예: 1, 7)' : '내용'} aria-label={`페이지 ${pi + 1} ${ri + 1}줄 내용`} className="input min-w-0 flex-1 text-xs" />
                <input value={r.note ?? ''} maxLength={EXTRA_NOTE_MAX} onChange={(e) => setRow(pi, ri, { note: e.target.value || undefined })}
                  placeholder={pg.kind === 'team' ? '팀원 이름' : '메모'} aria-label={`페이지 ${pi + 1} ${ri + 1}줄 메모`} className="input w-32 shrink-0 text-xs" />
                <button type="button" onClick={() => setPage(pi, { rows: pg.rows.filter((_, k) => k !== ri) })} aria-label="줄 삭제"
                  className="hit grid h-8 w-11 shrink-0 place-items-center text-xs text-ink-muted hover:text-danger-light">✕</button>
              </div>
            ))}
            {pg.kind === 'team' && pg.rows.some((r) => r.label.trim()) && (
              // W-11 — TV 와 같은 계산(teamStandings)으로 미리 보여 준다.
              <p className="text-2xs text-ink-muted">
                팀 순위 미리보기 · {teamStandings(pg.points ?? [], pg.rows).map((t) => `${t.rank}위 ${t.team} ${t.total}점`).join(' · ')}
              </p>
            )}
            {pg.rows.length < EXTRA_ROWS_MAX && (
              <button type="button" onClick={() => setPage(pi, { rows: [...pg.rows, { label: '', content: '' }] })}
                className="w-full py-1 rounded-input border border-dashed border-border-default text-2xs text-ink-secondary hover:text-accent-300">+ 줄</button>
            )}
          </div>
        ))}
        {extraPages.length < EXTRA_PAGES_MAX && (
          <button type="button" data-testid="clk-extra-add" onClick={addPage}
            className="w-full py-1.5 rounded-input border border-dashed border-border-default text-2xs text-ink-secondary hover:text-accent-300">+ 추가 페이지</button>
        )}
      </section>
    </div>
  );
}
