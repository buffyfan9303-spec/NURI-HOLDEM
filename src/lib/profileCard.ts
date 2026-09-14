// 프로필 공유 카드 — 닉네임·등급·활동점수·입상 횟수를 담은 이미지(인스타/카톡 프로필용) 생성·저장.
//
// ── 2026-09-15 오너 결정: **상장(인증서) 형태 · 크림 종이 + 붉은 인장** ──────────
//  종전은 다크 바탕에 큰 스페이드 + 이름이었다. 오너가 시안 3종(A 지금 / B 인증서·다크 /
//  C 인증서·상장 종이) 중 **C** 를 골랐다. 구조가 "증명서" 가 되면서 두 가지가 따라온다:
//    · 마크(스페이드)가 **오른쪽 아래 원형 인장**으로 내려간다 → 이름과 **구조적으로 겹칠 수 없다**
//      (2026-09-15 겹침 버그의 재발 여지 자체가 사라진다. 그래도 계약은 남긴다 — 아래 CARD_* 참조).
//    · 산 프레임 5종은 **테두리·괘선·워드마크 색**으로 계속 구별된다(기능 보존).
//
// ── 색이 전부 hex 상수인 이유 (2026-08-30 명문화 · 그대로 유효) ────────────────
//  **canvas 2D 는 CSS 변수를 읽지 못한다.** `getComputedStyle` 우회는 가능하지만 그러면 같은 카드가
//  **보는 사람의 테마에 따라 다른 그림**이 된다 — 공유 이미지는 상대 기기 테마와 무관해야 하므로 버그다.
//  ⇒ 종이 바탕도 **크림 고정**이다(다크 테마 사용자가 저장해도 카드는 밝게 나간다).
//    이 파일의 hex 는 '토큰을 안 쓴 것'이 아니라 **캔버스라서 못 쓰는 것**이다.
//    같은 판단이 recordCard.ts(전적 카드)와 clockTheme.ts(클락 TV)에도 있다.
//
// ── 대비 실측 (2026-09-15 · WCAG 상대휘도) ───────────────────────────────────
//  기준 지면은 **순백이 아니라 실제 종이의 어두운 쪽** `PAPER_BOT`(#F1E7D0)이다(저장소 규칙).
//    본문 잉크 #1B1206  15.04  · 보조 #6B5A3E 5.41 · 약한 잉크 #6B5C40 5.29 → 전부 소형 텍스트 AA(4.5) 통과
//    붉은 인장 #A93226   5.39  → 비텍스트 3:1 통과(텍스트 기준도 넘는다)
//    프레임 종이색 5종   4.52~5.54 → 전부 AA 통과(괘선 3:1 도 당연히 통과)
//  ⚠ 시안 그대로 옮겼다면 **3곳이 미달**이었다(그래서 실측이 필요했다):
//    푸터 #9A8B6E 2.71 · 워드마크 #8A7350 3.67 · 괘선 #B99A50 2.19.
//  ⚠ 크림 카드는 **라이트 지면에 묻힌다**(#EEF2F8 대비 1.04 · 흰 지면 1.08).
//    그건 이 파일이 아니라 **미리보기를 얹는 쪽**이 테두리로 해결한다 —
//    TierLeaderboard 의 canvas 가 `border-border-strong`(라이트 #7F8CA6, 크림 대비 3.14) + 그림자를 쓴다.
//
// ── 프레임 5종(각 400점, 서버 shop_skus.card_frame) ──────────────────────────
//  키는 서버 shop_cosmetics.key 와 1:1 이다(src/lib/cosmetics.ts). 소장하지 않은 키가 들어오면
//  기본(골드 라인)으로 떨어진다 — 화면이 소유를 판정하지 않고 **서버가 준 장착값만** 그린다.
import { FRAME_FALLBACK } from './cosmetics';

