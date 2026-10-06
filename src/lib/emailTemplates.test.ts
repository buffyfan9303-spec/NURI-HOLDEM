// 메일 디자인 체계 계약(2026-09-30) — supabase/functions/_shared/email/* · supabase/templates/auth/*
//   ① 사업자 정보·19세·1336 이 BusinessFooter 와 같은 값이다(생성물 brand.gen.ts 가 낡지 않았다)
//   ② 인증 템플릿 생성물(*.html·subjects.json)이 원본 templates.ts 와 같다 — 재생성: node scripts/gen-email-templates.mjs
//   ③ Supabase Go 변수 보존 · 로고 자산 실재 · 메일 클라이언트 호환 · 대비 AA · §28 금지어
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AGE_HELPLINE, BIZ_EXTRA, BIZ_REQUIRED } from '../components/features/BusinessFooter';
import * as BRAND from '../../supabase/functions/_shared/email/brand.gen.ts';
import { C, LOGO_H, LOGO_URL, LOGO_W, SITE, SUPPORT_URL } from '../../supabase/functions/_shared/email/layout.ts';
import { supportReplyEmail } from '../../supabase/functions/_shared/email/supportReply.ts';
import { isAdQuietHoursKst, MARKETING_SETTINGS_URL, UNSUBSCRIBE_MAILTO, weeklyDigestEmail } from '../../supabase/functions/_shared/email/weeklyDigest.ts';
import { AUTH_TEMPLATES, OTP_EXPIRY_SEC, REQUIRED_VARS } from '../../supabase/templates/auth/templates.ts';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8').replace(/\r\n/g, '\n');
const support = supportReplyEmail({ nickname: 'n', category: '기타', title: 't', answer: 'a', answeredAt: '2026-09-30T00:00:00Z', isUpdate: false });
const digest = weeklyDigestEmail({ nickname: '<b>닉</b>', vname: '<a href="x">펍</a>', vn: 2, n: 3 });
const ALL: [string, string][] = [...Object.entries(AUTH_TEMPLATES).map(([k, t]) => [k, t.html] as [string, string]), ['support-reply', support.html], ['weekly-digest', digest.html]];

// 2026-10-06 법령 점검 P1-1(security-1006/legal.md) — 주간 소식 이메일은 광고성 정보다(마케팅 동의서 제2조가 스스로 분류).
describe('④ 광고성 정보 표기(정보통신망법 §50③④)', () => {
  it('제목이 (광고) 로 시작하고 사용자 값을 싣지 않는다', () => {
    expect(digest.subject.startsWith('(광고) ')).toBe(true);
    expect(digest.subject).not.toMatch(/닉|펍/);
  });
  it('본문에 전송자 명칭·전화·이메일과 로그인 없이 되는 수신거부 방법이 있다', () => {
    const name = BIZ_REQUIRED.find(([k]) => k === '상호')![1];
    const tel = BIZ_REQUIRED.find(([k]) => k === '전화번호')![1];
    expect(digest.html).toContain(`전송자: ${name}`);
    expect(digest.html).toContain(tel);
    expect(digest.html).toContain(`href="${UNSUBSCRIBE_MAILTO}"`);
    expect(UNSUBSCRIBE_MAILTO.startsWith('mailto:ace@nuriholdem.com?subject=')).toBe(true);
    expect(digest.html).toContain(`href="${MARKETING_SETTINGS_URL}"`);
    expect(new URL(MARKETING_SETTINGS_URL).searchParams.get('nl')).toBe('/me/security');
    expect(read('src/App.tsx')).toContain("if (link === '/me/security')");
    expect(digest.html).toContain('마케팅 정보 수신에 동의하신 회원');
  });
  it('매장명·닉네임은 이스케이프된다', () => {
    expect(digest.html).not.toContain('<a href="x">');
    expect(digest.html).toContain('&lt;b&gt;닉&lt;/b&gt;');
  });
  it('야간(21~08시 KST)에는 보내지 않는다 — 경계는 DB _ad_quiet_hours 와 같다', () => {
    const at = (hm: string) => new Date(`2026-10-09T${hm}:00+09:00`);
    expect(['07:59', '08:00', '10:30', '20:59', '21:00'].map((t) => isAdQuietHoursKst(at(t)))).toEqual([true, false, false, false, true]);
  });
  it('엣지 함수가 이 모듈로 제목·본문·야간 판정을 만든다(옛 인라인 템플릿 금지)', () => {
    const fn = read('supabase/functions/weekly-email-digest/index.ts');
    expect(fn).toContain("from '../_shared/email/weeklyDigest.ts'");
    expect(fn).toContain('if (isAdQuietHoursKst())');
    expect(fn).toContain("'List-Unsubscribe'");
    expect(fn).not.toContain('[NURI HOLDEM] 이번 주 팔로우 매장 대회');
  });
});

describe('① 하단 법정 고지 = BusinessFooter', () => {
  it('brand.gen.ts 가 BusinessFooter 의 현재 값과 같다(주소·전화가 바뀌면 재생성)', () => {
    expect(BRAND.BIZ_REQUIRED).toEqual(BIZ_REQUIRED);
    expect([...BRAND.AGE_HELPLINE]).toEqual([...AGE_HELPLINE]);
    expect(BRAND.SUPPORT_EMAIL).toBe(BIZ_EXTRA.find(([k]) => k === '고객센터')?.[1]);
  });
  it.each(ALL)('%s — 사업자 5항목·19세·1336·발신 전용·고객센터가 모두 실린다', (_k, html) => {
    for (const [, v] of BIZ_REQUIRED) expect(html).toContain(v);
    for (const v of AGE_HELPLINE) expect(html).toContain(v);
    expect(html).toContain('이 메일은 발신 전용입니다. 회신하셔도 답변드릴 수 없습니다.');
    expect(html).toContain('ace@nuriholdem.com');
    expect(html).toContain(`href="${SUPPORT_URL}"`);
  });
});

