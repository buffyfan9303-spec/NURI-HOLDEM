// 신고 정책 계약 (오너 10-02 · 20261002a)
//   "신고가 들어와도 글을 가리지 말고, 관리자가 보고 기각 · 글 삭제 · 유저 정지 중에서 정한다."
//
// 이 테스트가 잡는 회귀
//   ① 화면이 신고 표를 직접 update 하거나 기각에서 admin_set_post_blinded(false) 를 부르는 옛 경로(점검 L-02)로 돌아가는 것
//   ② 관리자 결정이 서버 RPC admin_decide_report 를 거치지 않는 것
//   ③ 마이그레이션이 자동 가림 트리거를 지우지 않거나, 뒤 마이그레이션이 reports 에 가림 트리거를 다시 다는 것
//   ④ 결정 RPC 가 관리자 검사(NULL-safe)·SECURITY DEFINER·search_path·PUBLIC/anon 회수 없이 열리는 것
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const calls: { kind: string; name: string; args?: unknown }[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: { closed: 2, deleted: false, suspended_user: null }, error: null };

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: async (name: string, args: unknown) => { calls.push({ kind: 'rpc', name, args }); return rpcResult; },
    from: (name: string) => { calls.push({ kind: 'from', name }); throw new Error(`표 직접 접근 금지: ${name}`); },
    functions: { invoke: async (name: string, args: unknown) => { calls.push({ kind: 'fn', name, args }); return { data: { sent: true } }; } },
  },
}));

