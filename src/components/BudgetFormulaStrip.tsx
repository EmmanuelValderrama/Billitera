import { ArrowUp, Briefcase, Check, Coins, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  BudgetMode,
  IncomeEntry,
  formatCurrency,
  formatPercent,
  formatShortDate,
} from '../data/walletData';

interface BudgetFormulaStripProps {
  budgetMode: BudgetMode;
  baseBudget: number;
  totalIncome: number;
  totalFunds: number;
  activeIncomes: IncomeEntry[];
  totalSpent: number;
  availableBalance: number;
  daysRemaining: number;
  onUpdateBudget: (newBudget: number) => Promise<void>;
  onSwitchBudgetMode: (mode: BudgetMode) => Promise<void>;
  onOpenAddIncome: () => void;
  onRevertIncome: (incomeId: string) => Promise<void>;
  onViewIncomes: () => void;
}

function formatGroupedDigits(digits: string): string {
  if (!digits) return '';
  const num = Math.round(Number(digits));
  if (!Number.isFinite(num) || num <= 0) return '';
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(num);
}

export function BudgetFormulaStrip({
  budgetMode,
  baseBudget,
  totalIncome,
  totalFunds,
  activeIncomes,
  totalSpent,
  availableBalance,
  daysRemaining,
  onUpdateBudget,
  onSwitchBudgetMode,
  onOpenAddIncome,
  onRevertIncome,
  onViewIncomes,
}: BudgetFormulaStripProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [budgetDigits, setBudgetDigits] = useState(String(baseBudget || 3600000));
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [isRevertDrawerOpen, setIsRevertDrawerOpen] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const isVariable = budgetMode === 'variable';
  const incomesCount = activeIncomes.length;
  const recentIncomes = activeIncomes.slice(0, 3);

  const rawSpentRatio =
    totalFunds > 0 ? (totalSpent / totalFunds) * 100 : totalSpent > 0 ? 100 : 0;
  const spentPercentage = Math.min(rawSpentRatio, 100);
  const availablePercentage = totalFunds > 0 ? Math.max(100 - rawSpentRatio, 0) : 0;
  const isExceeded = availableBalance < 0;

  const statusText = isExceeded
    ? isVariable && totalFunds === 0
      ? 'Aún sin ingresos registrados'
      : 'Fondos excedidos'
    : availableBalance === 0
      ? isVariable && totalFunds === 0
        ? 'Empieza agregando dinero'
        : 'Disponible agotado'
      : `Dentro del disponible · ${daysRemaining} días restantes`;

  function startEditing() {
    setBudgetDigits(String(Math.round(baseBudget > 0 ? baseBudget : 3600000)));
    setEditError('');
    setIsEditing(true);
    setIsRevertDrawerOpen(false);
  }

  function cancelEditing() {
    if (isSaving) return;
    setIsEditing(false);
    setEditError('');
  }

  function handleBudgetInputChange(value: string) {
    const trimmed = value.trim();
    const decimalMatch = trimmed.match(/^(\d+)[.,](\d{1,2})$/);
    if (decimalMatch) {
      const rounded = Math.round(Number(`${decimalMatch[1]}.${decimalMatch[2]}`));
      setBudgetDigits(rounded > 0 ? String(rounded).slice(0, 10) : '');
    } else {
      setBudgetDigits(value.replace(/\D/g, '').slice(0, 10));
    }
    if (editError) setEditError('');
  }

  async function handleSaveBudget(e: FormEvent) {
    e.preventDefault();
    if (isSaving) return;
    const parsed = budgetDigits ? Math.round(Number(budgetDigits)) : 0;
    if (!parsed || parsed <= 0) {
      setEditError('Ingresa un monto mayor a $ 0');
      return;
    }
    setIsSaving(true);
    setEditError('');
    try {
      await onUpdateBudget(parsed);
      setIsEditing(false);
    } catch {
      setEditError('No se pudo guardar el presupuesto. Intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleMode() {
    if (isSwitchingMode || isSaving) return;
    if (isVariable) {
      startEditing();
      return;
    }
    setIsSwitchingMode(true);
    try {
      await onSwitchBudgetMode('variable');
    } finally {
      setIsSwitchingMode(false);
    }
  }

  async function handleConfirmRevert(incomeId: string) {
    if (revertingId) return;
    setRevertingId(incomeId);
    try {
      await onRevertIncome(incomeId);
      if (activeIncomes.length <= 1) {
        setIsRevertDrawerOpen(false);
      }
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <section
      aria-label="Resumen del presupuesto e ingresos del mes"
      className="bg-gradient-to-br from-[#1b1d22]/95 via-[#131418]/95 to-[#181a20]/95 border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] rounded-xl overflow-hidden backdrop-blur-sm"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08]">
        {/* Métrica 1: Presupuesto del mes o Dinero agregado (Freelancer) */}
        <div className="lg:col-span-4 p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-zinc-300 tracking-[0.01em] flex items-center gap-1.5">
                {isVariable ? (
                  <Briefcase className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                ) : (
                  <Coins className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden="true" />
                )}
                <span>{isVariable ? 'Dinero agregado (Freelancer)' : 'Presupuesto del mes'}</span>
              </p>

              {!isEditing && !isVariable && (
                <button
                  type="button"
                  onClick={startEditing}
                  aria-label="Editar presupuesto del mes"
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded"
                >
                  <Pencil className="w-3 h-3" aria-hidden="true" />
                  <span>Editar</span>
                </button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveBudget} className="mt-3 space-y-2.5">
                <div className="relative flex items-center">
                  <span
                    aria-hidden="true"
                    className="absolute left-3 text-lg font-semibold text-zinc-400 select-none"
                  >
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    aria-label="Nuevo presupuesto mensual fijo en pesos colombianos"
                    value={formatGroupedDigits(budgetDigits)}
                    onChange={(e) => handleBudgetInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEditing();
                      }
                    }}
                    placeholder="0"
                    className="w-full bg-[#090a0d] border border-emerald-400/60 rounded-lg py-2 pl-7 pr-3 text-xl font-semibold text-zinc-50 tabular-nums focus:outline-none"
                  />
                </div>

                {editError && (
                  <p role="alert" className="text-[11px] text-[#e07a73]">
                    {editError}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#10d47e] hover:bg-[#19e28a] disabled:opacity-60 text-[#042415] text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={cancelEditing}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-60 text-zinc-300 text-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Cancelar</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3 space-y-1.5">
                <p
                  onClick={!isVariable ? startEditing : undefined}
                  title={!isVariable ? 'Haz clic para editar el presupuesto base' : undefined}
                  className={`text-2xl sm:text-[26px] xl:text-[28px] font-semibold tracking-tight text-zinc-50 tabular-nums leading-none whitespace-nowrap ${
                    !isVariable ? 'hover:text-emerald-300 transition-colors cursor-pointer' : ''
                  }`}
                >
                  {formatCurrency(totalFunds)}
                </p>

                {!isVariable && totalIncome > 0 && (
                  <p className="text-[11px] text-zinc-400 tabular-nums">
                    Base {formatCurrency(baseBudget)} + {formatCurrency(totalIncome)} agregados
                  </p>
                )}

                {isVariable && (
                  <p className="text-[11px] text-zinc-400 tabular-nums">
                    {incomesCount === 0
                      ? 'Sin ingresos registrados todavía'
                      : `${incomesCount} ${incomesCount === 1 ? 'ingreso registrado' : 'ingresos registrados'}`}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 pt-3.5 border-t border-white/[0.06] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenAddIncome}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/[0.12] hover:bg-emerald-400/[0.2] border border-emerald-400/35 text-xs font-semibold text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.2} aria-hidden="true" />
                  <span>Agregar dinero</span>
                </button>

                {incomesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsRevertDrawerOpen((prev) => !prev)}
                    aria-expanded={isRevertDrawerOpen}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      isRevertDrawerOpen
                        ? 'bg-[#e07a73]/15 border-[#e07a73]/45 text-[#e07a73]'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.1] text-zinc-300'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    <span>Revertir</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                {incomesCount > 0 && (
                  <button
                    type="button"
                    onClick={onViewIncomes}
                    className="text-zinc-300 hover:text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Ver ({incomesCount})
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSwitchingMode || isSaving}
                  onClick={handleToggleMode}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {isSwitchingMode
                    ? 'Cambiando...'
                    : isVariable
                      ? 'Cambiar a fijo'
                      : 'Modo freelancer'}
                </button>
              </div>
            </div>

            {isRevertDrawerOpen && recentIncomes.length > 0 && (
              <div
                role="region"
                aria-label="Revertir dinero agregado por error"
                className="rounded-lg bg-[#090a0d] border border-[#e07a73]/30 p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-zinc-200">
                    ¿Te equivocaste al agregar dinero? Elige cuál revertir:
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsRevertDrawerOpen(false)}
                    aria-label="Cerrar panel de reversión"
                    className="text-zinc-500 hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                <ul className="space-y-1.5">
                  {recentIncomes.map((inc) => (
                    <li
                      key={inc.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="text-zinc-100 font-medium truncate">{inc.description}</p>
                        <p className="text-[11px] text-zinc-400 tabular-nums">
                          +{formatCurrency(inc.amount)} · {formatShortDate(inc.date)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={revertingId === inc.id}
                        onClick={() => handleConfirmRevert(inc.id)}
                        className="px-2.5 py-1 rounded bg-[#e07a73] hover:bg-[#ea8d87] disabled:opacity-60 text-[#1f0908] text-[11px] font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        {revertingId === inc.id ? 'Revirtiendo...' : 'Revertir'}
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                  <span>La reversión también aparecerá en Movimientos.</span>
                  {activeIncomes.length > 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsRevertDrawerOpen(false);
                        onViewIncomes();
                      }}
                      className="text-emerald-400 hover:text-emerald-300 cursor-pointer whitespace-nowrap ml-2"
                    >
                      Ver todos
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Métrica 2: Gastado sobre disponible */}
        <div className="lg:col-span-4 p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[13px] font-medium text-zinc-300 tracking-[0.01em]">
                Gastado sobre disponible
              </p>
              <span className="text-xs font-mono text-zinc-400 tabular-nums whitespace-nowrap">
                {totalFunds === 0 && totalSpent > 0
                  ? 'Sin fondos'
                  : `${formatPercent(rawSpentRatio)} consumido`}
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2.5 flex-wrap">
              <span className="text-2xl sm:text-[26px] xl:text-[28px] font-semibold tracking-tight text-zinc-50 tabular-nums leading-none whitespace-nowrap">
                {formatCurrency(totalSpent)}
              </span>
              <span className="text-sm text-zinc-400 tabular-nums whitespace-nowrap">
                de {formatCurrency(totalFunds)}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <div
              className="w-full h-2 bg-[#2b2321] rounded-full overflow-hidden flex"
              role="progressbar"
              aria-valuenow={Math.round(spentPercentage)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Proporción de fondos gastados sobre disponibles"
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isExceeded
                    ? 'bg-red-500'
                    : 'bg-gradient-to-r from-[#2dd4bf] via-[#84cc16] to-[#d97757]'
                }`}
                style={{ width: `${spentPercentage}%` }}
              />
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 tabular-nums">
              <span>Gastado: {formatCurrency(totalSpent)}</span>
              <span>
                Disponible: {formatCurrency(Math.max(availableBalance, 0))} (
                {formatPercent(availablePercentage)})
              </span>
            </div>
          </div>
        </div>

        {/* Métrica 3 (Foco principal): Saldo disponible */}
        <div className="lg:col-span-4 p-6 sm:p-7 flex flex-col justify-between bg-white/[0.02]">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-medium text-zinc-200 tracking-[0.01em]">
                Saldo disponible
              </p>
              <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap">
                {isVariable ? 'Ingresos − Gastos' : 'Presupuesto − Gastos'}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <p
                className={`text-3xl sm:text-[32px] xl:text-[34px] font-semibold tracking-tight tabular-nums leading-none whitespace-nowrap ${
                  isExceeded ? 'text-red-400' : 'text-[#10d47e]'
                }`}
              >
                {formatCurrency(availableBalance)}
              </p>
              {!isExceeded && availableBalance > 0 && (
                <ArrowUp
                  className="w-5 h-5 text-[#10d47e] shrink-0"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-2 text-xs">
            <span className={isExceeded ? 'text-red-400 font-medium' : 'text-[#10d47e]/90 font-medium'}>
              {statusText}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
