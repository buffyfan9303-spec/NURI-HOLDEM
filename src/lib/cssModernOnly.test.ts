// 실행: npx vitest run src/lib/cssModernOnly.test.ts
// 빌드 후처리(vite.config.ts)가 지원 브라우저에서 안 쓰이는 v4 폴백만 걷어내고 **쓰이는 값은 그대로 두는지**.
// 음성 대조: cssModernOnly 가 아무것도 안 하면(입력 그대로) ①②③ 이 실패한다.
import { describe, expect, it } from 'vitest';
import { cssModernOnly } from './cssModernOnly';

const LIC = '/*! tailwindcss v4.3.3 | MIT License | https://tailwindcss.com */\n';
const PROPS = '@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){*,:before,:after,::backdrop{--tw-shadow:0 0 #0000;--tw-content:""}}}';

describe('cssModernOnly', () => {
  it('① @property 폴백 층(@layer properties)을 지우고 라이선스 주석은 남긴다', () => {
    const r = cssModernOnly(LIC + PROPS + '@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}');
    expect(r.css).toBe(LIC + '@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}');
    expect(r.stats.propsFallback).toBe(1);
  });

  it('② color-mix @supports 는 바로 앞 같은 선택자 규칙의 폴백 선언 자리에 끼워 넣는다', () => {
    const css = '.a{color:red}.b\\/40{border-color:rgb(var(--x));padding:1px}@supports (color:color-mix(in lab, red, red)){.b\\/40{border-color:color-mix(in oklab, rgb(var(--x)) 40%, transparent)}}.c{color:blue}';
    const r = cssModernOnly(css);
    expect(r.css).toBe('.a{color:red}.b\\/40{border-color:color-mix(in oklab, rgb(var(--x)) 40%, transparent);padding:1px}.c{color:blue}');
    expect(r.stats).toMatchObject({ unwrapped: 1, merged: 1 });
  });

  it('② 앞 규칙과 선택자가 다르면 자리 그대로 푼다(순서 불변)', () => {
    const css = '.a{color:red}@supports (background-image:linear-gradient(in lab, red, red)){.b{--p:to bottom in srgb}}.c{color:blue}';
    expect(cssModernOnly(css).css).toBe('.a{color:red}.b{--p:to bottom in srgb}.c{color:blue}');
  });

  it('② @media 안에 든 것도 같은 규칙으로 푼다', () => {
    const css = '@media (hover:hover){.h:hover{background-color:rgb(var(--y))}@supports (color:color-mix(in lab, red, red)){.h:hover{background-color:color-mix(in oklab, rgb(var(--y)) 10%, transparent)}}}';
    expect(cssModernOnly(css).css).toBe('@media (hover:hover){.h:hover{background-color:color-mix(in oklab, rgb(var(--y)) 10%, transparent)}}');
  });

  it('③ 지원 브라우저에서 늘 거짓인 @supports not(backdrop-filter · background-clip:text) 는 지운다', () => {
    const css = '.g{color:red}@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.g{background-color:black}}@supports not ((-webkit-background-clip:text) or (background-clip:text)){.t{background-image:none}}';
    expect(cssModernOnly(css).css).toBe('.g{color:red}');
  });

  it('선택자 이스케이프 따옴표(content-[\'\'])에서 파싱이 어긋나지 않는다', () => {
    const css = ".before\\:content-\\[\\'\\'\\]:before{--tw-content:\"\";content:var(--tw-content)}.k{color:rgb(var(--z))}@supports (color:color-mix(in lab, red, red)){.k{color:color-mix(in oklab, rgb(var(--z)) 5%, transparent)}}";
    expect(cssModernOnly(css).css).toBe(".before\\:content-\\[\\'\\'\\]:before{--tw-content:\"\";content:var(--tw-content)}.k{color:color-mix(in oklab, rgb(var(--z)) 5%, transparent)}");
  });

  it('다른 @supports(점진적 향상)·@keyframes·@font-face 는 한 글자도 안 바꾼다', () => {
    const css = '@font-face{font-family:x;src:url(a.woff2)}@supports (field-sizing:content){textarea{field-sizing:content}}@keyframes k{0%{opacity:0}to{opacity:1}}.a:is(:where(.g):hover *){color:red}';
    expect(cssModernOnly(css).css).toBe(css);
  });
});
