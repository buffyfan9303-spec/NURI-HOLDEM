# Claude 모델 성능·가격 조사 — Opus 5.5 / Sonnet 5.5 / Fable 5.1 (+ Sonnet 5, Haiku 4.5 비교)

조사일 2026-09-29. 규칙: 1차 자료(anthropic.com·platform.claude.com·code.claude.com·support.claude.com·시스템카드) 우선,
독립 측정은 Artificial Analysis·tbench.ai(Terminal-Bench 공식)만 신뢰도 있게 채택. `morphllm.com`·`benchlm.ai`·`kingy.ai`·`vellum.ai` 블로그 등은
**2차 집계 블로그(신뢰도 낮음, 대조용으로만 병기)**로 표시. 확인 못한 수치는 "미확인"으로 두고 추정하지 않음.

---

## 1. 모델 스펙 표 (출처: [platform.claude.com/docs/en/models/overview](https://platform.claude.com/docs/en/models/overview) — 1차)

| 항목 | Fable 5.1 | Opus 5.5 | Sonnet 5.5 | Haiku 4.5 |
|---|---|---|---|---|
| 설명(공식) | "For demanding reasoning and long-horizon agentic work" | "For long-running agentic coding and knowledge work" | "The best combination of speed and intelligence" | "The fastest model with near-frontier intelligence" |
| 상대 지연(공식 표기) | Slower | Moderate | Fast | Fastest |
| 컨텍스트 창 | 1M 토큰 | 1M 토큰 | 1M 토큰 | 200K 토큰 |
| 최대 출력(동기 Messages API) | 128K 토큰 | 128K 토큰 | 128K 토큰 | 64K 토큰 |
| Batch API 300K 출력 beta 지원 | — | 지원 | 지원 | 미기재 |
| 기본 effort | `high` | `medium` | `high` | 미지원(effort 파라미터 없음) |
| Thinking | Adaptive(항상 켜짐, 끌 수 없음) | Adaptive(항상 켜짐, 끌 수 없음) | Adaptive | Extended(수동) |
| API 모델 ID | `claude-fable-5-1` | `claude-opus-5-5` | `claude-sonnet-5-5` | `claude-haiku-4-5-20251001` |
| 신뢰 가능 지식 컷오프 | 2026-06 | 2026-06 | 2026-06 | 2025-02 |
| 학습데이터 컷오프 | 2026-06 | 2026-06 | 2026-06 | 2025-07 |
| 은퇴 예정일(1차 플랫폼 기준) | 2027-09-01 이전 아님 | 2027-09-22 이전 아님 | 2027-09-28 이전 아님 | 2026-10-15 이전 아님 |

참고: `claude-sonnet-5`(비교 기준)는 legacy로 여전히 제공. 1M 토큰 컨텍스트는 "대략 555k 단어/2.5M 유니코드 문자"(공식 각주).

## 2. 출시일 (1차: 각 모델 공식 발표 페이지)

