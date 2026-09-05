// src/lib/recordCard.ts (카카오 공유 변형 포함 — kakaoShareImage 사용)
// 내 토너먼트 전적 공유 카드 — 캔버스로 1080x1080 PNG 를 그려 Blob 으로 반환(의존성 없음).
// SNS 공유(navigator.share)/이미지 저장에 사용. 한글은 브라우저 sans-serif 폴백으로 렌더.
import { kakaoShareImage } from './kakao';
import { inviteUrl } from '../api/referrals';

const BG0 = '#0E1116';
const BG1 = '#06080B';
const GOLD = '#FCD535';
const INK = '#EAECEF';
const MUTED = '#848E9C';
const LINE = '#2B3139';

export interface RecordCardData {
  nickname: string;
  wins: number;
  cashes: number;       // 입상(TOP3)
  records: number;      // 기록(대회 수)
  winRate: number;      // 우승률 %
  bestPosition: number;
  points: number;       // 누적 포인트
  percentile?: number | null; // 전국 상위 N% — 대회 입상 횟수 기준(상금 무관)
}

const N = (v: number) => v.toLocaleString('ko-KR');
const clip = (s: string, n: number) => (s && s.length > n ? s.slice(0, n - 1) + '…' : (s || ''));

export async function buildRecordCardBlob(d: RecordCardData): Promise<Blob> {
  const S = 1080;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d')!;

  // 배경 그라데이션
  const grad = x.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, BG0); grad.addColorStop(1, BG1);
  x.fillStyle = grad; x.fillRect(0, 0, S, S);

  // 골드 상단 라인
  x.fillStyle = GOLD; x.fillRect(0, 0, S, 10);

  // 워드마크
  x.textBaseline = 'alphabetic';
  x.fillStyle = GOLD; x.font = '800 40px sans-serif';
  x.fillText('♠ NURI HOLDEM', 72, 116);
  x.fillStyle = MUTED; x.font = '500 30px sans-serif';
  x.fillText('나의 홀덤 토너먼트 전적', 72, 160);

  // 닉네임
  x.fillStyle = INK; x.font = '800 76px sans-serif';
  const nick = '@' + d.nickname;
  x.fillText(nick.length > 16 ? nick.slice(0, 15) + '…' : nick, 72, 268);

  // 전국 상위 N% 배지 — 대회 입상 횟수 기준(2026-09-05, 상금 기준 아님)
  if (d.percentile != null) {
    const bw = 520, bh = 120, bx = 72, by = 312;
    x.fillStyle = 'rgba(252,213,53,0.10)';
    roundRect(x, bx, by, bw, bh, 24); x.fill();
    x.strokeStyle = 'rgba(252,213,53,0.45)'; x.lineWidth = 2;
    roundRect(x, bx, by, bw, bh, 24); x.stroke();
    x.fillStyle = MUTED; x.font = '600 30px sans-serif';
    x.fillText('전국 대회 입상 경력 중', bx + 36, by + 50);
    x.fillStyle = GOLD; x.font = '800 64px sans-serif';
    x.fillText(`상위 ${d.percentile}%`, bx + 36, by + 104);
  }

  // 스탯 그리드 2x3
  const cells: [string, string][] = [
    ['우승', `${N(d.wins)}회`],
    ['입상 TOP3', `${N(d.cashes)}회`],
    ['우승률', `${d.winRate}%`],
    ['최고 순위', d.bestPosition ? `${d.bestPosition}위` : '-'],
    ['누적 포인트', `${N(d.points)}점`],
    ['기록', `${N(d.records)}회`],
  ];
  const gx = 72, gy = 500, gw = (S - 144), cw = gw / 3, ch = 200;
  for (let i = 0; i < cells.length; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const cx = gx + col * cw, cy = gy + row * ch;
    // 구분선
    x.strokeStyle = LINE; x.lineWidth = 1;
    x.beginPath(); x.moveTo(cx, cy + ch - 1); x.lineTo(cx + cw - 20, cy + ch - 1); x.stroke();
    const accent = i === 0 || i === 2 || i === 4;
    x.fillStyle = accent ? GOLD : INK; x.font = '800 72px sans-serif';
    x.fillText(cells[i][1], cx, cy + 88);
    x.fillStyle = MUTED; x.font = '500 30px sans-serif';
    x.fillText(cells[i][0], cx, cy + 132);
  }

  // 전국 백분위·누적 상금은 2026-09-05 카드에서 뺐다(법적위험완화 v3 — 금액 파생 표시 금지).

  // 푸터
  x.fillStyle = LINE; x.fillRect(72, S - 96, S - 144, 1);
  x.fillStyle = MUTED; x.font = '600 30px sans-serif';
  x.fillText('nuriholdem.com', 72, S - 48);
  x.textAlign = 'right';
  x.fillStyle = GOLD; x.font = '700 30px sans-serif';
  x.fillText('토너먼트 전적은 NURI HOLDEM', S - 72, S - 48);
  x.textAlign = 'left';

  return await new Promise<Blob>((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('카드 생성 실패'))), 'image/png');
  });
}

