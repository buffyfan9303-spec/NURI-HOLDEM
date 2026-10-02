// src/lib/warmFetch.ts — 화면이 열리기 전에 미리 받아 둔 응답을 그 화면이 **한 번** 넘겨받는다.
//
// 왜: 내 정보 › 보안 탭은 처음 들어갈 때 약관 동의 이력·위치정보 동의 두 칸이 '불러오는 중…' 한 줄로 섰다가 내용으로
//   바뀌며 아래(비밀번호 변경 폼)를 139px 밀었다(audit-motion-1002 M-4 · 390 +61~73ms, CLS 0.154 · 360 0.182).
//   '내 정보'를 여는 순간 미리 받아 두면 탭에 들어갈 때는 이미 내용이 있다 — 첫 그림부터 정착 높이다.
// 규칙: warm 은 늘 새로 받는다(이전 것을 버린다 — 열 때마다 최신). takeWarm 은 꺼내면서 지운다(같은 응답을 두 화면이 나눠 갖지 않는다).
//   키에 계정 id 를 넣는다 — 다른 계정의 응답을 넘겨받지 않는다. 실패한 응답은 넘기지 않는다(받는 쪽이 직접 다시 받는다).
type Slot<T> = { p: Promise<T>; done: boolean; v?: T };
const slots = new Map<string, Slot<unknown>>();

export function warm<T>(key: string, load: () => Promise<T>): void {
  const s: Slot<T> = { p: load(), done: false };
  s.p.then((v) => { s.done = true; s.v = v; }, () => { if (slots.get(key) === s) slots.delete(key); });
  slots.set(key, s as Slot<unknown>);
}

export function takeWarm<T>(key: string): Slot<T> | null {
  const s = slots.get(key) as Slot<T> | undefined;
  if (!s) return null;
  slots.delete(key);
  return s;
}
