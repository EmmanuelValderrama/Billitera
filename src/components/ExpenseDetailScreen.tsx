import { ArrowLeft, Bus, CreditCard, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Expense,
  formatCurrency,
  formatFullDate,
  formatPercent,
  formatShortDate,
  getExpenseTotalAmount,
} from '../data/walletData';

interface ExpenseDetailScreenProps {
  expense: Expense | null;
  monthlyBudget: number;
  totalMonthSpent: number;
  sameDayTotal: number;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => Promise<void>;
  onBackToMovements: () => void;
  onBackToDashboard: () => void;
}

export function ExpenseDetailScreen({
  expense,
  monthlyBudget,
  totalMonthSpent,
  sameDayTotal,
  onEditExpense,
  onDeleteExpense,
  onBackToMovements,
  onBackToDashboard,
}: ExpenseDetailScreenProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    setConfirmingDelete(false);
    setIsDeleting(false);
    setDeleteError('');
  }, [expense?.id]);

  if (!expense) {
    return (
      <section
        aria-label="Detalle vacío"
        className="bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl px-6 py-20 sm:py-24 text-center"
      >
        <p className="text-sm text-zinc-400">
          Selecciona un gasto en Movimientos para ver el detalle
        </p>
      </section>
    );
  }

  const totalAmount = getExpenseTotalAmount(expense);
  const budgetShare = monthlyBudget > 0 ? (totalAmount / monthlyBudget) * 100 : 0;
  const spentShare = totalMonthSpent > 0 ? (totalAmount / totalMonthSpent) * 100 : 0;
  const isTransport = expense.category === 'Transporte';
  const isInstallments = expense.paymentType === 'installments';

  async function handleConfirmDelete() {
    if (!expense || isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await onDeleteExpense(expense.id);
    } catch {
      setDeleteError('No se pudo eliminar el gasto. Intenta nuevamente.');
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBackToMovements}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Volver a Movimientos</span>
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => onEditExpense(expense)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-zinc-200 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Editar</span>
          </button>

          {!confirmingDelete && (
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setConfirmingDelete(true);
                setDeleteError('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#e07a73]/[0.08] hover:bg-[#e07a73]/[0.16] border border-[#e07a73]/30 text-xs font-medium text-[#e07a73] transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e07a73]/50"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Eliminar</span>
            </button>
          )}

          <button
            type="button"
            onClick={onBackToDashboard}
            className="text-xs font-medium text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded"
          >
            Ir al Dashboard
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <div
          role="region"
          aria-label="Confirmar eliminación de gasto"
          className="bg-[#e07a73]/[0.08] border border-[#e07a73]/35 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-100">
              ¿Eliminar este gasto?
            </p>
            <p className="text-xs text-zinc-300">
              Se quitará de tus movimientos y se actualizará el saldo disponible de inmediato.
            </p>
            {deleteError && (
              <p role="alert" className="text-xs text-[#f39e98]">
                {deleteError}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setConfirmingDelete(false);
                setDeleteError('');
              }}
              className="px-3.5 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-medium text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="px-3.5 py-2 rounded-lg bg-[#d9534f] hover:bg-[#e26460] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </div>
      )}

      <section
        aria-label="Detalle del gasto"
        className="bg-gradient-to-br from-[#1b1d22]/95 via-[#131418]/95 to-[#181a20]/95 border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] rounded-xl overflow-hidden"
      >
        {/* Cabecera del gasto */}
        <div className="p-6 sm:p-8 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-zinc-400 tabular-nums">
              Detalle del movimiento · {formatShortDate(expense.date)}
            </p>
            <h1 className="mt-2 font-display text-2xl sm:text-3xl font-medium text-zinc-50 tracking-tight">
              {expense.description}
            </h1>
          </div>

          <div className="sm:text-right">
            <p className="text-xs text-zinc-400">
              {isInstallments ? 'Total pagado (con intereses)' : 'Monto registrado'}
            </p>
            <p className="mt-1 text-3xl sm:text-4xl font-semibold text-[#e07a73] tabular-nums whitespace-nowrap">
              −{formatCurrency(totalAmount)}
            </p>
          </div>
        </div>

        {/* Ficha completa de atributos */}
        <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-white/[0.08]">
          <div>
            <p className="text-xs text-zinc-500">Categoría</p>
            <p className="mt-1.5 text-base font-medium text-zinc-100 flex items-center gap-2">
              <span>{expense.category}</span>
              {isTransport && (
                <Bus className="w-4 h-4 text-zinc-400" strokeWidth={1.75} aria-hidden="true" />
              )}
            </p>
          </div>

          <div>
            <p className="text-xs text-zinc-500">Fecha</p>
            <p className="mt-1.5 text-base font-medium text-zinc-100 tabular-nums">
              {formatFullDate(expense.date)}
            </p>
          </div>

          <div>
            <p className="text-xs text-zinc-500">Forma de pago</p>
            <p className="mt-1.5 text-base font-medium text-zinc-100 tabular-nums">
              {isInstallments
                ? `A plazos · ${expense.installmentMonths ?? 1} ${
                    (expense.installmentMonths ?? 1) === 1 ? 'mes' : 'meses'
                  }`
                : 'De una sola vez'}
            </p>
          </div>

          {isInstallments && (
            <div>
              <p className="text-xs text-zinc-500">Tarjeta utilizada</p>
              <p className="mt-1.5 text-base font-medium text-zinc-100 flex items-center gap-2 tabular-nums">
                <CreditCard className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                <span>{expense.cardLabel ?? 'Tarjeta registrada'}</span>
              </p>
            </div>
          )}

          {isInstallments && (
            <>
              <div>
                <p className="text-xs text-zinc-500">Porcentaje de interés</p>
                <p className="mt-1.5 text-base font-medium text-zinc-100 tabular-nums">
                  {expense.interestRatePercent !== undefined
                    ? expense.interestRatePercent === 0
                      ? '0% mensual (sin intereses)'
                      : `${expense.interestRatePercent}% mensual`
                    : 'No especificado'}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Cuota mensual aproximada</p>
                <p className="mt-1.5 text-base font-medium text-zinc-100 tabular-nums">
                  {formatCurrency(
                    Math.round(totalAmount / Math.max(expense.installmentMonths ?? 1, 1))
                  )}{' '}
                  / mes
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Monto base de la compra</p>
                <p className="mt-1.5 text-base font-medium text-zinc-100 tabular-nums">
                  {formatCurrency(expense.amount)}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Intereses totales</p>
                <p className="mt-1.5 text-base font-medium text-[#e07a73] tabular-nums">
                  {formatCurrency(expense.interestAmount ?? 0)}
                </p>
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <p className="text-xs text-zinc-500">Descripción</p>
            <p className="mt-1.5 text-base text-zinc-200 leading-relaxed">
              {expense.description}
            </p>
          </div>
        </div>

        {/* Contexto frente al presupuesto del mes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] bg-white/[0.015]">
          <div className="p-6">
            <p className="text-xs text-zinc-400">Peso en el presupuesto</p>
            <p className="mt-2 text-xl font-semibold text-zinc-100 tabular-nums">
              {formatPercent(budgetShare)}
            </p>
            <p className="mt-1 text-xs text-zinc-500 tabular-nums">
              Sobre {formatCurrency(monthlyBudget)}
            </p>
          </div>

          <div className="p-6">
            <p className="text-xs text-zinc-400">Peso en lo gastado</p>
            <p className="mt-2 text-xl font-semibold text-zinc-100 tabular-nums">
              {formatPercent(spentShare)}
            </p>
            <p className="mt-1 text-xs text-zinc-500 tabular-nums">
              De {formatCurrency(totalMonthSpent)} acumulados
            </p>
          </div>

          <div className="p-6">
            <p className="text-xs text-zinc-400">Total gastado ese día</p>
            <p className="mt-2 text-xl font-semibold text-zinc-100 tabular-nums">
              {formatCurrency(sameDayTotal)}
            </p>
            <p className="mt-1 text-xs text-zinc-500 tabular-nums">
              El {formatShortDate(expense.date)}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
