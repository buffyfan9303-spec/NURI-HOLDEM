// supabase/functions/_shared/email/weeklyDigest.ts — 주간 소식 이메일(광고성 정보) 제목·본문과 야간 판정. 순수 함수.
//
// 정보통신망법 제50조(2026-10-06 법령 점검 P1-1 · security-1006/legal.md):
//   ① 수신자는 마케팅 수신 동의자만 — 서버 weekly_email_digest_rows()(20261006l)가 거른다.
//   ③ 오후 9시~다음 날 오전 8시(KST) 전송 금지 — isAdQuietHoursKst() 로 엣지 함수가 발송 전에 멈춘다.
//   ④ 제목 시작 부분 '(광고)', 본문에 전송자 명칭·연락처와 수신 거부 방법(로그인 없이 되는 수단 포함).
// 🔴 매장명·닉네임은 사람이 정하는 값이다 — esc() 를 거친다(보안 표준 §7). 메일 제목에는 사용자 값을 싣지 않는다.
import { BIZ_REQUIRED, SUPPORT_EMAIL } from './brand.gen.ts';
import { button, eyebrow, esc, h1, layout, notice, p, SITE, small, strong } from './layout.ts';

/** 앱 '내 정보 → 보안' 딥링크 — App.tsx 부팅 링크 ?nl= → '/me/security' → 마케팅 정보 수신 토글이 있는 보안 탭. */
export const MARKETING_SETTINGS_URL = `${SITE}/?nl=%2Fme%2Fsecurity`;
/** 로그인 없이 되는 수신거부 — 고객센터로 '수신거부' 메일(무료). 이 주소는 실제로 받는 메일함이다(고객센터). */
export const UNSUBSCRIBE_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('수신거부')}`;

const biz = (k: string) => BIZ_REQUIRED.find(([key]) => key === k)?.[1] ?? '';

/** 광고성 정보 야간 전송 금지 시간대(KST 21:00~다음 날 08:00) — DB 의 public._ad_quiet_hours 와 같은 경계. */
export function isAdQuietHoursKst(at: Date = new Date()): boolean {
  const h = new Date(at.getTime() + 9 * 3600_000).getUTCHours();
  return h >= 21 || h < 8;
}

export interface WeeklyDigestInput { nickname: string | null; vname: string; vn: number; n: number }

export function weeklyDigestEmail(i: WeeklyDigestInput): { subject: string; html: string } {
  const subject = `(광고) [NURI HOLDEM] 이번 주 팔로우 매장 대회 ${i.n}개`;
  const who = esc((i.nickname ?? '').trim() || '회원');
  const more = i.vn > 1 ? ` 외 ${i.vn - 1}곳` : '';
  const body = [
    eyebrow('(광고) 주간 소식'),
    h1(`${who}님, 이번 주 대회 ${i.n}개가 기다려요`),
    p(`팔로우하신 ${strong(esc(i.vname) + more)}에서 오늘부터 7일 안에 ${strong(`${i.n}개 대회`)}가 열려요. 자리가 차기 전에 미리 예약하세요!`, 20),
    button(SITE, '일정 보며 예약하기'),
    notice(`이 메일은 마케팅 정보 수신에 동의하신 회원에게 주 1회 보내는 광고성 정보입니다.<br>
전송자: ${esc(biz('상호'))}(NURI HOLDEM) · 전화 ${esc(biz('전화번호'))} · <a href="mailto:${SUPPORT_EMAIL}" style="color:inherit;text-decoration:underline;">${esc(SUPPORT_EMAIL)}</a>`),
    small(`<b>수신거부</b> — 로그인 없이: <a href="${UNSUBSCRIBE_MAILTO}" style="color:inherit;text-decoration:underline;">${esc(SUPPORT_EMAIL)}로 ‘수신거부’ 메일 보내기</a>(무료) · 앱에서: <a href="${MARKETING_SETTINGS_URL}" target="_blank" style="color:inherit;text-decoration:underline;">내 정보 → 보안 → 마케팅 정보 수신</a> 끄기`, 4),
  ].join('\n');
  return { subject, html: layout({ title: esc(subject), preheader: `팔로우 매장 대회 ${i.n}개 · 수신거부 방법은 메일 하단에`, body }) };
}
