// src/components/features/VenueContactFields.tsx
// 매장 연락처(다중) 입력 위젯 — 오너 #17.
//
// 왜 별도 파일인가: 같은 편집기가 두 곳에 필요하다.
//   ① 매장 페이지 인라인 '정보 편집'(운영자가 손님 화면에서 바로 고치는 경로 — 기존 기능)
//   ② 매장 설정 →「매장 페이지」의 연락처 섹션(오너 지시의 정식 자리, PC 99%)
// 한쪽에만 넣으면 두 문이 서로 다른 규칙(개수 상한·라벨 유무)을 갖게 된다.
//
// 규칙(오너 지시): **1개는 필수, 2개 이상은 [+] 로 추가.** 그래서 첫 줄은 삭제 버튼이 없다.
// 라벨은 왜 필수 개념인가: 번호가 둘이 되는 순간 손님의 질문은 '어디로 걸지'가 된다.
// 라벨 없는 번호 두 개는 그 선택을 손님에게 떠넘긴다 — 라벨은 장식이 아니라 다중화의 전제다.
import Icon from '../atoms/Icon';
import { MAX_VENUE_CONTACTS, type VenueContact } from '../../api/community';
import { CONTACT_LABEL_PRESETS, ensureOneContact } from '../../lib/venueContacts';

export default function ContactListEditor({
  contacts, onChange, idPrefix = 'vc',
}: { contacts: VenueContact[]; onChange: (next: VenueContact[]) => void; idPrefix?: string }) {
  const rows = ensureOneContact(contacts);
  const set = (i: number, patch: Partial<VenueContact>) =>
    onChange(rows.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const add = () => { if (rows.length < MAX_VENUE_CONTACTS) onChange([...rows, { label: '', phone: '' }]); };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {rows.map((c, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <input
              value={c.label}
              onChange={(e) => set(i, { label: e.target.value })}
              maxLength={10}
              list={`${idPrefix}-labels`}
              placeholder={i === 0 ? '대표' : '용도'}
              aria-label={`연락처 ${i + 1} 용도`}
              className="input w-20 shrink-0 text-sm"
            />
            <input
              value={c.phone}
              onChange={(e) => set(i, { phone: e.target.value })}
              maxLength={40}
              inputMode="tel"
              placeholder="예: 010-1234-5678"
              aria-label={`연락처 ${i + 1} 번호`}
              className="input min-w-0 flex-1 text-sm tabular-nums"
            />
            {/* 첫 줄은 지울 수 없다 — '1개 필수'가 곧 이 버튼의 부재로 보여야 한다 */}
            {i > 0 ? (
              <button type="button" onClick={() => remove(i)} aria-label={`연락처 ${i + 1} 삭제`}
                className="hit inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-input border border-border-default text-ink-muted transition-colors hover:border-danger/50 hover:text-danger-light">
                <Icon name="close" size={14} />
              </button>
            ) : (
              <span className="h-9 w-9 shrink-0" aria-hidden />
            )}
          </li>
        ))}
      </ul>
      <datalist id={`${idPrefix}-labels`}>
        {CONTACT_LABEL_PRESETS.map((p) => <option key={p} value={p} />)}
      </datalist>
      {rows.length < MAX_VENUE_CONTACTS ? (
        <button type="button" onClick={add}
          className="inline-flex h-9 items-center gap-1.5 rounded-input border border-dashed border-accent-400/40 bg-accent-300/[0.06] px-3 text-2xs font-bold text-accent-200 transition-colors hover:bg-accent-300/10">
          <Icon name="plus" size={13} /> 연락처 추가
        </button>
      ) : (
        <p className="text-2xs text-ink-muted">연락처는 최대 {MAX_VENUE_CONTACTS}개까지 등록할 수 있습니다.</p>
      )}
    </div>
  );
}
