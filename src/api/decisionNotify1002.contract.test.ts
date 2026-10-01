// 20261002b 결정 결과 알림 마이그레이션 계약(audit-link-1002 L-01·L-04, 오너 결정 10-02).
//   본문 문자열 계약이다 — 실제 동작은 라이브 롤백 리허설(notify-1002-report.md)이 본다.
//   여기서는 "각 결정 함수가 알림을 넣는가·받는 사람이 맞는가·권한 줄이 있는가·금액 단어가 없는가" 를 고정한다.
// 실행: npx vitest run src/api/decisionNotify1002.contract.test.ts --maxWorkers=4
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(join(__dirname, '../../supabase/migrations/20261002b_decision_notifications.sql'), 'utf-8');
// 주석을 지운 코드 — 주석에 적힌 이름이 계약을 거짓 통과시키지 않게
const sql = raw.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');

/** create or replace function public.<name>( … 다음 create 전까지의 본문 */
function body(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf('create or replace function', start + 10);
  return sql.slice(start, next < 0 ? undefined : next);
}

describe('20261002b — 결정 함수마다 받는 사람에게 알림 1줄', () => {
  const cases: [string, RegExp][] = [
    ['admin_reject_signup', /_notify_user\(p_user_id,/],
    ['respond_staff_invite', /_notify_user\(v_by,/],
    ['manage_staff', /_notify_user\(p_staff_id,/],
    ['admin_decide_venue_event', /_notify_user\(\s*coalesce\(r\.requested_by,/],
    ['admin_decide_voucher_quota', /_notify_user\(\s*coalesce\(r\.requested_by,/],
    ['reject_buyin_request', /if r\.voucher_id is null then\s+perform public\._notify_user\(r\.user_id,/],
    ['_notify_venue_decision', /_notify_user\(new\.owner_id,/],
    ['_notify_rank_verification_decision', /_notify_user\(new\.user_id,/],
  ];
  for (const [fn, re] of cases) {
    it(`${fn} → 알림`, () => { expect(body(fn)).toMatch(re); });
  }
  it('입점 승인·반려와 순위 인증은 트리거로 붙는다(화면이 표를 직접 갱신하는 경로)', () => {
    expect(sql).toMatch(/create trigger trg_notify_venue_decision\s+after update of approved, status on public\.venues/);
    expect(sql).toMatch(/create trigger trg_notify_rank_verification_decision\s+after update of status on public\.rank_verifications/);
  });
  it('입점 트리거는 관리자 결정만 알린다(업주 본인 숨김은 반려가 아니다)', () => {
    expect(body('_notify_venue_decision')).toMatch(/public\.my_role\(\) is distinct from 'admin'::user_role/);
  });
});

describe('L-01 — 철회된 초대자의 초대', () => {
  const b = body('respond_staff_invite');
  it('초대자 권한 판정이 소속 변경보다 먼저고, 거짓이면 수락을 거부한다', () => {
    const judge = b.indexOf('_venue_coowner_ok(v_venue, v_by)');
    const refuse = b.indexOf('if not v_ok then');
    const member = b.indexOf("update public.profiles set role='venue_staff'");
    expect(judge).toBeGreaterThan(0);
    expect(refuse).toBeGreaterThan(judge);
    expect(member).toBeGreaterThan(refuse);
    expect(b.slice(refuse, member)).toMatch(/raise exception '초대한 운영자가 더 이상 이 매장을 관리하지 않아 초대가 무효입니다'/);
  });
  it('대기 초대 목록은 무효 초대를 보여 주지 않는다', () => {
    expect(body('get_my_staff_invites')).toMatch(/_venue_owner_ok\(i\.venue_id, i\.invited_by\)\s+or public\._venue_coowner_ok\(i\.venue_id, i\.invited_by\)/);
  });
});

describe('입점 거절 — 미승인 매장 정리(오너 결정 2)', () => {
  const b = body('admin_reject_signup');
  it('삭제를 먼저 시도하고, 기록 때문에 거부되면(P0001) 숨김 보관으로 바꾼다', () => {
    expect(b).toMatch(/delete from public\.venues where id = v_venue\.id;[\s\S]*exception when sqlstate 'P0001' then\s+update public\.venues set status = 'hidden'/);
    expect(b).toMatch(/owner_id = p_user_id and kind = 'venue' and approved = false/);
  });
  it('숨김으로 바꿀 때 입점 반려 트리거 알림이 겹치지 않는다', () => {
    expect(b).toMatch(/set_config\('nuri\.skip_venue_decision_notify', 'on', true\)/);
    expect(body('_notify_venue_decision')).toMatch(/current_setting\('nuri\.skip_venue_decision_notify', true\) is not distinct from 'on'/);
  });
  it('이메일을 보내지 않는다(앱 알림만)', () => {
    expect(b).not.toMatch(/net\.http_post|send.?mail|resend/i);
  });
});

describe('L-04 — 바인 요청 알림의 매장 구분', () => {
  const b = body('_notify_buyin_request');
  it('링크에 매장 id 를 싣고, 병합(update)·중복 검사가 같은 링크로 갈린다', () => {
    expect(b).toMatch(/v_link := '\/my-store\/ledger\?venue=' \|\| NEW\.venue_id;/);
    expect(b).toMatch(/where link = v_link and title = '🙋 손님 바인 요청'/);
    expect(b).toMatch(/n\.link = v_link/);
    expect(b).not.toMatch(/'\/my-store\/ledger'/);
  });
});

describe('보안 기본값 — 권한 줄·search_path', () => {
  const rpcs = ['admin_reject_signup(uuid, text)', 'respond_staff_invite(uuid, boolean)', 'get_my_staff_invites()', 'manage_staff(uuid, text)',
    'admin_decide_venue_event(uuid, boolean, text)', 'admin_decide_voucher_quota(uuid, boolean, text)', 'reject_buyin_request(uuid, text)'];
  for (const sig of rpcs) {
    it(`${sig}: PUBLIC·anon 회수 + authenticated 부여`, () => {
      const esc = sig.replace(/[()]/g, '\\$&');
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${esc} from public, anon;`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${esc} to authenticated, service_role;`));
    });
  }
  it('내부 함수(헬퍼·트리거)는 authenticated 에서도 회수한다', () => {
    for (const f of ['_notify_user(uuid, public.notif_type, text, text, text)', '_notify_buyin_request()', '_notify_venue_decision()', '_notify_rank_verification_decision()']) {
      expect(sql).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    }
  });
  it('모든 함수가 SECURITY DEFINER + search_path 고정', () => {
    const fns = sql.split('create or replace function').slice(1);
    expect(fns.length).toBe(11);
    for (const f of fns) {
      expect(f).toMatch(/security definer/);
      expect(f).toMatch(/set search_path = public, pg_temp/);
    }
  });
  it('적용 전 게이트(md5)와 자가검사가 있다', () => {
    expect(sql).toMatch(/'public\.respond_staff_invite\(uuid,boolean\)',\s+'127355c65e4b6ab63d2e1c154c2b3de4'/);
    expect(sql).toMatch(/20261002b 자가검사/);
  });
});

describe('문구 — §28 금액 단어 없음 · 합니다체', () => {
  // _notify_user( … ) 호출 인자 안의 문자열만 본다
  const literals = [...sql.matchAll(/_notify_user\(([\s\S]*?)\);/g)]
    .flatMap((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
  it('알림 문구를 모았다(0개 수집 거짓 통과 방지)', () => { expect(literals.length).toBeGreaterThan(20); });
  it('환금성·금액 단어가 없다', () => {
    for (const s of literals) expect(s, s).not.toMatch(/금액|상금|현금|환전|수익|참가비|바이인|원\)|₩/);
  });
  it('문장으로 끝나는 문구는 합니다체다', () => {
    const sentences = literals.filter((s) => /[다]\.?$/.test(s));
    expect(sentences.length).toBeGreaterThan(5);
    for (const s of sentences) expect(s, s).toMatch(/(습니다|입니다|됩니다|세요)\.?$/);
  });
});
