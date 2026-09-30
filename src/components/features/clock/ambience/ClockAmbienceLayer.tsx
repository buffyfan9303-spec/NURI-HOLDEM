// src/components/features/clock/ambience/ClockAmbienceLayer.tsx — 모션 테마 층(lazy 청크의 입구).
// 테마 id → 코드로 그린 장면(scenes) 또는 폭우 유리창(실사 영상 + 물방울 효과). 모르는 id 는 아무것도 그리지 않는다
// (루트의 --clk-bg 가 그대로 보인다 — 옛 번들·새 번들이 섞여도 화면이 깨지지 않는다).
import ClockAmbience from './ClockAmbience';
import { RAIN_GLASS_VIDEO } from './ambiencePresets';
import { ambienceSceneById } from './scenes/scenes';

const WRAP = { position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none' } as const;

export default function ClockAmbienceLayer({ id, still }: { id: string; still?: boolean }) {
  const scene = ambienceSceneById(id);
  if (scene) return <div style={WRAP}><ClockAmbience scene={scene} still={still} /></div>;
  if (id === 'rain-glass') return <div style={WRAP}><ClockAmbience motion="rain-glass" video={RAIN_GLASS_VIDEO} dim={0.3} still={still} /></div>;
  return null;
}
