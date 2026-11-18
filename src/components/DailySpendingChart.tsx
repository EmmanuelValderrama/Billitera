import { DailySpend, formatCurrency } from '../data/walletData';

interface DailySpendingChartProps {
  dailySpending: DailySpend[];
  monthlyBudget: number;
  currentDay: number;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
}

export function DailySpendingChart({
  dailySpending,
  monthlyBudget,
  currentDay,
  selectedDay,
  onSelectDay,
}: DailySpendingChartProps) {
  const recordedDays = dailySpending.filter((d) => d.amount !== null);
  const totalRecorded = recordedDays.reduce((acc, item) => acc + (item.amount ?? 0), 0);
  const dailyAverage = recordedDays.length > 0 ? totalRecorded / recordedDays.length : 0;
  const dailyPace = monthlyBudget / dailySpending.length;

  const maxSpend = Math.max(
    ...recordedDays.map((d) => d.amount ?? 0),
    dailyPace,
    60000
  );
  const yCeiling = Math.ceil(maxSpend / 60000) * 60000;
  const yTicks = [yCeiling, Math.round((yCeiling * 2) / 3), Math.round(yCeiling / 3), 0];

  const activeDayItem =
    selectedDay !== null
      ? dailySpending.find((d) => d.day === selectedDay) ?? null
      : null;

  const paceTopPercent = 100 - (dailyPace / yCeiling) * 100;

  return (
    <section
      aria-label="Gráfico de gastos diarios del mes"
      className="bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-6 sm:p-7 flex flex-col justify-between"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-[22px] font-medium text-zinc-50 tracking-tight">
            Gastos diarios del mes
          </h2>
          <p className="mt-1 text-xs text-zinc-400 tracking-[0.01em] tabular-nums">
            1 – {currentDay} de noviembre · Promedio diario {formatCurrency(dailyAverage)}
          </p>
        </div>

        <div className="text-left sm:text-right min-h-[38px]">
          {activeDayItem && activeDayItem.amount !== null ? (
            <div>
              <p className="text-xs text-zinc-400 tabular-nums">
                {activeDayItem.dateLabel} 2026
              </p>
              <p className="text-base font-semibold text-[#2dd4bf] tabular-nums">
                {formatCurrency(activeDayItem.amount)}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-zinc-400">Referencia diaria</p>
              <p className="text-sm font-medium text-zinc-100 tabular-nums">
                {formatCurrency(dailyPace)} / día
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="mt-7 flex gap-3 sm:gap-4 items-stretch">
        {/* Y-Axis Labels */}
        <div
          aria-hidden="true"
          className="flex flex-col justify-between text-right text-[11px] font-mono text-zinc-500 tabular-nums pb-6 select-none shrink-0 w-[72px] sm:w-20 whitespace-nowrap"
        >
          {yTicks.map((tick) => (
            <span key={tick}>{formatCurrency(tick)}</span>
          ))}
        </div>

        {/* Plot Area */}
        <div className="relative flex-1 min-w-0">
          <div className="relative h-52 sm:h-56 w-full">
            {/* Horizontal grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {yTicks.map((tick, index) => (
                <div
                  key={tick}
                  className={`w-full border-t ${
                    index === yTicks.length - 1
                      ? 'border-white/[0.1]'
                      : 'border-white/[0.04]'
                  }`}
                />
              ))}
            </div>

            {/* Daily budget reference violet horizontal line with origin dot */}
            <div
              aria-hidden="true"
              className="absolute left-0 right-0 border-t-[1.5px] border-[#8b5cf6] pointer-events-none z-30 flex items-center"
              style={{ top: `${paceTopPercent}%` }}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] shadow-[0_0_8px_rgba(139,92,246,0.65)] -translate-y-[1px] -ml-0.5" />
            </div>

            {/* Bars for days 1..30 */}
            <div
              className="relative z-20 h-full grid gap-[3px] sm:gap-1.5 items-end"
              style={{ gridTemplateColumns: `repeat(${dailySpending.length}, minmax(0, 1fr))` }}
            >
              {dailySpending.map((item) => {
                const hasData = item.amount !== null;
                const heightPercent =
                  hasData && item.amount !== null && item.amount > 0
                    ? Math.max((item.amount / yCeiling) * 100, 4)
                    : 0;
                const isSelected = selectedDay === item.day;
                const isAbovePace = hasData && item.amount !== null && item.amount > dailyPace;

                if (!hasData) {
                  return (
                    <div
                      key={item.day}
                      className="h-full flex items-end justify-center"
                      aria-hidden="true"
                    >
                      <div className="w-full h-[2px] bg-white/[0.06] rounded-full" />
                    </div>
                  );
                }

                return (
                  <button
                    key={item.day}
                    type="button"
                    onClick={() => onSelectDay(isSelected ? null : item.day)}
                    onMouseEnter={() => onSelectDay(item.day)}
                    onMouseLeave={() => onSelectDay(null)}
                    aria-pressed={isSelected}
                    aria-label={`${item.dateLabel}: ${formatCurrency(item.amount ?? 0)}`}
                    className="group h-full flex items-end justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf]/50 rounded-sm cursor-pointer"
                  >
                    <div
                      className={`w-full rounded-t-full transition-all duration-150 ${
                        isSelected
                          ? 'bg-gradient-to-b from-[#34d399] to-[#0f5148] brightness-110'
                          : isAbovePace
                            ? 'bg-gradient-to-b from-[#238e83] to-[#0d3330] group-hover:from-[#2dd4bf] group-hover:to-[#11423e]'
                            : 'bg-gradient-to-b from-[#1a6e66] to-[#0a2725] group-hover:from-[#238e83] group-hover:to-[#0f3835]'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* X-Axis Day Labels */}
          <div
            className="mt-2.5 grid text-center text-[11px] font-mono text-zinc-500 tabular-nums select-none"
            style={{ gridTemplateColumns: `repeat(${dailySpending.length}, minmax(0, 1fr))` }}
          >
            {dailySpending.map((item) => {
              const showLabel =
                item.day === 1 ||
                item.day === 5 ||
                item.day === 10 ||
                item.day === 15 ||
                item.day === 20 ||
                item.day === 25 ||
                item.day === 30;
              const isSelected = selectedDay === item.day;

              return (
                <span
                  key={item.day}
                  className={
                    isSelected
                      ? 'text-[#2dd4bf] font-medium'
                      : showLabel
                        ? 'text-zinc-400'
                        : 'text-transparent'
                  }
                >
                  {showLabel || isSelected ? item.day : ''}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Subtle Footer Legend */}
      <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
        <div className="flex flex-wrap items-center gap-5">
          <span className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#238e83] inline-block" aria-hidden="true" />
            Gasto diario registrado
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3.5 h-[2px] bg-[#8b5cf6] inline-block" aria-hidden="true" />
            Referencia diaria ({formatCurrency(dailyPace)})
          </span>
        </div>
        <span className="text-zinc-500 tabular-nums">
          Días 19–30 pendientes
        </span>
      </div>
    </section>
  );
}
