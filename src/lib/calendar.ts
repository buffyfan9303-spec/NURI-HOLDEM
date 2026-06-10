// src/lib/calendar.ts — "내 캘린더에 추가" (.ics 생성·다운로드)
// 구글/아이폰/삼성 캘린더 모두 .ics를 열면 일정 등록 화면으로 이어진다(외부 키 불필요).

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** KST 로컬 시각을 ICS 포맷(TZID=Asia/Seoul)으로 */
function icsLocal(date: string, time: string): string {
  // date: YYYY-MM-DD, time: HH:mm
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function downloadIcs(input: {
  title: string;
  date: string;             // YYYY-MM-DD
  startTime?: string | null; // HH:mm (없으면 19:00)
  venueName?: string | null;
  address?: string | null;
  durationHours?: number;    // 기본 5시간
  url?: string;
}): void {
  const start = (input.startTime ?? '19:00').slice(0, 5);
  const [h, m] = start.split(':').map(Number);
  const dur = input.durationHours ?? 5;
  const endH = h + dur;
  // 자정 넘김: 종료일 +1
  const endDate = (() => {
    if (endH < 24) return input.date;
    const d = new Date(`${input.date}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();
  const end = `${pad(endH % 24)}:${pad(m)}`;

  const loc = [input.venueName, input.address].filter(Boolean).join(' · ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NURI HOLDEM//KR',
    'BEGIN:VEVENT',
    `UID:${input.date}-${start.replace(':', '')}-${Math.random().toString(36).slice(2, 8)}@nuriholdem.com`,
    `DTSTART;TZID=Asia/Seoul:${icsLocal(input.date, start)}`,
    `DTEND;TZID=Asia/Seoul:${icsLocal(endDate, end)}`,
    `SUMMARY:${esc(`♠ ${input.title}`)}`,
    loc ? `LOCATION:${esc(loc)}` : '',
    `DESCRIPTION:${esc(`누리홀덤에서 확인: ${input.url ?? 'https://nuriholdem.com'}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`1시간 후 ${input.title}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${input.title.slice(0, 30)}_${input.date}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

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
