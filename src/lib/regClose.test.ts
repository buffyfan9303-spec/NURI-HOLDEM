// 포스터 등록 마감 레벨 — 파싱 단위 + **포스터→클락 다리**가 실제로 이어졌는지 (2026-09-13).
//
// 배경(읽기 전용 판정으로 먼저 확인한 것):
//   포스터는 등록 마감을 `regCloseTime='16LV 00:12'` 자유 텍스트로만 저장한다.
//   PosterFormModal.submit 도, App.handleSubmitPoster 도 `structure.lateRegLevels` 를 **쓰지 않는다**
//   (쓰는 곳은 src/mock/data.ts 뿐). 그래서 gameInherit 의 상속 줄
//   `if (sc.structure?.lateRegLevels) p.regCloseLevel = …` 이 실포스터에서 **한 번도 터지지 않았고**,
//   클락은 defaultClockConfig 의 regCloseLevel=12 로 돌았다.
//   결과: ScheduleDetailModal 한 화면에 '레지 마감 · LV12'(라이브 실측)와
//   '16LV 00:12'(포스터 계획값)가 동시에 떴다 — 같은 대회를 화면이 두 답으로 말했다.
//
// 음성 대조: gameInherit 의 `regCloseLevelFromText(sc.regCloseTime)` 폴백을 지우면
//   아래 '다리' 블록이 실패한다(상속 패치에 regCloseLevel 이 안 생긴다).
// 실행: npx vitest run src/lib/regClose.test.ts
import { describe, it, expect } from 'vitest';
import { regCloseLevelFromText, regCloseLevelOf } from './regClose';
import { clockPatchFromSchedule, presetFromSchedule } from './gameInherit';
import { msToRegClose } from './regStatus';
import { regCloseText } from '../components/features/ScheduleCard';
import { defaultClockConfig, emptyClockState } from '../api/clock';
import type { Schedule } from '../api/schedules';

describe('regCloseLevelFromText — NNLv 형태에서만 레벨을 뽑는다', () => {
  it('레벨+시각', () => { expect(regCloseLevelFromText('16LV 00:12')).toBe(16); });
  it('레벨만 · 소문자 · 공백', () => {
    expect(regCloseLevelFromText('16LV')).toBe(16);
    expect(regCloseLevelFromText('8lv')).toBe(8);
    expect(regCloseLevelFromText('12 LV 01:44')).toBe(12);
  });
  it('🔴 시각만 있으면 레벨이 아니다 — 22 로 읽으면 안 된다', () => {
    expect(regCloseLevelFromText('22:00')).toBeNull();
    expect(regCloseLevelFromText('00:12')).toBeNull();
  });
  it('빈 값·null·0레벨은 null', () => {
    expect(regCloseLevelFromText('')).toBeNull();
    expect(regCloseLevelFromText(null)).toBeNull();
    expect(regCloseLevelFromText(undefined)).toBeNull();
    expect(regCloseLevelFromText('0LV')).toBeNull();
  });
});

// PosterFormModal.submit → App.handleSubmitPoster 가 실제로 만드는 형태 그대로다
// (structure 는 `{ levels }` 뿐 — lateRegLevels 는 없다).
const poster = (o: Partial<Schedule> = {}) => ({
  id: 's1', venueId: 'v1', date: '2026-09-13', title: 'T',
  regCloseTime: '16LV 00:12',
  structure: { levels: [] },
  ...o,
} as unknown as Schedule);

describe('상속 패치 — lateRegLevels 우선, 없으면 NNLv 폴백, 둘 다 없으면 키 자체가 없다', () => {
  it('regCloseTime 의 16LV 를 클락 regCloseLevel 로 잇는다', () => {
    expect(clockPatchFromSchedule(poster()).regCloseLevel).toBe(16);
  });

  // 🔄 2026-09-13(2차) 뒤집음. 예전 단언은 'lateRegLevels 가 이긴다' 였다.
  //   뒤집은 이유: ① `regCloseTime` 이 앱이 실제로 쓰는 유일한 입력이고(PosterFormModal.submit 조립,
  //   유저에게 광고되는 값) `lateRegLevels` 를 쓰는 앱 코드는 src/mock/data.ts 뿐이다.
  //   ② 둘이 같이 있으면 소비처 넷의 답이 갈렸다 — 실측(수정 전):
  //      카드 16 · 블라인드 표 16 · 상세 InfoRow 20 · 상속 20. 상속만 혼자 달랐다.
  //   ③ 다수결이 아니라 '유저가 보는 쪽이 정본' 이라 `regCloseTime` 으로 통일했다.
  //   `lateRegLevels` 는 폴백으로 **살아 있다**(regCloseTime 에 레벨이 없을 때) — 아래 두 케이스가 잠근다.
  it('regCloseTime 의 레벨이 lateRegLevels 를 이긴다', () => {
    const p = clockPatchFromSchedule(poster({ structure: { levels: [], lateRegLevels: 20 } }));
    expect(p.regCloseLevel).toBe(16);
  });

  it('regCloseTime 에 레벨이 없으면 lateRegLevels 로 떨어진다(mock/레거시 포스터)', () => {
    expect(clockPatchFromSchedule(poster({ regCloseTime: undefined, structure: { levels: [], lateRegLevels: 9 } })).regCloseLevel).toBe(9);
    // 시각만 있는 형태도 '레벨 없음' 이라 폴백이 산다
    expect(clockPatchFromSchedule(poster({ regCloseTime: '22:00', structure: { levels: [], lateRegLevels: 9 } })).regCloseLevel).toBe(9);
  });

  it('🔴 소비처 넷이 같은 답을 낸다 — 갈린 것이 이 수정의 본체다', () => {
    const sc = poster({ structure: { levels: [], lateRegLevels: 20 } });
    expect({
      card: regCloseText(sc),                                                  // ScheduleCard.regCloseText
      detailInfoRow: regCloseLevelOf(sc),                                      // ScheduleDetailModal '레이트 레지'
      blindTable: Math.min(Math.max(regCloseLevelOf(sc) ?? 16, 1), 25),        // ScheduleDetailModal.BlindStructure
      inherit: clockPatchFromSchedule(sc).regCloseLevel,                       // gameInherit.clockPatchFromSchedule
      preset: presetFromSchedule(sc).clock?.regCloseLevel,                     // gameInherit.presetFromSchedule
    }).toEqual({ card: '등록 마감 16레벨', detailInfoRow: 16, blindTable: 16, inherit: 16, preset: 16 });
  });

  it('🔴 폴백이 없으면 키 자체를 만들지 않는다 — undefined 스프레드가 업주 수기값을 덮으면 안 된다', () => {
    const p = clockPatchFromSchedule(poster({ regCloseTime: '22:00' })); // 시각만 = 레벨 없음
    expect('regCloseLevel' in p).toBe(false);
    // NuriPosLedger 의 병합 문법 그대로 재현: { ...baseCfg, ...schedPatch }
    const merged = { ...defaultClockConfig(), regCloseLevel: 7, ...p };
    expect(merged.regCloseLevel).toBe(7); // 키가 있고 undefined 였다면 여기서 undefined 가 된다
  });

  it('regCloseTime 이 아예 없어도 키를 만들지 않는다', () => {
    const p = clockPatchFromSchedule(poster({ regCloseTime: undefined }));
    expect('regCloseLevel' in p).toBe(false);
  });

  it('프리셋 경유(presetFromSchedule)도 같은 다리를 쓴다', () => {
    expect(presetFromSchedule(poster()).clock?.regCloseLevel).toBe(16);
    expect(presetFromSchedule(poster({ regCloseTime: '22:00' })).clock).toBeUndefined();
  });
});

