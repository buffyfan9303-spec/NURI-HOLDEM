// src/components/features/ContactActions.tsx
// 매장/커뮤니티 공통 연락 수단 — 전화 · 카카오톡.
//
// 왜 뽑았나: 오너 #16(일반 커뮤니티에 전화·카카오톡 추가)에서 매장 페이지의 구현을
// 그대로 한 벌 더 만들면 두 화면 중 한쪽만 고쳐지는 상태가 된다. 실제로 매장 쪽에는
// 2026-08-29 오너 지시(“링크 미설정이어도 버튼 자리는 지킨다”)가 주석까지 붙어 반영돼
// 있는데, 복제본에는 그 맥락이 따라오지 않는다. 그래서 컨트롤 자체를 공용으로 옮긴다.
import { useToast } from '../atoms/Toast';
import Icon from '../atoms/Icon';

/** Tier1 행동 버튼 공통 규격 — 44px 히트영역, 남는 폭 균등 분할(flex-1) */
const ACTION_BASE =
  'inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-input px-2 text-sm font-semibold transition-colors';
const ACTION_SOLID = `${ACTION_BASE} border border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary`;
const ACTION_INVITE = `${ACTION_BASE} border border-dashed border-accent-400/50 bg-accent-300/[0.06] text-accent-200 hover:bg-accent-300/10`;
const ACTION_EMPTY =
  'inline-flex h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-input border border-dashed border-border-default bg-surface-high/60 px-2 text-center leading-none text-ink-muted';

/** 전화 걸기 — 번호가 있을 때만. 없으면 관리자에게만 등록 유도 버튼. */
export function PhoneActionButton({ phone, canEdit, onEdit }: { phone?: string; canEdit?: boolean; onEdit?: () => void }) {
  const n = (phone ?? '').trim();
  if (n) {
    return (
      <a href={`tel:${n.replace(/[^0-9+]/g, '')}`} className={ACTION_SOLID}>
        <Icon name="phone" size={16} className="shrink-0" /> 전화
      </a>
    );
  }
  if (!canEdit) return null;
  return (
    <button type="button" onClick={onEdit} aria-label="전화번호 등록" className={ACTION_INVITE}>
      <Icon name="phone" size={16} className="shrink-0" /> 전화 등록
    </button>
  );
}

/**
 * 카카오톡 — 2026-08-29 오너 지시로 **링크가 없어도 항상 보인다**.
 * 예전엔 링크가 있을 때만 렌더해서, 등록하지 않은 곳에선 버튼이 통째로 사라졌다
 * → 운영자는 그런 기능이 있는 줄 모르고, 손님은 자리가 비어 행동 정렬이 무너졌다.
 * 이제 자리는 늘 지키고 상태만 달라진다:
 *   · 링크 있음          → 새 탭으로 채팅방
 *   · 없음 + 운영자 본인 → 바로 등록(발견 → 설정이 한 번에)
 *   · 없음 + 손님        → 왜 못 여는지 **누르기 전에** 말해 주는 비인터랙티브 칩
 *     (버튼으로 두면 눌러도 아무 데도 못 가는 가짜 행동이 된다 — '무반응 클릭 금지')
 */
export function KakaoActionButton({ kakao, canEdit, onEdit }: { kakao?: string; canEdit?: boolean; onEdit?: () => void }) {
  const url = (kakao ?? '').trim();
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={ACTION_SOLID}>
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#FEE500]" /> 카카오톡
      </a>
    );
  }
  if (canEdit) {
    return (
      <button type="button" onClick={onEdit} aria-label="카카오톡 채팅방 링크 등록" className={ACTION_INVITE}>
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#FEE500]" /> 카카오톡 등록
      </button>
    );
  }
  return (
    <span className={ACTION_EMPTY}>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#FEE500]/45" />카카오톡
      </span>
      <span className="mt-0.5 text-2xs">미등록</span>
    </span>
  );
}

