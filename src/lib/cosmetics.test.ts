// 코스메틱(프로필 카드 프레임 5종 · 닉네임 색 6종) 계약 회귀 게이트.
//
// ── 무엇을 잠그는가, 그리고 왜 눈으로는 못 잡는가 ───────────────────────────
//  이 상품군의 실패는 전부 **조용하다**:
//   ① 클라이언트 폴백과 서버 카탈로그(shop_cosmetics)의 키가 갈리면, 산 사람 화면에서
//      항목이 그냥 **사라진다**(loadCosmetics 가 병합이라 예외도 안 난다).
//   ② 프레임 키가 profileCard 의 FRAMES 에 없으면 frameOf 가 기본값으로 떨어뜨린다 —
//      즉 400점을 내고 **기본 카드와 똑같은 그림**을 받는다. 에러도 로그도 없다.
//   ③ 닉네임 색 토큰이 --tier-* 밖으로 새면 라이트/다크 대비 실측을 통과한 적 없는 색이
//      닉네임에 박힌다. e2e 대비 프로브는 --tier-* 만 재므로 그걸 못 본다.
//  셋 다 '화면은 멀쩡해 보이는데 산 것이 사라지거나 값이 없어지는' 종류라, 실행이 아니라
//  **정의끼리 맞춰보는** 방식으로만 잡힌다.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NICK_COLOR_TOKENS, FRAME_FALLBACK, NICK_COLOR_FALLBACK, FALLBACK_COSMETICS,
  nickColorVar, getCosmetics, cosmeticOf,
} from './cosmetics';
import { frameOf, frameLabel, DEFAULT_FRAME } from './profileCard';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const MIGRATION = 'supabase/migrations/20260830n_ownership_tier_goods.sql';
const INDEX_CSS = 'src/index.css';

