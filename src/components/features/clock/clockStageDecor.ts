// 보드 장식 파생 — ClockStage.tsx 에서 분리(react-refresh: 컴포넌트 파일은 컴포넌트만 export).
/** 테마 변수 → 보드 장식(글자 판 유무 · 로고). 호출처(TV·운영자 스테이지)가 루트 변수에서 뽑아 넘긴다 — 보드는 데이터를 읽지 않는다. */
export interface ClockStageDecor {
  plated: boolean;
  logo: { src: string; head: string; tall: string; plate: string | null } | null;
}
export function clockStageDecor(vars: Record<string, string>): ClockStageDecor {
  const src = vars['--clk-logo'];
  return {
    plated: !!vars['--clk-plate'],
    logo: src ? { src, head: vars['--clk-logo-head'] ?? '6cqmin', tall: vars['--clk-logo-tall'] ?? '32cqmin', plate: vars['--clk-logo-plate'] ?? null } : null,
  };
}
