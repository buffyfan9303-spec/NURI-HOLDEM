// src/components/features/gto/TdaRulesTool.tsx — 2024 TDA 규칙(한글 번역본) 열람 + AI 질의응답.
//
// 오너 지시(2026-09-06): GTO 탭에 2024 TDA 를 넣고, "딜러가 카드를 쏟았어요" 처럼 물으면
// "TDA 어디에 의하면 이렇게 진행해야 합니다" 로 답하게 할 것.
//
// ⚠ 이 기능의 유일한 위험은 **없는 조항을 지어내는 것**이다. 규칙 번호를 틀리게 말하는 순간
//   딜러는 손님 앞에서 잘못된 판정을 하게 된다. 그래서 구조를 이렇게 잡았다:
//     ① 먼저 **로컬 검색**으로 관련 규칙을 고른다(tdaSearch — 화면 없이 테스트됨).
//     ② 그 발췌만 AI 에 근거로 넘긴다. 전체 규칙을 넘기지 않는다(비용·환각 둘 다 커진다).
//     ③ 검색 결과가 없으면 **AI 를 아예 부르지 않는다**. 근거 없는 답이 가장 위험하다.
//     ④ AI 가 실패하거나 꺼져 있어도 **찾은 규칙 원문은 그대로 보여 준다** — 그것만으로도 쓸모가 있다.
//   그래서 AI 답변 아래에는 언제나 근거 원문이 함께 펼쳐진다. 사람이 대조할 수 있어야 한다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../atoms/Icon';
import { Skeleton } from '../../atoms/Skeleton';
import { useAuth } from '../../../contexts/AuthContext';
import { aiGenerate } from '../../../api/ai';
import { searchTda, toContext, TDA_SYSTEM, type Scored } from '../../../lib/tdaSearch';
import type { TdaRule } from '../../../data/tdaRules';

const EXAMPLES = [
  '딜러가 카드를 쏟았어요',
  '올인인데 칩이 모자라요',
  '내 차례가 아닌데 베팅했어요',
  '쇼다운에서 카드를 안 보여줘요',
];

