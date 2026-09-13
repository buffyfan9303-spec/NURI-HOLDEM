// 한국어 조사 — `을(를)` 을 화면에서 없앤다.
//
// 왜 필요한가: 앱 곳곳이 `${what}을(를) 불러오지 못했습니다` 로 문장을 만든다. 괄호 표기는
//   서류에서나 쓰는 것이고, 실패 화면처럼 **이미 불안한 순간**에 나오면 완성되지 않은 화면으로 읽힌다.
//   실제로 `CalendarPanel` 은 이 문제 때문에 공용 템플릿을 버리고 자기 화면만 따로 덮어썼다
//   (`CalendarPanel.tsx:267`) — 한 곳이 규칙을 피해 가기 시작하면 문구가 화면마다 갈라진다.
//
// 규칙은 하나다: **앞 낱말에 받침이 있는가.** 한글 음절은 0xAC00 부터 28개 종성 주기로 배열돼 있어
//   `(코드 - 0xAC00) % 28 !== 0` 이면 받침이 있다. 형태소 분석기는 필요 없다(번들도 로딩도 없다).

/** 받침이 있으면 앞, 없으면 뒤. 한 쌍만 담는다. */
type Pair = readonly [withFinal: string, withoutFinal: string];

const PAIRS = {
  '을': ['을', '를'],
  '은': ['은', '는'],
  '이': ['이', '가'],
  '과': ['과', '와'],
  '으로': ['으로', '로'],
} as const satisfies Record<string, Pair>;

export type JosaKind = keyof typeof PAIRS;

/**
 * 마지막 글자에 받침이 있는가. 판단할 수 없으면 `null`.
 *
 * 숫자·영문으로 끝나는 이름이 실제로 있다(매장명 'NURI 1', 직원 로그인 'kim2').
 * **읽는 소리**를 기준으로 한다 — '1'은 '일'이라 받침이 있고, '2'는 '이'라 없다.
 */
function hasFinalConsonant(word: string): boolean | null {
  const last = word.trimEnd().at(-1);
  if (!last) return null;

  const code = last.codePointAt(0)!;
  // 한글 음절(가 ~ 힣)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;

  // 숫자 — 읽는 소리의 받침. 0(영)·1(일)·3(삼)·6(육)·7(칠)·8(팔)은 있고, 2·4·5·9는 없다.
  if (last >= '0' && last <= '9') return '013678'.includes(last);

  // 영문 — 알파벳 이름의 소리로 읽는다(L=엘, M=엠, N=엔, R=아르, 1글자 약어가 흔하다).
  const upper = last.toUpperCase();
  if (upper >= 'A' && upper <= 'Z') return 'LMNR'.includes(upper);

  // 괄호·따옴표·이모지 등으로 끝나면 알 수 없다. 부르는 쪽이 정하게 한다.
  return null;
}

/**
 * 낱말에 맞는 조사를 고른다.
 *
 * @param word 조사가 붙을 낱말
 * @param kind `'을' | '은' | '이' | '과' | '으로'` — **받침 있는 쪽**을 이름으로 쓴다
 * @returns 받침을 판단할 수 없으면 **빈 문자열** — `을(를)` 을 화면에 내보내느니 조사를 생략한다
 */
export function josa(word: string, kind: JosaKind): string {
  const final = hasFinalConsonant(word);
  if (final === null) return '';
  const [withFinal, withoutFinal] = PAIRS[kind];
  return final ? withFinal : withoutFinal;
}

/** `낱말 + 조사` 를 한 번에. 조사를 못 고르면 낱말만 돌려준다. */
export function withJosa(word: string, kind: JosaKind): string {
  return word + josa(word, kind);
}
