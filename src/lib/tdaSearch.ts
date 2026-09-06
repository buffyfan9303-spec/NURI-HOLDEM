// src/lib/tdaSearch.ts — TDA 규칙 검색(순수 함수).
//
// 왜 별도 파일인가: 이게 AI 답변의 **근거를 고르는** 단계다. 여기서 엉뚱한 규칙을 집으면
// AI 는 그 엉뚱한 규칙을 확신에 차서 인용한다 — 규칙 번호를 틀리게 말하는 순간 이 기능은 해롭다.
// 그래서 화면 없이 테스트할 수 있게 떼어 뒀다(tdaSearch.test.ts).
//
// 한국어 검색의 현실적 타협 세 가지:
//  ① 형태소 분석기를 넣지 않는다(번들 수십 KB + 로딩). 대신 **조사 한 글자를 떼어 본다** —
//     '카드를/카드가/카드는' 이 '카드' 에 걸리게. 3글자 이상 토큰에만 적용해 '이가'·'을지' 같은 낱말을 안 부순다.
//  ② 데이터에 **구어체 키워드**를 미리 심어 뒀다(tdaRules.ts). 검색 품질의 대부분은 거기서 온다.
//  ③ 점수는 '어디에서 맞았나' 로 준다: 키워드 > 제목 > 본문. 본문은 흔한 말이 많아 가중치가 낮다.
import type { TdaRule } from '../data/tdaRules';

const norm = (s: string) => s.toLowerCase().replace(/[\s.,·!?~"'()[\]{}<>:;/\\-]+/g, '');

/** 조사로 보이는 끝 한 글자를 떼어 본 변형까지 — 원형과 함께 돌려준다. */
function variants(tok: string): string[] {
  const out = [tok];
  if (tok.length >= 3 && /[은는이가을를의에서도로과와만]$/.test(tok)) out.push(tok.slice(0, -1));
  return out;
}

export interface Scored { rule: TdaRule; score: number }

/**
 * 질문 → 관련 규칙(점수순). 아무것도 안 걸리면 빈 배열이다(억지로 채우지 않는다 —
 * 근거 없는 규칙을 AI 에 먹이면 없는 조항을 만들어 낸다).
 */
export function searchTda(rules: TdaRule[], query: string, limit = 6): Scored[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const phrase = norm(q);
  const toks = q.split(/\s+/).filter((t) => t.length >= 2).flatMap(variants).map(norm).filter(Boolean);
  if (!toks.length && !phrase) return [];

  const out: Scored[] = [];
  for (const r of rules) {
    const kw = r.keywords.map(norm);
    const title = norm(r.title);
    const body = norm(r.body);
    let score = 0;

    // 질문 전체가 키워드에 통째로 걸리면 그게 가장 강한 신호다
    if (phrase.length >= 3 && kw.some((k) => k.includes(phrase) || phrase.includes(k))) score += 12;
    if (phrase.length >= 3 && title.includes(phrase)) score += 8;

    const seen = new Set<string>();
    for (const t of toks) {
      if (seen.has(t)) continue;      // 같은 토큰이 조사 변형으로 두 번 점수를 먹지 않게
      seen.add(t);
      if (kw.some((k) => k.includes(t))) score += 6;
      else if (title.includes(t)) score += 4;
      else if (body.includes(t)) score += 1;
    }
    // 번호로 직접 찾기 — '43번', '규칙 43'
    const m = q.match(/(?:규칙\s*)?(\d{1,2})\s*번?/);
    if (m && r.no === Number(m[1])) score += 20;

    if (score > 0) out.push({ rule: r, score });
  }
  return out.sort((a, b) => b.score - a.score || (a.rule.no ?? 999) - (b.rule.no ?? 999)).slice(0, limit);
}

/** AI 에게 넘길 근거 묶음 — 규칙 번호를 **반드시** 함께 넘긴다(그게 인용의 근거다). */
export function toContext(hits: Scored[]): string {
  return hits.map(({ rule: r }) => {
    const head = r.no !== null ? `규칙 ${r.no}. ${r.title}` : `${r.section} — ${r.title}`;
    return `[${head}] (${r.section}, ${r.page}쪽)\n${r.body}`;
  }).join('\n\n---\n\n');
}

export const TDA_SYSTEM = [
  '너는 포커 토너먼트 디렉터를 돕는 규칙 안내자다. 아래 제공된 TDA 2024 규칙 발췌만을 근거로 답한다.',
  '답변 형식: ① 첫 줄에 결론(무엇을 해야 하는가) ② 그 아래 "근거: 규칙 N. 제목" 형태로 인용 ③ 필요하면 예외·주의.',
  '반드시 지킬 것:',
  '- 제공된 발췌에 없는 내용은 지어내지 않는다. 근거가 부족하면 "제공된 규칙만으로는 단정할 수 없습니다"라고 먼저 말한다.',
  '- 규칙 번호를 추측하지 않는다. 발췌에 적힌 번호만 인용한다.',
  '- 마지막 줄에 항상 "최종 판단은 플로어(토너먼트 디렉터)의 재량입니다."를 붙인다. 규칙 1이 그렇게 정한다.',
  '- 한국어로, 3~6문장으로 간결하게 답한다.',
].join('\n');
