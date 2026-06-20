// src/components/features/KillSwitch.tsx
// 매장 킬스위치 — 내 매장 전체를 영구 삭제(모든 로그 포함, 복구 불가). 업주에게만 노출.
// 동작: 비밀번호가 없으면 '최초 1회 설정'(이후 변경 불가) → 무장. 비밀번호가 있으면 3단계 삭제.
//  1) 등록된 업주 실명 입력  2) 킬스위치 비밀번호 입력  3) 최종 확인('영구 삭제' 타이핑) → 실행.
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { killSwitchIsSet, setKillPassword, killVenue } from '../../api/killswitch';

const CONFIRM_PHRASE = '영구 삭제';

export default function KillSwitch({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pwIsSet, setPwIsSet] = useState<boolean | null>(null); // null=확인중
  const [busy, setBusy] = useState(false);

  // 설정 플로우
  const [setupPw, setSetupPw] = useState('');
  const [setupPw2, setSetupPw2] = useState('');
  // 삭제 플로우
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ownerName, setOwnerName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [err, setErr] = useState('');

  const refreshStatus = () => killSwitchIsSet(venueId).then(setPwIsSet).catch(() => setPwIsSet(false));
  useEffect(() => { refreshStatus(); /* eslint-disable-next-line */ }, [venueId]);

  const reset = () => {
    setSetupPw(''); setSetupPw2(''); setStep(1);
    setOwnerName(''); setPassword(''); setConfirmText(''); setErr('');
  };
  const close = () => { setOpen(false); reset(); };

  // 최초 비밀번호 설정 — 한 번 만들면 변경 불가
  const doSetup = async () => {
    setErr('');
    if (setupPw.length < 4) { setErr('비밀번호는 4자 이상이어야 합니다.'); return; }
    if (setupPw !== setupPw2) { setErr('두 비밀번호가 일치하지 않습니다.'); return; }
    setBusy(true);
    try {
      await setKillPassword(venueId, setupPw);
      setPwIsSet(true); reset();
      toast.show('킬스위치 비밀번호를 설정했어요. 한 번 만든 비밀번호는 변경할 수 없습니다.', 'success');
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '설정에 실패했습니다.');
    } finally { setBusy(false); }
  };

  // 최종 삭제 실행
  const doKill = async () => {
    setErr('');
    if (confirmText.trim() !== CONFIRM_PHRASE) { setErr(`확인을 위해 '${CONFIRM_PHRASE}'를 정확히 입력하세요.`); return; }
    setBusy(true);
    try {
      await killVenue(venueId, ownerName.trim(), password);
      toast.show('매장의 모든 데이터를 영구 삭제했습니다.', 'success');
      // 매장이 사라졌으므로 전체 상태를 새로 로드
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      // 실명/비밀번호 불일치 등은 서버가 거부 → 1단계부터 다시
      setErr(e instanceof Error ? e.message : '삭제에 실패했습니다.');
      setStep(1); setPassword(''); setConfirmText('');
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-8 rounded-card border border-danger/40 bg-danger/[0.04] p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-lg" aria-hidden>🧨</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-danger">위험 구역 · 매장 전체 초기화(킬스위치)</h3>
          <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">
            내 매장의 <b className="text-ink-secondary">모든 데이터(장부·순위·이용권·직원·클락·로그 전부)</b>를 영구 삭제합니다.
            <b className="text-danger"> 복구할 수 없습니다.</b> 업주 본인 확인 → 킬스위치 비밀번호 → 최종 확인 3단계를 거칩니다.
          </p>
          {pwIsSet === false && (
            <p className="mt-1 text-[10px] text-ink-muted">처음 누르면 <b className="text-ink-secondary">킬스위치 비밀번호</b>를 먼저 설정합니다(이후 변경 불가).</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        disabled={pwIsSet === null}
        className="mt-2.5 w-full rounded-input border border-danger/50 bg-danger/10 py-2.5 text-sm font-bold text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
      >
        {pwIsSet === null ? '확인 중…' : pwIsSet ? '🧨 매장 전체 영구 삭제' : '🔐 킬스위치 비밀번호 설정'}
      </button>

      <Modal open={open} onClose={close} title="매장 킬스위치" variant="center" maxWidth="sm" dismissOnBackdrop={false}>
        <div className="space-y-3.5 p-4">
          {/* ── 최초 비밀번호 설정 ── */}
          {pwIsSet === false ? (
            <>
              <div className="rounded-card border border-amber-500/30 bg-amber-500/[0.06] p-3">
                <p className="text-2xs font-bold text-amber-300">킬스위치 비밀번호 설정 (최초 1회)</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                  이 비밀번호는 매장 전체를 삭제할 때 필요합니다. <b className="text-danger">한 번 설정하면 변경·재설정할 수 없으니</b> 신중히 정하고 안전하게 보관하세요.
                </p>
              </div>
              <Lbl label="킬스위치 비밀번호 (4자 이상)">
                <input type="password" value={setupPw} onChange={(e) => setSetupPw(e.target.value)} autoComplete="new-password" className="input w-full text-sm" placeholder="비밀번호" />
              </Lbl>
              <Lbl label="비밀번호 다시 입력">
                <input type="password" value={setupPw2} onChange={(e) => setSetupPw2(e.target.value)} autoComplete="new-password" className="input w-full text-sm" placeholder="한 번 더 입력" />
              </Lbl>
              {err && <p className="text-2xs font-semibold text-danger">{err}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={close} className="btn-ghost flex-1 text-sm">취소</button>
                <button type="button" onClick={doSetup} disabled={busy} className="flex-1 rounded-input bg-amber-500 py-2 text-sm font-bold text-black disabled:opacity-50">{busy ? '설정 중…' : '비밀번호 설정'}</button>
              </div>
            </>
          ) : (
            // ── 3단계 삭제 ──
            <>
              <Steps step={step} />
              {step === 1 && (
                <>
                  <div className="rounded-card border border-danger/30 bg-danger/[0.05] p-3">
                    <p className="text-2xs font-bold text-danger">1단계 · 업주 본인 확인</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">등록된 <b className="text-ink-secondary">매장 업주의 실명</b>을 입력하세요. 본인인증된 업주 본인만 진행할 수 있습니다.</p>
                  </div>
                  <Lbl label="업주 실명">
                    <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="input w-full text-sm" placeholder="실명 입력" autoFocus />
                  </Lbl>
                  {err && <p className="text-2xs font-semibold text-danger">{err}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={close} className="btn-ghost flex-1 text-sm">취소</button>
                    <button type="button" onClick={() => { if (!ownerName.trim()) { setErr('업주 실명을 입력하세요.'); return; } setErr(''); setStep(2); }} className="flex-1 rounded-input bg-danger py-2 text-sm font-bold text-white">다음</button>
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="rounded-card border border-danger/30 bg-danger/[0.05] p-3">
                    <p className="text-2xs font-bold text-danger">2단계 · 킬스위치 비밀번호</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">최초에 설정한 <b className="text-ink-secondary">킬스위치 비밀번호</b>를 입력하세요.</p>
                  </div>
                  <Lbl label="킬스위치 비밀번호">
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" className="input w-full text-sm" placeholder="비밀번호" autoFocus />
                  </Lbl>
                  {err && <p className="text-2xs font-semibold text-danger">{err}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => { setErr(''); setStep(1); }} className="btn-ghost flex-1 text-sm">이전</button>
                    <button type="button" onClick={() => { if (!password) { setErr('비밀번호를 입력하세요.'); return; } setErr(''); setStep(3); }} className="flex-1 rounded-input bg-danger py-2 text-sm font-bold text-white">다음</button>
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <div className="rounded-card border border-danger/50 bg-danger/[0.08] p-3">
                    <p className="text-2xs font-bold text-danger">3단계 · 최종 확인</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                      정말 <b className="text-danger">매장 전체를 영구 삭제</b>하시겠습니까? 장부·순위·이용권·직원·클락 등 <b className="text-ink-secondary">모든 데이터가 즉시 사라지며 복구할 수 없습니다.</b>
                    </p>
                  </div>
                  <Lbl label={`확인을 위해 '${CONFIRM_PHRASE}'를 입력하세요`}>
                    <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="input w-full text-sm" placeholder={CONFIRM_PHRASE} autoFocus />
                  </Lbl>
                  {err && <p className="text-2xs font-semibold text-danger">{err}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => { setErr(''); setStep(2); }} className="btn-ghost flex-1 text-sm">이전</button>
                    <button type="button" onClick={doKill} disabled={busy || confirmText.trim() !== CONFIRM_PHRASE}
                      className="flex-1 rounded-input bg-danger py-2 text-sm font-bold text-white disabled:opacity-40">{busy ? '삭제 중…' : '영구 삭제 실행'}</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-2xs font-semibold text-ink-secondary">{label}</span>{children}</label>;
}

function Steps({ step }: { step: 1 | 2 | 3 }) {
  const items = ['본인 확인', '비밀번호', '최종 확인'];
  return (
    <div className="flex items-center gap-1.5">
      {items.map((t, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const on = step === n, done = step > n;
        return (
          <div key={t} className="flex flex-1 items-center gap-1.5">
            <div className={['flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
              on ? 'bg-danger text-white' : done ? 'bg-danger/30 text-danger' : 'bg-surface-high text-ink-muted'].join(' ')}>{done ? '✓' : n}</div>
            <span className={['text-[10px] font-semibold', on ? 'text-danger' : 'text-ink-muted'].join(' ')}>{t}</span>
          </div>
        );
      })}
    </div>
  );
}
