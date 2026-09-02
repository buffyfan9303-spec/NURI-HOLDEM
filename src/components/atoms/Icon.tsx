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
import type { ComponentType, ReactElement, SVGProps } from 'react';
import { StarIcon as StarSolid, HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import {
  X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, Plus, Minus, Check,
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
  Grid3x3, ArrowUpFromLine, Swords, Dumbbell, Brain, BookA, BookX, ScanSearch, GitCompare, Percent,
  ShieldCheck, Handshake, Sigma, Layers, Gauge, PiggyBank, TrendingUpDown, Coins, ListOrdered,
  ChartPie, Hourglass, Table, GraduationCap, Microscope, Calculator,
  type LucideIcon,
} from 'lucide-react';

export type IconName =
  | 'close' | 'back' | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'chevron-up'
  | 'search' | 'plus' | 'minus' | 'check' | 'check-circle'
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
  | 'grid-3x3' | 'arrow-up-from-line' | 'swords' | 'dumbbell' | 'brain' | 'book-a' | 'book-x' | 'scan-search'
  | 'git-compare' | 'percent' | 'shield-check' | 'handshake' | 'sigma' | 'layers' | 'gauge' | 'piggy-bank'
  | 'trending-up-down' | 'coins' | 'list-ordered' | 'chart-pie' | 'hourglass'
  | 'table' | 'graduation-cap' | 'microscope' | 'calculator';

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
  'grid-3x3': Grid3x3,                 // 프리플랍 레인지 차트(13×13 매트릭스)
  'arrow-up-from-line': ArrowUpFromLine, // 푸시·폴드 차트(라인에서 올인으로 밀어 올림)
  swords: Swords,                      // 어그레션 차트(공격 빈도)
  dumbbell: Dumbbell,                  // 프리플랍 트레이너(반복 훈련)
  brain: Brain,                        // 포스트플랍 트레이너(상황 판단 퀴즈)
  'book-a': BookA,                     // 홀덤 용어사전(사전 = 책 + A)
  'book-x': BookX,                     // 오답 노트(책 + X)
  'scan-search': ScanSearch,           // GTO 핸드 분석(내 패 정밀 스캔)
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
};
// 채움 변형은 lucide 원형에 fill 지정으로 표현
// ── 채운 아이콘 = heroicons solid (2026-08-30, 오너 지시로 heroicons 도입) ──────
// 종전에는 lucide 아웃라인에 fill="currentColor" 를 먹여 채운 척했다. 그런데 lucide 는
// stroke 2 가 도형 **바깥 가장자리**에 얹히는 구조라, 채우는 순간 같은 글리프의 아웃라인 판보다
// 2px 뚱뚱해지고 모서리가 뭉갠다(별 뾰족한 끝·하트 골이 특히 심하다).
// heroicons solid 는 처음부터 채움용으로 그린 단일 패스라 stroke 가 없다 — 여기가 제자리다.
//
// ⛔ 두 팩을 아무 데나 섞지 마라. lucide 는 stroke 2 / heroicons outline 은 1.5 라
//    같은 화면에 나란히 두면 굵기가 갈려 조잡해진다(2026-08-29 에 이모지 300곳을 SVG 로
//    통일한 이유가 정확히 그것이다). 그래서 **아웃라인은 lucide 로 통일**하고,
//    heroicons 는 stroke 가 아예 없는 solid 만 쓴다 — 굵기가 갈릴 여지 자체를 없앤다.
const HERO_SOLID: Partial<Record<IconName, ComponentType<SVGProps<SVGSVGElement>>>> = {
  'star-fill': StarSolid,
  'heart-fill': HeartSolid,
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 20, strokeWidth = 2, className, ...rest }: IconProps) {
  const Solid = HERO_SOLID[name];
  if (Solid) {
    // solid 는 stroke 가 없다 — strokeWidth 를 넘기지 않는다(넘기면 도형이 다시 뚱뚱해진다).
    return <Solid width={size} height={size} className={className} aria-hidden {...rest} />;
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
