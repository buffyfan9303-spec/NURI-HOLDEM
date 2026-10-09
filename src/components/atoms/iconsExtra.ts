// src/components/atoms/iconsExtra.ts — 첫 화면에 안 쓰는 lucide 아이콘(2026-10-07 번들 감축 PR A ③).
// 이 모듈은 **동적 import 로만** 불린다(iconsExtraLoader.ts). 첫 화면(entry) 정적 그래프에서 쓰는 이름은 Icon.tsx 의
// LUCIDE(핵심)에 남고, 여기 옮긴 것은 lazy 청크(도구·장부·클락·관리 화면 등)에서만 쓰인다 — iconsCore.contract.test.ts 가 잠근다.
// 새 아이콘: 첫 화면 파일에서 쓰면 Icon.tsx LUCIDE 에, 아니면 여기에 한 줄. 두 곳에 같은 이름을 두지 마라.
// 라이선스 고지(Lucide ISC)는 Icon.tsx 머리에 있다.
import type { LucideIcon } from 'lucide-react';
import {
  Maximize2, Minimize2, Gavel, Plus, Minus, Trash2, Pencil, Star, Heart, Smartphone,
  QrCode, Share2, Filter, Image, Download, ExternalLink, Copy, Send, Eye, Bookmark, Flame, Target, Wallet,
  CheckCheck, Phone, Printer, BarChart3, Medal, ShoppingCart, Crown,
  Lightbulb, ClipboardList, Play, Pause, Undo2, Gem, Package, Ban, Pin, Sparkles, Zap, Tv, Volume2, VolumeX,
  TrendingUp, BookOpen, Archive, Scale, Building2, Flag, EyeOff, Clapperboard,
  Timer, AlarmClock, Banknote, Briefcase, ShieldAlert, Bomb, ArrowUpRight, ArrowDownLeft,
  DoorOpen, Circle, Command,
  ArrowUpFromLine, Swords, Dumbbell, Brain, BookA, BookX, GitCompare, Percent,
  ShieldCheck, Sigma, Layers, Gauge, PiggyBank, TrendingUpDown, Coins, ListOrdered,
  ChartPie, Hourglass, GraduationCap, Microscope, Calculator,
} from 'lucide-react';
import type { IconName } from './Icon';

export const EXTRA: Partial<Record<IconName, LucideIcon>> = {
  maximize: Maximize2, minimize: Minimize2,   // 장부 전체화면 토글
  gavel: Gavel,                               // 2026 TDA 규칙(토너먼트 판정)
  plus: Plus, minus: Minus, trash: Trash2, edit: Pencil, star: Star, heart: Heart, smartphone: Smartphone,
  qr: QrCode, share: Share2, filter: Filter, image: Image, download: Download, external: ExternalLink,
  copy: Copy, send: Send, eye: Eye, bookmark: Bookmark, flame: Flame, target: Target, wallet: Wallet,
  'check-double': CheckCheck, phone: Phone, printer: Printer, chart: BarChart3, medal: Medal, cart: ShoppingCart, crown: Crown,
  // ── ICON-2 이모지 소탕 확장분 ─────────────────────────────────────────────
  lightbulb: Lightbulb,          // 💡 팁·코치마크
  clipboard: ClipboardList,      // 📋 프리셋·불러오기·약관 항목
  play: Play,                    // ▶ 클락 START·리플레이 재생 (내비 화살표는 chevron-* 를 쓴다)
  pause: Pause,                  // ⏸ 클락 STOP·일시정지
  undo: Undo2,                   // ↩ 레벨 되돌리기
  gem: Gem,                      // 💎 리그 티어 사다리(색으로 등급 구분)
  package: Package,              // 📦 내 판매목록·거래 매물
  ban: Ban,                      // 🚫 신고 숨김·금지 행위
  pin: Pin,                      // 📌 보완 추천·관련 법령
  sparkles: Sparkles,            // ✨🤖 AI 기능 마커(NURI AI 리포트·초안·점검)
  zap: Zap,                      // ⚡ 부스트·빠른 입력(직전과 동일)
  tv: Tv,                        // 📺 클락 TV 송출
  volume: Volume2,               // 🔊🔈 클락 사운드 켜짐
  'volume-off': VolumeX,         // 🔇 클락 음소거
  'trending-up': TrendingUp,     // 📈 상승 인사이트
  'book-open': BookOpen,         // 📖 운영 가이드
  archive: Archive,              // 📚 지난 시즌
  scale: Scale,                  // ⚖️ 제재 기준
  building: Building2,           // 🏢 사업자 정보
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
  circle: Circle,                // ⚪🟡 회원 상태 표식(색으로 상태 구분)
  // ── ICON-3 이모지 전수 점검 소탕분(2026-08-30) — ⌘ 은 컬러 이모지 폰트에 없어 안드로이드에서 두부가 될 수 있다
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
  sigma: Sigma,                        // EV 계산기(기대값 Σ)
  layers: Layers,                      // 콤보 계산기(경우의 수 겹)
  gauge: Gauge,                        // M존 계산기(압박 지수 게이지)
  'piggy-bank': PiggyBank,             // 뱅크롤 관리(자금 — 'wallet' 은 이용권 지갑이라 분리)
  'trending-up-down': TrendingUpDown,  // 분산 시뮬(오르내리는 폭)
  coins: Coins,                        // 칩 분배기(칩 = 코인)
  'list-ordered': ListOrdered,         // 블라인드 생성기(레벨 번호표)
  'chart-pie': ChartPie,               // 상금 분배(파이 나누기)
  hourglass: Hourglass,                // 종료시간 예측(남은 시간)
  'graduation-cap': GraduationCap,     // 레인 '트레이닝'
  microscope: Microscope,              // 레인 '분석'
  calculator: Calculator,              // 레인 '계산기'
};
