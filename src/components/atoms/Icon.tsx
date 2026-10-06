// src/components/atoms/Icon.tsx
// 누리홀덤 공용 아이콘 — **공식 lucide-react 팩**(오너 지시 2026-08-27) 어댑터 + 포커 커스텀 글리프.
// 사용: <Icon name="close" size={20} className="text-ink-secondary" /> — 호출부 API 불변.
// 범용 아이콘은 lucide-react 네임드 임포트(트리셰이킹 — 쓰는 것만 번들)로 렌더하고,
// 수트·칩 등 포커 도메인 글리프만 자체 PATHS 로 유지한다(스페이드는 gen-icons.mjs 와 형태 공유).
// 새 범용 아이콘 = LUCIDE 맵에 한 줄(https://lucide.dev 에서 이름 검색), 새 도메인 글리프 = PATHS 한 줄.
//
// ── 왜 이모지가 아니라 SVG 인가 (ICON-2, 오너 지시 2026-08-29) ─────────────────
// 이모지는 **폰트 리소스**라 모양을 앱이 정하지 못한다. 같은 `🏆` 가 iOS(Apple Color Emoji)·
// Android(Noto Color Emoji)·Windows(Segoe UI Emoji)·삼성 One UI 에서 전부 다른 그림으로 뜬다.
// 굵기·광택·원근·채도가 제각각이고 색은 폰트에 박혀 있어 테마(다크/라이트)를 따라가지 못하며,
// 크기도 글자 메트릭에 묶여 옆 텍스트와 베이스라인이 어긋난다. "싸구려·조잡해 보인다"는 인상은
// 취향 문제가 아니라 **디자인 통제권이 OS 에 있다**는 구조적 결과다.
// SVG 로 옮기면 stroke 2 / viewBox 24 / currentColor 한 규격으로 굵기·크기·색이 앱 전체에서
// 하나로 통일되고, 테마 토큰과 accent 색을 그대로 상속한다.
// 예외로 남기는 것: ① 카드 수트(♠♥♦♣)와 포커 도메인 표기 — 이모지가 아니라 도메인 기호다.
// ② 랭킹 상점 마크(lib/shopMarks.ts) — 닉네임 앞에 **문자열로 결합**돼 유통되는 유저 보유 아이템이다.
//
// ── 라이선스 고지 ─────────────────────────────────────────────────────────────
// 범용 글리프는 Lucide(https://lucide.dev) 아이콘을 `lucide-react` 패키지로 사용한다.
//
//   Lucide — ISC License
//   Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
//   All other copyright (c) for Lucide are held by Lucide Contributors 2022.
//
//   Permission to use, copy, modify, and/or distribute this software for any purpose with or
//   without fee is hereby granted, provided that the above copyright notice and this permission
//   notice appear in all copies.
//
//   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
//   SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL
//   THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY
//   DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF
//   CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE
//   OR PERFORMANCE OF THIS SOFTWARE.
//
//   Heroicons — MIT License
//   Copyright (c) Tailwind Labs, Inc. (https://github.com/tailwindlabs/heroicons)
//   채운 아이콘(solid)만 사용한다 — 아웃라인은 굵기가 갈리지 않게 lucide 로 통일.
//
// 아래 PATHS 의 포커 도메인 글리프는 누리홀덤 자체 제작이다(Lucide 원본 아님).
import type { ReactElement, SVGProps } from 'react';
import {
  X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, Plus, Minus, Check,
  Maximize2, Minimize2, Gavel,
  CheckCircle2, Trash2, Pencil, Star, Heart, AlertTriangle, Info, Lock, Smartphone, User, Users, Bell,
  QrCode, Calendar, Clock, Settings, Share2, Filter, Image, Download, ExternalLink, Menu,
  Home, RefreshCw, Copy, Send, MessageCircle, Mail, Eye, Bookmark, Flame, Target, Wallet, Gift,
  CheckCheck, MapPin, LogOut, Trophy, Ticket, Phone, Printer, BarChart3, Medal, ShoppingCart, Crown,
  // ICON-2 이모지 소탕분 — 매핑표에 실제로 쓰이는 것만 추가한다(미사용 아이콘 금지)
  Lightbulb, ClipboardList, Play, Pause, Link2, Megaphone, Undo2, Map as MapIcon, Gem,
  WifiOff, Radio, Dices, Package, Ban, Pin, Sparkles, Zap, Tv, Volume2, VolumeX,
  TrendingUp, Store, BookOpen, Archive, Scale, Building2, Hand, Flag, EyeOff, Clapperboard,
  Timer, AlarmClock, Banknote, Briefcase, ShieldAlert, Bomb, ArrowUpRight, ArrowDownLeft,
  DoorOpen, CalendarCheck, Circle, NotebookText,
  // ICON-3(2026-08-30) 이모지 전수 점검 소탕분
  Command,
  // GTO 탭 도구 카탈로그(2026-09-03, 오너 "아이콘팩에서 최대한 잘 맞는 걸로") — ToolsPanel TOOLS/LANES 전용
  ArrowUpFromLine, Swords, Dumbbell, Brain, BookA, BookX, GitCompare, Percent,
  ShieldCheck, Handshake, Sigma, Layers, Gauge, PiggyBank, TrendingUpDown, Coins, ListOrdered,
  ChartPie, Hourglass, Table, GraduationCap, Microscope, Calculator,
  // 내 정보 통합(2026-09-04) — 헤더 유저 메뉴의 수제 SVG 5종을 팩으로 교체
  CircleUserRound, Wrench, Shield, Sun, Moon,
  type LucideIcon,
} from 'lucide-react';

