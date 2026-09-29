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
import { AUTH_TEMPLATES, REQUIRED_VARS } from '../../supabase/templates/auth/templates.ts';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8').replace(/\r\n/g, '\n');
const support = supportReplyEmail({ nickname: 'n', category: '기타', title: 't', answer: 'a', answeredAt: '2026-09-30T00:00:00Z', isUpdate: false });
const ALL: [string, string][] = [...Object.entries(AUTH_TEMPLATES).map(([k, t]) => [k, t.html] as [string, string]), ['support-reply', support.html]];

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

describe('③ 자산·호환', () => {
  it('로고는 저장소의 public/email/logo.png(2x PNG) — 삭제된 /2.png 를 가리키지 않는다', () => {
    expect(LOGO_URL).toBe(`${SITE}/email/logo.png`);
    const png = readFileSync(join(ROOT, 'public/email/logo.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([LOGO_W * 2, LOGO_H * 2]);
    for (const [, html] of ALL) expect(html).not.toContain('/2.png');
    expect(existsSync(join(ROOT, 'public/2.png'))).toBe(false);
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