| 모델 | 출시일 | 출처 |
|---|---|---|
| Opus 5.5 | 2026-09-22 | [anthropic.com/claude-opus-5-5](https://www.anthropic.com/claude-opus-5-5) |
| Sonnet 5.5 | 2026-09-28 | [anthropic.com/claude-sonnet-5-5](https://www.anthropic.com/claude-sonnet-5-5) |
| Fable 5.1 / Mythos 5.1 | 2026-09월 초(Fable 5.1 AWS GA 공지는 2026-09) | [aws.amazon.com/.../claude-fable-5-1-aws](https://aws.amazon.com/about-aws/whats-new/2026/09/claude-fable-5-1-aws/), [anthropic.com/claude-fable-and-mythos-5-1](https://www.anthropic.com/claude-fable-and-mythos-5-1) |

## 3. Effort 단계 지원 (1차: [platform.claude.com/docs/en/build-with-claude/effort](https://platform.claude.com/docs/en/build-with-claude/effort))

- **Fable 5.1 / Mythos 5.1**: `low`·`medium`·`high`(기본)·`xhigh`·`max` 전부 지원. 권장: "high 로 시작, 능력 민감한 에이전트·코딩은 xhigh/max, 정형화된 반복 작업은 medium/low로 하향."
- **Opus 5.5**: 5단계 전부 지원, 기본은 **`medium`**(이전 Opus 계열은 `high`가 기본이었으므로 effort 미지정 요청은 Opus 5 대비 한 단계 낮게 돎 — 공식 문구: "a request that omits effort runs one level lower than it did on Claude Opus 5"). Adaptive thinking을 끌 수 없어 `thinking: {"type":"disabled"}`는 모든 effort에서 400 에러.
- **Sonnet 5.5**: 5단계 전부 지원, 기본 `high`. "levels are recalibrated" — Sonnet 5의 같은 레벨과 동일한 사고량이 아니므로 새로 스윕 권장. `thinking: {"type":"between_tools"}`로 사전사고 끌 수 있음(low/medium/high에서만; xhigh/max는 400 에러).
- **Haiku 4.5**: effort 파라미터 미지원.
- **Sonnet 5**: 5단계 지원, 기본 `high`.
- 중간대화 effort 변경(per-message, beta, 헤더 `mid-conversation-output-config-2026-07-01`)은 Fable 5.1·Mythos 5.1·Opus 5.5·Opus 5·Sonnet 5.5에서 캐시 보존하며 가능. Fable 5(구버전)는 미지원(400 에러).

### code.claude.com(Claude Code) 관찰 (2차 — GitHub 이슈·claude.com 블로그, 구체 문서 원문 미확보)
- Claude Code의 effort 기본값: "모든 지원 모델은 high가 기본, 단 Opus 5.5는 medium이 기본" — platform 문서와 일치.
- "Opus 5.5부터 최상위 effortLevel 설정이 무시되고 모델별 기본값(Opus 5.5는 medium)에서 시작, 모델별로 레벨을 골라야 한다"는 서술은 GitHub 이슈(`TheVoskamps/claude-config#133`) 및 관련 블로그에서 나온 것으로 **code.claude.com/docs/en/model-config 원문 자체를 직접 인용하지 못함 — 미확인으로 표기**.

## 4. API 가격 (1차: [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing))

| 모델 | 입력 | 5분 캐시쓰기 | 1시간 캐시쓰기 | 캐시읽기(히트) | 출력 | 캐시읽기 배율 |
|---|---|---|---|---|---|---|
| Fable 5.1 | $10/MTok | $12.50/MTok | $20/MTok | **$0.25/MTok** | $50/MTok | 0.025x (Fable 5는 0.1x=$1.00) |
| Opus 5.5 | $4/MTok | $5/MTok | $8/MTok | **$0.20/MTok** | $20/MTok | 0.05x |
| Opus 5(비교) | $5/MTok | $6.25/MTok | $10/MTok | $0.50/MTok | $25/MTok | 0.1x |
| Sonnet 5.5 | $2/MTok | $2.50/MTok | $4/MTok | $0.20/MTok | $10/MTok | 0.1x |
| Sonnet 5(비교) | $2/MTok(舊 도입가가 정가로 확정, 인상 취소됨) | $2.50/MTok | $4/MTok | $0.20/MTok | $10/MTok | 0.1x |
| Haiku 4.5(비교) | $1/MTok | $1.25/MTok | $2/MTok | $0.10/MTok | $5/MTok | 0.1x |

- **Fast mode**(research preview, Opus 계열만, 1차 플랫폼 전용): Opus 5.5 입력 $8/출력 $40/MTok; Opus 5/4.8은 입력 $10/출력 $50/MTok. Opus 4.7·4.6은 미지원.
- Batch API는 입출력 모두 50% 할인(위 상세는 원문 표 참조). Tool-use 시스템 프롬프트 오버헤드: Opus 5.5·Sonnet 5.5 둘 다 auto/none 286 토큰(Opus 5.5는 "any, tool" 값이 문서에 공란으로 남아 있음 — 미확인).
- 데이터 상주(`inference_geo: "us"`) 1.1배, 5분/1시간 캐시쓰기는 각각 입력가의 1.25배/2배.

## 5. 공식 1차 벤치마크 (Anthropic 자체 발표 페이지 비교표)

### Opus 5.5 vs Fable 5.1 vs Opus 5 (출처: [anthropic.com/claude-opus-5-5](https://www.anthropic.com/claude-opus-5-5))

| 벤치마크 | Opus 5.5 | Fable 5.1 | Opus 5 |
|---|---|---|---|
| Terminal-Bench 4.0(에이전트 코딩) | 66.4% | 55.8% | 52.3% |
| FrontierCode v1.1 | 54.4% | 50.3% | 48.0% |
| CursorBench 4.0 | 57.8% | 51.8% | 46.6% |
| GDPval-AA v2.1(지식노동, Elo) | 1846 | 1735 | 1708 |
| OSWorld 2.1(컴퓨터 사용, partial) | 81.8% | 80.7% | 74.0% |
| Chartography(시각 차트 이해) | 89.0% | 88.4% | 83.4% |
| Humanity's Last Exam(도구 포함) | 67.7% | 65.6% | 63.6% |

공식 강점 문구: "Opus 5.5 is the strongest-performing model we've tested to date" (자동 행동 감사 기준). 속도: "Opus 5 대비 출력 속도 30% 이상 빠름", 비용: "일반 워크로드에서 40% 절감"(TechCrunch 요약, 1차 발표 취지와 합치).

### Sonnet 5.5 (출처: [anthropic.com/claude-sonnet-5-5](https://www.anthropic.com/claude-sonnet-5-5))

| 벤치마크 | Sonnet 5.5 |
|---|---|
| Terminal-Bench 4.0 | 70.6% |
| FrontierCode 1.1(Max) | 46.2% |
| CursorBench 4.0 | 55.5% |
| GDPval-AA v2.1 | 1844 (Elo) |
| AA-Briefcase v1.1 | 1811 |
| Humanity's Last Exam | 64.5% |
| OSWorld 2.1 | 80.1% |
| Chartography | 61.6% |

주의: Sonnet 5.5의 Terminal-Bench 4.0(70.6%)이 Opus 5.5(66.4%)보다 높게 표기된 것은 **각 모델 발표 페이지가 서로 다른 effort/설정(예: Sonnet은 max, Opus는 페이지 기본 설정)으로 실었을 가능성이 있어 페이지 간 숫자를 effort 명시 없이 직접 비교하지 말 것** — 이 조사에서 각 사가 어떤 effort로 돌렸는지 명시한 각주를 찾지 못함(미확인). Artificial Analysis의 "max effort" 병기표(§6)가 더 통제된 비교치.

공식 강점: "30%+ 빠른 출력", "작업당 최대 30% 비용 절감(토큰·툴콜 감소)", "포케몬 레드를 스크린샷만으로 클리어한 첫 Sonnet 모델." 권장 용도: "스코프가 명확한 일상 작업, 버그 수정, 문서/슬라이드/스프레드시트, 디자인 안목." Opus 5.5 대비: "복잡한 판단이 필요한 업무에서는 Opus 5.5가 명확히 강함."

### Fable 5.1 / Mythos 5.1 (출처: [anthropic.com/claude-fable-and-mythos-5-1](https://www.anthropic.com/claude-fable-and-mythos-5-1))

| 벤치마크 | Fable 5.1 | Mythos 5.1 |
|---|---|---|
| Terminal-Bench-Science 0.1 | 52.6% | — |
| Terminal-Bench 4.0 | 55.8% | 60.9% |
| Humanity's Last Exam(도구 없음) | 60.9% | — |
| Humanity's Last Exam(도구 포함) | 65.0% | — |
| OSWorld 2.0(partial) | 77.9% | — |
| OSWorld 2.0(strict) | 41.7% | — |
| CursorBench 3.2.0 | 73.4% | — |

공식 강점: "긴 실행에서도 맥락 유지", "근본 원인 파악·수정", "지름길 회피." 가격은 Fable 5 대비 캐시읽기 75% 인하로 "일반 워크로드 약 25% 절감." 권장 용도: "coding, scientific research, enterprise workflows"; "ambitious coding: 전체 코드베이스를 넘나드는 기능, 코드 리뷰, 성능 작업, 다일(multi-day) 자율 세션"; "diagrams, charts, tables nested in files/PDFs"로 금융·법률·분석·건축 문서 작업.

## 6. 독립 측정 — Artificial Analysis (1차 준하는 독립 벤치마크 기관)

출처: [artificialanalysis.ai/models/releases/comparisons/claude-sonnet-5-5-vs-claude-opus-5-5](https://artificialanalysis.ai/models/releases/comparisons/claude-sonnet-5-5-vs-claude-opus-5-5), [artificialanalysis.ai/articles/claude-sonnet-5-5](https://artificialanalysis.ai/articles/claude-sonnet-5-5)

| 항목 | Sonnet 5.5(max) | Opus 5.5(max) |
|---|---|---|
| Intelligence Index(종합) | 56 | 58 |
| Finance & Accounting | 57 | 61 |
| Strategy & Ops | 60 | 64 |
| Legal | 56 | 63 |
| Healthcare & Medical | 58 | 61 |
| Engineering | 58 | 60 |
| Economics | 61 | 66 |
| 출력 속도(tokens/s) | **139** | 93 |
| 첫 토큰까지 시간(초, AA 측정치) | 370.76 | 679.84 |
| AA 자체 측정 가격(입력/출력 MTok) | $1.5 / $2.00 | $2.9 / $4.00 |
| Task당 출력 토큰 수 | **193k**(측정군 중 최다, GPT-6 Astra max 대비 약 7배) | 119k |

Intelligence Index 구성 10개 평가: AA-Briefcase v1.1, GDPval-AA v2.1, AutomationBench-AA, Terminal-Bench 4.0, SciCode, Humanity's Last Exam, GDP.pdf, CritPt, AA-Omniscience, AA-LCR v1.1.
Artificial Analysis 발표 문구(X/공식 아티클): "Sonnet 5.5 scores 56, just 2 points behind Opus 5.5 (max)... with max effort, Sonnet 5.5 gains 18 points over Sonnet 5 and reaches #2 on the Intelligence Index."

주의: AA가 게재한 입력/출력 단가($1.5/$2.9 등)는 **AA 자체 산정치이며 Anthropic 공식 표(§4, $2/$10, $4/$20)와 다르다** — AA는 혼합 워크로드·effort 조건을 반영해 재계산하는 방식으로 보이며, 공식 정가와 혼동하지 말 것.

Fable 5.1은 이 비교표에 포함되지 않아 동일 조건 Intelligence Index 점수는 **미확인**(별도 페이지 존재 가능하나 이번 조사에서 확보 못함).

## 7. 독립 측정 — Terminal-Bench 공식(tbench.ai) (2차 검색 결과 인용, 원 사이트 직접 확인 실패)

- "Terminal-Bench 2.1, official tbench.ai runs: Fable 5.1 57.9% ± 3.8 (#1), Opus 5 51.8% ± 3.4, Fable 5 44.5%." — 검색 스니펫 인용이며 tbench.ai 원문을 직접 열람하지 못했다(WebFetch로 `swebench.com`만 확인, tbench.ai는 미접속). **신뢰도: 중간(검색엔진의 요약 인용, 1차 사이트 직접 대조 못 함)**.
- Terminal-Bench **4.0**과 **2.1**은 버전이 달라 점수를 서로 비교하면 안 된다는 점을 검색 결과 자체가 명시함.

## 8. SWE-bench Verified / SWE-bench Pro — 확인 실패

- 공식 [swebench.com](https://www.swebench.com/) 리더보드를 직접 열람했으나 **Opus 5.5·Sonnet 5.5·Fable 5.1·Sonnet 5 어느 것도 구체 점수를 확인하지 못함**(페이지에 리더보드 표가 동적 로딩되어 텍스트로 못 가져옴).
- 검색엔진 요약(2차, 신뢰도 낮음 — morphllm.com·llm-stats.com·codingfleet.com 등 집계 블로그):
  - "Fable 5 leads SWE-bench Verified at 95.0%", "Opus 5 96%", "Sonnet 5 85.2%" — **모두 5세대(5.5 아님) 수치로 보이고, 출처가 1차가 아님**.
  - "SWE-bench Pro: Fable 5.1 #1 at 81.2%" — 2차 블로그(codingfleet.com), 1차 대조 못 함.
  - 검색 결과 자체가 "SWE-bench Verified는 오염·포화로 표시만 유지된다"는 취지를 언급 — Anthropic도 Opus 5.5/Sonnet 5.5 발표 페이지에서 SWE-bench Verified를 **아예 벤치마크 표에서 제외**하고 Terminal-Bench/FrontierCode/CursorBench로 대체한 것으로 보임(§5 표에 SWE-bench 행 없음).
- **결론: SWE-bench Verified/Pro 의 Opus 5.5·Sonnet 5.5·Fable 5.1 공식 수치는 미확인. 추정하지 않음.**

## 9. LMArena — 확인 실패 (구조 변경 가능성)

- LMArena가 "arena.ai"로 개편된 것으로 보이는 검색 결과가 나왔으나, Opus 5.5/Sonnet 5.5의 구체 Elo·순위를 1차 사이트에서 직접 대조하지 못했다.
- 검색 스니펫(2차, 상호 모순적): "Opus 5.5(High)가 Best Overall 2위 11.84%, Sonnet 5(High) 10위 4.80%" 대 "2026년 9월 LMArena에서 Opus 4.8이 코딩 아레나 1위 Elo 1582" — **날짜·버전이 뒤섞여 있어 신뢰 불가. 미확인으로 처리.**

## 10. 시각(이미지 이해) 벤치마크

- 1차: Opus 5.5 "Chartography 89.0%", Sonnet 5.5 "Chartography 61.6%" (§5). **Opus 5.5와 Sonnet 5.5의 격차(89.0 vs 61.6)가 이번 조사에서 확인된 모든 지표 중 가장 크다** — 시각적 차트/이미지 이해에서 Opus 5.5가 뚜렷하게 우위.
- Fable 5.1: 공식 페이지에 Chartography 수치 없음(미확인). 대신 "PDF·파일에 중첩된 다이어그램·차트·표 이해"를 문서 중심 업무 강점으로 명시(§5).
- 그 외 수학·순수 추론 전용 벤치마크(AIME, GPQA 등)는 세 모델 발표 페이지 어디에도 개별 수치가 없었음 — **미확인**.

## 11. 속도 요약 (독립 측정, Artificial Analysis만 신뢰)

| 모델 | 출력 속도(tokens/s) | 첫 토큰 지연(초) |
|---|---|---|
| Sonnet 5.5(max) | 139 | 370.76 |
| Opus 5.5(max) | 93 | 679.84 |
| Fable 5.1 | 미확인(AA 비교표에서 미확보) |

## 12. Claude Max 구독 한도 소모 — Fable 5.1 (1차: support.claude.com)

출처: [support.claude.com/en/articles/15424964](https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan) — 원문 그대로 인용.

- "Fable 5 and Fable 5.1 are included as a standard part of your plan" — Max 플랜, Team 프리미엄 시트, 시트기반 Enterprise 프리미엄 시트에서.
- **"You can use up to 50% of your weekly usage limits on Fable models at no extra cost."**
- "They draw from your plan's regular weekly usage limits and use them faster than other Claude models" — **구체적 소모 배수(예: 2배·3배)는 공식 문서에 공개되지 않음. 미확인.**
- "This does not mean Max users get 50% more total usage... Fable draws from the same weekly pool."
- Opus 5.5·Sonnet 5.5의 Max 플랜 내 개별 소모 배수도 공식 문서에서 찾지 못함 — **미확인**(일반적으로 Opus 계열이 Sonnet보다 한도를 더 빨리 소모한다는 것은 업계 통념이나, 이번 조사의 1차 자료로 수치화된 근거를 확보하지 못했다).

## 13. Sonnet 5.5 vs Opus 5.5 — 격차가 작은 작업 / 큰 작업 (공식 문구 인용)

- **격차가 작은 영역(공식·AA 공통 관찰)**: GDPval-AA v2.1(지식노동, 1844 vs 1846 — 사실상 동일), OSWorld 2.1(컴퓨터 사용, 80.1% vs 81.8%), CursorBench 4.0(55.5% vs 57.8%). AA Intelligence Index 총점도 56 vs 58로 2점 차.
- **격차가 큰 영역**: Chartography(시각 차트, 61.6% vs 89.0% — 약 27.4%p), AA 세부 카테고리 중 Legal(56 vs 63, 7점), Economics(61 vs 66, 5점), Strategy & Ops(60 vs 64, 4점).
- Anthropic 공식 포지셔닝 문구: Sonnet 5.5는 "the best combination of speed and intelligence"·"well-scoped everyday tasks, fixing bugs, polished documents/slides/spreadsheets"용, Opus 5.5는 "for long-running agentic coding and knowledge work"·"복잡한 판단이 필요한 업무에서 명확히 더 강함"용으로 공식 소개 페이지가 명시적으로 구분.
- 속도·비용은 반대 방향 격차: Sonnet 5.5가 출력 속도 139 vs 93 tokens/s(약 1.5배 빠름), 가격은 절반 이하($2/$10 vs $4/$20).

---

## 미확인 목록 (추정하지 않고 남겨둠)

1. code.claude.com/docs/en/model-config 원문에서의 Opus 5.5 effortLevel 무시 서술 — GitHub 이슈발 2차 정보만 확보, 1차 문서 원문 대조 못 함.
2. SWE-bench Verified/Pro의 Opus 5.5·Sonnet 5.5·Fable 5.1 공식 점수 — Anthropic이 최신 발표 페이지에서 이 벤치마크 자체를 뺀 것으로 보임.
3. LMArena(arena.ai) 최신 Opus 5.5/Sonnet 5.5 Elo·순위 — 검색 스니펫이 상호 모순되어 채택 보류.
4. Fable 5.1의 독립 측정 출력 속도(tokens/s)·첫 토큰 지연 — Artificial Analysis 비교표에서 Sonnet 5.5·Opus 5.5만 확보, Fable 5.1은 별도 페이지 미열람.
5. Max 플랜에서 Opus 5.5·Sonnet 5.5의 모델별 한도 소모 배수(정확한 수치) — 공식 문서는 "더 빠르게 소모"라고만 명시, 배수는 비공개.
6. 순수 수학(AIME 등) 단독 벤치마크 수치 — 세 모델 공식 페이지 어디에도 없음.

---

## 부록 — 직접 시험 (2026-09-29, 리드 실행)

방법: `claude -p <문제> --model <ID> --effort <단계> --output-format json --allowedTools Read,Grep,Glob`, 문제 파일만 있는 빈 폴더, 조합당 1회(표본 작음).
문제: T1 SQL 보안 결함(정답 4: 인젝션 `%s` · PUBLIC 기본 EXECUTE · `<>` NULL fail-open · search_path 미고정) /
T2 매장 전환 React 경합(핵심 3: 늦은 응답 덮어쓰기 · 이전 합계 노출 · 메모 매장 간 오염) / T3 장부 집계(정답 a=4 b=2 c=5).

| 조합 | T1 | T2 | T3 | 문제당 API 환산 $ | 벽시계(초) |
|---|---|---|---|---|---|
| Sonnet 5.5 low | 3/4 (NULL 항목 누락) | 핵심 3 ✓, 중간 자기정정 | ✓ | 0.27~0.45 | 11~24 |
| Sonnet 5.5 medium | 4/4 | 핵심 3 ✓, 중간 자기정정 | ✓ | 0.24~0.33 | 15~30 |
| Sonnet 5.5 high | 4/4 | 핵심 3 ✓, 일관 | ✓ | 0.28~0.33 | 15~37 |
| Opus 5.5 medium | 4/4 | 핵심 3 ✓ (8건) | ✓ | 0.36~0.38 | 20~42 |
| Opus 5.5 high | 4/4 | 핵심 3 ✓ (9건) | ✓ | 0.33~0.39 | 19~57 |
| Opus 5.5 xhigh | 4/4 | 핵심 3 ✓ (9건) | ✓ | 0.33~0.48 | 17~80 |
| Fable 5.1 medium | 4/4 (+1) | 핵심 3 ✓ (10건) | ✓ | 0.84~1.10 | 21~62 |
| Fable 5.1 high | **거부됨**(`[cyber]` 안전장치) | 핵심 3 ✓ (11건) | ✓ | 0.78~1.12 | 17~90 |

참고: T3(사소한 계산)도 Sonnet 5.5 에서 $0.27 — 대부분이 매 세션 시작 시 싣는 도구·스킬·플러그인 목록 비용이다.
실사용 로그(2026-09-15~29) 응답 시간 중앙값/90%: Sonnet 5.5 2.9s/7.8s · Opus 5.5 3.8s/11.8s · Fable 5.1 5.9s/32.4s.
