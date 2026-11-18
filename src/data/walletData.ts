export type ExpenseCategory =
  | 'Alimentación'
  | 'Transporte'
  | 'Cafetería'
  | 'Hogar'
  | 'Salud y farmacia'
  | 'Restaurantes'
  | 'Servicios'
  | 'Entretenimiento'
  | 'Otros';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Alimentación',
  'Transporte',
  'Cafetería',
  'Hogar',
  'Salud y farmacia',
  'Restaurantes',
  'Servicios',
  'Entretenimiento',
  'Otros',
];

export type PaymentType = 'single' | 'installments';
export type BudgetMode = 'fixed' | 'variable';

export interface PaymentCard {
  id: string;
  name: string;
  last4?: string;
}

export type IncomeStatus = 'active' | 'reverted';

export interface IncomeEntry {
  id: string;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  createdAt: number;
  status?: IncomeStatus;
  revertedAt?: number;
}

export type SavingsEntryType = 'deposit' | 'withdraw';

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount?: number;
  createdAt: number;
}

export interface SavingsEntry {
  id: string;
  goalId: string;
  goalName: string;
  type: SavingsEntryType;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  createdAt: number;
}

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  date: string; // YYYY-MM-DD
  createdAt: number;
  paymentType: PaymentType;
  interestAmount?: number;
  interestRatePercent?: number;
  installmentMonths?: number;
  cardId?: string;
  cardLabel?: string;
}

export interface DailySpend {
  day: number;
  dateLabel: string;
  amount: number | null;
}

export const MONTHLY_BUDGET_COP = 3600000;
export const CURRENT_MONTH_PREFIX = '2026-11';
export const CURRENT_DAY = 18;
export const TOTAL_DAYS_IN_MONTH = 30;
export const DEFAULT_TODAY_ISO = '2026-11-18';
export const MONTH_LABEL = 'Noviembre 2026';

export const INITIAL_CARDS: PaymentCard[] = [
  { id: 'card-1', name: 'Visa Clásica', last4: '4821' },
  { id: 'card-2', name: 'Mastercard', last4: '9104' },
];

export function formatCardLabel(card: PaymentCard): string {
  return card.last4 ? `${card.name} ···· ${card.last4}` : card.name;
}

export function calculateInstallmentInterest(
  principal: number,
  monthlyRatePercent: number,
  months: number
): { interestAmount: number; monthlyPayment: number; totalAmount: number } {
  if (principal <= 0 || months <= 0) {
    return { interestAmount: 0, monthlyPayment: 0, totalAmount: Math.max(principal, 0) };
  }

  if (monthlyRatePercent <= 0) {
    return {
      interestAmount: 0,
      monthlyPayment: Math.round(principal / months),
      totalAmount: principal,
    };
  }

  const i = monthlyRatePercent / 100;
  const factor = Math.pow(1 + i, months);
  const monthlyExact = (principal * i * factor) / (factor - 1);
  const totalExact = monthlyExact * months;
  const interestAmount = Math.max(Math.round(totalExact - principal), 0);

  return {
    interestAmount,
    monthlyPayment: Math.round(monthlyExact),
    totalAmount: principal + interestAmount,
  };
}

export function getExpenseTotalAmount(expense: Expense): number {
  if (expense.paymentType === 'installments') {
    return expense.amount + (expense.interestAmount ?? 0);
  }
  return expense.amount;
}

