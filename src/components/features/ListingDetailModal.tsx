import { useState, useEffect } from 'react';
import Modal from '../atoms/Modal';
import type { ListingStatus, MarketplaceListing, ListingLikeState } from '../../api/marketplace';
import { updateListingStatus, getListingLikeState, toggleListingLike, nextLikeState, incrementListingView } from '../../api/marketplace';
import { CATEGORIES, CONDITION_COLOR, STATUS_MAP, relativeTime } from './MarketplaceTab';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlockContext';
import { useToast } from '../atoms/Toast';
import ReportModal from './ReportModal';
import type { ChatThread } from '../../api/chat';
import { getListingThreads } from '../../api/chat';
import ChatPane from './chat/ChatPane';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { onColorInkClass } from '../../lib/color';
import { promptLogin } from '../../lib/requireLogin';

interface ListingDetailModalProps {
  /** 본인 매물 상태 변경 직후 — 목록·열린 매물 동기화(팔린 물건이 '판매중'으로 남는 헛문의 방지) */
  onStatusChanged?: (id: string, status: ListingStatus) => void;
  listing: MarketplaceListing | null;
  open: boolean;
  onClose: () => void;
  /** 관리자 또는 판매자 삭제 */
  onDelete?: (id: string) => void;
}

/** MARKET-DETAIL-CARD — 게시글 상세 모바일 카드(PostDetailModal data-pd-post-card)와 같은 면·선·반지름·안쪽 여백. */
const MK_CARD = 'rounded-[24px] border border-border-strong bg-surface-high p-4 ring-aura';