export type IconName =
  | 'close' | 'back' | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'chevron-up'
  | 'search' | 'plus' | 'minus' | 'check' | 'check-circle'
  | 'maximize' | 'minimize' | 'gavel'
  | 'trash' | 'edit' | 'star' | 'star-fill' | 'heart' | 'heart-fill'
  | 'alert' | 'info' | 'lock' | 'smartphone' | 'user' | 'users' | 'bell'
  | 'qr' | 'calendar' | 'clock' | 'settings' | 'share' | 'filter'
  | 'image' | 'download' | 'external' | 'menu' | 'home' | 'refresh' | 'copy' | 'send'
  // 포커 도메인 글리프(IMG-2, 자체 제작) — 수트 4종은 채움 도형
  | 'spade' | 'heart-suit' | 'diamond' | 'club'
  | 'chip' | 'chip-stack' | 'cards' | 'dealer-button' | 'blinds'
  | 'trophy' | 'all-in' | 'felt-table' | 'timer-poker'
  // 리디자인 스파인 공통 글리프(로드맵 Phase 0 지정 — 이모지 마커 소탕용)
  | 'comment' | 'mail' | 'eye' | 'bookmark' | 'flame' | 'target' | 'wallet'
  | 'gift' | 'check-double' | 'map-pin' | 'log-out'
  | 'ticket' | 'phone' | 'printer' | 'chart' | 'medal' | 'cart' | 'crown'
  // ICON-2 이모지 소탕 확장분(2026-08-29) — 좌측 주석의 이모지 대체 대상. 매핑표에 쓰이는 것만 있다.
  | 'lightbulb' | 'clipboard' | 'play' | 'pause' | 'link' | 'megaphone' | 'undo' | 'map' | 'gem'
  | 'wifi-off' | 'radio' | 'dice' | 'package' | 'ban' | 'pin' | 'sparkles' | 'zap' | 'tv'
  | 'volume' | 'volume-off' | 'trending-up' | 'store' | 'book-open' | 'archive' | 'scale'
  | 'building' | 'hand' | 'flag' | 'eye-off' | 'clapperboard' | 'timer' | 'alarm' | 'banknote'
  | 'briefcase' | 'shield-alert' | 'bomb' | 'arrow-up-right' | 'arrow-down-left' | 'door'
  | 'calendar-check' | 'circle' | 'notebook'
  // ICON-3 이모지 전수 점검 소탕분(2026-08-30)
  | 'command'
  // GTO 탭 도구 카탈로그(2026-09-03) — 도구 26종은 서로 다른 아이콘(ToolsPanel.icons.test.ts 가 게이트)
  | 'arrow-up-from-line' | 'swords' | 'dumbbell' | 'brain' | 'book-a' | 'book-x'
  | 'git-compare' | 'percent' | 'shield-check' | 'handshake' | 'sigma' | 'layers' | 'gauge' | 'piggy-bank'
  | 'trending-up-down' | 'coins' | 'list-ordered' | 'chart-pie' | 'hourglass'
  | 'table' | 'graduation-cap' | 'microscope' | 'calculator'
  // 내 정보 통합(2026-09-04) — 헤더 유저 메뉴
  | 'circle-user' | 'wrench' | 'shield' | 'sun' | 'moon'
  // GTO '자주 쓰는 도구' 타일 시안(2026-10-06, 자체 제작) — 회청 선 + 파랑 포인트(--icon-accent, 없으면 currentColor)
  | 'spot-cards' | 'range-grid' | 'push-fold' | 'hand-scan';

