// src/api/rankingDisplay.ts — 순위표에 내 이름을 어떻게 띄울지(오너 #14).
//
// 오너 지시: "머니인킹 이런 곳에는 본명이 아닌 설정한 닉네임으로 보이게. 실명을 원할 경우
//   본인이 선택할 수 있게 하고, 선택하지 않을 경우 디폴트값은 닉네임."
// 그래서 기본값은 **닉네임**이고, 실명은 본인이 명시적으로 고른 경우에만 쓴다.
//   개인정보보호법 §15·§17 상 실명 공개는 사전·명시적 선택이어야 하므로 기본이 실명일 수 없고,
//   기존 회원을 '실명 동의'로 소급 간주(backfill)하지도 않는다(그들은 이 항목을 본 적이 없다).
//
// public_ranking_consent 와의 관계 — 중복이 아니라 **가리는 대상이 다르다**:
//   · public_ranking_consent (2026-08-29, 오너 #12)
//       순위 옆에 '자주 가는 매장' 같은 **부가 프로필**을 붙여도 되는가.
//       체크인 이동 패턴은 순위표에 원래 없던 새 정보라 별도 동의가 필요했다.
//   · ranking_name_pref (여기, 오너 #14)
//       순위표에 **이미 실려 있는 이름**을 닉네임으로 쓸지 실명으로 쓸지.
//   하나로 합치면 "매장 표기는 싫지만 실명은 괜찮다"(또는 그 반대)를 표현할 수 없어 동의가
//   뭉뚱그려진다. 항목은 둘로 두고, 설정 화면에서만 한 블록으로 나란히 보여 준다.
//
// 왜 새 파일인가: 프로필 조회/갱신의 본체(src/api/auth.ts)는 다른 웨이브가 잡고 있다.
//   rankingConsent.ts 가 같은 이유로 분리됐던 선례를 그대로 따른다. 안정되면 합쳐도 된다.
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';

/** 순위표 표시 이름 — 서버 profiles.ranking_name_pref 와 같은 값(NULL 은 'nickname' 으로 읽는다). */
export type RankingNamePref = 'nickname' | 'real_name';

/** 미선택(NULL)의 해석. 이 한 줄이 '기본은 닉네임'의 단일 정의다. */
export const DEFAULT_RANKING_NAME_PREF: RankingNamePref = 'nickname';

export interface RankingDisplaySettings {
  /** 순위표 표시 이름(미선택이면 'nickname') */
  namePref: RankingNamePref;
  /** 랭킹 부가 프로필 공개 동의 — NULL=아직 물어본 적 없음 / false=거부 / true=동의 */
  publicProfileConsent: boolean | null;
}

/**
 * 내 랭킹 표시 설정. 비로그인·조회 실패는 **가장 덜 공개하는 값**으로 떨어진다
 * (닉네임 + 동의 미응답) — '모르면 덜 공개한다'가 개인정보의 안전한 기본값이다.
 */
export async function getMyRankingDisplaySettings(): Promise<RankingDisplaySettings> {
  const fallback: RankingDisplaySettings = { namePref: DEFAULT_RANKING_NAME_PREF, publicProfileConsent: null };
  if (IS_MOCK) return fallback;
  const uid = (await currentUser())?.id;
  if (!uid) return fallback;
  const { data, error } = await supabase
    .from('profiles').select('ranking_name_pref, public_ranking_consent').eq('id', uid).maybeSingle();
  if (error || !data) return fallback;
  return {
    namePref: data.ranking_name_pref === 'real_name' ? 'real_name' : DEFAULT_RANKING_NAME_PREF,
    publicProfileConsent: typeof data.public_ranking_consent === 'boolean' ? data.public_ranking_consent : null,
  };
}

/**
 * 순위표 표시 이름 저장. 값 검증·저장은 서버(set_my_ranking_name_pref)가 한다 —
 * 화면이 profiles 를 직접 UPDATE 하면 컬럼이 열린 만큼 다른 값도 쓸 수 있게 된다
 * (equipped_mark 를 클라이언트가 직접 UPDATE 하다 결제 우회가 됐던 사고와 같은 형태).
 */
export async function setMyRankingNamePref(pref: RankingNamePref): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_my_ranking_name_pref', { p_pref: pref });
  if (error) throw new Error(error.message);
}
