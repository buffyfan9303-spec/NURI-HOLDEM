// 프로필 공유 카드 — 닉네임·등급·활동점수·입상 횟수를 담은 이미지(인스타/카톡 프로필용) 생성·저장.
//
// ── 색이 전부 hex 상수인 이유 (2026-08-30 프레임 5종 추가하며 명문화) ─────────
//  **canvas 2D 는 CSS 변수를 읽지 못한다.** `getComputedStyle` 로 뽑아 오는 우회는 가능하지만,
//  그러면 같은 카드가 **보는 사람의 테마에 따라 다른 그림**이 된다 — 공유 이미지는 상대방 기기의
//  테마와 무관하게 같아야 하므로 그건 버그다. 그래서:
//    · 배경은 **다크 고정**이다(라이트 테마 사용자가 저장해도 카드는 어둡게 나간다).
//    · 프레임 색도 hex 고정이다. 아래 FRAMES 의 값은 앱 토큰의 다크 기준 스냅샷이며,
//      index.css 토큰이 바뀌어도 **따라가지 않는다**(따라가면 안 된다 — 위 이유).
//  ⇒ 이 파일의 hex 는 '토큰을 안 쓴 것'이 아니라 **캔버스라서 못 쓰는 것**이다.
//    같은 판단이 recordCard.ts(전적 카드)와 clockTheme.ts(클락 TV)에도 있다.
//
// ── 프레임 5종(각 400점, 서버 shop_skus.card_frame) ──────────────────────────
//  키는 서버 shop_cosmetics.key 와 1:1 이다(src/lib/cosmetics.ts). 소장하지 않은 키가 들어오면
//  기본(골드 라인)으로 떨어진다 — 화면이 소유를 판정하지 않고 **서버가 준 장착값만** 그린다.
import { FRAME_FALLBACK } from './cosmetics';

/** 프레임 키 — cosmetics.ts 폴백과 같은 집합임을 타입으로 잇는다 */
export type FrameKey = 'frame_gold' | 'frame_neon' | 'frame_felt' | 'frame_chip' | 'frame_royal';

interface FrameStyle {
  /** 카드 바탕 그라데이션(위→아래). 전부 어두운 값만 쓴다 — 흰 글자가 얹히는 지면이다. */
  bg: [string, string];
  /** 중앙 글로우(스페이드 뒤) */
  glow: string;
  /** 테두리 · 워드마크 · 스탯 숫자에 쓰는 주 색 */
  accent: string;
  /** 스페이드 글리프 색 */
  spade: string;
  /** 바깥 테두리 두께(px) */
  width: number;
  /** 'double' = 이중선 · 'glow' = 번지는 네온 · 'chips' = 테두리를 도는 칩 */
  style: 'double' | 'glow' | 'chips';
}

/**
 * 프레임 정의. accent 값의 출처:
 *   gold  #FFD100 = --tier-gold 다크
 *   neon  #B388FF = --tier-purple-vivid 다크
 *   felt  #4FCB98 = --tier-green 다크
 *   chip  #FF9F45 = --tier-orange 다크
 *   royal #C6CEDB = --tier-steel 다크
 * (스냅샷이다 — 위 헤더 참조. 토큰이 바뀌어도 여기는 따라가지 않는다.)
 */
const FRAMES: Record<FrameKey, FrameStyle> = {
  frame_gold:  { bg: ['#11151C', '#0A0C0F'], glow: '255,209,0',   accent: '#FFD100', spade: '#FFD100', width: 3, style: 'double' },
  frame_neon:  { bg: ['#150F24', '#08060E'], glow: '179,136,255', accent: '#B388FF', spade: '#B388FF', width: 3, style: 'glow'   },
  frame_felt:  { bg: ['#0B1A14', '#05100B'], glow: '79,203,152',  accent: '#4FCB98', spade: '#4FCB98', width: 3, style: 'double' },
  frame_chip:  { bg: ['#1A1208', '#0C0805'], glow: '255,159,69',  accent: '#FF9F45', spade: '#FF9F45', width: 3, style: 'chips'  },
  frame_royal: { bg: ['#0C1226', '#05070F'], glow: '198,206,219', accent: '#C6CEDB', spade: '#C6CEDB', width: 3, style: 'double' },
};

