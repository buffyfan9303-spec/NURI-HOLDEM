/* ============================================================================
 * [UI/UX 점검 및 자가 진단] PostFormModal — 커뮤니티 글쓰기 (Stage 2)
 *  - 입력: 카테고리(필수·기본 자유) / 제목(필수) / 내용(필수) / 이미지 첨부(최대4)
 *  - 예외처리:
 *     · 내용 공백 → 제출 차단 + toast. content-filter(금칙어)도 통과해야 등록.
 *     · 이미지 5MB↑ / 비이미지 → 개별 스킵 + 경고, 4장 초과분 잘림.
 *     · 업로드 실패 시 등록 중단(부분 저장 방지) + toast.
 *     · 모달 열릴 때 폼/미리보기/objectURL 초기화 → 메모리릭·이전상태 잔존 방지.
 *  - 레이아웃: Modal(variant=sheet)로 모바일 하단시트 + 데스크톱 중앙. 이미지
 *    프리뷰는 grid-cols-4 정사각 썸네일 → 줄바꿈/넘침 없음.
 *  - 로그인 필요: 비로그인 시 호출부에서 진입을 막지만, 방어적으로 user 없으면 제출 차단.
 * ========================================================================== */
import { useState, useEffect, useRef, useId, Fragment } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { filterContent } from '../../lib/content-filter';
import { uploadCommunityImages } from '../../lib/storage';
import type { PostCategory } from '../../api/community';
import CardGridPicker from './gto/CardGridPicker';
import { cardId } from './gto/useDeepGto';
import type { Card } from './gto/gto.types';
import { encodeHand, encodeReplay, type HandSel, type ReplayData } from '../../lib/hand';
import { MiniCard } from '../atoms/HandCards';
import {
  CardPicker, PollBuilder, emptyHand, emptyPoll, normalizeHand, normalizePoll,
  type HandDraft, type PollDraft,
} from './PostComposerExtras';
import { saveHand, savePoll } from '../../api/postAttachments';
import { supabase, IS_MOCK } from '../../lib/supabase';
import Icon from '../atoms/Icon';

export interface PostFormData {
  category: PostCategory;
  title: string;
  content: string;
  images: string[];
}

interface PostFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PostFormData) => Promise<void> | void;
  /** 열릴 때 기본 선택 카테고리 ('홀덤 공부' 탭 진입 시 'study') */
  defaultCategory?: PostCategory;
  /** 열릴 때 본문 프리필(공유 타깃 — 다른 앱에서 공유받은 텍스트/링크) */
  defaultContent?: string;
  /** 열릴 때 핸드 첨부 프리필(핸드 리플레이어 '커뮤니티에 질문') — 코드가 아니라 카드 슬롯에 첨부된 채로 보인다 */
  defaultReplay?: ReplayData | null;
}

const CATEGORY_OPTIONS: { id: PostCategory; label: string }[] = [
  { id: 'free',     label: '자유' },
  { id: 'hand',     label: '핸드 분석' },
  { id: 'tourney',  label: '대회 후기' },
  { id: 'question', label: '질문' },
  { id: 'info',     label: '정보' },
  { id: 'review',   label: '후기' },
  { id: 'study',    label: '공부' },
];

const MAX_IMAGES = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * 방금 등록한 글의 id 복구 — onSubmit(App.handleCreatePost)이 id 를 돌려주지 않아
 * (시그니처가 Promise<void>, App.tsx 는 이 카드의 수정 범위 밖) 저장 직후 본인 글을 재조회한다.
 * 1차: user_id + content 정확 일치 최신 1건(경합에도 안전) → 2차 폴백: 본인 최신 1건.
 */
async function findCreatedPostId(userId: string, content: string): Promise<string | null> {
  const exact = await supabase
    .from('community_posts').select('id')
    .eq('user_id', userId).eq('content', content)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!exact.error && exact.data?.id) return exact.data.id as string;
  const latest = await supabase
    .from('community_posts').select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!latest.error && latest.data?.id) return latest.data.id as string;
  return null;
}

