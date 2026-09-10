import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// NURI HOLDEM — 매장 주간 리포트(월요일 아침 cron이 호출).
// 지난주 엔트리·매출·신규 손님 + 요일별 분포를 집계해 규칙 기반 한 줄 조언과 함께 업주에게 알림.
// (2026-09-11) 조언은 전부 로컬 규칙이다 — 외부 모델 호출 0.
// ⚠️ 운영 메모(2026-06-23 감사): 현재 weekly-venue-reports cron 은 SQL 함수
//    public.send_weekly_venue_reports() 를 호출하며 이 엣지함수는 호출하지 않음(미사용).
//    이 함수를 쓰려면 cron 을 net.http_post 로 연결하거나, 아니면 폐기할 것.
// 2026-09-02 보안: 미사용인데도 공개 anon 키로 호출 가능했다(전 업주 알림 트리거).
//    크론 공유 시크릿(x-nuri-cron-secret = Vault push_shared_secret)이 없으면 401 — 연결할 때 cron 함수가 헤더를 동봉하면 된다.

const SB = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const H = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };
const DAY = ['일', '월', '화', '수', '목', '금', '토'];

function kstNow(): Date { return new Date(Date.now() + 9 * 3600_000); }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }

async function rest(path: string): Promise<any[]> {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H });
  if (!r.ok) return [];
  return await r.json();
}

let expectedSecret = '';
async function loadExpectedSecret(): Promise<string> {
  if (expectedSecret) return expectedSecret;
  const r = await fetch(`${SB}/rest/v1/rpc/get_push_shared_secret`, { method: 'POST', headers: H, body: '{}' });
  if (!r.ok) return '';
  const v = await r.json().catch(() => '');
  if (typeof v === 'string' && v.length > 0) expectedSecret = v;
  return expectedSecret;
}
function timingSafeEq(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// (2026-09-11) Gemini 한 줄 조언 제거 — 매장명·엔트리·매출·신규 손님 수를 외부 모델로 보내던 경로였다.
//   원래도 실패하면 아래 규칙 기반 조언으로 폴백하는 '덤' 구조였고, 크론은 이 함수가 아니라
//   SQL 함수 send_weekly_venue_reports() 를 부르므로 실사용 경로도 아니었다.
//   유지되는 것: 크론 공유 시크릿 게이트 · 주간 집계(엔트리·매출·신규 손님·요일 분포) · 알림 발송.

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const provided = req.headers.get('x-nuri-cron-secret') ?? '';
  const expected = await loadExpectedSecret();
  if (!expected || !provided || !timingSafeEq(provided, expected)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const now = kstNow();
  // 지난주 월~일 (KST)
  const dow = (now.getUTCDay() + 6) % 7; // 월=0
  const thisMon = new Date(now); thisMon.setUTCDate(now.getUTCDate() - dow);
  const lastMon = new Date(thisMon); lastMon.setUTCDate(thisMon.getUTCDate() - 7);
  const lastSun = new Date(thisMon); lastSun.setUTCDate(thisMon.getUTCDate() - 1);
  const s0 = iso(lastMon), s1 = iso(lastSun), weekStartIso = iso(thisMon);

  const venues = await rest(`venues?select=id,name,owner_id&owner_id=not.is.null&limit=500`);
  let sent = 0;
  for (const v of venues) {
    // 멱등: 이번 주에 이미 리포트 보냈으면 스킵(크론 중복 실행 방지)
    const dup = await rest(`notifications?select=id&user_id=eq.${v.owner_id}&type=eq.report&created_at=gte.${weekStartIso}&limit=1`);
    if (dup.length > 0) continue;

    const buyins = await rest(`ledger_buyins?select=session_date,payment_method,is_split,is_unpaid,cash_amount,card_amount,transfer_amount&venue_id=eq.${v.id}&session_date=gte.${s0}&session_date=lte.${s1}&limit=5000`);
    if (buyins.length === 0) continue; // 지난주 영업 없음
    const sessions = await rest(`ledger_sessions?select=session_date,buyin_amount,card_amount&venue_id=eq.${v.id}&session_date=gte.${s0}&session_date=lte.${s1}`);
    const sesMap = new Map(sessions.map((s: any) => [s.session_date, s]));

    let sales = 0;
    const byDow: Record<string, number> = {};
    for (const b of buyins) {
      const ses = sesMap.get(b.session_date) ?? { buyin_amount: 0, card_amount: 0 };
      if (b.is_split) sales += (b.cash_amount ?? 0) + (b.card_amount ?? 0) + (b.transfer_amount ?? 0);
      else if (b.payment_method === 'support' || b.payment_method === 'ticket') { /* 매출 0 */ }
      else if (b.is_unpaid) { /* 미수 제외 */ }
      else if (b.payment_method === 'card') sales += (ses.card_amount && ses.card_amount > 0 ? ses.card_amount : ses.buyin_amount) ?? 0;
      else sales += ses.buyin_amount ?? 0;
      const d = DAY[new Date(`${b.session_date}T00:00:00`).getDay()];
      byDow[d] = (byDow[d] ?? 0) + 1;
    }

    // 신규 손님: 지난주 등장 이름 중 그 전에 없던 이름
    const lastNames = await rest(`ledger_players?select=name&venue_id=eq.${v.id}&session_date=gte.${s0}&session_date=lte.${s1}&limit=3000`);
    const uniq = [...new Set(lastNames.map((r: any) => String(r.name)))];
    let newCnt = 0;
    for (const nm of uniq) {
      const before = await rest(`ledger_players?select=id&venue_id=eq.${v.id}&name=eq.${encodeURIComponent(nm)}&session_date=lt.${s0}&limit=1`);
      if (before.length === 0) newCnt += 1;
    }

    // 요일 분포 문자열 + 최저/최고(영업한 요일 기준)
    const entries = Object.entries(byDow).sort((a, b) => b[1] - a[1]);
    const dowStr = entries.map(([d, n]) => `${d} ${n}건`).join(', ');
    const worst = entries[entries.length - 1];
    const best = entries[0];

    // 조언은 집계에서 규칙으로 뽑는다(외부 모델 없음).
    let advice: string | null = null;
    if (worst) {
      advice = entries.length > 1 && worst[1] < best[1]
        ? `${worst[0]}요일이 약했어요(${worst[1]}건) — ${worst[0]}요일 이벤트로 끌어올려 보세요.`
        : `이번 주도 꾸준했어요 — 단골 재방문 이벤트를 추천합니다.`;
    }

    const message = `지난주(${s0.slice(5).replace('-', '/')}~${s1.slice(5).replace('-', '/')}) 엔트리 ${buyins.length}건 · 매출 ${Math.round(sales / 10000)}만원 · 신규 손님 ${newCnt}명\n💡 ${advice ?? ''}`.trim();
    await fetch(`${SB}/rest/v1/notifications`, {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: v.owner_id, type: 'report', title: `📊 ${v.name} 주간 리포트`, message, avatar_text: '📊', avatar_color: '#FFD100' }),
    });
    sent += 1;
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
