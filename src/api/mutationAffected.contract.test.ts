// 소스 계약 — "사용자에게 성공을 알리는 변이는 영향 행수를 확인한다" (2026-09-13)
//
// 왜 계약인가: 같은 결함이 두 번 났다. ① approveOwner(2026-09-12) ② deletePost(F15, 2026-09-13).
//   PostgREST 는 RLS 가 막은 UPDATE/DELETE 를 오류가 아니라 **0행 200** 으로 돌려주고, `.select()` 없이 쓰면
//   클라이언트는 성공으로 읽는다. 개별 테스트는 그 함수만 지킨다 — **다음에 새로 추가되는 변이**는 못 막는다.
//   그래서 src/api/** 의 `.update(`·`.delete(` **전수**를 훑어, 하나하나가
//     (a) `mustAffect(…)` 통로(_mustAffect.ts)를 타거나
//     (b) `.select(…)` 뒤에 `.single()` / `data.length === 0` 검사를 두거나(선례: reports·crm·reservations·staffSchedule·auth)
//     (c) 아래 ALLOW 에 **사유와 함께** 올라 있어야
//   한다고 못 박는다. 새 변이를 (a)(b) 없이 추가하면 여기서 걸리고, ALLOW 에 올리려면 사유를 써야 한다.
//
// 범위 밖(왜 안 보나):
//   · `.insert(`  — RLS WITH CHECK 위반은 42501 **오류**로 온다. 조용한 0행이 없다.
//   · `.upsert(`  — INSERT 경로는 위와 같고, ON CONFLICT DO UPDATE 경로는 기존 행이 UPDATE 정책 USING 을 못 넘으면
//                   Postgres 가 **오류를 낸다**(일반 UPDATE 처럼 건너뛰지 않는다). 역시 조용한 0행이 없다.
//   · `supabase.rpc(` — 서버 함수가 raise 하면 error 가 온다. 다른 부류다.
//
// 이 계약의 한계(정직하게): 정규식은 "그 문장이 있는가" 만 본다 — mustAffect 가 **실제로 던지는지**, 호출부가
//   그 throw 를 **받아서 화면을 되돌리는지** 는 못 본다. 도달은 mustAffect.test.ts · community.deletePost.test.ts ·
//   clock.clearState.test.ts 가 mock 으로 본다. 그래서 여기서는 대신
//   ① 찾은 변이 수에 하한을 둔다(정규식이 조용히 0건을 찾으면 계약이 공허하게 통과하는 것을 막는다)
//   ② ALLOW 는 **위치(파일::함수::연산:테이블)와 개수까지** 정확히 일치해야 한다 — 빠져도, 늘어도 실패한다
//   ③ mustAffect 를 쓰는 파일은 반드시 './_mustAffect' 에서 import 해야 한다(같은 이름의 빈 함수로 우회 방지)
// 실행: npx vitest run src/api/mutationAffected.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const API = __dirname;          // 아래 'import 통로' 검사가 계속 쓴다(그쪽은 src/api 만 본다)
// ⚠ 2026-09-17: 예전엔 스캔 뿌리가 src/api 뿐이었다. 그래서 **같은 부류의 확인 없는 변이가
//   src/lib · src/components 에 있어도 계약이 초록**이었다(loyalty·hallOfFame·AdminTab 에서 4곳 발견).
//   '전수 계약' 이라는 이름이 거짓이었던 것이다 — 뿌리를 src 전체로 넓힌다.
const SRC = join(__dirname, '..');
const rel = (name: string) => `src/${name}`;
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name))
      : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);

