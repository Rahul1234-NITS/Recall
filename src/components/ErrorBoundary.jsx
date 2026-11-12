import { Component } from 'react';

// Last line of defence: if a render bug slips through, show a way out
// instead of a blank page. Saved sets in localStorage are untouched.
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Something broke on this screen.</h1>
        <p>Your saved sets are safe. Reloading usually fixes it.</p>
        <button className="btn btn--primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
