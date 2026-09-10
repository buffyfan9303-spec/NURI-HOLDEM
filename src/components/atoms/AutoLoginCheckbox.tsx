// src/components/atoms/AutoLoginCheckbox.tsx
//
// 자동 로그인(로그인 상태 유지) 체크박스 — 국내 서비스 관행(네이버·쿠팡·배달의민족)을 따른다.
//
// 기본값을 **켜짐**으로 둔 근거(오너 #8 판단):
//  ① 이 서비스 사용자는 모바일 개인기기 99%(CLAUDE.md 플랫폼 분리) — 매장 앞에서 매번
//     이메일·비밀번호를 다시 치게 만드는 건 그 자체가 이탈 지점이다.
//  ② 국내 모바일 웹/앱의 사실상 표준이 '로그인 상태 유지 기본 켜짐'이다.
//  ③ 이미 라이브인 서비스다. Supabase 기본값이 persistSession:true(localStorage)라
//     기본을 꺼짐으로 바꾸면 **배포 즉시 기존 로그인 사용자 전원이 로그아웃**된다.
// 대신 위험 고지를 감추지 않는다 — 공용 PC 경고를 상시(체크 여부와 무관하게) 노출한다.
import { useId } from 'react';
import Icon from './Icon';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** 로그인 진행 중 등 조작을 막아야 할 때 */
  disabled?: boolean;
  /**
   * 한 줄 배치(2026-09-11) — 로그인 화면에서 '비밀번호를 잊으셨나요?' 와 같은 행에 설 때.
   * 카드 테두리와 두 줄 설명을 접고 체크박스 + 라벨만 남긴다. **위험 고지는 지우지 않고**
   * title 로 옮겨, 마우스·스크린리더에서 그대로 읽히게 한다(공용 PC 경고는 법적 고지가 아니라
   * 계정 안전 안내지만, 이 서비스에서 유일한 경고라 없애지 않는다).
   */
  compact?: boolean;
}

const WARN = '이 브라우저에서 다음부터 자동으로 로그인됩니다. 공용 PC에서는 꼭 해제하세요.';

export default function AutoLoginCheckbox({ checked, onChange, disabled, compact }: Props) {
  const id = useId();
  const box = (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      data-testid="auto-login"
      onChange={(e) => onChange(e.target.checked)}
      className="accent-accent-300 shrink-0 disabled:opacity-50"
    />
  );

  if (compact) {
    return (
      <div className="flex min-h-[44px] min-w-0 items-center gap-2" title={WARN}>
        {box}
        <label htmlFor={id} className="min-w-0 cursor-pointer select-none truncate text-xs font-semibold text-ink-primary">
          자동 로그인
        </label>
        {/* 자물쇠 아이콘은 한 줄 모드에서 라벨 옆에 홀로 떠 보였다 — 경고는 title·sr-only 로만 남긴다 */}
        <span className="sr-only">{WARN}</span>
      </div>
    );
  }

  return (
    <div className="rounded-input border border-border-subtle bg-surface-high px-2.5 py-2">
      <div className="flex items-center gap-2">
        {box}
        <label
          htmlFor={id}
          className="flex-1 cursor-pointer select-none text-xs font-semibold text-ink-primary"
        >
          자동 로그인
        </label>
      </div>
      <p className="mt-1 pl-[22px] text-2xs leading-relaxed text-ink-muted">
        <Icon name="lock" size={11} className="mr-1 inline-block align-[-1px] shrink-0" />
        이 브라우저에서 다음부터 자동으로 로그인됩니다.
        <b className="text-ink-secondary"> 공용 PC에서는 꼭 해제하세요.</b>
      </p>
    </div>
  );
}
