// src/components/features/CommunityShoutBar.tsx
//
// 오너 #8 — 커뮤니티 '외치기': 활동점수로 사는 짧은 강조 메시지.
//
// ── 무엇을 파는가(2026-08-30 슬롯 전환 · 서버 20260830e~h) ────────────────────
//  파는 것은 '기간'이 아니라 **20초 방송 1회**다. 구매하면 서버가 그 자리에서 plays_at 을
//  '앞사람 방송 끝'으로 찍고 expires_at = plays_at + 20초를 준다. 즉 대기열이 말 그대로 대기열이고,
//  산 사람은 '내 차례가 몇 분 뒤인지'를 숫자로 알 수 있다. 등급은 둘뿐이다 —
//  기본(50점) / 하이라이트(150점, 색 선택). **전광판은 판매 중지**(행은 남아 있고 과거 기록도 그대로 뜬다).
//
// ── 노출 위치·순번의 근거 ────────────────────────────────────────────────────
//  · 위치 = 커뮤니티 서브탭 바로 아래(매장/게시판/실시간/랭킹 어디를 봐도 같은 자리).
//    '눈에 띄게'는 곧 '어느 화면에서도 보인다'는 뜻이라, 게시판 피드 안에 끼워 넣으면
//    다른 서브탭 사용자에겐 아예 안 보이고 스크롤에도 금방 밀려난다.
//  · 진열 = **지금 방송 중인 1건만**(오너 지시 2026-08-30). 그 외에는 아무것도 송출하지 않는다 —
//    지난 외침도, 대기 중인 외침도, '대기열 N개 보기' 목록도 화면에 없다.
//    종전에는 ①대기열 전체를 펼쳐 볼 수 있었고 ②맨 앞 것이 아직 방송 전이어도 '몇 초 뒤 방송'
//    이라며 미리 띄웠다. 둘 다 '20초를 산다'는 상품 정의와 어긋난다 — 돈을 낸 20초가 아닌
//    시간에도 남의 외침이 화면을 차지하면, 파는 것이 슬롯이 아니라 '노출 전체'가 된다.
//    ⚠ 단 하나의 예외: **내가 산 외침의 순번**은 본인에게만 남긴다(§아래 '내 차례' 참고).
//  · 순번 = **서버가 찍어 준 plays_at 창**이다. 지금 방송 중 = plays_at <= now < expires_at.
//    ⚠ 종전에는 floor(now/20s) % n 으로 클라이언트가 순번을 '유도'했다. 그건 서버가 방송 시각을
//    정하기 전 이야기고, 지금은 **대기열과 화면이 어긋나는 원인**이다(목록 길이가 사람마다 다르면
//    같은 순간에 서로 다른 외침을 보고, 방금 산 사람의 '내 차례'와도 맞지 않는다).
//    시각으로 판정하면 모든 사람이 같은 순간에 같은 외침을 본다 — 시계는 공유되기 때문이다.
//  · 빈 자리 = **기본 안내 문구 롤링**(오너 지시 2026-08-30). 방송 중인 외침이 없는 동안 자리를
//    비워 두지 않고 서비스 안내를 같은 20초 리듬으로 돌린다. 리듬을 맞추는 이유는 두 가지다 —
//    ①외침이 들어오고 나가는 순간과 문구가 바뀌는 순간이 같은 격자 위에 있어 화면이 한 박자로 움직이고,
//    ②격자를 **벽시계**(floor(now/20s))로 잡으면 접속 시각이 달라도 모두가 같은 순간에 같은 문구를 본다.
//  · 전환은 마퀴가 아니라 **경계에서 한 번의 opacity 크로스페이드**다. 상시 움직이는 배너가 아니라
//    모션 헌법의 무한 루프 예외를 새로 만들지 않는다. animation 이 아니라 transition 을 쓰는데,
//    display 토글(탭 keep-alive)로 **재생이 되살아나지 않기 때문**이다 — animation 이면
//    탭 재방문마다 다시 재생돼 .tab-pane 무효화 목록에 등록해야 하고, 그러면 아예 안 보인다.
//    공간은 항상 예약돼 있다(CLS 0).
//
// ── 색(하이라이트 전용) ──────────────────────────────────────────────────────
//  새 팔레트를 만들지 않는다. 앱이 라이트/다크 양쪽으로 이미 정의해 둔 --tier-*-vivid 다섯 개를
//  그대로 쓴다(장식·비텍스트 3:1 기준으로 실측을 통과한 값들이다). 등급 스킨(TIER_SKIN)이 겉모습의
//  기본값을 들고 있고, 색은 그 **위에 세 지점만 덮어쓴다**(테두리·배경 그라데이션·아이콘).
//  글자색은 건드리지 않는다 — 본문은 항상 ink-primary 라 어떤 색을 골라도 가독성이 무너지지 않는다.
//
// ── 안전장치(전부 서버가 최종 판정) ──────────────────────────────────────────
//  차감·게시 원자성(buy_shout RPC 한 트랜잭션) · 프로필 행 잠금으로 중복 클릭 직렬화 ·
//  쿨다운 10분 · 하루 10회(상품 무관 합산) · 2~60자 · 기존 금칙어(content-filter)와 같은 카테고리 +
//  링크 차단 · 잔액 부족 거부 · 색은 gold 에서만. 클라이언트 검사는 같은 규칙을 '미리' 보여주기
//  위한 것이지 게이트가 아니다.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import { tierCss } from '../atoms/TierBadge';
import { useAuth } from '../../contexts/AuthContext';
import { promptLogin } from '../../lib/requireLogin';
import { filterContent } from '../../lib/content-filter';
import {
  getLiveShouts, buyShout, hideShout, getShoutRules, getMyPointBalance, getShopSkus,
  getShoutQueueInfo,
  SHOUT_COLORS, SHOUT_SLOT_SECONDS, DAILY_PURCHASE_CAP,
  RESERVE_MIN_LEAD_MIN, RESERVE_MAX_LEAD_DAYS,
  type Shout, type ShoutRules, type PointBalance, type ShopSku, type ShoutTier, type ShoutColor,
} from '../../api/community';

