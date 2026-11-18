import { ArrowRight, Briefcase, Check, Coins, LogOut } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { BudgetMode, DEFAULT_TODAY_ISO, MONTH_LABEL, formatCurrency } from '../data/walletData';
import { IncomeWriteInput } from '../services/walletStore';

interface BudgetOnboardingScreenProps {
  userEmail: string | null;
  onComplete: (options: {
    budgetMode: BudgetMode;
    monthlyBudget: number;
    initialIncome?: IncomeWriteInput;
  }) => Promise<void>;
  onSignOut: () => Promise<void>;
}

const PRESET_BUDGETS = [2000000, 3600000, 5000000];

function formatGroupedDigits(digits: string): string {
  if (!digits) return '';
  const num = Math.round(Number(digits));
  if (!Number.isFinite(num) || num <= 0) return '';
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(num);
}

export function BudgetOnboardingScreen({
  userEmail,
  onComplete,
  onSignOut,
}: BudgetOnboardingScreenProps) {
  const [selectedMode, setSelectedMode] = useState<BudgetMode>('fixed');
  const [digits, setDigits] = useState<string>('3600000');
  const [initialIncomeDigits, setInitialIncomeDigits] = useState<string>('');
  const [initialIncomeDesc, setInitialIncomeDesc] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const parsedBudget = digits ? Math.round(Number(digits)) : 0;
  const parsedInitialIncome = initialIncomeDigits ? Math.round(Number(initialIncomeDigits)) : 0;

  function handleDigitsChange(value: string, setter: (next: string) => void) {
    const trimmed = value.trim();
    const decimalMatch = trimmed.match(/^(\d+)[.,](\d{1,2})$/);
    if (decimalMatch) {
      const rounded = Math.round(Number(`${decimalMatch[1]}.${decimalMatch[2]}`));
      setter(rounded > 0 ? String(rounded).slice(0, 10) : '');
    } else {
      setter(value.replace(/\D/g, '').slice(0, 10));
    }
    if (errorMsg) setErrorMsg('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    if (selectedMode === 'fixed' && (!parsedBudget || parsedBudget <= 0)) {
      setErrorMsg('Ingresa un presupuesto mensual mayor a $ 0.');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    try {
      if (selectedMode === 'variable') {
        await onComplete({
          budgetMode: 'variable',
          monthlyBudget: 0,
          ...(parsedInitialIncome > 0
            ? {
                initialIncome: {
                  amount: parsedInitialIncome,
                  description: initialIncomeDesc.trim() || 'Ingreso inicial',
                  date: DEFAULT_TODAY_ISO,
                },
              }
            : {}),
        });
      } else {
        await onComplete({
          budgetMode: 'fixed',
          monthlyBudget: parsedBudget,
        });
      }
    } catch {
      setErrorMsg('No se pudo guardar tu configuración inicial. Intenta de nuevo.');
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen text-zinc-100">
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 lg:px-10 py-6 sm:py-8">
        <header className="flex items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
          <span className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-zinc-50">
            Tu billetera
          </span>

          <div className="flex items-center gap-3">
            {userEmail && (
              <span className="hidden sm:inline text-xs text-zinc-400 truncate max-w-[220px]">
                {userEmail}
              </span>
            )}
            <button
              type="button"
              onClick={onSignOut}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </header>

        <main className="mt-10 sm:mt-14 flex justify-center">
          <section
            aria-label="Configurar presupuesto mensual inicial"
            className="w-full max-w-xl bg-gradient-to-br from-[#1b1d22]/95 via-[#131418]/95 to-[#181a20]/95 border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] rounded-xl p-6 sm:p-8 space-y-6"
          >
            <div className="space-y-2">
              <p className="text-xs text-emerald-400 font-medium tabular-nums">
                Primera vez · {MONTH_LABEL}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-medium text-zinc-50 tracking-tight">
                ¿Cómo manejas tu dinero este mes?
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Elige si ya cuentas con un presupuesto fijo o si recibes ingresos variables como
                freelancer para ir sumando dinero poco a poco.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Selector de modo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setSelectedMode('fixed');
                    setErrorMsg('');
                  }}
                  aria-pressed={selectedMode === 'fixed'}
                  className={`p-4 rounded-xl border text-left transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                    selectedMode === 'fixed'
                      ? 'bg-emerald-400/[0.12] border-emerald-400/60 text-zinc-50'
                      : 'bg-[#0b0c10] border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Coins className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      <span>Presupuesto fijo</span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Define un monto mensual desde el inicio.
                    </p>
                  </div>
                  {selectedMode === 'fixed' && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setSelectedMode('variable');
                    setErrorMsg('');
                  }}
                  aria-pressed={selectedMode === 'variable'}
                  className={`p-4 rounded-xl border text-left transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                    selectedMode === 'variable'
                      ? 'bg-emerald-400/[0.12] border-emerald-400/60 text-zinc-50'
                      : 'bg-[#0b0c10] border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Briefcase className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      <span>Soy freelancer</span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Empieza en $ 0 y ve agregando tu dinero paulatinamente.
                    </p>
                  </div>
                  {selectedMode === 'variable' && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                </button>
              </div>

              {selectedMode === 'fixed' ? (
                <div>
                  <label
                    htmlFor="initial-budget"
                    className="block text-[13px] font-medium text-zinc-200"
                  >
                    ¿Cuál es tu presupuesto mensual? (COP)
                  </label>
                  <div className="mt-2.5 relative flex items-center">
                    <span
                      aria-hidden="true"
                      className="absolute left-4 text-2xl sm:text-3xl font-semibold text-zinc-400 select-none"
                    >
                      $
                    </span>
                    <input
                      id="initial-budget"
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      disabled={isSaving}
                      value={formatGroupedDigits(digits)}
                      onChange={(e) => handleDigitsChange(e.target.value, setDigits)}
                      placeholder="0"
                      className="w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-xl py-4 pl-10 pr-16 text-3xl font-semibold text-zinc-50 placeholder:text-zinc-700 tabular-nums focus:outline-none transition-colors"
                    />
                    <span className="absolute right-4 text-xs font-mono text-zinc-500 select-none">
                      COP
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-500 mr-1">Sugeridos:</span>
                    {PRESET_BUDGETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          setDigits(String(preset));
                          setErrorMsg('');
                        }}
                        className={`px-3 py-1.5 text-xs font-medium tabular-nums rounded-lg border transition-colors cursor-pointer ${
                          parsedBudget === preset
                            ? 'bg-emerald-400/[0.14] border-emerald-400/50 text-emerald-300'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300'
                        }`}
                      >
                        {formatCurrency(preset)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-[#0b0c10] border border-white/[0.08] p-4 space-y-4">
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Tu billetera empezará en <strong className="text-zinc-50">$ 0</strong> y cada
                    vez que recibas un pago podrás usar{' '}
                    <strong className="text-emerald-400">+ Agregar dinero</strong> para sumarlo a tu
                    saldo disponible.
                  </p>

                  <div className="space-y-3 pt-2 border-t border-white/[0.06]">
                    <p className="text-xs font-medium text-zinc-300">
                      ¿Ya recibiste un primer pago hoy? (opcional)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-5 relative flex items-center">
                        <span
                          aria-hidden="true"
                          className="absolute left-3 text-base font-semibold text-zinc-400 select-none"
                        >
                          $
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={isSaving}
                          aria-label="Primer ingreso opcional en COP"
                          value={formatGroupedDigits(initialIncomeDigits)}
                          onChange={(e) =>
                            handleDigitsChange(e.target.value, setInitialIncomeDigits)
                          }
                          placeholder="0"
                          className="w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg py-2 pl-7 pr-3 text-base font-semibold text-zinc-50 placeholder:text-zinc-700 tabular-nums focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-7">
                        <input
                          type="text"
                          maxLength={80}
                          disabled={isSaving}
                          aria-label="Descripción del primer ingreso"
                          value={initialIncomeDesc}
                          onChange={(e) => setInitialIncomeDesc(e.target.value)}
                          placeholder="Ej. Pago cliente o adelanto..."
                          className="w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <p role="alert" className="text-xs text-[#e07a73]">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3 px-4 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] disabled:opacity-60 text-[#042415] font-semibold text-sm transition-colors cursor-pointer disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                <span>
                  {isSaving
                    ? 'Guardando configuración...'
                    : selectedMode === 'variable'
                      ? parsedInitialIncome > 0
                        ? `Comenzar con ${formatCurrency(parsedInitialIncome)}`
                        : 'Comenzar en $ 0 (modo freelancer)'
                      : 'Guardar presupuesto y comenzar'}
                </span>
                {!isSaving && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
              </button>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