// 스페이드 외곽(24 viewBox) — 수트 글리프와 도구 타일 글리프가 같은 모양을 쓴다(한 벌).
const SPADE_D = 'M12 3C10.03 7.03 5.72 9.19 5.72 13.03c0 2.72 2.25 4.13 4.5 3.28-.38 1.78-1.22 2.82-2.53 3.75h8.62c-1.31-.93-2.15-1.97-2.53-3.75 2.25.85 4.5-.56 4.5-3.28C18.28 9.19 13.97 7.03 12 3Z';
// 포인트 색 — 속성(fill="var()")이 아니라 style 로 준다(SVG 표현 속성의 var() 해석은 브라우저마다 갈린다).
const ACCENT_FILL = { fill: 'var(--icon-accent, currentColor)', stroke: 'none' } as const;
const ACCENT_SOLID = { fill: 'var(--icon-accent, currentColor)', stroke: 'var(--icon-accent, currentColor)' } as const;
const ACCENT_STROKE = { stroke: 'var(--icon-accent, currentColor)' } as const;
const DIM_FILL = { fill: 'currentColor', fillOpacity: 0.6, stroke: 'none' } as const;

// 각 아이콘의 path/figure children (viewBox 0 0 24 24 기준). 채움 아이콘은 fill 처리.
const PATHS: Partial<Record<IconName, ReactElement>> = {
  // ── 포커 도메인 글리프(자체 제작) ────────────────────────────────────────
  // 스페이드: gen-icons.mjs 512 좌표계 path 를 24 viewBox 로 ÷21.33 스케일(형태 단일 소스)
  spade: <path d={SPADE_D} fill="currentColor" stroke="none" />,
  'heart-suit': <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" fill="currentColor" stroke="none" />,
  diamond: <path d="M12 2.5 18.8 12 12 21.5 5.2 12Z" fill="currentColor" stroke="none" />,
  club: <><circle cx="12" cy="7.5" r="3.6" fill="currentColor" stroke="none" /><circle cx="7.2" cy="13.5" r="3.6" fill="currentColor" stroke="none" /><circle cx="16.8" cy="13.5" r="3.6" fill="currentColor" stroke="none" /><path d="M10.4 13.5c-.35 3.2-1.35 5.1-2.9 6.5h9c-1.55-1.4-2.55-3.3-2.9-6.5Z" fill="currentColor" stroke="none" /></>,
  chip: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" /></>,
  'chip-stack': <><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" /><path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" /></>,
  cards: <><rect x="4" y="6" width="11" height="15" rx="2" /><path d="M9.5 3.9 17 2.2a2 2 0 0 1 2.4 1.5l2.3 10.2a2 2 0 0 1-1.5 2.4l-2.2.5" /></>,
  'dealer-button': <><circle cx="12" cy="12" r="9" /><path d="M10 8h1.8a4 4 0 0 1 0 8H10Z" /></>,
  blinds: <><circle cx="8.5" cy="14.5" r="5.5" /><circle cx="15.5" cy="9.5" r="5.5" /></>,
  'all-in': <><path d="M12 11V3M8.5 6.5 12 3l3.5 3.5" /><ellipse cx="12" cy="16" rx="7" ry="2.6" /><path d="M5 16v2.4c0 1.44 3.13 2.6 7 2.6s7-1.16 7-2.6V16" /></>,
  'felt-table': <><ellipse cx="12" cy="12" rx="9.5" ry="6.5" /><ellipse cx="12" cy="12" rx="5.8" ry="3.3" /></>,
  'timer-poker': <><path d="M9.5 2h5" /><path d="M12 2v3" /><circle cx="12" cy="13.5" r="8" /><path d="M12 9.5v4l2.6 1.6" /></>,
  // ── GTO 도구 타일 글리프(2026-10-06 오너 시안 '자주 쓰는 도구', 자체 제작) ─────────────
  //   선은 currentColor(회청), 포인트만 --icon-accent(파랑). 변수가 없는 자리(도구 리스트 행)에서는 currentColor 한 색으로 떨어진다.
  //   ⚠ 겹친 카드는 mask/clipPath(id) 대신 **뒤 카드의 보이는 선만** 그렸다 — 탭 keep-alive 로 display:none 인 판의 id 참조가 끊기는 부류를 피한다.
  //   크기: 2026-10-06 검토 P3 — 카드 두 장의 높이를 다른 세 글리프(약 19/24)에 맞추고 스페이드를 키웠다(0.34→0.44 · 0.36→0.46).
  'spot-cards': <><path d="M7.28 18.12 L6.13 18.37 L5.53 18.31 L4.96 18.07 L4.5 17.66 L4.18 17.15 L1.62 6.02 L1.66 5.41 L1.9 4.84 L2.3 4.38 L2.83 4.06 L9.4 2.52 L10.01 2.48 L10.61 2.63 L11.13 2.96 L11.52 3.43" /><rect x="9.99" y="5.48" width="10.81" height="15.18" rx="1.95" transform="rotate(9 15.39 13.06)" /><path d={SPADE_D} transform="translate(15.39 13.29) rotate(9) scale(.44) translate(-12 -11.5)" style={ACCENT_FILL} /></>,
  'range-grid': <>{[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => {
    const hot = (r === 0 && c === 3) || (r === 2 && c === 1);
    return <rect key={`${r}${c}`} x={2.35 + c * 5.1} y={4.9 + r * 5.1} width="4" height="4" rx=".9" style={hot ? ACCENT_FILL : DIM_FILL} />;
  }))}</>,
  'push-fold': <><path d="M12 2.2 15.6 6.6H8.4Z" style={ACCENT_SOLID} /><path d="M12 6.6v4.6" style={ACCENT_STROKE} /><path d="M12 11.2c0 2.8-4.2 2.4-5.4 5.7M12 11.2c0 2.8 4.2 2.4 5.4 5.7" /><circle cx="5.4" cy="19" r="2.4" /><circle cx="18.6" cy="19" r="2.4" /></>,
  'hand-scan': <><path d="M17.5 11V4.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h5.5" /><path d={SPADE_D} transform="translate(10.75 10.9) scale(.46) translate(-12 -11.5)" fill="currentColor" stroke="none" /><circle cx="16.6" cy="17" r="3.4" style={ACCENT_STROKE} /><path d="m19.1 19.5 2.5 2.5" style={ACCENT_STROKE} /></>,
  // ── 리디자인 스파인 공통 글리프(자체 제작) ────────────────────────────────
  // 2026-09-24 — 여기 있던 comment·eye·bookmark·flame·target·wallet·gift·check-double·map-pin·log-out 과 위 trophy 는 지웠다.
  //   아래 Icon() 은 LUCIDE 를 PATHS 보다 먼저 보므로 같은 이름이 LUCIDE 에 있으면 이 칸은 **한 번도 그려지지 않는다**(죽은 바이트).
  //   ⚠ 되살리려면 LUCIDE 쪽 항목을 빼야 이긴다 — 두 곳에 같은 이름을 두지 마라.
};