// ⚠ 서버 shout_rules() 와 동기. 낮게 두면 표시가가 실제 청구가보다 싸 보인다
//   (2026-08-29: 30 → 200 · 2026-08-30 슬롯 전환: 200 → 50). ttlHours 는 슬롯 전환으로 항상 0.
const DEFAULT_RULES: ShoutRules = { cost: 50, cooldownMinutes: 10, dailyCap: 3, maxLen: 60, minLen: 2, ttlHours: 0 };

/** 'shout_gold' → 'gold' (전광판 shout_board 는 판매 중지지만 과거 기록 매핑엔 그대로 통한다) */
const tierOfSku = (key: string): ShoutTier => (key.replace(/^shout_/, '') as ShoutTier);

/** 20초 슬롯을 ms 로. 대기열 경계도, 기본 문구 롤링 격자도 같은 값을 쓴다(한 박자로 움직이게). */
const SLOT_MS = SHOUT_SLOT_SECONDS * 1000;

/**
 * 방송 중인 외침이 없을 때 이 자리에서 20초마다 도는 **기본 안내 문구**.
 *
 * ── 왜 코드에 하드코딩인가(app_settings 로 빼지 않는 이유) ────────────────────
 *  선례로 든 `app_settings.tabbar_autohide_v2` 는 성격이 다르다. 그건 **킬스위치**다 —
 *  배포 없이 즉시 꺼야 하는 동작 토글이라 DB 에 둘 값어치가 있다. 여기 있는 건 동작이 아니라
 *  **제품 카피**이고, 카피는 세 가지 검수를 통과해야 화면에 나갈 수 있다:
 *    ① §28(환전·현금·수익 계열 금지 / 참가비·상금은 가격 정보라 허용)
 *    ② UI 이모지 금지 — 이모지는 폰트 리소스라 기기마다 다른 그림이 뜨고 테마 토큰을 못 따른다
 *    ③ 과장 금지(광고가 아니라 안내로 읽혀야 한다)
 *  이 셋은 코드 리뷰에서만 걸린다. app_settings 로 빼면 **커뮤니티 최상단이라는 앱에서 가장 눈에
 *  띄는 자리**에 리뷰도 금칙어 필터(filterContent)도 거치지 않은 자유 텍스트가 바로 렌더된다 —
 *  유저 외침에는 필터를 걸어 두고 운영자 문구만 무검열로 통과시키는 셈이라 방향이 거꾸로다.
 *  게다가 이 배너는 커뮤니티 전 서브탭에 상주하므로 조회가 한 번 더 늘고(현재 2회), 그 대가로 얻는 건
 *  '거의 바뀌지 않는 문구'의 무배포 수정뿐이다. 진짜로 공지가 필요하면 이미 공지(AnnouncePanel)가 있다.
 *  → 문구를 바꾸려면 이 배열 한 줄을 고치면 된다. 나중에 정말 필요해지면 이 상수를 폴백으로 두고
 *    getAppSetting 오버라이드를 얹는 것이 한 줄 변경이라, 지금 앞당겨 넣을 이유가 없다.
 *
 * ── 문구 규칙 ────────────────────────────────────────────────────────────────
 *  · 전부 앱에 **실제로 있는 화면**을 가리킨다(홈 일정 탐색 · 라이브 · GTO · 체크인 QR · 활동점수).
 *    없는 기능을 안내하면 그 순간 광고가 된다.
 *  · 금액은 참가비(가격 정보)만. 상금·수익·환전 프레이밍은 넣지 않는다(§28).
 *  · 6개 = 2분 한 바퀴. 같은 문구가 금방 되돌아오면 안내가 아니라 배너로 읽힌다.
 *  · ⚠ **길이 상한이 곧 레이아웃 계약이다: 한 줄 26자 이내.**
 *    실측(412px 첫 스크린샷)에서 40자짜리 문구가 3줄로 감겨, 20초마다 카드 높이가 한 줄씩
 *    들썩였다 — 오너가 가장 싫어하는 '주르륵 밀리는' 움직임이 정확히 그것이다.
 *    26자면 좁은 기기(320px)에서도 두 줄 안에 들어온다. 아래 min-h-[2.5rem] 로 두 줄을
 *    미리 잡아 두므로 한 줄짜리 문구와 두 줄짜리 문구가 같은 높이를 차지한다(회전 중 CLS 0).
 *    자르지(line-clamp) 않는 이유: 자르면 글자가 조용히 사라진다. 상한을 넘기면 눈에 보이게
 *    카드가 커지는 편이 낫다 — 그래야 다음 사람이 고칠 수 있다.
 */
const IDLE_LINES: readonly string[] = [
  '홈 탭 일정 탐색에서 참가비로 대회를 골라보세요',
  '라이브 탭에서 진행 중인 게임을 볼 수 있어요',
  '매장에 도착하면 체크인 QR을 찍어보세요',
  'GTO 탭에서 프리플랍 레인지를 볼 수 있어요',
  '활동점수는 접속·글쓰기·댓글로 쌓여요',
  '외치기로 내 한마디를 20초 동안 방송해요',
];