// ── 시즌 챔피언(명예의 전당) 공유 카드 ───────────────────────────────────────
export interface ChampionCardData {
  nickname: string;
  seasonName: string;
  venueName?: string;
  points: number;
}

export async function buildChampionCardBlob(d: ChampionCardData): Promise<Blob> {
  const S = 1080;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d')!;

  const grad = x.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, BG0); grad.addColorStop(1, BG1);
  x.fillStyle = grad; x.fillRect(0, 0, S, S);
  x.fillStyle = GOLD; x.fillRect(0, 0, S, 10);

  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillStyle = GOLD; x.font = '800 38px sans-serif';
  x.fillText('♠ NURI HOLDEM', S / 2, 110);

  // 왕관 + 시즌 챔피언
  drawCrown(x, S / 2, 185, 150); // 종전 fillText('👑', S/2, 320) 의 글리프 상자와 같은 자리(185~335)
  x.fillStyle = GOLD; x.font = '800 64px sans-serif';
  x.fillText('시즌 챔피언', S / 2, 420);

  // 닉네임
  x.fillStyle = INK; x.font = '800 84px sans-serif';
  const nick = '@' + d.nickname;
  x.fillText(nick.length > 16 ? nick.slice(0, 15) + '…' : nick, S / 2, 560);

  // 시즌 / 매장
  x.fillStyle = MUTED; x.font = '600 36px sans-serif';
  x.fillText(clip(d.seasonName, 28), S / 2, 630);
  if (d.venueName) { x.fillStyle = '#B0B6C0'; x.font = '500 34px sans-serif'; x.fillText(clip(d.venueName, 28), S / 2, 685); }

  // 포인트 배지
  const bw = 460, bh = 120, bx = (S - bw) / 2, by = 740;
  x.fillStyle = 'rgba(252,213,53,0.10)'; roundRect(x, bx, by, bw, bh, 24); x.fill();
  x.strokeStyle = 'rgba(252,213,53,0.45)'; x.lineWidth = 2; roundRect(x, bx, by, bw, bh, 24); x.stroke();
  x.fillStyle = GOLD; x.font = '800 60px sans-serif';
  x.fillText(`${N(d.points)} 점`, S / 2, by + 78);

  // 푸터
  x.fillStyle = LINE; x.fillRect(72, S - 96, S - 144, 1);
  x.fillStyle = MUTED; x.font = '600 30px sans-serif';
  x.fillText('nuriholdem.com · 시즌 리그', S / 2, S - 48);
  x.textAlign = 'left';

  return await new Promise<Blob>((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('카드 생성 실패'))), 'image/png');
  });
}

