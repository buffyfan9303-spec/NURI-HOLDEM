// src/api/checkins.ts — QR 체크인. 기록은 check_in RPC로만(로그인 회원·4시간 중복 방지).
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
// ⚠ './ledger' 에서 가져오면 안 된다 — checkins 는 App.tsx 가 정적 import 하므로 장부 API 전체(7.1KB gz)가
//    비로그인 손님의 첫 화면 임계 경로에 실린다(2026-09-11 실측). 같은 함수의 원본을 직접 쓴다.
import { kstToday } from '../lib/kst';
import { getCheckinPosition, isCheckinGeoEnabled } from '../lib/checkinGeo';

export interface Checkin { id: string; venueId: string; userId: string; displayName: string | null; createdAt: string }

/** 방문 일수 — 매장별 KST 날짜 distinct. 서버 my_visited_venues(20260905l)·ranking_top_venues(20260829g)와 같은 단위라
 *  프로필 '방문 N회'·업적 뱃지·대시보드 매장별 방문이 한 숫자로 맞는다.
 *  같은 날 같은 매장 재스캔(4시간 중복 방지 후 2회째) = 1방문, 같은 날 다른 매장 = 각각 1방문. */
export function countVisitDays(rows: { venue_id: string; created_at: string }[]): number {
  return new Set(rows.map((r) => `${r.venue_id}|${kstToday(Date.parse(r.created_at))}`)).size;
}

/** 체크인 결과. points = 이번에 실제 부여된 점수(같은 날 두 번째부터 0), streak = 갱신된 연속일(구형 서버면 null). */
export interface CheckInResult { name: string; points: number; streak: number | null }

/** 서버 반환 정규화 — 20260905k 부터 jsonb {name, points, streak}. 구형 check_in(text) 은 매장명만 돌려주므로
 *  옛 클라 문구와 같게 +3 으로 본다(배포 순서상 클라가 먼저 나간다). */
export function normalizeCheckInResult(data: unknown): CheckInResult {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    return {
      name: typeof o.name === 'string' ? o.name : '',
      points: Number(o.points) || 0,
      streak: o.streak == null ? null : (Number(o.streak) || 0),
    };
  }
  return { name: typeof data === 'string' ? data : '', points: 3, streak: null };
}

/** 체크인 실행. 성공 시 매장명·부여 점수·연속일 반환.
 *  CHECKIN-GEO 2단계(2026-09-23): 위치를 **여기 한 곳에서만** 얻어 서버에 보낸다 — 호출부 3곳(App.tsx runCheckin ·
 *  MyVoucherSheet · VenuePage)은 시그니처 그대로라 경로별 결과가 갈리지 않는다(K-05 Q6).
 *  위치를 못 얻으면 `CheckinGeoError`(src/lib/checkinGeo.ts)를 그대로 던진다 — RPC 는 부르지 않는다.
 *  거리 판정은 서버(20260923b)만 한다. */
export async function checkIn(venueId: string): Promise<CheckInResult> {
  if (IS_MOCK) return { name: '데모 매장', points: 3, streak: null };
  // 운영 스위치(checkin_geo_enabled) 꺼짐·조회 실패 → 위치를 묻지 않고 예전과 똑같이 매장 id 만 보낸다.
  let args: Record<string, unknown> = { p_venue_id: venueId };
  if (await isCheckinGeoEnabled()) {
    const pos = await getCheckinPosition();
    args = { p_venue_id: venueId, p_lat: pos.lat, p_lng: pos.lng, p_accuracy: pos.accuracy };
  }
  const { data, error } = await supabase.rpc('check_in', args);
  if (error) throw new Error(error.message);
  return normalizeCheckInResult(data);
}

/** 업주 '출석 위치' 칸 — 매장에 등록된 좌표와 주소. 좌표가 없으면 손님 출석이 서버에서 막힌다(20260923b).
 *  조회 실패는 던진다 — '등록 안 됨'과 '못 읽음'을 화면이 구별해야 한다. */
export async function getVenueCheckinSpot(venueId: string): Promise<{ lat: number | null; lng: number | null; address: string }> {
  if (IS_MOCK) return { lat: null, lng: null, address: '' };
  const { data, error } = await supabase.from('venues').select('lat, lng, address').eq('id', venueId).maybeSingle();
  if (error) throw new Error(error.message);
  const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return { lat: num(data?.lat), lng: num(data?.lng), address: data?.address ?? '' };
}

export async function listVenueCheckins(venueId: string, sinceIso: string): Promise<Checkin[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('checkins').select('*')
    .eq('venue_id', venueId).gte('created_at', sinceIso).order('created_at', { ascending: false });
  // 🔴 2026-09-20 (R1-3) — `error` 를 버리고 `data ?? []` 를 돌려주면 **조회 실패가 '오늘 출석 0명'** 으로
  //   보인다. 업주는 아무도 안 왔다고 읽는다. 같은 폴더의 다른 api 들은 전부 `if (error) throw` 관례다
  //   (staffAccess.errorPropagation.test.ts 가 그 형제들을 이미 잠그고 있다) — 여기만 빠져 있었다.
  //   화면이 '실패'와 '0건'을 구별할 수 있어야 재시도 UI 를 띄울 수 있다.
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, venueId: r.venue_id, userId: r.user_id, displayName: r.display_name ?? null, createdAt: r.created_at }));
}

/** 내 출석 스트릭(연속 체크인 일수). 오늘/어제 외 마지막 체크인이면 화면용으로 0 처리. */
export async function getMyCheckinStreak(): Promise<number> {
  if (IS_MOCK) return 0;
  const u = await currentUser();
  if (!u) return 0;
  const { data } = await supabase.from('profiles')
    .select('checkin_streak, last_checkin_date').eq('id', u.id).single();
  if (!data?.last_checkin_date) return 0;
  const last = new Date(`${data.last_checkin_date}T00:00:00`);
  const diff = Math.round((Date.now() - last.getTime()) / 86400000);
  return diff <= 1 ? (data.checkin_streak ?? 0) : 0; // 이틀 이상 끊겼으면 0으로 표시
}

export function checkinUrl(venueId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nuriholdem.com';
  return `${origin}/?checkin=${venueId}`;
}

export function subscribeCheckins(venueId: string, cb: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`checkins:${venueId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter: `venue_id=eq.${venueId}` }, () => cb())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
