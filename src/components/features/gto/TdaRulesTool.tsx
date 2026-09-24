// src/components/features/gto/TdaRulesTool.tsx — 2026 TDA 규칙(누리홀덤 한글 해설) 열람 + AI 질의응답.
//
// 오너 지시(2026-09-06): GTO 탭에 TDA 규칙을 넣고(2026-09-14 부터 2026 판), "딜러가 카드를 쏟았어요" 처럼 물으면
// "TDA 어디에 의하면 이렇게 진행해야 합니다" 로 답하게 할 것.
//
// ⚠ 이 기능의 유일한 위험은 **없는 조항을 지어내는 것**이다. 규칙 번호를 틀리게 말하는 순간
//   딜러는 손님 앞에서 잘못된 판정을 하게 된다. 그래서 구조를 이렇게 잡았다:
//     ① 먼저 **로컬 검색**으로 관련 규칙을 고른다(tdaSearch — 화면 없이 테스트됨).
//     ② 그 규칙의 **키만** 서버에 넘긴다. 서버(tda-assist)가 canonical 원문을 직접 조립한다.
//        (2026-09-11 변경: 종전엔 클라이언트가 규칙 본문을 프롬프트에 담아 보냈다 — 그 구조에서는
//         클라이언트가 프롬프트에 무엇이든 실을 수 있어 사실상 범용 AI 프록시였다.)
//     ③ 검색 결과가 없으면 **AI 를 아예 부르지 않는다**. 근거 없는 답이 가장 위험하다.
//     ④ AI 가 실패하거나 꺼져 있어도 **찾은 규칙 원문은 그대로 보여 준다** — 그것만으로도 쓸모가 있다.
//   그래서 AI 답변 아래에는 언제나 근거 원문이 함께 펼쳐진다. 사람이 대조할 수 있어야 한다.
//
// 이 도구는 이 앱에 남은 **유일한 외부 생성형 AI 기능**이다(오너 지시 2026-09-11).
import { CHIP_HIT } from './chip';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../atoms/Icon';
import { Skeleton } from '../../atoms/Skeleton';
import { useAuth } from '../../../contexts/AuthContext';
import { askTdaAssist, TDA_QUESTION_MAX } from '../../../api/tdaAssist';
import { searchTda, tdaRuleKey, type Scored } from '../../../lib/tdaSearch';
import type { TdaRule } from '../../../data/tdaRules';
import { loadTdaRules, peekTdaRules, type TdaData } from '../../../lib/tdaRulesLoad';

/** 첫 커밋에 그릴 규칙 카드 수 — 390×844 첫 화면을 넘치게 채우는 양(카드 ≈ 40px). */
const FIRST_RULES = 16;

const EXAMPLES = [
  '딜러가 카드를 쏟았어요',
  '올인인데 칩이 모자라요',
  '내 차례가 아닌데 베팅했어요',
  '쇼다운에서 카드를 안 보여줘요',
];

