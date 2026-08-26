// src/components/atoms/Icon.tsx
// 누리홀덤 공용 아이콘 — **공식 lucide-react 팩**(오너 지시 2026-08-27) 어댑터 + 포커 커스텀 글리프.
// 사용: <Icon name="close" size={20} className="text-ink-secondary" /> — 호출부 API 불변.
// 범용 아이콘은 lucide-react 네임드 임포트(트리셰이킹 — 쓰는 것만 번들)로 렌더하고,
// 수트·칩 등 포커 도메인 글리프만 자체 PATHS 로 유지한다(스페이드는 gen-icons.mjs 와 형태 공유).
// 새 범용 아이콘 = LUCIDE 맵에 한 줄(https://lucide.dev 에서 이름 검색), 새 도메인 글리프 = PATHS 한 줄.
// 라이선스: lucide-react ISC(패키지 동봉), Feather MIT 계보.
import type { ReactElement, SVGProps } from 'react';
import {
  X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, Plus, Minus, Check,
  CheckCircle2, Trash2, Pencil, Star, Heart, AlertTriangle, Info, Lock, User, Users, Bell,
  QrCode, Calendar, Clock, Settings, Share2, Filter, Image, Download, ExternalLink, Menu,
  Home, RefreshCw, Copy, Send, MessageCircle, Eye, Bookmark, Flame, Target, Wallet, Gift,
  CheckCheck, MapPin, LogOut, Trophy, Ticket, Phone, Printer, BarChart3, Medal, ShoppingCart, Crown, type LucideIcon,
} from 'lucide-react';

export type IconName =
  | 'close' | 'back' | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'chevron-up'
  | 'search' | 'plus' | 'minus' | 'check' | 'check-circle'
  | 'trash' | 'edit' | 'star' | 'star-fill' | 'heart' | 'heart-fill'
  | 'alert' | 'info' | 'lock' | 'user' | 'users' | 'bell'
  | 'qr' | 'calendar' | 'clock' | 'settings' | 'share' | 'filter'
  | 'image' | 'download' | 'external' | 'menu' | 'home' | 'refresh' | 'copy' | 'send'
  // 포커 도메인 글리프(IMG-2, 자체 제작) — 수트 4종은 채움 도형
  | 'spade' | 'heart-suit' | 'diamond' | 'club'
  | 'chip' | 'chip-stack' | 'cards' | 'dealer-button' | 'blinds'
  | 'trophy' | 'all-in' | 'felt-table' | 'timer-poker'
  // 리디자인 스파인 공통 글리프(로드맵 Phase 0 지정 — 이모지 마커 소탕용)
  | 'comment' | 'eye' | 'bookmark' | 'flame' | 'target' | 'wallet'
  | 'gift' | 'check-double' | 'map-pin' | 'log-out'
  | 'ticket' | 'phone' | 'printer' | 'chart' | 'medal' | 'cart' | 'crown';

