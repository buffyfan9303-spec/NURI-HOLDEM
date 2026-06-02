// src/components/atoms/Avatar.tsx
import type { CSSProperties } from 'react';

interface Props {
  name: string;
  /** 업로드한 프로필 이미지 URL (있으면 우선 표시) */
  src?: string;
  /** 이미지가 없을 때 이니셜 배경색 */
  color?: string;
  /** 지름(px) */
  size?: number;
  className?: string;
}

/** 프로필 아바타 — 이미지가 있으면 이미지, 없으면 이니셜. 글/댓글/라이브 공통 사용. */
export default function Avatar({ name, src, color, size = 28, className = '' }: Props) {
  const box: CSSProperties = { width: size, height: size };
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={box}
        className={['shrink-0 rounded-full object-cover bg-surface-high', className].join(' ')}
      />
    );
  }
  return (
    <span
      style={{ ...box, background: color ?? '#5A6175', fontSize: Math.max(9, Math.round(size * 0.42)) }}
      className={['shrink-0 rounded-full flex items-center justify-center font-bold text-white select-none', className].join(' ')}
    >
      {name?.[0] ?? '?'}
    </span>
  );
}
