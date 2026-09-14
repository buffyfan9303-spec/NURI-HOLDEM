// 오너 #8 (2026-09-15) — "랭킹 상점에서 뭘 사도 그대로야. 바뀌는 게 없어."
//
// ── 어디서 끊겼나 (사슬을 끝까지 따라간 결과) ────────────────────────────────
//   구매 클릭 → RPC → 포인트 차감 → 서버 저장 → 화면 적용
//   서버 쪽은 전부 정상이다:
//     · buy_mark      (20260830f:141,146) spent_points 차감 + profiles.equipped_mark 즉시 장착
//     · buy_cosmetic  (20260830n:505,512,514) spent_points 차감 + equipped_card_frame/nick_color 즉시 장착
//     · 표시 경로     get_activity_leaderboard(equipped_mark) · get_nick_colors(equipped_nick_color)
//   끊긴 곳은 **화면이 다시 안 읽는 것**이었다: 순위표·닉네임 색 재조회 이펙트의 의존성이
//   `[user?.activityPoints]` 하나뿐인데, **모든 구매는 activity_points 를 건드리지 않는다**
//   (누적 점수는 등급 기준이라 소비해도 줄지 않는 것이 설계다 — TierLeaderboard 상점 안내 문구).
//   ⇒ 구매·장착으로 그 값이 바뀌는 일이 구조적으로 0 이라 이펙트가 영영 다시 돌지 않았고,
//     상점 카드만 '✓ 장착 중' 이 되고 바로 위 순위표의 내 행은 새로고침 전까지 옛 마크·옛 색이었다.
//
// 이 계약이 잠그는 것: ① 차감 컬럼이 spent_points 라는 사실(=activityPoints 로는 절대 못 깨운다)
//                     ② 재조회 이펙트가 activityPoints **말고도** 구매가 올리는 스탬프를 본다
//                     ③ 표시가 바뀌는 구매·장착 4경로가 전부 그 스탬프를 올린다
//
// 음성 대조(해당 줄만 손으로 되돌렸다가 즉시 복원 — `git stash`·`checkout` 금지):
//   · 이펙트 deps 를 `[user?.activityPoints]` 로 되돌리면 ②가 실패한다
//   · handleBuyCosmetic 의 `refreshDisplay();` 한 줄을 지우면 ③이 실패한다
//
// 실행: npx vitest run src/components/features/shopApplyWiring.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 리터럴 BOM 은 소스에 담지 않는다(no-irregular-whitespace) — 코드포인트로 만든다.
const BOM = String.fromCharCode(0xFEFF);
const read = (p: string) => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const s = readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
  return s.startsWith(BOM) ? s.slice(1) : s;
};
/** 주석은 뺀다 — "예전엔 …" 설명이 계약을 대신 만족시키면 안 된다. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(^|[^:'"`])\/\/(?![^'"`\n]*['"`]).*$/gm, '$1');

const TL = stripComments(read('./TierLeaderboard.tsx'));
const BUY_MARK_SQL = read('../../../supabase/migrations/20260830f_buy_shout_slot_and_buy_mark.sql');
const GOODS_SQL = read('../../../supabase/migrations/20260830n_ownership_tier_goods.sql');

/** `const <name> = ` 부터 중괄호 균형이 맞을 때까지 — 뒤 함수의 코드에 묻히지 않게 한다. */
function handlerBody(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = `);
  expect(start, `${name} 가 있어야 한다`).toBeGreaterThan(-1);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`${name} 의 본문 끝을 찾지 못했다`);
}

describe('오너 #8 ① 구매는 activity_points 를 건드리지 않는다 — 그래서 그것만 보는 이펙트는 깨어날 수 없다', () => {
  it('🔴 buy_mark · buy_cosmetic · buy_season_badge 의 차감 컬럼은 spent_points 뿐이다', () => {
    for (const [sql, where] of [[BUY_MARK_SQL, '20260830f'], [GOODS_SQL, '20260830n']] as const) {
      const deducts = [...sql.matchAll(/update\s+public\.profiles\s+set\s+(\w+)\s*=\s*coalesce\(\s*\1/gi)].map((m) => m[1]);
      expect(deducts.length, `${where} 에 차감 UPDATE 가 있어야 한다`).toBeGreaterThan(0);
      expect(new Set(deducts), `${where} — 차감은 spent_points 로만 한다`).toEqual(new Set(['spent_points']));
      // 구매 함수가 activity_points 를 쓰는 일은 없다(읽기만 한다).
      expect(sql, `${where} — 구매가 activity_points 를 쓰면 등급이 소비로 깎인다`)
        .not.toMatch(/update\s+public\.profiles\s+set\s+activity_points/i);
    }
  });

  it('🔴 산 물건이 실제로 표시 컬럼에 꽂힌다 — 즉시 장착까지가 한 트랜잭션이다', () => {
    expect(BUY_MARK_SQL).toMatch(/update public\.profiles set equipped_mark = p_mark_key where id = v_uid/);
    expect(GOODS_SQL).toMatch(/update public\.profiles set equipped_card_frame = p_key where id = v_uid/);
    expect(GOODS_SQL).toMatch(/update public\.profiles set equipped_nick_color = p_key where id = v_uid/);
  });
});

describe('오너 #8 ② 순위표·닉네임 색 재조회 이펙트가 구매를 본다', () => {
  it('🔴 getActivityLeaderboard + getNickColors 이펙트의 deps 에 displayStamp 가 있다', () => {
    const i = TL.indexOf('getActivityLeaderboard(30)');
    expect(i, 'getActivityLeaderboard 이펙트가 있어야 한다').toBeGreaterThan(-1);
    // 같은 이펙트가 닉네임 색까지 함께 싣는다 — 둘을 갈라 놓으면 한쪽만 낡는다.
    const effect = TL.slice(i, TL.indexOf('}, [', i) + 200);
    expect(effect, '닉네임 색도 같은 이펙트가 싣는다').toContain('getNickColors(ids)');
    const deps = effect.match(/\}, \[([^\]]*)\]\);/);
    expect(deps, '이펙트의 의존성 배열을 찾아야 한다').not.toBeNull();
    expect(deps![1], 'activityPoints 는 구매로 바뀌지 않는다 — 스탬프가 함께 있어야 한다').toContain('displayStamp');
  });

  it('🔴 refreshDisplay 는 그 스탬프를 올리는 유일한 통로다', () => {
    expect(TL).toMatch(/const \[displayStamp, setDisplayStamp\] = useState\(0\);/);
    expect(TL).toMatch(/const refreshDisplay = useRef\(\(\) => \{[\s\S]*?setDisplayStamp\(\(n\) => n \+ 1\);[\s\S]*?\}\)\.current;/);
    // setDisplayStamp 직접 호출은 refreshDisplay 선언 한 곳뿐(핸들러마다 다르게 부르면 빠뜨린 곳이 생긴다).
    expect([...TL.matchAll(/setDisplayStamp\(/g)]).toHaveLength(1);
  });
});

describe('오너 #8 ③ 표시가 바뀌는 구매·장착 네 경로가 전부 화면을 다시 읽는다', () => {
  it.each([
    ['handleBuyMark', '마크 구매'],
    ['handleEquip', '마크 장착/해제'],
    ['handleBuyCosmetic', '프레임·닉네임 색 구매'],
    ['handleEquipCosmetic', '프레임·닉네임 색 장착/해제'],
  ])('🔴 %s (%s) 가 refreshDisplay() 를 부른다', (name) => {
    expect(handlerBody(TL, name)).toContain('refreshDisplay()');
  });

  it('🔴 구매는 잔액도 함께 다시 읽는다 — 점수만 빠지고 화면이 옛 잔액을 말하면 그것도 같은 거짓말이다', () => {
    for (const name of ['handleBuyMark', 'handleBuyCosmetic', 'handleBuySeasonBadge']) {
      expect(handlerBody(TL, name), `${name} 가 reloadBalance 를 불러야 한다`).toContain('reloadBalance()');
    }
  });
});

describe('오너 #8 ④ 같은 표시가 걸린 게시판까지 다시 읽는다', () => {
  const CT = stripComments(read('./CommunityTab.tsx'));
  it('🔴 상점이 쏘는 신호를 커뮤니티 탭이 받아 마크·닉네임 색을 다시 조회한다', () => {
    // 커뮤니티 탭은 keep-alive 라(App.tsx display 토글) 신호 없이는 부팅 값을 계속 쓴다 — ads 와 같은 처방.
    expect(TL).toContain("window.dispatchEvent(new CustomEvent('nuri:cosmetics-changed'))");
    expect(CT).toContain("window.addEventListener('nuri:cosmetics-changed', bump)");
    expect(CT).toContain("window.removeEventListener('nuri:cosmetics-changed', bump)");
    // 신호가 실제로 재조회로 이어져야 한다 — 리스너만 있고 deps 에 없으면 아무 일도 안 난다.
    const i = CT.indexOf('getEquippedMarks(ids)');
    expect(i, 'getEquippedMarks 조회가 있어야 한다').toBeGreaterThan(-1);
    const deps = CT.slice(i).match(/\}, \[([^\]]*)\]\);/);
    expect(deps![1], 'posts 만 보면 글 목록이 안 바뀌는 동안 색이 낡는다').toContain('cosmeticStamp');
  });
});