const ROOT = join(__dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const sqlCode = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

describe('decideReport — 관리자 결정은 RPC 한 번', () => {
  beforeEach(() => { calls.length = 0; rpcResult = { data: { closed: 2, deleted: false, suspended_user: null }, error: null }; });

  it('기각: admin_decide_report 만 부르고 신고 표·가림 해제를 건드리지 않는다', async () => {
    const { decideReport } = await import('./reports');
    const res = await decideReport('r1', 'dismiss');
    expect(calls).toEqual([{ kind: 'rpc', name: 'admin_decide_report', args: {
      p_report_id: 'r1', p_action: 'dismiss', p_include_same_target: true,
      p_delete_content: false, p_suspend_days: null, p_reason: null,
    } }]);
    expect(res.closed).toBe(2);
  });

  it('이 신고만 처리 · 글 삭제 옵션이 그대로 실린다', async () => {
    const { decideReport } = await import('./reports');
    await decideReport('r2', 'delete', { includeSameTarget: false });
    expect(calls[0]).toMatchObject({ name: 'admin_decide_report', args: { p_action: 'delete', p_include_same_target: false } });
    expect(calls.some((c) => c.name === 'admin_set_post_blinded')).toBe(false);
  });

  it('정지: 기간·사유·글 삭제를 싣고, 정지된 작성자에게 기존 제재 메일(notify-sanction)을 보낸다', async () => {
    // 서버가 정한 만료일(더 긴 기존 정지가 남은 경우 포함)을 메일에 그대로 싣는다
    rpcResult = { data: { closed: 1, deleted: true, suspended_user: 'u9', suspended_until: '2026-10-30T00:00:00Z' }, error: null };
    const { decideReport } = await import('./reports');
    const res = await decideReport('r3', 'suspend', { suspendDays: 7, reason: '욕설', deleteContent: true });
    expect(calls[0]).toMatchObject({ name: 'admin_decide_report', args: { p_action: 'suspend', p_suspend_days: 7, p_reason: '욕설', p_delete_content: true } });
    expect(calls[1]).toMatchObject({ kind: 'fn', name: 'notify-sanction', args: { body: { userId: 'u9', status: 'suspended', reason: '욕설', suspendedUntil: '2026-10-30T00:00:00Z' } } });
    expect(res.mailSent).toBe(true);
  });

  it('서버 거절 문장은 그대로 올라온다(운영자만 가능합니다)', async () => {
    rpcResult = { data: null, error: { code: 'P0001', message: '운영자만 가능합니다' } };
    const { decideReport } = await import('./reports');
    await expect(decideReport('r4', 'dismiss')).rejects.toThrow('운영자만 가능합니다');
  });
});

describe('소스 계약 — 옛 경로가 돌아오지 않는다', () => {
  const api = strip(readFileSync(join(ROOT, 'src/api/reports.ts'), 'utf-8'));
  const queue = strip(readFileSync(join(ROOT, 'src/components/features/ReportQueue.tsx'), 'utf-8'));

  it('reports.ts 는 신고 표를 update 하지 않고, 가림 해제를 부르지 않는다', () => {
    expect(api).toMatch(/rpc\(\s*'admin_decide_report'/);
    expect(api).not.toMatch(/from\(\s*'reports'\s*\)\s*\.update/);
    expect(api).not.toMatch(/admin_set_post_blinded|admin_dismiss_report/);
  });

  it('신고 대기 화면의 결정 버튼은 decideReport 로만 간다', () => {
    expect(queue).toMatch(/decideReport\(/);
    expect(queue).not.toMatch(/updateReportStatus|from\(\s*'reports'/);
    for (const a of ['dismiss', 'delete', 'suspend', 'resolve']) expect(queue).toMatch(new RegExp(`'${a}'`));
  });

  it('신고 접수(ReportModal)는 글을 닫거나 숨기지 않는다 — 접수 안내만', () => {
    const modal = strip(readFileSync(join(ROOT, 'src/components/features/ReportModal.tsx'), 'utf-8'));
    expect(modal).toMatch(/신고가 접수되었습니다/);
    expect(modal).not.toMatch(/blinded|adminSetPostBlinded|hidePost|removePost/);
  });
});

describe('20261002a 마이그레이션 계약', () => {
  const DIR = join(ROOT, 'supabase', 'migrations');
  const FILE = '20261002a_report_admin_decides.sql';
  const sql = sqlCode(readFileSync(join(DIR, FILE), 'utf-8'));

  it('자동 가림 트리거와 함수를 지운다', () => {
    expect(sql).toMatch(/drop\s+trigger\s+if\s+exists\s+trg_auto_blind_reported_post\s+on\s+public\.reports/i);
    expect(sql).toMatch(/drop\s+function\s+if\s+exists\s+public\.auto_blind_reported_post\(\)/i);
  });

  it('결정 RPC: NULL-safe 관리자 검사 · SECURITY DEFINER · search_path · PUBLIC/anon 회수', () => {
    const body = sql.slice(sql.search(/create\s+or\s+replace\s+function\s+public\.admin_decide_report/i));
    expect(body).toMatch(/my_role\(\)\s+is\s+distinct\s+from\s+'admin'/i);
    expect(body).toMatch(/security\s+definer/i);
    expect(body).toMatch(/set\s+search_path\s+to\s+'public',\s*'pg_temp'/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.admin_decide_report\([^)]*\)\s+from\s+public,\s*anon/i);
  });

  it('공개 복원은 백업 표와 건수 게이트를 거친다', () => {
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\._bk_20261002a_unblinded/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\._bk_20261002a_unblinded\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/c_expected_auto[\s\S]*c_expected_unknown[\s\S]*raise\s+exception/i);
  });

  // 검토 T11(2026-10-02): 신고자가 reports.target_owner_id 에 아무 회원이나 적으면 그 회원이 정지됐다.
  const rpcBody = () => {
    const from = sql.search(/create\s+or\s+replace\s+function\s+public\.admin_decide_report/i);
    const to = sql.indexOf('$function$;', from);
    expect(from, 'admin_decide_report 정의가 없다').toBeGreaterThan(-1);
    return sql.slice(from, to);
  };

  it('reports 에 BEFORE INSERT 트리거가 있고, 작성자 칸을 서버 판정기로 덮는다', () => {
    expect(sql).toMatch(/create\s+trigger\s+trg_reports_server_fields\s+before\s+insert\s+on\s+public\.reports\s+for\s+each\s+row\s+execute\s+function\s+public\._reports_server_fields\(\)/i);
    const fn = sql.slice(sql.search(/create\s+or\s+replace\s+function\s+public\._reports_server_fields/i));
    expect(fn.slice(0, fn.indexOf('$function$;'))).toMatch(/new\.target_owner_id\s*:=\s*public\._report_target_owner\(\s*new\.target_type\s*,\s*new\.target_id\s*\)/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\._report_target_owner\(text,\s*uuid\)\s+from\s+public,\s*anon,\s*authenticated/i);
  });

  it('admin_decide_report 는 target_owner_id 칸을 믿지 않는다 — 정지 대상은 원문 판정기로', () => {
    const body = rpcBody();
    expect(body).not.toMatch(/target_owner_id/i);
    expect(body).toMatch(/v_user\s*:=\s*public\._report_target_owner\(\s*r\.target_type\s*,\s*r\.target_id\s*\)/i);
  });

  it('정지는 더 긴 제재를 줄이지 않고(T13), 승인 대기 회원을 정지하지 않는다(T15)', () => {
    const body = rpcBody();
    expect(body).toMatch(/v_user_status\s*=\s*'banned'[\s\S]*raise\s+exception\s+'이미 영구/i);
    expect(body).toMatch(/greatest\(\s*v_user_until\s*,/i);
    expect(body).toMatch(/not\s+in\s*\(\s*'active',\s*'suspended',\s*'banned'\s*\)[\s\S]{0,40}raise\s+exception\s+'승인 대기/i);
  });

  it('기존 행 백필은 백업 표 + 건수 게이트를 거친다', () => {
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\._bk_20261002a_report_owner/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\._bk_20261002a_report_owner\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/c_expected_mismatch\s+constant\s+int\s*:=\s*0[\s\S]*raise\s+exception/i);
  });

  it('뒤 마이그레이션이 reports 에 글을 가리는 트리거를 다시 달지 않는다', () => {
    const re = /create\s+(or\s+replace\s+)?trigger[^;]*\bon\s+(public\.)?reports\b/i;
    // 판정기 자체 확인(음성): 옛 트리거 문장은 잡는다
    expect(re.test('create trigger trg_auto_blind_reported_post after insert on public.reports for each row')).toBe(true);
    const bad = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f > FILE)
      .filter((f) => re.test(sqlCode(readFileSync(join(DIR, f), 'utf-8'))));
    expect(bad, 'reports 에 트리거를 다는 뒤 마이그레이션').toEqual([]);
  });
});
