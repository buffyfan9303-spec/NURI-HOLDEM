// 중복 검사 입력 — 닉네임(profiles.name)·받는 아이디(profiles.nickname) 공용.
// AuthModal 에 있던 useNicknameCheck/NicknameField 를 검사 함수·형식 규칙만 바꿔 끼우게 일반화했다
// (가입 폼 2종 + 프로필 설정이 같은 문법을 쓴다).
import { useState, useEffect, useRef } from 'react';

export type AvailStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/**
 * 입력 + 디바운스(기본 350ms · delayMs 로 조정, 이메일은 600ms) 중복검사 훅.
 * 동기 상태(idle/invalid/checking)는 onChange 시점에 즉시 결정하고,
 * effect 는 'checking' 일 때만 디바운스된 비동기 RPC 를 수행한다.
 * `current`(현재 값)와 같으면 idle — 프로필 설정에서 안 바꾸고 저장하는 경우 RPC 를 부르지 않는다.
 * status === 'available' 일 때만 제출 허용(상위 폼에서 disabled 처리).
 */
// eslint-disable-next-line react-refresh/only-export-components -- 훅+필드 동거(같은 상태 계약)
export function useAvailabilityCheck(
  check: (v: string) => Promise<boolean>,
  validate: (v: string) => boolean,
  current?: string,
  delayMs = 350,
) {
  const [value, setValueRaw] = useState('');
  const [status, setStatus]  = useState<AvailStatus>('idle');
  const reqIdRef = useRef(0);
  const checkRef = useRef(check);
  checkRef.current = check;

  const setValue = (raw: string) => {
    setValueRaw(raw);
    const v = raw.trim();
    if (v.length === 0 || (current !== undefined && v.toLowerCase() === current.trim().toLowerCase())) setStatus('idle');
    else if (!validate(v)) setStatus('invalid');
    else                   setStatus('checking'); // effect 가 RPC 수행
  };

  useEffect(() => {
    if (status !== 'checking') return;
    const v = value.trim();
    const myReq = ++reqIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const ok = await checkRef.current(v);
        if (myReq === reqIdRef.current) setStatus(ok ? 'available' : 'taken');
      } catch {
        if (myReq === reqIdRef.current) setStatus('idle'); // 검사 실패 시 서버 유니크가 최종 방어
      }
    }, delayMs);
    return () => clearTimeout(timer);
  }, [status, value, delayMs]);

  return { value, setValue, status };
}

/** 상태 → 안내 문구(필드 아래 한 줄). ProfileModal 처럼 입력을 직접 그리는 곳도 같이 쓴다. */
// eslint-disable-next-line react-refresh/only-export-components
export function availabilityHint(status: AvailStatus, noun: string, invalidText: string, takenText?: string): { text: string; cls: string } | null {
  switch (status) {
    case 'checking':  return { text: '확인 중…',                    cls: 'text-ink-muted' };
    case 'available': return { text: `사용 가능한 ${noun}입니다`,     cls: 'text-emerald-400' };
    case 'taken':     return { text: takenText ?? `✗ 이미 사용 중인 ${noun}입니다`, cls: 'text-danger' };
    case 'invalid':   return { text: invalidText,                   cls: 'text-amber-400' };
    default:          return null;
  }
}

export default function AvailabilityField({
  value, status, onChange, label, noun = label, subLabel, placeholder, maxLength, invalidText, takenText,
  type = 'text', autoComplete, testId,
}: {
  value: string; status: AvailStatus; onChange: (v: string) => void;
  label: string; noun?: string; subLabel?: string; placeholder?: string; maxLength?: number; invalidText: string; takenText?: string;
  type?: 'text' | 'email'; autoComplete?: string; testId?: string;
}) {
  const h = availabilityHint(status, noun, invalidText, takenText);
  return (
    <div>
      <label className="block text-xs font-medium text-ink-secondary mb-1">
        {label} <span className="text-danger">*</span>
        {subLabel && <span className="ml-1 text-2xs font-normal text-ink-muted">{subLabel}</span>}
      </label>
      <input
        type={type}
        autoComplete={autoComplete}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        required
        className={[
          'input',
          status === 'taken' || status === 'invalid' ? 'border-danger/50' :
          status === 'available' ? 'border-emerald-500/50' : '',
        ].join(' ')}
      />
      {h && <p className={`mt-1 text-2xs ${h.cls}`} aria-live="polite">{h.text}</p>}
    </div>
  );
}