describe('② 생성물 = 원본', () => {
  it.each(Object.entries(AUTH_TEMPLATES))('%s.html 이 templates.ts 렌더와 같다', (key, t) => {
    expect(read(`supabase/templates/auth/${key}.html`)).toBe(t.html);
  });
  it('subjects.json 이 원본과 같다', () => {
    const want = Object.fromEntries(Object.entries(AUTH_TEMPLATES).map(([k, t]) => [k, { subjectKey: t.subjectKey, contentKey: t.contentKey, subject: t.subject }]));
    expect(JSON.parse(read('supabase/templates/auth/subjects.json'))).toEqual(want);
  });
});

describe('③ Supabase Go 템플릿 변수', () => {
  it.each(Object.keys(REQUIRED_VARS))('%s — 원본이 쓰던 변수를 모두 담고, 그 밖의 {{ }} 는 없다', (key) => {
    const html = AUTH_TEMPLATES[key].html;
    for (const v of REQUIRED_VARS[key]) expect(html).toContain(v);
    const used = new Set(html.match(/\{\{[^}]*\}\}/g) ?? []);
    expect([...used].filter((v) => !REQUIRED_VARS[key].includes(v))).toEqual([]);
  });
  it('링크형 템플릿은 버튼과 복사용 주소 두 곳에 같은 URL 변수를 쓴다', () => {
    for (const key of ['confirmation', 'magic_link', 'email_change']) {
      expect(AUTH_TEMPLATES[key].html.split('href="{{ .ConfirmationURL }}"').length - 1).toBe(2);
    }
  });
});

describe('③ 유효시간 문구 = 운영 mailer_otp_exp', () => {
  // 2026-09-30 리드 실측: 운영 mailer_otp_exp = 3600초. 설정이 바뀌면 이 숫자와 templates.ts 의 OTP_EXPIRY_SEC 를 같이 고친다.
  const MAILER_OTP_EXP = 3600;
  it('원본 상수가 운영 값과 같다', () => { expect(OTP_EXPIRY_SEC).toBe(MAILER_OTP_EXP); });
  it.each(Object.keys(REQUIRED_VARS))('%s — 본문에 적힌 시간이 3600초다', (key) => {
    const found = [...AUTH_TEMPLATES[key].html.matchAll(/>(\d+)(시간|분)<\/strong>/g)].map((m) => Number(m[1]) * (m[2] === '시간' ? 3600 : 60));
    expect(found.length, '유효시간 문구를 못 찾았다 — 이 계약이 아무것도 안 보고 있다').toBeGreaterThan(0);
    expect(found.every((s) => s === MAILER_OTP_EXP)).toBe(true);
  });
});

describe('③ 자산·호환', () => {
  it('로고는 저장소의 public/email/logo.png(2x PNG) — 삭제된 /2.png 를 가리키지 않는다', () => {
    expect(LOGO_URL).toBe(`${SITE}/email/logo.png`);
    const png = readFileSync(join(ROOT, 'public/email/logo.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([LOGO_W * 2, LOGO_H * 2]);
    for (const [, html] of ALL) expect(html).not.toContain('/2.png');
    expect(existsSync(join(ROOT, 'public/2.png'))).toBe(false);
    // 제재 안내 메일도 같은 로고 자산을 쓴다(예전 /2.png — 깨진 이미지)
    const sanction = read('supabase/functions/notify-sanction/index.ts').replace(/^\s*\/\/.*$/gm, ''); // 주석(이력) 제외
    expect(sanction).not.toContain('2.png');
    expect(sanction).toContain("from '../_shared/email/layout.ts'");
  });
  it.each(ALL)('%s — 스크립트·외부 CSS·웹폰트 없음, 고정 폭 600 이하', (_k, html) => {
    expect(html).not.toMatch(/<script|<link\b|@import|@font-face|javascript:/i);
    for (const m of html.matchAll(/(?:\bwidth="|max-width:)(\d+)/g)) expect(Number(m[1])).toBeLessThanOrEqual(600);
    expect(html).toContain('<meta name="color-scheme" content="dark">');
  });
  it('고객센터 딥링크 ?nl=/support 는 App 이 고객센터를 여는 링크다', () => {
    expect(new URL(SUPPORT_URL).searchParams.get('nl')).toBe('/support');
    expect(read('src/App.tsx')).toContain("if (link === '/support') { openSupport(); return; }");
  });
});

describe('③ 대비(WCAG AA 4.5:1)·§28', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  it.each([
    ['본문/카드', C.body, C.card], ['보조/카드', C.sub, C.card], ['보조/상자', C.sub, C.inset], ['강조/상자', C.text, C.inset],
    ['링크/상자', C.gold, C.inset], ['버튼 글자/버튼', C.onGold, C.gold], ['하단/지면', C.foot, C.page],
  ])('%s ≥ 4.5', (_n, fg, bg) => { expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5); });
  it.each(ALL)('%s — 환금성 표현이 없다', (_k, html) => {
    for (const w of ['환전', '현금', '수익', '상금', '배당', '당첨']) expect(html).not.toContain(w);
  });
});
