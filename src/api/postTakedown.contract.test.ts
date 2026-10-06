// 권리침해 임시조치 계약 (오너 2026-10-06 · 20261006t · 약관 제5조 ⑦~⑩ — PR #193 · 정보통신망법 §44의2·§44의3)
//
// 이 테스트가 잡는 회귀
//   ① 화면이 가림·통지·기록을 서버 RPC 없이 표에 직접 쓰는 것(가림은 서버가 해야 한다 — 화면만 가리면 링크로 본문이 샌다)
//   ② 남이 임시조치된 글 링크를 열면 '없는 글' 로 끝나 게시물 자리의 안내(§44의2② 공시)가 사라지는 것
//   ③ 마이그레이션의 권한(관리자 NULL-safe 검사 · SECURITY DEFINER · search_path · PUBLIC/anon 회수)이 빠지는 것
//   ④ 관리자 '블라인드 해제' 토글이 임시조치를 통지·기록 없이 푸는 것 · 숨김 글의 댓글이 남에게 보이는 것
//   ⑤ 신고 화면에서 권리침해 사유가 사라지거나 소명 없이 접수되는 것
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: { kind: string; name: string; args?: unknown }[] = [];
let rpcData: unknown = null;
let postRow: unknown = null;

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: async (name: string, args: unknown) => { calls.push({ kind: 'rpc', name, args }); return { data: rpcData, error: null }; },
    from: (name: string) => {
      calls.push({ kind: 'from', name });
      if (name !== 'community_posts' && name !== 'post_likes') throw new Error(`표 직접 접근 금지: ${name}`);
      // 읽기 전용 체인만 흉내 낸다(update·insert·delete 는 없다 → 부르면 TypeError 로 드러난다)
      const q = { select: () => q, eq: () => q, limit: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: postRow, error: null }) };
      return q;
    },
  },
}));

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const sqlCode = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

const NOTICE = { status: 'active', created_at: '2026-10-06T00:00:00Z', ends_at: '2026-11-05T00:00:00Z', expired: false, mine: false };

describe('임시조치 API — 서버 RPC 한 번씩', () => {
  beforeEach(() => { calls.length = 0; rpcData = { id: 't1', ends_at: '2026-11-05T00:00:00Z', notified: 2 }; });

  it('신고에서 임시조치: admin_takedown_post 에 글·사유·신고를 싣는다', async () => {
    const { takedownPost } = await import('./reports');
    const r = await takedownPost('p1', '명예훼손 주장', 'r1');
    expect(calls).toEqual([{ kind: 'rpc', name: 'admin_takedown_post', args: { p_post_id: 'p1', p_reason: '명예훼손 주장', p_report_id: 'r1' } }]);
    expect(r.notified).toBe(2);
  });

  it('직권 임시조치는 신고 id 를 비운다(null)', async () => {
    const { takedownPost } = await import('./reports');
    await takedownPost('p1', '명백한 침해');
    expect(calls[0]).toMatchObject({ name: 'admin_takedown_post', args: { p_report_id: null } });
  });

  it('이의제기·판단·요청 기각도 RPC 로만 간다', async () => {
    const { requestTakedownReview, decideTakedown, rejectRightsRequest } = await import('./reports');
    await requestTakedownReview('p1', '사실에 근거한 후기입니다');
    await decideTakedown('t1', 'keep', '  침해 소명 타당  ');
    await rejectRightsRequest('r9', '침해로 보기 어려움');
    expect(calls).toEqual([
      { kind: 'rpc', name: 'request_post_takedown_review', args: { p_post_id: 'p1', p_text: '사실에 근거한 후기입니다' } },
      { kind: 'rpc', name: 'admin_decide_takedown', args: { p_takedown_id: 't1', p_action: 'keep', p_note: '침해 소명 타당' } },
      { kind: 'rpc', name: 'admin_reject_rights_request', args: { p_report_id: 'r9', p_note: '침해로 보기 어려움' } },
    ]);
  });
});

