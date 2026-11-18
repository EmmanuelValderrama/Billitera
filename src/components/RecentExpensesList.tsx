import { ArrowRight, Bus } from 'lucide-react';
import {
  Expense,
  formatCurrency,
  formatShortDate,
  getExpenseTotalAmount,
  parseIsoDate,
} from '../data/walletData';

interface RecentExpensesListProps {
  expenses: Expense[];
  selectedDay: number | null;
  highlightedExpenseId: string | null;
  onHighlightDay: (day: number | null) => void;
  onSelectExpense: (expenseId: string) => void;
  onViewAllMovements: () => void;
}

export function RecentExpensesList({
  expenses,
  selectedDay,
  highlightedExpenseId,
  onHighlightDay,
  onSelectExpense,
  onViewAllMovements,
}: RecentExpensesListProps) {
  const latestFive = expenses.slice(0, 5);

  return (
    <section
      aria-label="Últimos movimientos"
      className="bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-6 sm:p-7 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl sm:text-[22px] font-medium text-zinc-50 tracking-tight">
            Últimos movimientos
          </h2>
          <button
            type="button"
            onClick={onViewAllMovements}
            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-300 hover:text-emerald-400 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf]/50 rounded"
          >
            <span>Ver todos</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-400 tracking-[0.01em]">
          Haz clic en un movimiento para ver su detalle completo
        </p>

        {latestFive.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-400">
            Aún no hay gastos registrados este mes.
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-white/[0.06]">
            {latestFive.map((expense) => {
              const { day } = parseIsoDate(expense.date);
              const isDayHighlighted = selectedDay === day;
              const isJustAdded = highlightedExpenseId === expense.id;
              const isTransport = expense.category === 'Transporte';
              const totalAmount = getExpenseTotalAmount(expense);

              return (
                <li key={expense.id}>
                  <button
                    type="button"
                    onMouseEnter={() => onHighlightDay(day)}
                    onMouseLeave={() => onHighlightDay(null)}
                    onClick={() => onSelectExpense(expense.id)}
                    className={`w-full text-left py-3 px-2.5 -mx-2.5 rounded-lg flex items-center justify-between gap-4 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf]/50 ${
                      isJustAdded
                        ? 'bg-emerald-500/[0.09]'
                        : isDayHighlighted
                          ? 'bg-white/[0.06]'
                          : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-zinc-100 tracking-[0.01em] flex items-center gap-2 truncate">
                        <span className="truncate">{expense.description || expense.category}</span>
                        {isTransport && (
                          <Bus
                            className="w-3.5 h-3.5 text-zinc-400 shrink-0"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400 tabular-nums truncate">
                        {expense.category} · {formatShortDate(expense.date)}
                        {expense.paymentType === 'installments' && ' · A plazos'}
                      </p>
                    </div>

                    <p className="text-[15px] font-medium text-[#e07a73] tabular-nums whitespace-nowrap shrink-0">
                      −{formatCurrency(totalAmount)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
        <span>
          {latestFive.length < 5
            ? `Total (${latestFive.length} ${latestFive.length === 1 ? 'movimiento' : 'movimientos'})`
            : 'Total de los últimos 5'}
        </span>
        <span className="font-medium text-zinc-100 tabular-nums">
          {formatCurrency(latestFive.reduce((sum, item) => sum + getExpenseTotalAmount(item), 0))}
        </span>
      </div>
    </section>
  );
}