/** 상세 정보 영역용 카카오톡 줄 — 노란 칩 + (운영자) 수정 링크 */
export function KakaoChatRow({ kakao, canEdit, onEdit }: { kakao?: string; canEdit?: boolean; onEdit?: () => void }) {
  const url = (kakao ?? '').trim();
  if (!url && !canEdit) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#FEE500] text-[#3A1D1D] text-xs font-bold hover:brightness-95 transition-[transform,filter] active:scale-95">
          <Icon name="comment" size={14} /> 카카오톡 오픈채팅
        </a>
      )}
      {canEdit && (
        <button type="button" onClick={onEdit} className="text-2xs text-ink-muted hover:text-accent-200">
          {url ? '카톡링크 수정' : '+ 카톡링크 등록'}
        </button>
      )}
    </div>
  );
}

/**
 * 연락처 행(다중·라벨) — 오너 #17.
 * 각 번호가 **독립적으로 전화 걸린다**(tel:). 라벨이 있으면 번호 앞에 붙어 '어디로 걸지'를
 * 손님이 고민하지 않게 한다. 라벨이 없으면(구 데이터 폴백) 번호만 그린다.
 * 탭 = 복사 우선, 복사가 막힌 환경(비-보안 컨텍스트 등)에서는 tel: 이 그대로 실행된다.
 */
export function ContactRows({ contacts, label = '연락처' }: { contacts: { label: string; phone: string }[]; label?: string }) {
  const toast = useToast();
  if (contacts.length === 0) return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <dt className="w-14 shrink-0 pt-1.5 text-ink-muted">{label}</dt>
      {/* 칩 사이 6px — '행 간 8px'(dl)보다 작아야 같은 항목의 조각으로 읽힌다 */}
      <dd className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {contacts.map((c, i) => (
          <a
            key={`${c.phone}-${i}`}
            href={`tel:${c.phone.replace(/[^0-9+]/g, '')}`}
            title={c.label ? `${c.label} ${c.phone}` : c.phone}
            onClick={async (e) => {
              try {
                await navigator.clipboard.writeText(c.phone);
                e.preventDefault();
                toast.show(`${c.phone} 복사됨`, 'success');
              } catch { /* 복사 실패 → tel: 링크 그대로 실행 */ }
            }}
            className="hit inline-flex h-8 items-center gap-1.5 rounded-input border border-border-default bg-surface-high px-3 text-2xs font-semibold text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
          >
            {c.label && <span className="shrink-0 rounded-badge bg-accent-300/15 px-1.5 py-0.5 text-[9px] font-bold text-accent-300">{c.label}</span>}
            <span className="tabular-nums">{c.phone}</span>
          </a>
        ))}
      </dd>
    </div>
  );
}

/** 연락처 행 — 탭하면 복사(실패 시 tel: 그대로 실행). '/' 로 여러 번호 구분. */
export function PhoneRow({ phone, label = '연락처' }: { phone: string; label?: string }) {
  const toast = useToast();
  const numbers = phone.split('/').map((s) => s.trim()).filter(Boolean);
  return (
    <div className="flex items-start gap-2 text-xs">
      <dt className="w-14 shrink-0 text-ink-muted">{label}</dt>
      <dd className="flex-1 flex flex-wrap gap-1.5">
        {numbers.map((n) => (
          <a
            key={n}
            href={`tel:${n.replace(/[^0-9+]/g, '')}`}
            onClick={async (e) => {
              // 클립보드 복사 성공 시 tel: 링크 막고 토스트 표시 / 실패 시 기본 tel: 링크 실행
              try {
                await navigator.clipboard.writeText(n);
                e.preventDefault();
                toast.show(`${n} 복사됨`, 'success');
              } catch { /* 복사 실패 → tel: 링크 그대로 실행 */ }
            }}
            className="hit inline-flex h-8 items-center rounded-input border border-border-default bg-surface-high px-3 text-2xs font-semibold text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary tabular-nums"
          >
            {n}
          </a>
        ))}
      </dd>
    </div>
  );
}
