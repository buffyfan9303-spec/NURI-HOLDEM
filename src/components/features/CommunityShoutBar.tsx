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
//  · 진열 = **최신 1건만 크게**, 나머지는 '+N개' 펼치기. 자동 순환(마퀴·캐러셀)을 쓰지 않는다 —
//    상시 움직이는 배너는 오너가 가장 싫어하는 '끊김/주르륵'의 주범이고 모션 헌법의
//    무한 루프 예외를 새로 만들 이유가 없다. 등장 애니는 없고 공간은 항상 예약돼 있다(CLS 0).
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
  getLiveShouts, buyShout, hideShout, getShoutRules, getMyPointBalance,
  type Shout, type ShoutRules, type PointBalance,
} from '../../api/community';

// ⚠ 서버 shout_rules() 와 동기. 낮게 두면 표시가가 실제 청구가보다 싸 보인다(2026-08-29: 30 → 200).
const DEFAULT_RULES: ShoutRules = { cost: 200, cooldownMinutes: 10, dailyCap: 3, maxLen: 60, minLen: 2, ttlHours: 6 };

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

  useEffect(() => {
    if (!open) return;
    getShoutRules().then(setRules).catch(() => {});
    getMyPointBalance().then(setBalance).catch(() => {});
  }, [open]);
  useEffect(() => { if (open) setText(''); }, [open]);

  const trimmed = text.trim();
  const tooShort = trimmed.length < rules.minLen;
  const tooLong = trimmed.length > rules.maxLen;
  const hasLink = /https?:\/\/|www\./i.test(trimmed);
  const poor = balance !== null && balance.available < rules.cost;

  const submit = async () => {
    if (busy || tooShort || tooLong) return;
    // 클라이언트 선검사 — 기존 금칙어 필터를 그대로 재사용(최종 판정은 서버)
    const f = filterContent(trimmed);
    if (f.blocked) { toast.show(f.reason ?? '게시할 수 없는 표현입니다', 'error'); return; }
    if (hasLink) { toast.show('외침에는 링크를 넣을 수 없어요', 'error'); return; }
    setBusy(true);
    try {
      const s = await buyShout(trimmed);
      toast.show(`외쳤습니다! ${rules.cost}점 사용 · ${rules.ttlHours}시간 노출`, 'success');
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
          커뮤니티 맨 위에 <b className="text-ink-secondary">{rules.ttlHours}시간</b> 동안 크게 걸립니다.
          활동점수 <b className="text-accent-300">{rules.cost}점</b>이 사용되며, 등급 점수(누적)는 줄지 않아요.
        </p>

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

        {/* 미리보기 — 실제 배너와 같은 문법 */}
        <div className="rounded-card border border-accent-400/50 bg-gradient-to-r from-accent-300/[0.12] to-transparent px-3 py-2.5">
          <p className="text-2xs font-bold text-accent-300">미리보기</p>
          <p className="mt-0.5 break-words text-sm font-bold leading-snug text-ink-primary">
            <Icon name="megaphone" size={15} className="mr-1 inline-block align-[-2px] shrink-0 text-accent-300" />{trimmed || '여기에 외칠 내용이 표시됩니다'}
          </p>
          <p className="mt-0.5 text-2xs text-ink-muted">{user?.nickname ?? '나'} · 방금 전</p>
        </div>

        {poor && (
          <p className="rounded-input border border-danger/30 bg-danger/10 px-3 py-2 text-2xs font-semibold text-danger-light">
            사용 가능 점수가 {rules.cost}점보다 적어요 — 접속·글쓰기·댓글·주간 미션으로 모아보세요.
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">취소</button>
          <button
            type="button" onClick={submit}
            disabled={busy || tooShort || tooLong || hasLink || poor}
            className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
          >
            {busy ? '외치는 중…' : `${rules.cost}점으로 외치기`}
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
  const top = list[0];
  const rest = list.slice(1);

  return (
    // min-h 로 자리를 미리 잡는다 — 로딩→도착에서 아래 콘텐츠가 밀리지 않게(CLS 0)
    <div ref={rootRef} className={['min-h-[3.25rem]', className ?? ''].join(' ')}>
      {top ? (
        <div className="rounded-card border border-accent-400/50 bg-gradient-to-r from-accent-300/[0.12] to-transparent px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Icon name="megaphone" size={16} className="mt-0.5 shrink-0 text-accent-300" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-bold leading-snug text-ink-primary">{top.message}</p>
              <p className="mt-0.5 text-2xs text-ink-muted">
                {top.nickname} · {remainLabel(top.expiresAt)}
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
                {expanded ? '접기' : `다른 외침 ${rest.length}개 보기`}
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
