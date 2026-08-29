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

/** 프로필 아바타 — 이미지가 있으면 이미지, 없으면 이니셜. 글/댓글/라이브 공통 사용. */
export default function Avatar({ name, src, color, size = 28, fit = 'contain', className = '' }: Props) {
  /** 로드 실패한 src. 값이 같으면 이니셜로 폴백한다(깨진 이미지 아이콘 방지). */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const box: CSSProperties = { width: size, height: size };

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
          'shrink-0 rounded-full bg-surface-high',
          fit === 'cover' ? 'object-cover' : 'object-contain',
          className,
        ].join(' ')}
      />
    );
  }

  const bg = color ?? '#5A6175';
  return (
    <span
      style={{ ...box, background: bg, fontSize: Math.max(9, Math.round(size * 0.42)) }}
      // 글자색은 배경 상대휘도로 결정한다(렌더 중 동기 계산 → 초기 페인트부터 확정, 깜빡임 없음).
      // 하드코딩 text-white 는 팔레트 10색 중 9색에서 AA 미달이었다(#FFD100 1.46:1).
      className={[
        'shrink-0 rounded-full flex items-center justify-center font-bold select-none',
        onColorInkClass(bg),
        className,
      ].join(' ')}
    >
      {name?.[0] ?? '?'}
    </span>
  );
}