/** 확인 불필요로 판단한 변이 — 키: `파일::함수::연산:테이블`. 값: 이유. 새 항목은 이유 없이 못 올린다. */
const ALLOW: Record<string, string> = {
  'src/api/ads.ts::swapAdSlots::update:community_ads':
    '슬롯 비우기(1단계). 바로 뒤 upsert 가 같은 RLS 에 걸려 오류로 드러나고, 슬롯 행이 아직 없으면 0행이 정상이다.',
  'src/api/auth.ts::approveOwner::update:venues':
    '연결된 매장이 아직 없으면 0행이 정상(코드 주석 ②). 오류만 보고 OwnerApprovalPartialError 로 부분 성공을 드러낸다.',
  'src/api/clock.ts::saveClockLevel::update:clock_states':
    '백업 전진자. "행이 없으면 아무 일도 안 하는 것도 의도다(백업은 새 클락을 만들지 않는다)" — 코드 주석.',
  'src/api/clock.ts::saveClockLiveStats::update:clock_states':
    '부가 통계 · fire-and-forget(.catch(() => {})). 다른 기기가 클락을 끝냈으면 0행이 정상이고 사용자에게 성공을 말하지 않는다.',
  'src/api/messages.ts::markThreadRead::update:user_messages':
    '읽음 스탬프. 미읽음이 없으면 0행이 정상이고, 화면은 성공을 말하지 않는다(뱃지만 갱신).',
  'src/api/notifications.ts::markNotificationsRead::update:notifications':
    '이미 읽은 알림이면 0행이 정상 · 베스트에포트(App 의 catch 가 재조회). 성공 토스트 없음.',
  'src/api/notifications.ts::markAllNotificationsRead::update:notifications':
    '위와 같다 — 미읽음 0건이면 0행이 정상.',
  'src/api/push.ts::disablePush::delete:push_subscriptions':
    '정리. 서버에 행이 없어도(다른 기기에서 지움) 로컬 구독 해제는 진행해야 한다. 발송 측은 410 으로 스스로 정리한다.',
  'src/api/postAttachments.ts::saveHand::delete:post_hands':
    'null = 첨부 제거. 원래 핸드가 없던 글이면 0행이 정상이다.',
  'src/api/postAttachments.ts::savePoll::delete:post_polls':
    'null = 투표 제거. 원래 투표가 없던 글이면 0행이 정상이다.',
  'src/api/postAttachments.ts::savePoll::delete:post_poll_options':
    '보기 전량 교체의 앞 단계. 바로 뒤 insert 가 같은 RLS 를 42501 오류로 드러낸다.',
};

/**
 * 멱등 토글의 **끄는 쪽** — `idempotentOff(…)` 통로(_mustAffect.ts). 키: `파일::함수::연산:테이블`.
 * 값: **켜는 쪽 짝**(`켜기 = 함수명 …`)과 그 짝이 "이미 켜짐" 을 어떻게 흡수하는지, 그리고 **본인 행(컬럼명)**.
 * ⚠ `본인 행` 은 산문이 아니라 **검사되는 선언**이다 — 괄호 안 컬럼이 끄는 쪽 문장의 `.eq('컬럼', …)` 로 실재해야 한다.
 *
 * 왜 ALLOW 와 다른가(2026-09-13 검증 FAIL ①): 켜기가 upsert / 23505 무시로 관대한데 끄기만 mustAffect 로 엄격하면
 *   되돌림이 서버와 반대 방향을 그린다(찜 해제 실패 → 하트가 '찜함'). 그렇다고 ALLOW 에 넣으면 "실패를 성공이라
 *   말한다" 로 되돌아간다. 그래서 (a) 통로를 따로 두고(error 는 던지고 0행만 흡수) (b) 사용처마다 **짝이 실제로
 *   관대한지**를 아래 테스트가 코드로 확인한다 — 짝 없는 항목은 올릴 수 없다.
 * ⚠ 본인 행(user_id = auth.uid() 필터)에만 허용 — 남의 행·매장 행은 RLS 거부가 0행으로 위장하므로 mustAffect 다.
 *   (staffSchedule 의 addStaffShift/removeStaffShift 도 켜기가 ignoreDuplicates 로 관대하지만 매장 행이라 여기 없다.)
 */
const IDEMPOTENT_OFF: Record<string, string> = {
  'src/api/calendar.ts::toggleScheduleLike::delete:schedule_likes':
    '켜기 = toggleScheduleLike 의 on 분기 upsert(onConflict user_id,schedule_id). 본인 행(user_id).',
  'src/api/community.ts::removeReaction::delete:post_reactions':
    '켜기 = reactToPost upsert(onConflict post_id,user_id). 본인 행(user_id).',
  'src/api/community.ts::unfollowVenue::delete:venue_follows':
    '켜기 = followVenue insert + 23505 무시. 본인 행(user_id).',
  'src/api/blocks.ts::unblockUser::delete:user_blocks':
    '켜기 = blockUser upsert(onConflict blocker_id,blocked_id). 본인 행(blocker_id).',
};