export default function PostFormModal({ open, onClose, onSubmit, defaultCategory, defaultContent, defaultReplay }: PostFormModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  // a11y(#30): 라벨↔입력 프로그램적 연결용 고유 id
  const titleId = useId();
  const contentId = useId();
  const potId = useId();
  const actId = useId();

  const [category, setCategory] = useState<PostCategory>('free');
  const [title,    setTitle]    = useState('');
  const [content,  setContent]  = useState('');
  const [files,    setFiles]    = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving,   setSaving]   = useState(false);

  // 핸드 첨부 (내 핸드/상대 핸드/보드 — 카드 클릭 선택. 보드 3장 이상이면 '리플레이'로 저장)
  const [showHand,   setShowHand]   = useState(false);
  const [hero,       setHero]       = useState<string[]>([]);
  const [villain,    setVillain]    = useState<string[]>([]);
  const [board,      setBoard]      = useState<string[]>([]);
  const [handTarget, setHandTarget] = useState<'hero' | 'villain' | 'board'>('hero');
  const [pot,        setPot]        = useState('');
  const [acts,       setActs]       = useState({ pre: '', flop: '', turn: '', river: '' });

  // 어태치먼트 드래프트 (핸드 카드 · 투표 — PostComposerExtras 패키지 계약)
  const [handDraft, setHandDraft] = useState<HandDraft>(emptyHand);
  const [pollDraft, setPollDraft] = useState<PollDraft>(emptyPoll);

  // 모달 열릴 때 초기화 + 닫힐 때 objectURL 해제
  useEffect(() => {
    if (open) {
      setCategory(defaultCategory ?? 'free'); setTitle(''); setContent(defaultContent ?? '');
      setFiles([]); setPreviews([]); setSaving(false);
      // 리플레이어에서 넘어온 핸드는 기존 핸드 첨부 슬롯에 그대로 앉힌다 — 제출 시 같은 encodeReplay 경로로 마커가 붙는다.
      const r = defaultReplay;
      setShowHand(!!r); setHero(r?.hero ?? []); setVillain(r?.villain ?? []); setBoard(r?.board ?? []); setHandTarget('hero');
      setPot(r?.pot ?? '');
      setActs({ pre: r?.actions.pre ?? '', flop: r?.actions.flop ?? '', turn: r?.actions.turn ?? '', river: r?.actions.river ?? '' });
      setHandDraft(emptyHand()); setPollDraft(emptyPoll());
      if (r) toast.show('핸드를 첨부한 글쓰기를 열었어요', 'success');
    }
  }, [open, defaultCategory, defaultContent, defaultReplay, toast]);

  const usedIds = new Set<string>([...hero, ...villain, ...board]);
  const handlePickCard = (card: Card) => {
    const id = cardId(card);
    if (usedIds.has(id)) return;
    if (handTarget === 'hero') {
      if (hero.length >= 2) return;
      const next = [...hero, id];
      setHero(next);
      if (next.length >= 2) setHandTarget('villain'); // 내 핸드 다 채우면 상대로 자동 전환
    } else if (handTarget === 'villain') {
      if (villain.length >= 2) return;
      const next = [...villain, id];
      setVillain(next);
      if (next.length >= 2) setHandTarget('board'); // 상대까지 채우면 보드로 자동 전환
    } else {
      if (board.length >= 5) return;
      setBoard([...board, id]);
    }
  };
  const removeCard = (target: 'hero' | 'villain' | 'board', idx: number) => {
    if (target === 'hero') setHero((p) => p.filter((_, i) => i !== idx));
    else if (target === 'villain') setVillain((p) => p.filter((_, i) => i !== idx));
    else setBoard((p) => p.filter((_, i) => i !== idx));
    setHandTarget(target);
  };

  useEffect(() => {
    // 언마운트/프리뷰 교체 시 objectURL 정리(메모리릭 방지)
    return () => { previews.forEach((u) => URL.revokeObjectURL(u)); };
  }, [previews]);

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 파일 재선택 허용
    if (picked.length === 0) return;

    const room = MAX_IMAGES - files.length;
    if (room <= 0) { toast.show(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다`, 'error'); return; }

    const valid: File[] = [];
    for (const f of picked.slice(0, room)) {
      if (!f.type.startsWith('image/')) { toast.show('이미지 파일만 첨부할 수 있습니다', 'error'); continue; }
      if (f.size > MAX_FILE_BYTES)      { toast.show('이미지는 5MB 이하만 가능합니다', 'error'); continue; }
      valid.push(f);
    }
    if (valid.length === 0) return;
    if (picked.length > room) toast.show(`최대 ${MAX_IMAGES}장까지만 첨부됩니다`, 'info');

    setFiles((prev) => [...prev, ...valid]);
    setPreviews((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))]);
  };

  const removeImage = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.show('로그인이 필요합니다', 'error');
    // 제목 필수(2026-08-29 오너 지시). 예전엔 선택이라 목록이 본문 앞부분을 제목처럼 잘라 보여줬는데,
    // 그러면 목록에서 무슨 글인지 알 수 없고 상세 최상단 제목 블록도 빈다.
    // 내용보다 **먼저** 검사한다 — 위에서 아래로 채우는 순서와 오류 지적 순서가 같아야 한다.
    const head = title.trim();
    if (!head) return toast.show('제목을 입력해 주세요', 'error');
    const body = content.trim();
    if (!body) return toast.show('내용을 입력해 주세요', 'error');

    // 금칙어 필터 — 본문·제목에 더해 새 어태치먼트 텍스트(핸드 요약·투표 질문/보기)도 함께 검사
    const extraText = [
      handDraft.headline, handDraft.delta, handDraft.meta,
      ...(pollDraft.enabled ? [pollDraft.question, ...pollDraft.options] : []),
    ].join(' ');
    const check = filterContent(`${title} ${body} ${extraText}`);
    if (check.blocked) return toast.show(check.reason!, 'error');
    if (board.length > 0 && board.length < 3) {
      return toast.show('보드는 플랍(3장) 이상 선택해야 리플레이로 저장됩니다', 'error');
    }

    setSaving(true);
    try {
      let images: string[] = [];
      if (files.length > 0) {
        images = await uploadCommunityImages(user.id, files, MAX_IMAGES);
      }
      // 보드까지 채웠으면 리플레이로, 핸드만 골랐으면 기존 핸드 첨부로 저장
      let encoded = body;
      if (board.length >= 3) {
        encoded = encodeReplay(body, { hero, villain, board, pot, actions: acts });
      } else {
        const hand: HandSel | null = (hero.length > 0 || villain.length > 0) ? { hero, villain } : null;
        encoded = encodeHand(body, hand);
      }
      await onSubmit({ category, title: title.trim(), content: encoded, images });

      // 어태치먼트 저장 — 판정은 normalize 가 단일 소스(빈 입력 → null → 저장 안 함).
      // 여기서부터의 실패는 '글 등록 성공'을 뒤집지 않는다(부분 실패 토스트로만 안내).
      const hand = normalizeHand(handDraft);
      const poll = normalizePoll(pollDraft);
      let extrasFailed = false;
      if ((hand !== null || poll !== null) && !IS_MOCK) {
        try {
          const postId = await findCreatedPostId(user.id, encoded);
          if (!postId) throw new Error('생성된 글 id 를 찾지 못했습니다');
          await saveHand(postId, hand);
          await savePoll(postId, poll);
        } catch {
          extrasFailed = true;
        }
      }

      toast.show(
        extrasFailed ? '글은 등록됐지만 핸드·투표 첨부 저장에 실패했습니다' : '게시글이 등록되었습니다',
        extrasFailed ? 'error' : 'success',
      );
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '게시글 등록에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="글쓰기" maxWidth="md" variant="sheet">
      <form onSubmit={handleSubmit}>
        {/* 입력부 — 액션바(하단 고정)와 분리해야 sticky 가 스크롤포트 바닥에 붙는다 */}
        <div className="p-4 space-y-4">
          {/* 카테고리 — 1행 가로 스크롤(오너 확정안 A).
              3열 그리드 3행(실측 168.1px)이 첫 화면의 절반을 먹어 '게시하기'를 접힘 아래로 밀어냈다.
              문법은 목록 필터(CommunityTab 카테고리 칩)와 동일 — 같은 것은 같게 보여야 학습이 이전된다.
              ⚠ .hit(가상요소 확장)은 overflow-x:auto 부모가 잘라내므로 터치 타깃은 **실제 높이 44px**로 만든다. */}
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">카테고리</label>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none">
              {CATEGORY_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={category === o.id}
                  onClick={() => setCategory(o.id)}
                  className={[
                    'min-h-[44px] shrink-0 inline-flex items-center px-3 rounded-badge text-2xs font-bold leading-none transition-colors focus:outline-none',
                    category === o.id
                      ? 'bg-accent-300/15 text-accent-200 ring-1 ring-inset ring-accent-400/45 shadow-glow'
                      : 'bg-surface-high text-ink-secondary hover:bg-surface-float/70',
                  ].join(' ')}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* 제목 */}
          <div>
            <label htmlFor={titleId} className="block text-xs font-medium text-ink-secondary mb-1.5">
              제목 <span className="text-danger ml-0.5">*</span>
            </label>
            <input
              id={titleId}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              // ⚠ HTML `required` 는 쓰지 않는다(2026-08-29 검증에서 잡힘).
              //   그걸 달면 브라우저 기본 검증이 submit 을 가로채 handleSubmit 이 아예 실행되지 않고,
              //   바로 아래 '내용'(textarea, required 없음)은 앱 토스트로 안내되므로
              //   **같은 폼의 인접 두 필드가 서로 다른 오류 언어**를 쓰게 된다.
              //   필수 여부는 aria-required 로 보조기술에 알리고, 판정·문구는 handleSubmit 이 단독으로 맡는다.
              aria-required="true"
              placeholder="제목을 입력하세요"
              className="input"
            />
          </div>

          {/* 내용 */}
          <div>
            <label htmlFor={contentId} className="block text-xs font-medium text-ink-secondary mb-1.5">
              내용 <span className="text-danger ml-0.5">*</span>
            </label>
            <textarea
              id={contentId}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={4000}
              rows={6}
              placeholder="내용을 입력하세요"
              className="input resize-none"
              autoFocus
            />
            <p className="text-right text-2xs text-ink-muted mt-1">{content.length}/4000</p>
          </div>

          {/* 핸드 카드 · 투표 어태치먼트 (PostComposerExtras — 오너 패키지 이식) */}
          {/* 표시부는 게시글당 어태치먼트 1개(핸드 우선) — 동시 첨부하면 투표가 안 보이므로 상호 배타 */}
          <CardPicker value={handDraft} onChange={setHandDraft}
            blockedBy={pollDraft.enabled ? '투표를 켠 글에는 핸드 카드를 함께 첨부할 수 없어요. 투표를 끄면 다시 열립니다' : undefined} />
          <PollBuilder value={pollDraft} onChange={setPollDraft}
            blockedBy={normalizeHand(handDraft) !== null ? '핸드 카드를 첨부한 글에는 투표를 함께 만들 수 없어요. 카드·요약을 지우면 다시 열립니다' : undefined} />

          {/* 이미지 첨부 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-ink-secondary">
                이미지 <span className="text-ink-muted">({previews.length}/{MAX_IMAGES})</span>
              </label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={previews.length >= MAX_IMAGES}
                className="text-2xs font-semibold text-accent-200 hover:text-accent-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + 사진 추가
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePickFiles}
              className="hidden"
            />
            {previews.length > 0 ? (
              <div className="grid grid-cols-4 gap-1.5">
                {previews.map((src, i) => (
                  <div key={src} className="relative aspect-square rounded-input overflow-hidden border border-border-default group">
                    <img src={src} alt={`첨부 이미지 ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      aria-label="이미지 제거"
                      className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white text-xs hover:bg-danger transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full py-3.5 rounded-input border border-dashed border-border-strong text-2xs text-ink-muted hover:border-accent-400/50 hover:text-ink-secondary transition-colors"
              >
                사진을 첨부하려면 클릭하세요 (최대 {MAX_IMAGES}장 · 5MB)
              </button>
            )}
          </div>

          {/* 핸드 첨부 (내 핸드 / 상대 핸드) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-ink-secondary">
                핸드 첨부 <span className="text-ink-muted">(선택)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowHand((v) => !v)}
                className="text-2xs font-semibold text-accent-200 hover:text-accent-100"
              >
                {showHand ? '닫기' : '+ 핸드 추가'}
              </button>
            </div>

            {showHand && (
              <div data-testid="post-form-hand" className="card-sink space-y-2 rounded-input border border-border-default bg-surface-high p-2.5 animate-slide-up">
                {/* 슬롯 (탭하면 채울 대상 전환, 카드 탭하면 제거) — 보드(3장 이상)까지 채우면 🎬 리플레이로 저장 */}
                <div className="grid grid-cols-3 gap-2">
                  {(['hero', 'villain', 'board'] as const).map((t) => {
                    const cards = t === 'hero' ? hero : t === 'villain' ? villain : board;
                    const label = t === 'hero' ? '내 핸드' : t === 'villain' ? '상대 핸드' : '보드';
                    return (
                      <div
                        key={t}
                        role="button"
                        tabIndex={0}
                        onClick={() => setHandTarget(t)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setHandTarget(t); }}
                        className={[
                          // 패널이 불투명 surface-high 가 되면서 타일도 surface-high 면 면 차이가 0이 된다
                          // → 타일은 한 단 내려(surface-mid) '패널 위에 파인 칸'으로 읽히게 한다.
                          'rounded-input border p-2 cursor-pointer transition-colors focus:outline-none',
                          handTarget === t ? 'border-accent-400 bg-accent-300/10' : 'border-border-default bg-surface-mid',
                        ].join(' ')}
                      >
                        <span className="block text-xs text-ink-muted mb-1">{label}</span>
                        <div className="flex flex-wrap gap-1 min-h-[1.75rem] items-center">
                          {cards.length === 0 ? (
                            <span className="text-xs text-ink-muted">카드 선택</span>
                          ) : (
                            cards.map((c, i) => (
                              <button
                                key={c}
                                type="button"
                                aria-label={`${c} 제거`}
                                onClick={(e) => { e.stopPropagation(); removeCard(t, i); }}
                              >
                                <MiniCard id={c} />
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-ink-muted">
                  <span className="text-accent-200 font-semibold">{handTarget === 'hero' ? '내 핸드' : handTarget === 'villain' ? '상대 핸드' : '보드'}</span>
                  에 넣을 카드를 아래에서 선택하세요 (카드를 다시 누르면 제거) · 보드를 3장 이상 고르면 <b className="inline-flex items-center gap-1 align-[-2px] text-accent-200"><Icon name="clapperboard" size={13} className="shrink-0" />단계별 리플레이</b>로 올라갑니다
                </p>
                {/* 52장 그리드 트레이 — CardGridPicker 의 타일은 surface-high 라(그 파일은 이 카드의 소유 밖),
                    불투명 surface-high 패널 위에 직접 두면 타일 면이 사라진다. 한 단 내린 판을 깔아 면을 되살린다. */}
                <div className="rounded-input bg-surface-mid p-1">
                  <CardGridPicker usedIds={usedIds} onPick={handlePickCard} />
                </div>

                {/* 보드를 채우면 리플레이 상세(팟·스트리트별 액션) 입력 노출 */}
                {board.length >= 3 && (
                  <div className="space-y-1.5 border-t border-border-default pt-2 animate-fade-in">
                    {/* 라벨 + 짧은 placeholder — 좁은 화면에서 안 잘린다(전부 선택 입력) */}
                    <div className="grid grid-cols-[3.75rem_1fr] items-center gap-x-2 gap-y-1.5">
                      <label htmlFor={potId} className="text-2xs font-bold text-ink-secondary">팟</label>
                      <input id={potId} type="text" value={pot} onChange={(e) => setPot(e.target.value)} maxLength={20}
                        placeholder="예: 12.5bb, 34만" className="input w-full bg-surface-mid text-sm" />
                      {([['pre', '프리플랍'], ['flop', '플랍'], ['turn', '턴'], ['river', '리버']] as const).map(([k, lab]) => (
                        <Fragment key={k}>
                          <label htmlFor={`${actId}-${k}`} className="text-2xs font-bold text-ink-secondary">{lab}</label>
                          <input id={`${actId}-${k}`} type="text" value={acts[k]} maxLength={80}
                            onChange={(e) => setActs((p) => ({ ...p, [k]: e.target.value }))}
                            placeholder="예: 내가 2.5bb 오픈, 상대 콜" className="input w-full bg-surface-mid text-sm" />
                        </Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 액션바 — 하단 고정(sticky). 문서 흐름 최하단에 두면 빈 폼에서도 '게시하기'가 접힘 아래로
            밀려나(375×667 실측 165.2px 아래) 첫 화면에서 보이지 않았다.
            문법은 앱에 이미 있는 선례를 따른다: ListingDetailModal 의 하단 고정 CTA
            (sticky bottom-0 / border-t / 불투명 bg-surface-mid). backdrop-filter 는 쓰지 않는다 —
            상시 노출 요소의 blur 는 스크롤 중 페인트 폭탄이다(모션 헌법 §20.4-3·5). */}
        <div className="sticky bottom-0 z-10 flex gap-2 border-t border-border-default bg-surface-mid px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">취소</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-60">
            {saving ? '등록 중…' : '게시하기'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