// ── 등급별 겉모습 ───────────────────────────────────────────────────────────
// 값(가격)은 전부 서버(shop_skus)에서 오고, 여기 있는 건 **색뿐이다.**
// gold 계열은 이미 명예의 전당·시즌 우승 배지가 쓰는 조합을 그대로 재사용한다
// (border-gold-400/40 + bg-gold-300/[0.06] + text-gold-300) — 새 색 규칙을 만들지 않기 위해서.
// 'board' 는 판매 중지지만 **과거 외침이 이 스킨으로 계속 렌더돼야 하므로 남긴다.**
const TIER_SKIN: Record<ShoutTier, { box: string; icon: string; text: string }> = {
  basic: {
    box:  'border-accent-400/50 bg-gradient-to-r from-accent-300/[0.12] to-transparent',
    icon: 'text-accent-300', text: 'text-sm',
  },
  gold: {
    box:  'border-gold-400/50 bg-gradient-to-r from-gold-300/[0.10] to-transparent',
    icon: 'text-gold-300', text: 'text-sm',
  },
  // 2026-08-30(20260830n) 상위 티어 2종.
  // ⚠ 새 팔레트를 끌어오지 않는다(기본 Tailwind 의 sky 같은 색은 이 앱의 디자인 시스템에 없다).
  //   겉모습의 기본값은 basic 과 같게 두고, 색은 아래 TIER_VAR 의 **등급 토큰으로 인라인 덮어쓰기**한다
  //   — 하이라이트의 색 선택이 쓰는 것과 정확히 같은 경로다(colorBoxStyle/colorIconStyle).
  long: {
    box:  'border-accent-400/50 bg-gradient-to-r from-accent-300/[0.12] to-transparent',
    icon: 'text-accent-300', text: 'text-sm',
  },
  reserve: {
    box:  'border-accent-400/50 bg-gradient-to-r from-accent-300/[0.12] to-transparent',
    icon: 'text-accent-300', text: 'text-sm',
  },
  board: {
    box:  'border-gold-400 bg-gradient-to-r from-gold-300/[0.16] via-accent-300/[0.06] to-transparent',
    icon: 'text-gold-300', text: 'text-base',
  },
};
const tierSkin = (t?: ShoutTier) => TIER_SKIN[t ?? 'basic'] ?? TIER_SKIN.basic;

/** 고를 수 있는 색 → 이미 존재하는 등급색 토큰. 새 팔레트를 만들지 않는다. */
const COLOR_VAR: Record<ShoutColor, string> = {
  gold: '--tier-gold-vivid',
  blue: '--tier-blue-vivid',
  green: '--tier-green-vivid',
  purple: '--tier-purple-vivid',
  rose: '--tier-rose-vivid',
};
const COLOR_LABEL: Record<ShoutColor, string> = {
  gold: '골드', blue: '블루', green: '그린', purple: '퍼플', rose: '로즈',
};

/**
 * 등급 자체가 색을 갖는 경우(2026-08-30 · 20260830n).
 * 길게 = 그린('오래 머무는 것') · 예약 = 블루('약속된 시각'). 둘 다 색 선택이 쓰는 것과 같은
 * --tier-*-vivid 토큰이라, 새 색을 만들지 않고도 세 등급이 한눈에 갈린다.
 */
const TIER_VAR: Partial<Record<ShoutTier, string>> = {
  long:    '--tier-green-vivid',
  reserve: '--tier-blue-vivid',
};

/**
 * 이 외침을 칠할 토큰 하나. 우선순위는 **고른 색 > 등급 고유색 > 없음**이다 —
 * 색은 하이라이트에서만 고를 수 있으므로 둘이 동시에 있을 일은 없지만, 규칙을 한 곳에 못 박아 둔다.
 */
const shoutVar = (tier?: ShoutTier | null, color?: ShoutColor | null): string | undefined =>
  (color ? COLOR_VAR[color] : undefined) ?? (tier ? TIER_VAR[tier] : undefined);

/**
 * 색은 등급 스킨 '위에' 얹는다 — 테두리·배경 두 지점만 덮어쓴다.
 * 클래스(TIER_SKIN.box)를 그대로 두고 인라인으로 덮으므로, 색이 없으면 등급 기본 겉모습이 남는다.
 */
function colorBoxStyle(tier?: ShoutTier | null, color?: ShoutColor | null): CSSProperties | undefined {
  const v = shoutVar(tier, color);
  if (!v) return undefined;
  return {
    borderColor: tierCss(v, 0.55),
    backgroundImage: `linear-gradient(90deg, ${tierCss(v, 0.14)}, transparent)`,
  };
}
/** 아이콘은 '색으로만 등급을 알리는' 비텍스트 지점이라 vivid 를 알파 없이 쓴다(3:1 기준). */
function colorIconStyle(tier?: ShoutTier | null, color?: ShoutColor | null): CSSProperties | undefined {
  const v = shoutVar(tier, color);
  return v ? { color: tierCss(v) } : undefined;
}

const ms = (iso: string): number => new Date(iso).getTime();

/** '3분 뒤' — 대기 시간 안내. 20초 슬롯이라 초 단위가 실제로 의미가 있다. */
function waitLabel(remainMs: number): string {
  if (remainMs <= 1000) return '지금';
  const s = Math.ceil(remainMs / 1000);
  if (s < 60) return `${s}초 뒤`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}분 뒤`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분 뒤`;
}

/** 구매 결과·대기열 안내에 쓰는 한 문장 */
function airLabel(playsAt: string): string {
  const left = ms(playsAt) - Date.now();
  return left <= 1000 ? '지금 바로 방송돼요' : `${waitLabel(left)} 방송돼요`;
}

/**
 * 대기열 시계 — **다음으로 화면이 바뀌어야 하는 시각에만** 다시 그린다.
 *
 * setInterval 로 1초마다 도는 것도, 인덱스를 누적하는 것도 쓰지 않는다.
 *  (a) 초당 리렌더는 이 배너가 커뮤니티 전 서브탭에 상주하므로 그냥 낭비고,
 *  (b) 인덱스 누적은 탭이 백그라운드일 때 브라우저가 타이머를 죽여 어긋난다.
 * 경계(plays_at / expires_at)만 골라 그 순간에 깨우면 둘 다 없고, 판정은 항상 시각 비교라
 * 탭을 오래 숨겼다 돌아와도 스스로 맞다.
 *
 * ⚠ 대기열이 비어도 멈추지 않는다 — 방송이 없는 동안은 **기본 문구가 20초 격자로 롤링**하기 때문이다.
 *   그때 깨어날 시각은 벽시계 격자의 다음 칸(floor(t/20s)*20s + 20s)이다. 누적 인덱스가 아니라
 *   시각에서 매번 다시 계산하므로, 탭을 오래 숨겼다 돌아와도 남들과 같은 문구에 정렬돼 있다.
 */