/** 주석만 지우고 **코드·문자열은 한 글자도 건드리지 않는다** — 문자 단위 스캐너.
 *
 *  ⚠⚠ 2026-09-13 3차 검증: 정규식판(`/([^:'"`])\/\/.*$/gm`)이 **코드를 삼켰다.**
 *    `//` 직전 **한 글자**만 보기 때문에 아래가 전부 잘려 나갔다:
 *      · `` `${proto}//${host}` `` — 앞 글자가 `}`
 *      · `'x//y'` — 문자열 **중간**의 `//`
 *      · `'/*'` … `'*\/'` — 블록주석 정규식이 **문자열 속 주석 기호**를 진짜 주석으로 먹는다
 *    실제 돌파: 템플릿 리터럴로 origin 을 만드는 한 줄을 넣자 그 줄의 `.delete()` 가 통째로 사라져
 *    **확인 없는 DELETE 가 계약에 보이지 않았다**(13개 전부 통과).
 *    → 이 저장소가 SQL 마이그레이션에서 배운 것과 같은 교훈이다: **정규식으로는 코드와 문자열을 가를 수 없다.**
 *
 *  길이를 보존한다(주석 자리를 공백으로 채우고 줄바꿈은 남긴다) — 오프셋이 유지돼야
 *  `stmtEnd`·`enclosingFn` 이 원문과 같은 위치를 가리킨다.
 *
 *  못 보는 것(정직하게): 정규식 **리터럴**을 추적하지 않는다. `/…\/\/…/` 처럼 이스케이프된 것은 무해하지만
 *  이스케이프 없는 `//` 를 담은 정규식 리터럴이 생기면 그 뒤가 주석으로 잘린다(현재 src/api 에 0곳).
 */