describe('다리가 이어졌다 — 포스터가 말하는 레벨과 라이브 클락이 판정하는 레벨이 같다', () => {
  // 수정 전 실측: regCloseText='등록 마감 16레벨' / clockPatchFromSchedule().regCloseLevel=undefined
  //   / defaultClockConfig().regCloseLevel=12 → 12레벨에서 msToRegClose=0('마감')인데 포스터는 16까지 열려 있다고 말했다.
  const sc = poster();
  const indexOfLevel = (levels: { kind: string }[], n: number) => {
    let seen = 0;
    for (let i = 0; i < levels.length; i++) { if (levels[i].kind === 'level') seen++; if (seen === n) return i; }
    return -1;
  };

  it('포스터 표시는 16레벨이다', () => {
    expect(regCloseText(sc)).toBe('등록 마감 16레벨');
  });

  it('🔴 상속된 클락은 12(기본값)가 아니라 16으로 판정한다', () => {
    const cfg = { ...defaultClockConfig(), ...clockPatchFromSchedule(sc) };
    expect(defaultClockConfig().regCloseLevel).toBe(12); // 아무도 입력한 적 없는 기본값
    expect(cfg.regCloseLevel).toBe(16);

    const st = { ...emptyClockState('v1', cfg), sessionDate: '2026-09-13', running: true };
    // 12레벨 = 포스터 기준 아직 등록 가능 → 마감이 아니어야 한다(수정 전에는 0='마감'이었다)
    expect(msToRegClose(st, indexOfLevel(cfg.levels, 12), 60_000)).not.toBe(0);
    // 16레벨 도달 = 마감
    expect(msToRegClose(st, indexOfLevel(cfg.levels, 16), 60_000)).toBe(0);
  });
});

// ⚠ 2026-09-13 nuri-lead 음성 대조에서 찾은 구멍 — `regCloseLevelOf` 의 `n > 0` 가드를 **빼도 35개가 전부 통과했다.**
//   즉 아무 테스트도 그 가드를 보고 있지 않았다. F2 와 **같은 부류**다: 마감 레벨 `0` 은 '미설정' 이지 '0레벨' 이 아니다.
//   가드가 사라지면 `ScheduleDetailModal` 의 게임정보 행이 `레이트 레지 0레벨` 을, 블라인드 표가 0 을 기준으로 그린다
//   (`clockPatchFromSchedule` 쪽은 `if (lateReg)` 가 falsy 로 걸러 무해하다 — 화면 두 곳만 샌다).
describe('0 은 레벨이 아니라 "미설정" 이다 (F2 와 같은 부류)', () => {
  it('🔴 structure.lateRegLevels 가 0 이면 null — 0레벨로 읽으면 안 된다', () => {
    expect(regCloseLevelOf({ structure: { lateRegLevels: 0 } })).toBeNull();
  });

  it('🔴 regCloseTime 의 "0LV" 도 null', () => {
    expect(regCloseLevelFromText('0LV')).toBeNull();
    expect(regCloseLevelFromText('0LV 00:12')).toBeNull();
  });

  it('음수·NaN 도 null (과잉 차단이 아니라 유효값은 그대로 통과한다)', () => {
    expect(regCloseLevelOf({ structure: { lateRegLevels: -3 } })).toBeNull();
    expect(regCloseLevelOf({ structure: { lateRegLevels: Number.NaN } })).toBeNull();
    expect(regCloseLevelOf({ structure: { lateRegLevels: 16 } })).toBe(16);
    expect(regCloseLevelFromText('16LV 00:12')).toBe(16);
  });
});