export default function ListingDetailModal({ listing, open, onClose, onDelete, onStatusChanged }: ListingDetailModalProps) {
  const { user }                  = useAuth();
  const { block }                 = useBlocks();
  // 찜은 서버(listing_likes)가 단일 진실. liked 와 총계를 한 덩어리로 든 이유는
  // 낙관적 토글에서 둘이 항상 같이 움직여야 하고, 서버 응답으로 통째로 덮어써야 하기 때문.
  const [like, setLike]           = useState<ListingLikeState>({ liked: false, likeCount: listing?.likeCount ?? 0 });
  const [likeBusy, setLikeBusy]   = useState(false);
  const [chatOpen, setChatOpen]   = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false); // 본인 매물 상태 토글(훅은 early return 위에)
  const toast                     = useToast();

  // 열 때마다 서버에서 다시 읽는다 — 목록의 likeCount 는 탭 로드 시점 스냅샷이고,
  // 내 찜 여부는 애초에 목록에 실려오지 않는다. (early return 위에 둬야 훅 순서가 안전)
  useEffect(() => {
    if (!open || !listing) return;
    let alive = true;
    getListingLikeState(listing.id).then((s) => { if (alive) setLike(s); }).catch(() => {});
    // 조회수 — 서버가 하루 1회로 거르므로 여는 김에 같이 올린다(새 effect 불필요, open&&listing 가드 공유).
    // 실패는 무시: 조회수 때문에 상세가 안 열리면 안 된다.
    incrementListingView(listing.id).catch(() => {});
    return () => { alive = false; };
  }, [open, listing]);

  if (!listing) return null;

  // 찜 토글 — 낙관적 반영 후 서버 권위값으로 확정, 실패하면 원복.
  const onToggleLike = async () => {
    // 비로그인: 토스트만 띄우면 손님이 헤더까지 가서 로그인하고 매물을 다시 찾아야 한다 — 댓글·예약과 같이 로그인 모달로 유도.
    // 매물 상세(openListing)는 App 상태라 로그인 모달이 닫힌 뒤에도 그대로 남는다 = 원래 흐름으로 복귀.
    if (!user) { toast.show('로그인 후 찜할 수 있습니다', 'info'); promptLogin(); return; }
    if (likeBusy) return; // 연타 시 두 요청이 엇갈려 하트와 카운트가 반대로 굳는 걸 막는다
    setLikeBusy(true);
    const prev = like;
    setLike(nextLikeState(prev));
    try {
      setLike(await toggleListingLike(listing.id));
    } catch (e) {
      setLike(prev); // 되돌리기 — '찜했다고 믿었는데 저장 안 됨'을 다시 만들지 않는다
      toast.show(e instanceof Error ? e.message : '찜 처리에 실패했습니다', 'error');
    } finally {
      setLikeBusy(false);
    }
  };

  const status   = STATUS_MAP[listing.status];
  const category = CATEGORIES.find((c) => c.id === listing.category);
  const isSold   = listing.status === 'sold';
  const hasImage = listing.images.length > 0;
  // 본인 매물 — 상태 변경이 '내 판매목록'에 숨어 있어 갱신이 안 되던 격차(헛문의 원인)
  const mine = !!user && user.id === listing.sellerId;
  const changeStatus = async (next: ListingStatus) => {
    if (next === listing.status || statusBusy) return;
    setStatusBusy(true);
    try {
      await updateListingStatus(listing.id, next);
      onStatusChanged?.(listing.id, next);
      toast.show(next === 'sold' ? '거래완료로 변경. 목록에서 판매중 표시가 내려갑니다' : next === 'reserved' ? '예약중으로 변경했습니다' : '판매중으로 변경했습니다', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '상태 변경 실패', 'error'); }
    finally { setStatusBusy(false); }
  };

  const scrollToComments = () => {
    document.getElementById('listing-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
    <Modal open={open} onClose={onClose} maxWidth="lg" variant="sheet" dragToClose>
      {/* ── 헤더 (이미지가 있으면 이미지, 없으면 슬림 헤더) ───────── */}
      {hasImage ? (
        <div className="relative">
          <div className="aspect-square sm:aspect-[4/3] overflow-hidden bg-surface-mid">
            <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover" />
          </div>
          <CloseButton onClose={onClose} />
          {isSold && <SoldOverlay />}
        </div>
      ) : (
        <div className="relative h-14 flex items-center px-4 border-b border-border-subtle">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
            {category?.label ?? '게시글'}
          </span>
          <CloseButton onClose={onClose} className="!top-2 !right-2" />
        </div>
      )}

      {/* ── 본문 — MARKET-DETAIL-CARD(2026-09-24 오너 "장터 글도 게시판 글처럼 테두리·가시성").
          게시글 상세(PostDetailModal)의 모바일 카드 체계를 그대로 쓴다: 둥근 24px · border-strong · ring-aura ·
          안쪽 17px · 카드 사이 12.75px · 본문 15px/1.7. 예전엔 테두리 없는 평면에 섹션 제목만 떠 있었고,
          판매자 칸은 48px 아바타 하나에 큰 빈 상자, 조회/찜은 2칸 큰 박스였다.
          ⚠ 면: 라이트는 surface-high(#F0F1F4)가 셸(흰색)보다 어두워 카드가 생기고, 다크는 surface-high 가
            셸보다 밝아 생긴다(PostDetailModal 카드와 같은 계약). 문의 카드만 다크에서 surface-low 로 내린다(댓글 카드와 같다). */}
      <div className="space-y-3 px-3 pt-3 pb-4">

        {/* ① 요약 — 분류·등급·상태·지역·시간·신고/차단 → 제목 → 가격(§28: 상품 가격이라 표시 유지) → 조회·찜 */}
        <section data-mk-card="summary" className={MK_CARD}>
          <div className="flex items-center gap-1.5 flex-wrap text-2xs">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge bg-surface-mid text-ink-secondary font-semibold">
              {category?.label}
            </span>
            {/* 등급칩 색은 목록과 공유하는 반투명 틴트라 카드 면(라이트 #EEF2F8) 위에서는 B급이 4.33:1 로 AA 미달이었다
                (흰 셸 위 종전 4.8). 칩 밑에 셸과 같은 면(surface-mid)을 깔아 종전 대비를 그대로 되살린다 — 공유 색표는 안 건드린다. */}
            <span className="inline-flex rounded-badge bg-surface-mid">
              <span className={[
                'inline-flex items-center rounded-badge border px-2 py-0.5 font-bold tracking-wide',
                CONDITION_COLOR[listing.condition],
              ].join(' ')}>
                {listing.condition}급
              </span>
            </span>
            {/* 상태칩도 등급칩과 같은 반투명 틴트라 같은 받침을 깐다 — 라이트 '예약중' 4.80 → 카드 위 4.35 였다(design-reviewer). */}
            {listing.status !== 'on_sale' && (
              <span className="inline-flex rounded-badge bg-surface-mid">
                <span className={[
                  'inline-flex items-center rounded-badge border px-2 py-0.5 font-bold',
                  status.cls,
                ].join(' ')}>
                  {status.label}
                </span>
              </span>
            )}
            <span className="text-ink-secondary">{listing.region}</span>
            <span className="text-border-strong">·</span>
            <span className="text-ink-secondary">{relativeTime(listing.createdAt)}</span>
            {/* 신고·차단 — 예전엔 글자만(20×16px)이라 손가락으로 거의 못 눌렀다. 44px 실박스(오버행 .hit 금지 — HANDOVER §3 J). */}
            {user && user.id !== listing.sellerId && (
              <span className="relative z-[1] -my-2.5 -mr-2 ml-auto flex shrink-0 items-center">
                {/* relative z-[1]: 칩 줄이 접혀 이 묶음만 한 줄에 남으면 -my-2.5 로 튀어나온 아래 2px 를 다음 형제 h1 이 덮어
                    히트가 42px 였다(design-reviewer 2026-09-24, 320·긴 지역명). 쌓임 순서를 올려 44px 전부를 버튼이 받는다. */}
                <button type="button" onClick={() => setReportOpen(true)}
                  className="inline-flex h-[44px] min-w-[44px] items-center justify-center whitespace-nowrap px-2 text-xs text-ink-muted hover:text-danger-light transition-colors">신고</button>
                <button type="button"
                  onClick={async () => {
                    if (!confirm(`'${listing.sellerName}'님을 차단할까요?\n이 판매자의 매물·글이 보이지 않게 됩니다.`)) return;
                    try { await block(listing.sellerId, listing.sellerName); toast.show('차단했습니다. 이 판매자의 매물이 숨겨집니다', 'info'); onClose(); }
                    catch (e) { toast.show(e instanceof Error ? e.message : '차단 실패', 'error'); }
                  }}
                  className="inline-flex h-[44px] min-w-[44px] items-center justify-center whitespace-nowrap px-2 text-xs text-ink-muted hover:text-danger-light transition-colors">차단</button>
                {/* 관리자 삭제 — 판매자 본인은 아래 '내 매물' 줄에 삭제가 따로 있다(mine 분기). */}
                {onDelete && user.role === 'admin' && (
                  <button type="button" onClick={() => { if (confirm('이 매물을 삭제하시겠습니까?')) onDelete(listing.id); }}
                    className="inline-flex h-[44px] min-w-[44px] items-center justify-center whitespace-nowrap px-2 text-xs font-semibold text-danger-light hover:bg-danger/10 rounded-input transition-colors">삭제</button>
                )}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-[20px] font-bold text-ink-primary leading-snug break-words">{listing.title}</h1>
          {/* 가격 31.9px → 25.5px — 여전히 화면에서 가장 큰 숫자다(제목 20px). */}
          <p data-mk-price className="mt-1.5 text-2xl font-extrabold text-accent-300 tabular-nums leading-none">
            {listing.price.toLocaleString()}
          </p>
          {/* 통계 — 2칸 큰 박스(약 60px)를 작은 한 줄 메타로. '댓글'은 뺐다: 장터 문의는 1:1 채팅으로 대체돼
              comment_count 가 영원히 0 이라 숫자를 보여주면 '문의가 하나도 없는 매물'로 오독된다.
              ⚠ 조회는 값이 있을 때만 — '조회 0'은 "아무도 안 봤다"는 거짓 정보가 된다(2026-09-07 감사 이후의 판단 유지).
              (정렬 칩 '조회수순'은 그대로 둔다 — 있던 기능을 지우지 않는다는 규약.) */}
          <p data-mk-stats className="mt-2.5 flex items-center gap-3 text-xs text-ink-secondary">
            {listing.viewCount > 0 && (
              <span>조회 <b className="font-semibold tabular-nums text-ink-primary">{listing.viewCount.toLocaleString()}</b></span>
            )}
            <span>찜 <b className="font-semibold tabular-nums text-ink-primary">{like.likeCount.toLocaleString()}</b></span>
          </p>
        </section>

        {/* ② 거래 옵션 + 판매자 — 한 카드. 판매자 칸의 큰 빈 상자를 없애고 36px 아바타 한 줄로. */}
        <section data-mk-card="deal" className={MK_CARD}>
          <h3 className="text-xs font-bold text-ink-secondary">거래 옵션</h3>
          <div className="mt-2 space-y-1.5">
            <OptionRow ok={listing.shippingAvailable} label="택배 발송 가능" />
            <OptionRow ok={!listing.pickupOnly}       label="비대면 거래 가능" />
            <OptionRow ok={true}                       label={`직거래 · ${listing.region}`} />
          </div>
          <div className="mt-3 flex items-center gap-2.5 border-t border-border-strong pt-3">
            <div
              className={['w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold', onColorInkClass(listing.sellerAvatarColor)].join(' ')}
              style={{ background: listing.sellerAvatarColor }}
            >
              {listing.sellerName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xs text-ink-muted">판매자</p>
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-ink-primary truncate">{listing.sellerName}</span>
                {listing.sellerVerified && (
                  <span title="본인 인증 완료" className="text-emerald-400">✓</span>
                )}
                {/* '거래 0회' 고정 표기는 갱신이 없는 죽은 스냅샷이라 오히려 불신을 만든다 — 0이면 숨김 */}
                {listing.sellerTradeCount > 0 && (
                  <span className="shrink-0 text-2xs text-ink-muted">· 거래 {listing.sellerTradeCount}회</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ③ 설명 — 게시글 본문과 같은 읽기 규격(15px · 행간 1.7 · ink-primary). */}
        <section data-mk-card="desc" className={MK_CARD}>
          <h3 className="text-xs font-bold text-ink-secondary">설명</h3>
          <p className="mt-1.5 text-[15px] text-ink-primary leading-[1.7] whitespace-pre-wrap break-words">
            {listing.description}
          </p>
        </section>

        {/* ④ 문의 안내 — 판매자와의 대화는 1:1 채팅으로 일원화.
            (이전엔 목업 댓글창이라 남겨도 저장·전달되지 않아 "문의했는데 답이 없다"는 오해를 만들었다)
            안내 문구의 버튼 이름을 실제 버튼('판매자에게 연락')과 맞췄다 — 예전엔 없는 '판매자에게 문의'를 가리켰다. */}
        <section id="listing-comments" data-mk-card="inquiry" className={[MK_CARD, 'dark:bg-surface-low text-center'].join(' ')}>
          <p className="text-xs font-bold text-ink-primary">궁금한 점이 있으신가요?</p>
          <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">
            가격 협상·상태 문의는 아래 <b className="text-accent-300">판매자에게 연락</b> 버튼으로<br />1:1 채팅에서 바로 대화할 수 있어요.
          </p>
          <p className="mt-2 rounded-input bg-amber-500/[0.08] px-2 py-1.5 text-2xs leading-relaxed text-amber-300">
            <Icon name="alert" size={12} className="mr-0.5 inline-block align-[-1px] shrink-0" />안전거래: 선입금 요구는 거절하세요 — 직거래·대면 확인을 권장하고, 의심되면 신고해 주세요.
          </p>
        </section>
      </div>

      {/* ── 하단 고정 CTA ── 버튼은 전부 44px 실박스·한 줄(whitespace-nowrap). ───────────── */}
      {mine ? (
        <div className="sticky bottom-0 border-t border-border-default bg-surface-mid px-4 py-3">
          <p className="mb-1.5 text-2xs font-bold text-ink-muted">내 매물 상태. 채팅으로 확정되면 바로 바꿔주세요</p>
          <div className="flex items-center gap-2">
            {([['on_sale', '판매중'], ['reserved', '예약중'], ['sold', '거래완료']] as const).map(([k, l]) => (
              <button key={k} type="button" disabled={statusBusy}
                onClick={() => changeStatus(k)}
                aria-pressed={listing.status === k}
                className={['min-h-[44px] flex-1 whitespace-nowrap rounded-input border py-2.5 text-sm font-bold transition-colors disabled:opacity-60',
                  listing.status === k
                    ? (k === 'sold' ? 'border-border-strong bg-surface-high text-ink-primary' : k === 'reserved' ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-emerald-500/60 bg-emerald-500/15 text-emerald-400')
                    : 'border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
                {l}
              </button>
            ))}
            {onDelete && (
              <button type="button" onClick={() => { if (confirm('이 매물을 삭제하시겠습니까?')) onDelete(listing.id); }}
                className="btn-ghost min-h-[44px] shrink-0 px-3 py-2.5 text-danger-light hover:bg-danger/10">삭제</button>
            )}
          </div>
        </div>
      ) : !isSold && (
        <div className="sticky bottom-0 bg-surface-mid border-t border-border-default px-4 py-3 flex items-center gap-2">
          {/* 찜하기 — 서버 영속 토글(listing_likes). 로컬 state 시절엔 닫으면 사라졌다 */}
          <button
            type="button"
            onClick={onToggleLike}
            disabled={likeBusy}
            aria-pressed={like.liked}
            aria-label={like.liked ? '찜 해제' : '찜하기'}
            className={[
              'shrink-0 w-11 h-11 rounded-input border transition-colors flex items-center justify-center disabled:opacity-60',
              like.liked
                ? 'bg-danger/15 border-danger text-danger'
                : 'border-border-default text-ink-secondary hover:text-danger',
            ].join(' ')}
          >
            <svg width="20" height="20" viewBox="0 0 22 22"
              fill={like.liked ? 'currentColor' : 'none'}
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden>
              <path d="M11 19.5L2.5 11C1 9.5 1 6.5 2.5 5C4 3.5 7 3.5 8.5 5L11 7.5L13.5 5C15 3.5 18 3.5 19.5 5C21 6.5 21 9.5 19.5 11L11 19.5Z" />
            </svg>
          </button>

          {/* 관리자 삭제는 위 요약 카드의 관리 동작 묶음(신고·차단 옆)으로 옮겼다 — 이 줄에 넷이 들어가면
              320px 에서 합이 369px 라 '판매자에게 연락'이 화면 밖으로 32px 잘려 나갔다(2026-09-24 실측, 종전부터). */}
          {/* 문의 안내로 스크롤 — 장터 댓글은 1:1 채팅으로 대체돼 더는 없다. 라벨을 실제 목적지에 맞춘다. */}
          <button type="button" onClick={scrollToComments} className="flex-1 btn-ghost min-h-[44px] py-2.5">
            문의 안내
          </button>

          {/* 판매자 채팅 모달 열기 */}
          <button type="button" onClick={() => setChatOpen(true)} className="flex-[2] btn-primary min-h-[44px] py-2.5">
            판매자에게 연락
          </button>
        </div>
      )}

      {/* 채팅 모달 */}
      <SellerChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        listing={listing}
      />
    </Modal>
    <ReportModal open={reportOpen} onClose={() => setReportOpen(false)}
      target={{ type: 'listing', id: listing.id, ownerId: listing.sellerId, summary: listing.title }} />
    </>
  );
}

// ── 판매자 채팅 모달 ────────────────────────────────────────────────────────

function SellerChatModal({
  open, onClose, listing,
}: { open: boolean; onClose: () => void; listing: MarketplaceListing }) {
  const { user } = useAuth();
  const isSeller = !!user && user.id === listing.sellerId;
  const [buyerId, setBuyerId]   = useState<string | null>(null);
  const [threads, setThreads]   = useState<ChatThread[]>([]);
  // 받은 문의 조회 실패를 '아직 받은 문의가 없습니다'로 위장하지 않는다(판매자가 문의를 놓친다)
  const [tErr, setTErr]         = useState<unknown>(null);
  const [tReload, setTReload]   = useState(0);

  // 열릴 때 초기화: 구매자는 본인 스레드, 판매자는 받은 문의 목록
  useEffect(() => {
    if (!open || !user) return;
    if (isSeller) {
      setBuyerId(null); setTErr(null);
      getListingThreads(listing.id).then(setThreads).catch(setTErr);
    } else {
      setBuyerId(user.id);
    }
  }, [open, user, isSeller, listing.id, tReload]);

  if (!user) {
    return (
      <Modal open={open} onClose={onClose} title="로그인 필요" maxWidth="sm" variant="center">
        <div className="p-4 space-y-3 text-center">
          <p className="text-sm text-ink-secondary">채팅은 로그인 후 이용 가능합니다.</p>
          {/* 이 모달(center, z-60)을 먼저 닫아야 뒤이어 뜨는 로그인 모달(같은 z-60, DOM 앞)이 가려지지 않는다.
              매물 상세는 App 상태(openListing)라 로그인 뒤에도 남아 있다 — 손님은 로그인만 하고 원래 자리로 돌아온다. */}
          <button type="button" onClick={() => { onClose(); promptLogin(); }} className="btn-primary w-full">로그인</button>
          <button type="button" onClick={onClose} className="btn-ghost w-full text-sm">닫기</button>
        </div>
      </Modal>
    );
  }

  const showThreadList = isSeller && !buyerId;
  const headerName = showThreadList
    ? '받은 문의'
    : isSeller
      ? (threads.find((t) => t.buyerId === buyerId)?.buyerName ?? '구매자')
      : listing.sellerName;

  return (
    <Modal open={open} onClose={onClose} maxWidth="md" variant="sheet">
      {/* 채팅 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
        {isSeller && buyerId && (
          <button type="button" onClick={() => setBuyerId(null)} aria-label="목록으로"
            className="w-8 h-8 -ml-1 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="10,3 5,8 10,13" />
            </svg>
          </button>
        )}
        <div
          className={['w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold', onColorInkClass(listing.sellerAvatarColor)].join(' ')}
          style={{ background: listing.sellerAvatarColor }}
        >
          {headerName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-primary truncate">{headerName}</p>
          <p className="text-2xs text-ink-muted truncate">상품: {listing.title}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기"
          className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
          </svg>
        </button>
      </div>

      {/* 상품 미리보기 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-high border-b border-border-subtle">
        <div className="w-8 h-8 shrink-0 rounded-input flex items-center justify-center bg-surface-float overflow-hidden">
          {listing.images.length > 0
            ? <img src={listing.images[0]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30" aria-hidden><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/></svg>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-ink-primary truncate">{listing.title}</p>
          <p className="text-2xs font-bold text-accent-300 tabular-nums">{listing.price.toLocaleString()}</p>
        </div>
      </div>

      {showThreadList ? (
        /* 판매자: 받은 문의 목록 */
        <div className="px-2 py-2 max-h-[55vh] min-h-[160px] overflow-y-auto">
          {tErr ? (
            <LoadErrorCard error={tErr} what="받은 문의" onRetry={() => setTReload((k) => k + 1)} compact />
          ) : threads.length === 0 ? (
            <p className="text-center py-12 text-sm text-ink-muted">아직 받은 문의가 없습니다</p>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => (
                <li key={t.buyerId}>
                  <button type="button" onClick={() => setBuyerId(t.buyerId)}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-input hover:bg-surface-high active:bg-surface-float transition-colors">
                    <div className="w-9 h-9 shrink-0 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-white">
                      {t.buyerName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ink-primary truncate">{t.buyerName}</span>
                        <span className="text-2xs text-ink-muted shrink-0">{relativeTime(t.lastAt)}</span>
                      </div>
                      <p className="text-xs text-ink-secondary truncate mt-0.5">{t.lastContent}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : buyerId ? (
        <div className="flex flex-col h-[52vh]">
          {/* key: 판매자가 문의 스레드를 갈아탈 때 인스턴스를 새로 만든다 — 이전 구매자와의 대화·전송 결과가 새 구매자 화면에 남지 않는다 */}
          <ChatPane key={`${listing.id}|${buyerId}`} listingId={listing.id} buyerId={buyerId} meId={user.id}
            emptyHint={isSeller ? '구매자에게 답장을 보내보세요' : '판매자에게 첫 메시지를 보내보세요'} />
        </div>
      ) : null}
    </Modal>
  );
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function CloseButton({ onClose, className = '' }: { onClose: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="닫기"
      className={[
        // 44px 실박스(예전 36px·슬림 헤더 42.5px — HANDOVER §3 J: 오버행 대신 실박스)
        'absolute top-3 right-3 h-[44px] w-[44px] flex items-center justify-center rounded-full',
        'bg-surface-base/80 backdrop-blur text-ink-primary hover:bg-surface-high transition-colors z-10',
        className,
      ].join(' ')}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
      </svg>
    </button>
  );
}

function SoldOverlay() {
  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
      <span className="text-3xl font-extrabold text-white rotate-[-8deg] border-4 border-white px-6 py-2 rounded">
        SOLD OUT
      </span>
    </div>
  );
}

function OptionRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={[
        'w-4 h-4 rounded-full flex items-center justify-center shrink-0',
        ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-high text-ink-muted',
      ].join(' ')}>
        {ok ? (
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <polyline points="1.5,4.5 3.5,6.5 7.5,2.5" />
          </svg>
        ) : (
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="2" y1="2" x2="7" y2="7" /><line x1="7" y1="2" x2="2" y2="7" />
          </svg>
        )}
      </span>
      <span className={ok ? 'text-ink-primary' : 'text-ink-muted line-through decoration-1'}>
        {label}
      </span>
    </div>
  );
}
