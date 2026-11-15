import { Component, ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-bg text-ink">
        <h1 className="text-2xl font-semibold">Something went wrong on this screen</h1>
        <p className="text-muted max-w-md">Your data is safe. Reload to continue. If you need urgent help, call 112.</p>
        <button onClick={() => location.reload()} className="rounded-xl bg-primary text-on-primary px-5 py-2.5 font-semibold">Reload</button>
        <a href="tel:112" className="underline font-semibold text-danger">Call 112</a>
      </div>
    )
  }
}