export default function TdaRulesTool() {
  const { user } = useAuth();
  // 한 번 받았으면 첫 렌더부터 본문(스켈레톤 0) — lib/tdaRulesLoad 모듈 캐시.
  const [data, setData] = useState<TdaData | null>(peekTdaRules);
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('');       // 실제로 답을 만든 질문
  const [answer, setAnswer] = useState('');
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openNo, setOpenNo] = useState<string | null>(null);
  const [section, setSection] = useState<string>('전체');

  // 규칙 본문은 140KB 다 — 첫 화면 번들에 넣지 않는다. GTO 판이 보이면 유휴 시간에 미리 받고(ToolsPanel),
  // 못 받았으면 여기서 받는다. 6000px 커밋은 startTransition 으로 — 모달 진입과 입력을 막지 않게.
  useEffect(() => {
    if (data) return;
    let ok = true;
    loadTdaRules().then((d) => { if (ok) startTransition(() => setData(d)); }, () => { /* 스켈레톤 유지 — 다시 열면 재시도 */ });
    return () => { ok = false; };
  }, [data]);
  // 목록(≈120장)은 첫 커밋에 앞 FIRST_RULES 장만 — 나머지는 transition 으로 이어 그린다.
  //   캐시로 동기 렌더하니 6000px 를 **여는 탭의 커밋 한 번**에 그려 창이 뜨기까지 ~1s(CPU 6배, 실측 2026-09-24)가 걸렸다.
  //   첫 화면(844px)은 앞 몇 장으로 이미 다 찬다 — 뒤는 화면 밖이라 늘어나도 보이지 않는다(스켈레톤 없음).
  const [allRules, setAllRules] = useState(false);
  useEffect(() => {
    if (data && !allRules) startTransition(() => setAllRules(true));
  }, [data, allRules]);

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
      // 서버에는 **키만** 간다 — 원문 조립은 tda-assist 가 자기 rules.json 으로 한다.
      const out = await askTdaAssist(t, found.map(({ rule }) => tdaRuleKey(rule)));
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
            {/* 2026-09-18 오너 지시로 설명줄 제거 — 바로 아래 입력창의 placeholder('예) 딜러가 카드를 쏟았어요')와 예시 칩이 같은 사용법을 이미  */}
          </div>
        </div>

        <form className="mt-2.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={TDA_QUESTION_MAX}
            placeholder="예) 딜러가 카드를 쏟았어요" aria-label="규칙 질문"
            className="input min-h-[44px] min-w-0 flex-1 text-sm" />
          <button type="submit" disabled={busy || q.trim().length < 2}
            className="btn-primary min-h-[44px] shrink-0 px-4 text-sm disabled:opacity-50">
            {busy ? '찾는 중…' : '질문'}
          </button>
        </form>

        <div className="mt-2 flex flex-wrap gap-x-1.5 gap-y-3.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => { setQ(ex); ask(ex); }}
              className={`${CHIP_HIT} min-h-[32px] rounded-chip border border-border-default bg-surface-high px-2.5 py-1 text-2xs text-ink-secondary transition-colors hover:border-accent-400/40 hover:text-accent-300`}>
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
              {/* 이 한 줄은 지우지 말 것 — 모델 요약을 판정으로 읽으면 딜러가 손님 앞에서 틀린다.
                  아래 '근거 규칙' 원문이 언제나 함께 펼쳐지는 것과 짝이다. */}
              <p className="mt-1.5 text-[10px] leading-relaxed text-ink-muted">
                AI 참고 요약입니다 — 아래 근거 규칙 원문을 함께 확인하세요. <b className="text-ink-secondary">최종 판정은 현장 플로어(토너먼트 디렉터)에게 있습니다.</b>
              </p>
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
          <h3 className="min-w-0 flex-1 text-sm font-bold text-ink-primary">2026 TDA 규칙</h3>
          <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{browse.length}개</span>
        </div>
        {/* 가로 스크롤 레일은 위아래를 자른다 — py-1.5(6.375px) 가 칩 히트 확장 자리다(잘려도 44.75px). mt-0.5+py-1.5 = 종전 mt-2 와 같은 위 간격. */}
        <div className="mt-0.5 flex gap-1 overflow-x-auto py-1.5 [scrollbar-width:none]">
          {sections.map((s) => (
            <button key={s} type="button" onClick={() => setSection(s)}
              className={[CHIP_HIT, 'h-[32px] shrink-0 whitespace-nowrap rounded-chip px-2.5 text-2xs font-semibold transition-colors',
                section === s ? 'chip-aura text-white' : 'border border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
              {s}
            </button>
          ))}
        </div>
        <ul className="mt-2 space-y-1.5">
          {(allRules ? browse : browse.slice(0, FIRST_RULES)).map((r) => {
            const key = `${r.section}-${r.no}-${r.title}`;
            return <RuleCard key={key} rule={r} open={openNo === key} onToggle={() => setOpenNo(openNo === key ? null : key)} />;
          })}
        </ul>
      </section>

      {/* 출처 — 원문 권리는 Poker TDA. 한글은 누리홀덤이 쓴 해설이라 번역 크레딧이 없다(2026-09-17, 제3자 번역본 제거).
          🔴 G10(2026-09-20) — Poker TDA 공식 페이지는 규칙을 쓰는 곳에 **지정된 허가·저작권 문구를
          같은 화면에 눈에 띄게** 두고 공식 사이트를 **실제 클릭 가능한 링크**로 걸 것을 요구한다.
          종전에는 자체 축약 문구와 평문 `PokerTDA.com` 뿐이었다 — 원문 문장을 그대로 싣고 링크를 건다.
          ⚠ 문구를 번역하거나 줄이지 않는다(허가 조건 자체가 그 문장이다). 한글 안내는 그 아래 별도 문단. */}
      <p className="px-1 text-[10px] leading-relaxed text-ink-muted">
        TDA rules used by permission of the Poker TDA, Copyright 2026,{' '}
        <a href="http://www.pokertda.com" target="_blank" rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-accent-200">
          http://www.pokertda.com
        </a>
        , All rights reserved.
      </p>
      <p className="px-1 text-[10px] leading-relaxed text-ink-muted">
        출처: Poker TDA 2026 규칙 {data.version}<br />
        한글 해설은 누리홀덤이 작성했습니다. 최종 판단은 언제나 플로어(토너먼트 디렉터)의 재량입니다.<br />
        {/* TDA Rule 5D — 테이블에서의 전략 도구 사용은 제한된다. 이 화면은 학습·복기용이라는 맥락을 분명히 한다. */}
        이 도구는 <b>학습·복기용</b>입니다. 실제 테이블에서의 전자기기·전략 도구 사용은 대회 규칙(TDA Rule 5D)과
        매장 규정에 따라 제한될 수 있습니다.
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
