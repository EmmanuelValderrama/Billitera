import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BudgetMode,
  CURRENT_MONTH_PREFIX,
  DEFAULT_TODAY_ISO,
  EXPENSE_CATEGORIES,
  Expense,
  ExpenseCategory,
  INITIAL_CARDS,
  IncomeEntry,
  MONTHLY_BUDGET_COP,
  PaymentCard,
  PaymentType,
  SavingsEntry,
  SavingsEntryType,
  SavingsGoal,
} from '../data/walletData';
import { OperationType, db, handleFirestoreError } from '../firebase';

const MAX_COP_AMOUNT = 10_000_000_000;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function userWalletDocPath(uid: string): string {
  return `users/${uid}`;
}

export function userCardsColPath(uid: string): string {
  return `users/${uid}/cards`;
}

export function userExpensesColPath(uid: string): string {
  return `users/${uid}/expenses`;
}

export function userIncomesColPath(uid: string): string {
  return `users/${uid}/incomes`;
}

export function userSavingsGoalsColPath(uid: string): string {
  return `users/${uid}/savingsGoals`;
}

export function userSavingsEntriesColPath(uid: string): string {
  return `users/${uid}/savingsEntries`;
}

export interface ExpenseWriteInput {
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
}

export interface IncomeWriteInput {
  amount: number;
  description: string;
  date: string;
}

export interface WalletSnapshot {
  ownerId: string;
  budgetMode: BudgetMode;
  monthlyBudget: number;
  monthKey: string;
  cardsInitialized: boolean;
  createdAt: number;
  updatedAt: number;
}

function clampInteger(value: number, min: number, max: number): number {
  const rounded = Math.round(Number.isFinite(value) ? value : min);
  return Math.min(Math.max(rounded, min), max);
}

function clampRate(value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(Number(safe.toFixed(2)), 0), 100);
}

function sanitizeCategory(category: ExpenseCategory): ExpenseCategory {
  return EXPENSE_CATEGORIES.includes(category) ? category : 'Otros';
}

function sanitizeIsoDate(date: string): string {
  return ISO_DATE_REGEX.test(date) ? date : DEFAULT_TODAY_ISO;
}

function sanitizeDescription(description: string, fallback: string): string {
  const cleaned = description.trim().slice(0, 80);
  return cleaned.length >= 1 ? cleaned : fallback;
}

function sanitizeExpensePayload(
  uid: string,
  input: ExpenseWriteInput,
  createdAt?: number
): Record<string, unknown> {
  const category = sanitizeCategory(input.category);
  const base: Record<string, unknown> = {
    ownerId: uid,
    amount: clampInteger(input.amount, 1, MAX_COP_AMOUNT),
    category,
    description: sanitizeDescription(input.description, category),
    date: sanitizeIsoDate(input.date),
    paymentType: input.paymentType === 'installments' ? 'installments' : 'single',
  };

  if (createdAt !== undefined) {
    base.createdAt = createdAt;
  }

  if (base.paymentType === 'installments') {
    base.interestAmount = clampInteger(input.interestAmount ?? 0, 0, MAX_COP_AMOUNT);
    base.interestRatePercent = clampRate(input.interestRatePercent ?? 0);
    base.installmentMonths = clampInteger(input.installmentMonths ?? 1, 1, 999);
    base.cardId = (input.cardId ?? '').trim().slice(0, 128);
    base.cardLabel = (input.cardLabel ?? 'Tarjeta').trim().slice(0, 64) || 'Tarjeta';
  }

  return base;
}

export async function createUserWalletWithBudget(
  uid: string,
  options: {
    budgetMode: BudgetMode;
    monthlyBudget: number;
    initialIncome?: IncomeWriteInput;
  }
): Promise<void> {
  const isVariable = options.budgetMode === 'variable';
  const safeBudget = isVariable ? 0 : clampInteger(options.monthlyBudget, 1, MAX_COP_AMOUNT);
  const now = Date.now();
  const batch = writeBatch(db);
  const walletRef = doc(db, 'users', uid);

  batch.set(walletRef, {
    ownerId: uid,
    budgetMode: options.budgetMode,
    monthlyBudget: safeBudget,
    monthKey: CURRENT_MONTH_PREFIX,
    cardsInitialized: true,
    createdAt: now,
    updatedAt: now,
  });

  for (let i = 0; i < INITIAL_CARDS.length; i += 1) {
    const card = INITIAL_CARDS[i];
    const cardRef = doc(db, userCardsColPath(uid), card.id);
    const cardPayload: Record<string, unknown> = {
      ownerId: uid,
      name: card.name.slice(0, 32),
      createdAt: now + i,
    };
    if (card.last4) {
      cardPayload.last4 = card.last4;
    }
    batch.set(cardRef, cardPayload);
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userWalletDocPath(uid));
  }

  if (options.initialIncome && options.initialIncome.amount > 0) {
    await persistNewIncome(uid, options.initialIncome);
  }
}

