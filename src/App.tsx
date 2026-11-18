import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  User as UserIcon,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AccountModal } from './components/AccountModal';
import { AddIncomeModal } from './components/AddIncomeModal';
import {
  AssistantChatMessage,
  AssistantPanel,
  AssistantSavingsGoalSummary,
} from './components/AssistantPanel';
import { AuthScreen } from './components/AuthScreen';
import { BudgetFormulaStrip } from './components/BudgetFormulaStrip';
import { BudgetOnboardingScreen } from './components/BudgetOnboardingScreen';
import { DailySpendingChart } from './components/DailySpendingChart';
import { ExpenseDetailScreen } from './components/ExpenseDetailScreen';
import { MovementsScreen, MovementsTab } from './components/MovementsScreen';
import { NewExpenseScreen } from './components/NewExpenseScreen';
import { RecentExpensesList } from './components/RecentExpensesList';
import { SavingsScreen } from './components/SavingsScreen';
import {
  BudgetMode,
  CURRENT_DAY,
  Expense,
  IncomeEntry,
  MONTHLY_BUDGET_COP,
  MONTH_LABEL,
  PaymentCard,
  SavingsEntry,
  SavingsGoal,
  TOTAL_DAYS_IN_MONTH,
  buildDailySpendingSeries,
  formatCurrency,
  getExpenseTotalAmount,
  parseIsoDate,
  sortExpensesChronologically,
  sortIncomesChronologically,
} from './data/walletData';
import { auth, testConnection } from './firebase';
import {
  ExpenseWriteInput,
  IncomeWriteInput,
  createUserWalletWithBudget,
  deleteAllUserData,
  persistBudgetMode,
  persistDeletedExpense,
  persistDeletedIncome,
  persistDeletedSavingsEntry,
  persistDeletedSavingsGoal,
  persistMonthlyBudget,
  persistNewCard,
  persistNewExpense,
  persistNewIncome,
  persistNewSavingsEntry,
  persistRestoreIncome,
  persistRevertIncome,
  persistSavingsGoalAndOptionalEntry,
  persistUpdatedExpense,
  persistUpdatedIncome,
  persistUpdatedSavingsGoal,
  subscribeUserWalletData,
} from './services/walletStore';

type ScreenView = 'dashboard' | 'new-expense' | 'movements' | 'savings' | 'detail';

