import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React error boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div
            style={{
              padding: 24,
              margin: 16,
              background: 'rgba(255, 107, 107, 0.1)',
              border: '1px solid rgba(255, 107, 107, 0.3)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Something went wrong</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 12 }}>
              {this.state.error}
            </div>
            <button
              className="btn btn-sm"
              onClick={() => this.setState({ hasError: false, error: '' })}
            >
              Try Again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
