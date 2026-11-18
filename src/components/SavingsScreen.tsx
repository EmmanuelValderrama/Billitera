import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  DEFAULT_TODAY_ISO,
  SavingsEntry,
  SavingsEntryType,
  SavingsGoal,
  formatCurrency,
  formatPercent,
  formatShortDate,
} from '../data/walletData';

interface SavingsScreenProps {
  goals: SavingsGoal[];
  entries: SavingsEntry[];
  onCreateGoalWithOptionalDeposit: (input: {
    name: string;
    targetAmount?: number;
    initialEntry?: {
      amount: number;
      description: string;
      date: string;
    };
  }) => Promise<string>;
  onUpdateGoal: (goalId: string, input: { name: string; targetAmount?: number }) => Promise<void>;
  onAddEntry: (input: {
    goalId: string;
    goalName: string;
    type: SavingsEntryType;
    amount: number;
    description: string;
    date: string;
  }) => Promise<string>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
}

const QUICK_SAVING_AMOUNTS = [50000, 100000, 200000, 500000];

function formatGroupedDigits(digits: string): string {
  if (!digits) return '';
  const num = Math.round(Number(digits));
  if (!Number.isFinite(num) || num <= 0) return '';
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(num);
}

function parseAmountInput(value: string): string {
  const trimmed = value.trim();
  const decimalMatch = trimmed.match(/^(\d+)[.,](\d{1,2})$/);
  if (decimalMatch) {
    const rounded = Math.round(Number(`${decimalMatch[1]}.${decimalMatch[2]}`));
    return rounded > 0 ? String(rounded).slice(0, 10) : '';
  }
  return value.replace(/\D/g, '').slice(0, 10);
}

