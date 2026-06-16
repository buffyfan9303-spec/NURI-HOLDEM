// src/lib/recordCard.ts
// 내 토너먼트 전적 공유 카드 — 캔버스로 1080x1080 PNG 를 그려 Blob 으로 반환(의존성 없음).
// SNS 공유(navigator.share)/이미지 저장에 사용. 한글은 브라우저 sans-serif 폴백으로 렌더.
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
  prizeMan: number;     // 누적 상금(만원)
  points: number;       // 누적 포인트
  percentile: number | null; // 전국 상위 N%
}

const N = (v: number) => v.toLocaleString('ko-KR');

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

  // 전국 상위 N% 배지
  if (d.percentile != null) {
    const bw = 520, bh = 120, bx = 72, by = 312;
    x.fillStyle = 'rgba(252,213,53,0.10)';
    roundRect(x, bx, by, bw, bh, 24); x.fill();
    x.strokeStyle = 'rgba(252,213,53,0.45)'; x.lineWidth = 2;
    roundRect(x, bx, by, bw, bh, 24); x.stroke();
    x.fillStyle = MUTED; x.font = '600 30px sans-serif';
    x.fillText('전국 플레이어 중', bx + 36, by + 50);
    x.fillStyle = GOLD; x.font = '800 64px sans-serif';
    x.fillText(`상위 ${d.percentile}%`, bx + 36, by + 104);
  }

  // 스탯 그리드 2x3
  const cells: [string, string][] = [
    ['우승', `${N(d.wins)}회`],
    ['입상 TOP3', `${N(d.cashes)}회`],
    ['우승률', `${d.winRate}%`],
    ['최고 순위', d.bestPosition ? `${d.bestPosition}위` : '-'],
    ['누적 상금', d.prizeMan ? `${N(d.prizeMan)}만` : '-'],
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

  // 누적 포인트 라인
  x.fillStyle = MUTED; x.font = '500 30px sans-serif';
  x.fillText(`누적 포인트 ${N(d.points)}점`, gx, gy + 2 * ch + 64);

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
      await navigator.share({ files: [file], title: 'NURI HOLDEM 전적', text: `내 홀덤 토너먼트 전적 (전국 상위 ${d.percentile ?? '-'}%)` });
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
