// src/components/features/CommunityShoutBar.tsx
//
// 오너 #8 — 커뮤니티 '외치기': 활동점수로 사는 짧은 강조 메시지.
//
// ── 노출 위치·지속 시간의 근거 ───────────────────────────────────────────────
//  · 위치 = 커뮤니티 서브탭 바로 아래(매장/게시판/실시간/랭킹 어디를 봐도 같은 자리).
//    '눈에 띄게'는 곧 '어느 화면에서도 보인다'는 뜻이라, 게시판 피드 안에 끼워 넣으면
//    다른 서브탭 사용자에겐 아예 안 보이고 스크롤에도 금방 밀려난다.
//  · 지속 시간 = 6시간(서버 shout_rules 단일 출처). 커뮤니티 방문이 하루 1~2회라
//    6시간이면 대부분의 활성 사용자에게 최소 한 번은 걸리고, 하루를 넘기지 않아
//    지난 외침이 상단을 계속 점유하지 않는다.
//  · 진열 = **한 번에 하나, 1회 20초씩 대기열 순환**(오너 지시 2026-08-30).
//    종전에는 '최신 1건만 크게, 나머지는 +N개 접기' 였는데 그 규칙에는 결함이 있었다 —
//    2,000점짜리 전광판을 산 사람이 **뒤에 올라온 200점 외침 하나에 그대로 묻혔다.**
//    돈을 더 낸 쪽이 덜 보이는 구조라 등급 자체가 무의미했다. 이제 살아 있는 외침은 전부
//    같은 자리를 20초씩 돌아가며 쓴다. 등급이 사는 것은 '독점'이 아니라
//    **대기열에 남아 있는 기간(6/12/24시간)과 겉모습**이다.
//  · 순번은 **벽시계에서 유도**한다(floor(now/20s) % n) — 타이머 누적 오차가 없고,
//    탭을 오래 숨겼다 돌아와도 어긋나지 않으며, **모든 사람이 같은 순간에 같은 외침을 본다**
//    (전광판이라는 말 그대로). 로컬 타이머로 돌리면 사람마다 다른 걸 보게 된다.
//  · 전환은 마퀴가 아니라 **20초에 한 번의 opacity 크로스페이드**다. 상시 움직이는 배너가 아니라
//    모션 헌법의 무한 루프 예외를 새로 만들지 않는다. animation 이 아니라 transition 을 쓰는데,
//    display 토글(탭 keep-alive)로 **재생이 되살아나지 않기 때문**이다 — animation 이면
//    탭 재방문마다 다시 재생돼 .tab-pane 무효화 목록에 등록해야 하고, 그러면 아예 안 보인다.
//    공간은 항상 예약돼 있다(CLS 0).
//
// ── 안전장치(전부 서버가 최종 판정) ──────────────────────────────────────────
//  차감·게시 원자성(buy_shout RPC 한 트랜잭션) · 프로필 행 잠금으로 중복 클릭 직렬화 ·
//  쿨다운 10분 · 하루 3회 · 2~60자 · 기존 금칙어(content-filter)와 같은 카테고리 + 링크 차단 ·
//  잔액 부족 거부. 클라이언트 검사는 같은 규칙을 '미리' 보여주기 위한 것이지 게이트가 아니다.
import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { promptLogin } from '../../lib/requireLogin';
import { filterContent } from '../../lib/content-filter';
import {
  getLiveShouts, buyShout, hideShout, getShoutRules, getMyPointBalance, getShopSkus,
  type Shout, type ShoutRules, type PointBalance, type ShopSku, type ShoutTier,
} from '../../api/community';

// ⚠ 서버 shout_rules() 와 동기. 낮게 두면 표시가가 실제 청구가보다 싸 보인다(2026-08-29: 30 → 200).
const DEFAULT_RULES: ShoutRules = { cost: 200, cooldownMinutes: 10, dailyCap: 3, maxLen: 60, minLen: 2, ttlHours: 6 };