// 범용 이름 → lucide-react 컴포넌트(트리셰이킹: 여기 임포트된 것만 번들에 포함)
const LUCIDE: Partial<Record<IconName, LucideIcon>> = {
  close: X, back: ChevronLeft, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
  'chevron-down': ChevronDown, 'chevron-up': ChevronUp, search: Search, plus: Plus, minus: Minus,
  maximize: Maximize2, minimize: Minimize2,   // 장부 전체화면 토글
  gavel: Gavel,                               // 2026 TDA 규칙(토너먼트 판정)
  check: Check, 'check-circle': CheckCircle2, trash: Trash2, edit: Pencil, star: Star,
  heart: Heart, alert: AlertTriangle, info: Info, lock: Lock, smartphone: Smartphone, user: User, users: Users,
  bell: Bell, qr: QrCode, calendar: Calendar, clock: Clock, settings: Settings, share: Share2,
  filter: Filter, image: Image, download: Download, external: ExternalLink, menu: Menu,
  home: Home, refresh: RefreshCw, copy: Copy, send: Send, comment: MessageCircle, mail: Mail, eye: Eye,
  bookmark: Bookmark, flame: Flame, target: Target, wallet: Wallet, gift: Gift,
  'check-double': CheckCheck, 'map-pin': MapPin, 'log-out': LogOut, trophy: Trophy,
  ticket: Ticket, phone: Phone, printer: Printer, chart: BarChart3, medal: Medal, cart: ShoppingCart, crown: Crown,
  // ── ICON-2 이모지 소탕 확장분 ─────────────────────────────────────────────
  lightbulb: Lightbulb,          // 💡 팁·코치마크
  clipboard: ClipboardList,      // 📋 프리셋·불러오기·약관 항목
  play: Play,                    // ▶ 클락 START·리플레이 재생 (내비 화살표는 chevron-* 를 쓴다)
  pause: Pause,                  // ⏸ 클락 STOP·일시정지
  link: Link2,                   // 🔗 공유 링크·회원 연결(alias)
  megaphone: Megaphone,          // 📢📣 공지·외치기·광고 슬롯
  undo: Undo2,                   // ↩ 레벨 되돌리기
  map: MapIcon,                  // 🗺 길찾기·주소
  gem: Gem,                      // 💎 리그 티어 사다리(색으로 등급 구분)
  'wifi-off': WifiOff,           // 📡 오프라인 배너
  radio: Radio,                  // 📡 실시간 정산 현황(리그)
  dice: Dices,                   // 🎲 사이드 게임
  package: Package,              // 📦 내 판매목록·거래 매물
  ban: Ban,                      // 🚫 신고 숨김·금지 행위
  pin: Pin,                      // 📌 보완 추천·관련 법령
  sparkles: Sparkles,            // ✨🤖 AI 기능 마커(NURI AI 리포트·초안·점검)
  zap: Zap,                      // ⚡ 부스트·빠른 입력(직전과 동일)
  tv: Tv,                        // 📺 클락 TV 송출
  volume: Volume2,               // 🔊🔈 클락 사운드 켜짐
  'volume-off': VolumeX,         // 🔇 클락 음소거
  'trending-up': TrendingUp,     // 📈 상승 인사이트
  store: Store,                  // 🏪 매장 온보딩
  'book-open': BookOpen,         // 📖 운영 가이드
  archive: Archive,              // 📚 지난 시즌
  scale: Scale,                  // ⚖️ 제재 기준
  building: Building2,           // 🏢 사업자 정보
  hand: Hand,                    // 🙋 참가(바인) 신청 — 손드는 동작
  flag: Flag,                    // 🏁 파이널·정산 완료
  'eye-off': EyeOff,             // 🕶 섀도우밴
  clapperboard: Clapperboard,    // 🎬 핸드 리플레이
  timer: Timer,                  // ⏱ 클락(스톱워치) — timer-poker 는 포커 도메인 전용 글리프
  alarm: AlarmClock,             // ⏰ 시작 알림·곧 시작
  banknote: Banknote,            // 💵 현금 결제수단·요금 한도
  briefcase: Briefcase,          // 👔 공동 업주(사장님) 초대
  'shield-alert': ShieldAlert,   // 🔞 건전 이용 안내
  bomb: Bomb,                    // 🧨 킬스위치(매장 영구 삭제)
  'arrow-up-right': ArrowUpRight,   // ↗ 발급(보냄)
  'arrow-down-left': ArrowDownLeft, // ↘ 사용(받음)
  door: DoorOpen,                // 🚪 단골 입문 배지
  'calendar-check': CalendarCheck, // 🔥(7일 개근) 연속 출석 배지
  circle: Circle,                // ⚪🟡 회원 상태 표식(색으로 상태 구분)
  notebook: NotebookText,        // 📒 장부 연동
  // ── ICON-3 이모지 전수 점검 소탕분(2026-08-30) ────────────────────────────
  // ⌘(U+2318)은 컬러 이모지 폰트에 없는 '기타 기술 기호'다. 실측(e2e/emoji-glyphs.spec.ts)에서
  // 색수 1 = 단색 폰트 폴백으로 확인됐고, 그 폰트는 OS 마다 있고 없고가 갈린다(안드로이드에서
  // 두부로 떨어질 수 있다 — 유저의 99% 가 모바일이다). 뜻은 그대로 두고 글리프만 SVG 로 옮긴다.
  command: Command,              // ⌘ 검색 단축키 표기
  // ── GTO 탭 도구 카탈로그(2026-09-03) — 도구 아이콘은 ToolsPanel TOOLS 에서 이름으로 참조 ────
  'arrow-up-from-line': ArrowUpFromLine, // 출처 배지(tools/SourceBadge) — 푸시·폴드 도구 타일은 2026-10-06 부터 'push-fold' 글리프
  swords: Swords,                      // 어그레션 차트(공격 빈도)
  dumbbell: Dumbbell,                  // 프리플랍 트레이너(반복 훈련)
  brain: Brain,                        // 포스트플랍 트레이너(상황 판단 퀴즈)
  'book-a': BookA,                     // 홀덤 용어사전(사전 = 책 + A)
  'book-x': BookX,                     // 오답 노트(책 + X)
  'git-compare': GitCompare,           // 레인지 vs 레인지(양쪽 비교)
  percent: Percent,                    // 팟 오즈(필요 승률 %)
  'shield-check': ShieldCheck,         // MDF·블러프(최소 방어)
  handshake: Handshake,                // 딜 계산기(남은 사람끼리 합의)
  sigma: Sigma,                        // EV 계산기(기대값 Σ)
  layers: Layers,                      // 콤보 계산기(경우의 수 겹)
  gauge: Gauge,                        // M존 계산기(압박 지수 게이지)
  'piggy-bank': PiggyBank,             // 뱅크롤 관리(자금 — 'wallet' 은 이용권 지갑이라 분리)
  'trending-up-down': TrendingUpDown,  // 분산 시뮬(오르내리는 폭)
  coins: Coins,                        // 칩 분배기(칩 = 코인)
  'list-ordered': ListOrdered,         // 블라인드 생성기(레벨 번호표)
  'chart-pie': ChartPie,               // 상금 분배(파이 나누기)
  hourglass: Hourglass,                // 종료시간 예측(남은 시간)
  table: Table,                        // 레인 '차트'(보고 외우는 표)
  'graduation-cap': GraduationCap,     // 레인 '트레이닝'
  microscope: Microscope,              // 레인 '분석'
  calculator: Calculator,              // 레인 '계산기'
  // 내 정보 통합(2026-09-04) — 헤더 유저 메뉴(내 정보·도구·관리자 설정·테마)
  'circle-user': CircleUserRound, wrench: Wrench, shield: Shield, sun: Sun, moon: Moon,
};
// 채움 변형은 lucide 원형에 fill 지정으로 표현
// ── 채운 아이콘 = heroicons solid (2026-08-30, 오너 지시로 heroicons 도입) ──────
// 종전에는 lucide 아웃라인에 fill="currentColor" 를 먹여 채운 척했다. 그런데 lucide 는
// stroke 2 가 도형 **바깥 가장자리**에 얹히는 구조라, 채우는 순간 같은 글리프의 아웃라인 판보다
// 2px 뚱뚱해지고 모서리가 뭉갠다(별 뾰족한 끝·하트 골이 특히 심하다).
// heroicons solid 는 처음부터 채움용으로 그린 단일 패스라 stroke 가 없다 — 여기가 제자리다.
//
// ⛔ 두 팩을 아무 데나 섞지 마라. lucide 는 stroke 2 / heroicons 외곽선(Outline) 팩은 1.5 라
//    같은 화면에 나란히 두면 굵기가 갈려 조잡해진다(2026-08-29 에 이모지 300곳을 SVG 로
//    통일한 이유가 정확히 그것이다). 그래서 **아웃라인은 lucide 로 통일**하고,
//    heroicons 는 stroke 가 아예 없는 solid 만 쓴다 — 굵기가 갈릴 여지 자체를 없앤다.
// 2026-10-07 번들 감축 PR A ②: 두 글리프만 쓰려고 @heroicons/react(첫 화면 vendor-react 안 ~0.9KB gz — 컴포넌트 래퍼·forwardRef)
//   를 싣던 것을 path 데이터 직접 인라인으로 바꿨다. path·속성은 heroicons 2.2.0 24/solid 의 StarIcon·HeartIcon 원문 그대로다
//   (MIT 고지는 위 라이선스 블록에 유지). 렌더 DOM 도 같다 — svg 속성(xmlns·viewBox·fill·aria-hidden·data-slot) + path 하나.
const HERO_SOLID: Partial<Record<IconName, SVGProps<SVGPathElement>>> = {
  'star-fill': {
    fillRule: 'evenodd',
    d: 'M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z',
    clipRule: 'evenodd',
  },
  'heart-fill': {
    d: 'm11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z',
  },
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 20, strokeWidth = 2, className, ...rest }: IconProps) {
  const Solid = HERO_SOLID[name];
  if (Solid) {
    // solid 는 stroke 가 없다 — strokeWidth 를 넘기지 않는다(넘기면 도형이 다시 뚱뚱해진다).
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-slot="icon"
        width={size} height={size} className={className} {...rest}>
        <path {...Solid} />
      </svg>
    );
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
