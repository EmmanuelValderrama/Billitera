import {
  ArrowDownLeft,
  Bus,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  BudgetMode,
  EXPENSE_CATEGORIES,
  Expense,
  ExpenseCategory,
  IncomeEntry,
  formatCurrency,
  formatFullDate,
  getExpenseTotalAmount,
} from '../data/walletData';

export type MovementsTab = 'all' | 'expenses' | 'incomes';

type UnifiedItem =
  | { kind: 'expense'; date: string; createdAt: number; expense: Expense }
  | { kind: 'income'; date: string; createdAt: number; income: IncomeEntry };

interface MovementsScreenProps {
  expenses: Expense[];
  incomes: IncomeEntry[];
  budgetMode: BudgetMode;
  initialTab?: MovementsTab;
  onSelectExpense: (expenseId: string) => void;
  onOpenNewExpense: () => void;
  onOpenAddIncome: () => void;
  onEditIncome: (income: IncomeEntry) => void;
  onRevertIncome: (incomeId: string) => Promise<void>;
  onRestoreIncome: (incomeId: string) => Promise<void>;
  onDeleteIncome: (incomeId: string) => Promise<void>;
}

export function MovementsScreen({
  expenses,
  incomes,
  budgetMode,
  initialTab = 'all',
  onSelectExpense,
  onOpenNewExpense,
  onOpenAddIncome,
  onEditIncome,
  onRevertIncome,
  onRestoreIncome,
  onDeleteIncome,
}: MovementsScreenProps) {
  const [activeTab, setActiveTab] = useState<MovementsTab>(
    incomes.length > 0 ? initialTab : initialTab === 'incomes' ? 'incomes' : 'expenses'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | 'Todas'>('Todas');
  const [confirmRevertId, setConfirmRevertId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmDeleteIncomeId, setConfirmDeleteIncomeId] = useState<string | null>(null);
  const [deletingIncomeId, setDeletingIncomeId] = useState<string | null>(null);

  useEffect(() => {
    if (incomes.length === 0 && initialTab === 'all') {
      setActiveTab('expenses');
    } else {
      setActiveTab(initialTab);
    }
  }, [initialTab, incomes.length]);

  const activeIncomes = useMemo(
    () => incomes.filter((inc) => inc.status !== 'reverted'),
    [incomes]
  );

  const filteredExpenses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return expenses.filter((item) => {
      const matchesCategory =
        selectedCategory === 'Todas' || item.category === selectedCategory;
      const matchesQuery =
        query === '' ||
        item.description.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        (item.cardLabel?.toLowerCase().includes(query) ?? false);
      return matchesCategory && matchesQuery;
    });
  }, [expenses, searchQuery, selectedCategory]);

  const filteredIncomes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return incomes.filter(
      (inc) =>
        query === '' ||
        inc.description.toLowerCase().includes(query) ||
        (inc.status === 'reverted' && 'revertido'.includes(query))
    );
  }, [incomes, searchQuery]);

  const groupedExpensesByDate = useMemo(() => {
    const groups: { date: string; total: number; items: Expense[] }[] = [];
    const map = new Map<string, { date: string; total: number; items: Expense[] }>();

    for (const exp of filteredExpenses) {
      let group = map.get(exp.date);
      if (!group) {
        group = { date: exp.date, total: 0, items: [] };
        map.set(exp.date, group);
        groups.push(group);
      }
      group.items.push(exp);
      group.total += getExpenseTotalAmount(exp);
    }

    return groups;
  }, [filteredExpenses]);

  const groupedIncomesByDate = useMemo(() => {
    const groups: { date: string; totalActive: number; items: IncomeEntry[] }[] = [];
    const map = new Map<string, { date: string; totalActive: number; items: IncomeEntry[] }>();

    for (const inc of filteredIncomes) {
      let group = map.get(inc.date);
      if (!group) {
        group = { date: inc.date, totalActive: 0, items: [] };
        map.set(inc.date, group);
        groups.push(group);
      }
      group.items.push(inc);
      if (inc.status !== 'reverted') {
        group.totalActive += inc.amount;
      }
    }

    return groups;
  }, [filteredIncomes]);

  const groupedUnifiedByDate = useMemo(() => {
    const items: UnifiedItem[] = [
      ...filteredExpenses.map((expense) => ({
        kind: 'expense' as const,
        date: expense.date,
        createdAt: expense.createdAt,
        expense,
      })),
      ...filteredIncomes.map((income) => ({
        kind: 'income' as const,
        date: income.date,
        createdAt: income.revertedAt ?? income.createdAt,
        income,
      })),
    ].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt - a.createdAt;
    });

    const groups: { date: string; items: UnifiedItem[] }[] = [];
    const map = new Map<string, { date: string; items: UnifiedItem[] }>();
    for (const item of items) {
      let group = map.get(item.date);
      if (!group) {
        group = { date: item.date, items: [] };
        map.set(item.date, group);
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }, [filteredExpenses, filteredIncomes]);

  const totalFilteredExpenses = filteredExpenses.reduce(
    (sum, exp) => sum + getExpenseTotalAmount(exp),
    0
  );
  const totalActiveIncomes = activeIncomes.reduce((sum, inc) => sum + inc.amount, 0);

  async function handleConfirmRevert(incomeId: string) {
    if (revertingId) return;
    setRevertingId(incomeId);
    try {
      await onRevertIncome(incomeId);
      setConfirmRevertId(null);
    } finally {
      setRevertingId(null);
    }
  }

  async function handleRestore(incomeId: string) {
    if (restoringId) return;
    setRestoringId(incomeId);
    try {
      await onRestoreIncome(incomeId);
    } finally {
      setRestoringId(null);
    }
  }

  async function handleConfirmDeleteIncome(incomeId: string) {
    if (deletingIncomeId) return;
    setDeletingIncomeId(incomeId);
    try {
      await onDeleteIncome(incomeId);
      setConfirmDeleteIncomeId(null);
    } finally {
      setDeletingIncomeId(null);
    }
  }

  // Día cero absoluto en Movimientos cuando no hay ni gastos ni ingresos todavía
  if (expenses.length === 0 && incomes.length === 0) {
    return (
      <section
        aria-label="Movimientos vacío"
        className="bg-gradient-to-br from-[#1b1d22]/95 via-[#131418]/95 to-[#181a20]/95 border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] rounded-xl px-6 py-16 sm:py-20 text-center"
      >
        <div className="max-w-md mx-auto space-y-4">
          <h1 className="font-display text-2xl sm:text-3xl font-medium text-zinc-50 tracking-tight text-balance">
            Tus gastos van a vivir aquí
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Cada vez que pagues algo, lo registras y aparece en esta lista
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenNewExpense}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] text-[#042415] text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <Plus className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
              <span>Registrar gasto</span>
            </button>
            <button
              type="button"
              onClick={onOpenAddIncome}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-sm font-medium text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 text-[#10d47e]" strokeWidth={2.2} aria-hidden="true" />
              <span>Agregar dinero</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  const showTabs = incomes.length > 0 || budgetMode === 'variable';

  function renderIncomeRow(inc: IncomeEntry) {
    const isReverted = inc.status === 'reverted';
    const isConfirmingRevert = confirmRevertId === inc.id;
    const isConfirmingDelete = confirmDeleteIncomeId === inc.id;

    return (
      <li
        key={`inc-${inc.id}`}
        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              isReverted
                ? 'bg-[#e07a73]/15 text-[#e07a73]'
                : 'bg-emerald-400/[0.12] text-[#10d47e]'
            }`}
          >
            {isReverted ? (
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ArrowDownLeft className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={`text-[15px] font-medium truncate ${
                  isReverted ? 'text-zinc-300' : 'text-zinc-100'
                }`}
              >
                {isReverted ? `Reversión: ${inc.description}` : inc.description}
              </p>
              {isReverted && (
                <span className="px-2 py-0.5 rounded bg-[#e07a73]/15 border border-[#e07a73]/30 text-[10px] font-medium text-[#e07a73] whitespace-nowrap">
                  Ingreso revertido
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-400 tabular-nums">
              {isReverted
                ? `Se revirtió +${formatCurrency(inc.amount)} del saldo disponible`
                : 'Dinero agregado'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 shrink-0">
          {isReverted ? (
            <div className="flex items-center gap-2 tabular-nums whitespace-nowrap">
              <span className="text-xs text-zinc-500 line-through">
                +{formatCurrency(inc.amount)}
              </span>
              <span className="text-[15px] font-semibold text-[#e07a73]">
                −{formatCurrency(inc.amount)}
              </span>
            </div>
          ) : (
            <span className="text-[15px] font-semibold text-[#10d47e] tabular-nums whitespace-nowrap">
              +{formatCurrency(inc.amount)}
            </span>
          )}

          {!isReverted ? (
            isConfirmingRevert ? (
              <div className="flex items-center gap-1.5 bg-[#e07a73]/10 border border-[#e07a73]/30 rounded-lg px-2.5 py-1">
                <span className="text-[11px] text-zinc-200 mr-1">¿Revertir?</span>
                <button
                  type="button"
                  disabled={revertingId === inc.id}
                  onClick={() => handleConfirmRevert(inc.id)}
                  className="px-2 py-0.5 rounded bg-[#e07a73] text-[#1f0908] text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                >
                  {revertingId === inc.id ? '...' : 'Sí, revertir'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRevertId(null)}
                  className="px-2 py-0.5 rounded bg-white/[0.06] text-zinc-300 text-[11px] cursor-pointer"
                >
                  No
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEditIncome(inc)}
                  aria-label={`Editar ingreso ${inc.description}`}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRevertId(inc.id)}
                  aria-label={`Revertir ingreso ${inc.description}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-400 hover:text-[#e07a73] hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>Revertir</span>
                </button>
              </div>
            )
          ) : isConfirmingDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={deletingIncomeId === inc.id}
                onClick={() => handleConfirmDeleteIncome(inc.id)}
                className="px-2 py-1 rounded bg-[#e07a73] text-[#1f0908] text-[11px] font-semibold cursor-pointer"
              >
                {deletingIncomeId === inc.id ? '...' : 'Borrar registro'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteIncomeId(null)}
                className="px-2 py-1 rounded bg-white/[0.06] text-zinc-300 text-[11px] cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={restoringId === inc.id}
                onClick={() => handleRestore(inc.id)}
                className="px-2 py-1 rounded-lg text-[11px] text-zinc-300 hover:text-emerald-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                {restoringId === inc.id ? '...' : 'Restaurar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteIncomeId(inc.id)}
                aria-label="Quitar registro del historial"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-[#e07a73] hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </li>
    );
  }

  function renderExpenseRow(expense: Expense) {
    const isTransport = expense.category === 'Transporte';
    const totalAmount = getExpenseTotalAmount(expense);
    const isInstallments = expense.paymentType === 'installments';

    return (
      <li key={`exp-${expense.id}`}>
        <button
          type="button"
          onClick={() => onSelectExpense(expense.id)}
          className="w-full text-left py-3.5 px-3 -mx-3 rounded-lg flex items-center justify-between gap-4 hover:bg-white/[0.04] transition-colors cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf]/50"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-zinc-100 flex items-center gap-2 truncate">
              <span className="truncate">{expense.description}</span>
              {isTransport && (
                <Bus
                  className="w-3.5 h-3.5 text-zinc-400 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              )}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400 tabular-nums truncate">
              {expense.category}
              {isInstallments
                ? ` · A plazos (${expense.installmentMonths ?? 1} ${
                    (expense.installmentMonths ?? 1) === 1 ? 'mes' : 'meses'
                  }${
                    expense.interestRatePercent !== undefined
                      ? ` al ${expense.interestRatePercent}%`
                      : ''
                  }) · ${expense.cardLabel ?? 'Tarjeta'}`
                : ' · De una sola vez'}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[15px] font-medium text-[#e07a73] tabular-nums whitespace-nowrap">
              −{formatCurrency(totalAmount)}
            </span>
            <ChevronRight
              className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors"
              aria-hidden="true"
            />
          </div>
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-[34px] font-medium text-zinc-50 tracking-tight">
            Movimientos
          </h1>
          {activeTab === 'all' ? (
            <p className="mt-1.5 text-sm text-zinc-400 tabular-nums">
              {filteredExpenses.length}{' '}
              {filteredExpenses.length === 1 ? 'gasto' : 'gastos'} (−
              {formatCurrency(totalFilteredExpenses)}) · {activeIncomes.length}{' '}
              {activeIncomes.length === 1 ? 'ingreso activo' : 'ingresos activos'} (+
              {formatCurrency(totalActiveIncomes)})
            </p>
          ) : activeTab === 'expenses' ? (
            <p className="mt-1.5 text-sm text-zinc-400 tabular-nums">
              {filteredExpenses.length}{' '}
              {filteredExpenses.length === 1 ? 'gasto registrado' : 'gastos registrados'} · Total{' '}
              {formatCurrency(totalFilteredExpenses)}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-zinc-400 tabular-nums">
              {activeIncomes.length}{' '}
              {activeIncomes.length === 1 ? 'ingreso activo' : 'ingresos activos'} · Total{' '}
              <span className="text-[#10d47e] font-medium">
                +{formatCurrency(totalActiveIncomes)}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenAddIncome}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-xs sm:text-sm font-medium text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-[#10d47e]" strokeWidth={2.2} aria-hidden="true" />
            <span>Agregar dinero</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewExpense}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] text-[#042415] text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            <Plus className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
            <span>Registrar gasto</span>
          </button>
        </div>
      </div>

      {showTabs && (
        <div
          role="tablist"
          aria-label="Tipo de movimientos"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0f1013] border border-white/[0.1]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-white/[0.1] text-zinc-50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Todos ({expenses.length + incomes.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'expenses'}
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'expenses'
                ? 'bg-white/[0.1] text-zinc-50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Gastos ({expenses.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'incomes'}
            onClick={() => setActiveTab('incomes')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'incomes'
                ? 'bg-emerald-400/[0.15] text-emerald-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Ingresos ({incomes.length})
          </button>
        </div>
      )}

      {/* Filtros */}
      <section
        aria-label="Filtrar movimientos"
        className="bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-5 sm:p-6 space-y-4"
      >
        <div className="relative">
          <Search
            className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por descripción, categoría o tarjeta..."
            aria-label="Buscar movimientos"
            className="w-full bg-[#090a0d] border border-white/[0.1] focus:border-emerald-400/60 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-colors"
          />
        </div>

        {activeTab !== 'incomes' && expenses.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('Todas')}
              aria-pressed={selectedCategory === 'Todas'}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                selectedCategory === 'Todas'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200'
              }`}
            >
              Todas
            </button>
            {EXPENSE_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                    active
                      ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/40'
                      : 'bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {activeTab === 'all' ? (
        <section
          aria-label="Todos los movimientos"
          className="bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl overflow-hidden"
        >
          {groupedUnifiedByDate.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-sm text-zinc-400">
                No hay movimientos que coincidan con tu búsqueda actual.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('Todas');
                }}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                Mostrar todos los movimientos
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.08]">
              {groupedUnifiedByDate.map((group) => (
                <div key={group.date} className="p-5 sm:p-6">
                  <div className="flex items-baseline justify-between gap-4 pb-3 border-b border-white/[0.06]">
                    <h2 className="text-xs font-medium text-zinc-400 tracking-[0.01em]">
                      {formatFullDate(group.date)}
                    </h2>
                    <span className="text-xs font-mono text-zinc-500 tabular-nums whitespace-nowrap">
                      {group.items.length}{' '}
                      {group.items.length === 1 ? 'movimiento' : 'movimientos'}
                    </span>
                  </div>

                  <ul className="mt-2 divide-y divide-white/[0.05]">
                    {group.items.map((item) =>
                      item.kind === 'expense'
                        ? renderExpenseRow(item.expense)
                        : renderIncomeRow(item.income)
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : activeTab === 'expenses' ? (
        expenses.length === 0 ? (
          <section
            aria-label="Sin gastos registrados"
            className="bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] rounded-xl px-6 py-14 text-center space-y-3"
          >
            <h2 className="font-display text-2xl font-medium text-zinc-50">
              Tus gastos van a vivir aquí
            </h2>
            <p className="text-sm text-zinc-400 max-w-md mx-auto">
              Cuando pagues algo, regístralo para verlo en esta lista.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenNewExpense}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] text-[#042415] text-sm font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
                <span>Registrar gasto</span>
              </button>
            </div>
          </section>
        ) : (
          <section
            aria-label="Lista cronológica de gastos"
            className="bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl overflow-hidden"
          >
            {groupedExpensesByDate.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-sm text-zinc-400">
                  No hay gastos que coincidan con tu búsqueda actual.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('Todas');
                  }}
                  className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  Mostrar todos los movimientos
                </button>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.08]">
                {groupedExpensesByDate.map((group) => (
                  <div key={group.date} className="p-5 sm:p-6">
                    <div className="flex items-baseline justify-between gap-4 pb-3 border-b border-white/[0.06]">
                      <h2 className="text-xs font-medium text-zinc-400 tracking-[0.01em]">
                        {formatFullDate(group.date)}
                      </h2>
                      <span className="text-xs font-mono text-zinc-400 tabular-nums whitespace-nowrap">
                        Subtotal: {formatCurrency(group.total)}
                      </span>
                    </div>

                    <ul className="mt-2 divide-y divide-white/[0.05]">
                      {group.items.map((expense) => renderExpenseRow(expense))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      ) : (
        <section
          aria-label="Lista cronológica de ingresos"
          className="bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl overflow-hidden"
        >
          {groupedIncomesByDate.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <h2 className="font-display text-xl font-medium text-zinc-50">
                Aún no has agregado ingresos este mes
              </h2>
              <p className="text-sm text-zinc-400 max-w-md mx-auto">
                Cada vez que recibas un pago o quieras sumar plata a Tu billetera, agrégalo aquí.
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onOpenAddIncome}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] text-[#042415] text-sm font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
                  <span>Agregar dinero</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.08]">
              {groupedIncomesByDate.map((group) => (
                <div key={group.date} className="p-5 sm:p-6">
                  <div className="flex items-baseline justify-between gap-4 pb-3 border-b border-white/[0.06]">
                    <h2 className="text-xs font-medium text-zinc-400 tracking-[0.01em]">
                      {formatFullDate(group.date)}
                    </h2>
                    <span className="text-xs font-mono text-[#10d47e] tabular-nums whitespace-nowrap">
                      Neto activo: +{formatCurrency(group.totalActive)}
                    </span>
                  </div>

                  <ul className="mt-2 divide-y divide-white/[0.05]">
                    {group.items.map((inc) => renderIncomeRow(inc))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
