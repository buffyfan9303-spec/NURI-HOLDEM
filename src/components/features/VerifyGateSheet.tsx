// src/components/features/VerifyGateSheet.tsx
// 본인인증 게이트 안내 시트(#31) — 미인증 회원이 민감 기능(글쓰기·중고장터·예약 등)을 시도하면
// 사라지는 토스트 대신, "왜 필요한지 + 무엇이 열리는지"를 설명하는 하단 시트를 띄운다.
// REQUIRE_VERIFY_EVENT(detail.reason)를 직접 듣고 자체 상태로 열림 — App 은 onStart 만 연결.
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { REQUIRE_VERIFY_EVENT } from '../../lib/requireLogin';

const BENEFITS = [
  { icon: '✍️', t: '글·댓글 작성', d: '커뮤니티에 자유롭게 참여' },
  { icon: '🛒', t: '중고장터 등록', d: '안전 거래를 위한 판매자 인증' },
  { icon: '🎟️', t: '대회 예약', d: '노쇼 방지 · 신뢰 좌석 확보' },
  { icon: '🏆', t: '전적·랭킹 인정', d: '본인 명의로 기록이 집계' },
];

export default function VerifyGateSheet({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: Event) => {
      const r = (e as CustomEvent).detail?.reason as string | undefined;
      setReason(r && r.trim() ? r.trim() : null);
      setOpen(true);
    };
    window.addEventListener(REQUIRE_VERIFY_EVENT, h);
    return () => window.removeEventListener(REQUIRE_VERIFY_EVENT, h);
  }, []);

  const start = () => { setOpen(false); onStart(); };

  return (
    <Modal open={open} onClose={() => setOpen(false)} variant="sheet" maxWidth="sm" title="휴대폰 본인인증">
      <div className="space-y-4 px-4 pb-5 pt-1">
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-300/[0.12] text-2xl" aria-hidden>🔒</div>
          <div>
            <p className="text-sm font-bold text-ink-primary">
              {reason ? `'${reason}'은(는) 본인인증이 필요해요` : '본인인증이 필요한 기능이에요'}
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">
              휴대폰 본인인증 한 번이면 아래 기능을 모두 이용할 수 있어요. 명의 도용·중복가입·노쇼를 막기 위한 1회 절차입니다.
            </p>
          </div>
        </div>

        <ul className="space-y-2">
          {BENEFITS.map((b) => (
            <li key={b.t} className="flex items-center gap-3 rounded-input border border-border-subtle bg-surface-high px-3 py-2.5">
              <span className="text-lg" aria-hidden>{b.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink-primary">{b.t}</p>
                <p className="text-[11px] text-ink-muted">{b.d}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <button type="button" onClick={start} className="btn-primary w-full py-3 text-sm">휴대폰 본인인증 하기</button>
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost w-full py-2.5 text-xs">나중에 할게요</button>
        </div>
        <p className="text-center text-[10px] text-ink-muted">인증 정보는 본인 확인 용도로만 사용되며 안전하게 보호됩니다.</p>
      </div>
    </Modal>
  );
}
