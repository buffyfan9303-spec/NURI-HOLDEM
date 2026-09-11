// src/api/rankverify.ts — 순위(머니인) 인증: 외부 대회 입상 증빙 제출 → 운영자 승인 → 국내 순위 집계.
// 이미지 2장(머니인 증빙 + 신분증)은 비공개 버킷 'verifications'에 저장 — 승인/거절 즉시 신분증 삭제.
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
import { resizeImage } from '../lib/storage';

/**
 * 대회 구분 — 'official'=대회(토너먼트, 해외 포함) / 'pub'=일반 펍(정기 게임).
 *
 * ⚠ 2026-08-30(오너 #11) "일반펍은 순위인증에 포함하지 않음. 대회만 포함."
 *   'pub' 은 **과거 행을 읽어 표시하기 위해서만** 남아 있는 값이다. 신규 신청·승인 경로에는
 *   더 이상 존재하지 않는다(신청 폼의 구분 선택 제거 + RLS `event_kind = 'official'` +
 *   `rank_verifications_approved_official_chk`). 타입에서 'pub' 을 지우면 과거 행이
 *   런타임에 타입 밖 값이 되어 라벨이 빈칸으로 뜬다 — 그래서 타입은 그대로 둔다.
 */
export type RankEventKind = 'official' | 'pub';
export const EVENT_KIND_LABEL: Record<RankEventKind, string> = {
  official: '대회', pub: '일반 펍(구 기록)',
};

/** 신규 신청·승인이 가질 수 있는 유일한 구분(오너 #11). 서버 RLS·CHECK 와 같은 값이다. */
export const VERIFIABLE_EVENT_KIND: RankEventKind = 'official';

/** 국내 순위 인정 임계 — 100만원(100T)당 1점. 계산 자체는 서버(moneyin_points)에만 있다. */
export const MONEYIN_UNIT_WON = 1_000_000;

export interface RankVerification {
  id: string; nickname: string; eventName: string; amountWon: number;
  /** 신청자가 고르고, 운영자가 승인 시 확정 — 국내 순위는 official 만 합산 */
  eventKind: RankEventKind;
  /** 해외 개최 — 정식이면 해외도 인정되므로 제외 조건이 아니라 표시·심사 참고용 */
  isOverseas: boolean;
  status: 'pending' | 'approved' | 'rejected'; adminNote?: string | null; createdAt: string;
  proofPath?: string; idCardPath?: string | null; userId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRow = (r: any): RankVerification => ({
  id: r.id, nickname: r.nickname, eventName: r.event_name, amountWon: Number(r.amount_won ?? 0),
  eventKind: (r.event_kind === 'pub' ? 'pub' : 'official'),
  isOverseas: r.is_overseas === true,
  status: r.status, adminNote: r.admin_note ?? null, createdAt: r.created_at,
  proofPath: r.proof_url, idCardPath: r.id_card_path ?? null, userId: r.user_id,
});

/**
 * 인증 신청 — 증빙·신분증 업로드 후 pending 등록.
 *
 * event_kind 는 더 이상 신청자가 고르지 않는다(오너 #11). 항상 '대회'로만 접수되고,
 * 그것이 실제 대회인지는 운영자가 증빙을 보고 판정한다(승인=대회 확정 / 반려=대회 아님).
 * 서버 RLS 도 event_kind='official' 이외의 INSERT 를 거부하므로, 여기서 값을 열어 두면
 * 화면만 통과하고 저장에서 실패하는 어긋남이 생긴다.
 */
export async function submitRankVerification(input: {
  nickname: string; eventName: string; amountWon: number; proof: File; idCard: File;
  isOverseas?: boolean;
}): Promise<void> {
  if (IS_MOCK) return;
  const uid = (await currentUser())?.id;
  if (!uid) throw new Error('로그인이 필요합니다');
  const up = async (file: File, tag: string) => {
    const blob = await resizeImage(file, 1600, 1600, 0.85);
    const path = `${uid}/${Date.now()}-${tag}.webp`;
    const { error } = await supabase.storage.from('verifications').upload(path, blob, { contentType: 'image/webp' });
    if (error) throw new Error('이미지 업로드 실패: ' + error.message);
    return path;
  };
  const proofPath = await up(input.proof, 'proof');
  const idPath = await up(input.idCard, 'idcard');
  // status 는 보내지 않는다 — RLS(rv_insert_own)가 pending 이외의 신규 행을 거부한다(자가 승인 차단).
  const { error } = await supabase.from('rank_verifications').insert({
    user_id: uid, nickname: input.nickname, event_name: input.eventName.trim(),
    amount_won: Math.round(input.amountWon), proof_url: proofPath, id_card_path: idPath,
    event_kind: VERIFIABLE_EVENT_KIND, is_overseas: input.isOverseas ?? false,
  });
  if (error) throw new Error(error.message);
}

/** 내 신청 내역 */
export async function myRankVerifications(): Promise<RankVerification[]> {
  if (IS_MOCK) return [];
  const u = await currentUser();
  if (!u) return [];
  const { data, error } = await supabase.from('rank_verifications').select('*')
    .eq('user_id', u.id).order('created_at', { ascending: false }).limit(10);
  if (error) throw new Error(error.message);   // 내 신청 이력도 '없음' 으로 위장하지 않는다
  return (data ?? []).map(mapRow);
}

/**
 * 국내 순위 — '운영자 승인' + '대회(해외 포함)' + 금액 임계를 모두 통과한 건만.
 * points 는 서버의 moneyin_points()(100만원당 1점)가 계산한다 — 여기서 재계산하지 않는다.
 * 오너 #11 이후 일반 펍은 애초에 승인될 수 없으므로 이 목록에는 대회만 남는다.
 */
export interface DomesticRow {
  nickname: string; points: number; totalWon: number; wins: number; overseas: number;
}
export async function getDomesticRankings(limit = 30): Promise<DomesticRow[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('get_domestic_rankings', { p_limit: limit });
  if (error) throw error; // 실패를 '0건'으로 위장하면 화면이 '아직 없어요'로 굳는다(2026-09-05 점검 #20)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    nickname: r.nickname, points: Number(r.points ?? 0), totalWon: Number(r.total_won ?? 0),
    wins: Number(r.wins ?? 0), overseas: Number(r.overseas ?? 0),
  }));
}

