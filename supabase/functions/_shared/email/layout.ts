// supabase/functions/_shared/email/layout.ts — NURI HOLDEM 메일 디자인 체계(1벌).
//
// 쓰는 곳: Supabase 인증 메일 템플릿(supabase/templates/auth/*.html — scripts/gen-email-templates.mjs 가 생성)과
//          엣지 함수 support-reply-email. 두 쪽이 같은 껍데기·같은 하단 법정 고지를 쓴다.
// Deno 전용 import 가 없다 — 웹앱 vitest 가 같은 파일을 직접 import 해 잠근다(src/lib/emailTemplates.test.ts).
//
// 메일 클라이언트 호환 원칙(Gmail·네이버·Outlook·iOS 메일):
//   · 레이아웃은 전부 table, 스타일은 전부 인라인. <style> 은 모바일 여백·다크 고정 같은 보강만 — 지워져도 깨지지 않는다.
//   · 웹폰트 없음(시스템 한글 글꼴 스택). 폭은 560px 고정 속성 + max-width(Outlook 은 max-width 를 무시한다).
//   · 다크 브랜드를 기본값으로 인라인에 박고 color-scheme: dark 로 선언한다 — 라이트/다크 어느 설정에서도 같은 화면.
//     로고는 배경색을 구워 넣은 불투명 PNG 라, 클라이언트가 배경을 강제로 바꿔도 글자가 사라지지 않는다.
//   · 버튼은 td 배경 + height 속성(Outlook 은 <a> 패딩을 무시한다) + <a> 패딩(나머지 클라이언트).
//   · 이미지 차단 상태에서도 alt 글자가 브랜드 색으로 보이게 alt 에 스타일을 준다.
// 🔴 사용자 값은 반드시 esc() 를 거쳐 넣는다(보안 표준 §7). Go 템플릿 변수({{ .X }})는 raw 로 넣는다 — Supabase 가 치환한다.
import { AGE_HELPLINE, BIZ_REQUIRED, SUPPORT_EMAIL } from './brand.gen.ts';

export const SITE = 'https://nuriholdem.com';
/** 앱 고객센터 딥링크 — App.tsx 부팅 링크 ?nl= → openNotifLink('/support') → 고객센터 모달(비로그인이면 로그인 안내). */
export const SUPPORT_URL = `${SITE}/?nl=%2Fsupport`;
/** 메일 전용 로고(배경 구움 PNG 2x, 표시 128×48). public/email/logo.png — 생성: scripts/gen-email-templates.mjs --logo */
export const LOGO_URL = `${SITE}/email/logo.png`;
export const LOGO_W = 128;
export const LOGO_H = 48;

