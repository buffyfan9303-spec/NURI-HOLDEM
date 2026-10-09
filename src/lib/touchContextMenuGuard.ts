// 누르는 요소(버튼·탭)를 손가락으로 길게 누르면 브라우저가 자기 메뉴·안내를 띄운다.
//   2026-10-09 오너 실기기(삼성 인터넷, 웹 탭): GTO '자주 쓰는 도구' 카드를 길게 눌렀더니 회색 말풍선 '텍스트만 선택하세요' 가 떠서 남았다.
//   그 문구는 저장소에 없다 — 브라우저가 그린다. 버튼은 index.css 전역 규칙으로 이미 user-select:none 이라 고를 글자가 없는데도,
//   페이지가 길게 누름(contextmenu)을 받아 두지 않으니 브라우저가 '여기선 고를 게 없다' 는 안내를 띄운 것으로 본다.
//   (Chromium 은 길게 누름 → 페이지에 contextmenu → 취소되지 않았을 때만 브라우저 메뉴를 연다.)
// 범위: 터치로 누른 button · [role=button] · [role=tab] 만. 링크(a)·이미지·입력칸·본문 글은 건드리지 않는다 —
//   본문 글 길게 눌러 복사, 링크 길게 눌러 새 탭 열기는 그대로 둔다. 마우스 오른쪽 클릭(PC)도 그대로다.
//   HoldToConfirmButton·VoucherManageModal 의 증감 버튼이 각자 onContextMenu 로 막던 것과 같은 처방을 앱 전체 누르는 요소에 편다.
const PRESSABLE = 'button, [role="button"], [role="tab"]';

export function installTouchContextMenuGuard(doc: Document = document) {
  let lastTouch = false;
  doc.addEventListener('pointerdown', (e) => { lastTouch = e.pointerType === 'touch'; }, { capture: true, passive: true });
  doc.addEventListener('contextmenu', (e) => {
    const touch = (e as PointerEvent).pointerType === 'touch' || lastTouch;
    const t = e.target as Element | null;
    if (touch && t?.closest?.(PRESSABLE) && !t.closest('input, textarea, [contenteditable]')) e.preventDefault();
  });
}
