# Security Specification — Tu billetera

## Data Invariants
1. No authentication/login is enabled in this phase by explicit user instruction ("No agregues login todavía"). Access is constrained strictly to the single workspace path `wallets/default-wallet` and its subcollections (`expenses`, `cards`).
2. All document IDs (`expenseId`, `cardId`) must match `^[a-zA-Z0-9_\\-]+$` and have length `<= 128`.
3. `Wallet` documents must contain integer `monthlyBudget` (`> 0` and `<= 10000000000`), valid `YYYY-MM` `monthKey`, boolean `cardsInitialized`, and integer `updatedAt`.
4. `Expense` documents must strictly validate required and optional fields (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update), positive integer `amount`, valid category allowlist, bounded description (`1..80` chars), `YYYY-MM-DD` date regex, immutable `createdAt`, and `paymentType` in `['single', 'installments']`.
5. When `paymentType == 'installments'`, `installmentMonths` (`1..999`), `interestAmount` (`>= 0`), `interestRatePercent` (`>= 0 && <= 100`), `cardId` (verified via `exists` in `/cards/`), and `cardLabel` (`1..64` chars) must be valid.
6. `PaymentCard` documents must validate `name` (`1..32` chars), optional `last4` (`^\\d{4}$`), and immutable `createdAt`.
7. Catch-all default deny rule (`match /{document=**} { allow read, write: if false; }`) prevents access to any undeclared paths.

## Adversarial Payloads ("Dirty Dozen")
1. Write to an arbitrary wallet ID (`wallets/other-wallet`) -> rejected (`walletId == 'default-wallet'`).
2. Oversized document ID (>128 chars) -> rejected (`isValidId`).
3. Shadow field injection (`isAdmin: true` or `extraField: 123`) on `Expense` create -> rejected (`keys().hasOnly(...)`).
4. Shadow field injection during `Expense` update -> rejected (`affectedKeys().hasOnly(...)`).
5. Modifying immutable `createdAt` during `Expense` update -> rejected (`incoming().createdAt == existing().createdAt`).
6. Negative or zero `amount` (`0` or `-5000`) -> rejected (`data.amount > 0`).
7. Non-integer float `amount` (`123.45`) -> rejected (`data.amount is int`).
8. Invalid category outside allowlist (`"Cripto"`) -> rejected.
9. Oversized `description` (>80 chars) or empty `description` (`""`) -> rejected.
10. Invalid `date` format (`"18/11/2026"`) -> rejected (`matches('^\\d{4}-\\d{2}-\\d{2}$')`).
11. Installment expense referencing nonexistent `cardId` -> rejected (`exists(...)`).
12. `PaymentCard` with invalid `last4` (`"12ab"`) -> rejected (`matches('^\\d{4}$')`).
