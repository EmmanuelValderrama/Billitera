import { Plus, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { DEFAULT_TODAY_ISO, IncomeEntry, formatCurrency } from '../data/walletData';
import { IncomeWriteInput } from '../services/walletStore';

interface AddIncomeModalProps {
  isOpen: boolean;
  availableBalance: number;
  editingIncome?: IncomeEntry | null;
  onClose: () => void;
  onSaveIncome: (input: IncomeWriteInput) => Promise<void>;
}

const QUICK_ADD_INCOMES = [50000, 100000, 200000, 500000];

function formatGroupedDigits(digits: string): string {
  if (!digits) return '';
  const num = Math.round(Number(digits));
  if (!Number.isFinite(num) || num <= 0) return '';
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(num);
}

export function AddIncomeModal({
  isOpen,
  availableBalance,
  editingIncome = null,
  onClose,
  onSaveIncome,
}: AddIncomeModalProps) {
  const isEditing = Boolean(editingIncome);
  const [rawDigits, setRawDigits] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(DEFAULT_TODAY_ISO);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRawDigits(editingIncome ? String(Math.round(editingIncome.amount)) : '');
      setDescription(editingIncome ? editingIncome.description : '');
      setDate(editingIncome ? editingIncome.date : DEFAULT_TODAY_ISO);
      setErrorMsg('');
      setIsSaving(false);
    }
  }, [isOpen, editingIncome]);

  if (!isOpen) return null;

  const parsedAmount = rawDigits ? Math.round(Number(rawDigits)) : 0;
  const baseAvailable = editingIncome
    ? availableBalance - editingIncome.amount
    : availableBalance;
  const projectedBalance = baseAvailable + parsedAmount;

  function handleAmountChange(value: string) {
    const trimmed = value.trim();
    const decimalMatch = trimmed.match(/^(\d+)[.,](\d{1,2})$/);
    if (decimalMatch) {
      const rounded = Math.round(Number(`${decimalMatch[1]}.${decimalMatch[2]}`));
      setRawDigits(rounded > 0 ? String(rounded).slice(0, 10) : '');
    } else {
      setRawDigits(value.replace(/\D/g, '').slice(0, 10));
    }
    if (errorMsg) setErrorMsg('');
  }

  function handleQuickAdd(increment: number) {
    const next = Math.min(parsedAmount + increment, 999999999);
    setRawDigits(String(next));
    if (errorMsg) setErrorMsg('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    if (!parsedAmount || parsedAmount <= 0) {
      setErrorMsg('Ingresa un monto mayor a $ 0 para agregar dinero.');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    try {
      await onSaveIncome({
        amount: parsedAmount,
        description: description.trim() || 'Ingreso adicional',
        date: date || DEFAULT_TODAY_ISO,
      });
      onClose();
    } catch {
      setErrorMsg('No se pudo guardar el ingreso. Intenta nuevamente.');
      setIsSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-income-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
    >
      <div className="w-full max-w-md bg-gradient-to-br from-[#1b1d22] via-[#131418] to-[#181a20] border border-white/[0.14] shadow-2xl rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
          <div>
            <h2 id="add-income-title" className="font-display text-lg font-medium text-zinc-50">
              {isEditing ? 'Editar ingreso' : 'Agregar dinero a Tu billetera'}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Suma pagos o ingresos que recibas durante el mes.
            </p>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            aria-label="Cerrar ventana de ingreso"
            className="text-zinc-400 hover:text-zinc-100 disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label
              htmlFor="income-amount"
              className="block text-[13px] font-medium text-zinc-200"
            >
              Monto recibido en pesos (COP)
            </label>
            <div className="mt-2 relative flex items-center">
              <span
                aria-hidden="true"
                className="absolute left-3.5 text-2xl font-semibold text-zinc-400 select-none"
              >
                $
              </span>
              <input
                id="income-amount"
                type="text"
                inputMode="numeric"
                autoFocus
                disabled={isSaving}
                value={formatGroupedDigits(rawDigits)}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-xl py-3 pl-9 pr-14 text-2xl sm:text-3xl font-semibold text-zinc-50 placeholder:text-zinc-700 tabular-nums focus:outline-none transition-colors"
              />
              <span className="absolute right-3.5 text-xs font-mono text-zinc-500 select-none">
                COP
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {QUICK_ADD_INCOMES.map((val) => (
                <button
                  key={val}
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleQuickAdd(val)}
                  className="px-2.5 py-1 text-xs font-medium tabular-nums rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 transition-colors cursor-pointer"
                >
                  +{formatCurrency(val)}
                </button>
              ))}
              {parsedAmount > 0 && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setRawDigits('')}
                  className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-200 cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-7">
              <label
                htmlFor="income-description"
                className="block text-[13px] font-medium text-zinc-200"
              >
                Descripción
              </label>
              <input
                id="income-description"
                type="text"
                maxLength={80}
                disabled={isSaving}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. Pago cliente, diseño web..."
                className="mt-1.5 w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-5">
              <label
                htmlFor="income-date"
                className="block text-[13px] font-medium text-zinc-200"
              >
                Fecha
              </label>
              <input
                id="income-date"
                type="date"
                disabled={isSaving}
                value={date}
                min="2026-11-01"
                max="2026-11-30"
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3 py-2 text-sm text-zinc-100 tabular-nums focus:outline-none [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="rounded-lg bg-[#090a0d] border border-white/[0.08] p-3.5 space-y-2 text-xs tabular-nums">
            <div className="flex items-center justify-between text-zinc-400">
              <span>Saldo disponible actual</span>
              <span className="text-zinc-200">{formatCurrency(baseAvailable)}</span>
            </div>
            <div className="flex items-center justify-between text-zinc-400">
              <span>Dinero que sumas</span>
              <span className="text-[#10d47e]">
                {parsedAmount > 0 ? `+${formatCurrency(parsedAmount)}` : '$ 0'}
              </span>
            </div>
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between font-medium">
              <span className="text-zinc-200">Nuevo saldo disponible</span>
              <span
                className={`text-sm font-semibold ${
                  projectedBalance < 0 ? 'text-red-400' : 'text-[#10d47e]'
                }`}
              >
                {formatCurrency(projectedBalance)}
              </span>
            </div>
          </div>

          {errorMsg && (
            <p role="alert" className="text-xs text-[#e07a73]">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] text-xs font-medium text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 px-4 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] disabled:opacity-60 text-[#042415] text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
              <span>
                {isSaving
                  ? 'Guardando...'
                  : isEditing
                    ? 'Guardar cambios'
                    : 'Agregar dinero'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
