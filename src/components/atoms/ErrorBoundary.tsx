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
        background: '#0A0C0F', color: '#F0F4FF', padding: '24px', textAlign: 'center',
        fontFamily: "'Apple SD Gothic Neo','Malgun Gothic',sans-serif",
      }}>
        <p style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>일시적인 오류가 발생했습니다</p>
        <p style={{ fontSize: '13px', color: '#8B95A8', margin: 0 }}>잠시 후 다시 시도해 주세요.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: '8px', padding: '10px 22px', borderRadius: '8px',
            background: '#FFD100', color: '#0A0C0F', fontWeight: 700,
            border: 'none', cursor: 'pointer', fontSize: '14px',
          }}
        >
          새로고침
        </button>
      </div>
    );
  }
}
