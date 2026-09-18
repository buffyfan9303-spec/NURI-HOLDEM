// 2026-09-19 스윕 A·C — 내 정보 박스 문법 통일 + 닫는 모션 4곳.
//
// 왜 소스 계약인가: 5곳 박스 통일은 렌더 트리로도 볼 수 있지만(voucher-sheet-open.spec 과 같은 방식),
//   여기선 keep-alive·auth·supabase 없이도 "그 자리에 그 클래스가 있는가"로 충분히 재발을 잡는다
//   (homeLiveFreshness/postNavWiring 과 같은 결). 닫는 모션은 렌더 트리 테스트로는 setTimeout 정착까지
//   기다려야 해 느리고 불안정하다 — "render/closing 상태와 exit 애니 클래스가 코드에 있는가"만 본다.
// 음성 대조(2026-09-19 실행): 각 섹션의 `rounded-aura border card-aura p-3` 를 `space-y-2` 로 되돌리면
//   A 가, RedeemSheet/NotificationPanel/ImageLightbox/CoachMark 의 `closing` state 를 지우면 C 가 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (...p: string[]) => strip(readFileSync(join(__dirname, ...p), 'utf-8'));
const ME = read('CustomerDashboardPage.tsx');
const VW = read('VoucherWallet.tsx');
const NOTIF = read('NotificationPanel.tsx');
const LIGHTBOX = read('..', 'atoms', 'ImageLightbox.tsx');
const COACH = read('..', 'atoms', 'CoachMark.tsx');