/** 프레임 키 — cosmetics.ts 폴백과 같은 집합임을 타입으로 잇는다 */
export type FrameKey = 'frame_gold' | 'frame_neon' | 'frame_felt' | 'frame_chip' | 'frame_royal';

interface FrameStyle {
  /**
   * 종이 위 주 색 — 테두리·괘선·워드마크에 쓴다. **텍스트에도 쓰이므로 AA(4.5:1) 가 하한이다.**
   * 다크 토큰(#FFD100 등)을 그대로 쓰면 크림 위에서 2.2~3.7 로 미달이라 같은 색상(hue)의 딥 톤을 썼다.
   */
  accent: string;
  /** 테두리 두께(px) */
  width: number;
  /** 'double' = 이중 괘선 · 'glow' = 이중선 사이를 옅은 띠로 채움 · 'chips' = 테두리를 도는 칩 */
  style: 'double' | 'glow' | 'chips';
}

/**
 * 프레임 정의. accent 는 다크 토큰의 **색상(hue)을 유지한 채** 크림 위 AA 를 넘는 명도로 내린 값이다.
 *   gold  hue 48  (--tier-gold)         #7D6400  CR 4.62
 *   neon  hue 265 (--tier-purple-vivid) #7439C6  CR 5.43
 *   felt  hue 155 (--tier-green)        #1E7651  CR 4.54
 *   chip  hue 20  (--tier-orange)       #9E3B06  CR 5.54
 *   royal hue 215 (--tier-steel)        #576982  CR 4.56
 * ⚠ gold 와 chip 은 RGB 거리 53 으로 색만으로는 가깝다 — 둘의 구별은 **무늬**가 맡는다
 *   (gold=이중 괘선 / chip=테두리를 도는 칩). 색을 더 벌리면 한쪽이 AA 아래로 떨어진다.
 */
const FRAMES: Record<FrameKey, FrameStyle> = {
  frame_gold:  { accent: '#7D6400', width: 3, style: 'double' },
  frame_neon:  { accent: '#7439C6', width: 3, style: 'glow'   },
  frame_felt:  { accent: '#1E7651', width: 3, style: 'double' },
  frame_chip:  { accent: '#9E3B06', width: 3, style: 'chips'  },
  frame_royal: { accent: '#576982', width: 3, style: 'double' },
};

/** 상장 종이 — 위(밝음) → 아래(어두움). 대비는 **아래쪽 기준**으로 잰다(최악값). */
const PAPER_TOP = '#FBF6EA';
const PAPER_BOT = '#F1E7D0';
/** 본문 잉크 — 이름·항목 값. CR 15.04 */
const INK = '#1B1206';
/** 보조 잉크 — 항목 라벨·설명문. CR 5.41 */
const INK_SUB = '#6B5A3E';
/** 약한 잉크 — 발급 정보·푸터. CR 5.29 (시안의 #9A8B6E 는 2.71 로 미달이었다) */
const INK_FAINT = '#6B5C40';
/** 붉은 인장 — 오너가 고른 요소. CR 5.39 */
const SEAL = '#A93226';

/** 기본 프레임 = 프레임을 사지 않은 사람의 카드 */
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
  /**
   * 발급일. 없으면 그리는 시점의 날짜를 쓴다 — 이 이미지를 **만든 날**이라 그게 사실이다.
   * ⚠ 일련번호는 넣지 않는다: 근거가 될 값이 서버에 없다. 없는 것을 있는 것처럼 그리지 않는다
   *   (시안의 `No. NH-2026-0912-0471` 은 그림용 가짜였다 — 오너 지시로 뺐다).
   */
  issuedAt?: Date;
}

const W = 640, H = 880;

