// B3(2026-09-28) — 장부 판의 매장·날짜·게임 전환 가드 계약.
//
// 결함: 첫 로드 effect 가 세션 순번(bumpSessionReq)만 올리고 바인·명단 재조회 순번(reloadSeq)은 안 올렸다.
//   전환 직전 realtime·online 으로 나간 앞 매장 reload() 응답이 전환 뒤 도착해 buyins/players 를 덮었고,
//   그 칸을 누르면 남의 장부 행을 id 로 고치거나 취소했다(서버는 행의 매장으로 권한을 본다 — 두 매장 권한자면 통과).
// 음성 대조: 첫 로드 effect 에서 `++reloadSeq.current;` 줄을 지우면 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'NuriPosLedger.tsx'), 'utf-8').replace(/\r\n/g, '\n');

describe('NuriPosLedger 전환 가드', () => {
  it('reload() 는 순번이 지금 것일 때만 buyins/players 를 싣는다', () => {
    expect(src).toMatch(/const my = \+\+reloadSeq\.current;[\s\S]{0,200}if \(my === reloadSeq\.current\) \{ setBuyins\(b\); setPlayers\(p\);[^}]*\}/);
  });

  it('첫 로드 effect([venueId, date, gameSeq])가 날아가던 reload() 를 무효로 만든다(reloadSeq 증가)', () => {
    const eff = /bumpSessionReq\(\);[^\n]*\n([\s\S]*?)Promise\.all\(\[getLedgerSession\(venueId, date, gameSeq\), getLedgerBuyins/.exec(src);
    expect(eff, '첫 로드 effect 를 찾지 못했다').not.toBeNull();
    expect(eff![1]).toMatch(/\+\+reloadSeq\.current;/);
  });
});
