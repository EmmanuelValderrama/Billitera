import {
  EmailAuthProvider,
  User,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { AlertTriangle, LogOut, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { googleProvider } from '../firebase';

interface AccountModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => Promise<void>;
  onBeforeDeleteAccount: () => void;
  onDeleteAccountData: (uid: string) => Promise<void>;
  onAccountDeleted: () => void;
}

function mapDeleteAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'La contraseña ingresada no es correcta. Verifica e intenta de nuevo.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos antes de intentar nuevamente.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Debes completar la verificación con Google para confirmar la eliminación.';
    case 'auth/requires-recent-login':
      return 'Por seguridad, vuelve a confirmar tu sesión para eliminar la cuenta.';
    default:
      return 'No se pudo eliminar la cuenta en este momento. Intenta nuevamente.';
  }
}

export function AccountModal({
  user,
  isOpen,
  onClose,
  onSignOut,
  onBeforeDeleteAccount,
  onDeleteAccountData,
  onAccountDeleted,
}: AccountModalProps) {
  const [confirmStep, setConfirmStep] = useState(false);
  const [password, setPassword] = useState('');
  const [googleConfirmed, setGoogleConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
  const hasGoogleProvider = user.providerData.some((p) => p.providerId === 'google.com');

  useEffect(() => {
    if (!isOpen) {
      setConfirmStep(false);
      setPassword('');
      setGoogleConfirmed(false);
      setErrorMsg('');
      setIsDeleting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSignOutClick() {
    if (isDeleting || isSigningOut) return;
    setIsSigningOut(true);
    try {
      await onSignOut();
      onClose();
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleConfirmDelete(e: FormEvent) {
    e.preventDefault();
    if (isDeleting) return;
    setErrorMsg('');

    if (hasPasswordProvider && !password) {
      setErrorMsg('Ingresa tu contraseña para confirmar la eliminación de tu cuenta.');
      return;
    }

    if (!hasPasswordProvider && !googleConfirmed) {
      setErrorMsg('Marca la casilla de confirmación antes de eliminar tu cuenta.');
      return;
    }

    setIsDeleting(true);
    try {
      // 1. Re-autenticar ANTES de borrar datos en Firestore para evitar estado inconsistente
      if (hasPasswordProvider && user.email) {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
      } else if (hasGoogleProvider) {
        const lastSignInMs = user.metadata.lastSignInTime
          ? Date.parse(user.metadata.lastSignInTime)
          : 0;
        const isRecent = lastSignInMs > 0 && Date.now() - lastSignInMs < 2 * 60 * 1000;
        if (!isRecent) {
          await reauthenticateWithPopup(user, googleProvider);
        }
      }

      // 2. Desuscribir listeners antes de limpiar Firestore
      onBeforeDeleteAccount();

      // 3. Borrar todos los datos del usuario en Firestore (gastos, tarjetas, billetera)
      await onDeleteAccountData(user.uid);

      // 4. Eliminar la cuenta de Firebase Auth
      try {
        await deleteUser(user);
      } catch (deleteErr) {
        const code =
          typeof deleteErr === 'object' && deleteErr !== null && 'code' in deleteErr
            ? String((deleteErr as { code?: unknown }).code)
            : '';
        if (code === 'auth/requires-recent-login' && hasGoogleProvider) {
          await reauthenticateWithPopup(user, googleProvider);
          await deleteUser(user);
        } else {
          throw deleteErr;
        }
      }

      onAccountDeleted();
    } catch (err) {
      setErrorMsg(mapDeleteAuthError(err));
      setIsDeleting(false);
    }
  }

  const providerLabel = hasGoogleProvider && hasPasswordProvider
    ? 'Google y correo'
    : hasGoogleProvider
      ? 'Google'
      : 'Correo y contraseña';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
    >
      <div className="w-full max-w-md bg-gradient-to-br from-[#1b1d22] via-[#131418] to-[#181a20] border border-white/[0.14] shadow-2xl rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
          <h2 id="account-modal-title" className="font-display text-lg font-medium text-zinc-50">
            Tu cuenta
          </h2>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            aria-label="Cerrar ventana de cuenta"
            className="text-zinc-400 hover:text-zinc-100 disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="rounded-lg bg-[#090a0d] border border-white/[0.08] p-4 space-y-1.5">
            <p className="text-xs text-zinc-500">Sesión activa</p>
            <p className="text-sm font-medium text-zinc-100 break-all">
              {user.email ?? 'Cuenta sin correo visible'}
            </p>
            <p className="text-xs text-zinc-400">Acceso: {providerLabel}</p>
          </div>

          {!confirmStep ? (
            <div className="space-y-3">
              <button
                type="button"
                disabled={isSigningOut}
                onClick={handleSignOutClick}
                className="w-full py-2.5 px-4 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] text-sm font-medium text-zinc-100 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>{isSigningOut ? 'Cerrando sesión...' : 'Cerrar sesión'}</span>
              </button>

              <div className="pt-4 border-t border-white/[0.08] space-y-3">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Si ya no quieres usar esta cuenta, puedes eliminarla junto con todos tus datos
                  guardados.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmStep(true);
                    setErrorMsg('');
                  }}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#e07a73]/[0.08] hover:bg-[#e07a73]/[0.15] border border-[#e07a73]/35 text-sm font-medium text-[#e07a73] transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  <span>Eliminar cuenta</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConfirmDelete} className="space-y-4">
              <div className="rounded-lg bg-[#e07a73]/[0.08] border border-[#e07a73]/35 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f39e98]">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Confirmar eliminación permanente</span>
                </div>
                <p className="text-xs text-zinc-200 leading-relaxed">
                  Se eliminará tu cuenta y <strong>se borrarán para siempre</strong> tu presupuesto,
                  tus tarjetas y todos tus gastos en la base de datos. Esta acción no se puede
                  deshacer.
                </p>
              </div>

              {hasPasswordProvider ? (
                <div>
                  <label
                    htmlFor="delete-confirm-password"
                    className="block text-xs font-medium text-zinc-200"
                  >
                    Ingresa tu contraseña para confirmar
                  </label>
                  <input
                    id="delete-confirm-password"
                    type="password"
                    autoFocus
                    disabled={isDeleting}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Tu contraseña actual"
                    className="mt-2 w-full bg-[#090a0d] border border-white/[0.12] focus:border-[#e07a73]/70 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
              ) : (
                <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={isDeleting}
                    checked={googleConfirmed}
                    onChange={(e) => {
                      setGoogleConfirmed(e.target.checked);
                      if (errorMsg) setErrorMsg('');
                    }}
                    className="mt-0.5 rounded border-white/20 bg-[#090a0d] accent-[#d9534f]"
                  />
                  <span>
                    Entiendo que se borrarán mi cuenta y todos mis datos asociados de forma
                    irreversible.
                  </span>
                </label>
              )}

              {errorMsg && (
                <p role="alert" className="text-xs text-[#f39e98] leading-relaxed">
                  {errorMsg}
                </p>
              )}

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setConfirmStep(false);
                    setPassword('');
                    setGoogleConfirmed(false);
                    setErrorMsg('');
                  }}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] text-xs font-medium text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-[#d9534f] hover:bg-[#e26460] disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isDeleting ? 'Eliminando...' : 'Sí, eliminar cuenta'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
