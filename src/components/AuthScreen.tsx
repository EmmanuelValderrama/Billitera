import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { auth, googleProvider } from '../firebase';

interface AuthScreenProps {
  accountDeletedNotice?: boolean;
  onDismissNotice?: () => void;
}

type AuthMode = 'login' | 'register';

function mapAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.';
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta registrada con este correo. Inicia sesión en su lugar.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'Ingresa un correo electrónico válido.';
    case 'auth/operation-not-allowed':
      return 'El acceso con correo y contraseña aún no está activado en Firebase Authentication.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Cerraste la ventana de Google antes de completar el ingreso.';
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e intenta de nuevo.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos seguidos. Espera un momento antes de volver a intentar.';
    default:
      return 'No se pudo completar el inicio de sesión. Intenta nuevamente.';
  }
}

export function AuthScreen({ accountDeletedNotice = false, onDismissNotice }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const isBusy = isSubmitting || isGoogleLoading;

  function switchMode(nextMode: AuthMode) {
    if (isBusy) return;
    setMode(nextMode);
    setErrorMsg('');
    if (onDismissNotice) onDismissNotice();
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (isBusy) return;
    if (onDismissNotice) onDismissNotice();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Ingresa tu correo electrónico.');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (!password) {
      setErrorMsg('Ingresa tu contraseña.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      } else {
        await createUserWithEmailAndPassword(auth, cleanEmail, password);
      }
    } catch (err) {
      setErrorMsg(mapAuthError(err));
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    if (isBusy) return;
    if (onDismissNotice) onDismissNotice();
    setIsGoogleLoading(true);
    setErrorMsg('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setErrorMsg(mapAuthError(err));
      setIsGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen text-zinc-100 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[440px] space-y-6">
        <div className="text-center space-y-2">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-50">
            Tu billetera
          </h1>
          <p className="text-sm text-zinc-400">
            Cada cuenta guarda su propio presupuesto, tarjetas y gastos de forma privada.
          </p>
        </div>

        {accountDeletedNotice && (
          <div
            role="status"
            className="bg-emerald-500/[0.08] border border-emerald-400/30 rounded-xl px-4 py-3 flex items-center gap-2.5 text-sm text-emerald-200"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>Tu cuenta y todos tus datos fueron eliminados correctamente.</span>
          </div>
        )}

        <section
          aria-label={mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          className="bg-gradient-to-br from-[#1b1d22]/95 via-[#131418]/95 to-[#181a20]/95 border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] rounded-xl p-6 sm:p-8 space-y-6"
        >
          {/* Selector Iniciar sesión / Crear cuenta */}
          <div
            role="tablist"
            aria-label="Modo de acceso"
            className="grid grid-cols-2 p-1 rounded-lg bg-[#090a0d] border border-white/[0.08]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => switchMode('login')}
              className={`py-2 rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-white/[0.1] text-zinc-50'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => switchMode('register')}
              className={`py-2 rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white/[0.1] text-zinc-50'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Crear cuenta
            </button>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="auth-email"
                className="block text-[13px] font-medium text-zinc-200 tracking-[0.01em]"
              >
                Correo electrónico
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                disabled={isBusy}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="tu@correo.com"
                className="mt-2 w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors disabled:opacity-60"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor="auth-password"
                  className="block text-[13px] font-medium text-zinc-200 tracking-[0.01em]"
                >
                  Contraseña
                </label>
                {mode === 'register' && (
                  <span className="text-[11px] text-zinc-500">Mínimo 6 caracteres</span>
                )}
              </div>
              <div className="mt-2 relative flex items-center">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  disabled={isBusy}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="••••••••"
                  className="w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {errorMsg && (
              <p role="alert" className="text-xs text-[#e07a73] leading-relaxed">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full py-2.5 px-4 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] disabled:opacity-60 text-[#042415] font-semibold text-sm transition-colors cursor-pointer disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              {isSubmitting
                ? mode === 'login'
                  ? 'Ingresando...'
                  : 'Creando cuenta...'
                : mode === 'login'
                  ? 'Iniciar sesión'
                  : 'Crear cuenta'}
            </button>
          </form>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-white/[0.08]" />
            <span className="px-3 text-xs text-zinc-500">o</span>
            <div className="flex-grow border-t border-white/[0.08]" />
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={handleGoogleLogin}
            className="w-full py-2.5 px-4 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-60 border border-white/[0.12] text-zinc-100 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12z"
              />
              <path
                fill="#34A853"
                d="M3.6 7.4l3.2 2.3C7.7 7.6 9.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5 8.3 2.5 5.1 4.6 3.6 7.4z"
              />
              <path
                fill="#FBBC05"
                d="M12 21.5c2.6 0 4.8-.9 6.4-2.3l-3-2.5c-.8.6-1.9 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1l-3.2 2.5c1.5 3.2 4.8 5.4 8.8 5.4z"
              />
              <path
                fill="#4285F4"
                d="M21.1 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.3-1.1 2.4-2.1 3.1l3 2.5c1.7-1.6 2.7-4 2.7-7.9z"
              />
            </svg>
            <span>{isGoogleLoading ? 'Conectando con Google...' : 'Entrar rápido con Google'}</span>
          </button>
        </section>
      </div>
    </div>
  );
}