function useShoutClock(list: Shout[]): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: number | undefined;
    const arm = () => {
      const t = Date.now();
      let next = Number.POSITIVE_INFINITY;
      let onAir = false;
      for (const s of list) {
        const p = ms(s.playsAt);
        const e = ms(s.expiresAt);
        if (p <= t && t < e) onAir = true;
        if (p > t && p < next) next = p;
        if (e > t && e < next) next = e;
      }
      // 방송 중인 것이 없으면 기본 문구가 도는 중이다 — 격자의 다음 칸에서도 깨워야 한다.
      if (!onAir) next = Math.min(next, Math.floor(t / SLOT_MS) * SLOT_MS + SLOT_MS);
      if (!Number.isFinite(next)) return;   // 방송 중인데 뒤가 없다 — 만료 시각에만 깨면 된다(위에서 잡힘)
      // +30ms: 경계에 정확히 걸쳐 깨면 비교가 한 틱 먼저라 같은 화면이 다시 나온다
      id = window.setTimeout(() => { setNow(Date.now()); arm(); }, Math.max(50, next - t) + 30);
    };
    const onVis = () => {
      if (document.hidden) return;
      if (id) { clearTimeout(id); id = undefined; }
      setNow(Date.now());
      arm();
    };
    arm();
    document.addEventListener('visibilitychange', onVis);
    return () => { if (id) clearTimeout(id); document.removeEventListener('visibilitychange', onVis); };
  }, [list]);
  return now;
}

