// 로컬 정적 이미지의 **변형본이 실제로 다 있는가**.
//
// 🔴 왜 만들었나 — 2026-09-19 오너: "프로필 카드가 깨졌어"(매장 페이지 아바타가 깨진 아이콘)
//   `thumbUrl` 은 고정 목록(LOCAL_WIDTHS)에서 폭을 고르지, **어떤 변형본이 실재하는지 모른다.**
//   매장 페이지는 144px 를 요구 → `find(w >= 144)` = 256 → `roti-arena-256.webp` 를 가리켰는데
//   `gen-thumbs.mjs` 가 "원본(256px)보다 큰 폭은 안 만든다" 로 **건너뛰어** 그 파일이 없었다.
//
//   그런데 화면에는 404 가 아니라 **200 이 왔다.** SPA 폴백이 `index.html`(text/html, 24KB)을
//   돌려줬기 때문이다. `<img>` 는 그걸 디코드하지 못해 깨진 아이콘이 됐다.
//   ⚠ **404 보다 200 이 더 나쁘다** — 네트워크 탭이 초록이라 아무도 의심하지 않는다.
//
// 지금 계약: `LOCAL_WIDTHS` 의 **모든 폭**에 대해 파일이 실재한다.
//   gen-thumbs 는 `withoutEnlargement` 로 원본보다 키우지 않으므로, 큰 폭 파일은 원본과 같은
//   픽셀이고 바이트도 늘지 않는다. '이름이 가리키는 파일은 항상 있다' 가 유일한 안전한 계약이다.
//
// ⚠ 이 검사가 못 보는 것: Supabase Storage 이미지(런타임 변환이라 파일이 없어도 정상).
//   여기서는 `public/banners`·`public/venues` 의 **정적 파일만** 본다.
// 실행: npx vitest run src/lib/localThumbVariants.contract.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { thumbUrl } from './imageUrl';

/** gen-thumbs.mjs 의 DIRS 와 같아야 한다. 한쪽만 늘리면 이 검사가 그 사실을 잡는다. */
const DIRS = ['public/banners', 'public/venues'];
/** imageUrl.ts 의 LOCAL_WIDTHS 와 같아야 한다(그쪽은 export 하지 않아 여기 적는다). */
const WIDTHS = [64, 128, 256, 400, 800, 960];

const originals = (dir: string) => {
  const p = join(process.cwd(), dir);
  if (!existsSync(p)) return [];
  return readdirSync(p).filter((f) => /\.webp$/i.test(f) && !/-\d+\.webp$/i.test(f));
};

describe('로컬 썸네일 변형본 — 이름이 가리키는 파일은 항상 있다', () => {
  it('🔴 잴 것이 실제로 있다 — 원본이 0개면 이 검사는 빈 통과다', () => {
    const n = DIRS.reduce((a, d) => a + originals(d).length, 0);
    expect(n, `${DIRS.join(' / ')} 에 원본 webp 가 없다 — 폴더가 바뀌었으면 DIRS 를 고쳐라`).toBeGreaterThan(0);
  });

  it('🔴 모든 원본에 모든 폭의 변형본이 있다', () => {
    const missing: string[] = [];
    for (const dir of DIRS) {
      for (const f of originals(dir)) {
        for (const w of WIDTHS) {
          const v = f.replace(/\.webp$/i, `-${w}.webp`);
          if (!existsSync(join(process.cwd(), dir, v))) missing.push(`${dir}/${v}`);
        }
      }
    }
    expect(
      missing,
      '변형본이 없다. 화면에는 404 가 아니라 **SPA 폴백 HTML 이 200 으로** 와서\n'
      + '`<img>` 가 깨진 아이콘이 된다(2026-09-19 매장 페이지 아바타가 그랬다).\n'
      + `→ \`node scripts/gen-thumbs.mjs\` 를 돌려라. 없는 것:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('🔴 thumbUrl 이 고르는 폭이 전부 WIDTHS 안에 있다 — 목록이 어긋나면 없는 파일을 가리킨다', () => {
    // 실제 호출부가 쓰는 폭들(ScheduleCard 64/128 · VenueThumb 64/128 · VenuePage 144 · 배너 400)
    const used = [64, 128, 144, 400];
    const bad: string[] = [];
    for (const dir of DIRS) {
      for (const f of originals(dir)) {
        const url = `/${dir.replace('public/', '')}/${f}`;
        for (const w of used) {
          const got = thumbUrl(url, w);
          if (!got) { bad.push(`${url} @${w} → undefined`); continue; }
          const m = got.match(/-(\d+)\.webp$/);
          if (!m) { bad.push(`${url} @${w} → 변형본이 아니다(${got})`); continue; }
          if (!WIDTHS.includes(Number(m[1]))) bad.push(`${url} @${w} → ${got}(WIDTHS 밖)`);
          if (!existsSync(join(process.cwd(), dir, got.split('/').pop()!))) bad.push(`${url} @${w} → ${got} 파일 없음`);
        }
      }
    }
    expect(bad, `thumbUrl 이 실재하지 않는 파일을 가리킨다:\n${bad.join('\n')}`).toEqual([]);
  });
});
