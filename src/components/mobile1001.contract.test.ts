// 디자인 개선안 1001 모바일(M-01·02·03·06·08·09·10·11·12, 오너 10-01 선택) 재발 방지 계약.
// 화면 수치(대비·높이)는 브라우저 몫이다 — 390×844 실측은 scratchpad 하네스(After 주입 캡처와 픽셀 대조).
// 여기서는 그 결과를 만든 조리법이 자리에 있는지만 본다. 주석을 걷고 본다(주석 속 문자열로 거짓 통과 금지).
// 근거: 누리홀덤_디자인개선안_1001/M_모바일/M_items.md · 실행: npx vitest run src/components/mobile1001.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const css = src('index.css').replace(/\/\*[\s\S]*?\*\//g, '');

describe('디자인 개선안 1001 모바일', () => {
  it('M-01 포스터 위 배지 줄은 data-on-dark 이고, 라이트 보정이 그 줄에서만 파스텔로 되돌아간다', () => {
    expect(code('components/features/ScheduleDetailModal.tsx')).toMatch(/<div data-on-dark="" className="absolute top-3 left-3 /);
    for (const [c, v] of [['blue', '93C5FD'], ['purple', 'D8B4FE'], ['teal', '5EEAD4'], ['amber', 'FCD34D'], ['pink', 'F9A8D4'], ['emerald', '6EE7B7']])
      expect(css).toMatch(new RegExp(`html\\.light \\[data-on-dark\\] \\.text-${c}-300\\s*\\{ color: #${v}; \\}`));
  });
  it('M-02 날짜 레일 주말 요일에 알파가 없다', () => {
    expect(code('components/features/IntegratedSearchBar.tsx')).toMatch(/slot\.isSun \? 'text-danger-light' : slot\.isSat \? 'text-sky-400' : 'text-ink-muted'/);
  });
  it('M-03 캘린더 다른 달 칸은 흐리지 않고 숫자만 보조색', () => {
    const c = code('components/features/CalendarPanel.tsx');
    expect(c).not.toMatch(/outside \? 'opacity-/);
    expect(c).toMatch(/isToday \? 'font-extrabold text-accent-200' : outside \? 'font-semibold text-ink-muted' : 'font-semibold text-ink-primary'/);
  });
  it('M-06 SegmentedTabs quiet 은 기본 꺼짐이고, 알림 패널 하위 필터에만 켠다', () => {
    const s = code('components/atoms/SegmentedTabs.tsx');
    expect(s).toMatch(/quiet = false,/);
    expect(s).toMatch(/quiet \? 'rounded-\[6px\] bg-accent-300\/16' : 'rounded-\[6px\] pill-active'/);
    expect(s).toMatch(/on \? \(quiet \? 'font-bold text-accent-200' : 'font-bold text-white'\)/);
    const n = code('components/features/NotificationPanel.tsx');
    expect(n.match(/<SegmentedTabs[^>]*\squiet\b/g)?.length).toBe(1);
    expect(n).toMatch(/key: 'unread', label: '안 읽음' \}\]\} value=\{filter\} hitUp quiet/);
  });
  it('M-08 일정 상세 포스터 최대 높이 42svh(로드 전 예약 min(40vh,320px) 은 그대로)', () => {
    const c = code('components/features/ScheduleDetailModal.tsx');
    expect(c).toMatch(/style=\{\{ minHeight: 'min\(40vh, 320px\)' \}\}\s*className="block h-auto w-full max-h-\[42svh\] object-contain lg:max-h-screen"/);
  });
  it('M-09 글쓰기 시트 제목·취소·게시하기는 44px(전역 .btn/.input 은 그대로)', () => {
    const c = code('components/features/PostFormModal.tsx');
    expect(c).toMatch(/placeholder="제목을 입력하세요"\s*className="input min-h-\[44px\]"/);
    expect(c).toMatch(/className="btn-ghost flex-1 min-h-\[44px\]"/);
    expect(c).toMatch(/className="btn-primary flex-1 min-h-\[44px\] disabled:opacity-60"/);
  });
  it('M-10 홈 날짜 칩 요일은 text-2xs·보조색', () => {
    expect(code('components/features/HomeTab.tsx')).toMatch(/<span className=\{`text-2xs leading-\[1\.1\] \$\{isToday \? 'font-bold text-accent-200' : 'text-ink-secondary'\}`\}>/);
  });
  it('M-11 내 정보 이름 줄에 칭호 칩이 없다(칭호는 Lv 줄에 남는다)', () => {
    const c = code('components/features/ProfileModal.tsx');
    expect(c).not.toMatch(/TitleChip/);
    expect(c).toMatch(/Lv \{prog\.current\.level\} · <b[^>]*>\{prog\.current\.title\}<\/b>/);
  });
  it('M-12 전광판은 흐를 때만, 동작 허용일 때만 좌우 14px 페이드 — 마스크가 아니라 지면색 오버레이', () => {
    const c = code('components/atoms/MarqueeText.tsx');
    expect(c).toMatch(/const edgeFade = loopW > 0 \? ' marquee-fade' : '';/);
    expect(c).toMatch(/overflow-hidden\$\{edgeFade\} /);
    // mask 는 줄마다 합성면을 만들어 e2e tab-handoff-gate ④ 를 깨뜨렸다 — 되살리지 않는다
    expect(c).not.toMatch(/mask-image/);
    const block = /@media \(prefers-reduced-motion: no-preference\) \{\s*\.marquee-fade::before[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    expect(block).toMatch(/\.marquee-fade::before \{ left: 0; background: linear-gradient\(90deg, var\(--marquee-fade-l, var\(--marquee-fade, rgb\(var\(--surface-low\)\)\)\), transparent\); \}/);
    expect(block).toMatch(/\.marquee-fade::after \{ right: 0; background: linear-gradient\(270deg, var\(--marquee-fade, rgb\(var\(--surface-low\)\)\), transparent\); \}/);
    expect(block).toMatch(/width: 14px; pointer-events: none;/);
    expect(block).not.toMatch(/mask|filter|will-change|transform/);
  });
});