// ── 이름 띠 ↔ 마크(인장) 기하 — 겹침(오너 #5)이 다시 나지 않게 한 곳에서만 계산한다 ──
//  종전에는 마크(`sy = H*0.30`, `s = 1.9`)와 이름(`baseline = H*0.56`)이 **서로를 모르는** 매직 넘버라
//  실측에서 마크 아래끝 454.0 이 한글 닉네임 글자 위 436.8 을 17.2px 파고들었다(라틴 'A' 도 7.2px).
//  인증서 배치에서는 마크가 오른쪽 아래 인장으로 내려가 **가로로도 세로로도 겹칠 수 없게** 됐지만,
//  계약은 남긴다 — 다음 리디자인이 마크를 다시 이름 위로 올릴 수 있기 때문이다.
/** 이름 baseline(카드 좌표) */
export const CARD_NICK_BASE = 300;
/** 마크(인장) 위끝 — 이름·항목표보다 한참 아래다 */
export const CARD_SPADE_TOP = 638;
/** 마크 위끝 ↔ 이름 글자 아래 최소 간격 */
export const CARD_SPADE_GAP = 24;
/** `900 <size>px Arial` 한글 ascent 비율 — 64px 에서 56.0 실측(라틴은 46 이라 이 쪽이 최악값) */
export const CARD_NICK_ASCENT_RATIO = 0.875;
/** 한글 descent 비율 — 64px 에서 6.0 실측 */
export const CARD_NICK_DESCENT_RATIO = 0.094;
/** 이름 폭 상한 — 이중 괘선(34) 안쪽. 닉네임은 20자까지 허용된다(AuthModal maxLength=20) */
export const CARD_NICK_MAX_W = W - 96;
/** 이름 글자 크기 하한 — 20자 × 26px = 520px 로 상한 안에 들어간다 */
export const CARD_NICK_MIN_SIZE = 26;
/** 인장 반지름 */
export const CARD_SEAL_R = 62;

/** 이름 글자 아래끝 y */
export const nickBottomFor = (nickSize: number): number =>
  CARD_NICK_BASE + nickSize * CARD_NICK_DESCENT_RATIO;
/**
 * 마크(인장) 위끝 y — 이름 글자 아래보다 반드시 CARD_SPADE_GAP 이상 아래다.
 * 이름 크기를 받지 않는다: 인장은 카드 아래쪽 고정 자리다(종전 배치와 달리 이름 크기에 딸려 오지 않는다).
 * 함수로 두는 이유는 다음 리디자인이 이 관계를 바꿔도 **호출부와 계약이 한 이름을 보게** 하기 위해서다.
 */
export const spadeTopFor = (): number => CARD_SPADE_TOP;

/** 카드 폭을 넘치면 이름 크기를 줄인다 — 20자 닉네임은 64px 에서 1,280px 라 640px 카드를 통째로 뚫는다. */
export function fitNickSize(measureAt: (size: number) => number): number {
  let size = 64;
  while (size > CARD_NICK_MIN_SIZE && measureAt(size) > CARD_NICK_MAX_W) size -= 2;
  return size;
}

/** 발급일 문자열 — KST 기준 `2026. 09. 15.` */
export const issuedLabel = (d: Date): string =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