export function SavingsScreen({
  goals,
  entries,
  onCreateGoalWithOptionalDeposit,
  onUpdateGoal,
  onAddEntry,
  onDeleteEntry,
  onDeleteGoal,
}: SavingsScreenProps) {
  // Modal de movimiento / nueva alcancía
  const [modalMode, setModalMode] = useState<'deposit' | 'withdraw' | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string>('__new__');
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTargetDigits, setNewGoalTargetDigits] = useState('');
  const [amountDigits, setAmountDigits] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(DEFAULT_TODAY_ISO);
  const [modalError, setModalError] = useState('');
  const [isSavingModal, setIsSavingModal] = useState(false);

  // Edición inline de meta
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editGoalName, setEditGoalName] = useState('');
  const [editGoalTargetDigits, setEditGoalTargetDigits] = useState('');
  const [isUpdatingGoal, setIsUpdatingGoal] = useState(false);

  // Confirmaciones de eliminación sin window.confirm
  const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const balancesByGoal = useMemo(() => {
    const map = new Map<string, number>();
    for (const goal of goals) {
      map.set(goal.id, 0);
    }
    for (const entry of entries) {
      const current = map.get(entry.goalId) ?? 0;
      const delta = entry.type === 'withdraw' ? -entry.amount : entry.amount;
      map.set(entry.goalId, current + delta);
    }
    return map;
  }, [goals, entries]);

  const totalSaved = useMemo(() => {
    let sum = 0;
    for (const val of balancesByGoal.values()) {
      sum += val;
    }
    return Math.max(sum, 0);
  }, [balancesByGoal]);

  function openDepositModal(goalId?: string) {
    setModalMode('deposit');
    setSelectedGoalId(goalId ?? (goals.length > 0 ? goals[0].id : '__new__'));
    setNewGoalName('');
    setNewGoalTargetDigits('');
    setAmountDigits('');
    setDescription('');
    setDate(DEFAULT_TODAY_ISO);
    setModalError('');
    setIsSavingModal(false);
  }

  function openWithdrawModal(goalId: string) {
    setModalMode('withdraw');
    setSelectedGoalId(goalId);
    setAmountDigits('');
    setDescription('');
    setDate(DEFAULT_TODAY_ISO);
    setModalError('');
    setIsSavingModal(false);
  }

  function closeModal() {
    if (isSavingModal) return;
    setModalMode(null);
    setModalError('');
  }

  async function handleModalSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSavingModal || !modalMode) return;

    const amount = amountDigits ? Math.round(Number(amountDigits)) : 0;
    const isCreatingGoal = modalMode === 'deposit' && selectedGoalId === '__new__';

    if (isCreatingGoal) {
      const cleanName = newGoalName.trim();
      if (!cleanName) {
        setModalError('Escribe un nombre para tu alcancía o meta de ahorro.');
        return;
      }
      const targetAmount = newGoalTargetDigits ? Math.round(Number(newGoalTargetDigits)) : 0;

      setIsSavingModal(true);
      setModalError('');
      try {
        await onCreateGoalWithOptionalDeposit({
          name: cleanName,
          ...(targetAmount > 0 ? { targetAmount } : {}),
          ...(amount > 0
            ? {
                initialEntry: {
                  amount,
                  description: description.trim() || 'Aporte inicial',
                  date: date || DEFAULT_TODAY_ISO,
                },
              }
            : {}),
        });
        setModalMode(null);
      } catch {
        setModalError('No se pudo guardar tu ahorro. Intenta de nuevo.');
        setIsSavingModal(false);
      }
      return;
    }

    const goal = goals.find((g) => g.id === selectedGoalId);
    if (!goal) {
      setModalError('Selecciona una alcancía válida.');
      return;
    }

    if (!amount || amount <= 0) {
      setModalError('Ingresa un monto mayor a $ 0.');
      return;
    }

    if (modalMode === 'withdraw') {
      const currentSaved = Math.max(balancesByGoal.get(goal.id) ?? 0, 0);
      if (amount > currentSaved) {
        setModalError(
          `Solo tienes ${formatCurrency(currentSaved)} ahorrados en "${goal.name}".`
        );
        return;
      }
    }

    setIsSavingModal(true);
    setModalError('');
    try {
      await onAddEntry({
        goalId: goal.id,
        goalName: goal.name,
        type: modalMode,
        amount,
        description:
          description.trim() ||
          (modalMode === 'withdraw' ? 'Retiro de ahorros' : 'Aporte a ahorros'),
        date: date || DEFAULT_TODAY_ISO,
      });
      setModalMode(null);
    } catch {
      setModalError('No se pudo registrar el movimiento de ahorro.');
      setIsSavingModal(false);
    }
  }

  function startEditGoal(goal: SavingsGoal) {
    setEditingGoalId(goal.id);
    setEditGoalName(goal.name);
    setEditGoalTargetDigits(goal.targetAmount ? String(Math.round(goal.targetAmount)) : '');
    setConfirmDeleteGoalId(null);
  }

  async function handleSaveEditGoal(e: FormEvent, goalId: string) {
    e.preventDefault();
    if (isUpdatingGoal) return;
    const cleanName = editGoalName.trim();
    if (!cleanName) return;

    const targetAmount = editGoalTargetDigits ? Math.round(Number(editGoalTargetDigits)) : 0;
    setIsUpdatingGoal(true);
    try {
      await onUpdateGoal(goalId, {
        name: cleanName,
        ...(targetAmount > 0 ? { targetAmount } : {}),
      });
      setEditingGoalId(null);
    } finally {
      setIsUpdatingGoal(false);
    }
  }

  async function handleConfirmDeleteGoal(goalId: string) {
    if (deletingGoalId) return;
    setDeletingGoalId(goalId);
    try {
      await onDeleteGoal(goalId);
      setConfirmDeleteGoalId(null);
    } finally {
      setDeletingGoalId(null);
    }
  }

  async function handleConfirmDeleteEntry(entryId: string) {
    if (deletingEntryId) return;
    setDeletingEntryId(entryId);
    try {
      await onDeleteEntry(entryId);
      setConfirmDeleteEntryId(null);
    } finally {
      setDeletingEntryId(null);
    }
  }

  const modalTargetGoal = goals.find((g) => g.id === selectedGoalId) ?? null;
  const modalTargetSaved = modalTargetGoal
    ? Math.max(balancesByGoal.get(modalTargetGoal.id) ?? 0, 0)
    : 0;
  const parsedModalAmount = amountDigits ? Math.round(Number(amountDigits)) : 0;

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-[34px] font-medium text-zinc-50 tracking-tight">
            Ahorros
          </h1>
          <p className="mt-1.5 text-sm text-zinc-400 tabular-nums">
            Espacio independiente de tus gastos mensuales · Total ahorrado:{' '}
            <strong className="text-[#10d47e] font-semibold">
              {formatCurrency(totalSaved)}
            </strong>
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {goals.length > 0 && (
            <button
              type="button"
              onClick={() => openDepositModal('__new__')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-xs sm:text-sm font-medium text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span>Nueva alcancía</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => openDepositModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] text-[#042415] text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            <Plus className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
            <span>{goals.length === 0 ? 'Agregar primer ahorro' : 'Agregar ahorro'}</span>
          </button>
        </div>
      </div>

      {goals.length === 0 ? (
        <section
          aria-label="Ahorros vacío"
          className="bg-gradient-to-br from-[#1b1d22]/95 via-[#131418]/95 to-[#181a20]/95 border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] rounded-xl px-6 py-16 sm:py-20 text-center"
        >
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-400/[0.12] border border-emerald-400/35 flex items-center justify-center mx-auto">
              <PiggyBank className="w-6 h-6 text-[#10d47e]" aria-hidden="true" />
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-medium text-zinc-50 tracking-tight text-balance">
              Empieza tu espacio de ahorros
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Separa dinero poco a poco en alcancías o metas sin mezclarlo con tus gastos diarios
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => openDepositModal('__new__')}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] text-[#042415] text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                <Plus className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
                <span>Agregar primer ahorro</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Resumen general */}
          <section
            aria-label="Resumen total de ahorros"
            className="bg-gradient-to-br from-[#1b1d22]/95 via-[#131418]/95 to-[#181a20]/95 border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] rounded-xl p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <p className="text-xs font-medium text-zinc-400">Total guardado en tus alcancías</p>
              <p className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-[#10d47e] tabular-nums">
                {formatCurrency(totalSaved)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-400 tabular-nums">
              <div>
                <p>Alcancías activas</p>
                <p className="mt-1 text-base font-semibold text-zinc-100">{goals.length}</p>
              </div>
              <div>
                <p>Movimientos de ahorro</p>
                <p className="mt-1 text-base font-semibold text-zinc-100">{entries.length}</p>
              </div>
            </div>
          </section>

          {/* Cuadrícula de alcancías / metas */}
          <section aria-label="Alcancías y metas de ahorro" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {goals.map((goal) => {
              const saved = Math.max(balancesByGoal.get(goal.id) ?? 0, 0);
              const hasTarget = Boolean(goal.targetAmount && goal.targetAmount > 0);
              const rawProgress = hasTarget
                ? Math.min((saved / (goal.targetAmount ?? 1)) * 100, 100)
                : 0;
              const remaining = hasTarget
                ? Math.max((goal.targetAmount ?? 0) - saved, 0)
                : 0;
              const isEditingThis = editingGoalId === goal.id;
              const isConfirmingDelete = confirmDeleteGoalId === goal.id;

              return (
                <article
                  key={goal.id}
                  className="bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-5 sm:p-6 flex flex-col justify-between gap-5"
                >
                  {isEditingThis ? (
                    <form
                      onSubmit={(e) => handleSaveEditGoal(e, goal.id)}
                      className="space-y-3"
                    >
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400">
                          Nombre de la alcancía
                        </label>
                        <input
                          type="text"
                          maxLength={40}
                          autoFocus
                          disabled={isUpdatingGoal}
                          value={editGoalName}
                          onChange={(e) => setEditGoalName(e.target.value)}
                          className="mt-1 w-full bg-[#090a0d] border border-emerald-400/60 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400">
                          Meta opcional (COP)
                        </label>
                        <div className="mt-1 relative flex items-center">
                          <span className="absolute left-3 text-xs text-zinc-400">$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={isUpdatingGoal}
                            value={formatGroupedDigits(editGoalTargetDigits)}
                            onChange={(e) =>
                              setEditGoalTargetDigits(parseAmountInput(e.target.value))
                            }
                            placeholder="Sin meta"
                            className="w-full bg-[#090a0d] border border-white/[0.12] rounded-lg py-2 pl-6 pr-3 text-sm text-zinc-100 tabular-nums focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={isUpdatingGoal || !editGoalName.trim()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#10d47e] hover:bg-[#19e28a] disabled:opacity-60 text-[#042415] text-xs font-semibold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isUpdatingGoal ? 'Guardando...' : 'Guardar'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isUpdatingGoal}
                          onClick={() => setEditingGoalId(null)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Cancelar</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <PiggyBank
                              className="w-4 h-4 text-[#10d47e] shrink-0"
                              aria-hidden="true"
                            />
                            <h2 className="font-display text-lg font-medium text-zinc-50 truncate">
                              {goal.name}
                            </h2>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditGoal(goal)}
                              aria-label={`Editar ${goal.name}`}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDeleteGoalId(isConfirmingDelete ? null : goal.id)
                              }
                              aria-label={`Eliminar ${goal.name}`}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-[#e07a73] hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <p className="text-2xl font-semibold tracking-tight text-zinc-50 tabular-nums">
                            {formatCurrency(saved)}
                          </p>
                          {hasTarget ? (
                            <p className="mt-1 text-xs text-zinc-400 tabular-nums">
                              Meta: {formatCurrency(goal.targetAmount ?? 0)} ·{' '}
                              {remaining === 0
                                ? '¡Meta cumplida!'
                                : `Faltan ${formatCurrency(remaining)}`}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-zinc-500">Alcancía sin límite definido</p>
                          )}
                        </div>

                        {hasTarget && (
                          <div className="space-y-1.5">
                            <div
                              className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden"
                              role="progressbar"
                              aria-valuenow={Math.round(rawProgress)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`Progreso de ${goal.name}`}
                            >
                              <div
                                className="h-full bg-[#10d47e] rounded-full transition-all duration-300"
                                style={{ width: `${rawProgress}%` }}
                              />
                            </div>
                            <p className="text-[11px] font-mono text-zinc-400 tabular-nums text-right">
                              {formatPercent(rawProgress)}
                            </p>
                          </div>
                        )}
                      </div>

                      {isConfirmingDelete ? (
                        <div className="rounded-lg bg-[#e07a73]/10 border border-[#e07a73]/30 p-3 space-y-2">
                          <p className="text-xs text-zinc-200">
                            ¿Eliminar esta alcancía y su historial?
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={deletingGoalId === goal.id}
                              onClick={() => handleConfirmDeleteGoal(goal.id)}
                              className="px-2.5 py-1 rounded-md bg-[#e07a73] hover:bg-[#ea8d87] text-[#1f0908] text-xs font-semibold cursor-pointer disabled:opacity-60"
                            >
                              {deletingGoalId === goal.id ? 'Eliminando...' : 'Sí, eliminar'}
                            </button>
                            <button
                              type="button"
                              disabled={deletingGoalId === goal.id}
                              onClick={() => setConfirmDeleteGoalId(null)}
                              className="px-2.5 py-1 rounded-md bg-white/[0.06] text-zinc-300 text-xs cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                          <button
                            type="button"
                            onClick={() => openDepositModal(goal.id)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-400/[0.12] hover:bg-emerald-400/[0.2] border border-emerald-400/35 text-xs font-semibold text-emerald-300 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Aportar</span>
                          </button>
                          <button
                            type="button"
                            disabled={saved <= 0}
                            onClick={() => openWithdrawModal(goal.id)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-35 border border-white/[0.1] text-xs font-medium text-zinc-200 transition-colors cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Retirar</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </section>

          {/* Historial de movimientos de ahorro */}
          <section
            aria-label="Historial de ahorros"
            className="bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-6 sm:p-7 space-y-4"
          >
            <div className="flex items-baseline justify-between gap-4 pb-3 border-b border-white/[0.08]">
              <h2 className="font-display text-xl font-medium text-zinc-50">
                Historial de ahorros
              </h2>
              <span className="text-xs text-zinc-400 tabular-nums">
                {entries.length} {entries.length === 1 ? 'movimiento' : 'movimientos'}
              </span>
            </div>

            {entries.length === 0 ? (
              <p className="text-sm text-zinc-400 py-4">
                Aún no has registrado aportes en tus alcancías. Usa <strong>+ Aportar</strong> para
                empezar a sumar.
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {entries.map((entry) => {
                  const isWithdraw = entry.type === 'withdraw';
                  const isConfirming = confirmDeleteEntryId === entry.id;
                  return (
                    <li
                      key={entry.id}
                      className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isWithdraw
                              ? 'bg-[#e07a73]/15 text-[#e07a73]'
                              : 'bg-emerald-400/[0.12] text-[#10d47e]'
                          }`}
                        >
                          {isWithdraw ? (
                            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowDownLeft className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-100 truncate">
                            {entry.description}
                          </p>
                          <p className="text-xs text-zinc-400 tabular-nums">
                            {entry.goalName} · {formatShortDate(entry.date)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
                            isWithdraw ? 'text-[#e07a73]' : 'text-[#10d47e]'
                          }`}
                        >
                          {isWithdraw ? '−' : '+'}
                          {formatCurrency(entry.amount)}
                        </span>

                        {isConfirming ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={deletingEntryId === entry.id}
                              onClick={() => handleConfirmDeleteEntry(entry.id)}
                              className="px-2 py-1 rounded bg-[#e07a73] text-[#1f0908] text-[11px] font-semibold cursor-pointer"
                            >
                              {deletingEntryId === entry.id ? '...' : 'Eliminar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteEntryId(null)}
                              className="px-2 py-1 rounded bg-white/[0.06] text-zinc-300 text-[11px] cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteEntryId(entry.id)}
                            aria-label="Eliminar movimiento de ahorro"
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-[#e07a73] hover:bg-white/[0.05] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Modal para crear alcancía, aportar o retirar */}
      {modalMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="savings-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
        >
          <div className="w-full max-w-md bg-gradient-to-br from-[#1b1d22] via-[#131418] to-[#181a20] border border-white/[0.14] shadow-2xl rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
              <div>
                <h2 id="savings-modal-title" className="font-display text-lg font-medium text-zinc-50">
                  {modalMode === 'withdraw'
                    ? 'Retirar de ahorros'
                    : selectedGoalId === '__new__'
                      ? 'Nueva alcancía de ahorro'
                      : 'Agregar ahorro'}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {modalMode === 'withdraw'
                    ? 'Registra un retiro desde una de tus alcancías.'
                    : 'Guarda dinero aparte para tus metas o fondo de emergencia.'}
                </p>
              </div>
              <button
                type="button"
                disabled={isSavingModal}
                onClick={closeModal}
                aria-label="Cerrar ventana"
                className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="p-6 space-y-4">
              {modalMode === 'deposit' && (
                <div>
                  <label
                    htmlFor="savings-goal-select"
                    className="block text-[13px] font-medium text-zinc-200"
                  >
                    Alcancía o meta
                  </label>
                  <select
                    id="savings-goal-select"
                    disabled={isSavingModal}
                    value={selectedGoalId}
                    onChange={(e) => {
                      setSelectedGoalId(e.target.value);
                      if (modalError) setModalError('');
                    }}
                    className="mt-1.5 w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none"
                  >
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({formatCurrency(Math.max(balancesByGoal.get(g.id) ?? 0, 0))})
                      </option>
                    ))}
                    <option value="__new__">+ Crear nueva alcancía</option>
                  </select>
                </div>
              )}

              {modalMode === 'deposit' && selectedGoalId === '__new__' && (
                <div className="rounded-lg bg-[#0b0c10] border border-white/[0.08] p-4 space-y-3">
                  <div>
                    <label
                      htmlFor="new-goal-name"
                      className="block text-xs font-medium text-zinc-300"
                    >
                      Nombre de la alcancía *
                    </label>
                    <input
                      id="new-goal-name"
                      type="text"
                      maxLength={40}
                      autoFocus
                      disabled={isSavingModal}
                      value={newGoalName}
                      onChange={(e) => {
                        setNewGoalName(e.target.value);
                        if (modalError) setModalError('');
                      }}
                      placeholder="Ej. Fondo de emergencia, Viaje, Impuestos..."
                      className="mt-1 w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="new-goal-target"
                      className="block text-xs font-medium text-zinc-300"
                    >
                      Meta objetivo (opcional, COP)
                    </label>
                    <div className="mt-1 relative flex items-center">
                      <span className="absolute left-3 text-sm text-zinc-400">$</span>
                      <input
                        id="new-goal-target"
                        type="text"
                        inputMode="numeric"
                        disabled={isSavingModal}
                        value={formatGroupedDigits(newGoalTargetDigits)}
                        onChange={(e) => setNewGoalTargetDigits(parseAmountInput(e.target.value))}
                        placeholder="Opcional"
                        className="w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg py-2 pl-7 pr-3 text-sm text-zinc-100 tabular-nums focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="savings-amount"
                  className="block text-[13px] font-medium text-zinc-200"
                >
                  {selectedGoalId === '__new__'
                    ? 'Aporte inicial (opcional, COP)'
                    : modalMode === 'withdraw'
                      ? 'Monto a retirar (COP)'
                      : 'Monto a aportar (COP)'}
                </label>
                <div className="mt-1.5 relative flex items-center">
                  <span
                    aria-hidden="true"
                    className="absolute left-3.5 text-xl font-semibold text-zinc-400 select-none"
                  >
                    $
                  </span>
                  <input
                    id="savings-amount"
                    type="text"
                    inputMode="numeric"
                    disabled={isSavingModal}
                    value={formatGroupedDigits(amountDigits)}
                    onChange={(e) => {
                      setAmountDigits(parseAmountInput(e.target.value));
                      if (modalError) setModalError('');
                    }}
                    placeholder="0"
                    className="w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-xl py-3 pl-9 pr-14 text-2xl font-semibold text-zinc-50 placeholder:text-zinc-700 tabular-nums focus:outline-none"
                  />
                  <span className="absolute right-3.5 text-xs font-mono text-zinc-500">COP</span>
                </div>

                {modalMode === 'deposit' && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {QUICK_SAVING_AMOUNTS.map((val) => (
                      <button
                        key={val}
                        type="button"
                        disabled={isSavingModal}
                        onClick={() => {
                          setAmountDigits(String(Math.min(parsedModalAmount + val, 999999999)));
                          if (modalError) setModalError('');
                        }}
                        className="px-2.5 py-1 text-xs font-medium tabular-nums rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 cursor-pointer"
                      >
                        +{formatCurrency(val)}
                      </button>
                    ))}
                  </div>
                )}

                {modalMode === 'withdraw' && modalTargetGoal && (
                  <p className="mt-1.5 text-xs text-zinc-400 tabular-nums">
                    Disponible en {modalTargetGoal.name}: {formatCurrency(modalTargetSaved)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-7">
                  <label
                    htmlFor="savings-description"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Nota o descripción
                  </label>
                  <input
                    id="savings-description"
                    type="text"
                    maxLength={80}
                    disabled={isSavingModal}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      modalMode === 'withdraw'
                        ? 'Ej. Uso para imprevisto...'
                        : 'Ej. Reserva del mes...'
                    }
                    className="mt-1 w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label
                    htmlFor="savings-date"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Fecha
                  </label>
                  <input
                    id="savings-date"
                    type="date"
                    disabled={isSavingModal}
                    value={date}
                    min="2026-11-01"
                    max="2026-11-30"
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3 py-2 text-sm text-zinc-100 tabular-nums focus:outline-none [color-scheme:dark]"
                  />
                </div>
              </div>

              {modalError && (
                <p role="alert" className="text-xs text-[#e07a73]">
                  {modalError}
                </p>
              )}

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={isSavingModal}
                  onClick={closeModal}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] text-xs font-medium text-zinc-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingModal}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60 ${
                    modalMode === 'withdraw'
                      ? 'bg-[#e07a73] hover:bg-[#ea8d87] text-[#1f0908]'
                      : 'bg-[#10d47e] hover:bg-[#19e28a] text-[#042415]'
                  }`}
                >
                  {isSavingModal
                    ? 'Guardando...'
                    : modalMode === 'withdraw'
                      ? 'Confirmar retiro'
                      : selectedGoalId === '__new__'
                        ? 'Crear alcancía'
                        : 'Guardar aporte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
