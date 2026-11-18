import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

function parseErrorMessage(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed?.error) {
      if (parsed.error.includes('Quota exceeded')) {
        return 'Se superó la cuota diaria gratuita de la base de datos. Intenta nuevamente mañana.';
      }
      if (parsed.error.includes('permission') || parsed.error.includes('PERMISSION_DENIED')) {
        return 'No fue posible completar la operación por permisos en la base de datos.';
      }
      return parsed.error;
    }
  } catch {
    // No es JSON estructurado; usar mensaje directo
  }
  return error.message || 'Ocurrió un error inesperado al conectar con la base de datos.';
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: parseErrorMessage(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary capturó un error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090a0d] text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-gradient-to-br from-[#1b1d22]/95 via-[#131418]/95 to-[#181a20]/95 border border-white/[0.12] rounded-xl p-6 sm:p-8 space-y-4">
            <h1 className="font-display text-2xl font-medium text-zinc-50">
              No pudimos conectar con Tu billetera
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {this.state.message}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] text-[#042415] text-sm font-semibold transition-colors cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
