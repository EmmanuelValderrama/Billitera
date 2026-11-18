import { ArrowLeft, Check, CreditCard, Plus } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import {
  DEFAULT_TODAY_ISO,
  EXPENSE_CATEGORIES,
  Expense,
  ExpenseCategory,
  PaymentCard,
  PaymentType,
  calculateInstallmentInterest,
  formatCardLabel,
  formatCurrency,
} from '../data/walletData';

interface NewExpenseScreenProps {
  availableBalance: number;
  cards: PaymentCard[];
  editingExpense?: Expense | null;
  onAddCard: (input: { name: string; last4?: string }) => Promise<PaymentCard>;
  onSaveExpense: (input: {
    amount: number;
    category: ExpenseCategory;
    description: string;
    date: string;
    paymentType: PaymentType;
    interestAmount?: number;
    interestRatePercent?: number;
    installmentMonths?: number;
    cardId?: string;
    cardLabel?: string;
  }) => Promise<void>;
  onCancel: () => void;
}

const QUICK_ADD_AMOUNTS = [5000, 10000, 20000, 50000];
const QUICK_INTEREST_RATES = ['0', '1.8', '2.2', '2.8'];
const QUICK_MONTH_TERMS = [3, 6, 12, 24];

function formatDigitsToGrouped(digits: string): string {
  if (!digits) return '';
  const num = Math.round(Number(digits));
  if (!Number.isFinite(num) || num <= 0) return '';
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(num);
}

