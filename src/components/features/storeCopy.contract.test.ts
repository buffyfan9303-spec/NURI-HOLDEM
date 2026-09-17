// 내 매장 화면 문구 계약 — 2026-09-17 오너 지시("두 줄·고아 박스·쓸데없는 부연설명 전부 제거").
// 실측(Playwright 375px)으로 두 줄로 깨졌던 조작 요소 3곳을 라벨 길이 상한 + nowrap 으로 잠그고,
// 지운 잔소리 문단이 되살아나지 않게 소스에서 부재를 단언한다(src/lib/nash.data.test.ts 와 같은 방식).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('두 줄로 깨지던 조작 요소 — 375px 실측 기준', () => {
  it('클락 「블라인드 자동 생성」 버튼은 nowrap + 짧은 라벨(실측 h53→17, 2줄→1줄)', () => {
    const src = read('clock/TournamentClock.tsx');
    expect(src).toMatch(/onClick=\{autoGenerate\} className="[^"]*whitespace-nowrap[^"]*"/);
    const m = src.match(/블라인드 자동 생성[^\n<]*/);
    expect(m).not.toBeNull();
    // 플레이스홀더 값을 뺀 정적 글자 수 — 313px(375−패딩)에 icon 14px 포함 한 줄
    expect(m![0].replace(/\{[^}]*\}/g, '00').length).toBeLessThanOrEqual(30);
    expect(src).not.toContain('마감 후 가파르게');
  });

  it('클락 「애드온 게임」 체크박스 라벨은 괄호 설명 없이 6글자 이내', () => {
    const src = read('clock/TournamentClock.tsx');
    const m = src.match(/onChange=\{\(e\) => set\(\{ isAddon: e\.target\.checked \}\)\}[^\n]*\n\s*([^\n<]+)\n/);
    expect(m, '애드온 체크박스 라벨 형태가 바뀌었다').not.toBeNull();
    expect(m![1].trim().length).toBeLessThanOrEqual(6);
  });

  it('포스터 폼 「게임 프리셋으로도 저장」 체크박스 라벨에 부연(— …) 꼬리가 없다(실측 5줄→1줄)', () => {
    const src = read('PosterFormModal.tsx');
    expect(src).toMatch(/게임 프리셋으로도 저장<\/b>\s*<\/label>/);
    expect(src).not.toContain('한 번에 불러와요');
  });
});

describe('지운 부연설명이 되살아나지 않는다', () => {
  const gone: [string, string[]][] = [
    ['clock/TournamentClock.tsx', ['프리셋 저장·관리는 [내 매장 → 프리셋]에서.', '구형은 ✕로 정리', '마감 레벨부터 다른 듀레이션을 일괄 적용하세요']],
    ['clock/ClockThemePanel.tsx', ['타이머는 흰색, 긴급은 빨강']],
    ['clock/BlindLevelsEditor.tsx', ['예: 전체 25분 후']],
    ['NuriPosLedger.tsx', ['자동으로 불러옵니다(수정 가능)', '첫 바인은 스타팅 스택', '애드온 스택은 클락에 표시됩니다', "대시보드 '매장이용권' 카드에 합산"]],
    ['StoreDashboard.tsx', ['이번 주부터 집계를 시작했어요', '오늘 장부가 아직 시작되지 않았습니다', '장부 정산 대차표에서 T 로']],
    ['VenueManageTab.tsx', ['그 게임 순위만 따로 저장·표시됩니다', '커뮤니티에 매장이 등록됩니다', '갤러리·테마·블라인드 등']],
    ['VenueCustomizePanel.tsx', ['탭 순서를 정하세요', '번호마다 따로 전화가 걸립니다', '월요 토너 킹, 6월 이벤트 랭킹', '유일한 단서예요', '날짜를 누르면 그날 누가']],
    ['LedgerStatsPanel.tsx', ['집객 이벤트(얼리버드', '약한 요일 진단을 표시합니다', '통계는 업주 전용 · 직원']],
    ['PresetManager.tsx', ['저장해 두고 재사용하세요', '담긴 완성본입니다', '가장 빠릅니다', '내용이 채워진 채 열려요']],
    ['StaffPayroll.tsx', ['휴무 요일을 설정하세요']],
    ['AdminTab.tsx', ['claim_mission RPC']],
  ];
  for (const [file, phrases] of gone) {
    it(file, () => {
      const src = read(file);
      for (const ph of phrases) expect(src, `${file} 에 "${ph}" 가 되살아났다`).not.toContain(ph);
    });
  }

  it('통계 인사이트 문단에 전구 아이콘이 없다(잔소리 표식) — 제안 카드(tone mark)는 유지', () => {
    const src = read('LedgerStatsPanel.tsx');
    expect(src.match(/name="lightbulb"/g) ?? []).toHaveLength(0);
    expect(src).toContain("'lightbulb'"); // 제안 카드의 tone→mark 매핑(기능)은 남는다
  });
});