/** 색 고르기 — 하이라이트에서만 뜬다 */
function ColorPicker({ value, onChange }: { value: ShoutColor; onChange: (c: ShoutColor) => void }) {
  return (
    <div>
      <p className="text-2xs font-bold text-ink-secondary">색 고르기</p>
      <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="외침 색">
        {SHOUT_COLORS.map((c) => {
          const on = c === value;
          return (
            <button
              key={c} type="button" role="radio" aria-checked={on} aria-label={COLOR_LABEL[c]}
              onClick={() => onChange(c)}
              className={['flex items-center gap-1.5 rounded-badge border px-2 py-1 text-2xs font-bold transition-colors',
                on ? 'border-accent-300 bg-accent-300/[0.10] text-ink-primary'
                   : 'border-border-subtle bg-surface-high text-ink-secondary hover:border-accent-400/50'].join(' ')}
            >
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: tierCss(COLOR_VAR[c]) }} />
              {COLOR_LABEL[c]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 외치기 작성·구매 시트 — 커뮤니티 배너와 랭킹 상점이 같은 것을 연다 */
export function ShoutComposer({ open, onClose, onPosted }: { open: boolean; onClose: () => void; onPosted?: (s: Shout) => void }) {
  const toast = useToast();
  const { user, refreshProfile } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<ShoutRules>(DEFAULT_RULES);
  const [balance, setBalance] = useState<PointBalance | null>(null);
  // 등급 목록·가격은 서버 shop_skus 가 단일 출처다. 화면은 읽어서 보여주기만 한다.
  const [tiers, setTiers] = useState<ShopSku[]>([]);
  const [tier, setTier] = useState<ShoutTier>('basic');
  const [color, setColor] = useState<ShoutColor>('gold');
  // 지금 사면 언제 나가는가 — **서버가 계산한 다음 빈 자리**다(null = 아직 못 받음).
  // ⚠ 예전에는 max(expires_at) 으로 유추했다. 예약(20260830n)이 생기면 그 값은 며칠 뒤가 될 수
  //   있어 '내 차례 3일 뒤'라는 거짓말이 된다 — 실제로는 그 앞의 빈 자리에 들어간다.
  const [nextFreeAt, setNextFreeAt] = useState<number | null>(null);
  const [queueLen, setQueueLen] = useState(0);
  // 예약 등급 전용 — datetime-local 값('YYYY-MM-DDTHH:mm', 로컬 시각)
  const [reserveAt, setReserveAt] = useState('');

  useEffect(() => {
    if (!open) return;
    getShoutRules().then(setRules).catch(() => {});
    getMyPointBalance().then(setBalance).catch(() => {});
    getShopSkus()
      // 전광판(shout_board)은 판매 중지다. 서버가 active=false 로 이미 빼 주지만,
      // 화면에서도 한 번 더 막는다 — 누가 다시 active 를 켜도 '판매 중지'가 화면 규약으로 남게.
      .then((all) => setTiers(all.filter((s) => s.kind === 'shout' && s.key !== 'shout_board').sort((a, b) => a.sort - b.sort)))
      .catch(() => {});
    // 대기열 길이 — '내 차례가 언제인지'를 **사기 전에** 보여주기 위해서다.
    getLiveShouts(50).then((v) => setQueueLen(v.length)).catch(() => setQueueLen(0));
  }, [open]);
  useEffect(() => {
    if (open) { setText(''); setTier('basic'); setColor('gold'); setReserveAt(''); }
  }, [open]);

  const sel = tiers.find((s) => tierOfSku(s.key) === tier);
  // 서버 목록이 아직 없으면 기본 등급은 shout_rules() 값으로 버틴다(가격이 '—'로 비지 않게).
  const cost = sel?.price ?? (tier === 'basic' ? rules.cost : 0);
  const slotSec = sel?.durationSeconds || SHOUT_SLOT_SECONDS;
  const isReserve = tier === 'reserve';

  // 슬롯 길이가 등급마다 다르므로(20초/40초) 빈 자리 조회도 길이를 실어 보낸다.
  // 예약 등급에서는 '대기열의 다음 자리'가 의미 없어 조회하지 않는다(시각을 직접 고른다).
  useEffect(() => {
    if (!open || isReserve) return;
    let live = true;
    getShoutQueueInfo(slotSec)
      .then((q) => { if (live) setNextFreeAt(q.nextFreeAt ? ms(q.nextFreeAt) : null); })
      .catch(() => { if (live) setNextFreeAt(null); });
    return () => { live = false; };
  }, [open, isReserve, slotSec]);

  const trimmed = text.trim();
  const tooShort = trimmed.length < rules.minLen;
  const tooLong = trimmed.length > rules.maxLen;
  const hasLink = /https?:\/\/|www\./i.test(trimmed);
  const poor = balance !== null && cost > 0 && balance.available < cost;
  // 내 차례 예상 — 서버가 준 '다음 빈 자리'. 예약된 창은 이미 건너뛴 값이다.
  const myTurnLabel = nextFreeAt === null ? '지금 바로' : waitLabel(nextFreeAt - Date.now());
  // 예약 입력 경계 — 서버 buy_shout 의 RESERVE_MIN_LEAD / RESERVE_MAX_LEAD 와 같은 값.
  // datetime-local 은 **로컬 시각 문자열**이라 toISOString(UTC)을 넣으면 안 된다 — 시차만큼 어긋난다.
  const localInput = (t: number) => {
    const d = new Date(t - new Date(t).getTimezoneOffset() * 60_000);
    return d.toISOString().slice(0, 16);
  };
  const reserveMin = localInput(Date.now() + RESERVE_MIN_LEAD_MIN * 60_000);
  const reserveMax = localInput(Date.now() + RESERVE_MAX_LEAD_DAYS * 86_400_000);
  const reserveMs = reserveAt ? new Date(reserveAt).getTime() : NaN;
  const reserveBad = isReserve && (!reserveAt || !Number.isFinite(reserveMs)
    || reserveMs < Date.now() + RESERVE_MIN_LEAD_MIN * 60_000
    || reserveMs > Date.now() + RESERVE_MAX_LEAD_DAYS * 86_400_000);

  const submit = async () => {
    if (busy || tooShort || tooLong || reserveBad) return;
    // 클라이언트 선검사 — 기존 금칙어 필터를 그대로 재사용(최종 판정은 서버)
    const f = filterContent(trimmed);
    if (f.blocked) { toast.show(f.reason ?? '게시할 수 없는 표현입니다', 'error'); return; }
    if (hasLink) { toast.show('외침에는 링크를 넣을 수 없어요', 'error'); return; }
    setBusy(true);
    try {
      // ⚠ 색은 하이라이트에서만 보낸다. 기본에 색을 실어 보내면 서버가 거절한다(조용히 무시하지 않는다).
      // ⚠ 예약 시각은 **ISO(UTC)** 로 보낸다. datetime-local 값은 로컬 시각 문자열이라
      //   그대로 보내면 서버가 UTC 로 읽어 시차만큼 어긋난 자리에 잡힌다.
      const s = await buyShout(
        trimmed, tier,
        tier === 'gold' ? color : null,
        isReserve ? new Date(reserveMs).toISOString() : null,
      );
      toast.show(
        isReserve
          ? `예약했습니다! ${s.cost}점 사용 · ${new Date(s.playsAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}에 ${slotSec}초 방송`
          : `외쳤습니다! ${s.cost}점 사용 · ${airLabel(s.playsAt)} (${slotSec}초)`,
        'success');
      onPosted?.(s);
      await refreshProfile?.();
      onClose();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '외치기에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="외치기" variant="sheet" maxWidth="md" dismissOnBackdrop={false}>
      <div className="space-y-3 p-4">
        <p className="text-2xs leading-relaxed text-ink-muted">
          커뮤니티 맨 위에서 <b className="text-ink-secondary">{slotSec}초 동안 한 번</b> 방송됩니다.
          {isReserve
            ? <> 예약은 <b className="text-accent-300">고른 시각</b>에 그 자리를 미리 잡아 둡니다 — 대기열을 기다리지 않아요.</>
            : queueLen > 0
              ? <> 지금 앞에 <b className="text-ink-secondary">{queueLen}개</b>가 있어 <b className="text-accent-300">{myTurnLabel}</b> 내 차례예요.</>
              : <> 대기열이 비어 있어 <b className="text-accent-300">지금 바로</b> 방송돼요.</>}
          {' '}활동점수 <b className="text-accent-300">{cost.toLocaleString()}점</b>이 사용되며, 등급 점수(누적)는 줄지 않아요.
        </p>

        {/* 등급 — 가격은 서버 가격표(shop_skus)에서 그대로 읽어 보여준다.
            전광판이 빠져 두 칸이므로 칸 수를 목록 길이에서 뽑는다(빈 칸이 남지 않게). */}
        {tiers.length > 0 && (
          <div className={['grid gap-1.5', tiers.length === 3 ? 'grid-cols-3' : 'grid-cols-2'].join(' ')}>
            {tiers.map((s) => {
              const k = tierOfSku(s.key);
              const on = k === tier;
              return (
                <button
                  key={s.key} type="button" onClick={() => setTier(k)}
                  aria-pressed={on}
                  className={['rounded-aura border px-2 py-2 text-center transition-colors',
                    on ? 'border-accent-300 bg-accent-300/[0.10]' : 'border-border-subtle bg-surface-high hover:border-accent-400/50'].join(' ')}
                >
                  <span className={['block text-xs font-bold', on ? 'text-accent-300' : 'text-ink-primary'].join(' ')}>{s.label}</span>
                  <span className="mt-0.5 block text-2xs font-extrabold tabular-nums text-ink-secondary">{s.price.toLocaleString()}점</span>
                  <span className="block text-2xs text-ink-muted">{s.durationSeconds || SHOUT_SLOT_SECONDS}초 1회</span>
                </button>
              );
            })}
          </div>
        )}
        {sel && <p className="text-2xs leading-relaxed text-ink-muted">{sel.descr}</p>}

        {/* 색 — 하이라이트에서만. 자리를 비워 두지 않고 조건부로 넣는다(기본 등급엔 고를 게 없다). */}
        {tier === 'gold' && <ColorPicker value={color} onChange={setColor} />}

        {/* 예약 시각 — 예약 등급에서만. 같은 이유로 조건부다(다른 등급엔 고를 게 없다).
            ⚠ 여기가 예약 상품의 전부다. 시각을 못 고르면 '대기열 순서대로'와 같아져 200점의 근거가 사라진다.
            겹치는 시각은 서버가 최종 판정하고 **가장 빠른 빈 시각까지 알려 준다**(막기만 하면 다시 누르게 된다). */}
        {isReserve && (
          <div>
            <label htmlFor="shout-reserve-at" className="text-2xs font-bold text-ink-secondary">방송할 시각</label>
            <input
              id="shout-reserve-at" data-testid="shout-reserve-at" type="datetime-local"
              value={reserveAt} min={reserveMin} max={reserveMax}
              onChange={(e) => setReserveAt(e.target.value)}
              className="input mt-1 w-full text-sm"
            />
            <p className={['mt-1 text-2xs leading-relaxed', reserveAt && reserveBad ? 'font-bold text-danger-light' : 'text-ink-muted'].join(' ')}>
              {reserveAt && reserveBad
                ? `지금부터 ${RESERVE_MIN_LEAD_MIN}분 뒤 ~ ${RESERVE_MAX_LEAD_DAYS}일 이내로 골라 주세요`
                : `지금부터 ${RESERVE_MIN_LEAD_MIN}분 뒤부터 ${RESERVE_MAX_LEAD_DAYS}일 이내 · 분 단위로 잡힙니다`}
            </p>
          </div>
        )}

        {/* 잔액 — 자리 고정(로딩 중에도 같은 높이) */}
        <div className="flex items-center justify-between rounded-aura border border-border-subtle bg-surface-high px-3 py-2">
          <span className="text-xs text-ink-secondary">사용 가능 점수</span>
          <span className="text-sm font-extrabold tabular-nums text-accent-300">
            {balance ? `${balance.available.toLocaleString()}점` : '—'}
            {balance && <span className="ml-1 text-2xs font-semibold text-ink-muted">/ 누적 {balance.total.toLocaleString()}</span>}
          </span>
        </div>

        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, rules.maxLen + 20))}
            rows={2}
            maxLength={rules.maxLen + 20}
            placeholder="예: 오늘 저녁 8시 ○○홀덤 딥스택, 자리 두 개 남았어요!"
            className="input w-full resize-none text-sm"
          />
          <div className="mt-1 flex items-center justify-between text-2xs">
            {/* ⚠ 하루 상한은 shout_rules().daily_cap(구 3회 잔재)이 아니라 서버가 실제로 세는
                daily_purchase_count 상한 10회다 — 상품 종류를 가리지 않고 합산된다. */}
            <span className={hasLink ? 'font-bold text-danger-light' : 'text-ink-muted'}>
              {hasLink ? '링크는 넣을 수 없어요' : `하루 ${DAILY_PURCHASE_CAP}번(구매 합산) · ${rules.cooldownMinutes}분에 한 번`}
            </span>
            <span className={['tabular-nums', tooLong ? 'font-bold text-danger-light' : 'text-ink-muted'].join(' ')}>
              {trimmed.length}/{rules.maxLen}
            </span>
          </div>
        </div>

        {/* 미리보기 — 실제 배너와 **같은 스킨**을 쓴다. 고른 등급·색이 어떻게 보일지가 곧 가격의 근거다. */}
        <div data-testid="shout-preview"
             className={['rounded-aura border px-3 py-2.5', tierSkin(tier).box].join(' ')}
             style={colorBoxStyle(tier, tier === 'gold' ? color : null)}>
          <p className={['text-2xs font-bold', tierSkin(tier).icon].join(' ')}
             style={colorIconStyle(tier, tier === 'gold' ? color : null)}>미리보기</p>
          <p className={['mt-0.5 break-words font-bold leading-snug text-ink-primary', tierSkin(tier).text].join(' ')}>
            <Icon name="megaphone" size={15} className={['mr-1 inline-block align-[-2px] shrink-0', tierSkin(tier).icon].join(' ')}
                  style={colorIconStyle(tier, tier === 'gold' ? color : null)} />{trimmed || '여기에 외칠 내용이 표시됩니다'}
          </p>
          <p className="mt-0.5 text-2xs text-ink-muted">
            {user?.nickname ?? '나'} · {slotSec}초 방송
            {isReserve && Number.isFinite(reserveMs) && !reserveBad
              && ` · ${new Date(reserveMs).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 예약`}
          </p>
        </div>

        {poor && (
          <p className="rounded-input border border-danger/30 bg-danger/10 px-3 py-2 text-2xs font-semibold text-danger-light">
            사용 가능 점수가 {cost.toLocaleString()}점보다 적어요 — 접속·글쓰기·댓글·주간 미션으로 모아보세요.
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">취소</button>
          <button
            type="button" onClick={submit}
            disabled={busy || tooShort || tooLong || hasLink || poor || reserveBad}
            className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
          >
            {busy ? '외치는 중…' : `${cost.toLocaleString()}점으로 외치기`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * 커뮤니티 상단 외침 배너 — **한 줄만** 나간다.
 *  · 지금 방송 중(plays_at <= now < expires_at)인 외침이 있으면 그것 하나.
 *  · 없으면 기본 안내 문구(IDLE_LINES)가 20초 격자로 롤링한다.
 *  · 그 밖의 것(지난 외침 · 대기 중인 외침 · 대기열 목록)은 화면에 존재하지 않는다.
 *  · 유일한 예외는 '내 차례'(shout-mine) — 산 본인에게만, 순번과 시각만.
 */
export default function CommunityShoutBar({ className }: { className?: string }) {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [shouts, setShouts] = useState<Shout[] | null>(null);
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState(DEFAULT_RULES.cost);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const load = useCallback(() => { getLiveShouts(30).then(setShouts).catch(() => setShouts([])); }, []);
  // 커뮤니티 탭은 keep-alive(display 토글)로 미리 마운트될 수 있다 — 숨어 있는 동안 네트워크를 쓰지 않게
  // '실제로 화면에 들어왔을 때' 한 번만 불러온다(display:none 요소는 교차하지 않는다).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { load(); getShoutRules().then((r) => setCost(r.cost)).catch(() => {}); return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      load();
      getShoutRules().then((r) => setCost(r.cost)).catch(() => {});
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [load]);

  const onHide = async (id: string) => {
    try {
      await hideShout(id);
      setShouts((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      toast.show('외침을 내렸습니다', 'info');
    } catch (e) { toast.show(e instanceof Error ? e.message : '실패했습니다', 'error'); }
  };

  const openComposer = () => {
    if (!user) { promptLogin(); return; }
    setOpen(true);
  };

  const list = useMemo(() => shouts ?? [], [shouts]);
  const now = useShoutClock(list);

  // 아직 방송이 끝나지 않은 것들 = 지금 화면이 책임지는 대기열(서버가 plays_at 오름차순으로 준다).
  const remaining = useMemo(() => list.filter((s) => now < ms(s.expiresAt)), [list, now]);
  // ⛳ 화면에 나가는 유일한 외침 — plays_at 창 안에 들어온 것. 없으면 아무 외침도 송출하지 않는다.
  //    (find 로 찾는다: remaining[0] 이 아직 방송 전일 수 있고, 그때 그걸 띄우면 산 20초가 아닌
  //     시간에 남의 외침이 자리를 차지한다 — 그게 정확히 이번에 없앤 동작이다.)
  const onAir = useMemo(() => remaining.find((s) => ms(s.playsAt) <= now), [remaining, now]);
  // 아직 방송 전인 것들. **화면에 내용을 그리지 않는다** — 내 순번을 세는 데만 쓴다.
  const pending = useMemo(() => remaining.filter((s) => ms(s.playsAt) > now), [remaining, now]);
  // 내가 산 외침이 아직 안 나갔다면 몇 번째인지 — 돈을 냈는데 언제 나가는지 모르는 상태를 없애는
  // 유일한 장치다. 남에게는 보이지 않고(userId 비교), 내용도 싣지 않는다(순번·시각만).
  // 맨 앞이 내 것이면 그건 이미 방송 중이라 pending 에 없다 — 같은 말을 두 번 하지 않는다.
  const mineIdx = pending.findIndex((s) => s.userId === user?.id);
  const mine = mineIdx >= 0 ? pending[mineIdx] : undefined;

  // 기본 문구 롤링 인덱스 — 벽시계 격자라 접속 시각이 달라도 모두가 같은 문구를 본다.
  const idleIdx = Math.floor(now / SLOT_MS) % IDLE_LINES.length;

  // 대기열이 완전히 빈 순간 **한 번만** 다시 불러온다(그 사이 올라온 새 외침을 잡는다).
  // 서버가 expires_at > now 로 걸러 주므로 빈 응답이면 list.length 가 0 이 되고 여기서 멈춘다(무한 루프 없음).
  const drainedRef = useRef(false);
  useEffect(() => {
    if (shouts === null || shouts.length === 0) return;
    if (remaining.length > 0) { drainedRef.current = false; return; }
    if (drainedRef.current) return;
    drainedRef.current = true;
    load();
  }, [shouts, remaining.length, load]);

  // 비어 있는 동안 5슬롯(100초)에 한 번 다시 불러온다.
  //  왜 필요한가: 이 배너는 마운트 때 한 번만 조회한다. 그 규칙만으로는 **화면이 기본 문구로 내려간 뒤**
  //  남이 새로 산 외침을 영영 못 본다(구매자 본인은 onPosted 로 즉시 반영되지만 구경하는 쪽은 아니다).
  //  대기열이 차 있으면(remaining.length > 0) 인터벌은 정리된다 — 방송 중에는 폴링하지 않는다.
  //  의존성은 remaining.length 뿐이라 응답이 계속 비어 있어도 재실행되지 않는다(루프 없음).
  useEffect(() => {
    if (remaining.length > 0) return;
    const t = window.setInterval(() => {
      // 탭이 뒤에 있거나(document.hidden) 커뮤니티 탭이 keep-alive 로 display:none 이면 건너뛴다.
      // display:none 요소는 offsetParent 가 null 이라 이 한 줄로 '안 보이는 동안의 폴링'이 사라진다.
      if (document.hidden || rootRef.current?.offsetParent == null) return;
      load();
    }, SLOT_MS * 5);
    return () => clearInterval(t);
  }, [remaining.length, load]);

  // ── 크로스페이드 ──────────────────────────────────────────────────────────
  // 지금 나가야 할 것(slotKey)과 지금 그려져 있는 것(shownKey)을 분리한다.
  //  ⚠ 종전에는 shownKey 를 두고도 본문은 항상 최신 것을 그렸다 — 즉 **새 내용을 흐리게 했다가 다시
  //    선명하게** 만들고 있었고, 바뀌는 순간이 눈에 그대로 보였다. 흐려지는 동안은 옛 내용이어야 한다.
  //  animation 이 아니라 transition 인 이유: 탭 keep-alive 의 display 토글에서 animation 은
  //  재방문마다 되살아나 .tab-pane 무효화 목록에 등록해야 하고, 그러면 아예 보이지 않게 된다.
  const slotKey = onAir ? `s:${onAir.id}` : `i:${idleIdx}`;
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [vis, setVis] = useState(true);
  useEffect(() => {
    if (shownKey === slotKey) return;
    if (shownKey === null || typeof window.matchMedia !== 'function'
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShownKey(slotKey); return; }
    setVis(false);
    const t = window.setTimeout(() => { setShownKey(slotKey); setVis(true); }, 150);
    return () => clearTimeout(t);
  }, [slotKey, shownKey]);

  // 첫 렌더(아직 동기화 전)에는 목표를 그대로 그린다 — 한 프레임 기본 문구가 스치지 않게.
  const drawKey = shownKey ?? slotKey;
  // 그 외침이 그사이 사라졌다면(내리기) 페이드를 기다리지 않고 기본 문구로 내려간다.
  const drawShout = drawKey.startsWith('s:') ? list.find((s) => s.id === drawKey.slice(2)) : undefined;
  const drawLine = IDLE_LINES[(drawKey.startsWith('i:') ? Number(drawKey.slice(2)) : idleIdx) % IDLE_LINES.length];
  const skin = drawShout ? tierSkin(drawShout.tier) : null;

  return (
    // min-h 로 자리를 미리 잡는다 — 로딩→도착에서 아래 콘텐츠가 밀리지 않게(CLS 0)
    <div ref={rootRef} className={['min-h-[3.25rem]', className ?? ''].join(' ')}>
      {/* 카드는 **하나뿐이다.** 방송 중 ↔ 기본 문구가 같은 DOM 을 갈아 끼우므로 전환에서 리마운트도,
          높이 점프도 없다. 자동 순환(마퀴·캐러셀)은 쓰지 않는다 — 상시 움직이는 배너는 모션 헌법의
          무한 루프 예외를 새로 만들 이유가 없고, 오너가 가장 싫어하는 '끊김'의 주범이다. */}
      <div
        data-testid={drawShout ? 'shout-live' : 'shout-idle'}
        className={['rounded-aura border px-3 py-2.5',
          skin ? skin.box : 'border-dashed border-border-strong bg-surface-high'].join(' ')}
        style={drawShout ? colorBoxStyle(drawShout.tier, drawShout.color) : undefined}
      >
        <div className="flex items-start gap-2">
          <Icon name="megaphone" size={16}
                className={['mt-0.5 shrink-0', skin ? skin.icon : 'text-accent-300'].join(' ')}
                style={drawShout ? colorIconStyle(drawShout.tier, drawShout.color) : undefined} />
          {/* min-h = 본문 두 줄. 20초마다 문구가 갈릴 때 카드 높이가 들썩이지 않게 **공간을 미리 예약**한다
              (모션 헌법: CLS 는 진입 애니가 아니라 공간 예약으로만 해결한다). height 를 애니메이트하지
              않는 이유도 같다 — 레이아웃 애니는 화이트리스트 밖이다. */}
          <div className="min-h-[2.5rem] min-w-0 flex-1"
               style={{ transition: 'opacity var(--dur-base) var(--ease)', opacity: vis ? 1 : 0 }}>
            {drawShout && skin ? (
              <>
                <p className={['break-words font-bold leading-snug text-ink-primary', skin.text].join(' ')}>{drawShout.message}</p>
                <p className="mt-0.5 text-2xs text-ink-muted">{drawShout.nickname} · 방송 중</p>
              </>
            ) : (
              <>
                <p data-testid="shout-idle-line" className="break-words text-sm font-semibold leading-snug text-ink-secondary">{drawLine}</p>
                <p className="mt-0.5 text-2xs text-ink-muted">누리홀덤 안내</p>
              </>
            )}
          </div>
          {drawShout && (isAdmin || user?.id === drawShout.userId) && (
            <button type="button" onClick={() => onHide(drawShout.id)}
              className="shrink-0 rounded-input px-2 py-1 text-2xs font-semibold text-ink-muted hover:text-danger-light">
              내리기
            </button>
          )}
          <button type="button" onClick={openComposer}
            className="shrink-0 rounded-input border border-accent-400/50 px-2 py-1 text-2xs font-bold text-accent-300 hover:bg-accent-300/10">
            외치기{!drawShout && <span className="ml-1 font-extrabold tabular-nums">{cost}점</span>}
          </button>
        </div>

        {/* 내 차례 안내 — 방송 중이든 기본 문구든 항상 같은 자리에 붙는다.
            내용(message)은 싣지 않는다: 아직 산 20초가 아니므로 그건 '미리 송출'이 된다.
            내리기를 함께 둔 이유 — 대기열 목록이 사라지면서 '잘못 산 외침을 나가기 전에 내리는'
            경로가 통째로 없어진다. 기능을 없애지 않기 위해 본인 것만 여기로 옮긴다
            (운영자용 사후 통제는 관리자 설정 → 외침 관리에 그대로 있다). */}
        {mine && (
          <div data-testid="shout-mine" className="mt-1.5 flex items-center gap-2 rounded-input bg-accent-300/[0.10] px-2 py-1">
            <span className="min-w-0 flex-1 text-2xs font-bold text-accent-300">
              내 외침은 {airLabel(mine.playsAt)} · 대기 {mineIdx + 1}번째
            </span>
            <button type="button" onClick={() => onHide(mine.id)}
              className="shrink-0 text-2xs font-semibold text-ink-muted hover:text-danger-light">내리기</button>
          </div>
        )}
      </div>
      <ShoutComposer open={open} onClose={() => setOpen(false)} onPosted={() => load()} />
    </div>
  );
}