describe('getPostById — 남이 연 임시조치 글은 자리표시(안내만)', () => {
  beforeEach(() => {
    calls.length = 0; postRow = null;
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  });
  const ID = '11111111-2222-3333-4444-555555555555';

  it('RLS 0행 + 임시조치 안내 → 본문·작성자 없는 숨김 자리표시', async () => {
    rpcData = NOTICE;
    const { getPostById } = await import('./communityCore');
    const p = await getPostById(ID);
    expect(calls.map((c) => c.name)).toEqual(['community_posts', 'post_takedown_notice']);
    expect(p).toMatchObject({ id: ID, blinded: true, blindedSource: 'takedown', content: '', userId: '', title: '' });
    expect(p?.takedown).toMatchObject({ status: 'active', endsAt: '2026-11-05T00:00:00Z', mine: false });
    expect(p?.takedown?.reason).toBeUndefined();
  });

  it('임시조치가 아니면 종전대로 없는 글(null)', async () => {
    rpcData = null;
    const { getPostById } = await import('./communityCore');
    expect(await getPostById(ID)).toBeNull();
  });

  it('보이는 글은 안내 RPC 를 부르지 않고 blinded_source 를 싣는다', async () => {
    postRow = { id: ID, user_id: 'u1', user_name: 'n', content: 'c', created_at: 'x', like_count: 0, comment_count: 0, blinded: true, blinded_source: 'takedown' };
    const { getPostById } = await import('./communityCore');
    const p = await getPostById(ID);
    expect(calls.some((c) => c.name === 'post_takedown_notice')).toBe(false);
    expect(p).toMatchObject({ blinded: true, blindedSource: 'takedown', content: 'c' });
  });
});

