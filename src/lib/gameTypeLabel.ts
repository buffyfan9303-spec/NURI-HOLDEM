/** 게임 종류 표시 — 포스터 `buy_in.gameType` 은 자유 입력칸인데, 장부 세션의 코드값(`gtd`·`entry`)이 그대로
 *  들어온 행이 있다(2026-09-29 모바일 점검: 대회 상세 참가비 줄 "300,000 · gtd"). 코드값만 사람 말로 바꾸고
 *  업주가 직접 적은 말(프리즈아웃·바운티 등)은 그대로 둔다.
 *  라벨은 장부 '게임 유형' 버튼(NuriPosLedger)과 같은 말이다 — 같은 값을 화면마다 다르게 부르지 않는다. */
export const GAME_TYPE_LABEL: Readonly<Record<'gtd' | 'entry', string>> = { gtd: 'GTD (보장)', entry: '엔트리 게임' };

export function gameTypeLabel(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  const k = t.toLowerCase();
  return k === 'gtd' || k === 'entry' ? GAME_TYPE_LABEL[k] : t;
}