// ── 등급별 겉모습 ───────────────────────────────────────────────────────────
// 값(가격·노출시간)은 전부 서버(shop_skus)에서 오고, 여기 있는 건 **색뿐이다.**
// gold 계열은 이미 명예의 전당·시즌 우승 배지가 쓰는 조합을 그대로 재사용한다
// (border-gold-400/40 + bg-gold-300/[0.06] + text-gold-300) — 새 색 규칙을 만들지 않기 위해서.
const TIER_SKIN: Record<ShoutTier, { box: string; icon: string; text: string }> = {
  basic: {
    box:  'border-accent-400/50 bg-gradient-to-r from-accent-300/[0.12] to-transparent',
    icon: 'text-accent-300', text: 'text-sm',
  },
  gold: {
    box:  'border-gold-400/50 bg-gradient-to-r from-gold-300/[0.10] to-transparent',
    icon: 'text-gold-300', text: 'text-sm',
  },
  board: {
    box:  'border-gold-400 bg-gradient-to-r from-gold-300/[0.16] via-accent-300/[0.06] to-transparent',
    icon: 'text-gold-300', text: 'text-base',
  },
};
const tierSkin = (t?: ShoutTier) => TIER_SKIN[t ?? 'basic'] ?? TIER_SKIN.basic;

/** 'shout_gold' → 'gold' */
const tierOfSku = (key: string): ShoutTier => (key.replace(/^shout_/, '') as ShoutTier);

const durLabel = (h: number): string => (h >= 24 && h % 24 === 0 ? `${h / 24}일` : `${h}시간`);

/** 외침 1회 노출 = 20초(오너 지시 2026-08-30). 대기열이 있으면 이 간격으로 다음 차례가 온다. */
const SHOUT_TURN_MS = 20_000;

/**
 * 지금이 몇 번째 차례인가 — **벽시계에서 유도**한다.
 * setInterval 로 인덱스를 누적하면 (a) 탭이 백그라운드일 때 브라우저가 타이머를 죽여 어긋나고
 * (b) 사람마다 시작 시점이 달라 각자 다른 외침을 본다. 시계에서 뽑으면 둘 다 없다.
 * 타이머는 '언제 다시 계산할지' 를 알리는 용도로만 쓰고, 경계에 맞춰 재무장한다.
 */
function useShoutTurn(n: number): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (n <= 1) return;                       // 대기열이 없으면 돌 필요가 없다
    let id: number | undefined;
    const arm = () => {
      if (document.hidden) return;            // 안 보이는 화면에서 타이머를 돌리지 않는다
      const wait = SHOUT_TURN_MS - (Date.now() % SHOUT_TURN_MS);
      id = window.setTimeout(() => { tick((v) => v + 1); arm(); }, wait + 20);
    };
    const onVis = () => { if (id) { clearTimeout(id); id = undefined; } tick((v) => v + 1); arm(); };
    arm();
    document.addEventListener('visibilitychange', onVis);
    return () => { if (id) clearTimeout(id); document.removeEventListener('visibilitychange', onVis); };
  }, [n]);
  return n > 0 ? Math.floor(Date.now() / SHOUT_TURN_MS) % n : 0;
}

function remainLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return '곧 사라짐';
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}시간 남음` : `${Math.max(1, Math.floor(ms / 60_000))}분 남음`;
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

  useEffect(() => {
    if (!open) return;
    getShoutRules().then(setRules).catch(() => {});
    getMyPointBalance().then(setBalance).catch(() => {});
    getShopSkus()
      .then((all) => setTiers(all.filter((s) => s.kind === 'shout').sort((a, b) => a.sort - b.sort)))
      .catch(() => {});
  }, [open]);
  useEffect(() => { if (open) { setText(''); setTier('basic'); } }, [open]);

  const sel = tiers.find((s) => tierOfSku(s.key) === tier);
  // 서버 목록이 아직 없으면 기본 등급은 shout_rules() 값으로 버틴다(가격이 '—'로 비지 않게).
  const cost = sel?.price ?? (tier === 'basic' ? rules.cost : 0);
  const ttlHours = sel?.durationHours ?? (tier === 'basic' ? rules.ttlHours : 0);

  const trimmed = text.trim();
  const tooShort = trimmed.length < rules.minLen;
  const tooLong = trimmed.length > rules.maxLen;
  const hasLink = /https?:\/\/|www\./i.test(trimmed);
  const poor = balance !== null && cost > 0 && balance.available < cost;

  const submit = async () => {
    if (busy || tooShort || tooLong) return;
    // 클라이언트 선검사 — 기존 금칙어 필터를 그대로 재사용(최종 판정은 서버)
    const f = filterContent(trimmed);
    if (f.blocked) { toast.show(f.reason ?? '게시할 수 없는 표현입니다', 'error'); return; }
    if (hasLink) { toast.show('외침에는 링크를 넣을 수 없어요', 'error'); return; }
    setBusy(true);
    try {
      const s = await buyShout(trimmed, tier);
      toast.show(`외쳤습니다! ${s.cost}점 사용 · ${ttlHours}시간 대기열 순환`, 'success');
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
          커뮤니티 맨 위 대기열에 <b className="text-ink-secondary">{ttlHours}시간</b> 동안 올라가,
          <b className="text-ink-secondary">한 번에 20초씩</b> 돌아가며 노출됩니다.
          활동점수 <b className="text-accent-300">{cost}점</b>이 사용되며, 등급 점수(누적)는 줄지 않아요.
        </p>

        {/* 등급 — 가격·노출시간은 서버 가격표(shop_skus)에서 그대로 읽어 보여준다.
            자리를 항상 3칸으로 예약해 목록이 늦게 와도 아래가 밀리지 않는다(CLS 0). */}
        {tiers.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {tiers.map((s) => {
              const k = tierOfSku(s.key);
              const on = k === tier;
              return (
                <button
                  key={s.key} type="button" onClick={() => setTier(k)}
                  aria-pressed={on}
                  className={['rounded-card border px-2 py-2 text-center transition-colors',
                    on ? 'border-accent-300 bg-accent-300/[0.10]' : 'border-border-subtle bg-surface-high hover:border-accent-400/50'].join(' ')}
                >
                  <span className={['block text-xs font-bold', on ? 'text-accent-300' : 'text-ink-primary'].join(' ')}>{s.label}</span>
                  <span className="mt-0.5 block text-2xs font-extrabold tabular-nums text-ink-secondary">{s.price.toLocaleString()}점</span>
                  <span className="block text-2xs text-ink-muted">{durLabel(s.durationHours)}</span>
                </button>
              );
            })}
          </div>
        )}
        {sel && <p className="text-2xs leading-relaxed text-ink-muted">{sel.descr}</p>}

        {/* 잔액 — 자리 고정(로딩 중에도 같은 높이) */}
        <div className="flex items-center justify-between rounded-card border border-border-subtle bg-surface-high px-3 py-2">
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
            <span className={hasLink ? 'font-bold text-danger-light' : 'text-ink-muted'}>
              {hasLink ? '링크는 넣을 수 없어요' : `하루 ${rules.dailyCap}번 · ${rules.cooldownMinutes}분에 한 번`}
            </span>
            <span className={['tabular-nums', tooLong ? 'font-bold text-danger-light' : 'text-ink-muted'].join(' ')}>
              {trimmed.length}/{rules.maxLen}
            </span>
          </div>
        </div>

        {/* 미리보기 — 실제 배너와 **같은 스킨**을 쓴다. 고른 등급이 어떻게 보일지가 곧 가격의 근거다. */}
        <div className={['rounded-card border px-3 py-2.5', tierSkin(tier).box].join(' ')}>
          <p className={['text-2xs font-bold', tierSkin(tier).icon].join(' ')}>미리보기</p>
          <p className={['mt-0.5 break-words font-bold leading-snug text-ink-primary', tierSkin(tier).text].join(' ')}>
            <Icon name="megaphone" size={15} className={['mr-1 inline-block align-[-2px] shrink-0', tierSkin(tier).icon].join(' ')} />{trimmed || '여기에 외칠 내용이 표시됩니다'}
          </p>
          <p className="mt-0.5 text-2xs text-ink-muted">{user?.nickname ?? '나'} · 방금 전</p>
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
            disabled={busy || tooShort || tooLong || hasLink || poor}
            className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
          >
            {busy ? '외치는 중…' : `${cost.toLocaleString()}점으로 외치기`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** 커뮤니티 상단 외침 배너 — 살아있는 외침이 없으면 '외치기' 유도 한 줄만 남는다 */
export default function CommunityShoutBar({ className }: { className?: string }) {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [shouts, setShouts] = useState<Shout[] | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cost, setCost] = useState(DEFAULT_RULES.cost);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const load = useCallback(() => { getLiveShouts(10).then(setShouts).catch(() => setShouts([])); }, []);
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

  const list = shouts ?? [];
  const turn = useShoutTurn(list.length);
  // 크로스페이드 — 순번이 바뀌면 먼저 흐려지고 그다음 내용을 바꾼다(150ms = --dur-fast 와 같은 값).
  //   모션 축소 설정이면 페이드 없이 즉시 교체한다(움직임을 아예 만들지 않는다).
  const [shown, setShown] = useState(0);
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const next = list.length ? turn % list.length : 0;
    if (next === shown) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(next); return; }
    setVis(false);
    const t = window.setTimeout(() => { setShown(next); setVis(true); }, 150);
    return () => clearTimeout(t);
  }, [turn, shown, list.length]);

  // 목록이 줄어드는 순간(만료·내리기) 인덱스가 범위를 벗어나 화면이 비는 것을 막는다.
  const idx = list.length ? Math.min(shown, list.length - 1) : 0;
  const top = list[idx];
  const rest = list.filter((_, i) => i !== idx);

  return (
    // min-h 로 자리를 미리 잡는다 — 로딩→도착에서 아래 콘텐츠가 밀리지 않게(CLS 0)
    <div ref={rootRef} className={['min-h-[3.25rem]', className ?? ''].join(' ')}>
      {top ? (
        // 진열 순서는 서버가 정한다(tier_rank desc, created_at desc) — 상위 등급이 맨 위다.
        // 자동 순환(마퀴·캐러셀)은 쓰지 않는다: 상시 움직이는 배너는 모션 헌법의 무한 루프 예외를
        // 새로 만들 이유가 없고, 오너가 가장 싫어하는 '끊김'의 주범이다.
        <div className={['rounded-card border px-3 py-2.5', tierSkin(top.tier).box].join(' ')}>
          <div className="flex items-start gap-2">
            <Icon name="megaphone" size={16} className={['mt-0.5 shrink-0', tierSkin(top.tier).icon].join(' ')} />
            <div className="min-w-0 flex-1"
                 style={{ transition: 'opacity var(--dur-base) var(--ease)', opacity: vis ? 1 : 0 }}>
              <p className={['break-words font-bold leading-snug text-ink-primary', tierSkin(top.tier).text].join(' ')}>{top.message}</p>
              <p className="mt-0.5 text-2xs text-ink-muted">
                {top.nickname} · {remainLabel(top.expiresAt)}
                {list.length > 1 && <> · 대기열 {idx + 1}/{list.length}</>}
              </p>
            </div>
            {(isAdmin || user?.id === top.userId) && (
              <button type="button" onClick={() => onHide(top.id)}
                className="shrink-0 rounded-input px-2 py-1 text-2xs font-semibold text-ink-muted hover:text-danger-light">
                내리기
              </button>
            )}
            <button type="button" onClick={openComposer}
              className="shrink-0 rounded-input border border-accent-400/50 px-2 py-1 text-2xs font-bold text-accent-300 hover:bg-accent-300/10">
              외치기
            </button>
          </div>

          {rest.length > 0 && (
            <>
              <button type="button" onClick={() => setExpanded((v) => !v)}
                className="mt-1.5 text-2xs font-bold text-accent-300 hover:text-accent-200">
                {expanded ? '접기' : `대기열 ${rest.length}개 보기`}
              </button>
              {expanded && (
                <ul className="mt-1 space-y-1 border-t border-border-subtle pt-1.5">
                  {rest.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 text-2xs">
                      <span className="min-w-0 flex-1 break-words text-ink-secondary">
                        <b className="text-ink-primary">{s.message}</b>
                        <span className="ml-1 text-ink-muted">· {s.nickname} · {remainLabel(s.expiresAt)}</span>
                      </span>
                      {(isAdmin || user?.id === s.userId) && (
                        <button type="button" onClick={() => onHide(s.id)}
                          className="shrink-0 font-semibold text-ink-muted hover:text-danger-light">내리기</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : (
        <button type="button" onClick={openComposer}
          className="flex w-full items-center gap-2 rounded-card border border-dashed border-border-strong bg-surface-high px-3 py-2.5 text-left hover:border-accent-400/50">
          <Icon name="megaphone" size={16} className="shrink-0 text-accent-300" />
          <span className="min-w-0 flex-1 text-xs font-semibold text-ink-secondary">
            외치기 — 커뮤니티 맨 위에 내 한마디를 걸어보세요
          </span>
          <span className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-1 text-2xs font-bold text-accent-300">{cost}점</span>
        </button>
      )}
      <ShoutComposer open={open} onClose={() => setOpen(false)} onPosted={() => load()} />
    </div>
  );
}
