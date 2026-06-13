// src/api/rankverify.ts — 순위(머니인) 인증: 외부 대회 입상 증빙 제출 → 운영자 승인 → 국내 순위 집계.
// 이미지 2장(머니인 증빙 + 신분증)은 비공개 버킷 'verifications'에 저장 — 승인/거절 즉시 신분증 삭제.
import { supabase, IS_MOCK } from '../lib/supabase';
import { resizeImage } from '../lib/storage';

export interface RankVerification {
  id: string; nickname: string; eventName: string; amountWon: number;
  status: 'pending' | 'approved' | 'rejected'; adminNote?: string | null; createdAt: string;
  proofPath?: string; idCardPath?: string | null; userId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRow = (r: any): RankVerification => ({
  id: r.id, nickname: r.nickname, eventName: r.event_name, amountWon: Number(r.amount_won ?? 0),
  status: r.status, adminNote: r.admin_note ?? null, createdAt: r.created_at,
  proofPath: r.proof_url, idCardPath: r.id_card_path ?? null, userId: r.user_id,
});

/** 인증 신청 — 증빙·신분증 업로드 후 pending 등록 */
export async function submitRankVerification(input: {
  nickname: string; eventName: string; amountWon: number; proof: File; idCard: File;
}): Promise<void> {
  if (IS_MOCK) return;
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
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
  const { error } = await supabase.from('rank_verifications').insert({
    user_id: uid, nickname: input.nickname, event_name: input.eventName.trim(),
    amount_won: Math.round(input.amountWon), proof_url: proofPath, id_card_path: idPath,
  });
  if (error) throw new Error(error.message);
}

/** 내 신청 내역 */
export async function myRankVerifications(): Promise<RankVerification[]> {
  if (IS_MOCK) return [];
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data } = await supabase.from('rank_verifications').select('*')
    .eq('user_id', u.user.id).order('created_at', { ascending: false }).limit(10);
  return (data ?? []).map(mapRow);
}

/** 국내 순위(승인 합산) */
export async function getDomesticRankings(limit = 30): Promise<{ nickname: string; totalWon: number; wins: number }[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('get_domestic_rankings', { p_limit: limit });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ nickname: r.nickname, totalWon: Number(r.total_won ?? 0), wins: r.wins ?? 0 }));
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

/** (운영자) 승인/거절 — 어느 쪽이든 신분증은 즉시 삭제(개인정보 최소 보관) */
export async function adminDecideRankVerification(v: RankVerification, approve: boolean, note?: string): Promise<void> {
  const { error } = await supabase.from('rank_verifications').update({
    status: approve ? 'approved' : 'rejected',
    admin_note: note ?? null,
    decided_at: new Date().toISOString(),
    id_card_path: null,
  }).eq('id', v.id);
  if (error) throw new Error(error.message);
  if (v.idCardPath) await supabase.storage.from('verifications').remove([v.idCardPath]).catch(() => {});
}
