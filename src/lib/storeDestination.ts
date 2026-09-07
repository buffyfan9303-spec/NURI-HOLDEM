// 매장 대시보드 → 게임 판 이동의 '목적지 계약'.
//
// 왜 필요한가 (2026-09-07 추적에서 확인):
//   StoreDashboard 의 prop 이 `onGoto: (section: string) => void` 하나뿐이라 **어느 날짜·어느 게임이냐가
//   통째로 버려졌다.** 대시보드는 그 문맥을 이미 들고 있는데(staleOpen 은 sessionDate·gameSeq·title 을,
//   pendingRanks 는 date·gameSeq 를 가진다) 전달할 통로가 없어서:
//     · '지난 장부 3건이 미마감이에요' → 눌러도 **오늘** 장부가 열린다(미마감 장부는 지난 날짜다)
//     · '순위 미입력 대회 4개' → 눌러도 **오늘 메인** 칩에 착지한다
//   화면은 바뀌는데 사용자가 고른 대상은 사라지는, 가장 나쁜 종류의 이동이었다.
//
// 무엇을 하지 않나: 앱 라우터·새 내비게이션 프레임워크를 만들지 않는다.
//   VenueManageTab 이 이미 가진 시드 상태(ledgerSeed · clockSeed · clockSeedGame · rankingDraft)가
//   정본이고, 이 파일은 "그 시드에 무엇을 넣을지"만 한 번 정해 준다. 순수 함수라 테스트가 여기만 보면 된다.
//
// 문자열도 계속 받는다 — 기존 호출 27곳을 전부 고치지 않아도 되고, 문맥이 없는 이동
// (통계·직원·포스터 목록)은 원래대로 '지금 화면'을 연다.

import { MAIN_GAME_SEQ } from '../api/ledger';
import { rankingEventOf } from './rankingGame';

export interface StoreDest {
  /** 섹션·게임스텝 id. 기존 문자열 그대로 — normalizeDeepSection 이 구 id 도 흡수한다. */
  section: string;
  /** 열 대상 날짜(YYYY-MM-DD). 없으면 기존 동작 유지 = '오늘 + 현재 칩 게임'. */
  date?: string;
  /** 열 대상 게임(1=메인, 2+=사이드). 없으면 메인. */
  gameSeq?: number;
  /** 그 게임의 장부 제목 — 순위 event 이름 산출에만 쓴다(rankingGame 계약, F02). */
  title?: string | null;
  /** 이미 확정된 순위 event 이름(PosterOpsSummary.rankingEvent 처럼 서버가 준 값). title 보다 우선. */
  event?: string;
  /** 포스터에서 온 경우의 일정 id. */
  scheduleId?: string;
  /** 장부의 정산/마감으로 데려간다(스크롤이 아니라 포커스 — 정산바는 fixed 라 이미 화면에 있다). */
  settle?: boolean;
}

/** 대시보드가 부르는 이동 함수. 문자열 = 문맥 없는 기존 이동. */
export type StoreGoto = (dest: string | StoreDest) => void;

export function toDest(d: string | StoreDest): StoreDest {
  return typeof d === 'string' ? { section: d } : d;
}

/** 목적지가 시드 상태에 남길 값. 키가 없으면 **그 시드는 건드리지 않는다**(기존 동작 보존). */
export interface DestSeeds {
  ledgerSeed?: { date: string; gameSeq: number; scheduleId: string; isNew: boolean };
  clockSeed?: string;
  clockSeedGame?: number;
  rankingDraft?: { date: string; names: string[]; event: string };
  settle?: boolean;
}

/**
 * 목적지 → (섹션, 시드 패치). 순수 함수.
 *
 * 날짜가 없으면 어떤 시드도 만들지 않는다 — 문맥 없는 이동은 예전과 똑같이 '오늘 + 현재 게임'이다.
 * 게임만 주어진 클락 이동은 날짜 없이 게임만 바꾼다(칩 바 픽과 같은 의미).
 */
export function resolveDest(d: string | StoreDest): { section: string; seeds: DestSeeds } {
  const dest = toDest(d);
  const seeds: DestSeeds = {};
  const seq = dest.gameSeq ?? MAIN_GAME_SEQ;

  if (dest.settle) seeds.settle = true;

  if (dest.date) {
    if (dest.section === 'ledger') {
      // isNew=false — 이미 있는 장부를 여는 이동이다. 새 장부 프리필(포스터→장부)은
      // 기존 onOpenLedgerFromPosters 경로가 그대로 담당한다.
      seeds.ledgerSeed = { date: dest.date, gameSeq: seq, scheduleId: dest.scheduleId ?? '', isNew: false };
    } else if (dest.section === 'clock') {
      seeds.clockSeed = dest.date;
      seeds.clockSeedGame = seq;
    } else if (dest.section === 'ranking') {
      // 날짜만 넘기면 사이드 장부의 순위도 메인 칩에 착지한다(F02) — event 이름까지 계산해서 넘긴다.
      // 서버가 이미 확정한 이름(rankingEvent)이 있으면 그걸 쓴다 — 같은 규칙을 두 번 유도하지 않는다.
      const event = dest.event ?? rankingEventOf({ gameSeq: seq, title: dest.title });
      seeds.rankingDraft = { date: dest.date, names: [], event };
    }
  } else if (dest.section === 'clock' && dest.gameSeq != null) {
    seeds.clockSeedGame = seq;
  }

  return { section: dest.section, seeds };
}
