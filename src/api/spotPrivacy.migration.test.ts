// src/api/spotPrivacy.migration.test.ts
//
// 공유 스팟의 **서버 가림 계약**을 CI 에 고정한다 (명세 2026-09-22 §2.8).
//
// 🔴 이 파일이 하는 일과 안 하는 일
//   한다  : `supabase/migrations/20260922a_spot_hide_action_size.sql` 의 최소 계약이 사라지면 빨개진다.
//   안 한다: DB 행동 검증. 그건 라이브 롤백 리허설이 했다(T1~T9, 2026-09-22 · 마이그레이션 머리말 참고).
//           여기서 초록이어도 "라이브가 그렇게 동작한다" 는 뜻이 **아니다**.
//
// ⚠ 이 부류 테스트의 진짜 위험은 실패가 아니라 **거짓 통과**다.
//   파일 경로가 바뀌거나 정규식이 빗나가면 검사 대상이 0개가 되어 조용히 초록이 된다.
//   그래서 계약을 보기 **전에** 파일이 있고 앵커가 있는지부터 단언한다.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL_PATH = resolve(__dirname, '../../supabase/migrations/20260922a_spot_hide_action_size.sql');
const LEGACY_PATH = resolve(__dirname, '../../supabase/migrations/20260913b_post_spots_analysis_private.sql');

/** 주석(`-- …`)을 같은 길이의 공백으로 지운 SQL. 설명문에 적힌 글자가 계약을 거짓 통과시키지 않게 한다. */
function codeOnly(sql: string): string {
  return sql.split('\n').map((line) => {
    const i = line.indexOf('--');
    return i < 0 ? line : line.slice(0, i);
  }).join('\n');
}