export function NewExpenseScreen({
  availableBalance,
  cards,
  editingExpense = null,
  onAddCard,
  onSaveExpense,
  onCancel,
}: NewExpenseScreenProps) {
  const isEditing = Boolean(editingExpense);

  const [rawDigits, setRawDigits] = useState<string>(
    editingExpense ? String(Math.round(editingExpense.amount)) : ''
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    editingExpense ? editingExpense.category : 'Alimentación'
  );
  const [description, setDescription] = useState<string>(
    editingExpense ? editingExpense.description : ''
  );
  const [date, setDate] = useState<string>(
    editingExpense ? editingExpense.date : DEFAULT_TODAY_ISO
  );
  const [paymentType, setPaymentType] = useState<PaymentType>(
    editingExpense ? editingExpense.paymentType : 'single'
  );
  const [interestRateInput, setInterestRateInput] = useState<string>(
    editingExpense?.interestRatePercent !== undefined
      ? String(editingExpense.interestRatePercent)
      : '2.2'
  );
  const [monthsInput, setMonthsInput] = useState<string>(
    editingExpense?.installmentMonths !== undefined
      ? String(editingExpense.installmentMonths)
      : '6'
  );
  const [selectedCardId, setSelectedCardId] = useState<string>(
    editingExpense?.cardId ?? cards[0]?.id ?? ''
  );

  useEffect(() => {
    if (!selectedCardId && cards.length > 0) {
      setSelectedCardId(cards[0].id);
    }
  }, [cards, selectedCardId]);

  // Inline card creation state inside the card menu
  const [isAddingCard, setIsAddingCard] = useState<boolean>(false);
  const [newCardName, setNewCardName] = useState<string>('');
  const [newCardLast4, setNewCardLast4] = useState<string>('');
  const [cardFormError, setCardFormError] = useState<string>('');
  const [isSavingCard, setIsSavingCard] = useState<boolean>(false);

  const [amountError, setAmountError] = useState<string>('');
  const [installmentError, setInstallmentError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const parsedAmount = rawDigits ? Number(rawDigits) : 0;
  const parsedRate = Number(interestRateInput.replace(',', '.')) || 0;
  const parsedMonths = Math.max(parseInt(monthsInput, 10) || 0, 0);

  const installmentSummary =
    paymentType === 'installments'
      ? calculateInstallmentInterest(parsedAmount, parsedRate, parsedMonths)
      : { interestAmount: 0, monthlyPayment: 0, totalAmount: parsedAmount };

  const totalOutflow = parsedAmount + installmentSummary.interestAmount;
  const projectedBalance = availableBalance - totalOutflow;

  function handleAmountChange(value: string) {
    const trimmed = value.trim();
    const decimalMatch = trimmed.match(/^(\d+)[.,](\d{1,2})$/);
    if (decimalMatch) {
      const rounded = Math.round(Number(`${decimalMatch[1]}.${decimalMatch[2]}`));
      setRawDigits(rounded > 0 ? String(rounded).slice(0, 10) : '');
    } else {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
      setRawDigits(digitsOnly);
    }
    if (amountError) setAmountError('');
  }

  function handleRateChange(value: string) {
    const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
    const parts = normalized.split('.');
    const sanitized =
      parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : normalized;
    setInterestRateInput(sanitized.slice(0, 5));
    if (installmentError) setInstallmentError('');
  }

  function handleMonthsChange(value: string) {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 3);
    setMonthsInput(digitsOnly);
    if (installmentError) setInstallmentError('');
  }

  function handleQuickAdd(increment: number) {
    const next = Math.min(parsedAmount + increment, 999999999);
    setRawDigits(String(next));
    if (amountError) setAmountError('');
  }

  async function handleCreateCard() {
    if (isSavingCard) return;
    const trimmedName = newCardName.trim();
    if (!trimmedName) {
      setCardFormError('Escribe el nombre de la tarjeta (ej. Nu Visa o Bancolombia).');
      return;
    }
    const cleanLast4 = newCardLast4.replace(/\D/g, '').slice(0, 4);
    setIsSavingCard(true);
    setCardFormError('');
    try {
      const created = await onAddCard({
        name: trimmedName,
        last4: cleanLast4.length === 4 ? cleanLast4 : undefined,
      });

      setSelectedCardId(created.id);
      setNewCardName('');
      setNewCardLast4('');
      setInstallmentError('');
      setIsAddingCard(false);
    } catch {
      setCardFormError('No pudimos guardar la tarjeta. Intenta nuevamente.');
    } finally {
      setIsSavingCard(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError('');

    if (!parsedAmount || parsedAmount <= 0) {
      setAmountError('Ingresa un monto mayor a $ 0 para guardar el gasto.');
      return;
    }

    if (paymentType === 'installments') {
      if (parsedMonths < 1) {
        setInstallmentError('Indica el tiempo en meses (mínimo 1 mes) para el pago a plazos.');
        return;
      }

      const chosenCard = cards.find((c) => c.id === selectedCardId);
      if (!chosenCard) {
        setInstallmentError('Selecciona o agrega la tarjeta que usaste para el pago a plazos.');
        return;
      }

      setIsSubmitting(true);
      try {
        await onSaveExpense({
          amount: parsedAmount,
          category,
          description: description.trim() || category,
          date: date || DEFAULT_TODAY_ISO,
          paymentType: 'installments',
          interestAmount: installmentSummary.interestAmount,
          interestRatePercent: parsedRate,
          installmentMonths: parsedMonths,
          cardId: chosenCard.id,
          cardLabel: formatCardLabel(chosenCard),
        });
      } catch {
        setSubmitError('No se pudo guardar el gasto en la base de datos. Intenta nuevamente.');
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveExpense({
        amount: parsedAmount,
        category,
        description: description.trim() || category,
        date: date || DEFAULT_TODAY_ISO,
        paymentType: 'single',
      });
    } catch {
      setSubmitError('No se pudo guardar el gasto en la base de datos. Intenta nuevamente.');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isEditing ? 'Volver al detalle' : 'Volver al Dashboard'}</span>
          </button>
          <h1 className="mt-2 font-display text-3xl sm:text-[34px] font-medium text-zinc-50 tracking-tight">
            {isEditing ? 'Editar gasto' : 'Nuevo gasto'}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {isEditing
              ? 'Actualiza los datos de este movimiento y guarda los cambios en tu billetera.'
              : 'Registra lo que acabas de pagar y actualiza tu saldo disponible al instante.'}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* Formulario principal */}
        <div className="lg:col-span-8 bg-gradient-to-b from-[#141519]/95 to-[#0f1013]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-6 sm:p-8 space-y-7">
          {/* Campo 1: Monto */}
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label
                htmlFor="expense-amount"
                className="block text-[13px] font-medium text-zinc-200 tracking-[0.01em]"
              >
                Monto en pesos (COP)
              </label>
              <span className="text-xs text-zinc-500">Sin puntos ni comas al escribir</span>
            </div>

            <div className="mt-2.5 relative flex items-center">
              <span
                aria-hidden="true"
                className="absolute left-4 text-2xl sm:text-3xl font-semibold text-zinc-400 select-none"
              >
                $
              </span>
              <input
                id="expense-amount"
                type="text"
                inputMode="numeric"
                autoFocus
                value={formatDigitsToGrouped(rawDigits)}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-xl py-4 pl-10 pr-20 text-3xl sm:text-4xl font-semibold text-zinc-50 placeholder:text-zinc-700 tabular-nums focus:outline-none transition-colors"
              />
              <span className="absolute right-4 text-xs font-mono text-zinc-500 select-none">
                COP
              </span>
            </div>

            {amountError && (
              <p role="alert" className="mt-2 text-xs text-[#e07a73]">
                {amountError}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500 mr-1">Suma rápida:</span>
              {QUICK_ADD_AMOUNTS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAdd(val)}
                  className="px-3 py-1.5 text-xs font-medium tabular-nums rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                >
                  +{formatCurrency(val)}
                </button>
              ))}
              {parsedAmount > 0 && (
                <button
                  type="button"
                  onClick={() => setRawDigits('')}
                  className="px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Campo 2: Categoría */}
          <div>
            <span className="block text-[13px] font-medium text-zinc-200 tracking-[0.01em]">
              Categoría
            </span>
            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {EXPENSE_CATEGORIES.map((item) => {
                const isSelected = category === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={isSelected}
                    className={`px-3.5 py-2.5 rounded-lg border text-left text-sm font-medium transition-colors cursor-pointer flex items-center justify-between gap-2 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                      isSelected
                        ? 'bg-emerald-400/[0.12] border-emerald-400/60 text-emerald-300'
                        : 'bg-[#0b0c10] border-white/[0.08] text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100'
                    }`}
                  >
                    <span className="truncate">{item}</span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Campos 3 y 4: Descripción y Fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
            <div className="sm:col-span-7">
              <label
                htmlFor="expense-description"
                className="block text-[13px] font-medium text-zinc-200 tracking-[0.01em]"
              >
                Descripción
              </label>
              <input
                id="expense-description"
                type="text"
                maxLength={80}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. Almuerzo del día, café, pasaje..."
                className="mt-2 w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors"
              />
            </div>

            <div className="sm:col-span-5">
              <label
                htmlFor="expense-date"
                className="block text-[13px] font-medium text-zinc-200 tracking-[0.01em]"
              >
                Fecha
              </label>
              <input
                id="expense-date"
                type="date"
                value={date}
                min="2026-11-01"
                max="2026-11-30"
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 tabular-nums focus:outline-none transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Campo 5: ¿De 1 sola vez o a plazos? */}
          <div className="pt-6 border-t border-white/[0.08] space-y-5">
            <div>
              <span className="block text-[13px] font-medium text-zinc-200 tracking-[0.01em]">
                ¿Cómo lo pagaste?
              </span>
              <div
                role="group"
                aria-label="Forma de pago"
                className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType('single');
                    setInstallmentError('');
                  }}
                  aria-pressed={paymentType === 'single'}
                  className={`px-4 py-3 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                    paymentType === 'single'
                      ? 'bg-emerald-400/[0.12] border-emerald-400/60 text-emerald-300'
                      : 'bg-[#0b0c10] border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">De una sola vez</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Pago inmediato sin cuotas</p>
                  </div>
                  {paymentType === 'single' && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('installments')}
                  aria-pressed={paymentType === 'installments'}
                  className={`px-4 py-3 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                    paymentType === 'installments'
                      ? 'bg-emerald-400/[0.12] border-emerald-400/60 text-emerald-300'
                      : 'bg-[#0b0c10] border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">A plazos</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Diferido con tarjeta e intereses</p>
                  </div>
                  {paymentType === 'installments' && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {paymentType === 'installments' && (
              <div className="space-y-6 pt-2">
                {/* Porcentaje de interés y Tiempo en meses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label
                      htmlFor="expense-interest-rate"
                      className="block text-[13px] font-medium text-zinc-200 tracking-[0.01em]"
                    >
                      Porcentaje de interés (% mensual)
                    </label>
                    <div className="mt-2 relative flex items-center">
                      <input
                        id="expense-interest-rate"
                        type="text"
                        inputMode="decimal"
                        value={interestRateInput}
                        onChange={(e) => handleRateChange(e.target.value)}
                        placeholder="0"
                        className="w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg py-2.5 pl-3.5 pr-12 text-base font-medium text-zinc-100 placeholder:text-zinc-600 tabular-nums focus:outline-none transition-colors"
                      />
                      <span className="absolute right-3.5 text-xs font-mono text-zinc-400 select-none">
                        %
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {QUICK_INTEREST_RATES.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setInterestRateInput(rate)}
                          className={`px-2.5 py-1 text-xs rounded-md border tabular-nums transition-colors cursor-pointer ${
                            interestRateInput === rate
                              ? 'bg-white/[0.1] border-white/[0.25] text-zinc-100'
                              : 'bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {rate === '0' ? '0% (Sin interés)' : `${rate}%`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="expense-months"
                      className="block text-[13px] font-medium text-zinc-200 tracking-[0.01em]"
                    >
                      Tiempo (meses / cuotas)
                    </label>
                    <div className="mt-2 relative flex items-center">
                      <input
                        id="expense-months"
                        type="text"
                        inputMode="numeric"
                        value={monthsInput}
                        onChange={(e) => handleMonthsChange(e.target.value)}
                        placeholder="6"
                        className="w-full bg-[#090a0d] border border-white/[0.12] focus:border-emerald-400/70 rounded-lg py-2.5 pl-3.5 pr-16 text-base font-medium text-zinc-100 placeholder:text-zinc-600 tabular-nums focus:outline-none transition-colors"
                      />
                      <span className="absolute right-3.5 text-xs font-mono text-zinc-400 select-none">
                        meses
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {QUICK_MONTH_TERMS.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => setMonthsInput(String(term))}
                          className={`px-2.5 py-1 text-xs rounded-md border tabular-nums transition-colors cursor-pointer ${
                            parsedMonths === term
                              ? 'bg-white/[0.1] border-white/[0.25] text-zinc-100'
                              : 'bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {term} meses
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Cálculo en vivo de intereses y cuota */}
                <div className="rounded-xl bg-[#181b22] border border-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-zinc-200">
                      Resumen del pago a plazos
                    </span>
                    <span className="text-zinc-400 tabular-nums">
                      {parsedRate}% mensual · {parsedMonths}{' '}
                      {parsedMonths === 1 ? 'mes' : 'meses'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] tabular-nums">
                    <div className="p-4">
                      <p className="text-xs text-zinc-400">Cuota mensual aprox.</p>
                      <p className="mt-1.5 text-lg sm:text-xl font-semibold text-zinc-50">
                        {formatCurrency(installmentSummary.monthlyPayment)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">por mes</p>
                    </div>

                    <div className="p-4">
                      <p className="text-xs text-zinc-400">Intereses totales</p>
                      <p className="mt-1.5 text-lg sm:text-xl font-semibold text-[#f08c84]">
                        +{formatCurrency(installmentSummary.interestAmount)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {parsedRate === 0 ? 'Sin intereses' : 'Costo de financiación'}
                      </p>
                    </div>

                    <div className="p-4 bg-white/[0.02]">
                      <p className="text-xs text-zinc-300">Total a pagar</p>
                      <p className="mt-1.5 text-lg sm:text-xl font-semibold text-[#10d47e]">
                        {formatCurrency(installmentSummary.totalAmount)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        Compra + intereses
                      </p>
                    </div>
                  </div>
                </div>

                {/* Selección y creación de tarjetas en el mismo menú */}
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="block text-[13px] font-medium text-zinc-200 tracking-[0.01em]">
                      ¿Qué tarjeta usaste?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCard((prev) => !prev);
                        setCardFormError('');
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{isAddingCard ? 'Cerrar' : 'Agregar tarjeta'}</span>
                    </button>
                  </div>

                  {cards.length > 0 && (
                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {cards.map((card) => {
                        const isSelected = selectedCardId === card.id;
                        return (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => {
                              setSelectedCardId(card.id);
                              setInstallmentError('');
                            }}
                            aria-pressed={isSelected}
                            className={`px-3.5 py-2.5 rounded-lg border text-left text-sm font-medium transition-colors cursor-pointer flex items-center justify-between gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                              isSelected
                                ? 'bg-emerald-400/[0.12] border-emerald-400/60 text-emerald-300'
                                : 'bg-[#0b0c10] border-white/[0.08] text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <CreditCard
                                className="w-4 h-4 text-zinc-400 shrink-0"
                                strokeWidth={1.6}
                                aria-hidden="true"
                              />
                              <span className="truncate tabular-nums">
                                {formatCardLabel(card)}
                              </span>
                            </span>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {isAddingCard && (
                    <div className="mt-3 p-4 rounded-lg bg-[#090a0d] border border-white/[0.12] space-y-3">
                      <p className="text-xs font-medium text-zinc-300">
                        Nueva tarjeta
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-8">
                          <input
                            type="text"
                            maxLength={32}
                            value={newCardName}
                            onChange={(e) => {
                              setNewCardName(e.target.value);
                              if (cardFormError) setCardFormError('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCreateCard();
                              }
                            }}
                            placeholder="Nombre o banco (ej. Nu Visa, Bancolombia)"
                            aria-label="Nombre de la nueva tarjeta"
                            className="w-full bg-[#111216] border border-white/[0.1] focus:border-emerald-400/60 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            value={newCardLast4}
                            onChange={(e) =>
                              setNewCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCreateCard();
                              }
                            }}
                            placeholder="Últimos 4 dígitos"
                            aria-label="Últimos 4 dígitos de la tarjeta"
                            className="w-full bg-[#111216] border border-white/[0.1] focus:border-emerald-400/60 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 tabular-nums focus:outline-none"
                          />
                        </div>
                      </div>

                      {cardFormError && (
                        <p role="alert" className="text-xs text-[#e07a73]">
                          {cardFormError}
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={isSavingCard}
                          onClick={() => {
                            setIsAddingCard(false);
                            setCardFormError('');
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={isSavingCard}
                          onClick={handleCreateCard}
                          className="px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white disabled:opacity-60 text-zinc-950 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isSavingCard ? 'Guardando...' : 'Guardar y seleccionar'}
                        </button>
                      </div>
                    </div>
                  )}

                  {installmentError && (
                    <p role="alert" className="mt-2 text-xs text-[#e07a73]">
                      {installmentError}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Panel lateral: Vista previa de impacto y confirmación */}
        <aside className="lg:col-span-4 bg-gradient-to-b from-[#17191f]/95 to-[#111216]/95 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-6 sm:p-7 space-y-6">
          <div>
            <h2 className="font-display text-lg font-medium text-zinc-100">
              Impacto en tu mes
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Así quedará tu saldo después de guardar este movimiento.
            </p>
          </div>

          <div className="space-y-3.5 text-sm border-y border-white/[0.07] py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-400">Disponible actual</span>
              <span className="font-medium text-zinc-100 tabular-nums">
                {formatCurrency(availableBalance)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-400">Monto del gasto</span>
              <span className="font-medium text-[#e07a73] tabular-nums">
                {parsedAmount > 0 ? `−${formatCurrency(parsedAmount)}` : '$ 0'}
              </span>
            </div>

            {paymentType === 'installments' && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-400 tabular-nums">
                  Intereses ({parsedRate}% · {parsedMonths}m)
                </span>
                <span className="font-medium text-[#e07a73] tabular-nums">
                  {installmentSummary.interestAmount > 0
                    ? `−${formatCurrency(installmentSummary.interestAmount)}`
                    : '$ 0'}
                </span>
              </div>
            )}

            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
              <span className="font-medium text-zinc-200">Nuevo disponible</span>
              <span
                className={`text-lg font-semibold tabular-nums ${
                  projectedBalance < 0 ? 'text-red-400' : 'text-[#10d47e]'
                }`}
              >
                {formatCurrency(projectedBalance)}
              </span>
            </div>
          </div>

          {submitError && (
            <p role="alert" className="text-xs text-[#e07a73]">
              {submitError}
            </p>
          )}

          <div className="space-y-2.5">
            <button
              type="submit"
              disabled={isSubmitting || isSavingCard}
              className="w-full py-3 px-4 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] disabled:opacity-60 text-[#042415] font-semibold text-sm transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              {isSubmitting
                ? isEditing
                  ? 'Guardando cambios...'
                  : 'Guardando gasto...'
                : isEditing
                  ? 'Guardar cambios'
                  : 'Guardar gasto'}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
              className="w-full py-2.5 px-4 rounded-lg bg-transparent hover:bg-white/[0.05] disabled:opacity-50 border border-white/[0.08] text-zinc-300 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              Cancelar
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
