# PengePilot web v13 audit

App-store/Play release work is paused until the web prototype is stable.

## Audited flows

- Auth, password and passkeys
- Accounts and dated balance anchors
- Bank import, mapping and missing descriptions
- Transactions, delete/bulk delete, category corrections and learned rules
- Category semantics for income, expense, refunds and transfers
- Budgets, month navigation, copy and rollover
- Recurring payment candidates, confirmed subscriptions and bills
- Savings goals
- Savings opportunities, freshness and overlap filtering
- Forecast, financial health and reports
- Local data assistant and optional AI Edge Function
- Profile/settings, privacy and account deletion

## Key invariants

1. A positive amount is not automatically income. Category type is the primary accounting semantic.
2. A positive refund in an expense category reduces category spend.
3. Transfers are excluded from income/expense KPIs.
4. Generic MobilePay/bank transfers are not automatically salary.
5. A balance is an as-of-date anchor; older imported history must not change the current balance.
6. Repeated payments are suggestions until the user confirms them as recurring.
7. Savings opportunities must be current for the present transaction dataset and must not overlap.
8. Forecasts must not double-count known bills that are already reflected in historical net cash flow.
9. Local core functionality must work even when OpenAI is not configured.
10. The active web runtime is the v13 deterministic layer; older patch layers stay source-only and are not loaded.

## Automated quality gate

`npm run web:audit` checks required pages, local file references, JavaScript/MJS syntax and the active runtime loader. GitHub Actions runs the audit on relevant pull requests and pushes to main.