export default function TdaRulesTool() {
  const { user } = useAuth();
  const [data, setData] = useState<{ rules: TdaRule[]; version: string } | null>(null);
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('');       // 실제로 답을 만든 질문
  const [answer, setAnswer] = useState('');
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openNo, setOpenNo] = useState<string | null>(null);
  const [section, setSection] = useState<string>('전체');

  // 규칙 본문은 140KB 다 — 이 도구를 열 때만 내려받는다(도구 탭 첫 화면을 무겁게 하지 않는다).
  useEffect(() => {
    let ok = true;
    import('../../../data/tdaRules').then((m) => { if (ok) setData({ rules: m.TDA_RULES, version: m.TDA_VERSION }); });
    return () => { ok = false; };
  }, []);

  const hits: Scored[] = useMemo(
    () => (data && asked ? searchTda(data.rules, asked, 6) : []),
    [data, asked],
  );

  const ask = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || !data) return;
    setAsked(t); setAnswer(''); setAiErr(null);
    const found = searchTda(data.rules, t, 6);
    if (found.length === 0) { setAiErr('관련 규칙을 찾지 못했어요. 다른 말로 물어봐 주세요.'); return; }
    if (!user) { setAiErr('AI 답변은 로그인 후 이용할 수 있어요. 아래 규칙 원문은 그대로 보실 수 있습니다.'); return; }
    setBusy(true);
    try {
      const out = await aiGenerate(
        `상황: ${t}\n\n아래는 관련 있는 TDA 2024 규칙 발췌다. 이것만 근거로 답하라.\n\n${toContext(found)}`,
        TDA_SYSTEM,
      );
      setAnswer(out);
    } catch (e) {
      // AI 가 실패해도 규칙은 아래에 그대로 있다 — '아무것도 못 얻는 실패'로 끝내지 않는다.
      setAiErr(e instanceof Error ? e.message : 'AI 답변을 받지 못했어요. 아래 규칙 원문을 확인해 주세요.');
    } finally { setBusy(false); }
  }, [data, user]);

  const sections = useMemo(() => (data ? ['전체', ...Array.from(new Set(data.rules.map((r) => r.section)))] : ['전체']), [data]);
  const browse = useMemo(
    () => (data ? data.rules.filter((r) => section === '전체' || r.section === section) : []),
    [data, section],
  );

  if (!data) {
    return <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  }

  return (
    <div className="space-y-3">
      {/* 질문 — 이 도구의 주 진입점 */}
      <section className="rounded-aura border card-aura p-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-cyan">
            <Icon name="sparkles" size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-ink-primary">규칙 물어보기</h3>
            <p className="text-2xs text-ink-muted">상황을 그대로 적으면 해당 규칙을 찾아 드려요</p>
          </div>
        </div>

        <form className="mt-2.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="예) 딜러가 카드를 쏟았어요" aria-label="규칙 질문"
            className="input min-h-[44px] min-w-0 flex-1 text-sm" />
          <button type="submit" disabled={busy || q.trim().length < 2}
            className="btn-primary min-h-[44px] shrink-0 px-4 text-sm disabled:opacity-50">
            {busy ? '찾는 중…' : '질문'}
          </button>
        </form>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => { setQ(ex); ask(ex); }}
              className="rounded-chip border border-border-default bg-surface-high px-2.5 py-1 text-2xs text-ink-secondary transition-colors hover:border-accent-400/40 hover:text-accent-300">
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* 답변 + 근거 */}
      {asked && (
        <section className="rounded-aura border card-aura p-3">
          <p className="text-2xs text-ink-muted">질문</p>
          <p className="mt-0.5 text-sm font-bold text-ink-primary break-keep">{asked}</p>

          {busy && <div className="mt-2 space-y-1.5" aria-busy="true"><Skeleton className="h-4" /><Skeleton className="h-4 w-4/5" /></div>}

          {answer && (
            <div className="mt-2.5 rounded-input border border-cyan-400/30 bg-cyan-400/[0.06] p-2.5">
              <p className="mb-1 flex items-center gap-1 text-2xs font-bold text-cyan-300">
                <Icon name="sparkles" size={11} className="shrink-0" />AI 안내
              </p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-primary break-keep">{answer}</p>
            </div>
          )}
          {aiErr && (
            <p className="mt-2.5 flex items-start gap-1.5 rounded-input border border-border-default bg-surface-high px-2.5 py-2 text-2xs leading-relaxed text-ink-secondary">
              <Icon name="info" size={12} className="mt-px shrink-0 text-ink-muted" />
              <span>{aiErr}</span>
            </p>
          )}

          {hits.length > 0 && (
            <>
              <p className="mt-3 text-2xs font-bold text-ink-secondary">근거 규칙 {hits.length}건</p>
              <ul className="mt-1.5 space-y-1.5">
                {hits.map(({ rule }) => <RuleCard key={`${rule.section}-${rule.no}-${rule.title}`} rule={rule} defaultOpen />)}
              </ul>
            </>
          )}
        </section>
      )}

      {/* 전체 열람 */}
      <section className="rounded-aura border card-aura p-3">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 text-sm font-bold text-ink-primary">2024 TDA 규칙</h3>
          <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{browse.length}개</span>
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
          {sections.map((s) => (
            <button key={s} type="button" onClick={() => setSection(s)}
              className={['shrink-0 whitespace-nowrap rounded-chip px-2.5 py-1 text-2xs font-semibold transition-colors',
                section === s ? 'chip-aura text-white' : 'border border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
              {s}
            </button>
          ))}
        </div>
        <ul className="mt-2 space-y-1.5">
          {browse.map((r) => {
            const key = `${r.section}-${r.no}-${r.title}`;
            return <RuleCard key={key} rule={r} open={openNo === key} onToggle={() => setOpenNo(openNo === key ? null : key)} />;
          })}
        </ul>
      </section>

      {/* 출처 — 번역본은 번역자에게 저작권이 있다. 표기를 지우지 말 것. */}
      <p className="px-1 text-[10px] leading-relaxed text-ink-muted">
        출처: POKER TOURNAMENT DIRECTORS ASSN. {data.version} · © 2024 Poker TDA (use policy: PokerTDA.com)<br />
        한글 번역: 안성준 · Copyright 2024 Sungjoon Ahnn. 최종 판단은 언제나 플로어(토너먼트 디렉터)의 재량입니다.
      </p>
    </div>
  );
}

function RuleCard({ rule, open, defaultOpen, onToggle }: {
  rule: TdaRule; open?: boolean; defaultOpen?: boolean; onToggle?: () => void;
}) {
  const [self, setSelf] = useState(!!defaultOpen);
  const isOpen = onToggle ? !!open : self;
  const head = rule.no !== null ? `규칙 ${rule.no}` : rule.section;
  return (
    <li className="overflow-hidden rounded-input border border-border-default bg-surface-high">
      <button type="button" onClick={onToggle ?? (() => setSelf((v) => !v))} aria-expanded={isOpen}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        <span className="shrink-0 rounded-chip bg-accent-300/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-accent-200">{head}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink-primary">{rule.title}</span>
        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} className="shrink-0 text-ink-muted" />
      </button>
      {isOpen && (
        <div className="border-t border-border-subtle px-2.5 py-2">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary break-keep">{rule.body}</p>
          <p className="mt-1.5 text-[10px] text-ink-muted">{rule.section} · {rule.page}쪽</p>
        </div>
      )}
    </li>
  );
}
