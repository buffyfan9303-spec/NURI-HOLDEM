// src/components/atoms/ErrorBoundary.tsx
// 런타임 예외 시 흰 화면 대신 안전한 안내 화면을 노출(앱 크래시 복원력).
// - 전역(기본): 풀스크린 폴백. CSS 미로드 대비 인라인 스타일.
// - inline: 섹션/탭 단위 폴백(카드형). resetKey 변경 시(예: 탭 전환) 자동 복구.
import { Component, type ReactNode } from 'react';
import { logClientError } from '../../lib/errorLog';

interface Props {
  children: ReactNode;
  /** 섹션/탭 단위 컴팩트 폴백 */
  inline?: boolean;
  /** 값이 바뀌면 에러 상태를 초기화(예: 활성 탭 키) */
  resetKey?: unknown;
  /** inline 폴백 제목 */
  label?: string;
}
interface State { hasError: boolean; prevKey: unknown }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, prevKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.prevKey) return { hasError: false, prevKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
    // 관리자 '오류 로그' 화면으로 수집
    const e = error instanceof Error ? error : new Error(String(error));
    logClientError(`[boundary${this.props.label ? `:${this.props.label}` : ''}] ${e.message}`, e.stack);
  }

  // ── dev 전용: HMR 갱신이 끝나면 스스로 복구한다 ──────────────────────────────
  // 왜: client_errors 에 남은 크래시는 **전부** localhost 개발 서버발이고 형태가 하나다
  //   — `useRef is not defined` · `onSwipeStart is not defined` · `useScrollY is not defined`.
  //   tsc 가 통과하는데 이런 ReferenceError 가 나는 경우는 하나뿐이다: Vite HMR 이 **저장 중간
  //   상태의 모듈**을 주입한 것. 즉 소스 결함이 아니라 '파일을 저장하는 순간' 의 스냅샷이다.
  //   (프로덕션 origin 에서 기록된 boundary 오류는 0건 — 빌드는 완성된 모듈만 담으므로 원리상 없다.)
  //
  //   문제는 그 다음이다. React 는 한 번 에러 상태가 되면 **정상 모듈이 도착해도 스스로 복구하지
  //   않는다.** 그래서 사장님이 5173 을 띄워둔 채 작업을 지켜보면 흰 화면에 갇혀 수동 새로고침을
  //   해야 했다 — '사이트가 완전히 튕긴다' 로 보이는 그 증상이다.
  //   → 다음 HMR 갱신이 완료되는 순간 에러 상태를 턴다. 프로덕션에는 import.meta.hot 이
  //     없으므로 이 블록 전체가 번들에서 사라진다(런타임 비용 0).
  private hotOff: (() => void) | null = null;

  componentDidMount() {
    const hot = import.meta.hot;
    if (!hot) return;
    const onUpdate = () => { if (this.state.hasError) this.setState({ hasError: false }); };
    hot.on('vite:afterUpdate', onUpdate);
    this.hotOff = () => hot.off('vite:afterUpdate', onUpdate);
  }

  componentWillUnmount() {
    this.hotOff?.();
    this.hotOff = null;
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    // ── 섹션/탭 단위 컴팩트 폴백 ──
    if (this.props.inline) {
      return (
        <div className="rounded-card border border-danger/40 bg-danger/[0.06] p-5 text-center space-y-2 my-4 animate-fade-in">
          <p className="text-sm font-bold text-ink-primary">{this.props.label ?? '이 영역을 불러오지 못했습니다'}</p>
          <p className="text-2xs text-ink-muted">잠시 후 다시 시도해 주세요.</p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button type="button" onClick={this.reset} className="btn-ghost text-xs px-3">다시 시도</button>
            <button type="button" onClick={() => window.location.reload()} className="btn-primary text-xs px-3">새로고침</button>
          </div>
        </div>
      );
    }

    // ── 전역 풀스크린 폴백 ──
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '12px',
        background: '#151221', color: '#F0F4FF', padding: '24px', textAlign: 'center',
        fontFamily: "'Apple SD Gothic Neo','Malgun Gothic',sans-serif",
      }}>
        <p style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>잠시 문제가 생겼어요</p>
        <p style={{ fontSize: '13px', color: '#8B95A8', margin: 0 }}>잠시 후 다시 시도해 주세요.</p>
        {/* dev 에서만 보이는 한 줄 — 이 화면이 '라이브 장애' 가 아니라 편집 중 스냅샷임을 알린다.
            프로덕션 번들에서는 import.meta.hot 이 없어 통째로 사라진다. */}
        {import.meta.hot && (
          <p style={{ fontSize: '12px', color: '#805FDA', margin: 0 }}>
            개발 서버(HMR) — 파일 저장이 끝나면 자동으로 복구됩니다.
          </p>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: '8px', padding: '10px 22px', borderRadius: '8px',
            /* CSS 미로드 대비 하드 hex — 다크 accent-300 정본(#805FDA, h256)과 동기(index.css) */
            background: '#805FDA', color: '#FFFFFF', fontWeight: 700,
            border: 'none', cursor: 'pointer', fontSize: '14px',
          }}
        >
          새로고침
        </button>
      </div>
    );
  }
}
