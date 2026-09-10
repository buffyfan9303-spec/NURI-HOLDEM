// src/components/features/AuthModal.tsx
import { useState, useRef, useId } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import StatefulActionButton from '../atoms/StatefulActionButton';
import AutoLoginCheckbox from '../atoms/AutoLoginCheckbox';
import { isKeepSignedIn, setKeepSignedIn } from '../../lib/supabase';
import { signInWithGoogle,
  signUpUser, signUpOwner, checkNicknameAvailable, checkNameAvailable, checkEmailAvailable, EMAIL_RE,
  requestPasswordReset, verifyPasswordResetOtp, setNewPassword,
} from '../../api/auth';
import { validatePassword, PASSWORD_RULE_HINT, PASSWORD_PLACEHOLDER } from '../../lib/password';
import AvailabilityField, { useAvailabilityCheck } from '../atoms/AvailabilityField';
import { isValidDisplayName } from '../../lib/displayName';
import TermsOfService   from '../../pages/legal/TermsOfService';
import PrivacyPolicy    from '../../pages/legal/PrivacyPolicy';
import LegalNotice      from '../../pages/legal/LegalNotice';
import MarketingConsent from '../../pages/legal/MarketingConsent';

type Mode     = 'login' | 'signup-user' | 'signup-owner' | 'forgot';
type LegalDoc = 'terms' | 'privacy' | 'anti-gambling' | 'marketing';

const LEGAL_TITLES: Record<LegalDoc, string> = {
  'terms':          '서비스 이용약관',
  'privacy':        '개인정보처리방침',
  'anti-gambling':  '사행성 배제 및 건전 이용 공지',
  'marketing':      '마케팅 정보 수신 동의 [선택]',
};

const MODE_LABEL: Record<Mode, string> = {
  'login':        '로그인',
  'signup-user':  '일반 회원가입',
  'signup-owner': '매장 업주 회원가입',
  'forgot':       '비밀번호 찾기',
};

// ── 동의 상태 훅 ──────────────────────────────────────────────────────────────

type ConsentKey = 'age19' | 'terms' | 'privacy' | 'antiGambling' | 'marketing' | 'publicRanking';
type ConsentState = Record<ConsentKey, boolean>;

const CONSENT_INIT: ConsentState = {
  age19: false, terms: false, privacy: false, antiGambling: false, marketing: false, publicRanking: false,
};

function useConsent() {
  const [c, setC] = useState<ConsentState>(CONSENT_INIT);

  // publicRanking(랭킹 공개)은 절대 allRequired 에 들어가면 안 된다 — 선택 동의를 필수로
  // 묶으면 동의하지 않은 사람의 가입을 막게 된다(개인정보보호법 §22⑤ 동의 강제 금지).
  const allRequired = c.age19 && c.terms && c.privacy && c.antiGambling;
  const allChecked  = allRequired && c.marketing && c.publicRanking;

  const set = (k: ConsentKey, v: boolean) =>
    setC((prev) => ({ ...prev, [k]: v }));

  const toggleAll = (v: boolean) =>
    setC({ age19: v, terms: v, privacy: v, antiGambling: v, marketing: v, publicRanking: v });

  return { c, allRequired, allChecked, set, toggleAll };
}

// ── 약관 시트 (Modal 원자 위에) ───────────────────────────────────────────────
// 예전엔 자체 dialog 셸(딤 버튼+헤더+닫기)이었다 — role=dialog aria-modal 만 선언하고 포커스를 안으로 옮기지 않아
// Tab 이 뒤쪽 가입 폼으로 샜고, 닫아도 '보기' 버튼으로 돌아오지 않았다(MODAL-03). Modal 원자로 감싸면 첫 포커스·
// 트랩·복원·뒤로가기가 그대로 따라온다(자체 useBackClose 는 Modal 이 안에서 하므로 지웠다).

