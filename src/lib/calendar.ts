// src/lib/calendar.ts — 시스템 공유 / 클립보드 폴백.
// 예전엔 .ics 생성·구글 캘린더 URL 도 여기 있었지만 오너 지시(2026-09-09, 외부 반출 기능 제거)로 뺐다.
// 파일명은 그대로 둔다 — ToolsPanel 의 import 경로를 안 건드리는 것이 가장 작은 변경이다.

/** 시스템 공유(모바일: 카톡 등 공유 시트 / PC: 클립보드 복사 폴백). 성공 방식 반환 */
export async function shareOrCopy(input: { title: string; text: string; url: string }): Promise<'share' | 'copy'> {
  try {
    if (navigator.share) {
      await navigator.share(input);
      return 'share';
    }
  } catch { /* 사용자가 시트 닫음 → 복사 폴백 안 함 */ throw new Error('cancelled'); }
  await navigator.clipboard.writeText(`${input.text}\n${input.url}`);
  return 'copy';
}
