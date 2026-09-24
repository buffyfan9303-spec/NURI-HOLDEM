// src/components/features/tools/GlossaryPanel.tsx
// GKR-4 — 홀덤 용어사전. 한국 홀덤 유저가 현장·방송에서 실제로 듣는 한글 표기 기준으로
// 용어를 정리한다. 검색은 용어·영문·설명 3필드 동시 매칭 —
// 초보가 "오즈"만 쳐도 팟 오즈/임플라이드 오즈가 걸리도록 부분 문자열 검색을 쓴다.
//
// ⚠ 용어 데이터는 이 파일에 없다 — glossary.data.ts 가 단일 출처다(제안 ⑩).
//   계산기들이 붙이는 Term 툴팁과 같은 배열을 봐야 사전과 툴팁이 갈라지지 않는다.
import { CHIP_HIT } from '../gto/chip';
import { useMemo, useState } from 'react';
import Icon from '../../atoms/Icon';
import { GLOSSARY_CATS as CATS, GLOSSARY_TERMS as TERMS, type GlossaryCat as Cat } from './glossary.data';

export default function GlossaryPanel() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat | 'all'>('all');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TERMS.filter((t) => {
      if (cat !== 'all' && t.cat !== cat) return false;
      if (!needle) return true;
      return (
        t.term.toLowerCase().includes(needle) ||
        t.en.toLowerCase().includes(needle) ||
        t.desc.toLowerCase().includes(needle)
      );
    });
  }, [q, cat]);

  return (
    <div className="space-y-3">
      {/* 검색 — 용어·영문·설명 동시 매칭 */}
      <div className="relative">
        <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="용어 검색 · 한글·영문·설명"
          className="input w-full pl-9 text-sm"
          aria-label="용어 검색"
        />
      </div>

      {/* 카테고리 칩 필터 — aria-pressed 토글(켜진 칩 다시 누르면 전체로 복귀) */}
      {/* ⚠ 줄바꿈이 아니라 가로 스크롤이다(오너 2026-09-18) — 칩이 8개(전체+7분류)라 좁은 폭에서
          반드시 접히고, 마지막 줄에 한두 개만 남는 **고아 줄**이 생긴다. 게다가 분류를 고를 때마다
          줄 수가 변해 아래 목록이 위아래로 튄다. 앱의 다른 칩 레일(커뮤니티 서브탭·장터 분류)과 같은 규약이다. */}
      <div className="-my-1.5 flex gap-1.5 overflow-x-auto py-1.5 scrollbar-none" role="group" aria-label="용어 분류 필터">
        {(['all', ...CATS] as const).map((c) => {
          const on = cat === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => setCat(on && c !== 'all' ? 'all' : c)}
              className={[
                // shrink-0 필수 — 가로 스크롤 레일에서 이게 없으면 칩이 눌려 글자가 짜부라진다.
                // 보이는 32px · 누르는 44px(CHIP_HIT). 가로 스크롤 레일이 위아래를 자르므로 레일에 py-1.5 -my-1.5(6.375px — 잘려도 44.75px).
                CHIP_HIT, 'inline-flex h-[32px] shrink-0 items-center whitespace-nowrap rounded-input border px-2.5 text-2xs font-semibold transition-colors',
                on ? 'border-accent-300 bg-accent-300 text-white' : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary',
              ].join(' ')}
            >
              {c === 'all' ? '전체' : c}
            </button>
          );
        })}
      </div>

      {/* 용어 리스트 */}
      <div className="rounded-aura border card-aura">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-2xs text-ink-muted">검색 결과가 없습니다</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filtered.map((t) => (
              <li key={t.term} className="px-3.5 py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-ink-primary">{t.term}</span>
                  <span className="min-w-0 truncate text-2xs text-ink-muted">{t.en}</span>
                  <span className="ml-auto shrink-0 text-2xs text-ink-muted">{t.cat}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{t.desc}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-2xs text-ink-muted">총 {TERMS.length}개 용어 — 현장·방송에서 통용되는 한글 표기 기준입니다.</p>
    </div>
  );
}