function formatGroupedDigits(digits: string): string {
  if (!digits) return '';
  const num = Math.round(Number(digits));
  if (!Number.isFinite(num) || num <= 0) return '';
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(num);
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accountDeletedNotice, setAccountDeletedNotice] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isAssistantMinimized, setIsAssistantMinimized] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<AssistantChatMessage[]>([]);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [savingsEntries, setSavingsEntries] = useState<SavingsEntry[]>([]);
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('fixed');
  const [baseBudget, setBaseBudget] = useState<number>(MONTHLY_BUDGET_COP);
  const [cards, setCards] = useState<PaymentCard[]>([]);

  const [activeScreen, setActiveScreen] = useState<ScreenView>('dashboard');
  const [movementsInitialTab, setMovementsInitialTab] = useState<MovementsTab>('all');
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [justAddedExpenseId, setJustAddedExpenseId] = useState<string | null>(null);
  const [incomeBanner, setIncomeBanner] = useState<{
    type: 'added' | 'reverted';
    id: string;
    amount: number;
    description: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeEntry | null>(null);

  const [walletReady, setWalletReady] = useState(false);
  const [needsBudgetSetup, setNeedsBudgetSetup] = useState(false);
  const [cardsReady, setCardsReady] = useState(false);
  const [expensesReady, setExpensesReady] = useState(false);
  const [incomesReady, setIncomesReady] = useState(false);
  const [savingsGoalsReady, setSavingsGoalsReady] = useState(false);
  const [savingsEntriesReady, setSavingsEntriesReady] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  // Inline budget edit for Day Zero empty dashboard
  const [isEditingEmptyBudget, setIsEditingEmptyBudget] = useState(false);
  const [emptyBudgetDigits, setEmptyBudgetDigits] = useState(String(MONTHLY_BUDGET_COP));
  const [emptyBudgetError, setEmptyBudgetError] = useState('');
  const [isSavingEmptyBudget, setIsSavingEmptyBudget] = useState(false);

  const unsubscribeWalletRef = useRef<(() => void) | null>(null);

  if (fatalError) {
    throw fatalError;
  }

  useEffect(() => {
    testConnection();

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      setExpenses([]);
      setIncomes([]);
      setSavingsGoals([]);
      setSavingsEntries([]);
      setCards([]);
      setBudgetMode('fixed');
      setBaseBudget(MONTHLY_BUDGET_COP);
      setSelectedExpenseId(null);
      setEditingExpenseId(null);
      setSelectedDay(null);
      setJustAddedExpenseId(null);
      setIncomeBanner(null);
      setStatusMessage(null);
      setActiveScreen('dashboard');
      setMovementsInitialTab('all');
      setIsAddIncomeOpen(false);
      setEditingIncome(null);
      setIsEditingEmptyBudget(false);
      setIsAccountModalOpen(false);
      setIsAssistantOpen(false);
      setIsAssistantMinimized(false);
      setAssistantMessages([]);
      setWalletReady(false);
      setNeedsBudgetSetup(false);
      setCardsReady(false);
      setExpensesReady(false);
      setIncomesReady(false);
      setSavingsGoalsReady(false);
      setSavingsEntriesReady(false);
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (unsubscribeWalletRef.current) {
      unsubscribeWalletRef.current();
      unsubscribeWalletRef.current = null;
    }

    if (!currentUser) {
      return;
    }

    let active = true;
    const unsub = subscribeUserWalletData(currentUser.uid, {
      onWallet: (wallet) => {
        if (!active) return;
        setBudgetMode(wallet.budgetMode);
        setBaseBudget(wallet.monthlyBudget);
        setNeedsBudgetSetup(false);
        setWalletReady(true);
      },
      onWalletMissing: () => {
        if (!active) return;
        setNeedsBudgetSetup(true);
        setWalletReady(true);
      },
      onCards: (nextCards) => {
        if (!active) return;
        setCards(nextCards);
        setCardsReady(true);
      },
      onExpenses: (nextExpenses) => {
        if (!active) return;
        setExpenses(nextExpenses);
        setExpensesReady(true);
      },
      onIncomes: (nextIncomes) => {
        if (!active) return;
        setIncomes(nextIncomes);
        setIncomesReady(true);
      },
      onSavingsGoals: (nextGoals) => {
        if (!active) return;
        setSavingsGoals(nextGoals);
        setSavingsGoalsReady(true);
      },
      onSavingsEntries: (nextEntries) => {
        if (!active) return;
        setSavingsEntries(nextEntries);
        setSavingsEntriesReady(true);
      },
      onError: (err) => {
        if (!active) return;
        setFatalError(err);
      },
    });

    unsubscribeWalletRef.current = unsub;

    return () => {
      active = false;
      unsub();
      if (unsubscribeWalletRef.current === unsub) {
        unsubscribeWalletRef.current = null;
      }
    };
  }, [currentUser?.uid]);

  const sortedExpenses = useMemo(
    () => sortExpensesChronologically(expenses),
    [expenses]
  );

  const sortedIncomes = useMemo(
    () => sortIncomesChronologically(incomes),
    [incomes]
  );

  const activeIncomes = useMemo(
    () => sortedIncomes.filter((item) => item.status !== 'reverted'),
    [sortedIncomes]
  );

  const hasExpenses = sortedExpenses.length > 0;

  const dailySpending = useMemo(
    () => buildDailySpendingSeries(sortedExpenses),
    [sortedExpenses]
  );

  const totalSpent = useMemo(
    () => sortedExpenses.reduce((sum, item) => sum + getExpenseTotalAmount(item), 0),
    [sortedExpenses]
  );

  const totalIncome = useMemo(
    () => activeIncomes.reduce((sum, item) => sum + item.amount, 0),
    [activeIncomes]
  );

  const effectiveBaseBudget = budgetMode === 'variable' ? 0 : baseBudget;
  const totalFunds = effectiveBaseBudget + totalIncome;
  const availableBalance = totalFunds - totalSpent;

  const savingsGoalSummaries = useMemo<AssistantSavingsGoalSummary[]>(() => {
    const map = new Map<string, number>();
    for (const goal of savingsGoals) {
      map.set(goal.id, 0);
    }
    for (const entry of savingsEntries) {
      const current = map.get(entry.goalId) ?? 0;
      const delta = entry.type === 'withdraw' ? -entry.amount : entry.amount;
      map.set(entry.goalId, current + delta);
    }
    return savingsGoals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      savedAmount: Math.max(map.get(goal.id) ?? 0, 0),
      ...(goal.targetAmount ? { targetAmount: goal.targetAmount } : {}),
    }));
  }, [savingsGoals, savingsEntries]);

  const totalSaved = useMemo(
    () => savingsGoalSummaries.reduce((sum, g) => sum + g.savedAmount, 0),
    [savingsGoalSummaries]
  );

  const maxActiveDay = dailySpending.reduce(
    (max, item) => (item.amount !== null && item.day > max ? item.day : max),
    CURRENT_DAY
  );
  const daysRemaining = Math.max(TOTAL_DAYS_IN_MONTH - maxActiveDay, 0);

  const selectedExpense = useMemo(
    () => sortedExpenses.find((e) => e.id === selectedExpenseId) ?? null,
    [sortedExpenses, selectedExpenseId]
  );

  const editingExpense = useMemo(
    () => sortedExpenses.find((e) => e.id === editingExpenseId) ?? null,
    [sortedExpenses, editingExpenseId]
  );

  const justAddedExpense = useMemo(
    () => sortedExpenses.find((e) => e.id === justAddedExpenseId) ?? null,
    [sortedExpenses, justAddedExpenseId]
  );

  const sameDayTotalForDetail = useMemo(() => {
    if (!selectedExpense) return 0;
    return sortedExpenses
      .filter((e) => e.date === selectedExpense.date)
      .reduce((sum, e) => sum + getExpenseTotalAmount(e), 0);
  }, [sortedExpenses, selectedExpense]);

  if (!authReady) {
    return (
      <div className="min-h-screen text-zinc-100 flex items-center justify-center px-5">
        <p className="text-sm text-zinc-400">Cargando tu billetera...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        accountDeletedNotice={accountDeletedNotice}
        onDismissNotice={() => setAccountDeletedNotice(false)}
      />
    );
  }

  const isLoadingUserData =
    !walletReady ||
    (!needsBudgetSetup &&
      (!cardsReady ||
        !expensesReady ||
        !incomesReady ||
        !savingsGoalsReady ||
        !savingsEntriesReady));

  if (isLoadingUserData) {
    return (
      <div className="min-h-screen text-zinc-100 flex items-center justify-center px-5">
        <p className="text-sm text-zinc-400">Cargando tu billetera...</p>
      </div>
    );
  }

  async function handleSignOut() {
    if (unsubscribeWalletRef.current) {
      unsubscribeWalletRef.current();
      unsubscribeWalletRef.current = null;
    }
    await signOut(auth);
  }

  if (needsBudgetSetup) {
    return (
      <BudgetOnboardingScreen
        userEmail={currentUser.email}
        onComplete={(options) => createUserWalletWithBudget(currentUser.uid, options)}
        onSignOut={handleSignOut}
      />
    );
  }

  async function handleUpdateBudget(newBudget: number) {
    if (!currentUser) return;
    await persistMonthlyBudget(currentUser.uid, newBudget);
  }

  async function handleSwitchBudgetMode(mode: BudgetMode) {
    if (!currentUser) return;
    await persistBudgetMode(
      currentUser.uid,
      mode,
      mode === 'fixed' ? (baseBudget > 0 ? baseBudget : MONTHLY_BUDGET_COP) : 0
    );
  }

  async function handleSaveIncome(input: IncomeWriteInput) {
    if (!currentUser) return;
    if (editingIncome) {
      await persistUpdatedIncome(currentUser.uid, editingIncome.id, input);
      setEditingIncome(null);
      return;
    }
    const newId = await persistNewIncome(currentUser.uid, input);
    setIncomeBanner({
      type: 'added',
      id: newId,
      amount: Math.round(input.amount),
      description: input.description.trim() || 'Ingreso adicional',
    });
  }

  async function handleRevertIncome(incomeId: string) {
    if (!currentUser) return;
    const target = sortedIncomes.find((i) => i.id === incomeId);
    await persistRevertIncome(currentUser.uid, incomeId);
    if (target) {
      setIncomeBanner({
        type: 'reverted',
        id: incomeId,
        amount: target.amount,
        description: target.description,
      });
    }
  }

  async function handleRestoreIncome(incomeId: string) {
    if (!currentUser) return;
    const target = sortedIncomes.find((i) => i.id === incomeId);
    await persistRestoreIncome(currentUser.uid, incomeId);
    if (target) {
      setIncomeBanner({
        type: 'added',
        id: incomeId,
        amount: target.amount,
        description: target.description,
      });
    }
  }

  async function handleDeleteIncome(incomeId: string) {
    if (!currentUser) return;
    await persistDeletedIncome(currentUser.uid, incomeId);
    if (incomeBanner?.id === incomeId) {
      setIncomeBanner(null);
    }
  }

  async function handleAddCard(input: { name: string; last4?: string }): Promise<PaymentCard> {
    if (!currentUser) {
      throw new Error('Sesión no activa.');
    }
    return persistNewCard(currentUser.uid, input);
  }

  async function handleSaveExpense(input: ExpenseWriteInput) {
    if (!currentUser) return;

    if (editingExpense) {
      await persistUpdatedExpense(currentUser.uid, editingExpense.id, input);
      setSelectedExpenseId(editingExpense.id);
      setSelectedDay(parseIsoDate(input.date).day);
      setEditingExpenseId(null);
      setStatusMessage('Gasto actualizado en tu billetera.');
      setActiveScreen('detail');
      return;
    }

    const newId = await persistNewExpense(currentUser.uid, input);
    setJustAddedExpenseId(newId);
    setStatusMessage(null);
    setSelectedDay(parseIsoDate(input.date).day);
    setActiveScreen('dashboard');
  }

  async function handleRegisterExpenseFromAssistant(input: ExpenseWriteInput) {
    if (!currentUser) {
      throw new Error('Sesión no activa.');
    }
    const newId = await persistNewExpense(currentUser.uid, input);
    setJustAddedExpenseId(newId);
    setSelectedDay(parseIsoDate(input.date).day);
  }

  async function handleRegisterIncomeFromAssistant(input: IncomeWriteInput) {
    if (!currentUser) {
      throw new Error('Sesión no activa.');
    }
    await persistNewIncome(currentUser.uid, input);
  }

  function handleToggleAssistant() {
    if (!isAssistantOpen) {
      setIsAssistantOpen(true);
      setIsAssistantMinimized(false);
      return;
    }
    if (isAssistantMinimized) {
      setIsAssistantMinimized(false);
      return;
    }
    setIsAssistantOpen(false);
  }

  const accountDisplayName =
    currentUser.email?.split('@')[0] || currentUser.displayName || 'Cuenta';

  function handleStartEditExpense(expense: Expense) {
    setEditingExpenseId(expense.id);
    setStatusMessage(null);
    setActiveScreen('new-expense');
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!currentUser) return;
    await persistDeletedExpense(currentUser.uid, expenseId);
    if (selectedExpenseId === expenseId) {
      setSelectedExpenseId(null);
    }
    if (editingExpenseId === expenseId) {
      setEditingExpenseId(null);
    }
    if (justAddedExpenseId === expenseId) {
      setJustAddedExpenseId(null);
    }
    setStatusMessage(null);
    setMovementsInitialTab('expenses');
    setActiveScreen('movements');
  }

  function handleOpenDetail(expenseId: string) {
    setSelectedExpenseId(expenseId);
    setStatusMessage(null);
    setActiveScreen('detail');
  }

  function handleNavigate(screen: ScreenView, tab?: MovementsTab) {
    if (screen !== 'dashboard') {
      setJustAddedExpenseId(null);
      setIncomeBanner(null);
    }
    if (screen !== 'new-expense') {
      setEditingExpenseId(null);
    }
    if (screen !== 'detail') {
      setStatusMessage(null);
    }
    if (screen === 'movements') {
      setMovementsInitialTab(tab ?? (sortedIncomes.length > 0 ? 'all' : 'expenses'));
    }
    setActiveScreen(screen);
  }

  function openNewIncomeModal() {
    setEditingIncome(null);
    setIsAddIncomeOpen(true);
  }

  function startEditingEmptyBudget() {
    setEmptyBudgetDigits(String(Math.round(baseBudget > 0 ? baseBudget : MONTHLY_BUDGET_COP)));
    setEmptyBudgetError('');
    setIsEditingEmptyBudget(true);
  }

  function handleEmptyBudgetInputChange(value: string) {
    const trimmed = value.trim();
    const decimalMatch = trimmed.match(/^(\d+)[.,](\d{1,2})$/);
    if (decimalMatch) {
      const rounded = Math.round(Number(`${decimalMatch[1]}.${decimalMatch[2]}`));
      setEmptyBudgetDigits(rounded > 0 ? String(rounded).slice(0, 10) : '');
    } else {
      setEmptyBudgetDigits(value.replace(/\D/g, '').slice(0, 10));
    }
    if (emptyBudgetError) setEmptyBudgetError('');
  }

  async function handleSaveEmptyBudget(e: FormEvent) {
    e.preventDefault();
    if (isSavingEmptyBudget) return;
    const parsed = emptyBudgetDigits ? Math.round(Number(emptyBudgetDigits)) : 0;
    if (!parsed || parsed <= 0) {
      setEmptyBudgetError('Ingresa un monto mayor a $ 0');
      return;
    }
    setIsSavingEmptyBudget(true);
    setEmptyBudgetError('');
    try {
      await handleUpdateBudget(parsed);
      setIsEditingEmptyBudget(false);
    } catch {
      setEmptyBudgetError('No se pudo guardar el presupuesto.');
    } finally {
      setIsSavingEmptyBudget(false);
    }
  }

  const effectiveAvailableForForm = editingExpense
    ? availableBalance + getExpenseTotalAmount(editingExpense)
    : availableBalance;

  return (
    <div className="min-h-screen text-zinc-100">
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 lg:px-10 py-6 sm:py-8">
        {/* Top Bar Contract: Brand wordmark — Nav links — Account & primary CTA */}
        <header className="flex flex-wrap items-center justify-between gap-4 sm:gap-6 pb-5 border-b border-white/[0.08]">
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-zinc-50 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded"
          >
            Tu billetera
          </button>

          <nav
            aria-label="Navegación principal"
            className="flex items-center gap-5 sm:gap-6 text-sm font-medium order-3 sm:order-2 w-full sm:w-auto pt-1 sm:pt-0 overflow-x-auto"
          >
            <button
              type="button"
              onClick={() => handleNavigate('dashboard')}
              className={`whitespace-nowrap shrink-0 pb-1 border-b transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                activeScreen === 'dashboard'
                  ? 'text-zinc-50 border-emerald-400'
                  : 'text-zinc-400 border-transparent hover:text-zinc-100'
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('movements')}
              className={`whitespace-nowrap shrink-0 pb-1 border-b transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                activeScreen === 'movements'
                  ? 'text-zinc-50 border-emerald-400'
                  : 'text-zinc-400 border-transparent hover:text-zinc-100'
              }`}
            >
              Movimientos
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('savings')}
              className={`whitespace-nowrap shrink-0 pb-1 border-b transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                activeScreen === 'savings'
                  ? 'text-zinc-50 border-emerald-400'
                  : 'text-zinc-400 border-transparent hover:text-zinc-100'
              }`}
            >
              Ahorros
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('detail')}
              className={`whitespace-nowrap shrink-0 pb-1 border-b transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                activeScreen === 'detail'
                  ? 'text-zinc-50 border-emerald-400'
                  : 'text-zinc-400 border-transparent hover:text-zinc-100'
              }`}
            >
              Detalle
            </button>
          </nav>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 order-2 sm:order-3">
            <button
              type="button"
              onClick={() => setIsAccountModalOpen(true)}
              aria-label="Administrar cuenta"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-zinc-200 transition-colors cursor-pointer whitespace-nowrap max-w-[150px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
            >
              <UserIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden="true" />
              <span className="truncate">{accountDisplayName}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleAssistant}
              aria-expanded={isAssistantOpen && !isAssistantMinimized}
              className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg border text-xs sm:text-sm font-semibold tracking-[0.02em] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${
                isAssistantOpen && !isAssistantMinimized
                  ? 'bg-emerald-400/20 border-emerald-400/55 text-emerald-300'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.12] text-zinc-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#10d47e] shrink-0" aria-hidden="true" />
              <span>ASISTENTE</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingExpenseId(null);
                handleNavigate('new-expense');
              }}
              className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
                activeScreen === 'new-expense'
                  ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/50'
                  : 'bg-[#10d47e] hover:bg-[#19e28a] text-[#042415]'
              }`}
            >
              <Plus className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
              <span>Registrar gasto</span>
            </button>
          </div>
        </header>

        {/* Active Screen */}
        <main className="mt-7">
          {activeScreen === 'dashboard' && !hasExpenses && (
            <section
              aria-label="Dashboard vacío"
              className="bg-gradient-to-br from-[#1b1d22]/95 via-[#131418]/95 to-[#181a20]/95 border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] rounded-xl px-6 py-14 sm:py-20 text-center"
            >
              <div className="max-w-lg mx-auto space-y-4">
                <p className="text-xs text-zinc-400 tabular-nums">{MONTH_LABEL}</p>
                <h1 className="font-display text-3xl sm:text-4xl font-medium text-zinc-50 tracking-tight text-balance">
                  Aún no hay gastos este mes
                </h1>
                <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                  Registra el primero y empieza a ver en qué se va la plata
                </p>
                <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleNavigate('new-expense')}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#10d47e] hover:bg-[#19e28a] text-[#042415] text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                  >
                    <Plus className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
                    <span>Registrar tu primer gasto</span>
                  </button>

                  <button
                    type="button"
                    onClick={openNewIncomeModal}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-sm font-medium text-zinc-100 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 text-[#10d47e]" strokeWidth={2.2} aria-hidden="true" />
                    <span>Agregar dinero</span>
                  </button>
                </div>

                <div className="pt-6 border-t border-white/[0.06] space-y-3">
                  {!isEditingEmptyBudget ? (
                    <>
                      <div className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-zinc-400 tabular-nums">
                        <span>
                          {budgetMode === 'variable'
                            ? `Dinero agregado (Freelancer): ${formatCurrency(totalFunds)}`
                            : totalIncome > 0
                              ? `Fondos disponibles: ${formatCurrency(totalFunds)} (Base ${formatCurrency(
                                  effectiveBaseBudget
                                )} + ${formatCurrency(totalIncome)})`
                              : `Presupuesto del mes: ${formatCurrency(totalFunds)}`}
                        </span>

                        {budgetMode === 'fixed' && (
                          <button
                            type="button"
                            onClick={startEditingEmptyBudget}
                            className="inline-flex items-center gap-1 text-zinc-300 hover:text-emerald-400 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" aria-hidden="true" />
                            <span>Editar</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
                        {activeIncomes.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRevertIncome(activeIncomes[0].id)}
                            className="inline-flex items-center gap-1 text-[#e07a73] hover:text-[#ea8d87] transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" aria-hidden="true" />
                            <span>
                              Revertir último (+{formatCurrency(activeIncomes[0].amount)})
                            </span>
                          </button>
                        )}
                        {sortedIncomes.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleNavigate('movements', 'all')}
                            className="text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                          >
                            Ver en Movimientos ({sortedIncomes.length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (budgetMode === 'variable') {
                              startEditingEmptyBudget();
                            } else {
                              handleSwitchBudgetMode('variable');
                            }
                          }}
                          className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                        >
                          {budgetMode === 'variable'
                            ? 'Cambiar a presupuesto fijo'
                            : 'Soy freelancer (empezar en $ 0)'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <form
                      onSubmit={handleSaveEmptyBudget}
                      className="max-w-xs mx-auto space-y-2.5"
                    >
                      <div className="relative flex items-center">
                        <span
                          aria-hidden="true"
                          className="absolute left-3 text-sm font-semibold text-zinc-400 select-none"
                        >
                          $
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoFocus
                          aria-label="Presupuesto del mes en pesos colombianos"
                          value={formatGroupedDigits(emptyBudgetDigits)}
                          onChange={(e) => handleEmptyBudgetInputChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape' && !isSavingEmptyBudget) {
                              e.preventDefault();
                              setIsEditingEmptyBudget(false);
                            }
                          }}
                          className="w-full bg-[#090a0d] border border-emerald-400/60 rounded-lg py-2 pl-7 pr-3 text-base font-semibold text-zinc-50 tabular-nums focus:outline-none"
                        />
                      </div>
                      {emptyBudgetError && (
                        <p role="alert" className="text-[11px] text-[#e07a73]">
                          {emptyBudgetError}
                        </p>
                      )}
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="submit"
                          disabled={isSavingEmptyBudget}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#10d47e] hover:bg-[#19e28a] disabled:opacity-60 text-[#042415] text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isSavingEmptyBudget ? 'Guardando...' : 'Guardar'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isSavingEmptyBudget}
                          onClick={() => setIsEditingEmptyBudget(false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Cancelar</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeScreen === 'dashboard' && incomeBanner && (
            <div
              role="status"
              className={`mb-5 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border ${
                incomeBanner.type === 'reverted'
                  ? 'bg-[#e07a73]/[0.08] border-[#e07a73]/30 text-zinc-200'
                  : 'bg-emerald-500/[0.08] border-emerald-400/30 text-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2.5 text-sm">
                {incomeBanner.type === 'reverted' ? (
                  <RotateCcw className="w-4 h-4 text-[#e07a73] shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {incomeBanner.type === 'reverted' ? (
                    <>
                      Ingreso revertido: <strong>−{formatCurrency(incomeBanner.amount)}</strong> (
                      {incomeBanner.description}). Ya quedó registrado en Movimientos.
                    </>
                  ) : (
                    <>
                      Dinero agregado: <strong>+{formatCurrency(incomeBanner.amount)}</strong> (
                      {incomeBanner.description}).
                    </>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs font-medium">
                {incomeBanner.type === 'added' && (
                  <button
                    type="button"
                    onClick={() => handleRevertIncome(incomeBanner.id)}
                    className="inline-flex items-center gap-1 text-[#e07a73] hover:text-[#ea8d87] cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Revertir</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleNavigate('movements', 'all')}
                  className="inline-flex items-center gap-1 text-zinc-200 hover:text-white cursor-pointer whitespace-nowrap"
                >
                  <span>Ver en Movimientos</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setIncomeBanner(null)}
                  aria-label="Cerrar aviso"
                  className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {activeScreen === 'dashboard' && hasExpenses && (
            <div className="space-y-6">
              {justAddedExpense && (
                <div
                  role="status"
                  className="bg-emerald-500/[0.08] border border-emerald-400/30 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 text-sm text-emerald-200">
                    <CheckCircle2
                      className="w-4 h-4 text-emerald-400 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Gasto guardado: <strong>{justAddedExpense.description}</strong> (
                      {formatCurrency(getExpenseTotalAmount(justAddedExpense))}) en{' '}
                      {justAddedExpense.category}
                      {justAddedExpense.paymentType === 'installments' &&
                        ` · A plazos (${justAddedExpense.cardLabel ?? 'Tarjeta'})`}
                      .
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(justAddedExpense.id)}
                      className="text-emerald-300 hover:text-emerald-200 cursor-pointer whitespace-nowrap"
                    >
                      Ver detalle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigate('movements', 'expenses')}
                      className="inline-flex items-center gap-1 text-zinc-200 hover:text-white cursor-pointer whitespace-nowrap"
                    >
                      <span>Ver en Movimientos</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-3xl sm:text-[34px] font-medium text-zinc-50 tracking-tight text-balance">
                    Resumen del mes
                  </h1>
                  <p className="mt-1.5 text-sm text-zinc-400 tracking-[0.01em] tabular-nums flex flex-wrap items-center gap-1.5">
                    <span>
                      {MONTH_LABEL} · {formatCurrency(totalFunds)}{' '}
                      {budgetMode === 'variable' ? 'agregados' : 'de presupuesto'} −{' '}
                      {formatCurrency(totalSpent)} en gastos =
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 font-medium ${
                        availableBalance < 0 ? 'text-[#e07a73]' : 'text-[#10d47e]'
                      }`}
                    >
                      {formatCurrency(availableBalance)}
                    </span>
                    <span>disponibles</span>
                    {availableBalance < 0 ? (
                      <ArrowDown
                        className="w-3.5 h-3.5 text-[#e07a73] shrink-0"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowUp
                        className="w-3.5 h-3.5 text-[#10d47e] shrink-0"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    )}
                  </p>
                </div>
              </div>

              <BudgetFormulaStrip
                budgetMode={budgetMode}
                baseBudget={effectiveBaseBudget}
                totalIncome={totalIncome}
                totalFunds={totalFunds}
                activeIncomes={activeIncomes}
                totalSpent={totalSpent}
                availableBalance={availableBalance}
                daysRemaining={daysRemaining}
                onUpdateBudget={handleUpdateBudget}
                onSwitchBudgetMode={handleSwitchBudgetMode}
                onOpenAddIncome={openNewIncomeModal}
                onRevertIncome={handleRevertIncome}
                onViewIncomes={() => handleNavigate('movements', 'incomes')}
              />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-7 flex">
                  <div className="w-full flex [&>section]:w-full">
                    <DailySpendingChart
                      dailySpending={dailySpending}
                      monthlyBudget={totalFunds}
                      currentDay={maxActiveDay}
                      selectedDay={selectedDay}
                      onSelectDay={setSelectedDay}
                    />
                  </div>
                </div>

                <div className="lg:col-span-5 flex">
                  <div className="w-full flex [&>section]:w-full">
                    <RecentExpensesList
                      expenses={sortedExpenses}
                      selectedDay={selectedDay}
                      highlightedExpenseId={justAddedExpenseId}
                      onHighlightDay={setSelectedDay}
                      onSelectExpense={handleOpenDetail}
                      onViewAllMovements={() => handleNavigate('movements', 'expenses')}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeScreen === 'new-expense' && (
            <NewExpenseScreen
              key={editingExpense ? editingExpense.id : 'new'}
              availableBalance={effectiveAvailableForForm}
              cards={cards}
              editingExpense={editingExpense}
              onAddCard={handleAddCard}
              onSaveExpense={handleSaveExpense}
              onCancel={() => {
                if (editingExpense) {
                  setEditingExpenseId(null);
                  setActiveScreen('detail');
                } else {
                  handleNavigate('dashboard');
                }
              }}
            />
          )}

          {activeScreen === 'movements' && (
            <MovementsScreen
              expenses={sortedExpenses}
              incomes={sortedIncomes}
              budgetMode={budgetMode}
              initialTab={movementsInitialTab}
              onSelectExpense={handleOpenDetail}
              onOpenNewExpense={() => {
                setEditingExpenseId(null);
                handleNavigate('new-expense');
              }}
              onOpenAddIncome={openNewIncomeModal}
              onEditIncome={(income) => {
                setEditingIncome(income);
                setIsAddIncomeOpen(true);
              }}
              onRevertIncome={handleRevertIncome}
              onRestoreIncome={handleRestoreIncome}
              onDeleteIncome={handleDeleteIncome}
            />
          )}

          {activeScreen === 'savings' && (
            <SavingsScreen
              goals={savingsGoals}
              entries={savingsEntries}
              onCreateGoalWithOptionalDeposit={(input) =>
                persistSavingsGoalAndOptionalEntry(currentUser.uid, input)
              }
              onUpdateGoal={(goalId, input) =>
                persistUpdatedSavingsGoal(currentUser.uid, goalId, input)
              }
              onAddEntry={(input) => persistNewSavingsEntry(currentUser.uid, input)}
              onDeleteEntry={(entryId) => persistDeletedSavingsEntry(currentUser.uid, entryId)}
              onDeleteGoal={(goalId) => persistDeletedSavingsGoal(currentUser.uid, goalId)}
            />
          )}

          {activeScreen === 'detail' && (
            <div className="space-y-4">
              {statusMessage && selectedExpense && (
                <div
                  role="status"
                  className="bg-emerald-500/[0.08] border border-emerald-400/30 rounded-xl px-4 py-3 flex items-center gap-2.5 text-sm text-emerald-200"
                >
                  <CheckCircle2
                    className="w-4 h-4 text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{statusMessage}</span>
                </div>
              )}
              <ExpenseDetailScreen
                expense={selectedExpense}
                monthlyBudget={totalFunds}
                totalMonthSpent={totalSpent}
                sameDayTotal={sameDayTotalForDetail}
                onEditExpense={handleStartEditExpense}
                onDeleteExpense={handleDeleteExpense}
                onBackToMovements={() => handleNavigate('movements', 'expenses')}
                onBackToDashboard={() => handleNavigate('dashboard')}
              />
            </div>
          )}
        </main>
      </div>

      <AddIncomeModal
        isOpen={isAddIncomeOpen}
        availableBalance={availableBalance}
        editingIncome={editingIncome}
        onClose={() => {
          setIsAddIncomeOpen(false);
          setEditingIncome(null);
        }}
        onSaveIncome={handleSaveIncome}
      />

      <AccountModal
        user={currentUser}
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onSignOut={handleSignOut}
        onBeforeDeleteAccount={() => {
          if (unsubscribeWalletRef.current) {
            unsubscribeWalletRef.current();
            unsubscribeWalletRef.current = null;
          }
        }}
        onDeleteAccountData={deleteAllUserData}
        onAccountDeleted={() => {
          setIsAccountModalOpen(false);
          setAccountDeletedNotice(true);
        }}
      />

      <AssistantPanel
        isOpen={isAssistantOpen}
        isMinimized={isAssistantMinimized}
        accountName={accountDisplayName}
        budgetMode={budgetMode}
        baseBudget={effectiveBaseBudget}
        totalIncome={totalIncome}
        monthlyBudget={totalFunds}
        totalSpent={totalSpent}
        availableBalance={availableBalance}
        expenses={sortedExpenses}
        incomes={activeIncomes}
        totalSaved={totalSaved}
        savingsGoals={savingsGoalSummaries}
        messages={assistantMessages}
        onSetMessages={setAssistantMessages}
        onMinimize={() => setIsAssistantMinimized(true)}
        onRestore={() => setIsAssistantMinimized(false)}
        onClose={() => {
          setIsAssistantOpen(false);
          setIsAssistantMinimized(false);
        }}
        onRegisterExpense={handleRegisterExpenseFromAssistant}
        onRegisterIncome={handleRegisterIncomeFromAssistant}
      />
    </div>
  );
}
