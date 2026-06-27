import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './ui/Button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
          <div className="rounded-full bg-danger/10 p-4">
            <AlertTriangle className="h-10 w-10 text-danger" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-foreground">Something went wrong</h1>
          <p className="mt-2 max-w-md text-sm text-muted">
            An unexpected error occurred. Please try reloading the page.
          </p>
          {this.state.error?.message && (
            <p className="mt-4 max-w-md rounded-lg bg-surface p-3 text-xs text-danger">
              {this.state.error.message}
            </p>
          )}
          <Button
            variant="primary"
            className="mt-8"
            onClick={() => window.location.reload()}
            aria-label="Reload page"
          >
            Reload
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