/** 색 — 대비는 src/lib/emailTemplates.test.ts 가 WCAG AA(본문 4.5:1)로 잰다. */
export const C = {
  page: '#0A0C0F',   // 바깥 지면
  card: '#14171F',   // 본문 카드
  inset: '#0E1117',  // 카드 안 상자(코드·답변·링크)
  line: '#262B38',   // 테두리
  gold: '#FFD100',   // 강조·버튼
  onGold: '#0A0C0F', // 버튼 글자
  text: '#F0F4FF',   // 제목·본문 강조
  body: '#C3CAD8',   // 본문
  sub: '#9AA3B5',    // 보조
  foot: '#8A93A6',   // 하단 고지(지면 위)
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',Roboto,'Noto Sans KR',Arial,sans-serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";

/** HTML 이스케이프 — 제목·닉네임·답변처럼 사람이 정하는 값은 전부 이걸 거친다. */
export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}
/** 줄바꿈 보존 — 이스케이프 **뒤에** <br> 로 바꾼다(white-space:pre-wrap 은 일부 클라이언트가 버린다). */
export function nl2br(v: unknown): string {
  return esc(String(v ?? '').replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');
}

// ── 블록 ─────────────────────────────────────────────────────────────
export const eyebrow = (label: string) =>
  `<p style="margin:0 0 10px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.08em;color:${C.gold};">${label}</p>`;
export const h1 = (html: string) =>
  `<h1 class="nh-h1" style="margin:0 0 14px;font-size:24px;line-height:32px;font-weight:800;color:${C.text};letter-spacing:-0.01em;">${html}</h1>`;
export const p = (html: string, mb = 16) =>
  `<p style="margin:0 0 ${mb}px;font-size:15px;line-height:24px;color:${C.body};">${html}</p>`;
export const small = (html: string, mb = 0) =>
  `<p style="margin:0 0 ${mb}px;font-size:13px;line-height:20px;color:${C.sub};">${html}</p>`;
export const strong = (html: string) => `<strong style="color:${C.text};font-weight:700;">${html}</strong>`;

/** 큰 버튼 — 폭 100%, 높이 52. href 는 호출자가 이미 안전한 값(Go 변수 또는 상수 URL)만 넘긴다. */
export function button(href: string, label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr>
<td align="center" valign="middle" height="52" bgcolor="${C.gold}" style="height:52px;background:${C.gold};border-radius:12px;">
<a href="${href}" target="_blank" style="display:block;padding:16px 20px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:800;color:${C.onGold};text-decoration:none;border-radius:12px;">${label}</a>
</td></tr></table>`;
}

/** 버튼이 안 눌릴 때 복사용 주소 상자. */
export function linkFallback(href: string): string {
  return `${small('버튼이 눌리지 않으면 아래 주소를 복사해 브라우저 주소창에 붙여 넣어 주세요.', 8)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
<td style="padding:12px 14px;background:${C.inset};border:1px solid ${C.line};border-radius:10px;font-size:12px;line-height:18px;word-break:break-all;">
<a href="${href}" target="_blank" style="color:${C.gold};text-decoration:underline;word-break:break-all;">${href}</a>
</td></tr></table>`;
}

/** 인증번호 상자 — 복사하기 쉽게 크게, 글자 사이를 띄운다. */
export function codeBox(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;"><tr>
<td align="center" style="padding:20px 12px;background:${C.inset};border:1px solid ${C.line};border-radius:12px;">
<span style="font-family:${MONO};font-size:32px;line-height:40px;font-weight:800;letter-spacing:8px;color:${C.gold};">${code}</span>
</td></tr></table>`;
}

/** 안내 상자(왼쪽 금색 선). */
export function notice(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;"><tr>
<td width="3" style="width:3px;background:${C.gold};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
<td style="padding:2px 0 2px 12px;font-size:13px;line-height:20px;color:${C.sub};">${html}</td>
</tr></table>`;
}

/** 이름-값 표(값은 호출자가 esc 한 HTML). */
export function infoRows(rows: [string, string][]): string {
  const tr = rows.map(([k, v]) => `<tr>
<td width="84" valign="top" style="width:84px;padding:6px 0;font-size:13px;line-height:20px;color:${C.sub};">${k}</td>
<td valign="top" style="padding:6px 0;font-size:14px;line-height:20px;font-weight:700;color:${C.text};word-break:keep-all;overflow-wrap:anywhere;">${v}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;padding:10px 16px;background:${C.inset};border:1px solid ${C.line};border-radius:12px;">${tr}</table>`;
}

/** 본문 상자(답변 등) — 제목 줄 + 여러 줄 본문. 본문은 호출자가 nl2br 한 HTML. */
export function textBox(label: string, bodyHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
<td style="padding:16px;background:${C.inset};border:1px solid ${C.line};border-radius:12px;">
<p style="margin:0 0 8px;font-size:12px;line-height:18px;font-weight:700;color:${C.gold};">${label}</p>
<p style="margin:0;font-size:15px;line-height:24px;color:${C.text};word-break:keep-all;overflow-wrap:anywhere;">${bodyHtml}</p>
</td></tr></table>`;
}

// ── 하단 고지 ─────────────────────────────────────────────────────────
const biz = (k: string) => BIZ_REQUIRED.find(([key]) => key === k)?.[1] ?? '';
const footLink = (href: string, label: string) => `<a href="${href}" target="_blank" style="color:${C.foot};text-decoration:underline;">${label}</a>`;

/** 발신 전용 안내 + 사업자 정보 5항목 + 만 19세·1336 고지. 값은 BusinessFooter.tsx 에서 생성된 brand.gen.ts. */
export function footer(): string {
  const [age, helpLabel, helpNo] = AGE_HELPLINE;
  return `<tr><td class="nh-px" style="padding:24px 28px 8px;font-family:${FONT};">
<p style="margin:0 0 6px;font-size:12px;line-height:19px;color:${C.foot};">이 메일은 발신 전용입니다. 회신하셔도 답변드릴 수 없습니다.</p>
<p style="margin:0 0 16px;font-size:12px;line-height:19px;color:${C.foot};">문의는 ${footLink(`mailto:${SUPPORT_EMAIL}`, esc(SUPPORT_EMAIL))} 또는 ${footLink(SUPPORT_URL, '앱 고객센터')}로 남겨 주세요.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.line};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>
<p style="margin:16px 0 4px;font-size:11px;line-height:18px;color:${C.foot};">${esc(biz('상호'))} · 대표자 ${esc(biz('대표자'))} · 사업자등록번호 ${esc(biz('사업자등록번호'))}</p>
<p style="margin:0 0 4px;font-size:11px;line-height:18px;color:${C.foot};">${esc(biz('사업장 주소'))} · 전화 ${esc(biz('전화번호'))}</p>
<p style="margin:0 0 12px;font-size:11px;line-height:18px;color:${C.foot};">${esc(age)} · ${esc(helpLabel)} ${esc(helpNo)}</p>
<p style="margin:0;font-size:11px;line-height:18px;color:${C.foot};">&copy; NURI HOLDEM</p>
</td></tr>`;
}

// ── 껍데기 ────────────────────────────────────────────────────────────
export interface LayoutInput {
  /** <title> 과 받은편지함 미리보기(프리헤더)에 쓰인다. 사용자 값이면 호출자가 esc. */
  title: string;
  preheader: string;
  /** 카드 안 본문 HTML(블록 함수 조합). */
  body: string;
}

export function layout({ title, preheader, body }: LayoutInput): string {
  return `<!doctype html>
<html lang="ko" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${title}</title>
<style>
:root{color-scheme:dark;supported-color-schemes:dark}
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:separate}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media only screen and (max-width:480px){.nh-px{padding-left:20px!important;padding-right:20px!important}.nh-h1{font-size:22px!important;line-height:30px!important}.nh-out{padding:12px 8px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};" bgcolor="${C.page}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${preheader}${'&#8199;&#847;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
<tr><td align="center" class="nh-out" style="padding:28px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;font-family:${FONT};word-break:keep-all;">
<tr><td align="left" class="nh-px" style="padding:0 28px 18px;">
<a href="${SITE}" target="_blank" style="text-decoration:none;"><img src="${LOGO_URL}" width="${LOGO_W}" height="${LOGO_H}" alt="NURI HOLDEM" style="display:block;width:${LOGO_W}px;height:${LOGO_H}px;border:0;font-family:${FONT};font-size:20px;line-height:${LOGO_H}px;font-weight:800;letter-spacing:0.12em;color:${C.gold};"></a>
</td></tr>
<tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td height="4" bgcolor="${C.gold}" style="height:4px;background:${C.gold};border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="nh-px" style="padding:32px 28px 12px;font-family:${FONT};">
${body}
</td></tr>
</table>
</td></tr>
${footer()}
</table>
</td></tr>
</table>
</body>
</html>
`;
}