export async function shareChampionCard(d: ChampionCardData): Promise<'shared' | 'downloaded'> {
  const blob = await buildChampionCardBlob(d);
  const file = new File([blob], `nuriholdem-챔피언-${d.nickname}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: 'NURI HOLDEM 시즌 챔피언', text: `${d.seasonName} 시즌 챔피언 🏆\n나도 도전하기 👉 ${inviteUrl(d.nickname)}`, url: inviteUrl(d.nickname) });
      return 'shared';
    } catch (e) { if ((e as Error).name === 'AbortError') return 'shared'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

// ICON-3(2026-08-30): 종전엔 챔피언 카드의 왕관을 `fillText('👑')` 로 찍었다.
// 캔버스에 찍는 이모지는 **기기에 깔린 이모지 폰트 그대로** 구워진다 — 같은 공유 카드가
// iOS·안드로이드·삼성에서 서로 다른 왕관으로 나가고, 폰트가 없으면 두부(□)가 PNG 에 박힌다.
// 되돌릴 수 없는 산출물(이미지)이라 UI 이모지보다 더 나쁘다. 앱 아이콘(lucide `crown`,
// ISC — Icon.tsx 고지 참조)과 같은 패스를 그려 기기와 무관하게 한 그림으로 고정한다.
const CROWN_D =
  'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519'
  + 'l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519'
  + 'l4.276 3.664a1 1 0 0 0 1.516-.294z M5 21h14';
// Path2D 는 모듈 평가 시점이 아니라 그릴 때 만든다 — 이 파일이 캔버스 없는 환경에서
// 임포트되기만 해도 터지는 일을 막는다(테스트·툴체인).
let crownPath: Path2D | null = null;
/** 왕관을 (cx, cy) 를 좌우 중앙·상단 기준으로 size px 크기로 그린다(원본 viewBox 24). */
function drawCrown(x: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  crownPath ??= new Path2D(CROWN_D);
  const k = size / 24;
  x.save();
  x.translate(cx - size / 2, cy);
  x.scale(k, k);
  x.strokeStyle = GOLD;
  x.lineWidth = 2;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.stroke(crownPath);
  x.restore();
}

function roundRect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

// 카드를 공유(가능 시) 또는 저장. 반환: 'shared' | 'downloaded'
export async function shareRecordCard(d: RecordCardData): Promise<'shared' | 'downloaded'> {
  const blob = await buildRecordCardBlob(d);
  const file = new File([blob], `nuriholdem-전적-${d.nickname}.png`, { type: 'image/png' });
  // 모바일 등 파일 공유 지원 시 네이티브 공유 시트
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: 'NURI HOLDEM 전적', text: `내 홀덤 토너먼트 전적 · 우승 ${d.wins}회\n나도 기록 남기기 👉 ${inviteUrl(d.nickname)}`, url: inviteUrl(d.nickname) });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared'; // 사용자가 취소 — 에러 아님
      // 공유 실패 → 저장으로 폴백
    }
  }
  // 폴백: 이미지 다운로드
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

// ── 카카오톡 공유(리치 카드) — 미설정/실패 시 false(호출부가 일반 공유로 폴백) ──────
export async function shareRecordCardKakao(d: RecordCardData): Promise<boolean> {
  const blob = await buildRecordCardBlob(d);
  return kakaoShareImage(blob, {
    title: 'NURI HOLDEM 내 전적',
    description: `우승 ${d.wins}회 · 우승률 ${d.winRate}% · 기록 ${d.records}회`,
    link: inviteUrl(d.nickname),
  });
}

export async function shareChampionCardKakao(d: ChampionCardData): Promise<boolean> {
  const blob = await buildChampionCardBlob(d);
  return kakaoShareImage(blob, {
    title: 'NURI HOLDEM 시즌 챔피언',
    description: `${d.seasonName} 시즌 챔피언 🏆 ${d.points}점`,
    link: inviteUrl(d.nickname),
  });
}
