// 2026-10-06 법령 점검(security-1006/legal.md) 수정의 소스 계약 — 리허설(라이브 롤백)은 DB 동작을, 이 파일은 '되돌아가지 않음'을 잠근다.
//   P1-1 주간 이메일 수신자 = 마케팅 동의자 · P1-2 광고 생산자 3곳 is_ad + 푸시 발송부 한 곳에서 동의·야간 거름
//   P1-3 동의·철회 처리 결과 통지(트리거 + 화면) · P2-1 설정 토글 · P2-8 ② 제재 계정 본인 탈퇴
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marketingConsentNotice } from '../lib/marketingConsent';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8').replace(/\r\n/g, '\n');
const noComments = (s: string) => s.replace(/--[^\n]*/g, '');
const L = noComments(read('supabase/migrations/20261006l_marketing_ad_gate.sql'));
const M = noComments(read('supabase/migrations/20261006m_withdraw_sanctioned_self.sql'));
/** create or replace function public.<name> … $function$ 본문 하나 */
const fn = (src: string, name: string) => {
  const m = src.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$`));
  expect(m, `${name} 정의를 찾지 못했다`).toBeTruthy();
  return m![0];
};

describe('P1-1 주간 소식 이메일 — 마케팅 동의자만', () => {
  it('weekly_email_digest_rows 가 agreed_to_marketing is true 로 거른다', () => {
    expect(fn(L, 'weekly_email_digest_rows')).toMatch(/p\.agreed_to_marketing is true/);
  });
});

describe('P1-2 광고성 알림 — 알림함은 그대로, 푸시만 동의·주간', () => {
  it.each(['send_venue_announcement', 'send_weekly_follow_digest', 'notify_followers_on_poster'])('%s 의 insert 가 is_ad=true 를 싣는다', (name) => {
    const body = fn(L, name);
    expect(body).toMatch(/insert into public\.notifications \([^)]*\bis_ad\)/);
    expect(body).toMatch(/,\s*true\s*\n\s*(from|  from)/);
    expect(body, '수신자를 동의자로 좁히면 알림함 기능이 사라진다(리드 결정: 알림함은 모두에게)').not.toMatch(/agreed_to_marketing/);
  });
  it('push_on_notification 이 is_ad 행을 동의·야간으로 거르고 (광고)·전송자·수신거부를 붙인다', () => {
    const body = fn(L, 'push_on_notification');
    expect(body).toMatch(/if new\.is_ad then[\s\S]*agreed_to_marketing[\s\S]*_ad_quiet_hours\(now\(\)\)[\s\S]*return new;/);
    expect(body).toContain("'(광고) ' || new.title");
    expect(body).toMatch(/엔에이치홀딩스[\s\S]*수신거부/);
  });
  it('야간 경계는 KST 08~20시만 주간이다', () => {
    expect(fn(L, '_ad_quiet_hours').replace(/\s+/g, ' ')).toContain("extract(hour from (p_at at time zone 'Asia/Seoul')) not between 8 and 20");
  });
  it('업주 공지 화면이 푸시는 동의자에게만 간다고 알린다', () => {
    expect(read('src/components/features/AnnouncePanel.tsx')).toMatch(/data-testid="announce-ad-notice"[^>]*>푸시는 마케팅 수신 동의자에게만/);
  });
});

describe('P1-3 처리 결과 통지 · P2-1 설정 토글', () => {
  it('agreed_to_marketing 이 바뀌는 모든 경로를 트리거 한 곳이 알림함에 남긴다', () => {
    expect(L).toMatch(/create trigger trg_notify_marketing_consent\s+after insert or update of agreed_to_marketing on public\.profiles/);
    const body = fn(L, '_notify_marketing_consent');
    expect(body).toMatch(/전송자: 엔에이치홀딩스/);
    expect(body).toMatch(/to_char\(now\(\) at time zone 'Asia\/Seoul', 'YYYY-MM-DD'\)/);
    expect(body).toMatch(/new\.agreed_to_marketing is not distinct from old\.agreed_to_marketing/);
  });
  it('화면 문구는 전송자·날짜·결과 세 요소를 담는다', () => {
    const on = marketingConsentNotice(true, new Date('2026-10-06T15:30:00Z'));   // KST 10-07 00:30
    const off = marketingConsentNotice(false, new Date('2026-10-06T03:00:00Z'));
    expect(on).toContain('전송자 엔에이치홀딩스(NURI HOLDEM)');
    expect(on).toContain('처리일 2026-10-07');
    expect(on).toContain('수신 동의가 처리');
    expect(off).toContain('수신 동의 철회가 처리');
    expect(off).toContain('더 보내지 않습니다');
  });
  it('토글 RPC 는 필수 동의·판 번호를 건드리지 않고 authenticated 만 부른다', () => {
    const body = fn(L, 'set_my_marketing_consent');
    expect(body).toMatch(/update public\.profiles set agreed_to_marketing = p_on where id = v_uid;/);
    expect(body).not.toMatch(/consented_legal_version\s*=/);
    expect(L).toMatch(/revoke all on function public\.set_my_marketing_consent\(boolean\) from public, anon;/);
  });
  it('보안 탭에 토글이 있고 서버 RPC 를 부른다 · 재동의 게이트·가입도 처리 결과를 화면에 보인다', () => {
    const pm = read('src/components/features/ProfileModal.tsx');
    expect(pm).toMatch(/<MarketingConsentSetting onChanged=/);
    expect(pm).toMatch(/await setMyMarketingConsent\(next\)/);
    expect(read('src/api/auth.ts')).toContain("supabase.rpc('set_my_marketing_consent', { p_on: on })");
    expect(read('src/components/features/ConsentGateModal.tsx')).toContain('if (wasMarketing !== marketing) toast.show(marketingConsentNotice(marketing)');
    expect(read('src/components/features/AuthModal.tsx').match(/if \(c\.marketing\) toast\.show\(marketingConsentNotice\(true\)/g)?.length).toBe(2);
  });
});

describe('P2-8 ② 제재 계정 본인 탈퇴 — 재가입 차단은 유지', () => {
  it('withdraw_my_account 가 제재 상태로 막지 않고, 제재 계정 CI 는 banned 로 남긴다', () => {
    const body = fn(M, 'withdraw_my_account');
    expect(body).not.toContain('제재 중인 계정은 탈퇴할 수 없습니다');
    expect(body).toMatch(/case when v_status in \('banned', 'suspended'\) then 'banned' else 'withdrawn' end/);
  });
  it('20261006s2(탈퇴 파일 큐) 위에 얹는다 — 큐 넣기를 지우지 않고 SQL 메타 삭제를 되살리지 않는다 · s2 뒤 정의 게이트', () => {
    const body = fn(M, 'withdraw_my_account');
    expect(body).toContain("perform public._enqueue_user_storage_purge(v_uid, 'withdraw_self');");
    expect(body).not.toMatch(/delete\s+from\s+storage\.objects/i);
    expect(M).toContain("md5(pg_get_functiondef('public.withdraw_my_account()'::regprocedure)) is distinct from '570a3eb5aa675e0baf61781abc4c0281'");
    expect(M, 'admin_withdraw_user 는 s2 정의 그대로 둔다').not.toMatch(/function public\.admin_withdraw_user/);
  });
  it('정지·영구정지로 로그인하면 세션을 남기고 탈퇴 안내 시트를 연다(다른 기능은 user=null 로 막힌 채)', () => {
    const ctx = read('src/contexts/AuthContext.tsx');
    expect(ctx).toMatch(/if \(profile!\.status === 'withdrawn'\) apiSignOut\(\)\.catch\(\(\) => \{\}\);\s*else setSanctioned\(sanction\);\s*setUser\(null\);/);
    const app = read('src/App.tsx');
    expect(app).toContain('{sanctioned && <Suspense fallback={null}><SanctionedAccountSheet /></Suspense>}');
    expect(read('src/components/features/SanctionedAccountSheet.tsx')).toContain('<WithdrawAccountSection />');
  });
});
