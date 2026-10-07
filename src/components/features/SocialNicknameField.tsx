// 소셜 첫 동의 게이트의 닉네임 확인 칸 — 카카오·구글 이름을 **묻지 않고** 공개 닉네임으로 굳히지 않는다(오너 2026-10-07).
//
// 이메일 가입자는 가입 폼에서 닉네임을 직접 적고 가입 폼과 같은 검사(2~20자 + 중복, is_nickname_available)를 거친다.
// 소셜 가입자는 그 폼을 지나지 않는다 — 서버(handle_new_user)가 제공자 이름에서 금칙어·사칭어·길이·중복 규칙을 통과한 후보를 골라 둘 뿐이다.
// 카카오 닉네임은 실명인 경우가 많아 그대로 공개되면 곤란하다. 그래서 첫 동의에서 그 값을 보여 주고, 바꾸면 가입 폼과 같은 검사를 거친다.
// 저장은 set_my_nickname(서버가 같은 규칙을 다시 강제)이다. 게이트는 provider 를 보지 않는다 — 구글 첫 동의에도 같은 칸이 뜬다.
//
// 첫 화면 번들에 싣지 않으려고 ConsentGateModal 이 지연 로드한다. 칸이 못 떠도 게이트는 막히지 않는다(값 null = 그대로 둠).
import { useEffect } from 'react';
import AvailabilityField, { useAvailabilityCheck } from '../atoms/AvailabilityField';

/** save — 바꾼 값을 서버에 적는다(set_my_nickname). 저장 API 를 이 지연 청크에 두어 첫 화면 번들에 싣지 않는다. */
export interface NicknameDraft { value: string; ok: boolean; save: () => Promise<void> }

/** api 는 부모(ConsentGateModal — 이미 api/auth 를 쥔 첫 화면 모듈)가 넘긴다. 이 지연 청크가 api/auth·lib/displayName 을 직접 import 하면
 *  rolldown 이 api/auth 를 첫 화면의 별도 공용 청크로 쪼개 첫 화면이 +0.9KB gz 늘었다(2026-10-07 실측 240.93→242.15). */
export interface NicknameApi { check: (v: string) => Promise<boolean>; save: (v: string) => Promise<void>; valid: (v: string) => boolean }

export default function SocialNicknameField({ current, onChange, api }: { current: string; onChange: (d: NicknameDraft) => void; api: NicknameApi }) {
  const nick = useAvailabilityCheck(api.check, api.valid, current);
  // 첫 값은 서버가 규칙으로 골라 둔 지금 닉네임 — current 와 같으면 'idle'(검사 RPC 없음)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { nick.setValue(current); }, []);
  const v = nick.value.trim();
  const ok = nick.status === 'available'
    || (nick.status === 'idle' && v.length > 0 && v.toLowerCase() === current.trim().toLowerCase());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onChange({ value: v, ok, save: () => api.save(v) }); }, [v, ok]);
  return (
    <div data-testid="social-nickname">
      <AvailabilityField label="닉네임" value={nick.value} status={nick.status} onChange={nick.setValue}
        placeholder="2~20자 (커뮤니티·순위·이용권에 표시)" maxLength={20} invalidText="2~20자로 입력해 주세요" />
      <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
        로그인한 서비스의 이름으로 정해 두었습니다. 실명이라면 지금 바꿔 주세요 — 다른 회원에게 보이는 이름입니다.
      </p>
    </div>
  );
}
