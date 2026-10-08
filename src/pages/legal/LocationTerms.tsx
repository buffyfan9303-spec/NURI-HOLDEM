// src/pages/legal/LocationTerms.tsx
// 위치기반서비스 이용약관 — 공개 정적 페이지(/legal/location.html)용 렌더러.
// scripts/gen-legal.mjs 가 이 컴포넌트를 SSR 로 찍어 발행한다(JS 0줄).
//
// 왜 필요한가(2026-10-08 Play 출시 준비): 위치 약관은 앱 하단 「약관 및 정책」 창에만 있어 앱을 열지 않으면 읽을 수 없었다.
//   스토어 심사·이용자가 앱 밖에서 여는 주소가 필요하다. /legal/location.html 은 그동안 SPA 폴백으로 앱 첫 화면이 나왔다.
// 텍스트 원본은 LegalDocsModal.tsx 의 LOCATION 하나다 — 여기에 문장을 다시 쓰지 않는다(두 벌 금지).
//   빈 줄로 나뉜 덩어리마다 첫 줄이 '제N조(…)' 면 제목으로, 나머지 줄은 문단으로 그린다(정적 페이지는 줄바꿈 서식이 없다).
// ⚠ 정적 페이지 class 치환(reclass)이 살리는 것은 box / b / mute / hl / warn / center 뿐이다.
import { LOCATION } from '../../components/features/LegalDocsModal';

/** '제N조(…)' 한 줄이면 제목 — 정규식 하나로 끝까지 훑지 않고 앞·뒤만 본다. */
const isHeading = (line: string) => /^제\d+조/.test(line) && line.endsWith(')');

export default function LocationTerms() {
  const blocks = LOCATION.split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim() !== ''));
  return (
    <div className="space-y-2 text-xs text-ink-secondary leading-relaxed">
      {blocks.map((lines, i) => {
        const [first, ...rest] = lines;
        const isHead = isHeading(first);
        return (
          <section key={i}>
            {isHead && <h3 className="text-sm font-bold text-ink-primary mb-2">{first}</h3>}
            {(isHead ? rest : lines).map((l, j) => <p key={j}>{l}</p>)}
          </section>
        );
      })}
    </div>
  );
}