/** 기본 프레임 = 종전 카드와 같은 그림(프레임을 사지 않은 사람의 카드가 바뀌면 안 된다) */
export const DEFAULT_FRAME: FrameKey = 'frame_gold';

/** 알 수 없는 키(판매 중지·미소장)는 기본으로 — 카드가 비거나 터지지 않게 */
export const frameOf = (key?: string | null): FrameKey =>
  key && key in FRAMES ? (key as FrameKey) : DEFAULT_FRAME;

/** 프레임 라벨(상점 카드용) — 서버 카탈로그가 오기 전에도 이름이 비지 않게 폴백에서 읽는다 */
export const frameLabel = (key: string): string =>
  FRAME_FALLBACK.find((f) => f.key === key)?.label ?? key;

export interface ProfileCardInput {
  nickname: string;
  tierLabel: string;     // 예: 'QQ'
  tierColor?: string;    // 등급 색(6자리 hex — TierBadge.tierColor 의 반환 계약)
  points: number;        // 활동 점수
  moneyinCount?: number; // 입상 횟수(선택)
  /** 장착한 프레임 키(서버 profiles.equipped_card_frame). 없으면 기본 골드 라인. */
  frame?: string | null;
}

const W = 640, H = 880;

/** 카드 1장을 캔버스에 그린다. 저장·미리보기가 같은 그림을 쓰도록 그리기를 한 곳에 모았다. */
export function drawProfileCard(c: HTMLCanvasElement, input: ProfileCardInput): void {
  const f = FRAMES[frameOf(input.frame)];
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, W, H);

  // 배경 — 프레임별 딥 톤(전부 다크 고정)
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, f.bg[0]);
  bg.addColorStop(1, f.bg[1]);
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W / 2, H * 0.32, 40, W / 2, H * 0.32, 360);
  glow.addColorStop(0, `rgba(${f.glow},0.18)`);
  glow.addColorStop(1, `rgba(${f.glow},0)`);
  x.fillStyle = glow; x.fillRect(0, 0, W, H);

  // 테두리 — 프레임의 성격이 드러나는 유일한 지점이라 세 갈래로 나눈다.
  x.save();
  if (f.style === 'glow') {
    // 네온: 같은 사각형을 굵기·알파를 낮춰 두 번 겹쳐 번지게 한다.
    // canvas 의 shadowBlur 는 기기·브라우저마다 반경이 미묘하게 달라 그림이 갈린다 — 겹치기가 안전하다.
    x.strokeStyle = `rgba(${f.glow},0.22)`; x.lineWidth = f.width + 8;
    x.strokeRect(18, 18, W - 36, H - 36);
    x.strokeStyle = `rgba(${f.glow},0.45)`; x.lineWidth = f.width + 3;
    x.strokeRect(18, 18, W - 36, H - 36);
    x.strokeStyle = f.accent; x.lineWidth = f.width;
    x.strokeRect(18, 18, W - 36, H - 36);
  } else if (f.style === 'chips') {
    x.strokeStyle = `${f.accent}8C`; x.lineWidth = f.width;
    x.strokeRect(18, 18, W - 36, H - 36);
    // 테두리를 따라 도는 칩 — 네 변에 같은 간격으로. 모서리에 겹치지 않게 여백을 둔다.
    const r = 7, gap = 46;
    x.fillStyle = f.accent;
    const dot = (cx: number, cy: number) => {
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      x.strokeStyle = f.bg[1]; x.lineWidth = 2;
      x.beginPath(); x.arc(cx, cy, r - 3, 0, Math.PI * 2); x.stroke();
      x.fillStyle = f.accent;
    };
    for (let px = 18 + gap; px < W - 18 - gap / 2; px += gap) { dot(px, 18); dot(px, H - 18); }
    for (let py = 18 + gap; py < H - 18 - gap / 2; py += gap) { dot(18, py); dot(W - 18, py); }
  } else {
    // 이중선 — 바깥 굵은 선 + 안쪽 얇은 선
    x.strokeStyle = `${f.accent}8C`; x.lineWidth = f.width;
    x.strokeRect(18, 18, W - 36, H - 36);
    x.strokeStyle = `${f.accent}59`; x.lineWidth = 1.5;
    x.strokeRect(28, 28, W - 56, H - 56);
  }
  x.restore();

  // 스페이드 — 도메인 기호라 프레임이 바뀌어도 모양은 그대로, 색만 따라간다.
  x.fillStyle = f.spade;
  x.beginPath();
  const sx = W / 2, sy = H * 0.30, s = 1.9;
  x.moveTo(sx, sy - 60 * s);
  x.bezierCurveTo(sx - 42 * s, sy + 8 * s, sx - 78 * s, sy + 28 * s, sx - 60 * s, sy + 58 * s);
  x.bezierCurveTo(sx - 44 * s, sy + 80 * s, sx - 16 * s, sy + 72 * s, sx - 8 * s, sy + 56 * s);
  x.bezierCurveTo(sx - 12 * s, sy + 78 * s, sx - 22 * s, sy + 90 * s, sx - 34 * s, sy + 100 * s);
  x.lineTo(sx + 34 * s, sy + 100 * s);
  x.bezierCurveTo(sx + 22 * s, sy + 90 * s, sx + 12 * s, sy + 78 * s, sx + 8 * s, sy + 56 * s);
  x.bezierCurveTo(sx + 16 * s, sy + 72 * s, sx + 44 * s, sy + 80 * s, sx + 60 * s, sy + 58 * s);
  x.bezierCurveTo(sx + 78 * s, sy + 28 * s, sx + 42 * s, sy + 8 * s, sx, sy - 60 * s);
  x.closePath(); x.fill();

  const center = (txt: string, y: number, font: string, color: string, spacing = 0) => {
    x.font = font; x.fillStyle = color; x.textAlign = 'center';
    if (spacing > 0) {
      const total = [...txt].reduce((a, ch) => a + x.measureText(ch).width + spacing, -spacing);
      let cx = W / 2 - total / 2;
      for (const ch of txt) { x.fillText(ch, cx + x.measureText(ch).width / 2, y); cx += x.measureText(ch).width + spacing; }
    } else x.fillText(txt, W / 2, y);
  };

  center('NURI HOLDEM', 92, '800 26px Arial', `${f.accent}D9`, 6);
  center(input.nickname, H * 0.56, '900 64px Arial', '#FFFFFF');
  // 등급 칩 — 등급색은 등급의 것이라 프레임을 따라가지 않는다(프레임은 테두리·바탕만 바꾼다).
  const tier = `${input.tierLabel} 등급`;
  x.font = '900 38px Arial';
  const tw = x.measureText(tier).width + 56;
  x.fillStyle = `rgba(${f.glow},0.14)`;
  x.strokeStyle = input.tierColor ?? f.accent; x.lineWidth = 2.5;
  const ty = H * 0.62;
  x.beginPath(); x.roundRect(W / 2 - tw / 2, ty, tw, 64, 32); x.fill(); x.stroke();
  center(tier, ty + 45, '900 38px Arial', input.tierColor ?? f.accent);

  // 스탯 2단
  const statY = H * 0.78;
  const stat = (label: string, value: string, cx: number) => {
    x.font = '800 44px Arial'; x.fillStyle = f.accent; x.textAlign = 'center'; x.fillText(value, cx, statY);
    x.font = '600 22px Arial'; x.fillStyle = '#8B93A3'; x.fillText(label, cx, statY + 34);
  };
  if (input.moneyinCount !== undefined) {
    stat('활동 점수', input.points.toLocaleString(), W * 0.32);
    stat('머니인(입상)', `${input.moneyinCount}회`, W * 0.68);
  } else {
    stat('활동 점수', input.points.toLocaleString(), W / 2);
  }

  center('nuriholdem.com', H - 56, '700 22px Arial', 'rgba(255,255,255,0.45)', 2);
}

/** 카드 이미지를 만들어 파일로 저장한다(종전 동작 그대로 — 프레임 인자만 늘었다). */
export function downloadProfileCard(input: ProfileCardInput): void {
  const c = document.createElement('canvas');
  drawProfileCard(c, input);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `NURI_${input.nickname}_프로필카드.png`;
  document.body.appendChild(a); a.click(); a.remove();
}