describe('A · 내 정보 대시보드 — 형제 섹션 5개가 전부 card-aura 박스', () => {
  it('🔴 하이라이트 요약 · 매장 이용·참가 내역 · 대회 참가 내역 · 내 입상 기록이 박스다', () => {
    expect(ME).toMatch(/\(loading \? meHiliteSeen\(\) : usage\.length > 0\) && \(\s*<section className="rounded-aura border card-aura p-3">\s*<Head icon="trending-up"/);
    expect(ME).toMatch(/<section className="rounded-aura border card-aura p-3">\s*<Head icon="store"/);
    expect(ME).toMatch(/<section className="rounded-aura border card-aura p-3">\s*<Head icon="calendar-check"/);
    expect(ME).toMatch(/<section ref=\{recordsRef\} className="scroll-mt-4 rounded-aura border card-aura p-3">/);
  });
  it('🔴 VoucherWallet 은 boxed 를 받는다(compact 와 별개 축)', () => {
    expect(ME).toMatch(/<VoucherWallet onNeedVerify=\{\(\) => goTab\('security'\)\} onVenue=\{onOpenVenue\} boxed \/>/);
    expect(VW).toMatch(/boxed\?: boolean;/);
    expect(VW).toMatch(/const boxedResolved = boxed \?\? compact;/);
  });
  it('🔴 카드 속 카드(HiCard·RecordSummary·RankTrendChart)는 card-aura-sub — card-aura 이중 테두리 금지', () => {
    expect(ME).toMatch(/function HiCard[\s\S]{0,200}?rounded-aura border card-aura-sub p-3/);
    expect(ME).toMatch(/rounded-aura border card-aura-sub p-3">\s*<div className="mb-2 flex items-center justify-between gap-2">\s*<p className="flex flex-wrap items-center gap-1 text-xs font-bold text-gold-300">/);
  });
});

describe('C · 닫는 모션 — render/closing + 지연 unmount 4곳', () => {
  it('🔴 NotificationPanel — fade-out 없이 즉시 unmount 로 되돌아가지 않는다', () => {
    expect(NOTIF).toMatch(/const \[render, setRender\] = useState\(open\);/);
    expect(NOTIF).toMatch(/const \[closing, setClosing\] = useState\(false\);/);
    expect(NOTIF).toMatch(/if \(!render\) return null;/);
    expect(NOTIF).not.toMatch(/if \(!open\) return null;/);
    expect(NOTIF).toMatch(/closing \? 'animate-fade-out' : 'animate-slide-up'/);
  });
  it('🔴 NotificationPanel — 회귀(2026-09-19): 여는 방향은 useLayoutEffect 로 한 틱도 안 늦는다', () => {
    // team-lead 실측(account-isolation.spec.ts '쪽지 패널') + 직접 재현·console 계측으로 확인한 근본 원인:
    //   useEffect 로 열면 open=true 인 첫 렌더가 아직 render=false(과거 값)라 한 프레임 안 그려진 채 페인트되고,
    //   중간에 콘텐츠를 기다리지 않고 그 자리를 즉시 다시 클릭하면 아직 없는 스크림을 지나쳐 뒤 화면(예: 헤더
    //   계정 메뉴)을 그대로 클릭했다. useLayoutEffect 는 페인트 전에 동기 실행돼 그 프레임이 생기지 않는다.
    expect(NOTIF, '여는 방향(useEffect)이 되돌아가면 벨을 클릭한 직후 스크림/패널이 한 틱 늦게 나타나는 회귀가 재발한다')
      .toMatch(/useLayoutEffect\(\(\) => \{\s*if \(open\) \{ setRender\(true\); setClosing\(false\); return; \}/);
    // 닫힘(지연 unmount) 자체는 남아 있어야 한다 — "그려진 채로 너무 오래 남는" 문제는 pointer-events 로 따로 막는다.
    expect(NOTIF).toMatch(/const t = window\.setTimeout\(\(\) => setRender\(false\), 180\);/);
  });
  it('🔴 NotificationPanel — 회귀(2026-09-19): 닫히는 동안 스크림·패널이 뒤 화면 클릭을 계속 가로채지 않는다', () => {
    // team-lead 실측: 퇴장 애니가 남아 있는 동안 z-40 fixed inset-0 스크림이 계속 pointer-events 를 먹어
    // 헤더 계정 메뉴 클릭이 90초 넘게 막혔다. `open` 그 자체(지연 없는 ground truth)로 pointer-events 를 끈다.
    expect(NOTIF, '모바일 스크림에 pointer-events 분기가 없다').toMatch(/bg-black\/30 sm:hidden', open \? 'pointer-events-auto' : 'pointer-events-none'/);
    expect(NOTIF, '패널 자신(모바일에서 거의 전체 폭)에도 pointer-events 분기가 없다').toMatch(/open \? 'pointer-events-auto' : 'pointer-events-none',\s*closing \? 'animate-fade-out' : 'animate-slide-up'/);
  });
  it('🔴 ImageLightbox — startClose 가 onClose 를 즉시 부르지 않는다', () => {
    expect(LIGHTBOX).toMatch(/const startClose = \(\) => \{/);
    expect(LIGHTBOX).toMatch(/closeTimer\.current = window\.setTimeout\(onClose, 180\);/);
    expect(LIGHTBOX).toMatch(/closing \? 'pointer-events-none animate-fade-out' : 'animate-fade-in'/);
    // 2026-09-19 회귀 — 퇴장 애니 동안 스크림이 뒤 화면 클릭을 계속 가로챘다(ImageLightbox.tsx 주석).
    // closing 이 되는 즉시 pointer-events 를 꺼야 한다.
    expect(LIGHTBOX, 'closing 중에도 pointer-events 가 안 꺼지면 뒤 화면 클릭을 계속 막는다').toMatch(/pointer-events-none/);
    expect(LIGHTBOX).not.toMatch(/onClick=\{\(e\) => \{ if \(e\.target === e\.currentTarget\) onClose\(\); \}\}/);
  });
  it('🔴 VoucherWallet RedeemSheet — slide-down 없이 즉시 unmount 로 되돌아가지 않는다', () => {
    expect(VW).toMatch(/closeTimer\.current = window\.setTimeout\(onClose, 200\);/);
    expect(VW).toMatch(/closing \? 'animate-slide-down' : 'animate-sheet-up'/);
    // 2026-09-19 회귀 — NotificationPanel 과 같은 부류: 전면 오버레이(배경 버튼 포함)가 닫히는 동안
    // 뒤 화면 클릭을 계속 가로챌 수 있다.
    expect(VW, 'RedeemSheet 루트에 closing→pointer-events-none 분기가 없다').toMatch(/z-\[70\] flex items-end justify-center sm:items-center', closing \? 'pointer-events-none' : ''/);
  });
  it('🔴 CoachMark — [확인] 이 fade-out 없이 즉시 사라지지 않는다', () => {
    expect(COACH).toMatch(/closeTimer\.current = window\.setTimeout\(\(\) => setVisible\(false\), 180\);/);
    expect(COACH).toMatch(/closing \? 'animate-fade-out' : 'animate-fade-in'/);
  });
});
