// src/api/checkins.ts — QR 체크인. 기록은 check_in RPC로만(로그인 회원·4시간 중복 방지).
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
// ⚠ './ledger' 에서 가져오면 안 된다 — checkins 는 App.tsx 가 정적 import 하므로 장부 API 전체(7.1KB gz)가
//    비로그인 손님의 첫 화면 임계 경로에 실린다(2026-09-11 실측). 같은 함수의 원본을 직접 쓴다.
import { kstToday } from '../lib/kst';
import { getCheckinPosition, isCheckinGeoEnabled, CheckinGeoError, CheckinGeoRequiredError, GEO_REQUIRED_CODES } from '../lib/checkinGeo';
import { ensureLocationConsent } from '../lib/locationConsent';
import { isGeoRequiredNow } from '../lib/locationTerms';

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

/** 이 매장이 '위치 확인 출석'을 켰는가(venues.checkin_geo_required, 20261004d). 손님 화면용 힌트다 —
 *  조회 실패·컬럼 없음(마이그레이션 전) = **꺼짐**: 위치를 묻지 않고 매장 id 만 보낸다. 켠 매장이면 서버가 code 로 돌려준다. */
export async function getVenueCheckinGeoRequired(venueId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('venues').select('checkin_geo_required').eq('id', venueId).maybeSingle();
    return !error && data?.checkin_geo_required === true;
  } catch { return false; }
}

/** 체크인 실행. 성공 시 매장명·부여 점수·연속일 반환.
 *  CHECKIN-GEO 2단계(2026-09-23): 위치를 **여기 한 곳에서만** 얻어 서버에 보낸다 — 호출부 3곳(App.tsx runCheckin ·
 *  MyVoucherSheet · VenuePage)은 시그니처 그대로라 경로별 결과가 갈리지 않는다(K-05 Q6).
 *  20261004d(오너 결정 (다) 2026-10-04): 위치는 **운영 스위치 + 매장이 켠 '위치 확인 출석'** 일 때만 묻는다(신고서 ② · 최소 수집).
 *    켜지 않은 매장은 동의를 묻지도 않고 매장 id 만 보낸다 — 이 번들 이전과 같다.
 *    켠 매장에서 시행일(LOCATION_TERMS_EFFECTIVE) 뒤 동의·위치가 없으면 **서버가** {error, code} 로 거부한다 → CheckinGeoRequiredError
 *    (위치를 못 얻은 경우는 원래의 CheckinGeoError 를 던져 재시도 시트가 사유를 말하게 한다). 시행일 전에는 서버가 받아 준다.
 *  opts.geoRequired — 재시도 시트에서 다시 누를 때: 스위치·매장 조회를 건너뛰고 '켠 매장'으로 보고 동의를 다시 묻는다.
 *  거리·시행일 판정은 서버(check_in)만 한다. */
export async function checkIn(venueId: string, opts: { geoRequired?: boolean } = {}): Promise<CheckInResult> {
  if (IS_MOCK) return { name: '데모 매장', points: 3, streak: null };
  let args: Record<string, unknown> = { p_venue_id: venueId };
  let geoErr: CheckinGeoError | null = null;
  if (opts.geoRequired || (await isCheckinGeoEnabled() && await getVenueCheckinGeoRequired(venueId))) {
    // 위치정보 이용 동의(위치정보법 제15조①)가 있어야 좌표를 보낸다. required 는 시트 문구·'동의 안 함' 기록자에게 다시 묻기 위한 힌트일 뿐.
    if (await ensureLocationConsent(undefined, { required: !!opts.geoRequired || isGeoRequiredNow() })) {
      try {
        const pos = await getCheckinPosition();
        args = { p_venue_id: venueId, p_lat: pos.lat, p_lng: pos.lng, p_accuracy: pos.accuracy };
      } catch (e) {
        // 위치를 못 얻은 이유 외의 오류는 그대로 던진다. 위치 실패는 좌표 없이 보내 **서버가** 받을지 정하게 한다(시행일 전·스위치 꺼짐이면 받는다).
        if (!(e instanceof CheckinGeoError)) throw e;
        geoErr = e;
      }
    }
  }
  const { data, error } = await supabase.rpc('check_in', args);
  if (error) throw new Error(error.message);
  // 20260926b: 좌표를 쓴 출석의 거부는 예외가 아니라 {error} 로 온다 — 예외면 서버의 위치 이용 기록(확인자료)까지 롤백된다.
  const o = data && typeof data === 'object' ? (data as { error?: unknown; code?: unknown }) : undefined;
  const refused = o?.error;
  if (typeof refused === 'string' && refused) {
    const reason = typeof o?.code === 'string' ? GEO_REQUIRED_CODES[o.code] : undefined;
    if (reason === 'position' && geoErr) throw geoErr; // 권한 차단·측위 실패 — 재시도 시트가 그 사유로 안내한다
    if (reason) throw new CheckinGeoRequiredError(reason, refused);
    throw new Error(refused);
  }
  return normalizeCheckInResult(data);
}

/** 업주 '출석 위치' 칸 — 매장에 등록된 좌표·주소와 '위치 확인 출석' 켬 여부. 좌표가 없으면 켤 수 없다(서버 20261004d).
 *  조회 실패는 던진다 — '등록 안 됨'과 '못 읽음'을 화면이 구별해야 한다. */
export async function getVenueCheckinSpot(venueId: string): Promise<{ lat: number | null; lng: number | null; address: string; geoRequired: boolean }> {
  if (IS_MOCK) return { lat: null, lng: null, address: '', geoRequired: false };
  const { data, error } = await supabase.from('venues').select('lat, lng, address, checkin_geo_required').eq('id', venueId).maybeSingle();
  if (error) throw new Error(error.message);
  const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return { lat: num(data?.lat), lng: num(data?.lng), address: data?.address ?? '', geoRequired: data?.checkin_geo_required === true };
}

/** 업주: 이 매장의 '위치 확인 출석' 켜기/끄기(set_venue_checkin_geo_required — 서버가 can_manage_venue·좌표 등록을 검사).
 *  서버가 저장한 값을 돌려준다. 화면은 이 값이 아니라 getVenueCheckinSpot 재조회로 확인한다(거짓 성공 금지 K-03). */
export async function setVenueCheckinGeoRequired(venueId: string, on: boolean): Promise<boolean> {
  if (IS_MOCK) return on;
  const { data, error } = await supabase.rpc('set_venue_checkin_geo_required', { p_venue_id: venueId, p_on: on });
  if (error) throw error;
  return data === true;
}

/** 매장 직원(대표·승인 공동 운영자·관리자 = can_manage_pos)이 손님을 지정해 출석 처리(staff_check_in, 20261004d critical L1).
 *  손님 QR 출석과 같은 혜택(_apply_checkin)·같은 4시간 중복 가드. 위치를 쓰지 않는다. 오류는 원본 그대로 던진다(msgOf 분류용). */
export async function staffCheckIn(venueId: string, userId: string): Promise<CheckInResult> {
  if (IS_MOCK) return { name: '데모 매장', points: 3, streak: null };
  const { data, error } = await supabase.rpc('staff_check_in', { p_venue_id: venueId, p_user_id: userId });
  if (error) throw error;
  return normalizeCheckInResult(data);
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