function stripComments(src: string): string {
  const out = src.split('');
  const blank = (a: number, b: number) => { for (let k = a; k < b && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {          // 문자열·템플릿: 통째로 건너뛴다
      const q = c; i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {              // 줄주석
      let e = src.indexOf('\n', i); if (e < 0) e = src.length;
      blank(i, e); i = e; continue;
    }
    if (c === '/' && src[i + 1] === '*') {              // 블록주석
      let e = src.indexOf('*/', i + 2); e = e < 0 ? src.length : e + 2;
      blank(i, e); i = e; continue;
    }
    i++;
  }
  return out.join('');
}

/** `.<method>('<arg>'` 가 코드에 있는가 — 따옴표 두 종류만 보고 **정규식을 조립하지 않는다**.
 *  테이블·컬럼 이름을 패턴에 끼워 넣으면 이스케이프가 어긋나 계약이 통째로 무력화된다. */
const hasCall = (code: string, method: string, arg: string): boolean =>
  code.includes(`.${method}('${arg}'`) || code.includes(`.${method}("${arg}"`);

/** 이 함수 본문에서 **세션 사용자 id** 를 담은 식(expression)들. 여기 없는 값으로 좁힌 행은 본인 행이 아니다.
 *  아래 관용구만 인정한다 — 새 관용구가 생기면 여기에 **명시적으로** 추가해야 계약이 통과한다(조용히 넓어지지 않게).
 *
 *  ⚠ 2026-09-13 독립 검증 정정: 예전 판본은 `supabase.auth.getUser()` 라는 **문자열이 본문 어딘가에 있기만 하면**
 *    아무 `X.user?.id` 나 인정했다. 그러면 **하드코딩된 남의 id** 를 담은 변수도 통과한다(검사가 무의미해진다).
 *    반대로 `_session.ts` 가 표준으로 적어 둔 구조분해 형태는 **거짓 실패**했다.
 *    이제 **`getUser()` 의 결과에 바인딩된 이름만** 인정한다. */
function sessionIdExprs(body: string): string[] {
  const out = new Set<string>();
  const addId = (n: string) => { out.add(`${n}.id`); out.add(`${n}?.id`); };

  // ① const me = await currentUser();            → me.id / me?.id
  //    ⚠ 3차 검증: `;` 앵커가 없으면 `const me = await currentUser() ?? { id: '남의id' };` 가 통과한다.
  for (const m of body.matchAll(/const\s+(\w+)\s*=\s*await\s+currentUser\(\)\s*;/g)) addId(m[1]);
  // ② const uid = (await currentUser())?.id;     → uid
  //    ⚠ **문장 끝(`;`)까지 앵커한다.** 안 그러면 `const uid = (await currentUser())?.id ?? victimId;` 가
  //      통과해 남의 id 로 폴백하는 코드를 '본인 행' 으로 인정한다(2차 검증 지적).
  for (const m of body.matchAll(/const\s+(\w+)\s*=\s*\(await\s+currentUser\(\)\)\??\.id\s*;/g)) out.add(m[1]);
  // ③ const { data: { user } } = await supabase.auth.getUser();   → user.id  (_session.ts 가 적어 둔 표준형)
  for (const m of body.matchAll(/const\s*\{\s*data\s*:\s*\{\s*user\s*\}\s*\}\s*=\s*await\s+supabase\.auth\.getUser\(\)\s*;/g)) { void m; addId('user'); }
  // ④ const { data: u } = await supabase.auth.getUser();  +  const uid = u.user?.id;
  //    — ④ 는 **그 u 에 바인딩된 것만** 인정한다(아무 객체의 .user?.id 가 아니다).
  for (const m of body.matchAll(/const\s*\{\s*data\s*:\s*(\w+)\s*\}\s*=\s*await\s+supabase\.auth\.getUser\(\)/g)) {
    const bound = m[1];
    for (const g of body.matchAll(new RegExp(`const\\s+(\\w+)\\s*=\\s*${bound}\\.user\\??\\.id\\s*;`, 'g'))) out.add(g[1]);
    out.add(`${bound}.user.id`); out.add(`${bound}.user?.id`);
  }
  return [...out];
}


interface Site { key: string; checked: boolean; off: boolean; file: string; stmt: string }

/** 열 0 에 선언된 최상위 함수 `name` 의 본문 — 다음 열 0 `}` 까지. src/api 의 API 는 전부 열 0 선언이다. */
function topLevelFnBody(code: string, name: string): string | null {
  const re = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*[(<]`, 'm');
  const m = re.exec(code);
  if (!m) return null;
  const end = code.indexOf('\n}', m.index);
  return code.slice(m.index, end < 0 ? code.length : end);
}

/** i 에서 시작해 괄호 깊이 0 의 `;` 까지 — 한 문장의 끝. */
function stmtEnd(code: string, i: number): number {
  let depth = 0; let quote: string | null = null;
  for (let k = i; k < code.length; k++) {
    const ch = code[k];
    if (quote) { if (ch === '\\') k++; else if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') { if (depth === 0) return k; depth--; }
    else if (ch === ';' && depth === 0) return k;
  }
  return code.length;
}

/** 이 위치를 감싸는 **최상위** 함수 이름 — 줄 첫머리(열 0)의 선언만 센다. 들여쓴 지역 헬퍼(예: swapAdSlots 안의
 *  `const row = (…) =>`)를 잡으면 키가 헬퍼 이름이 되어 ALLOW 가 어긋난다. src/api 의 API 는 전부 열 0 선언이다. */
function enclosingFn(code: string, i: number): string {
  const head = code.slice(0, i);
  const re = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[(<]|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm;
  let name = '(module)'; let m: RegExpExecArray | null;
  while ((m = re.exec(head))) name = m[1] ?? m[2] ?? name;
  return name;
}

function scan(): Site[] {
  const out: Site[] = [];
  for (const path of walk(SRC)) {
    const name = relative(SRC, path).split(sep).join('/');   // 'api/community.ts' | 'lib/loyalty.ts'
    const code = stripComments(readFileSync(path, 'utf-8'));
    const re = /\.(update|delete)\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const op = m[1];
      // 같은 문장 안에 `supabase … .from('table')` 이 있어야 PostgREST 변이다(Map#delete 등 제외).
      const prevSemi = code.lastIndexOf(';', m.index);
      const chainStart = code.lastIndexOf('supabase', m.index);
      if (chainStart < 0 || chainStart < prevSemi) continue;
      // ⚠⚠ 2026-09-13 3차 검증: 예전엔 따옴표 두 종류만 봤고, 못 읽으면 `continue` 로 **그 변이를 통째로 버렸다**
      //   (경고도 실패도 없이). `.from(\`community_posts\`)` 처럼 **백틱** 한 글자면 확인 없는 DELETE 가
      //   계약에서 사라졌다 — 실제로 13개 전부 통과했다. `stmtEnd`(:136)는 백틱을 추적하는데 여기만 안 봤다.
      //   이제 백틱도 읽고, **읽을 수 없으면 조용히 버리지 않고 `(unparsable)` 로 올려 계약을 깬다.**
      //   "스캐너가 읽을 수 없는 변이" 는 그 자체가 계약 위반이다 — 사람이 한 번 보게 만든다.
      const seg = code.slice(chainStart, m.index);
      const fromM = /\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/.exec(seg);
      if (!fromM) {
        if (/\.from\(/.test(seg)) {
          out.push({ key: `${rel(name)}::${enclosingFn(code, m.index)}::${op}:(unparsable)`,
            checked: false, off: false, file: name, stmt: seg });
        }
        continue;
      }
      const end = stmtEnd(code, m.index);
      const stmt = code.slice(chainStart, end);
      const before = code.slice(Math.max(0, chainStart - 40), chainStart).trimEnd();
      const after = code.slice(end, end + 400);
      const viaHelper = before.endsWith('mustAffect(');
      const viaOff = before.endsWith('idempotentOff(');
      const viaSelect = /\.select\(/.test(stmt) && (/\.single\(\)/.test(stmt) || /length === 0/.test(after) || /NoRowsAffectedError/.test(after));
      out.push({ key: `${rel(name)}::${enclosingFn(code, m.index)}::${op}:${fromM[1]}`, checked: viaHelper || viaSelect || viaOff, off: viaOff, file: name, stmt });
    }
  }
  return out;
}

describe('변이 전수 — 영향 행수 확인 계약', () => {
  const sites = scan();

  it('스캐너가 실제로 변이를 찾는다(정규식이 조용히 0건이 되면 계약이 공허해진다)', () => {
    // 2026-09-13 기준 88건(확인 77 = mustAffect·select 73 + 멱등 OFF 4 · 허용 11). 파일을 지워 크게 줄면 여기서 묻는다.
    // (전수 목록을 보려면: 이 줄 아래에 console.info(sites) 를 잠깐 넣고 --reporter=verbose 로 돌린다.)
    expect(sites.length).toBeGreaterThanOrEqual(80);
    expect(sites.filter((s) => s.checked).length).toBeGreaterThanOrEqual(70);
  });

  it('🔴 확인 없는 변이는 ALLOW 와 **정확히** 일치한다 — 새 변이를 확인 없이 추가하면 여기서 걸린다', () => {
    const unchecked = sites.filter((s) => !s.checked).map((s) => s.key).sort();
    const allowed = Object.keys(ALLOW).sort();
    const added = unchecked.filter((k) => !allowed.includes(k));
    const stale = allowed.filter((k) => !unchecked.includes(k));
    expect(added, [
      '영향 행수를 확인하지 않는 변이가 새로 생겼다. mustAffect(…) 로 감싸거나(대부분 이쪽),',
      '"0행이면 사용자가 거짓을 믿는가?" 에 아니오라고 답할 수 있으면 ALLOW 에 **이유와 함께** 올려라:',
      ...added,
    ].join('\n')).toEqual([]);
    expect(stale, `ALLOW 에 있는데 더는 확인 없는 변이가 아니다(고쳐졌거나 사라졌다) — 목록에서 지워라:\n${stale.join('\n')}`).toEqual([]);
  });

  it('ALLOW 의 모든 항목에 이유가 적혀 있다', () => {
    for (const [k, why] of Object.entries(ALLOW)) expect(why.trim().length, k).toBeGreaterThan(10);
  });

  it('mustAffect·idempotentOff 를 쓰는 파일은 전부 ./_mustAffect 에서 import 한다 — 같은 이름의 빈 함수로 우회할 수 없다', () => {
    for (const name of readdirSync(API)) {
      if (!/\.ts$/.test(name) || /\.test\.ts$/.test(name) || name === '_mustAffect.ts') continue;
      const code = stripComments(readFileSync(join(API, name), 'utf-8'));
      for (const fn of ['mustAffect', 'idempotentOff'] as const) {
        if (!new RegExp(`\\b${fn}\\(`).test(code)) continue;
        expect(code, `${name}: ${fn} 를 쓰지만 ./_mustAffect 에서 가져오지 않는다`).toMatch(new RegExp(`import \\{[^}]*\\b${fn}\\b[^}]*\\} from '\\./_mustAffect'`));
        expect(code, `${name}: ${fn} 라는 이름을 지역에서 다시 정의했다`).not.toMatch(new RegExp(`(?:function|const|let|var)\\s+${fn}\\b`));
      }
    }
  });

  // ⚠ 2차 검증 지적: `sessionIdExprs` 는 `currentUser` 라는 **이름**만 본다. 같은 파일에 로컬 `currentUser` 를
  //   정의해 두면 아무 값이나 '세션 사용자' 로 인정된다. 출처를 못 박는다.
  it('🔴 IDEMPOTENT_OFF 사용 파일의 currentUser 는 ./_session 에서 온다 — 같은 이름의 로컬 정의로 우회할 수 없다', () => {
    const files = new Set(Object.keys(IDEMPOTENT_OFF).map((k) => k.split('::')[0].replace(/^src\/api\//, '')));
    for (const name of files) {
      const code = stripComments(readFileSync(join(API, name), 'utf-8'));
      if (!/\bcurrentUser\s*\(/.test(code)) continue; // getUser() 경로만 쓰는 파일은 해당 없음
      // ⚠ 3차 검증 정정 두 가지:
      //   ① 원문 전체에 `toMatch` 하면 **문자열 리터럴로 만족시킬 수 있다**
      //      (`const _DOC = "import { currentUser } from './_session'"` + 실제로는 다른 곳에서 import).
      //      → **줄 첫머리(`^import`)로 앵커**한다. 문자열을 담은 줄은 `const` 로 시작하므로 못 속인다.
      //   ② `const {` 는 `\s+currentUser` 에 안 걸려 **구조분해 우회**가 통과했다
      //      (`const { currentUser } = { currentUser: async () => ({ id: '남의id' }) };`).
      expect(code, `${name}: currentUser 를 쓰지만 './_session' 에서 가져오지 않는다(줄 첫머리 import 여야 한다)`)
        .toMatch(/^import \{[^}]*\bcurrentUser\b[^}]*\} from '\.\/_session';?\s*$/m);
      expect(code, `${name}: currentUser 라는 이름을 지역에서 다시 정의했다 — 세션 판정을 통째로 우회한다`)
        .not.toMatch(/(?:function|const|let|var)\s+currentUser\b/);
      expect(code, `${name}: currentUser 를 구조분해로 지역 바인딩했다 — 세션 판정을 통째로 우회한다`)
        .not.toMatch(/(?:const|let|var)\s*\{[^}]*\bcurrentUser\b[^}]*\}\s*=(?!\s*await\s+import)/);
    }
  });

  it('통로 자체는 반영 행을 본다 — _mustAffect.ts 의 0행 검사와 무인자 select 가 남아 있다', () => {
    const code = stripComments(readFileSync(join(API, '_mustAffect.ts'), 'utf-8'));
    expect(code).toMatch(/await q\.select\(\)/);
    expect(code).toMatch(/data\.length === 0\) throw new NoRowsAffectedError/);
    expect(code).toMatch(/if \(error\) throw error;/);
  });

  // ── 멱등 토글의 끄는 쪽(2026-09-13 FAIL ①) ──────────────────────────────────
  it('🔴 idempotentOff 사용처는 IDEMPOTENT_OFF 와 **정확히** 일치한다 — 끄기를 관대하게 만들려면 켜는 쪽 짝을 적어야 한다', () => {
    const off = sites.filter((s) => s.off).map((s) => s.key).sort();
    const listed = Object.keys(IDEMPOTENT_OFF).sort();
    const added = off.filter((k) => !listed.includes(k));
    const stale = listed.filter((k) => !off.includes(k));
    expect(added, [
      'idempotentOff 를 새로 쓴 변이가 있다. 이 통로는 **켜는 쪽이 upsert / 23505 무시로 관대한 본인 행 토글**에만 허용된다.',
      'IDEMPOTENT_OFF 에 `켜기 = 함수명 …` 과 `본인 행` 을 적어라(짝이 없으면 mustAffect 가 맞다):',
      ...added,
    ].join('\n')).toEqual([]);
    expect(stale, `IDEMPOTENT_OFF 에 있는데 더는 idempotentOff 를 타지 않는다 — 목록에서 지워라:\n${stale.join('\n')}`).toEqual([]);
  });

  // ⚠ 2026-09-13 재검증 A5: 예전 이 테스트는 짝이 **관대한지**만 봤다. 그래서 (a) 짝이 **다른 테이블**을 upsert 해도
  //   통과했고 — 즉 "이 끄기의 짝" 이라는 주장 자체가 검증되지 않았다 — (b) `본인 행` 은 사유 산문에 그 네 글자가
  //   있기만 하면 통과해 **아무것도 보지 않았다**. 남의 행·매장 행을 idempotentOff 로 지우면 RLS 거부가 0행으로
  //   위장해 "지웠다" 고 말하는데, 그게 이 통로의 유일한 위험이다. 이제 셋 다 **코드로** 본다.
  it('🔴 IDEMPOTENT_OFF 의 켜는 쪽 짝이 **같은 테이블에서 실제로 관대하다**', () => {
    for (const [key, why] of Object.entries(IDEMPOTENT_OFF)) {
      const pair = /켜기 = (\w+)/.exec(why);
      expect(pair, `${key}: 사유에 '켜기 = 함수명' 이 없다`).not.toBeNull();
      const file = key.split('::')[0].replace(/^src\/api\//, '');
      const table = key.split(':').pop()!;
      const code = stripComments(readFileSync(join(API, file), 'utf-8'));
      const body = topLevelFnBody(code, pair![1]);
      expect(body, `${key}: 켜는 쪽 ${pair![1]} 이 ${file} 에 없다`).not.toBeNull();
      expect(body!, `${key}: 켜는 쪽 ${pair![1]} 이 관대하지 않다(upsert 도 23505 무시도 없다) — 그러면 끄기만 관대한 것이라 대칭이 아니다`)
        .toMatch(/\.upsert\(|'23505'/);
      // 같은 테이블이어야 '짝' 이다. 다른 테이블의 upsert 를 근거로 대면 대칭 주장이 성립하지 않는다.
      // ⚠ 정규식을 템플릿으로 조립하지 않는다 — 이스케이프가 한 겹만 깎여도 `Invalid regular expression` 이거나
      //   더 나쁘게는 **조용히 무엇이든 매치하는 패턴**이 되어 계약이 공허해진다(2026-09-13 실제로 밟았다).
      // ⚠ 그리고 **끄는 쪽 문장 자체를 증거로 삼으면 안 된다.** 켜기/끄기가 같은 함수 안에 있으면
      //   (`toggleScheduleLike` 의 on/off 분기) `idempotentOff(supabase.from('…').delete())` 가 스스로
      //   `.from(테이블)` 을 만족시켜 이 검사가 **구조적으로 무효**가 된다(2026-09-13 독립 검증 지적).
      // ⚠ 같은 키에 끄는 문장이 **둘 이상**일 수 있다. `find` 로 첫 번째만 빼면 나머지가 증거로 남아
      //   검사가 스스로를 만족시킨다(2차 검증 지적). **전부** 버린다.
      let evidence = body!;
      for (const st of sites.filter((s) => s.off && s.key === key)) evidence = evidence.split(st.stmt).join('   ');
      expect(hasCall(evidence, 'from', table),
        `${key}: 켜는 쪽 ${pair![1]} 이 ${table} 을 **끄는 문장 밖에서** 건드리지 않는다 — 이 끄기의 짝이 아니다`).toBe(true);
      // ⚠ '관대함' 과 '같은 테이블' 이 **이어져 있어야** 한다. 따로 보면
      //   '다른 테이블의 upsert + 이 테이블의 단순 select' 조합으로 통과한다(2차 검증 지적).
      // ⚠ 3차 검증: 창이 **400자면 너무 넓다.** 실제로 필요한 최대 거리는 103자(`followVenue`)인데
      //   400자 안에는 **다른 테이블의 관대함**이 들어오는 자리가 저장소에 2곳 있다(`leagues`·`staff_wage`).
      //   실측 돌파: `followVenue` 의 23505 무시를 지워 관대하지 않게 만들어도 400자 안의 다른 upsert 를
      //   근거로 삼아 전부 통과했다. → **150자로 좁히고, 사이에 다른 `.from(` 이 끼면 실패시킨다.**
      const fromLit = [`.from('${table}'`, `.from("${table}"`, '.from(`' + table + '`']
        .map((t) => evidence.indexOf(t)).filter((i) => i >= 0);
      const at = fromLit.length ? Math.min(...fromLit) : -1;
      const win = at >= 0 ? evidence.slice(at, at + 150) : '';
      const lm = /\.upsert\(|'23505'/.exec(win);
      expect(lm === null ? false : !/\.from\(/.test(win.slice(1, lm.index)),
        `${key}: ${table} 과 관대함 사이에 **다른 .from( 이 끼어 있다** — 다른 테이블의 upsert 를 근거로 댄 것이다`).toBe(true);
      expect(lm !== null,
        `${key}: ${table} 을 건드리는 자리 근처에 관대함(upsert·23505 무시)이 없다 — 다른 테이블의 upsert 를 근거로 댈 것일 수 있다`).toBe(true);
    }
  });

  it('🔴 IDEMPOTENT_OFF 가 선언한 **본인 행 컬럼이 세션 사용자 값으로 좁혀진다** — 남의 행이면 0행은 부재가 아니라 RLS 거부다', () => {
    for (const [key, why] of Object.entries(IDEMPOTENT_OFF)) {
      const col = /본인 행\((\w+)\)/.exec(why);
      expect(col, `${key}: 사유에 '본인 행(컬럼명)' 이 없다 — 어느 컬럼으로 본인을 좁히는지 적어야 한다`).not.toBeNull();
      // ⚠ 같은 키에 끄는 문장이 둘 이상이면 **전부** 검사한다. Map 으로 받으면 마지막 하나만 남아
      //   앞 문장의 필터가 아예 검사되지 않는다(2차 검증 지적).
      const stmts = sites.filter((s) => s.off && s.key === key).map((s) => s.stmt);
      expect(stmts.length, `${key}: idempotentOff 사용처를 스캐너가 못 찾았다`).toBeGreaterThan(0);

      // ⚠ "그 컬럼이 필터에 있다" 만으로는 부족하다. `본인 행(post_id)` 처럼 **본인과 무관한 컬럼을 적어도** 통과한다.
      //   실제 안전 근거는 '그 컬럼이 **세션 사용자 값**과 비교되는가' 다 — 그것만이 0행을 '부재' 로 읽어도 되는 이유다.
      const [file, fn] = key.split('::');
      const body = topLevelFnBody(stripComments(readFileSync(join(API, file.replace(/^src\/api\//, '')), 'utf-8')), fn);
      expect(body, `${key}: 끄는 쪽 함수 ${fn} 을 못 찾았다`).not.toBeNull();
      const exprs = sessionIdExprs(body!);
      expect(exprs.length, `${key}: ${fn} 안에서 세션 사용자 id 바인딩을 못 찾았다 — 본인 행이라는 근거가 코드에 없다`).toBeGreaterThan(0);

      for (const stmt of stmts) {
        expect(hasCall(stmt, 'eq', col![1]), `${key}: 선언한 본인 행 컬럼 ${col![1]} 로 좁히는 .eq 가 그 문장에 없다 — 남의 행이면 mustAffect 가 맞다`).toBe(true);
        const flat = stmt.replace(/\s+/g, ' ');
        const ok = exprs.some((e) => flat.includes(`.eq('${col![1]}', ${e})`) || flat.includes(`.eq("${col![1]}", ${e})`));
        expect(ok, `${key}: ${col![1]} 이 세션 사용자 값(${exprs.join(' | ')})과 비교되지 않는다 — 남의 행일 수 있으니 mustAffect 가 맞다`).toBe(true);
      }
    }
  });

  it('idempotentOff 통로는 error 는 던지고 0행은 던지지 않는다 — NoRowsAffectedError 가 그 본문에 없다', () => {
    const code = stripComments(readFileSync(join(API, '_mustAffect.ts'), 'utf-8'));
    const body = topLevelFnBody(code, 'idempotentOff');
    expect(body, 'idempotentOff 가 _mustAffect.ts 에 없다').not.toBeNull();
    expect(body!).toMatch(/await q\.select\(\)/);
    expect(body!).toMatch(/if \(error\) throw error;/);
    expect(body!, '0행을 던지면 mustAffect 와 같아져 되돌림이 다시 반대 방향을 그린다').not.toMatch(/NoRowsAffectedError|throw new/);
  });

  // 판정기 자체의 단위 테스트 — 소스를 변조하지 않고 "무엇을 인정하고 무엇을 거부하는가" 를 못 박는다.
  // (2026-09-13 독립 검증: 예전 판본은 하드코딩된 남의 id 를 통과시키고, _session.ts 의 표준 구조분해형을 거짓 실패시켰다.)
  it('🔴 sessionIdExprs 는 getUser/currentUser 에 **바인딩된** 이름만 인정한다', () => {
    expect(sessionIdExprs('const me = await currentUser();')).toContain('me.id');
    expect(sessionIdExprs('const uid = (await currentUser())?.id;')).toContain('uid');
    // _session.ts 가 표준으로 적어 둔 형태 — 예전엔 이게 **거짓 실패**했다.
    expect(sessionIdExprs('const { data: { user } } = await supabase.auth.getUser();')).toContain('user.id');
    // calendar.ts 의 실제 형태
    expect(sessionIdExprs('const { data: u } = await supabase.auth.getUser();\nconst uid = u.user?.id;')).toContain('uid');
    // 🔴 거부: getUser() 가 본문에 있어도 **그 결과에 바인딩되지 않은** 값은 본인 id 가 아니다.
    const hardcoded = 'const { data: u } = await supabase.auth.getUser();\nconst uid = \'11111111-1111-1111-1111-111111111111\';';
    expect(sessionIdExprs(hardcoded), '하드코딩된 남의 id 를 본인 id 로 인정하면 이 계약은 아무것도 보지 않는다').not.toContain('uid');
    const otherObj = 'const { data: u } = await supabase.auth.getUser();\nconst uid = someRow.user?.id;';
    expect(sessionIdExprs(otherObj), '다른 객체의 .user?.id 는 세션 사용자가 아니다').not.toContain('uid');
    // 🔴 2차 검증 지적: 문장 끝을 앵커하지 않으면 **남의 id 로 폴백**하는 코드가 통과한다.
    expect(sessionIdExprs("const uid = (await currentUser())?.id ?? victimId;"),
      '?? 폴백이 붙으면 그 변수는 세션 사용자라고 보장할 수 없다').not.toContain('uid');
    // 정상형은 계속 인정된다(과잉 차단이 아니다).
    expect(sessionIdExprs("const uid = (await currentUser())?.id;")).toContain('uid');
  });

  // 🔴 2차 검증 지적: 줄 전체 주석만 지우면 **꼬리 주석**이 판정기에 그대로 들어간다.
  it('🔴 stripComments 는 꼬리 주석도 지우고, URL 의 // 는 건드리지 않는다', () => {
    expect(stripComments("const a = 1; // .eq('user_id', uid)")).not.toContain('user_id');
    expect(stripComments("const u = 'https://x.co/a'; // 주석")).toContain('https://x.co/a');
    expect(stripComments('/* 블록\n .upsert( \n*/ const b = 2;')).not.toContain('.upsert(');
  });

  it('두 선례가 여전히 확인 경로에 있다 — approveOwner(profiles) · reports.updateReportStatus', () => {
    const keys = sites.filter((s) => s.checked).map((s) => s.key);
    expect(keys).toContain('src/api/auth.ts::approveOwner::update:profiles');
    expect(keys).toContain('src/api/reports.ts::updateReportStatus::update:reports');
    expect(keys).toContain('src/api/community.ts::deletePost::delete:community_posts');
  });
});
