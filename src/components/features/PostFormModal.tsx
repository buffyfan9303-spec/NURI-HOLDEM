/* ============================================================================
 * [UI/UX 점검 및 자가 진단] PostFormModal — 커뮤니티 글쓰기 (Stage 2)
 *  - 입력: 카테고리(필수·기본 자유) / 제목(선택) / 내용(필수) / 이미지 첨부(최대4)
 *  - 예외처리:
 *     · 내용 공백 → 제출 차단 + toast. content-filter(금칙어)도 통과해야 등록.
 *     · 이미지 5MB↑ / 비이미지 → 개별 스킵 + 경고, 4장 초과분 잘림.
 *     · 업로드 실패 시 등록 중단(부분 저장 방지) + toast.
 *     · 모달 열릴 때 폼/미리보기/objectURL 초기화 → 메모리릭·이전상태 잔존 방지.
 *  - 레이아웃: Modal(variant=sheet)로 모바일 하단시트 + 데스크톱 중앙. 이미지
 *    프리뷰는 grid-cols-4 정사각 썸네일 → 줄바꿈/넘침 없음.
 *  - 로그인 필요: 비로그인 시 호출부에서 진입을 막지만, 방어적으로 user 없으면 제출 차단.
 * ========================================================================== */
import { useState, useEffect, useRef, Fragment } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { filterContent } from '../../lib/content-filter';
import { uploadCommunityImages } from '../../lib/storage';
import type { PostCategory } from '../../api/community';
import CardGridPicker from './gto/CardGridPicker';
import { cardId } from './gto/useDeepGto';
import type { Card } from './gto/gto.types';
import { encodeHand, encodeReplay, type HandSel } from '../../lib/hand';
import { MiniCard } from '../atoms/HandCards';

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

export default function PostFormModal({ open, onClose, onSubmit, defaultCategory, defaultContent }: PostFormModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

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

  // 모달 열릴 때 초기화 + 닫힐 때 objectURL 해제
  useEffect(() => {
    if (open) {
      setCategory(defaultCategory ?? 'free'); setTitle(''); setContent(defaultContent ?? '');
      setFiles([]); setPreviews([]); setSaving(false);
      setShowHand(false); setHero([]); setVillain([]); setBoard([]); setHandTarget('hero');
      setPot(''); setActs({ pre: '', flop: '', turn: '', river: '' });
    }
  }, [open, defaultCategory, defaultContent]);

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
    const heading = title.trim();
    if (!heading) return toast.show('제목을 입력해 주세요', 'error');
    const body = content.trim();
    if (!body) return toast.show('내용을 입력해 주세요', 'error');

    const check = filterContent(`${title} ${body}`);
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
      toast.show('게시글이 등록되었습니다', 'success');
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '게시글 등록에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="글쓰기" maxWidth="md" variant="sheet">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* 카테고리 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">카테고리</label>
          <div className="grid grid-cols-3 gap-1.5">
            {CATEGORY_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setCategory(o.id)}
                className={[
                  'min-h-[44px] px-1 inline-flex items-center justify-center text-xs font-semibold rounded-input border transition-colors focus:outline-none',
                  category === o.id
                    ? 'bg-gold-300/20 border-gold-300 text-gold-300'
                    : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary',
                ].join(' ')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            제목 <span className="text-danger ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="제목을 입력하세요"
            className="input"
          />
        </div>

        {/* 내용 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            내용 <span className="text-danger ml-0.5">*</span>
          </label>
          <textarea
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
              className="text-2xs font-semibold text-gold-300 hover:text-gold-200 disabled:opacity-40 disabled:cursor-not-allowed"
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
              className="w-full py-6 rounded-input border border-dashed border-border-default text-2xs text-ink-muted hover:border-gold-400/50 hover:text-ink-secondary transition-colors"
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
              className="text-2xs font-semibold text-gold-300 hover:text-gold-200"
            >
              {showHand ? '닫기' : '+ 핸드 추가'}
            </button>
          </div>

          {showHand && (
            <div className="space-y-2 rounded-input border border-border-default bg-surface-high/40 p-2.5 animate-slide-up">
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
                        'rounded-input border p-2 cursor-pointer transition-colors focus:outline-none',
                        handTarget === t ? 'border-gold-300 bg-gold-300/10' : 'border-border-default bg-surface-high',
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
                <span className="text-gold-300 font-semibold">{handTarget === 'hero' ? '내 핸드' : handTarget === 'villain' ? '상대 핸드' : '보드'}</span>
                에 넣을 카드를 아래에서 선택하세요 (카드를 다시 누르면 제거) · 보드를 3장 이상 고르면 <b className="text-gold-300">🎬 단계별 리플레이</b>로 올라갑니다
              </p>
              <CardGridPicker usedIds={usedIds} onPick={handlePickCard} />

              {/* 보드를 채우면 리플레이 상세(팟·스트리트별 액션) 입력 노출 */}
              {board.length >= 3 && (
                <div className="space-y-1.5 border-t border-border-subtle pt-2 animate-fade-in">
                  {/* 라벨 + 짧은 placeholder — 좁은 화면에서 안 잘린다(전부 선택 입력) */}
                  <div className="grid grid-cols-[3.75rem_1fr] items-center gap-x-2 gap-y-1.5">
                    <span className="text-2xs font-bold text-ink-secondary">팟</span>
                    <input type="text" value={pot} onChange={(e) => setPot(e.target.value)} maxLength={20}
                      placeholder="예: 12.5bb, 34만" className="input w-full text-sm" />
                    {([['pre', '프리플랍'], ['flop', '플랍'], ['turn', '턴'], ['river', '리버']] as const).map(([k, lab]) => (
                      <Fragment key={k}>
                        <span className="text-2xs font-bold text-ink-secondary">{lab}</span>
                        <input type="text" value={acts[k]} maxLength={80}
                          onChange={(e) => setActs((p) => ({ ...p, [k]: e.target.value }))}
                          placeholder="예: 내가 2.5bb 오픈, 상대 콜" className="input w-full text-sm" />
                      </Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">취소</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-60">
            {saving ? '등록 중…' : '게시하기'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