/** (운영자) 대기 목록 */
export async function adminListRankVerifications(): Promise<RankVerification[]> {
  // ⚠ error 를 반드시 받는다(2026-09-11). 예전엔 구조분해조차 하지 않아 RLS 거부·세션 만료·네트워크
  //   실패가 전부 빈 배열이 됐고, 화면은 호출부 주석이 금지한 그 문장("대기 중인 신청이 없습니다")을
  //   단언했다. 이 큐는 신분증까지 올려 제출한 요청이라 묻히면 회원이 재제출할 방법이 없다.
  const { data, error } = await supabase.from('rank_verifications').select('*')
    .eq('status', 'pending').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/** (운영자) 이미지 열람용 서명 URL — 비공개 버킷 */
export async function signedVerifyUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('verifications').createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error('이미지 열람 실패');
  return data.signedUrl;
}

/**
 * (운영자) 승인/거절 — 어느 쪽이든 신분증은 즉시 삭제(개인정보 최소 보관).
 *
 * 오너 #11 이후 승인의 의미가 하나로 줄었다: **승인 = 대회로 확정**.
 *   예전엔 '일반 펍으로 승인'(기록만 남기고 순위 제외)이라는 제3의 결말이 있었는데,
 *   그게 곧 "일반 펍도 순위 인증에 들어와 있다"는 상태였다. 이제 대회가 아니면 반려다.
 *   승인 시 event_kind 를 'official' 로 못 박는 이유: 구버전 화면에서 'pub' 으로 접수된
 *   대기 건이 남아 있을 수 있고, 그대로 승인하면 서버 CHECK 에 걸려 승인 자체가 실패한다.
 *   (반려는 신고값을 그대로 둔다 — 반려 사유를 나중에 읽을 때 원래 신고가 필요하다.)
 */
export async function adminDecideRankVerification(
  v: RankVerification,
  approve: boolean,
  opts?: { note?: string },
): Promise<void> {
  // 순서가 중요하다 — 경로를 먼저 지우면 삭제 실패 시 이미지가 버킷에 남는데 찾아 지울 단서가 없다.
  // storage.remove() 는 실패를 throw 하지 않고 { error } 로 돌려준다(예전 .catch(() => {}) 는 아무것도 잡지 못했다).
  if (v.idCardPath) {
    const { error: rmErr } = await supabase.storage.from('verifications').remove([v.idCardPath]);
    if (rmErr) throw new Error('신분증 삭제에 실패했습니다(심사를 중단합니다): ' + rmErr.message);
  }
  const { error } = await supabase.from('rank_verifications').update({
    status: approve ? 'approved' : 'rejected',
    admin_note: opts?.note ?? null,
    event_kind: approve ? VERIFIABLE_EVENT_KIND : v.eventKind,
    decided_at: new Date().toISOString(),
    id_card_path: null,
  }).eq('id', v.id);
  if (error) throw new Error(error.message);
}

// (2026-09-11) 증빙 이미지 AI 진위 검사 제거 — 증빙 사진을 외부 모델로 보내던 경로였다.
// 대신 운영자가 눈으로 대조하는 수동 체크리스트를 쓴다(AdminTab RankVerifyChecklist).
// 유지되는 것: 비공개 버킷 · 300초 서명 URL · 수동 승인/반려 · 관리자 메모 · 심사 후 신분증 삭제.
// 자동 위조 판정·자동 승인은 만들지 않는다(오판의 책임을 사람이 진다).
