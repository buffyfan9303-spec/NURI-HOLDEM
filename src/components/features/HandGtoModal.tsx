// src/components/features/HandGtoModal.tsx
// 게시판 핸드(내 홀카드 2장) → GTO 프리플랍 분석. 핸드 라벨·강도·포지션별 오픈 권장(스택별).
import { useState } from 'react';
import Modal from '../atoms/Modal';
import { cardsToLabel, RANK_PCT, POSITIONS, STACKS, action, openPct, type StackBB } from '../../lib/preflop';

export default function HandGtoModal({ hero, onClose }: { hero: string[]; onClose: () => void }) {
  const [bb, setBb] = useState<StackBB>(100);
  const label = hero.length >= 2 ? cardsToLabel(hero[0], hero[1]) : null;
  const pctRank = label ? Math.round((RANK_PCT.get(label) ?? 1) * 100) : 0;

  return (
    <Modal open onClose={onClose} title="GTO 프리플랍 분석" maxWidth="sm">
      {!label ? (
        <p className="p-6 text-center text-sm text-ink-muted">내 홀카드 2장이 있어야 분석할 수 있어요.<br />핸드를 첨부한 글에서 사용하세요.</p>
      ) : (
        <div className="space-y-3 p-4">
          {/* 핸드 + 강도 */}
          <div className="rounded-card border border-gold-400/30 bg-gold-300/[0.05] p-3 text-center">
            <p className="text-2xs text-ink-muted">내 핸드</p>
            <p className="text-3xl font-extrabold leading-none text-gold-300">{label}</p>
            <p className="mt-1 text-xs text-ink-secondary">169핸드 중 <b className="text-ink-primary">상위 {pctRank}%</b> 강도</p>
          </div>

          {/* 스택 토글 */}
          <div className="flex items-center gap-1">
            {STACKS.map((st) => {
              const on = st.bb === bb;
              return (
                <button key={st.bb} type="button" onClick={() => setBb(st.bb)}
                  className={['flex-1 h-8 rounded-input text-xs font-bold border transition-colors',
                    on ? 'bg-gold-300 border-gold-300 text-ink-inverse' : 'bg-surface-high border-border-default text-ink-muted'].join(' ')}>
                  {st.label}
                </button>
              );
            })}
          </div>

          {/* 포지션별 오픈 권장(6맥스) */}
          <div>
            <p className="mb-1 text-2xs font-bold text-ink-secondary">포지션별 오픈 권장 · 6맥스</p>
            <div className="grid grid-cols-5 gap-1">
              {POSITIONS.map((p) => {
                const a = action(label, openPct(p.id, '6', 'open', bb));
                const lab = a === 'raise' ? '오픈' : a === 'mix' ? '혼합' : '폴드';
                const cls = a === 'raise' ? 'bg-gold-300 text-ink-inverse' : a === 'mix' ? 'bg-gold-300/25 text-gold-300' : 'bg-surface-high text-ink-muted/70';
                return (
                  <div key={p.id} className="text-center">
                    <p className="text-2xs font-bold text-ink-secondary">{p.label}</p>
                    <p className={['mt-0.5 rounded-input py-1.5 text-2xs font-extrabold', cls].join(' ')}>{lab}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] leading-relaxed text-ink-muted">※ 참고용 근사 레인지(스택·6맥스 오픈 기준)입니다. 멀티웨이·림프·PKO 등 상황 보정은 도구 탭의 <b className="text-gold-300">스타팅핸드 가이드</b>에서 확인하세요.</p>
        </div>
      )}
    </Modal>
  );
}