export function subscribeUserWalletData(
  uid: string,
  handlers: {
    onWallet: (wallet: WalletSnapshot) => void;
    onWalletMissing: () => void;
    onCards: (cards: PaymentCard[]) => void;
    onExpenses: (expenses: Expense[]) => void;
    onIncomes: (incomes: IncomeEntry[]) => void;
    onSavingsGoals: (goals: SavingsGoal[]) => void;
    onSavingsEntries: (entries: SavingsEntry[]) => void;
    onError: (error: Error) => void;
  }
): () => void {
  const walletRef = doc(db, 'users', uid);
  const cardsQuery = query(collection(db, userCardsColPath(uid)), where('ownerId', '==', uid));
  const expensesQuery = query(
    collection(db, userExpensesColPath(uid)),
    where('ownerId', '==', uid)
  );
  const incomesQuery = query(
    collection(db, userIncomesColPath(uid)),
    where('ownerId', '==', uid)
  );
  const savingsGoalsQuery = query(
    collection(db, userSavingsGoalsColPath(uid)),
    where('ownerId', '==', uid)
  );
  const savingsEntriesQuery = query(
    collection(db, userSavingsEntriesColPath(uid)),
    where('ownerId', '==', uid)
  );

  const unsubWallet = onSnapshot(
    walletRef,
    (snap) => {
      if (!snap.exists()) {
        handlers.onWalletMissing();
        return;
      }
      const data = snap.data() as Partial<WalletSnapshot>;
      const mode: BudgetMode = data.budgetMode === 'variable' ? 'variable' : 'fixed';
      const fallbackBudget = mode === 'variable' ? 0 : MONTHLY_BUDGET_COP;
      handlers.onWallet({
        ownerId: uid,
        budgetMode: mode,
        monthlyBudget:
          typeof data.monthlyBudget === 'number' && data.monthlyBudget >= 0
            ? data.monthlyBudget
            : fallbackBudget,
        monthKey: typeof data.monthKey === 'string' ? data.monthKey : CURRENT_MONTH_PREFIX,
        cardsInitialized: Boolean(data.cardsInitialized),
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, userWalletDocPath(uid));
      } catch (wrapped) {
        handlers.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  const unsubCards = onSnapshot(
    cardsQuery,
    (snap) => {
      const list: PaymentCard[] = snap.docs
        .map((d) => {
          const data = d.data() as { name?: string; last4?: string; createdAt?: number };
          return {
            id: d.id,
            name: data.name ?? 'Tarjeta',
            last4: data.last4,
            createdAt: data.createdAt ?? 0,
          };
        })
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(({ id, name, last4 }) => (last4 ? { id, name, last4 } : { id, name }));

      handlers.onCards(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, userCardsColPath(uid));
      } catch (wrapped) {
        handlers.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  const unsubExpenses = onSnapshot(
    expensesQuery,
    (snap) => {
      const list: Expense[] = snap.docs.map((d) => {
        const data = d.data() as Omit<Expense, 'id'>;
        return {
          id: d.id,
          amount: Number(data.amount ?? 0),
          category: sanitizeCategory(data.category),
          description: String(data.description ?? ''),
          date: sanitizeIsoDate(String(data.date ?? '')),
          createdAt: Number(data.createdAt ?? 0),
          paymentType: data.paymentType === 'installments' ? 'installments' : 'single',
          ...(data.paymentType === 'installments'
            ? {
                interestAmount: Number(data.interestAmount ?? 0),
                interestRatePercent: Number(data.interestRatePercent ?? 0),
                installmentMonths: Number(data.installmentMonths ?? 1),
                cardId: data.cardId,
                cardLabel: data.cardLabel,
              }
            : {}),
        };
      });
      handlers.onExpenses(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, userExpensesColPath(uid));
      } catch (wrapped) {
        handlers.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  const unsubIncomes = onSnapshot(
    incomesQuery,
    (snap) => {
      const list: IncomeEntry[] = snap.docs.map((d) => {
        const data = d.data() as Omit<IncomeEntry, 'id'>;
        return {
          id: d.id,
          amount: Number(data.amount ?? 0),
          description: String(data.description ?? 'Ingreso adicional'),
          date: sanitizeIsoDate(String(data.date ?? '')),
          createdAt: Number(data.createdAt ?? 0),
          status: data.status === 'reverted' ? 'reverted' : 'active',
          ...(typeof data.revertedAt === 'number' && data.revertedAt > 0
            ? { revertedAt: data.revertedAt }
            : {}),
        };
      });
      handlers.onIncomes(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, userIncomesColPath(uid));
      } catch (wrapped) {
        handlers.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  const unsubSavingsGoals = onSnapshot(
    savingsGoalsQuery,
    (snap) => {
      const list: SavingsGoal[] = snap.docs
        .map((d) => {
          const data = d.data() as {
            name?: string;
            targetAmount?: number;
            createdAt?: number;
          };
          return {
            id: d.id,
            name: String(data.name ?? 'Ahorro'),
            ...(typeof data.targetAmount === 'number' && data.targetAmount > 0
              ? { targetAmount: data.targetAmount }
              : {}),
            createdAt: Number(data.createdAt ?? 0),
          };
        })
        .sort((a, b) => a.createdAt - b.createdAt);
      handlers.onSavingsGoals(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, userSavingsGoalsColPath(uid));
      } catch (wrapped) {
        handlers.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  const unsubSavingsEntries = onSnapshot(
    savingsEntriesQuery,
    (snap) => {
      const list: SavingsEntry[] = snap.docs
        .map((d) => {
          const data = d.data() as Omit<SavingsEntry, 'id'>;
          const entryType: SavingsEntryType =
            data.type === 'withdraw' ? 'withdraw' : 'deposit';
          return {
            id: d.id,
            goalId: String(data.goalId ?? ''),
            goalName: String(data.goalName ?? 'Ahorro'),
            type: entryType,
            amount: Number(data.amount ?? 0),
            description: String(data.description ?? 'Aporte a ahorros'),
            date: sanitizeIsoDate(String(data.date ?? '')),
            createdAt: Number(data.createdAt ?? 0),
          };
        })
        .sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return b.createdAt - a.createdAt;
        });
      handlers.onSavingsEntries(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, userSavingsEntriesColPath(uid));
      } catch (wrapped) {
        handlers.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  return () => {
    unsubWallet();
    unsubCards();
    unsubExpenses();
    unsubIncomes();
    unsubSavingsGoals();
    unsubSavingsEntries();
  };
}

export async function persistMonthlyBudget(uid: string, newBudget: number): Promise<void> {
  const safeBudget = clampInteger(newBudget, 1, MAX_COP_AMOUNT);
  const walletRef = doc(db, 'users', uid);
  try {
    await updateDoc(walletRef, {
      budgetMode: 'fixed',
      monthlyBudget: safeBudget,
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userWalletDocPath(uid));
  }
}

export async function persistBudgetMode(
  uid: string,
  budgetMode: BudgetMode,
  monthlyBudget?: number
): Promise<void> {
  const walletRef = doc(db, 'users', uid);
  const nextBudget =
    budgetMode === 'variable'
      ? 0
      : clampInteger(monthlyBudget ?? MONTHLY_BUDGET_COP, 1, MAX_COP_AMOUNT);
  try {
    await updateDoc(walletRef, {
      budgetMode,
      monthlyBudget: nextBudget,
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userWalletDocPath(uid));
  }
}

export async function persistNewIncome(uid: string, input: IncomeWriteInput): Promise<string> {
  const incomeId = `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const payload = {
    ownerId: uid,
    amount: clampInteger(input.amount, 1, MAX_COP_AMOUNT),
    description: sanitizeDescription(input.description, 'Ingreso adicional'),
    date: sanitizeIsoDate(input.date),
    createdAt: Date.now(),
  };

  const incomePath = `${userIncomesColPath(uid)}/${incomeId}`;
  try {
    await setDoc(doc(db, userIncomesColPath(uid), incomeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, incomePath);
  }

  return incomeId;
}

export async function persistUpdatedIncome(
  uid: string,
  incomeId: string,
  input: IncomeWriteInput
): Promise<void> {
  const payload = {
    amount: clampInteger(input.amount, 1, MAX_COP_AMOUNT),
    description: sanitizeDescription(input.description, 'Ingreso adicional'),
    date: sanitizeIsoDate(input.date),
  };

  const incomePath = `${userIncomesColPath(uid)}/${incomeId}`;
  try {
    await updateDoc(doc(db, userIncomesColPath(uid), incomeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, incomePath);
  }
}

export async function persistRevertIncome(uid: string, incomeId: string): Promise<void> {
  const incomePath = `${userIncomesColPath(uid)}/${incomeId}`;
  try {
    await updateDoc(doc(db, userIncomesColPath(uid), incomeId), {
      status: 'reverted',
      revertedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, incomePath);
  }
}

export async function persistRestoreIncome(uid: string, incomeId: string): Promise<void> {
  const incomePath = `${userIncomesColPath(uid)}/${incomeId}`;
  try {
    await updateDoc(doc(db, userIncomesColPath(uid), incomeId), {
      status: 'active',
      revertedAt: deleteField(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, incomePath);
  }
}

export async function persistDeletedIncome(uid: string, incomeId: string): Promise<void> {
  const incomePath = `${userIncomesColPath(uid)}/${incomeId}`;
  try {
    await deleteDoc(doc(db, userIncomesColPath(uid), incomeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, incomePath);
  }
}

export async function persistSavingsGoalAndOptionalEntry(
  uid: string,
  input: {
    name: string;
    targetAmount?: number;
    initialEntry?: {
      amount: number;
      description: string;
      date: string;
    };
  }
): Promise<string> {
  const cleanName = input.name.trim().slice(0, 40) || 'Ahorro general';
  const goalId = `goal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  const batch = writeBatch(db);
  const goalRef = doc(db, userSavingsGoalsColPath(uid), goalId);

  const goalPayload: Record<string, unknown> = {
    ownerId: uid,
    name: cleanName,
    createdAt: now,
  };
  if (input.targetAmount && input.targetAmount > 0) {
    goalPayload.targetAmount = clampInteger(input.targetAmount, 1, MAX_COP_AMOUNT);
  }
  batch.set(goalRef, goalPayload);

  if (input.initialEntry && input.initialEntry.amount > 0) {
    const entryId = `sav-${now}-${Math.random().toString(36).slice(2, 6)}`;
    const entryRef = doc(db, userSavingsEntriesColPath(uid), entryId);
    batch.set(entryRef, {
      ownerId: uid,
      goalId,
      goalName: cleanName,
      type: 'deposit',
      amount: clampInteger(input.initialEntry.amount, 1, MAX_COP_AMOUNT),
      description: sanitizeDescription(input.initialEntry.description, 'Aporte inicial'),
      date: sanitizeIsoDate(input.initialEntry.date),
      createdAt: now + 1,
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userSavingsGoalsColPath(uid));
  }

  return goalId;
}

export async function persistUpdatedSavingsGoal(
  uid: string,
  goalId: string,
  input: { name: string; targetAmount?: number }
): Promise<void> {
  const cleanName = input.name.trim().slice(0, 40) || 'Ahorro general';
  const payload: Record<string, unknown> = {
    name: cleanName,
    targetAmount:
      input.targetAmount && input.targetAmount > 0
        ? clampInteger(input.targetAmount, 1, MAX_COP_AMOUNT)
        : deleteField(),
  };

  const goalPath = `${userSavingsGoalsColPath(uid)}/${goalId}`;
  try {
    await updateDoc(doc(db, userSavingsGoalsColPath(uid), goalId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, goalPath);
  }
}

export async function persistNewSavingsEntry(
  uid: string,
  input: {
    goalId: string;
    goalName: string;
    type: SavingsEntryType;
    amount: number;
    description: string;
    date: string;
  }
): Promise<string> {
  const entryId = `sav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const payload = {
    ownerId: uid,
    goalId: input.goalId,
    goalName: input.goalName.trim().slice(0, 40) || 'Ahorro',
    type: input.type === 'withdraw' ? 'withdraw' : 'deposit',
    amount: clampInteger(input.amount, 1, MAX_COP_AMOUNT),
    description: sanitizeDescription(
      input.description,
      input.type === 'withdraw' ? 'Retiro de ahorros' : 'Aporte a ahorros'
    ),
    date: sanitizeIsoDate(input.date),
    createdAt: Date.now(),
  };

  const entryPath = `${userSavingsEntriesColPath(uid)}/${entryId}`;
  try {
    await setDoc(doc(db, userSavingsEntriesColPath(uid), entryId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, entryPath);
  }
  return entryId;
}

export async function persistDeletedSavingsEntry(uid: string, entryId: string): Promise<void> {
  const entryPath = `${userSavingsEntriesColPath(uid)}/${entryId}`;
  try {
    await deleteDoc(doc(db, userSavingsEntriesColPath(uid), entryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, entryPath);
  }
}

export async function persistDeletedSavingsGoal(uid: string, goalId: string): Promise<void> {
  const entriesCol = userSavingsEntriesColPath(uid);
  const refsToDelete = [];
  try {
    const snap = await getDocs(
      query(
        collection(db, entriesCol),
        where('ownerId', '==', uid),
        where('goalId', '==', goalId)
      )
    );
    for (const d of snap.docs) {
      refsToDelete.push(d.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, entriesCol);
  }

  refsToDelete.push(doc(db, userSavingsGoalsColPath(uid), goalId));

  try {
    const batch = writeBatch(db);
    for (const ref of refsToDelete) {
      batch.delete(ref);
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${userSavingsGoalsColPath(uid)}/${goalId}`);
  }
}

export async function persistNewCard(
  uid: string,
  input: { name: string; last4?: string }
): Promise<PaymentCard> {
  const cleanName = input.name.trim().slice(0, 32);
  if (!cleanName) {
    throw new Error('El nombre de la tarjeta es obligatorio.');
  }
  const cleanLast4 = (input.last4 ?? '').replace(/\D/g, '').slice(0, 4);
  const cardId = `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const payload: Record<string, unknown> = {
    ownerId: uid,
    name: cleanName,
    createdAt: Date.now(),
  };
  if (cleanLast4.length === 4) {
    payload.last4 = cleanLast4;
  }

  const cardPath = `${userCardsColPath(uid)}/${cardId}`;
  try {
    await setDoc(doc(db, userCardsColPath(uid), cardId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, cardPath);
  }

  return cleanLast4.length === 4
    ? { id: cardId, name: cleanName, last4: cleanLast4 }
    : { id: cardId, name: cleanName };
}

export async function persistNewExpense(uid: string, input: ExpenseWriteInput): Promise<string> {
  const expenseId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const payload = sanitizeExpensePayload(uid, input, Date.now());
  const expensePath = `${userExpensesColPath(uid)}/${expenseId}`;

  try {
    await setDoc(doc(db, userExpensesColPath(uid), expenseId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, expensePath);
  }

  return expenseId;
}

export async function persistUpdatedExpense(
  uid: string,
  expenseId: string,
  input: ExpenseWriteInput
): Promise<void> {
  const payload = sanitizeExpensePayload(uid, input);
  if (payload.paymentType === 'single') {
    payload.interestAmount = deleteField();
    payload.interestRatePercent = deleteField();
    payload.installmentMonths = deleteField();
    payload.cardId = deleteField();
    payload.cardLabel = deleteField();
  }

  const expensePath = `${userExpensesColPath(uid)}/${expenseId}`;
  try {
    await updateDoc(doc(db, userExpensesColPath(uid), expenseId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, expensePath);
  }
}

export async function persistDeletedExpense(uid: string, expenseId: string): Promise<void> {
  const expensePath = `${userExpensesColPath(uid)}/${expenseId}`;
  try {
    await deleteDoc(doc(db, userExpensesColPath(uid), expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, expensePath);
  }
}

export async function deleteAllUserData(uid: string): Promise<void> {
  const expensesCol = userExpensesColPath(uid);
  const incomesCol = userIncomesColPath(uid);
  const cardsCol = userCardsColPath(uid);
  const walletPath = userWalletDocPath(uid);

  const refsToDelete = [];

  try {
    const expensesSnap = await getDocs(
      query(collection(db, expensesCol), where('ownerId', '==', uid))
    );
    for (const d of expensesSnap.docs) {
      refsToDelete.push(d.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, expensesCol);
  }

  try {
    const incomesSnap = await getDocs(
      query(collection(db, incomesCol), where('ownerId', '==', uid))
    );
    for (const d of incomesSnap.docs) {
      refsToDelete.push(d.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, incomesCol);
  }

  try {
    const cardsSnap = await getDocs(query(collection(db, cardsCol), where('ownerId', '==', uid)));
    for (const d of cardsSnap.docs) {
      refsToDelete.push(d.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, cardsCol);
  }

  const savingsGoalsCol = userSavingsGoalsColPath(uid);
  try {
    const goalsSnap = await getDocs(
      query(collection(db, savingsGoalsCol), where('ownerId', '==', uid))
    );
    for (const d of goalsSnap.docs) {
      refsToDelete.push(d.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, savingsGoalsCol);
  }

  const savingsEntriesCol = userSavingsEntriesColPath(uid);
  try {
    const entriesSnap = await getDocs(
      query(collection(db, savingsEntriesCol), where('ownerId', '==', uid))
    );
    for (const d of entriesSnap.docs) {
      refsToDelete.push(d.ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, savingsEntriesCol);
  }

  refsToDelete.push(doc(db, 'users', uid));

  const BATCH_LIMIT = 450;
  try {
    for (let i = 0; i < refsToDelete.length; i += BATCH_LIMIT) {
      const chunk = refsToDelete.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (const ref of chunk) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, walletPath);
  }
}