describe('코스메틱 카탈로그 — 서버 정의와 클라이언트 폴백이 갈리지 않는다', () => {
  it('폴백 키가 마이그레이션의 shop_cosmetics INSERT 와 정확히 같다', () => {
    const sql = read(MIGRATION);
    // insert ... values 의 ('key', 'kind', ... 첫 칼럼만 뽑는다.
    const inserted = [...sql.matchAll(/\(\s*'(frame_[a-z_]+|nick_[a-z_]+)'\s*,\s*'(card_frame|nick_color)'/g)]
      .map((m) => m[1]);
    expect(inserted.length, '마이그레이션에서 shop_cosmetics 행을 못 읽었다 — INSERT 형태가 바뀌었으면 이 가드부터 고쳐라')
      .toBeGreaterThan(0);
    expect([...inserted].sort()).toEqual(FALLBACK_COSMETICS.map((c) => c.key).sort());
  });

  it('마이그레이션의 kind 와 폴백의 kind 가 일치한다', () => {
    const sql = read(MIGRATION);
    for (const c of FALLBACK_COSMETICS) {
      const m = sql.match(new RegExp(`\\(\\s*'${c.key}'\\s*,\\s*'(card_frame|nick_color)'`));
      expect(m?.[1], `${c.key} 의 kind 가 서버와 다르다`).toBe(c.kind);
    }
  });

  it('키가 중복되지 않는다 — 중복이면 뒤엣것이 앞엣것을 조용히 덮는다', () => {
    const keys = FALLBACK_COSMETICS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('초기 카탈로그는 폴백이고, 알 수 없는 키는 undefined 를 준다', () => {
    expect(getCosmetics().length).toBe(FALLBACK_COSMETICS.length);
    expect(cosmeticOf('frame_gold')?.kind).toBe('card_frame');
    expect(cosmeticOf('없는키')).toBeUndefined();
    expect(cosmeticOf(null)).toBeUndefined();
  });
});

describe('프레임 — 400점을 내고 기본 카드를 받는 일이 없어야 한다', () => {
  it('폴백 프레임 5종이 전부 profileCard 의 그림을 갖는다', () => {
    expect(FRAME_FALLBACK.length).toBe(5);
    for (const f of FRAME_FALLBACK) {
      // frameOf 가 키를 그대로 돌려주면 FRAMES 에 그 키가 있다는 뜻이다.
      // 기본값으로 떨어지면(= 그림이 없으면) 산 사람은 기본 카드와 같은 그림을 받는다.
      expect(frameOf(f.key), `${f.key} 에 대응하는 프레임 그림이 없다 — 400점을 내고 기본 카드를 받는다`)
        .toBe(f.key);
      expect(frameLabel(f.key)).toBe(f.label);
    }
  });

  it('알 수 없는 · 비어 있는 키는 기본 프레임으로 떨어진다(카드가 비거나 터지지 않게)', () => {
    expect(frameOf(null)).toBe(DEFAULT_FRAME);
    expect(frameOf(undefined)).toBe(DEFAULT_FRAME);
    expect(frameOf('frame_판매중지')).toBe(DEFAULT_FRAME);
  });
});

describe('닉네임 색 — 새 팔레트를 만들지 않는다', () => {
  it('토큰 6종이 index.css 에 --tier-<token> / -vivid 로 **라이트·다크 양쪽** 정의돼 있다', () => {
    const css = read(INDEX_CSS);
    for (const t of NICK_COLOR_TOKENS) {
      for (const name of [`--tier-${t}`, `--tier-${t}-vivid`]) {
        // 다크 정본 + 라이트 오버라이드 = 최소 2회. 한 번뿐이면 한쪽 테마에서 색이 갈린다.
        const hits = css.match(new RegExp(`${name}\\s*:`, 'g')) ?? [];
        expect(hits.length, `${name} 정의가 ${hits.length}회 — 라이트/다크 양쪽에 있어야 한다`)
          .toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('nickColorVar 는 화이트리스트 밖의 값을 통과시키지 않는다', () => {
    expect(nickColorVar('blue')).toBe('--tier-blue');
    // 장식용 vivid 가 아니라 **텍스트용** 토큰이어야 한다(닉네임은 읽는 글자라 4.5:1).
    expect(nickColorVar('gold')).toBe('--tier-gold');
    expect(nickColorVar('admin')).toBeNull();   // 등급 토큰이지만 판매 대상이 아니다
    expect(nickColorVar('#FF0000')).toBeNull();
    expect(nickColorVar(null)).toBeNull();
    expect(nickColorVar(undefined)).toBeNull();
  });

  it('폴백 6종의 token 이 전부 화이트리스트 안이고 서로 겹치지 않는다', () => {
    expect(NICK_COLOR_FALLBACK.length).toBe(NICK_COLOR_TOKENS.length);
    const tokens = NICK_COLOR_FALLBACK.map((c) => c.token);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const t of tokens) {
      expect(t).not.toBeNull();
      expect(NICK_COLOR_TOKENS).toContain(t!);
    }
  });

  it('마이그레이션의 token 화이트리스트 제약과 같은 6종이다', () => {
    const sql = read(MIGRATION);
    const m = sql.match(/kind = 'nick_color' and token in \(([^)]*)\)/);
    expect(m, 'shop_cosmetics_token_rule 제약을 못 읽었다 — 형태가 바뀌었으면 이 가드부터 고쳐라').not.toBeNull();
    const server = (m![1]).split(',').map((t) => t.trim().replace(/^'|'$/g, ''));
    expect(server.sort()).toEqual([...NICK_COLOR_TOKENS].sort());
  });
});

describe('절대 팔지 않는 것 — 근거가 코드에 남아 있어야 한다', () => {
  // 다음 사람이 '왜 뽑기가 없지?'로 되살리는 것을 막는 유일한 장치가 이 주석이다.
  // 주석이 지워지면(=근거가 사라지면) 여기서 실패해 다시 쓰게 만든다.
  it('마이그레이션이 확률형·베팅·포인트 선물 배제 근거를 들고 있다', () => {
    const sql = read(MIGRATION);
    for (const word of ['뽑기', '베팅', '유저 간 포인트 선물', '참가비 대납', '32①7']) {
      expect(sql, `배제 근거에서 '${word}' 가 사라졌다`).toContain(word);
    }
  });
});
