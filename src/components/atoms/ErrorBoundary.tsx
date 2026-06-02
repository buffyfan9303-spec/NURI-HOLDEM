// src/components/atoms/ErrorBoundary.tsx
// 런타임 예외 시 흰 화면 대신 안전한 안내 화면을 노출(앱 크래시 복원력).
// CSS가 로드되지 않아도 보이도록 인라인 스타일 사용.
import { Component, type ReactNode } from 'react';

interface State { hasError: boolean }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // 운영에서는 외부 로깅(Sentry 등) 연동 지점
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
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