export const INITIAL_EXPENSES: Expense[] = [
  {
    id: 'exp-19',
    amount: 134000,
    category: 'Alimentación',
    description: 'Mercado semanal de frutas, verduras y despensa',
    date: '2026-11-18',
    createdAt: 1795003200000,
    paymentType: 'single',
  },
  {
    id: 'exp-18',
    amount: 85000,
    category: 'Transporte',
    description: 'Recarga de tarjeta de transporte y trayectos urbanos',
    date: '2026-11-17',
    createdAt: 1794938400000,
    paymentType: 'single',
  },
  {
    id: 'exp-17',
    amount: 58000,
    category: 'Cafetería',
    description: 'Café filtrado y panadería artesanal de la tarde',
    date: '2026-11-17',
    createdAt: 1794924000000,
    paymentType: 'single',
  },
  {
    id: 'exp-16',
    amount: 96000,
    category: 'Salud y farmacia',
    description: 'Vitaminas y medicamentos de botiquín',
    date: '2026-11-16',
    createdAt: 1794844800000,
    paymentType: 'single',
  },
  {
    id: 'exp-15',
    amount: 125000,
    category: 'Hogar',
    description: 'Productos de limpieza y artículos de cocina',
    date: '2026-11-15',
    createdAt: 1794758400000,
    paymentType: 'installments',
    interestAmount: 10000,
    interestRatePercent: 2.2,
    installmentMonths: 6,
    cardId: 'card-1',
    cardLabel: 'Visa Clásica ···· 4821',
  },
  {
    id: 'exp-14',
    amount: 172000,
    category: 'Alimentación',
    description: 'Compra quincenal de proteínas y granos',
    date: '2026-11-14',
    createdAt: 1794672000000,
    paymentType: 'single',
  },
  {
    id: 'exp-13',
    amount: 114000,
    category: 'Entretenimiento',
    description: 'Entradas de cine y snacks',
    date: '2026-11-13',
    createdAt: 1794585600000,
    paymentType: 'single',
  },
  {
    id: 'exp-12',
    amount: 72000,
    category: 'Transporte',
    description: 'Servicio de taxi nocturno y peaje',
    date: '2026-11-12',
    createdAt: 1794499200000,
    paymentType: 'single',
  },
  {
    id: 'exp-11',
    amount: 94000,
    category: 'Cafetería',
    description: 'Desayuno de trabajo con cliente',
    date: '2026-11-11',
    createdAt: 1794412800000,
    paymentType: 'single',
  },
  {
    id: 'exp-10',
    amount: 138000,
    category: 'Servicios',
    description: 'Factura mensual de internet fibra óptica',
    date: '2026-11-10',
    createdAt: 1794326400000,
    paymentType: 'single',
  },
  {
    id: 'exp-09',
    amount: 45000,
    category: 'Alimentación',
    description: 'Pan, huevos y lácteos del barrio',
    date: '2026-11-09',
    createdAt: 1794240000000,
    paymentType: 'single',
  },
  {
    id: 'exp-08',
    amount: 120000,
    category: 'Hogar',
    description: 'Bombillos LED y repuestos de ferretería',
    date: '2026-11-08',
    createdAt: 1794153600000,
    paymentType: 'single',
  },
  {
    id: 'exp-07',
    amount: 215000,
    category: 'Restaurantes',
    description: 'Almuerzo familiar de fin de semana',
    date: '2026-11-07',
    createdAt: 1794067200000,
    paymentType: 'single',
  },
  {
    id: 'exp-06',
    amount: 82000,
    category: 'Salud y farmacia',
    description: 'Cuota moderadora de control odontológico',
    date: '2026-11-06',
    createdAt: 1793980800000,
    paymentType: 'single',
  },
  {
    id: 'exp-05',
    amount: 165000,
    category: 'Alimentación',
    description: 'Plaza de mercado: frutas, verduras y café',
    date: '2026-11-05',
    createdAt: 1793894400000,
    paymentType: 'single',
  },
  {
    id: 'exp-04',
    amount: 48000,
    category: 'Transporte',
    description: 'Pasajes y traslados de la semana',
    date: '2026-11-04',
    createdAt: 1793808000000,
    paymentType: 'single',
  },
  {
    id: 'exp-03',
    amount: 102000,
    category: 'Hogar',
    description: 'Servicio de lavandería y tintorería',
    date: '2026-11-03',
    createdAt: 1793721600000,
    paymentType: 'single',
  },
  {
    id: 'exp-02',
    amount: 64000,
    category: 'Cafetería',
    description: 'Bolsa de café en grano de origen',
    date: '2026-11-02',
    createdAt: 1793635200000,
    paymentType: 'single',
  },
  {
    id: 'exp-01',
    amount: 185000,
    category: 'Servicios',
    description: 'Factura de energía eléctrica del apartamento',
    date: '2026-11-01',
    createdAt: 1793548800000,
    paymentType: 'single',
  },
];

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number): string {
  const rounded = Math.round(value);
  const safeRounded = Object.is(rounded, -0) ? 0 : rounded;
  return currencyFormatter.format(safeRounded);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

const SHORT_MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const FULL_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const WEEKDAYS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const [y, m, d] = isoDate.split('-').map(Number);
  return {
    year: y || 2026,
    month: m || 11,
    day: d || 1,
  };
}

export function formatShortDate(isoDate: string): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const monthAbbr = SHORT_MONTHS[month - 1] ?? 'nov';
  return `${day} ${monthAbbr} ${year}`;
}

export function formatFullDate(isoDate: string): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const dateObj = new Date(year, month - 1, day);
  const weekday = WEEKDAYS[dateObj.getDay()] ?? '';
  const monthFull = FULL_MONTHS[month - 1] ?? 'noviembre';
  return `${weekday}, ${day} de ${monthFull} de ${year}`;
}

export function sortExpensesChronologically(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.createdAt - a.createdAt;
  });
}

export function sortIncomesChronologically(incomes: IncomeEntry[]): IncomeEntry[] {
  return [...incomes].sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.createdAt - a.createdAt;
  });
}

export function buildDailySpendingSeries(expenses: Expense[]): DailySpend[] {
  const totalsByDay = new Map<number, number>();
  let maxRecordedDay = CURRENT_DAY;

  for (const exp of expenses) {
    if (exp.date.startsWith(CURRENT_MONTH_PREFIX)) {
      const { day } = parseIsoDate(exp.date);
      totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + getExpenseTotalAmount(exp));
      if (day > maxRecordedDay) {
        maxRecordedDay = day;
      }
    }
  }

  return Array.from({ length: TOTAL_DAYS_IN_MONTH }, (_, index) => {
    const day = index + 1;
    const isPastOrPresent = day <= maxRecordedDay || totalsByDay.has(day);
    return {
      day,
      dateLabel: `${day} nov`,
      amount: isPastOrPresent ? totalsByDay.get(day) ?? 0 : null,
    };
  });
}
