// src/api/calendar.ts — 유저 캘린더의 데이터 계층.
//
// 파이프라인 **유저 쪽 거울**: 예약 → 방문 → 바인 → 순위 의 결과를 본인 시점으로 되짚는다.
// 여기서 새로 만드는 것은 '찜'과 '수기 뱅크롤' 둘뿐이고, 예약·입상은 사슬 위쪽의
// 기존 함수(reservations.getMyReservations · rankings.getMyRankingHistory)를 그대로 쓴다 —
// 같은 값을 두 번 만들지 않는다.
import { supabase, IS_MOCK } from '../lib/supabase';
import { bankrollInsertPayload, insertWithRoiFallback, investedOf, type RoiRow } from '../lib/roi';

// ── 찜한 게임 ────────────────────────────────────────────────────────────────
/** 내가 찜한 대회 id 집합. RLS 가 본인 행만 돌려준다. */
export async function getMyLikedScheduleIds(): Promise<Set<string>> {
  if (IS_MOCK) return new Set();
  const { data } = await supabase.from('schedule_likes').select('schedule_id');
  return new Set((data ?? []).map((r: { schedule_id: string }) => r.schedule_id));
}

/** 이 대회 하나만 찜 여부 확인 — 상세 모달용. 전체 목록을 받아오지 않는다. */
export async function isScheduleLiked(scheduleId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data } = await supabase.from('schedule_likes')
    .select('schedule_id').eq('schedule_id', scheduleId).maybeSingle();
  return !!data;
}

/** 찜 토글. 켜진 상태를 돌려준다(낙관적 UI 가 되돌릴 때 쓴다). */
export async function toggleScheduleLike(scheduleId: string, on: boolean): Promise<boolean> {
  if (IS_MOCK) return on;
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('로그인이 필요합니다.');
  if (on) {
    // 이미 있으면 조용히 통과 — 더블탭·중복 클릭이 에러가 되면 안 된다
    const { error } = await supabase.from('schedule_likes')
      .upsert({ user_id: uid, schedule_id: scheduleId }, { onConflict: 'user_id,schedule_id' });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('schedule_likes').delete()
      .eq('user_id', uid).eq('schedule_id', scheduleId);
    if (error) throw new Error(error.message);
  }
  return on;
}

// ── 바이인 기록(행 단위) ──────────────────────────────────────────────────────


// ── 수기 뱅크롤 ──────────────────────────────────────────────────────────────
/** amount 는 순결과(net) — 옛 행과 같은 뜻. 참가비(buyIn+rebuy+addon)·매장·게임은 개인 ROI 용(src/lib/roi.ts).
 *  개인 비공개 기록 전용 — 공개 랭킹·경쟁에 잇지 않는다. */
export interface BankrollEntry extends RoiRow {
  id: string;
  memo: string;
}
/** 새 필드는 선택 — 비우면 0/'' (옛 호출부 그대로 동작) */
export type NewBankrollEntry = Pick<BankrollEntry, 'entryDate' | 'amount' | 'memo'>
  & Partial<Pick<BankrollEntry, 'buyIn' | 'rebuy' | 'addon' | 'venueName' | 'gameName'>>;

export async function getMyBankroll(limit = 300): Promise<BankrollEntry[]> {
  if (IS_MOCK) return [];
  // '*' 로 읽는다 — ROI 컬럼(20260909b)이 아직 운영에 없어도 읽기는 깨지지 않아야 한다(없으면 0/'' 로 매핑).
  const { data, error } = await supabase.from('bankroll_entries')
    .select('*')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any): BankrollEntry => ({
    id: r.id, entryDate: r.entry_date, amount: r.amount, memo: r.memo ?? '',
    buyIn: r.buy_in ?? 0, rebuy: r.rebuy ?? 0, addon: r.addon ?? 0,
    venueName: r.venue_name ?? '', gameName: r.game_name ?? '',
  }));
}

/** degraded=true 면 서버에 ROI 컬럼이 아직 없어 금액·메모만 저장됐다 — 화면이 그 사실을 말해야 한다. */
export async function addBankrollEntry(e: NewBankrollEntry): Promise<{ degraded: boolean }> {
  if (IS_MOCK) return { degraded: false };
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('로그인이 필요합니다.');
  const full = {
    entryDate: e.entryDate, amount: e.amount, memo: e.memo,
    buyIn: e.buyIn ?? 0, rebuy: e.rebuy ?? 0, addon: e.addon ?? 0,
    venueName: e.venueName ?? '', gameName: e.gameName ?? '',
  };
  // DB 제약(bankroll_entry_not_empty)과 같은 규칙: 금액이 있거나 참가비가 있거나 메모가 있거나.
  // amount 0 = 기타 스케줄(메모만) — 오너 지시 2026-09-04 로 허용됐다. 본전(amount 0·참가비 있음)도 참가 기록이다.
  if (!Number.isFinite(e.amount)) throw new Error('금액이 올바르지 않아요');
  if ([full.buyIn, full.rebuy, full.addon].some((v) => !Number.isFinite(v) || v < 0)) throw new Error('참가비는 0 이상이어야 해요');
  if (e.amount === 0 && investedOf(full) === 0 && !e.memo.trim()) throw new Error('금액이나 내용 중 하나는 입력해 주세요');
  // 하위호환: 기본값 필드는 payload 에서 빠지고, 컬럼 부재(PGRST204)면 새 필드 없이 한 번 더 시도한다.
  const { error, degraded } = await insertWithRoiFallback(
    bankrollInsertPayload(uid, full),
    async (p) => ({ error: (await supabase.from('bankroll_entries').insert(p)).error }),
  );
  if (error) {
    // 마이그레이션(20260909b) 전 서버: 새 필드를 뺀 재시도 payload 가 {amount:0, memo:''} 가 되어 옛 CHECK 에 걸린다(23514).
    // 영문 제약 오류 대신 무엇을 더 적으면 되는지 말한다 — 참가비만 있는 본전 기록은 서버가 새 컬럼을 알게 된 뒤에만 저장된다.
    const code = (error as { code?: string }).code;
    if (code === '23514' && e.amount === 0 && !e.memo.trim()) {
      throw new Error('서버 업데이트 전에는 참가비만 있는 기록(본전)을 저장할 수 없어요. 금액이나 메모를 함께 적어 주세요');
    }
    throw new Error(error.message);
  }
  return { degraded };
}

export async function deleteBankrollEntry(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('bankroll_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