describe('20261006t 마이그레이션 계약', () => {
  const sql = sqlCode(read('supabase/migrations/20261006t_post_takedown.sql'));
  const fn = (name: string) => {
    const from = sql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\(`, 'i'));
    expect(from, `${name} 정의가 없다`).toBeGreaterThan(-1);
    return sql.slice(from, sql.indexOf('$function$;', from));
  };

  it('관리자 RPC 3종: NULL-safe 관리자 검사 · SECURITY DEFINER · search_path · PUBLIC/anon 회수', () => {
    for (const [name, sig] of [['admin_takedown_post', 'uuid, text, uuid'], ['admin_decide_takedown', 'uuid, text, text'],
                               ['admin_reject_rights_request', 'uuid, text']] as const) {
      const body = fn(name);
      expect(body).toMatch(/my_role\(\)\s+is\s+distinct\s+from\s+'admin'/i);
      expect(body).toMatch(/security\s+definer/i);
      expect(body).toMatch(/set\s+search_path\s+to\s+'public',\s*'pg_temp'/i);
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\(${sig.replace(/ /g, '\\s*')}\\)\\s+from\\s+public,\\s*anon`, 'i'));
    }
    const review = fn('request_post_takedown_review');
    expect(review).toMatch(/auth\.uid\(\)/);
    expect(review).toMatch(/author_id\s+is\s+distinct\s+from\s+v_me/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.request_post_takedown_review\(uuid,\s*text\)\s+from\s+public,\s*anon/i);
  });

  it('가림은 서버 숨김(blinded + 출처 takedown) · 30일 · 작성자·신청인 전원 통지 · 광고 표지 없음', () => {
    const body = fn('admin_takedown_post');
    expect(body).toMatch(/set\s+blinded\s*=\s*true,\s*blinded_source\s*=\s*'takedown'/i);
    expect(body).toMatch(/interval\s+'30 days'/i);
    expect(body).toMatch(/_notify_takedown_parties\(v_id,/);
    // 같은 글의 열린 권리침해 신고는 이 조치로 모두 닫히고 그 신청인도 통지받는다(P2-1)
    expect(body).toMatch(/update\s+public\.reports\s+set\s+status\s*=\s*'resolved'[\s\S]{0,200}_is_rights_report\(target_type,\s*reason\)/i);
    const parties = fn('_notify_takedown_parties');
    expect(parties).toMatch(/unnest\(array\[t\.requester_id\]\s*\|\|\s*t\.other_requesters\)/i);
    expect(sql).toMatch(/blinded_source\s+in\s*\(\s*'auto',\s*'admin',\s*'takedown'\s*\)/i);
    expect(sql).toMatch(/ends_at\s*<=\s*created_at\s*\+\s*interval\s+'30 days'/i);
    expect(sql).not.toMatch(/is_ad\s*(=|,)\s*true|is_ad\s*:=\s*true/i);
  });

  it('공개 안내는 본문·작성자·신청인을 싣지 않고, 사유는 작성자·운영자에게만', () => {
    const body = fn('post_takedown_notice');
    // 신청인 칸은 '직권인가'(불리언) 판정에만 쓰고 값은 싣지 않는다
    expect(body).toMatch(/'ex_officio',\s*t\.requester_id\s+is\s+null/i);
    expect(body.replace(/t\.requester_id\s+is\s+null/i, '')).not.toMatch(/content|requester_id|other_requesters|author_id\s*['"]|'author'/i);
    expect(body).toMatch(/when\s+v_mine\s+or\s+public\.my_role\(\)\s+is\s+not\s+distinct\s+from\s+'admin'/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.post_takedown_notice\(uuid\)\s+to\s+anon/i);
  });

  it('기록 표는 RLS + 관리자 읽기만, 클라 쓰기 권한 없음', () => {
    expect(sql).toMatch(/alter\s+table\s+public\.post_takedowns\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.post_takedowns\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/create\s+policy\s+post_takedowns_admin_select[\s\S]{0,120}for\s+select[\s\S]{0,60}my_role\(\)\s*=\s*'admin'/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*post_takedowns[^;]*authenticated/i);
  });

  it('관리자 블라인드 토글은 임시조치 글·열린 권리침해 신고 글을 거절하고, 숨김 글 댓글 읽기·쓰기는 정책이 막는다', () => {
    const blind = fn('admin_set_post_blinded');
    expect(blind).toMatch(/blinded_source\s*=\s*'takedown'\)\s*then\s*raise\s+exception/i);
    expect(blind).toMatch(/p_blinded\s+and\s+exists[\s\S]{0,200}_is_rights_report\(target_type,\s*reason\)\)\s*then\s*raise\s+exception/i);
    // 댓글 정책은 호출자의 posts_select 를 타는 EXISTS — 비로그인이 숨김 여부를 캐물을 정의자 함수가 없다(P3 X9)
    const exists = /exists\s*\(\s*select\s+1\s+from\s+public\.community_posts\s+p\s+where\s+p\.id\s*=\s*comments\.post_id\s*\)/i;
    expect(sql.slice(sql.search(/alter\s+policy\s+comments_select/i))).toMatch(exists);
    expect(sql.slice(sql.search(/alter\s+policy\s+comments_insert/i))).toMatch(exists);
    expect(sql).not.toMatch(/post_hidden_from_me/i);
  });

  it('권리침해 신고는 옛 결정 경로가 거절하고, 같은 대상 함께 닫기에서도 빠진다(P2-1)', () => {
    const decide = fn('admin_decide_report');
    expect(decide).toMatch(/if\s+public\._is_rights_report\(r\.target_type,\s*r\.reason\)\s+then\s+raise\s+exception/i);
    expect(decide).toMatch(/status\s*=\s*'open'\s+and\s+not\s+public\._is_rights_report\(target_type,\s*reason\)/i);
    expect(fn('admin_dismiss_report')).toMatch(/_is_rights_report\(target_type,\s*reason\)\)\s*then\s*raise\s+exception/i);
    expect(fn('admin_reject_rights_request')).toMatch(/if\s+not\s+public\._is_rights_report\(r\.target_type,\s*r\.reason\)\s+then\s+raise/i);
  });

  it('권리침해 판정 문자열이 화면 사유(RIGHTS_REASON)와 같다 · 관리자 직접 UPDATE 정책도 같은 식으로 권리침해 신고를 뺀다', async () => {
    const { RIGHTS_REASON } = await import('./reports');
    expect(fn('_is_rights_report')).toContain(`starts_with(coalesce(p_reason, ''), '${RIGHTS_REASON}')`);
    const pol = sql.slice(sql.search(/alter\s+policy\s+reports_admin_update/i));
    const stmt = pol.slice(0, pol.indexOf(';'));
    expect(stmt.split(`starts_with(coalesce(reason, ''), '${RIGHTS_REASON}')`).length - 1, 'using·with check 둘 다').toBe(2);
    expect(stmt).toMatch(/using\s*\([\s\S]*with\s+check\s*\(/i);
  });

  it('다시 게시는 임시조치 전 숨김으로 되돌린다(P1-1) · 삭제는 이미지 파일을 삭제 큐로(P2-3, 큐 없으면 건너뜀)', () => {
    const body = fn('admin_decide_takedown');
    expect(body).toMatch(/set\s+blinded\s*=\s*t\.prev_blinded,\s*blinded_source\s*=\s*case\s+when\s+t\.prev_blinded\s+then\s+t\.prev_blinded_source\s+end/i);
    expect(fn('admin_takedown_post')).toMatch(/coalesce\(v_prev_blinded,\s*false\)/i);
    expect(body).toMatch(/if\s+to_regclass\('public\.storage_purge_queue'\)\s+is\s+not\s+null[\s\S]{0,300}insert\s+into\s+public\.storage_purge_queue/i);
    expect(body).toMatch(/'community_images'/);
  });

  it('기간 만료: 자동 공개·삭제 없이 매일 한 번 통지(중복 없음) · 작성자 자진 삭제는 author_deleted 로 종결', () => {
    const cron = fn('cron_takedown_expiry');
    expect(cron).toMatch(/expiry_notified_at\s+is\s+null/i);
    expect(cron).toMatch(/set\s+expiry_notified_at\s*=\s*now\(\)/i);
    expect(cron).not.toMatch(/blinded\s*=\s*false|delete\s+from/i);
    expect(sql).toMatch(/cron\.schedule\('takedown-expiry',\s*'0 1 \* \* \*'/);
    // 관리자는 하루 한 통(건수 요약) — 건마다 보내던 루프 안 통지가 돌아오지 않게
    expect(cron).toMatch(/if\s+n\s*>\s*0\s+then[\s\S]{0,400}새로 끝난 게시물 %s건/);
    const del = fn('_post_takedown_on_delete');
    expect(del).toMatch(/'author_deleted'/);
    // 재반증 ⑦: 어떤 경로로 지워져도 당사자 통지 + 열린 권리침해 신고 종결·통지
    expect(del).toMatch(/_notify_takedown_parties\(t\.id,/);
    expect(del).toMatch(/update\s+public\.reports\s+set\s+status\s*=\s*'resolved'[\s\S]{0,200}_is_rights_report\(target_type,\s*reason\)/i);
    // 임시조치 '삭제' 판단은 지우기 전에 기록을 먼저 종결한다 → 트리거가 다시 통지하지 않는다
    const decideBody = fn('admin_decide_takedown');
    expect(decideBody.indexOf("set status = 'removed'")).toBeGreaterThan(-1);
    expect(decideBody.indexOf("set status = 'removed'")).toBeLessThan(decideBody.indexOf('delete from public.community_posts'));
    expect(sql).toMatch(/create\s+trigger\s+trg_post_takedown_on_delete\s+before\s+delete\s+on\s+public\.community_posts/i);
  });

  it('리허설이 음성(제3자·비로그인 댓글 0)·양성(작성자·운영자)·통지 건수를 보고 ZZ999 로 되돌린다', () => {
    const reh = read('supabase/tests/20261006t_rehearsal.sql');
    expect(reh).toMatch(/errcode\s*=\s*'ZZ999'/);
    expect(reh).toMatch(/N2[\s\S]*from public\.comments where post_id = v_post/);
    expect(reh).toMatch(/notified'\)::int = 2/);
  });
});

describe('화면 계약', () => {
  it('신고 화면: 권리침해 사유는 게시글에서만, 소명 최소 길이를 막는다', () => {
    const modal = strip(read('src/components/features/ReportModal.tsx'));
    expect(modal).toMatch(/target\?\.type\s*===\s*'post'\s*\?\s*\[\.\.\.REASONS,\s*RIGHTS_REASON\]/);
    expect(modal).toMatch(/rights\s*&&\s*detail\.trim\(\)\.length\s*<\s*RIGHTS_MIN_DETAIL/);
    // 재측정 r2: 버튼 줄은 시트 하단 고정(360×640·740 에서 접힘선 아래였다) — 크기별 실측은 e2e post-takedown
    expect(modal).toMatch(/className="sticky bottom-0[^"]*bg-surface-mid[^"]*" data-testid="report-actions"/);
  });

  it('상세: 임시조치 글은 전용 안내(누구에게나)로, 관리자 숨김 해제 배너는 임시조치에 뜨지 않는다', () => {
    const d = strip(read('src/components/features/PostDetailModal.tsx'));
    expect(d).toMatch(/post\.blindedSource\s*===\s*'takedown'\s*&&\s*<PostTakedownNotice/);
    expect(d).toMatch(/post\.blinded\s*&&\s*post\.blindedSource\s*!==\s*'takedown'\s*&&/);
    const n = strip(read('src/components/features/PostTakedownNotice.tsx'));
    expect(n).toMatch(/권리침해 신고로 임시조치된 게시물입니다/);
    expect(n).toMatch(/운영 정책에 따라 임시조치된 게시물입니다/);   // 직권(§44의3) 문구
    // 화면 검토 A: 다크 danger/6 면 위 제목 대비 — text-danger(#FF6B7D) 4.47 < 4.5 → text-danger-light(#FF8AA1 · 라이트 #B82640)
    expect(n).toMatch(/text-xs font-bold text-danger-light" data-testid="post-takedown-headline"/);
    expect(n).toMatch(/requestTakedownReview\(/);
  });

  it('신고 큐: 임시조치 실행은 takedownPost, 목록은 TakedownList(decideTakedown) — 표 직접 쓰기 없음', () => {
    const q = strip(read('src/components/features/ReportQueue.tsx'));
    const l = strip(read('src/components/features/TakedownList.tsx'));
    expect(q).toMatch(/takedownPost\(r\.targetId,\s*why,\s*r\.id\)/);
    expect(q).toMatch(/rejectRightsRequest\(r\.id,\s*why\)/);
    // 권리침해 신고 행에는 옛 처리 버튼(기각·삭제·정지·처리 완료·블라인드)을 그리지 않는다(P2-1)
    for (const id of ['report-dismiss', 'report-resolve']) {
      expect(q).toMatch(new RegExp(`\\{!rights && \\(\\s*<button[^>]*data-testid="${id}"`));
    }
    expect(q).toMatch(/\{!rights && deletable && \(/);
    expect(q).toMatch(/\{!rights && canSuspend && \(/);
    expect(q).toMatch(/r\.targetId && !rights && \(\s*<button[^>]*onClick=\{\(\) => blind\(r\)\}/);
    expect(q).toMatch(/<TakedownList/);
    expect(l).toMatch(/decideTakedown\(/);
    for (const s of [q, l]) expect(s).not.toMatch(/from\(\s*'(post_takedowns|community_posts)'\s*\)\s*\.(update|insert|delete)/);
  });
});

describe('takedownStateLabel — 30일 뒤 상태', () => {
  it('가림 중 D-n · 기간 만료 판단 필요 · 가림 유지', async () => {
    const { takedownStateLabel } = await import('./reports');
    const now = Date.parse('2026-10-06T00:00:00Z');
    expect(takedownStateLabel({ status: 'active', endsAt: '2026-10-16T00:00:00Z' }, now)).toBe('임시조치 중 · D-10');
    expect(takedownStateLabel({ status: 'active', endsAt: '2026-10-05T00:00:00Z' }, now)).toBe('기간 만료 — 판단 필요');
    expect(takedownStateLabel({ status: 'kept', endsAt: '2026-10-05T00:00:00Z' }, now)).toBe('가림 유지');
  });
});
