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

  it('이의제기·판단도 RPC 로만 간다', async () => {
    const { requestTakedownReview, decideTakedown } = await import('./reports');
    await requestTakedownReview('p1', '사실에 근거한 후기입니다');
    await decideTakedown('t1', 'keep', '  침해 소명 타당  ');
    expect(calls).toEqual([
      { kind: 'rpc', name: 'request_post_takedown_review', args: { p_post_id: 'p1', p_text: '사실에 근거한 후기입니다' } },
      { kind: 'rpc', name: 'admin_decide_takedown', args: { p_takedown_id: 't1', p_action: 'keep', p_note: '침해 소명 타당' } },
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
    for (const [name, sig] of [['admin_takedown_post', 'uuid, text, uuid'], ['admin_decide_takedown', 'uuid, text, text']] as const) {
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

  it('가림은 서버 숨김(blinded + 출처 takedown) · 30일 · 통지 2건(작성자·신청인) · 광고 표지 없음', () => {
    const body = fn('admin_takedown_post');
    expect(body).toMatch(/set\s+blinded\s*=\s*true,\s*blinded_source\s*=\s*'takedown'/i);
    expect(body).toMatch(/interval\s+'30 days'/i);
    expect(body.match(/_notify_user\(/g)?.length).toBe(2);
    expect(sql).toMatch(/blinded_source\s+in\s*\(\s*'auto',\s*'admin',\s*'takedown'\s*\)/i);
    expect(sql).toMatch(/ends_at\s*<=\s*created_at\s*\+\s*interval\s+'30 days'/i);
    expect(sql).not.toMatch(/is_ad\s*(=|,)\s*true|is_ad\s*:=\s*true/i);
  });

  it('공개 안내는 본문·작성자·신청인을 싣지 않고, 사유는 작성자·운영자에게만', () => {
    const body = fn('post_takedown_notice');
    expect(body).not.toMatch(/content|requester_id|author_id\s*['"]|'author'/i);
    expect(body).toMatch(/when\s+v_mine\s+or\s+public\.my_role\(\)\s+is\s+not\s+distinct\s+from\s+'admin'/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.post_takedown_notice\(uuid\)\s+to\s+anon/i);
  });

  it('기록 표는 RLS + 관리자 읽기만, 클라 쓰기 권한 없음', () => {
    expect(sql).toMatch(/alter\s+table\s+public\.post_takedowns\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.post_takedowns\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/create\s+policy\s+post_takedowns_admin_select[\s\S]{0,120}for\s+select[\s\S]{0,60}my_role\(\)\s*=\s*'admin'/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*post_takedowns[^;]*authenticated/i);
  });

  it('관리자 블라인드 토글은 임시조치 글을 거절하고, 숨김 글 댓글은 정책이 가린다', () => {
    expect(fn('admin_set_post_blinded')).toMatch(/blinded_source\s*=\s*'takedown'\)\s*then\s*raise\s+exception/i);
    expect(sql).toMatch(/alter\s+policy\s+comments_select[\s\S]*not\s+public\.post_hidden_from_me\(post_id\)/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.post_hidden_from_me\(uuid\)\s+to\s+anon,\s*authenticated/i);
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
  });

  it('상세: 임시조치 글은 전용 안내(누구에게나)로, 관리자 숨김 해제 배너는 임시조치에 뜨지 않는다', () => {
    const d = strip(read('src/components/features/PostDetailModal.tsx'));
    expect(d).toMatch(/post\.blindedSource\s*===\s*'takedown'\s*&&\s*<PostTakedownNotice/);
    expect(d).toMatch(/post\.blinded\s*&&\s*post\.blindedSource\s*!==\s*'takedown'\s*&&/);
    const n = strip(read('src/components/features/PostTakedownNotice.tsx'));
    expect(n).toMatch(/권리침해 신고로 임시조치된 게시물입니다/);
    expect(n).toMatch(/requestTakedownReview\(/);
  });

  it('신고 큐: 임시조치 실행은 takedownPost, 목록은 TakedownList(decideTakedown) — 표 직접 쓰기 없음', () => {
    const q = strip(read('src/components/features/ReportQueue.tsx'));
    const l = strip(read('src/components/features/TakedownList.tsx'));
    expect(q).toMatch(/takedownPost\(r\.targetId,\s*why,\s*r\.id\)/);
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
