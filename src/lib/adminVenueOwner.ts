// 관리자 매장 행의 '업주' 표시·선택 목록 — 점검 A-08(2026-10-01)
//
// 🔴 실제로 났던 일: 업주 후보 목록이 관리자를 뺀다(관리자를 업주로 새로 임명하는 것은 막는다).
//   그런데 **이미 관리자가 업주인 매장**(운영 5곳)은 같은 목록에서 업주를 찾다가 못 찾아
//   행에는 '업주: 미지정', 수정 폼의 업주 선택도 '미지정'으로 보였다. 저장 페이로드는 원래 id 를 유지해
//   화면만 거짓이었고, 운영자가 그 '미지정'을 보고 다른 사람을 고르면 실제로 업주가 바뀐다.
//   (회원이 1,000명을 넘겨 목록이 잘리면 일반 업주도 같은 증상.)
// 원칙: 업주 '표시'는 전체 회원에서 찾고, 선택 목록에는 **현재 업주를 항상 포함**한다.
import type { User } from '../api/auth';

const nameOf = (u: Pick<User, 'nickname' | 'name'>) => u.nickname ?? u.name;

/** 행에 그릴 업주 이름. 업주 id 가 없으면 '미지정', 있는데 회원 목록에 없으면 '확인 불가'. */
export function ownerDisplayName(ownerId: string | undefined | null, all: User[]): string {
  if (!ownerId) return '미지정';
  const u = all.find((x) => x.id === ownerId);
  return u ? nameOf(u) : '확인 불가(회원 목록에 없음)';
}

export interface OwnerChoice { id: string; label: string }

/** `<select>` 옵션 — 후보 + (후보에 없는) 현재 업주. 현재 업주는 맨 앞에 둔다. */
export function ownerChoices(candidates: User[], all: User[], currentOwnerId: string | undefined | null): OwnerChoice[] {
  const list: OwnerChoice[] = candidates.map((u) => ({ id: u.id, label: `${nameOf(u)} · ${u.email}` }));
  if (currentOwnerId && !candidates.some((u) => u.id === currentOwnerId)) {
    const cur = all.find((u) => u.id === currentOwnerId);
    list.unshift({
      id: currentOwnerId,
      label: cur
        ? `${nameOf(cur)} · ${cur.email}${cur.role === 'admin' ? ' (관리자 · 현재 업주)' : ' (현재 업주)'}`
        : '현재 업주(회원 목록에 없음)',
    });
  }
  return list;
}
