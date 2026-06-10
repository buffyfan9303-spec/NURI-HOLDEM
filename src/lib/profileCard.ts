// 프로필 공유 카드 — 닉네임·등급·활동점수·입상 횟수를 담은 이미지(인스타/카톡 프로필용) 생성·저장.
export function downloadProfileCard(input: {
  nickname: string;
  tierLabel: string;     // 예: 'QQ'
  tierColor?: string;    // 등급 색
  points: number;        // 활동 점수
  moneyinCount?: number; // 입상 횟수(선택)
}): void {
  const W = 640, H = 880;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;

  // 배경 — 딥 네이비 + 골드 비네트
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#11151C');
  bg.addColorStop(1, '#0A0C0F');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W / 2, H * 0.32, 40, W / 2, H * 0.32, 360);
  glow.addColorStop(0, 'rgba(255,209,0,0.18)');
  glow.addColorStop(1, 'rgba(255,209,0,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);

  // 테두리
  x.strokeStyle = 'rgba(255,209,0,0.55)'; x.lineWidth = 3;
  x.strokeRect(18, 18, W - 36, H - 36);

  // 스페이드
  x.fillStyle = '#FFD100';
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

  center('NURI HOLDEM', 92, '800 26px Arial', 'rgba(255,209,0,0.85)', 6);
  center(input.nickname, H * 0.56, '900 64px Arial', '#FFFFFF');
  // 등급 칩
  const tier = `${input.tierLabel} 등급`;
  x.font = '900 38px Arial';
  const tw = x.measureText(tier).width + 56;
  x.fillStyle = 'rgba(255,209,0,0.14)';
  x.strokeStyle = input.tierColor ?? '#FFD100'; x.lineWidth = 2.5;
  const ty = H * 0.62;
  x.beginPath(); x.roundRect(W / 2 - tw / 2, ty, tw, 64, 32); x.fill(); x.stroke();
  center(tier, ty + 45, '900 38px Arial', input.tierColor ?? '#FFD100');

  // 스탯 2단
  const statY = H * 0.78;
  const stat = (label: string, value: string, cx: number) => {
    x.font = '800 44px Arial'; x.fillStyle = '#FFD100'; x.textAlign = 'center'; x.fillText(value, cx, statY);
    x.font = '600 22px Arial'; x.fillStyle = '#8B93A3'; x.fillText(label, cx, statY + 34);
  };
  if (input.moneyinCount !== undefined) {
    stat('활동 점수', input.points.toLocaleString(), W * 0.32);
    stat('머니인(입상)', `${input.moneyinCount}회`, W * 0.68);
  } else {
    stat('활동 점수', input.points.toLocaleString(), W / 2);
  }

  center('nuriholdem.com', H - 56, '700 22px Arial', 'rgba(255,255,255,0.45)', 2);

  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `NURI_${input.nickname}_프로필카드.png`;
  document.body.appendChild(a); a.click(); a.remove();
}