// 각 아이콘의 path/figure children (viewBox 0 0 24 24 기준). 채움 아이콘은 fill 처리.
const PATHS: Partial<Record<IconName, ReactElement>> = {
  // ── 포커 도메인 글리프(자체 제작) ────────────────────────────────────────
  // 스페이드: gen-icons.mjs 512 좌표계 path 를 24 viewBox 로 ÷21.33 스케일(형태 단일 소스)
  spade: <path d="M12 3C10.03 7.03 5.72 9.19 5.72 13.03c0 2.72 2.25 4.13 4.5 3.28-.38 1.78-1.22 2.82-2.53 3.75h8.62c-1.31-.93-2.15-1.97-2.53-3.75 2.25.85 4.5-.56 4.5-3.28C18.28 9.19 13.97 7.03 12 3Z" fill="currentColor" stroke="none" />,
  'heart-suit': <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" fill="currentColor" stroke="none" />,
  diamond: <path d="M12 2.5 18.8 12 12 21.5 5.2 12Z" fill="currentColor" stroke="none" />,
  club: <><circle cx="12" cy="7.5" r="3.6" fill="currentColor" stroke="none" /><circle cx="7.2" cy="13.5" r="3.6" fill="currentColor" stroke="none" /><circle cx="16.8" cy="13.5" r="3.6" fill="currentColor" stroke="none" /><path d="M10.4 13.5c-.35 3.2-1.35 5.1-2.9 6.5h9c-1.55-1.4-2.55-3.3-2.9-6.5Z" fill="currentColor" stroke="none" /></>,
  chip: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" /></>,
  'chip-stack': <><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" /><path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" /></>,
  cards: <><rect x="4" y="6" width="11" height="15" rx="2" /><path d="M9.5 3.9 17 2.2a2 2 0 0 1 2.4 1.5l2.3 10.2a2 2 0 0 1-1.5 2.4l-2.2.5" /></>,
  'dealer-button': <><circle cx="12" cy="12" r="9" /><path d="M10 8h1.8a4 4 0 0 1 0 8H10Z" /></>,
  blinds: <><circle cx="8.5" cy="14.5" r="5.5" /><circle cx="15.5" cy="9.5" r="5.5" /></>,
  trophy: <><path d="M7 3h10v6a5 5 0 0 1-10 0Z" /><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" /><path d="M12 14v4M8 21h8M9.5 18h5" /></>,
  'all-in': <><path d="M12 11V3M8.5 6.5 12 3l3.5 3.5" /><ellipse cx="12" cy="16" rx="7" ry="2.6" /><path d="M5 16v2.4c0 1.44 3.13 2.6 7 2.6s7-1.16 7-2.6V16" /></>,
  'felt-table': <><ellipse cx="12" cy="12" rx="9.5" ry="6.5" /><ellipse cx="12" cy="12" rx="5.8" ry="3.3" /></>,
  'timer-poker': <><path d="M9.5 2h5" /><path d="M12 2v3" /><circle cx="12" cy="13.5" r="8" /><path d="M12 9.5v4l2.6 1.6" /></>,
  // ── 리디자인 스파인 공통 글리프(자체 제작) ────────────────────────────────
  comment: <path d="M21 11.5c0 4.14-4.03 7.5-9 7.5-1.06 0-2.08-.15-3.02-.44L4 20l1.16-3.48C3.82 15.19 3 13.42 3 11.5 3 7.36 7.03 4 12 4s9 3.36 9 7.5Z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1Z" />,
  flame: <path d="M12 2.5c.6 3-0.9 4.6-2.4 6.2C8.1 10.3 7 11.9 7 14a5 5 0 0 0 10 0c0-1.4-.5-2.6-1.2-3.7-.4.9-1 1.5-1.8 2 .3-2.9-.6-6.6-2-9.8Z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  wallet: <><path d="M20 7H5a2 2 0 0 1-2-2 2 2 0 0 1 2-2h13v4" /><path d="M3 5v13a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1" /><path d="M16 13h.01" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" /><path d="M12 8c-3.5 0-4.5-3-3-4.5C10.5 2 12 4 12 8c0-4 1.5-6 3-4.5 1.5 1.5.5 4.5-3 4.5Z" /></>,
  'check-double': <><path d="M2.5 12.5 7 17 17 7" /><path d="m12 17 9.5-9.5" /></>,
  'map-pin': <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  'log-out': <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
};

// 범용 이름 → lucide-react 컴포넌트(트리셰이킹: 여기 임포트된 것만 번들에 포함)
const LUCIDE: Partial<Record<IconName, LucideIcon>> = {
  close: X, back: ChevronLeft, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
  'chevron-down': ChevronDown, 'chevron-up': ChevronUp, search: Search, plus: Plus, minus: Minus,
  check: Check, 'check-circle': CheckCircle2, trash: Trash2, edit: Pencil, star: Star,
  heart: Heart, alert: AlertTriangle, info: Info, lock: Lock, user: User, users: Users,
  bell: Bell, qr: QrCode, calendar: Calendar, clock: Clock, settings: Settings, share: Share2,
  filter: Filter, image: Image, download: Download, external: ExternalLink, menu: Menu,
  home: Home, refresh: RefreshCw, copy: Copy, send: Send, comment: MessageCircle, eye: Eye,
  bookmark: Bookmark, flame: Flame, target: Target, wallet: Wallet, gift: Gift,
  'check-double': CheckCheck, 'map-pin': MapPin, 'log-out': LogOut, trophy: Trophy,
  ticket: Ticket, phone: Phone, printer: Printer, chart: BarChart3, medal: Medal, cart: ShoppingCart, crown: Crown,
};
// 채움 변형은 lucide 원형에 fill 지정으로 표현
const FILLED = new Set<IconName>(['star-fill', 'heart-fill']);
const FILL_BASE: Partial<Record<IconName, LucideIcon>> = { 'star-fill': Star, 'heart-fill': Heart };

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 20, strokeWidth = 2, className, ...rest }: IconProps) {
  const Filled = FILL_BASE[name];
  if (Filled && FILLED.has(name)) {
    return <Filled size={size} strokeWidth={strokeWidth} fill="currentColor" className={className} aria-hidden {...rest} />;
  }
  const L = LUCIDE[name];
  if (L) {
    return <L size={size} strokeWidth={strokeWidth} className={className} aria-hidden {...rest} />;
  }
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
