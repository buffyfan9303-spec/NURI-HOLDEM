// 2026-10-07 번들 감축 PR A ② — 채운 별·하트를 heroicons 컴포넌트에서 인라인 path 로 옮겼다.
// 렌더 결과가 heroicons 2.2.0 원본과 **마크업까지 같은지** 직접 비교한다(모양·속성·data-slot — SpotTable 이 [data-slot] 을 센다).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StarIcon, HeartIcon } from '@heroicons/react/24/solid';
import Icon from './Icon';

describe('Icon star-fill · heart-fill = heroicons solid 원본', () => {
  const cases = [
    { name: 'star-fill' as const, Hero: StarIcon },
    { name: 'heart-fill' as const, Hero: HeartIcon },
  ];
  for (const { name, Hero } of cases) {
    it(name, () => {
      for (const props of [{ size: 20 }, { size: 10, className: 'shrink-0 text-accent-300' }, { size: 14, style: { opacity: 0.5 } }]) {
        const { size, ...rest } = props;
        const mine = renderToStaticMarkup(<Icon name={name} {...props} />);
        const hero = renderToStaticMarkup(<Hero width={size} height={size} aria-hidden {...rest} />);
        expect(mine).toBe(hero);
      }
    });
  }
});