function LegalSheet({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  // 닫힘 애니메이션(200ms) 동안 doc 은 이미 null 이라 제목·본문이 먼저 비어 버린다 — 마지막 문서를 붙들어 둔다
  // (prop 이 바뀔 때 상태를 맞추는 React 공식 패턴: 렌더 중 조건부 setState).
  const [shown, setShown] = useState<LegalDoc | null>(doc);
  if (doc && doc !== shown) setShown(doc);
  const title = shown ? LEGAL_TITLES[shown] : undefined;
  // ponytail: Modal 원자가 제목 id 를 'modal-title' 로 고정해, 이 시트처럼 **모달 안의 모달**로 뜨면 aria-labelledby 가
  //   문서상 첫 h2(부모 '일반 회원가입')로 풀려 스크린리더가 엉뚱한 이름을 읽는다. 원자가 useId 로 바뀌면 이 콜백은 지운다.
  //   콜백 ref 인 이유: Modal 은 open 뒤 한 렌더 늦게 dialog 를 그리므로 effect 는 그 시점을 못 본다.
  const nameDialog = (el: HTMLDivElement | null) => {
    const dlg = el?.closest<HTMLElement>('[role="dialog"]');
    if (!dlg || !title) return;
    dlg.removeAttribute('aria-labelledby');
    dlg.setAttribute('aria-label', title);
  };
  return (
    <Modal open={!!doc} onClose={onClose} title={title} maxWidth="lg" variant="sheet">
      <div ref={nameDialog}>
        {shown === 'terms'         && <TermsOfService />}
        {shown === 'privacy'       && <PrivacyPolicy />}
        {shown === 'anti-gambling' && <LegalNotice />}
        {shown === 'marketing'     && <MarketingConsent />}
      </div>
      {/* 하단 닫기 버튼 — Modal 본문이 스크롤러라 sticky 로 바닥에 붙인다 */}
      <div className="sticky bottom-0 border-t border-border-subtle bg-surface-mid px-4 py-3">
        <button type="button" onClick={onClose} className="btn-primary w-full">
          확인했습니다
        </button>
      </div>
    </Modal>
  );
}

// ── 동의 체크박스 섹션 ────────────────────────────────────────────────────────

interface ConsentSectionProps {
  c: ConsentState;
  allRequired: boolean;
  allChecked: boolean;
  set: (k: ConsentKey, v: boolean) => void;
  toggleAll: (v: boolean) => void;
  onView: (doc: LegalDoc) => void;
}

// ⚠ 모듈 스코프에 둔다 — 예전엔 ConsentSection **안에서** 정의해 렌더마다 새 컴포넌트 타입이 됐고, 부모가 리렌더될 때마다
//   (약관 시트 열기·체크 하나 토글) 행 전체가 언마운트·재마운트됐다. 그래서 '보기' 로 연 시트를 닫아도 돌아갈 노드가
//   이미 없어 포커스 복원이 죽었고(2026-09-10 e2e 실측), 체크박스를 조작하는 중에도 포커스가 튀었다.
function CheckRow({
  checked, onChange, required, label, doc, onView,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  label: string;
  doc?: LegalDoc;
  onView: (doc: LegalDoc) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-accent-300 shrink-0"
      />
      <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
        <label
          onClick={() => onChange(!checked)}
          className="text-xs text-ink-secondary cursor-pointer leading-relaxed select-none"
        >
          {required && (
            <span className="text-danger mr-1 font-bold">[필수]</span>
          )}
          {!required && (
            <span className="text-ink-muted mr-1">[선택]</span>
          )}
          {label}
        </label>
        {doc && (
          <button
            type="button"
            onClick={() => onView(doc)}
            className="shrink-0 text-2xs text-accent-300 hover:text-accent-200 underline decoration-dotted underline-offset-2 transition-colors"
          >
            보기
          </button>
        )}
      </div>
    </div>
  );
}

function ConsentSection({ c, allChecked, set, toggleAll, onView }: ConsentSectionProps) {
  return (
    <div className="space-y-2 pt-1 border-t border-border-subtle">
      {/* 전체 동의 */}
      <div className={[
        'flex items-center gap-2 p-2.5 rounded-input border transition-colors cursor-pointer',
        allChecked
          ? 'bg-accent-300/10 border-accent-400/40'
          : 'bg-surface-high border-border-default',
      ].join(' ')}
        onClick={() => toggleAll(!allChecked)}
      >
        <input
          type="checkbox"
          checked={allChecked}
          onChange={(e) => toggleAll(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="accent-accent-300 shrink-0"
        />
        <span className={[
          'text-xs font-semibold select-none',
          allChecked ? 'text-accent-300' : 'text-ink-primary',
        ].join(' ')}>
          전체 동의 (필수 + 선택 포함)
        </span>
      </div>

      {/* 구분선 */}
      <div className="pl-1 space-y-2">
        <CheckRow onView={onView}
          checked={c.age19} onChange={(v) => set('age19', v)}
          required label="본인은 만 19세 이상 성인입니다. (청소년보호법)"
        />
        <CheckRow onView={onView}
          checked={c.terms} onChange={(v) => set('terms', v)}
          required label="서비스 이용약관에 동의합니다." doc="terms"
        />
        <CheckRow onView={onView}
          checked={c.privacy} onChange={(v) => set('privacy', v)}
          required label="개인정보 수집·이용에 동의합니다. (개인정보보호법 §15)" doc="privacy"
        />
        <CheckRow onView={onView}
          checked={c.antiGambling} onChange={(v) => set('antiGambling', v)}
          required label="불법 환전·사행성 행위 금지 서약에 동의합니다. (게임산업법)" doc="anti-gambling"
        />
        <CheckRow onView={onView}
          checked={c.marketing} onChange={(v) => set('marketing', v)}
          label="마케팅 정보 수신에 동의합니다. (이벤트·할인·푸시알림)" doc="marketing"
        />
        {/* 오너 #12 — 순위표에 '자주 가는 매장'을 붙이려면 이동·방문 패턴 공개 동의가 필요하다.
            동의하지 않아도 순위·닉네임은 그대로 집계·표시된다(랭킹에서 빼면 순위가 왜곡된다). */}
        <CheckRow onView={onView}
          checked={c.publicRanking} onChange={(v) => set('publicRanking', v)}
          label="랭킹 프로필 공개에 동의합니다. (순위표에 닉네임·자주 가는 매장 표시 · 미동의 시 매장은 표시하지 않습니다)"
          doc="privacy"
        />
      </div>
    </div>
  );
}

// ── 메인 모달 ─────────────────────────────────────────────────────────────────

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}

// ── Aura 스페이드 오브젝트 ────────────────────────────────────────────────────
// 레퍼런스(어두운 몰입형 로그인)의 원형 행성 자리에 놓는 브랜드 오브젝트.
// 행성을 복제하지 않고 NURI 정본 심벌(골드 스페이드)을 어두운 유리 구 안에 앉힌다.
//
// 왜 이미지 파일이나 Canvas 를 새로 만들지 않는가: 심벌 SVG 가 이미 골드 그라데이션까지 든 정본이고,
//   구의 입체감은 전부 radial-gradient 3겹 + box-shadow 로 표현된다. 장식 때문에 에셋을 늘리면
//   첫 화면 임계 경로 예산(여유 0%)을 더 깎는다.
//
// 입체감의 조리법(2026-09-11 재작업) — 평평한 원이 되지 않으려면 네 가지가 동시에 있어야 한다.
//   ① 광원 하나를 정한다(좌상단 32%/26%) — 하이라이트가 중앙에 있으면 구가 아니라 원반이 된다.
//   ② 아래쪽 오클루전 — inset 그림자로 바닥을 눌러야 부피가 생긴다.
//   ③ 상단 스펙큘러 1px — 유리의 젖은 가장자리. 이게 없으면 '칠한 원' 으로 읽힌다.
//   ④ 접지 그림자 + 바깥 블룸 — 구가 지면 위에 떠 있어야 한다.
// 원 안쪽은 테마와 무관하게 어둡게 고정한다 — 골드는 어두운 지면에서만 제 색이 나고,
// 이 오브젝트는 브랜드 마크라 라이트 테마에서도 같은 모습이어야 한다.
function AuraSpade({ size }: { size: number }) {
  return (
    <div
      data-testid="auth-spade"
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{
        width: size, height: size,
        background: [
          // ① 좌상단 광원
          'radial-gradient(circle at 32% 26%, rgb(196 181 253 / 0.42) 0%, rgb(109 92 190 / 0.24) 24%, transparent 56%)',
          // 아래에서 올라오는 시안 반사광 — 보라 일변도를 깨고 Aura 3색을 완성한다
          'radial-gradient(circle at 50% 116%, rgb(34 211 238 / 0.34) 0%, transparent 52%)',
          // 구 본체
          'radial-gradient(120% 120% at 50% 4%, #2B2450 0%, #16192F 52%, #06080F 100%)',
        ].join(', '),
        boxShadow: [
          'inset 0 1.5px 0 rgb(255 255 255 / 0.30)',      // ③ 상단 스펙큘러
          `inset 0 ${-size * 0.13}px ${size * 0.2}px rgb(0 0 0 / 0.55)`, // ② 하단 오클루전
          `inset 0 0 ${size * 0.26}px rgb(232 201 124 / 0.13)`,          // 골드 내부광
          '0 0 0 1px rgb(255 255 255 / 0.10)',                            // 하이라이트 링
          `0 ${size * 0.09}px ${size * 0.3}px rgb(0 0 0 / 0.55)`,          // ④ 접지 그림자
          `0 0 ${size * 0.40}px rgb(139 92 246 / 0.44)`,                   // violet
          `0 0 ${size * 0.80}px rgb(99 102 241 / 0.26)`,                   // indigo
          `0 0 ${size * 1.25}px rgb(34 211 238 / 0.15)`,                   // cyan
        ].join(', '),
      }}
    >
      <img
        src="/brand/nuri-holdem-symbol.svg" alt=""
        width={Math.round(size * 0.46)} height={Math.round(size * 0.46)}
        style={{
          width: Math.round(size * 0.46), height: Math.round(size * 0.46),
          filter: `drop-shadow(0 0 ${Math.round(size * 0.1)}px rgb(232 201 124 / 0.45))`,
        }}
        draggable={false}
      />
    </div>
  );
}

/** 모드별 제목·설명 — 레퍼런스처럼 '한 화면에 한 가지 목적'만 말한다. */
const MODE_INTRO: Record<Mode, { title: string; desc: string }> = {
  'login':        { title: '다시 만나 반가워요',   desc: '누리홀덤의 일정과 커뮤니티를 계속 이용하세요.' },
  'signup-user':  { title: '누리홀덤 시작하기',     desc: '일정·커뮤니티·GTO를 한 계정으로 이용하세요.' },
  'signup-owner': { title: '매장 운영 시작하기',    desc: '포스터·예약·장부·이용권을 한곳에서 관리하세요.' },
  'forgot':       { title: '비밀번호를 잊으셨나요?', desc: '가입한 이메일로 인증번호를 보내드릴게요.' },
};

/** 오브젝트 + 제목 + 설명. 가입은 폼이 길어 오브젝트와 여백을 줄인다. */
function ModeIntro({ mode }: { mode: Mode }) {
  const compact = mode === 'signup-user' || mode === 'signup-owner';
  const { title, desc } = MODE_INTRO[mode];
  return (
    <div className={['flex flex-col items-center', compact ? 'gap-3 pb-4 pt-1' : 'gap-5 pb-7 pt-3'].join(' ')}>
      <AuraSpade size={compact ? 56 : 104} />
      <div className="text-center">
        <h3 className={[
          compact ? 'text-lg' : 'text-2xl',
          'font-extrabold leading-tight tracking-[-0.02em] text-ink-primary break-keep',
        ].join(' ')}>
          {title}
        </h3>
        <p className="mx-auto mt-1.5 max-w-[19rem] text-xs leading-relaxed text-ink-muted break-keep">{desc}</p>
      </div>
    </div>
  );
}

/** 화면 하단 모드 전환 한 줄 — 레퍼런스의 "Don't have an account? Sign up" 자리. */
function ModeSwitch({ question, action, onClick }: { question: string; action: string; onClick: () => void }) {
  return (
    <p className="pt-2 text-center text-xs text-ink-muted">
      {question}{' '}
      <button type="button" onClick={onClick}
        className="ml-0.5 inline-flex min-h-[44px] items-center font-bold text-accent-200 transition-colors hover:text-accent-100">
        {action}
      </button>
    </p>
  );
}

/** 가입 유형 세그먼트 — 예전 상단 3분할 탭을 대신한다(로그인 화면에는 나오지 않는다). */
function SignupSegment({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const items: { m: Mode; label: string }[] = [
    { m: 'signup-user',  label: '일반 회원' },
    { m: 'signup-owner', label: '매장 업주' },
  ];
  return (
    <div className="mb-4 grid grid-cols-2 gap-1 rounded-input border border-white/[0.06] bg-surface-base/70 p-1"
      role="group" aria-label="가입 유형">
      {items.map(({ m, label }) => {
        const on = mode === m;
        return (
          <button key={m} type="button" aria-pressed={on} onClick={() => onChange(m)}
            className={['min-h-[40px] rounded-[10px] text-xs font-bold transition-colors',
              on ? 'btn-primary !min-h-[40px] !px-0 !shadow-none' : 'text-ink-muted hover:text-ink-primary'].join(' ')}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** 인증 폼 입력의 공통 보정 — 시트보다 **어둡게** 눌러 넣는다.
 *  기본 .input 은 bg-surface-high(#1B243C)라 시트(#151C30)보다 밝아 블록이 튀어나와 보였다.
 *  레퍼런스처럼 입력이 뒤로 물러나야 제목과 CTA 가 앞으로 온다. */
// ⚠ focus:!ring-0 — .input 기본은 border 변경 + ring-1 을 함께 준다. 라운드가 커진 이 필드에서는
//   두 선이 어긋나 이중 테두리로 보였다. 링을 끄고 바깥 글로우 한 겹으로 대신한다(대비는 유지).
const FIELD_CLS = [
  'min-h-[50px] rounded-[14px] border-white/[0.07] bg-surface-base/60 text-[15px]',
  'focus:border-accent-300 focus:!ring-0 focus:shadow-[0_0_0_3px_rgb(88_80_236_/_0.20)]',
].join(' ');

export default function AuthModal({ open, onClose, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  // 끌어내려 닫기 — **로그인·비밀번호 찾기에서만** 켠다(오너 제보 2026-08-30: 로그인창이 안 내려간다).
  //   왜 가입 탭은 빼는가: 이 모달은 닫히면 언마운트돼(App 의 조건부 렌더 + key={authMode})
  //   **입력이 통째로 사라진다.** 로그인은 2칸이고 대부분 자동완성이라 다시 열면 그만이지만,
  //   가입은 닉네임·매장명·주소·동의까지 채운 뒤라 한 번의 실수 스와이프가 그걸 다 날린다.
  //   (Modal 은 input/textarea/select/[contenteditable] 위에서 시작한 손짓을 이미 걸러내지만,
  //    그 사이 여백에서 시작하면 닫힌다 — 긴 폼일수록 그 여백이 넓다.)
  const canDragClose = mode === 'login' || mode === 'forgot';

  // ⚠ 상단 3분할 탭(로그인/일반 가입/업주 가입)은 2026-09-11 오너 지시로 제거했다.
  //   한 화면에 세 목적이 동시에 서 있으면 무엇을 하러 온 화면인지 흐려진다 — 모드 전환은
  //   각 화면 하단의 한 줄로 내리고, 가입 유형만 가입 화면 안에서 세그먼트로 고른다.
  //   mode 상태와 인증 로직은 그대로다(새 라우터·전역 상태 0).
  //
  // ⚠ Modal 에 title 을 넘기지 않는다(2026-09-11 2차). 헤더 바(제목 + 구분선 + X)가 시트 상단을
  //   가로로 잘라 '몰입형 인증 화면' 이 아니라 '설정 창' 으로 읽혔다. 대신
  //     · 접근성 이름은 아래 nameDialog 가 dialog 의 aria-label 로 직접 심는다(LegalSheet 와 같은 조리법)
  //     · 닫기 버튼은 이 안에서 원형 고스트로 그린다(이름 '닫기' 유지 — dismissOverlays·기존 계약 그대로)
  //   Modal.tsx 는 손대지 않는다(공지 스크롤 수정이 진행 중인 파일).
  const nameDialog = (el: HTMLDivElement | null) => {
    const dlg = el?.closest<HTMLElement>('[role="dialog"]');
    if (dlg) dlg.setAttribute('aria-label', MODE_LABEL[mode]);
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="md" variant="sheet" dragToClose={canDragClose}>
      {/* key={mode} — 모드가 바뀌면 다시 마운트돼 nameDialog 가 새 이름을 심는다(콜백 ref 는 마운트 때만 돈다) */}
      <div key={mode} ref={nameDialog} className="relative">
        {/* 앰비언트 — 오브의 빛이 시트 상단을 물들인다. 정적 2겹, 본문 뒤로만 깔린다. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[19rem]"
          style={{
            background: [
              'radial-gradient(52% 62% at 50% 8%, rgb(139 92 246 / 0.20) 0%, transparent 70%)',
              'radial-gradient(38% 44% at 72% 30%, rgb(34 211 238 / 0.10) 0%, transparent 72%)',
            ].join(', '),
          }}
        />
        <button type="button" onClick={onClose} aria-label="닫기"
          className="absolute right-2 top-0 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-ink-muted backdrop-blur-sm transition-colors hover:bg-white/[0.09] hover:text-ink-primary">
          <Icon name="close" size={17} />
        </button>

        <div className="relative px-5 pb-8 pt-4">
          <ModeIntro mode={mode} />
          {mode === 'login'        && <LoginForm onClose={onClose} onForgot={() => setMode('forgot')} onSignup={() => setMode('signup-user')} />}
          {mode === 'signup-user'  && <SignupUserForm  mode={mode} onMode={setMode} onDone={() => setMode('login')} />}
          {mode === 'signup-owner' && <SignupOwnerForm mode={mode} onMode={setMode} onDone={() => setMode('login')} />}
          {mode === 'forgot'       && <ForgotPasswordForm onBack={() => setMode('login')} />}
        </div>
      </div>
    </Modal>
  );
}

// ── 로그인 폼 ─────────────────────────────────────────────────────────────────

function SocialLoginButtons({ onError, keepSignedIn }: { onError: (msg: string) => void; keepSignedIn: boolean }) {
  // 진행 중이면 비활성(중복 리다이렉트 방지). 소셜은 Google 하나 — 카카오 로그인은 2026-09-10 오너 지시로 삭제.
  //   레퍼런스에 Apple 이 있지만 추가하지 않는다: 이 서비스의 소셜 정책은 Google 단일이다.
  const [busy, setBusy] = useState<'google' | null>(null);
  return (
    <div className="space-y-2">
      {/* 구분선이 CTA 와 소셜 사이에 온다 — 이메일 로그인이 1급, 소셜은 대안이라는 위계 */}
      <div className="flex items-center gap-3 pt-1" aria-hidden>
        <span className="h-px flex-1 bg-white/[0.07]" />
        <span className="text-2xs tracking-wide text-ink-muted">또는</span>
        <span className="h-px flex-1 bg-white/[0.07]" />
      </div>
      <button type="button" disabled={busy !== null}
        onClick={() => { setBusy('google'); signInWithGoogle(keepSignedIn).catch((e) => { onError(e instanceof Error ? e.message : '구글 로그인 실패'); setBusy(null); }); }}
        className="flex h-[46px] w-full items-center justify-center gap-2.5 rounded-[14px] border border-white/20 bg-white text-sm font-bold text-[#1f1f1f] transition active:scale-[0.99] disabled:opacity-60">
        {/* 구글 공식 4색 G 로고(브랜드 가이드 규격) */}
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        {busy === 'google' ? 'Google로 이동 중…' : 'Google로 계속하기'}
      </button>

      <p className="px-2 text-center text-2xs leading-relaxed text-ink-muted/80">
        가입 시 <b className="text-ink-muted">이용약관·개인정보처리방침</b>에 동의하게 됩니다
      </p>
    </div>
  );
}

// ── 비밀번호 입력 + 보기/숨기기 ───────────────────────────────────────────────
// 왜 필요한가: 모바일 키보드로 8자 이상 대소문자·숫자·기호를 치는데 화면이 전부 점이면
//   오타를 찾을 길이 없다. 토글해도 값·포커스·autocomplete 는 그대로 유지된다(type 만 바뀐다).
function PasswordField({
  label, value, onChange, autoComplete, placeholder, required, minLength, testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  testId?: string;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-2xs font-semibold tracking-wide text-ink-muted">
        {label}{required && <span className="ml-0.5 text-accent-200/70">*</span>}
      </label>
      <div className="relative">
        <input
          id={id} type={shown ? 'text' : 'password'} value={value} required={required}
          autoComplete={autoComplete} placeholder={placeholder} minLength={minLength}
          data-testid={testId}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${FIELD_CLS} pr-12`}
        />
        {/* 44×44 터치 영역 — 46px 입력 안에서 오른쪽 끝을 차지한다(값 위로 겹치지 않게 pr-12) */}
        <button
          type="button" tabIndex={-1}
          data-testid={testId ? `${testId}-reveal` : undefined}
          aria-label={shown ? '비밀번호 숨기기' : '비밀번호 보기'}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
          className="absolute right-0 top-1/2 flex h-[44px] w-[44px] -translate-y-1/2 items-center justify-center rounded-input text-ink-muted transition-colors hover:text-ink-primary"
        >
          <Icon name={shown ? 'eye-off' : 'eye'} size={16} />
        </button>
      </div>
    </div>
  );
}

function LoginForm({ onClose, onForgot, onSignup }: { onClose: () => void; onForgot: () => void; onSignup: () => void }) {
  const { login } = useAuth();
  const toast = useToast();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  // 지난번 선택을 초기값으로 되살린다(국내 관행). 미선택 이력이면 켜짐 — AutoLoginCheckbox 주석의 근거 참고.
  const [keepSignedIn, setKeep] = useState(() => isKeepSignedIn());

  // 소셜 로그인은 리다이렉트로 페이지를 떠나므로 '제출 시점에 저장'이 통하지 않는다.
  // 체크를 만질 때 즉시 플래그에 반영해 두면 이메일·소셜 어느 경로로 나가도 같은 값이 적용된다.
  const changeKeep = (v: boolean) => { setKeep(v); setKeepSignedIn(v); };

  const btnRef = useRef<HTMLButtonElement>(null);
  // 엔터 제출은 상태 버튼 클릭으로 위임 — Idle→Loading→Success 모핑이 항상 한 곳에서 일어난다
  const submit = (e: React.FormEvent) => { e.preventDefault(); btnRef.current?.click(); };
  const doLogin = async () => {
    setError('');
    try {
      await login(email.trim(), password, keepSignedIn);
      toast.show('로그인되었습니다', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      // 제재(탈퇴·정지) 계정은 사유를 그대로 보여준다 — 자격증명 오류로 뭉개면 회원은 비밀번호만
      // 반복해서 다시 치게 되고, 왜 못 들어가는지 끝내 알 수 없다(AuthContext.sanctionMessage).
      const sanctioned = err instanceof Error && err.name === 'SanctionError';
      setError(
        sanctioned
          ? msg
          : /confirm|verified|not confirmed/i.test(msg)
            ? '이메일 인증이 필요합니다. 받은 편지함의 인증 메일을 확인해 주세요.'
            : '이메일 또는 비밀번호를 확인해 주세요.',
      );
      throw err; // 버튼을 idle로 복귀시켜 재시도 가능하게
    }
  };

  return (
    // 순서(2026-09-11): 이메일 → 비밀번호 → 유지·찾기 → 1급 CTA → 또는 → Google.
    //   예전엔 Google 이 맨 위였는데, 그러면 화면의 첫 동작이 '외부로 나가기' 가 된다.
    <form onSubmit={submit} className="space-y-3.5">
      <Field label="이메일" type="email" required autoComplete="email" className={FIELD_CLS}
        value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <PasswordField label="비밀번호" required autoComplete="current-password" testId="login-password"
        value={password} onChange={setPassword} placeholder="••••••••" />

      {/* 유지 · 찾기 한 행 — 레퍼런스의 "Remember me / Forgot Password?" 자리 */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <AutoLoginCheckbox checked={keepSignedIn} onChange={changeKeep} compact />
        <button type="button" onClick={onForgot}
          className="min-h-[44px] shrink-0 text-xs text-ink-muted transition-colors hover:text-accent-200">
          비밀번호를 잊으셨나요?
        </button>
      </div>

      {error && <p className="text-xs text-danger animate-fade-in" role="alert">{error}</p>}

      {/* 화면에서 가장 밝은 것 — btn-primary 의 보라 그라데이션 위에 블룸을 한 겹 더 얹는다 */}
      <StatefulActionButton ref={btnRef} label="로그인" successLabel="환영합니다!"
        disabled={!email.trim() || !password} onAction={doLogin} onDone={onClose}
        className="w-full !min-h-[52px] !rounded-[14px] shadow-[0_10px_30px_-8px_rgb(88_80_236_/_0.65)] disabled:!shadow-none" />

      <SocialLoginButtons onError={(m) => setError(m)} keepSignedIn={keepSignedIn} />
      <ModeSwitch question="계정이 없으신가요?" action="회원가입" onClick={onSignup} />
      {/* 폼 엔터 제출용(화면 비표시) */}
      <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
    </form>
  );
}

// ── 비밀번호 찾기 (비로그인, 이메일 OTP) ──────────────────────────────────────
function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const [step,      setStep]      = useState<'email' | 'reset'>('email');
  const [email,     setEmail]     = useState('');
  const [code,      setCode]      = useState('');
  const [newPw,     setNewPw]     = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading,   setLoading]   = useState(false);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.show('이메일을 입력해 주세요', 'error');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setStep('reset');
      toast.show('인증번호를 이메일로 보냈습니다. 받은 편지함을 확인해 주세요.', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '발송에 실패했습니다', 'error');
    } finally { setLoading(false); }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 6) return toast.show('인증번호를 입력해 주세요', 'error');
    if (!validatePassword(newPw).ok) return toast.show(`비밀번호 규칙: ${PASSWORD_RULE_HINT}`, 'error');
    if (newPw !== confirmPw)    return toast.show('새 비밀번호가 일치하지 않습니다', 'error');
    setLoading(true);
    try {
      await verifyPasswordResetOtp(email, code);
      await setNewPassword(newPw);
      toast.show('비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해 주세요.', 'success');
      onBack();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '재설정 실패. 인증번호를 확인해 주세요', 'error');
    } finally { setLoading(false); }
  };

  if (step === 'email') {
    return (
      <form onSubmit={sendCode} className="space-y-3">
        <Field label="이메일" type="email" required autoComplete="email" className={FIELD_CLS}
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <button type="submit" disabled={loading} className="btn-primary !min-h-[52px] !rounded-[14px] w-full shadow-[0_10px_30px_-8px_rgb(88_80_236_/_0.65)] disabled:!shadow-none disabled:opacity-60">
          {loading ? '발송 중…' : '인증번호 받기'}
        </button>
        <button type="button" onClick={onBack} className="min-h-[44px] w-full text-xs text-ink-muted transition-colors hover:text-accent-200">
          로그인으로 돌아가기
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={reset} className="space-y-3">
      <p className="text-xs text-ink-secondary leading-relaxed">
        <b className="text-ink-primary">{email}</b> 로 보낸 인증번호와 새 비밀번호를 입력해 주세요.
      </p>
      <div>
        <label className="block text-xs font-medium text-ink-secondary mb-1.5">인증번호</label>
        <input
          type="text" inputMode="numeric" value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
          placeholder="이메일로 받은 인증번호" maxLength={8}
          className="input text-center font-bold tracking-[0.3em]" autoFocus
        />
      </div>
      <div>
        <PasswordField label="새 비밀번호" required autoComplete="new-password" minLength={8}
          value={newPw} onChange={setNewPw} placeholder={PASSWORD_PLACEHOLDER} />
        <PasswordHint value={newPw} />
      </div>
      <PasswordField label="새 비밀번호 확인" required autoComplete="new-password"
        value={confirmPw} onChange={setConfirmPw} placeholder="새 비밀번호 재입력" />
      <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
        {loading ? '재설정 중…' : '비밀번호 재설정'}
      </button>
      <div className="flex justify-between text-2xs">
        <button type="button" onClick={() => setStep('email')} className="text-ink-muted hover:text-accent-300 transition-colors">코드 재전송</button>
        <button type="button" onClick={onBack} className="text-ink-muted hover:text-accent-300 transition-colors">로그인으로</button>
      </div>
    </form>
  );
}

// ── 일반 회원가입 ─────────────────────────────────────────────────────────────

function SignupUserForm({ mode, onMode, onDone }: { mode: Mode; onMode: (m: Mode) => void; onDone: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const nameChk = useNameCheck();
  const nick = useNicknameCheck();
  const mail = useEmailCheck();
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const { c, allRequired, allChecked, set, toggleAll } = useConsent();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 모든 항목 필수 — 하나라도 비면 가입 불가
    if (nameChk.status !== 'available') return toast.show('사용 가능한 닉네임을 입력해 주세요.', 'error');
    if (nick.status !== 'available') return toast.show('사용 가능한 받는 아이디를 입력해 주세요.', 'error');
    if (mail.status !== 'available') return toast.show('사용 가능한 이메일을 입력해 주세요.', 'error');
    if (!validatePassword(password).ok) return toast.show(`비밀번호 규칙: ${PASSWORD_RULE_HINT}`, 'error');
    if (!confirm.trim())   return toast.show('비밀번호 확인을 입력해 주세요.', 'error');
    if (password !== confirm) return toast.show('비밀번호가 일치하지 않습니다.', 'error');
    if (!c.age19)          return toast.show('만 19세 이상만 가입할 수 있습니다.', 'error');
    if (!c.terms)          return toast.show('서비스 이용약관에 동의해 주세요.', 'error');
    if (!c.privacy)        return toast.show('개인정보 수집·이용에 동의해 주세요.', 'error');
    if (!c.antiGambling)   return toast.show('불법 환전·사행성 금지 서약에 동의해 주세요.', 'error');

    setLoading(true);
    try {
      await signUpUser({
        email: mail.value.trim(), password, name: nameChk.value.trim(), nickname: nick.value.trim(),
        agreedToTerms:        c.terms,
        agreedToPrivacy:      c.privacy,
        agreedToAntiGambling: c.antiGambling,
        agreedToMarketing:    c.marketing,
        publicRankingConsent: c.publicRanking,
      });
      toast.show('가입 완료! 로그인 후 휴대폰 본인인증을 진행해 주세요.', 'success');
      onDone();
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : '가입 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SignupSegment mode={mode} onChange={onMode} />
      <form onSubmit={submit} className="space-y-3">
        <NameField value={nameChk.value} status={nameChk.status} onChange={nameChk.setValue} />
        <NicknameField value={nick.value} status={nick.status} onChange={nick.setValue} />
        <EmailField value={mail.value} status={mail.status} onChange={mail.setValue} />
        <div>
          <PasswordField label="비밀번호" autoComplete="new-password" placeholder={PASSWORD_PLACEHOLDER} required value={password} onChange={setPassword} minLength={8} />
          <PasswordHint value={password} />
        </div>
        <PasswordField label="비밀번호 확인" autoComplete="new-password" placeholder="••••••••" required value={confirm} onChange={setConfirm} />

        <p className="rounded-input border border-border-subtle bg-surface-high px-2.5 py-2 text-2xs leading-relaxed text-ink-muted">
          <Icon name="lock" size={12} className="mr-1 inline-block align-[-1px] shrink-0" />가입 후 첫 로그인 시 <b className="text-ink-secondary">휴대폰 본인인증</b>이 필요합니다 (1인 1계정·안전거래).
        </p>

        <ConsentSection
          c={c} allRequired={allRequired} allChecked={allChecked}
          set={set} toggleAll={toggleAll}
          onView={setLegalDoc}
        />

        <button
          type="submit"
          disabled={
            loading || !allRequired || nameChk.status !== 'available' || nick.status !== 'available'
            || mail.status !== 'available' || !validatePassword(password).ok || password !== confirm
          }
          className="btn-primary w-full mt-2 disabled:opacity-60"
        >
          {loading ? '처리 중…' : '가입하기'}
        </button>
        <ModeSwitch question="이미 계정이 있으신가요?" action="로그인" onClick={onDone} />
      </form>

      <LegalSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </>
  );
}

// ── 매장 업주 가입 ─────────────────────────────────────────────────────────────

function SignupOwnerForm({ mode, onMode, onDone }: { mode: Mode; onMode: (m: Mode) => void; onDone: () => void }) {
  const toast = useToast();
  const [loading,   setLoading]   = useState(false);
  const nameChk = useNameCheck();
  const nick = useNicknameCheck();
  const mail = useEmailCheck();
  const [password,  setPassword]  = useState('');
  const [venueName, setVenueName] = useState('');
  const [region,    setRegion]    = useState('');
  const [address,   setAddress]   = useState('');
  const [phone,     setPhone]     = useState('');
  const [bizNum,    setBizNum]    = useState('');
  const [legalDoc,  setLegalDoc]  = useState<LegalDoc | null>(null);
  const { c, allRequired, allChecked, set, toggleAll } = useConsent();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!c.age19)        return toast.show('만 19세 이상만 가입할 수 있습니다.', 'error');
    if (!c.terms)        return toast.show('서비스 이용약관에 동의해 주세요.', 'error');
    if (!c.privacy)      return toast.show('개인정보 수집·이용에 동의해 주세요.', 'error');
    if (!c.antiGambling) return toast.show('불법 환전·사행성 금지 서약에 동의해 주세요.', 'error');
    if (nameChk.status !== 'available') return toast.show('사용 가능한 닉네임을 입력해 주세요.', 'error');
    if (nick.status !== 'available') return toast.show('사용 가능한 받는 아이디를 입력해 주세요.', 'error');
    if (mail.status !== 'available') return toast.show('사용 가능한 이메일을 입력해 주세요.', 'error');
    if (!validatePassword(password).ok) return toast.show(`비밀번호 규칙: ${PASSWORD_RULE_HINT}`, 'error');

    setLoading(true);
    try {
      await signUpOwner({
        name: nameChk.value.trim(), email: mail.value.trim(), password, nickname: nick.value.trim(),
        agreedToTerms:        c.terms,
        agreedToPrivacy:      c.privacy,
        agreedToAntiGambling: c.antiGambling,
        agreedToMarketing:    c.marketing,
        publicRankingConsent: c.publicRanking,
        venueName, region, address, phone, businessNumber: bizNum,
      });
      toast.show('업주 가입 신청 완료. 로그인 후 휴대폰 본인인증·운영자 승인을 거쳐 포스터 업로드가 활성화됩니다.', 'success');
      onDone();
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : '가입 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SignupSegment mode={mode} onChange={onMode} />
      <form onSubmit={submit} className="space-y-3">
        {/* 안내 배너 */}
        <div className="flex items-start gap-2 p-3 rounded-input bg-accent-300/10 border border-accent-400/30">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#FFD100" strokeWidth="1.5" className="shrink-0 mt-0.5" aria-hidden>
            <circle cx="8" cy="8" r="6.5"/><line x1="8" y1="5" x2="8" y2="9"/><circle cx="8" cy="11.5" r="0.5" fill="#FFD100"/>
          </svg>
          <p className="text-xs text-accent-300 leading-relaxed">
            매장 업주는 <strong>운영자 승인</strong> 후 포스터 업로드 권한이 활성화됩니다.<br/>
            승인 처리는 영업일 기준 1~2일 소요됩니다.
          </p>
        </div>

        <section>
          <p className="text-2xs font-semibold text-ink-secondary mb-2">계정 정보</p>
          <div className="space-y-3">
            <NameField value={nameChk.value} status={nameChk.status} onChange={nameChk.setValue} subLabel="(대표자 표시 이름)" />
            <NicknameField value={nick.value} status={nick.status} onChange={nick.setValue} />
            <EmailField value={mail.value} status={mail.status} onChange={mail.setValue} />
            <div>
              <PasswordField label="비밀번호" autoComplete="new-password" placeholder={PASSWORD_PLACEHOLDER} required value={password} onChange={setPassword} minLength={8} />
              <PasswordHint value={password} />
            </div>
          </div>
        </section>

        <section className="pt-2 border-t border-border-subtle">
          <p className="text-2xs font-semibold text-ink-secondary mb-2 mt-2">매장 정보</p>
          <div className="space-y-3">
            <Field label="매장명"        type="text" placeholder="OO 홀덤펍"           required value={venueName} onChange={(e) => setVenueName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="지역"   type="text" placeholder="강남"          required value={region} onChange={(e) => setRegion(e.target.value)} />
              <Field label="연락처" type="tel"  autoComplete="tel" inputMode="tel" placeholder="010-0000-0000" required value={phone}  onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Field label="상세 주소"      type="text" placeholder="서울시 강남구 …" required value={address} onChange={(e) => setAddress(e.target.value)} />
            <Field label="사업자등록번호" type="text" placeholder="000-00-00000"       required value={bizNum}  onChange={(e) => setBizNum(e.target.value)} />
            <p className="rounded-input border border-border-subtle bg-surface-high px-2.5 py-2 text-2xs leading-relaxed text-ink-muted">
              <Icon name="lock" size={12} className="mr-1 inline-block align-[-1px] shrink-0" />가입·승인 후 첫 로그인 시 <b className="text-ink-secondary">대표자 휴대폰 본인인증</b>이 필요합니다 (1인 1계정).
            </p>
          </div>
        </section>

        <ConsentSection
          c={c} allRequired={allRequired} allChecked={allChecked}
          set={set} toggleAll={toggleAll}
          onView={setLegalDoc}
        />

        <button
          type="submit"
          disabled={loading || !allRequired || nameChk.status !== 'available' || nick.status !== 'available' || mail.status !== 'available' || !validatePassword(password).ok}
          className="btn-primary w-full mt-3 disabled:opacity-60"
        >
          {loading ? '처리 중…' : '업주 가입 신청'}
        </button>
        <ModeSwitch question="이미 계정이 있으신가요?" action="로그인" onClick={onDone} />
      </form>

      <LegalSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </>
  );
}

// ── 닉네임(name)·받는 아이디(nickname) 필드 — 실시간 중복검사 ─────────────────
// 훅·필드 본체는 atoms/AvailabilityField(프로필 설정과 공용). 여기서는 두 컬럼의 규칙만 고정한다.
//  · 닉네임(profiles.name)          = 표시 이름(랭킹·글 작성자명). 공백 정리 후 2~20자, is_name_available.
//  · 받는 아이디(profiles.nickname) = 이용권 수령·전적 연결용. 2~16자 한글·영문·숫자·_-, is_nickname_available.

const NICK_RE = /^[가-힣a-zA-Z0-9_-]{2,16}$/;
const isValidNick = (v: string) => NICK_RE.test(v);

type FieldProps = Omit<React.ComponentProps<typeof AvailabilityField>, 'label' | 'invalidText'>;

const useNameCheck     = () => useAvailabilityCheck(checkNameAvailable, isValidDisplayName);
const useNicknameCheck = () => useAvailabilityCheck(checkNicknameAvailable, isValidNick);

// 인증 화면의 세 중복검사 필드는 비밀번호 칸과 **같은 규격**을 쓴다 — 한쪽만 밝으면 폼이 층져 보인다.
function NameField(props: FieldProps) {
  return <AvailabilityField label="닉네임" placeholder="2~20자 (랭킹·글에 표시)" maxLength={20} invalidText="2~20자로 입력해 주세요"
    inputClassName={FIELD_CLS} quietLabel {...props} />;
}
function NicknameField(props: FieldProps) {
  return (
    <AvailabilityField label="받는 아이디" noun="아이디" subLabel="(이용권 수령·전적 연결용)" placeholder="2~16자 (한글/영문/숫자)" maxLength={16}
      invalidText="2~16자 한글·영문·숫자·_- 만 가능" inputClassName={FIELD_CLS} quietLabel {...props} />
  );
}

// ── 이메일(아이디) 필드 — 실시간 중복검사(600ms · 형식 통과 후에만 RPC, 열거 위험 완화 20260903b) ──

const isValidEmail  = (v: string) => EMAIL_RE.test(v);
const useEmailCheck = () => useAvailabilityCheck(checkEmailAvailable, isValidEmail, undefined, 600);

function EmailField(props: FieldProps) {
  return (
    <AvailabilityField label="이메일" type="email" autoComplete="email" testId="signup-email" placeholder="you@example.com" maxLength={254}
      invalidText="이메일 형식을 확인해 주세요" takenText="이미 가입된 이메일입니다 — 로그인하거나 비밀번호 찾기를 이용해 주세요"
      inputClassName={FIELD_CLS} quietLabel {...props} />
  );
}

// ── 비밀번호 규칙 안내(입력 아래 한 줄) ───────────────────────────────────────

function PasswordHint({ value }: { value: string }) {
  const { ok, reasons } = validatePassword(value);
  if (!value) return <p className="mt-1 text-2xs text-ink-muted">{PASSWORD_RULE_HINT}</p>;
  return ok
    ? <p className="mt-1 text-2xs text-emerald-400" aria-live="polite">비밀번호 규칙을 모두 충족했습니다</p>
    : <p className="mt-1 text-2xs text-danger" aria-live="polite">아직 부족해요: {reasons.join(' · ')}</p>;
}

// ── 폼 필드 헬퍼 ──────────────────────────────────────────────────────────────

function Field({ label, className, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const id = rest.id ?? autoId; // 라벨-입력 연결(스크린리더·라벨탭 접근성)
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-2xs font-semibold tracking-wide text-ink-muted">
        {label}{rest.required && <span className="ml-0.5 text-accent-200/70">*</span>}
      </label>
      {/* className 은 .input 을 덮지 않고 **더한다**(높이 상향 같은 화면별 보정용) */}
      <input {...rest} id={id} className={['input', className].filter(Boolean).join(' ')} />
    </div>
  );
}
