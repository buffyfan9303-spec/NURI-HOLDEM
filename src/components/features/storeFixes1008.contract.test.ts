// 내 매장 늦은 응답·범위 묶음(2026-10-08 audit12 triage-store-gto) — 소스 계약.
//
// 렌더 트리 테스트로 잡기 어렵다(auth·supabase 를 다 채워야 한다) — 저장소가 쓰는 소스 계약 방식으로 잠근다.
// 음성 대조: 각 수정 줄을 origin/main 판으로 되돌리면 해당 it 가 빨개진다(보고서 fix-store-batch.md).
// 실행: npx vitest run src/components/features/storeFixes1008.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (f: string) => strip(readFileSync(join(__dirname, f), 'utf-8'));

describe('H03-09 · 순위 저장 뒤 저장본(allEntries)을 서버 정본으로 다시 받는다', () => {
  const c = read('VenueManageTab.tsx');
  it('저장 성공 경로가 조용히 재조회하고, 그새 매장·날짜를 옮겼으면 버린다', () => {
    const save = c.slice(c.indexOf('const save = async () => {'), c.indexOf("toast.show('순위 저장 완료"));
    expect(save).toMatch(/await saveVenueRankings\(/);
    expect(save).toMatch(/getVenueRankings\(venueId, date\)\.then\(\(\{ entries \}\) => \{ if \(rankKeyRef\.current === savedKey\) setAllEntries\(entries\); \}\)/);
  });
});

describe('클라우드 리뷰 · 라이브 바 바인요청 구독은 자기 요청 DELETE 만 받는다', () => {
  it('subscribeBuyinRequests 호출부 전부가 ownsId 를 넘긴다(전 매장 DELETE 폭주 방지)', () => {
    for (const f of ['VenueManageTab.tsx', 'StoreDashboard.tsx', 'NuriPosLedger.tsx']) {
      const calls = read(f).match(/subscribeBuyinRequests\(venueId, [^)]*\)/g) ?? [];
      expect(calls.length, `${f} 호출부를 찾지 못했다`).toBeGreaterThan(0);
      for (const k of calls) expect(k, `${f}: ${k}`).toContain('ownsId');
    }
  });
});

describe('SP12 · 회원 검색 늦은 응답이 다른 검색어 아래 후보로 붙지 않는다', () => {
  const c = read('CustomerAnalytics.tsx');
  it('응답은 alive 일 때만 반영되고 cleanup 이 alive 를 끈다', () => {
    expect(c).toMatch(/findUserForTransfer\(q\)\.then\(\(r\) => \{ if \(alive\) setMcands\(r\); \}\)/);
    expect(c).toMatch(/return \(\) => \{ alive = false; clearTimeout\(t\); \};/);
  });
});

describe('SP10 · 근무 일정 조회 실패를 빈 달력으로 위장하지 않는다', () => {
  const c = read('StaffSchedule.tsx');
  it('빈 catch 가 없고 실패는 LoadErrorCard 로 보인다', () => {
    expect(c).not.toMatch(/getStaffSchedule\(venueId, from, to\)[\s\S]{0,120}\.catch\(\(\) => \{\}\)/);
    expect(c).toMatch(/\.catch\(\(e\) => \{ if \(keyRef\.current === k\) setLoadErr\(e\); \}\)/);
    expect(c).toMatch(/<LoadErrorCard error=\{loadErr\}/);
  });
});

describe('SP11 · 지난 시즌 기록의 늦은 응답·실패', () => {
  const c = read('SeasonPanel.tsx');
  it('지금 연 시즌의 응답만 반영하고 실패는 기록 없음과 구분한다', () => {
    expect(c).not.toMatch(/getSeasonResults\(id\)\.catch\(\(\) => \[\]\)/);
    expect(c).toMatch(/if \(archiveReqRef\.current === id\) setArchiveRows\(rows\)/);
    expect(c).toMatch(/archiveErr \? <li role="alert"/);
  });
});

describe('SP15 · 이용권 개수 스테퍼', () => {
  const c = read('VoucherManageModal.tsx');
  const step = c.slice(c.indexOf('function StepBtn('));
  it('키보드 클릭(detail 0)도 한 칸, pointercancel·언마운트에서 타이머를 멈춘다', () => {
    expect(step).toMatch(/onClick=\{\(e\) => \{ if \(e\.detail === 0\) onStep\(\); \}\}/);
    expect(step).toMatch(/onPointerCancel=\{stop\}/);
    expect(step).toMatch(/useEffect\(\(\) => stop, \[\]\);/);
  });
});

describe('SP16 · 대시보드 클락 바로가기는 보고 있는 게임으로 간다', () => {
  const c = read('StoreDashboard.tsx');
  it('문자열 onGoto(\'clock\') 대신 gameSeq 를 싣는다', () => {
    expect(c).toMatch(/onGoto\(\{ section: 'clock', gameSeq: widgetGame \}\)/);
    expect(c).toMatch(/title="대회 클락" onClick=\{\(\) => onGoto\(\{ section: 'clock', gameSeq: clock\?\.gameSeq \?\? MAIN_GAME_SEQ \}\)\}/);
  });
});

describe('SP13 · 통계 유형 필터는 그날 모든 게임 명단을 (게임#이름) 으로 본다', () => {
  const c = read('LedgerStatsPanel.tsx');
  it("getLedgerPlayers(…, 'all') + playerTypeKey(b.gameSeq, b.playerName)", () => {
    expect(c).toMatch(/getLedgerPlayers\(venueId, date, 'all'\)/);
    expect(c).toMatch(/playerType\.get\(playerTypeKey\(b\.gameSeq, b\.playerName\)\)/);
  });
});
