import { Component, type ReactNode } from 'react';
import { Button } from '@/ui/Button';
import { ErrorState } from '@/ui/States';

/** A crash in one screen must not blank the whole admin: show an error panel and offer a reload. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key?: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null; // navigating away clears the error
  }
  componentDidCatch(error: Error) { console.error('Screen crashed:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card">
        <ErrorState title="This screen hit a problem" error={this.state.error} />
        <div className="state__actions" style={{ paddingBottom: 24 }}><Button label="Reload the page" onClick={() => window.location.reload()} /></div>
      </div>
    );
  }
}