/** 카드 1장을 캔버스에 그린다. 저장·미리보기가 같은 그림을 쓰도록 그리기를 한 곳에 모았다. */
export function drawProfileCard(c: HTMLCanvasElement, input: ProfileCardInput): void {
  const f = FRAMES[frameOf(input.frame)];
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, W, H);

  // 종이 — 위가 밝고 아래가 살짝 눅은 크림. 대비는 전부 아래쪽(PAPER_BOT) 기준으로 쟀다.
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, PAPER_TOP);
  bg.addColorStop(1, PAPER_BOT);
  x.fillStyle = bg; x.fillRect(0, 0, W, H);

  // ── 테두리 — 산 프레임이 드러나는 지점. 색이 가까운 두 프레임은 무늬로 갈린다(FRAMES 주석 참조).
  x.save();
  x.strokeStyle = f.accent; x.lineWidth = f.width;
  x.strokeRect(24, 24, W - 48, H - 48);
  if (f.style === 'glow') {
    // 네온: 종이에 번짐은 안 어울린다 — 이중선 **사이를 옅은 띠**로 채워 같은 '두툼함'을 낸다.
    x.strokeStyle = `${f.accent}22`; x.lineWidth = 8;
    x.strokeRect(29, 29, W - 58, H - 58);
    x.strokeStyle = `${f.accent}99`; x.lineWidth = 1;
    x.strokeRect(34, 34, W - 68, H - 68);
  } else if (f.style === 'chips') {
    x.strokeStyle = `${f.accent}99`; x.lineWidth = 1;
    x.strokeRect(34, 34, W - 68, H - 68);
    // 테두리를 따라 도는 칩 — 네 변에 같은 간격으로. 모서리에 겹치지 않게 여백을 둔다.
    const r = 6, gap = 46;
    const dot = (cx: number, cy: number) => {
      x.fillStyle = f.accent;
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      x.strokeStyle = PAPER_TOP; x.lineWidth = 2;
      x.beginPath(); x.arc(cx, cy, r - 2.5, 0, Math.PI * 2); x.stroke();
    };
    for (let px = 24 + gap; px < W - 24 - gap / 2; px += gap) { dot(px, 24); dot(px, H - 24); }
    for (let py = 24 + gap; py < H - 24 - gap / 2; py += gap) { dot(24, py); dot(W - 24, py); }
  } else {
    x.strokeStyle = `${f.accent}99`; x.lineWidth = 1;
    x.strokeRect(34, 34, W - 68, H - 68);
  }
  // 네 모서리 점 — 상장의 인쇄 표식
  x.fillStyle = f.accent;
  for (const [cx, cy] of [[24, 24], [W - 24, 24], [24, H - 24], [W - 24, H - 24]]) {
    x.beginPath(); x.arc(cx, cy, 5, 0, Math.PI * 2); x.fill();
  }
  x.restore();

  const center = (txt: string, y: number, font: string, color: string, spacing = 0) => {
    x.font = font; x.fillStyle = color; x.textAlign = 'center';
    if (spacing > 0) {
      const total = [...txt].reduce((a, ch) => a + x.measureText(ch).width + spacing, -spacing);
      let cx = W / 2 - total / 2;
      for (const ch of txt) { x.fillText(ch, cx + x.measureText(ch).width / 2, y); cx += x.measureText(ch).width + spacing; }
    } else x.fillText(txt, W / 2, y);
  };

  // ── 머리: 워드마크 → 제목 → 증명 문장
  center('NURI HOLDEM', 92, '800 22px Arial', f.accent, 7);
  center('활 동 인 증 서', 148, '900 40px Arial', INK, 4);
  x.strokeStyle = `${f.accent}66`; x.lineWidth = 1;
  x.beginPath(); x.moveTo(150, 172); x.lineTo(W - 150, 172); x.stroke();
  center('아래 회원의 활동을 증명합니다', 206, '600 20px Arial', INK_SUB);

  // ── 이름 — 인증서의 주인공. 괘선 위에 올려 '기입란'으로 읽히게 한다.
  const nickSize = fitNickSize((size) => { x.font = `900 ${size}px Arial`; return x.measureText(input.nickname).width; });
  center(input.nickname, CARD_NICK_BASE, `900 ${nickSize}px Arial`, INK);
  x.strokeStyle = `${f.accent}99`; x.lineWidth = 2;
  x.beginPath(); x.moveTo(110, 322); x.lineTo(W - 110, 322); x.stroke();
  center('회원 닉네임', 348, '600 17px Arial', INK_SUB);

  // ── 인증 항목표 — 등급·활동점수·머니인. 라벨 왼쪽 / 값 오른쪽 + 아래 얇은 괘선.
  //   등급색은 등급의 것이라 프레임을 따라가지 않는다. 다만 등급색은 **다크 기준 토큰**이라
  //   크림 위에서 AA 를 보장할 수 없다 → 값 글자는 잉크로 쓰고, 등급색은 **왼쪽 표식 막대**로만 쓴다.
  const rows: [string, string][] = [['등 급', `${input.tierLabel} 등급`], ['활동 점수', `${input.points.toLocaleString()} 점`]];
  if (input.moneyinCount !== undefined) rows.push(['머니인(입상)', `${input.moneyinCount} 회`]);
  let ry = 418;
  for (const [k, v] of rows) {
    if (k === '등 급' && input.tierColor) {
      x.fillStyle = input.tierColor;
      x.beginPath(); x.roundRect(88, ry - 16, 4, 20, 2); x.fill();
    }
    x.textAlign = 'left'; x.font = '600 21px Arial'; x.fillStyle = INK_SUB; x.fillText(k, 100, ry);
    x.textAlign = 'right'; x.font = '800 24px Arial'; x.fillStyle = INK; x.fillText(v, W - 96, ry);
    x.strokeStyle = `${f.accent}33`; x.lineWidth = 1;
    x.beginPath(); x.moveTo(96, ry + 16); x.lineTo(W - 96, ry + 16); x.stroke();
    ry += 62;
  }

  // ── 인장 — 스페이드를 원형 인장 안에. 이름과 **가로로도 세로로도** 떨어져 있다.
  const ox = W - 158, oy = CARD_SPADE_TOP + CARD_SEAL_R, r = CARD_SEAL_R;
  x.strokeStyle = SEAL; x.lineWidth = 3;
  x.beginPath(); x.arc(ox, oy, r, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 1;
  x.beginPath(); x.arc(ox, oy, r - 8, 0, Math.PI * 2); x.stroke();
  x.fillStyle = SEAL;
  const s = 0.62, sy = oy - 6;
  x.beginPath();
  x.moveTo(ox, sy - 60 * s);
  x.bezierCurveTo(ox - 42 * s, sy + 8 * s, ox - 78 * s, sy + 28 * s, ox - 60 * s, sy + 58 * s);
  x.bezierCurveTo(ox - 44 * s, sy + 80 * s, ox - 16 * s, sy + 72 * s, ox - 8 * s, sy + 56 * s);
  x.bezierCurveTo(ox - 12 * s, sy + 78 * s, ox - 22 * s, sy + 90 * s, ox - 34 * s, sy + 100 * s);
  x.lineTo(ox + 34 * s, sy + 100 * s);
  x.bezierCurveTo(ox + 22 * s, sy + 90 * s, ox + 12 * s, sy + 78 * s, ox + 8 * s, sy + 56 * s);
  x.bezierCurveTo(ox + 16 * s, sy + 72 * s, ox + 44 * s, sy + 80 * s, ox + 60 * s, sy + 58 * s);
  x.bezierCurveTo(ox + 78 * s, sy + 28 * s, ox + 42 * s, sy + 8 * s, ox, sy - 60 * s);
  x.closePath(); x.fill();

  // ── 발급 정보 — 일련번호는 없다(근거가 될 값이 서버에 없다. ProfileCardInput 주석 참조).
  x.textAlign = 'left'; x.fillStyle = INK_FAINT;
  x.font = '600 18px Arial';
  x.fillText(`발급일  ${issuedLabel(input.issuedAt ?? new Date())}`, 96, 686);
  x.fillText('발급  누리홀덤', 96, 716);

  center('nuriholdem.com', H - 58, '700 19px Arial', INK_FAINT, 2);
}

/** 카드 이미지를 만들어 파일로 저장한다(종전 동작 그대로 — 그림만 인증서로 바뀌었다). */
export function downloadProfileCard(input: ProfileCardInput): void {
  const c = document.createElement('canvas');
  drawProfileCard(c, input);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `NURI_${input.nickname}_활동인증서.png`;
  document.body.appendChild(a); a.click(); a.remove();
}
