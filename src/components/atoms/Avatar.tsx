// src/components/atoms/Avatar.tsx
import { useState, type CSSProperties } from 'react';
import { onColorInkClass } from '../../lib/color';

interface Props {
  name: string;
  /** 업로드한 프로필 이미지 URL (있으면 우선 표시) */
  src?: string;
  /** 이미지가 없을 때 이니셜 배경색 */
  color?: string;
  /** 지름(px) */
  size?: number;
  /**
   * 이미지 맞춤 방식. 기본 `'contain'`.
   *
   * 왜 contain 이 기본인가(2026-08-30 근치):
   * · 업로드 경로는 2026-06-03 크롭 편집기 도입 이후 **320×320 정사각을 강제**한다
   *   (AvatarCropper.apply → 정사각 캔버스). 정사각 소스에서는 박스도 정사각(width=height=size)이라
   *   cover 와 contain 의 렌더 결과가 **픽셀 단위로 동일**하다 → 신규 아바타는 변화 0.
   * · 반면 크롭기 이전 업로드분은 비정사각으로 남아 있고, cover 는 그걸 잘라낸다.
   *   실측: 라이브에 존재하는 유일한 아바타 이미지가 256×151 로고(공식 계정 '누리홀덤')인데
   *   cover 는 가로 59% 만 남겨 글자 토막만 보였다.
   * · 즉 기본값 contain 은 '보존', cover 는 '파괴' 쪽이다. 예외가 필요하면 이 prop 으로 탈출한다.
   *
   * ⚠ 호출부에서 `!object-contain` 으로 덮던 땜질 3곳(CommentThread ×2 · PostDetailModal)은
   *    이 기본값으로 대체돼 같은 커밋에서 제거했다. 다시 붙이지 말 것.
   */
  fit?: 'cover' | 'contain';
  className?: string;
}

/**
 * 이니셜 글자 크기 — 지름에 **비례하되 §T1 타이포 사다리 위에만** 떨어지도록 4구간 양자화.
 *
 * 왜(2026-09-12, 문서 5 §7 P0-B): 예전엔 `fontSize: Math.max(9, round(size*0.42))` 인라인 px 이라
 * 실제 사용 size 7종(18·22·24·26·28·32·40)이 **9/9/10/11/12/13/17px 7단**을 만들었고 전부 사다리 밖이었다.
 * 인라인 절대 px 은 `html{font-size:17px}`("50대 이용자 가독성" 결정)도 브라우저 확대도 **하나도 안 받는다**.
 * 게시글 상세 한 화면에 10/13/17px 세 종류가 동시에 보였다(8개 파일이 이 아톰을 쓴다).
 *
 * 한 값으로 고정하면 40px 아바타의 이니셜이 우스워지므로 비례는 유지한다 — 구간만 사다리로 스냅한다.
 *   18·22 → 11.69 (사다리 최소단. 더 작은 칸이 없다)  24·26·28 → 12.75  32 → 14.88  40 → 17
 * `leading-none` 은 행상자를 글자 크기와 같게 만들어 flex 중앙정렬이 폰트 메트릭에 흔들리지 않게 한다.
 */
// eslint-disable-next-line react-refresh/only-export-components -- 테스트가 순수 함수를 직접 검증(CountUp·CommentThread 와 같은 관행)
export function initialTextClass(size: number): string {
  if (size >= 40) return 'text-base';   // 17px
  if (size >= 32) return 'text-sm';     // 14.88px
  if (size >= 24) return 'text-xs';     // 12.75px
  return 'text-2xs';                    // 11.69px
}

/** 프로필 아바타 — 이미지가 있으면 이미지, 없으면 이니셜. 글/댓글/라이브 공통 사용. */
export default function Avatar({ name, src, color, size = 28, fit = 'contain', className = '' }: Props) {
  /** 로드 실패한 src. 값이 같으면 이니셜로 폴백한다(깨진 이미지 아이콘 방지). */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // 원 지름도 rem 으로 — 글자만 rem 이 되면 **글자만 200% 확대**(html 34px)에서 이니셜이 원 밖으로
  // 삐져나온다(실측: size 18 에서 잉크가 세로 +13px 넘침). 아바타는 원+글자가 한 덩어리로 커져야 한다.
  // 1rem = 17px(src/index.css:538) 이므로 **100% 배율에서는 예전 px 값과 완전히 같다**(실측 확인).
  const box: CSSProperties = { width: `${size / 17}rem`, height: `${size / 17}rem` };

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt={name}
        style={box}
        loading="lazy"
        decoding="async"
        // 404·차단 시 이니셜 경로로 떨어진다. 박스 치수가 인라인 style 로 고정이라 레이아웃은 안 움직인다(CLS 0).
        onError={() => setFailedSrc(src)}
        className={[
          // 2026-09-24 H1(오너 캡처: 라이트 헤더에서 프로필이 흰 원만 남고 내용이 사라짐) — 투명 이미지의 받침을
          //   **테마 무관 고정색**(다크의 surface-high #1B243C)으로 둔다. 예전 `bg-surface-high` 는 라이트에서 #EEF2F8 로
          //   바뀌어, 실측 오너 아바타(256×151 webp · 57.6% 투명 · 불투명 픽셀 100% 순백)가 흰 바탕 위 흰 글자(≈1.1:1)가 됐다.
          //   이미지는 업로더가 고른 그림이라 테마를 따라 받침이 바뀌면 안 된다. 기본 테마(다크)에서 보이던 그대로를 양 테마에 준다.
          //   ponytail: 어두운 내용의 투명 이미지는 이 받침에서 안 보인다 — 다크 모드의 종전 동작과 같다(새 결함 아님).
          //   필요해지면 업로드 시 불투명 배경을 합성하거나 픽셀 휘도로 받침을 고른다.
          'shrink-0 rounded-full bg-[#1B243C]',
          fit === 'cover' ? 'object-cover' : 'object-contain',
          className,
        ].join(' ')}
      />
    );
  }

  const bg = color ?? '#5A6175';
  return (
    <span
      style={{ ...box, background: bg }}
      // 글자색은 배경 상대휘도로 결정한다(렌더 중 동기 계산 → 초기 페인트부터 확정, 깜빡임 없음).
      // 하드코딩 text-white 는 팔레트 10색 중 9색에서 AA 미달이었다(#FFD100 1.46:1).
      className={[
        'shrink-0 rounded-full flex items-center justify-center font-bold leading-none select-none',
        initialTextClass(size),
        onColorInkClass(bg),
        className,
      ].join(' ')}
    >
      {name?.[0] ?? '?'}
    </span>
  );
}