describe('20260922a — 공유 스팟 서버 가림 계약', () => {
  it('마이그레이션 파일이 있고 두 함수를 모두 정의한다 (앵커 — 이게 깨지면 아래 검사는 전부 무의미하다)', () => {
    expect(existsSync(SQL_PATH), `${SQL_PATH} 가 없다`).toBe(true);
    const code = codeOnly(readFileSync(SQL_PATH, 'utf8'));
    expect(code).toMatch(/create or replace function public\.share_spot_post/i);
    expect(code).toMatch(/create or replace function public\.reveal_post_spot/i);
    // 주석을 지운 뒤에도 본문이 남아 있어야 한다 — 파일 전체가 주석이면 위 검사도 통과해 버린다.
    expect(code.replace(/\s/g, '').length).toBeGreaterThan(1500);
  });

  const code = () => codeOnly(readFileSync(SQL_PATH, 'utf8'));

  it('조작된 와이어의 `extra` 를 SPOT_WIRE_INVALID 로 거부한다', () => {
    // 공식 v3 와이어(src/lib/spot.ts toJSON)는 상대 카드를 전부 최상위 villain 에 싣고 자리만 extraPos 로 보낸다.
    // 즉 extra 가 오는 것은 정상 앱 경로가 아니다 — 카드가 공개 spot 에 실릴 수 있으므로 막는다.
    expect(code()).toMatch(/if\s+p_spot\s*\?\s*'extra'\s+then[\s\S]{0,200}?SPOT_WIRE_INVALID/i);
  });

  it('공개 spot 에서 villain·result·heroAction·heroActionSizeBb 를 모두 뺀다', () => {
    const m = code().match(/v_spot\s*:=\s*p_spot((\s*-\s*'[A-Za-z]+')+)\s*;/);
    expect(m, 'v_spot := p_spot - … 형태를 찾지 못했다').not.toBeNull();
    const stripped = [...m![1].matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]).sort();
    expect(stripped).toEqual(['heroAction', 'heroActionSizeBb', 'result', 'villain']);
  });

  it('hidden_action 을 heroAction + heroActionSizeBb object 로 저장한다', () => {
    const c = code();
    expect(c).toMatch(/v_hidden_action\s*:=\s*jsonb_strip_nulls\s*\(\s*jsonb_build_object\s*\(/i);
    expect(c).toMatch(/'heroAction'\s*,\s*p_spot\s*->\s*'heroAction'/);
    expect(c).toMatch(/'heroActionSizeBb'\s*,\s*p_spot\s*->\s*'heroActionSizeBb'/);
  });

  it('reveal 은 object 와 legacy scalar 두 분기를 모두 가진다 (기존 게시글이 깨지면 안 된다)', () => {
    const c = code();
    expect(c, 'object 분기 없음').toMatch(/jsonb_typeof\s*\(\s*hidden_action\s*\)\s*=\s*'object'/i);
    expect(c, 'legacy scalar 분기 없음').toMatch(/jsonb_build_object\s*\(\s*'heroAction'\s*,\s*hidden_action\s*\)/i);
  });

  it('두 RPC 를 PUBLIC·anon 에서 회수하고 authenticated·service_role 에만 부여한다', () => {
    const c = code().toLowerCase();
    for (const fn of ['share_spot_post', 'reveal_post_spot']) {
      // `revoke ... from anon` 만으로는 무효다 — PUBLIC 기본 GRANT 때문에 반드시 from public 이어야 한다.
      const revoke = new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from [^;]*public`, 'i');
      const grant = new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to [^;]*authenticated`, 'i');
      expect(c, `${fn}: revoke ... from public 이 없다`).toMatch(revoke);
      expect(c, `${fn}: grant ... to authenticated 가 없다`).toMatch(grant);
      expect(c, `${fn}: service_role grant 가 없다`).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to [^;]*service_role`, 'i'));
    }
  });

  // 🔴 여기부터 3개는 **이 마이그레이션이 새로 넣은 것이 아니라 물려받은 보증**이다.
  //    20260922a 는 두 함수를 통째로 재작성한다. 새로 넣은 것만 고정하면 재작성 과정에서
  //    20260911d 이래의 보증이 사라져도 전부 초록이 된다(2026-09-22 독립 검토가 실제로 재현했다).
  it('reveal 의 작성자 검사가 살아 있다 — 지우면 fail-open 이다', () => {
    // reveal_post_spot 은 SECURITY DEFINER 라 RLS 를 우회한다. 이 검사가 **유일한** 인가 게이트다.
    // 지우면 아무 로그인 사용자나 남의 글의 상대 카드·결과를 열 수 있다.
    const reveal = code().slice(code().indexOf('function public.reveal_post_spot'));
    expect(reveal, 'NOT_AUTHOR 가 없다').toMatch(/NOT_AUTHOR/);
    expect(reveal, 'auth.uid() 로 호출자를 확인하지 않는다').toMatch(/auth\.uid\(\)/);
    expect(reveal, '작성자 일치 조건이 없다').toMatch(/community_posts[\s\S]{0,200}?user_id\s*=\s*v_user/);
  });

  it('share 의 로그인 검사가 살아 있다', () => {
    const share = code().slice(code().indexOf('function public.share_spot_post'), code().indexOf('function public.reveal_post_spot'));
    expect(share).toMatch(/AUTH_REQUIRED/);
    expect(share).toMatch(/auth\.uid\(\)/);
  });

  it('상대 카드·결과를 hidden_* 에 실제로 저장하고 복원한다 (되돌릴 수 없는 소실 방지)', () => {
    // share 가 hidden_villain 에 안 쓰면: 공개 spot 에서는 빠지고 hidden 에도 안 들어가
    // 상대 카드가 **어디에도 남지 않는다.** 작성자가 열어도 복원할 수 없다.
    const c = code();
    const share = c.slice(c.indexOf('function public.share_spot_post'), c.indexOf('function public.reveal_post_spot'));
    const reveal = c.slice(c.indexOf('function public.reveal_post_spot'));
    for (const col of ['hidden_villain', 'hidden_result', 'hidden_action']) {
      expect(share, `share 가 ${col} 에 쓰지 않는다`).toMatch(new RegExp(col));
      expect(reveal, `reveal 이 ${col} 을 복원하지 않는다`).toMatch(new RegExp(col));
    }
    // INSERT 의 값 목록에 원본이 실제로 실리는지 (컬럼명만 적고 값을 안 넣는 형태를 막는다)
    expect(share, 'hidden_villain 에 넣을 값이 없다').toMatch(/p_spot\s*->\s*'villain'/);
    expect(share, 'hidden_result 에 넣을 값이 없다').toMatch(/p_spot\s*->\s*'result'/);
  });

  it('두 함수 모두 SECURITY DEFINER + search_path 고정을 유지한다', () => {
    const c = code();
    expect(c.match(/security definer/gi) ?? []).toHaveLength(2);
    expect(c.match(/set search_path\s*=\s*public,\s*pg_temp/gi) ?? []).toHaveLength(2);
  });

  it('운영 P1 회귀 방지 — enum 컬럼에 text 를 넣지 않는다 (SQLSTATE 42804)', () => {
    // 2026-09-22 실측: 라이브 share_spot_post 가 `v_role text` 를 enum user_role 컬럼에 INSERT 해
    // 첫 호출에서 42804 로 죽었다. plpgsql 은 실행 시점에 계획되므로 이 결함은 함수 생성 때 드러나지 않는다.
    const c = code();
    expect(c, 'p.role::text 가 돌아왔다').not.toMatch(/p\.role::text/);
    expect(c, 'v_role 이 enum 으로 선언되지 않았다').toMatch(/v_role\s+public\.user_role\s*;/);
    expect(c, 'category 를 post_category 로 캐스트하지 않는다').toMatch(/::public\.post_category/);
  });

  it('드리프트 정리는 미공개 행만 건드리고 값을 hidden 으로 옮긴다', () => {
    const c = code();
    const m = c.match(/update public\.post_spots[\s\S]*?where\s+reveal_result\s*=\s*false\s+and\s+spot\s*\?\s*'heroActionSizeBb'\s*;/i);
    expect(m, '드리프트 UPDATE 의 where 절이 미공개 행으로 한정되지 않았다').not.toBeNull();
    // 값을 버리지 않는다 — 같은 UPDATE 안에서 hidden_action 에 옮기고 spot 에서만 뺀다.
    expect(m![0]).toMatch(/hidden_action\s*=/);
    expect(m![0]).toMatch(/spot\s*=\s*spot\s*-\s*'heroActionSizeBb'/);
  });

  // 🔴 와이어(TS)와 가림 목록(SQL)을 잇는 계약. 2026-09-22 독립 검토가 지적한 **근본 원인**이다 —
  //    `heroActionSizeBb` 가 늦게 발견된 이유는 두 정본이 서로를 몰랐기 때문이다.
  //    "이 키가 스포일러인가" 를 자동으로 판정할 수는 없다. 대신 toJSON 이 내는 키 **집합 전체**를 고정해
  //    누가 키를 더하면 여기서 빨개지게 하고, 그때 사람이 "공개" 인지 "가릴 것" 인지 분류하게 만든다.
  it('toJSON 이 내는 키를 전부 분류해 둔다 — 새 키가 생기면 여기서 막힌다', () => {
    const src = readFileSync(resolve(__dirname, '../lib/spot.ts'), 'utf8');
    const start = src.indexOf('export function toJSON');
    expect(start, 'src/lib/spot.ts 에서 toJSON 을 찾지 못했다').toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\nexport ', start + 10));
    expect(body.length, 'toJSON 본문이 비었다 — 아래 검사가 무의미해진다').toBeGreaterThan(400);

    // 와이어에 실리는 키: 객체 리터럴의 `key:` 와 나중에 붙이는 `o.key =` 두 형태.
    const keys = new Set<string>();
    for (const m of body.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*):/gm)) keys.add(m[1]);
    for (const m of body.matchAll(/\bo\.([a-zA-Z][a-zA-Z0-9]*)\s*=/g)) keys.add(m[1]);

    // 공유 시 서버가 **반드시 빼야 하는** 키. 여기 있는 것은 SQL deny-list 와 일치해야 한다.
    const SPOILER = ['villain', 'result', 'heroAction', 'heroActionSizeBb'];
    // 공개돼도 되는 키. 왜 괜찮은지는 20260922a 머리말과 검토 기록에 있다
    // (note 는 공유 시트에서 사용자가 편집한 값으로 갈아끼운다, actions 는 결정 지점 **이전** 액션,
    //  potBbInput 은 선택 액션을 포함하지 않아 역산 불가, extraPos 는 자리 문자열뿐).
    const PUBLIC = ['v', 'game', 'format', 'tableSize', 'sbBb', 'anteBb', 'effectiveBb',
      'heroPos', 'villainPos', 'hero', 'board', 'street', 'actions', 'extraPos', 'potBbInput', 'note'];

    const classified = new Set([...SPOILER, ...PUBLIC]);
    const unknown = [...keys].filter((k) => !classified.has(k));
    expect(unknown,
      `toJSON 에 분류되지 않은 키가 생겼다: ${unknown.join(', ')}\n` +
      '  → 스포일러면 20260922a 의 `v_spot := p_spot - …` 목록과 아래 SPOILER 에 같이 넣어라.\n' +
      '  → 공개해도 되면 PUBLIC 에 넣고 왜 괜찮은지 근거를 남겨라.',
    ).toEqual([]);

    // SPOILER 가 실제로 toJSON 에 존재해야 한다 — 이름이 바뀌면 SQL 이 허공을 빼게 된다.
    for (const k of SPOILER) {
      expect(keys.has(k), `toJSON 에 '${k}' 가 없다 — SQL 이 존재하지 않는 키를 빼고 있다`).toBe(true);
    }
    // 그리고 SQL 의 deny-list 와 정확히 같아야 한다.
    const m = code().match(/v_spot\s*:=\s*p_spot((\s*-\s*'[A-Za-z]+')+)\s*;/);
    const stripped = [...m![1].matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]).sort();
    expect(stripped, 'SQL 가림 목록과 TS 스포일러 분류가 어긋났다').toEqual([...SPOILER].sort());
  });

  it('20260913b 를 재적용하지 않는다 (이미 라이브 적용됨 — 2026-09-22 ACL 실측)', () => {
    const c = code();
    expect(c).not.toMatch(/revoke[\s\S]{0,120}post_spots/i);
    expect(c).not.toMatch(/grant\s+select[\s\S]{0,120}post_spots/i);
  });
});

describe('20260913b — 적용 상태 기록이 사실과 맞아야 한다', () => {
  it('머리말이 더 이상 "아직 적용하지 않았다" 라고 말하지 않는다', () => {
    expect(existsSync(LEGACY_PATH), `${LEGACY_PATH} 가 없다`).toBe(true);
    const head = readFileSync(LEGACY_PATH, 'utf8').split('\n').slice(0, 40).join('\n');
    // 왜 고정하나: 머리말이 곧 적용 상태의 정본이다. stale 하면 다음 사람이 '적용 안 된 줄 알고' 다시 적용한다.
    expect(head, '머리말이 아직 미적용이라고 주장한다').not.toMatch(/아직\s*\*{0,2}적용하지\s*않았다/);
    expect(head, '적용 완료 표기가 없다').toMatch(/✅/);
  });
});
