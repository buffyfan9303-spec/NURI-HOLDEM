// src/api/rankverify.ts — 순위(머니인) 인증: 외부 대회 입상 증빙 제출 → 운영자 승인 → 국내 순위 집계.
// 이미지 2장(머니인 증빙 + 신분증)은 비공개 버킷 'verifications'에 저장 — 승인/거절 즉시 신분증 삭제.
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
import { resizeImage } from '../lib/storage';
import { aiInspectImages } from './ai';

/** 대회 구분 — 'official'=정식 대회(해외 포함, 국내 순위 인정) / 'pub'=일반 펍(기록만) */
export type RankEventKind = 'official' | 'pub';
export const EVENT_KIND_LABEL: Record<RankEventKind, string> = {
  official: '정식 대회', pub: '일반 펍',
};

/** 국내 순위 인정 임계 — 100만원(10T)당 1점. 계산 자체는 서버(moneyin_points)에만 있다. */
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

/** 인증 신청 — 증빙·신분증 업로드 후 pending 등록 */
export async function submitRankVerification(input: {
  nickname: string; eventName: string; amountWon: number; proof: File; idCard: File;
  eventKind?: RankEventKind; isOverseas?: boolean;
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
    event_kind: input.eventKind ?? 'official', is_overseas: input.isOverseas ?? false,
  });
  if (error) throw new Error(error.message);
}

/** 내 신청 내역 */
export async function myRankVerifications(): Promise<RankVerification[]> {
  if (IS_MOCK) return [];
  const u = await currentUser();
  if (!u) return [];
  const { data } = await supabase.from('rank_verifications').select('*')
    .eq('user_id', u.id).order('created_at', { ascending: false }).limit(10);
  return (data ?? []).map(mapRow);
}

/**
 * 국내 순위 — '운영자 승인' + '정식 대회(해외 포함)' + 금액 임계를 모두 통과한 건만.
 * points 는 서버의 moneyin_points()(100만원당 1점)가 계산한다 — 여기서 재계산하지 않는다.
 */
export interface DomesticRow {
  nickname: string; points: number; totalWon: number; wins: number; overseas: number;
}
export async function getDomesticRankings(limit = 30): Promise<DomesticRow[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('get_domestic_rankings', { p_limit: limit });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    nickname: r.nickname, points: Number(r.points ?? 0), totalWon: Number(r.total_won ?? 0),
    wins: Number(r.wins ?? 0), overseas: Number(r.overseas ?? 0),
  }));
}

/** (운영자) 대기 목록 */
export async function adminListRankVerifications(): Promise<RankVerification[]> {
  const { data } = await supabase.from('rank_verifications').select('*')
    .eq('status', 'pending').order('created_at', { ascending: true });
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
 * eventKind: 승인 시 대회 구분을 운영자가 확정한다. 신청자의 자기신고를 그대로 믿지 않는다 —
 *   'official' 로 승인해야만 국내 순위에 합산되고, 'pub' 으로 승인하면 기록은 남되 순위에서 빠진다.
 *   (오너 #7 "관리자 설정에서 이를 승인한 경우에만 순위에 등록이 가능")
 */
export async function adminDecideRankVerification(
  v: RankVerification,
  approve: boolean,
  opts?: { note?: string; eventKind?: RankEventKind },
): Promise<void> {
  const { error } = await supabase.from('rank_verifications').update({
    status: approve ? 'approved' : 'rejected',
    admin_note: opts?.note ?? null,
    event_kind: opts?.eventKind ?? v.eventKind,
    decided_at: new Date().toISOString(),
    id_card_path: null,
  }).eq('id', v.id);
  if (error) throw new Error(error.message);
  if (v.idCardPath) await supabase.storage.from('verifications').remove([v.idCardPath]).catch(() => {});
}

/** (운영자) 증빙 이미지 AI 진위 검사 — 참고 소견(최종 판단은 운영자). 신분증은 개인정보라 검사에서 제외. */
export async function aiInspectVerification(v: RankVerification): Promise<string> {
  if (!v.proofPath) throw new Error('증빙 이미지가 없습니다');
  const url = await signedVerifyUrl(v.proofPath);
  const blob = await (await fetch(url)).blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('이미지 읽기 실패'));
    fr.readAsDataURL(blob);
  });
  const prompt = [
    `포커 토너먼트 입상(머니인) 증빙 이미지를 검사해 주세요.`,
    `신청 내용 — 닉네임: ${v.nickname} / 대회: ${v.eventName} / 신고 상금: ${(v.amountWon / 10000).toLocaleString()}만원`,
    `신고 구분: ${EVENT_KIND_LABEL[v.eventKind]}${v.isOverseas ? ' · 해외' : ' · 국내'}`,
    '',
    '다음을 분석:',
    '1) 이미지에 보이는 대회명·금액·이름이 신청 내용과 일치하는지',
    '2) 합성/편집 흔적(글꼴 불일치, 경계 부자연, 해상도 차이, 그림자/조명 모순)',
    '3) 일반적인 입상 증빙(트로피·시상 화면·정산표·공식 포스팅)으로 보이는지',
    '',
    '형식: 첫 줄에 결론 — [의심 신호 없음] / [주의 필요] / [위조 의심] 중 하나. 이어서 근거 3~5줄(각 줄 "- "로 시작). 한국어, 평문.',
  ].join('\n');
  return aiInspectImages(prompt, [dataUrl], '너는 이미지 포렌식 보조 분석가다. 과신하지 말고 보이는 근거만 말한다. 최종 판단은 운영자가 한다.');
}
