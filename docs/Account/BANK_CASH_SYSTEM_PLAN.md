# Bank/Cash System (Phase 2) - Implementation Plan

## Overview

Implement automated journal entry creation when customer payments are recorded, following standard accounting principles with a simplified chart of accounts.

**Core Accounting Principle:**
```
When customer pays:
  DR: Cash/Bank (asset increases)
  CR: Trade Receivables (asset decreases)
```

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Account structure | Simplified (4 codes) | Old system too complex |
| Cash routing | Single CASH account | All cash → CASH |
| Bank routing | User selects (PBB/ABB) | Dropdown in payment form, **Public Bank default** |
| Trade Receivables | Single aggregate TR | Customer detail stays in invoices table |
| Note 22 source | Invoice-based | Keep working; journals for audit trail |
| Historical data | New payments only | No backfill |
| Journal timing | Immediate on payment | Auto-create when payment saved |
| Pending cheques | Journal on confirm only | Not on initial recording |

---

## Understanding Payment References

**Two distinct reference fields:**

| Field | Purpose | Example |
|-------|---------|---------|
| `payment_reference` (existing) | Customer's reference | PIB505682, ALB034429 (their cheque/bank ref) |
| `bank_account` (NEW) | Company's receiving bank | BANK_PBB or BANK_ABB |

The customer's payment reference stays as-is. We're adding a new field to track which of our bank accounts received the deposit.

---

## New Simplified Account Codes

```sql
-- Create new simplified bank/cash accounts
INSERT INTO account_codes (code, description, ledger_type, fs_note, is_active, sort_order)
VALUES
  ('CASH', 'Cash In Hand', 'CH', '6', true, 10),
  ('BANK_PBB', 'Public Bank Berhad', 'BK', '19', true, 20),
  ('BANK_ABB', 'Alliance Bank Berhad', 'BK', '19', true, 30),
  ('TR', 'Trade Receivables', 'TD', '22', true, 40);

-- Add REC journal entry type if not exists
INSERT INTO journal_entry_types (code, name, description, is_active)
VALUES ('REC', 'Receipt', 'Customer payment receipts', true)
ON CONFLICT (code) DO NOTHING;
```

**Mapping to Financial Statements:**
- `CASH` → Note 6 (Cash In Hand)
- `BANK_PBB`, `BANK_ABB` → Note 19 (Cash At Bank)
- `TR` → Note 22 (Trade Receivables) - but Note 22 continues using invoice data

---

## Database Changes

### 1. Modify `payments` table

```sql
ALTER TABLE payments
ADD COLUMN bank_account VARCHAR(20) DEFAULT NULL,
ADD COLUMN journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL;

CREATE INDEX idx_payments_journal_entry ON payments(journal_entry_id);

COMMENT ON COLUMN payments.bank_account IS 'Target account: CASH, BANK_PBB, or BANK_ABB';
COMMENT ON COLUMN payments.journal_entry_id IS 'Links to auto-generated journal entry';
```

---

## Backend Implementation

### 1. New Module: `src/routes/accounting/payment-journal.js`

**Functions:**
- `createPaymentJournalEntry(client, paymentData)` - Creates journal for active payment
- `cancelPaymentJournalEntry(client, journalEntryId)` - Cancels journal entry
- `generateReceiptReference(client, date)` - Generates ref like `REC001/01`

**Journal Entry Structure:**
```javascript
{
  reference_no: "REC001/01",  // REC{seq}/{month}
  entry_type: "REC",
  entry_date: payment.payment_date,
  description: `Payment received - Invoice #${invoiceId}`,
  status: "posted",  // Auto-post immediately
  lines: [
    { account_code: bankAccount, debit: amount, credit: 0 },  // CASH, BANK_PBB, or BANK_ABB
    { account_code: "TR", debit: 0, credit: amount }          // Trade Receivables
  ]
}
```

### 2. Modify Payment Routes

**File:** `src/routes/sales/invoices/payments.js`

#### POST /api/payments (Create Payment)

```javascript
// After payment insert with status 'active':
// 1. Determine target account based on payment_method + bank_account
//    - cash → 'CASH'
//    - cheque/bank_transfer/online → payment.bank_account (BANK_PBB or BANK_ABB)
// 2. Create journal entry (posted immediately)
// 3. Link journal_entry_id to payment record

// For status 'pending' (cheques):
// - Do NOT create journal entry yet
// - Journal created on confirmation
```

#### PUT /api/payments/:id/confirm (Confirm Cheque)

```javascript
// After confirming cheque:
// 1. Create journal entry (same as active payment)
// 2. Update payment.journal_entry_id
```

#### PUT /api/payments/:id/cancel (Cancel Payment)

```javascript
// After cancelling payment:
// 1. If journal_entry_id exists:
//    - Update journal entry status to 'cancelled'
// 2. (Invoice balance reversal already happens in existing code)
```

### 3. Account Selection Logic

```javascript
function getDebitAccount(payment) {
  if (payment.payment_method === 'cash') {
    return 'CASH';
  }
  // For cheque, bank_transfer, online - use selected bank
  return payment.bank_account; // 'BANK_PBB' or 'BANK_ABB'
}
```

---

## Frontend Implementation

### 1. Update PaymentForm.tsx

**File:** `src/components/Invoice/PaymentForm.tsx`

**Add "Deposit To" field to track which company bank receives the payment:**

```typescript
// Add to formData state (line ~57)
const [formData, setFormData] = useState({
  payment_date: new Date().toISOString().split("T")[0],
  payment_method: "cheque" as Payment["payment_method"],
  payment_reference: "",  // Customer's reference (existing)
  bank_account: "BANK_PBB",  // NEW: Company's receiving bank (Public Bank default)
  notes: "",
});

// Add bank account options
const bankAccountOptions = [
  { id: "BANK_PBB", name: "Public Bank" },
  { id: "BANK_ABB", name: "Alliance Bank" },
];

// Add to form grid (after payment_method, before payment_reference):
<FormListbox
  name="bank_account"
  label="Deposit To"
  value={formData.bank_account}
  onChange={(value) =>
    setFormData({ ...formData, bank_account: value })
  }
  options={bankAccountOptions}
  disabled={isSubmitting}
/>

// Update submission payload (line ~175)
const result = await api.post(apiEndpoint, {
  invoice_id: invoice.id,
  payment_date: formData.payment_date,
  amount_paid: amountToPay,
  payment_method: formData.payment_method,
  payment_reference: formData.payment_reference || undefined,
  bank_account: formData.payment_method === 'cash' ? 'CASH' : formData.bank_account,  // NEW
  notes: formData.notes || undefined,
});
```

**Key points:**
- "Deposit To" shows only for non-cash payment methods (cheque/bank_transfer/online)
- For cash payments: automatically uses CASH account (no dropdown needed)
- Public Bank is the default (most frequently used)
- Existing `payment_reference` field unchanged (customer's cheque/bank reference)

**Conditional rendering:**
```typescript
{formData.payment_method !== 'cash' && (
  <FormListbox
    name="bank_account"
    label="Deposit To"
    value={formData.bank_account}
    onChange={(value) => setFormData({ ...formData, bank_account: value })}
    options={bankAccountOptions}
    disabled={isSubmitting}
  />
)}
```

### 2. Update Payment Types

**File:** `src/types/types.ts`

```typescript
interface Payment {
  // ... existing fields
  bank_account?: 'CASH' | 'BANK_PBB' | 'BANK_ABB';
  journal_entry_id?: number;
}
```

---

## Implementation Steps

### Step 1: Database Migration
1. Create new account codes (CASH, BANK_PBB, BANK_ABB, TR)
2. Add journal entry type REC
3. Add columns to payments table

### Step 2: Backend - Payment Journal Module
1. Create `src/routes/accounting/payment-journal.js`
2. Implement reference number generation
3. Implement journal entry creation
4. Implement journal entry cancellation

### Step 3: Backend - Modify Payment Routes
1. Update POST /api/payments to create journals for active payments
2. Update PUT /api/payments/:id/confirm to create journals for cheques
3. Update PUT /api/payments/:id/cancel to cancel journals

### Step 4: Frontend - Payment Form
1. Add bank account dropdown to PaymentForm.tsx
2. Show dropdown only for non-cash payment methods
3. Include bank_account in submission payload

### Step 5: Testing
1. Create cash payment → verify journal with CASH debit
2. Create bank transfer → verify journal with selected bank debit
3. Create cheque → verify NO journal until confirmed
4. Confirm cheque → verify journal created
5. Cancel payment → verify journal cancelled
6. Check Trial Balance for new accounts

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/routes/sales/invoices/payments.js` | Add journal creation on payment |
| `src/routes/accounting/payment-journal.js` | NEW - Journal helper module |
| `src/components/Invoice/PaymentForm.tsx` | Add bank account dropdown |
| `src/types/types.ts` | Update Payment interface |

---

## Verification

1. **Create test payment (cash)**
   - Verify journal entry created: DR CASH, CR TR
   - Verify appears in Trial Balance under CASH account

2. **Create test payment (bank transfer to PBB)**
   - Verify journal entry created: DR BANK_PBB, CR TR
   - Verify appears in Trial Balance under BANK_PBB

3. **Create and confirm cheque**
   - Initial creation: no journal entry
   - After confirm: journal entry created

4. **Cancel a payment**
   - Verify journal entry status = 'cancelled'

5. **Financial Reports**
   - Note 6 (Cash In Hand) should include CASH balance
   - Note 19 (Cash At Bank) should include BANK_PBB + BANK_ABB
   - Note 22 (Trade Receivables) unchanged (still from invoices)

---

## Notes

- Old account codes (CH_REV1, CH_REV2, PBB_1, PBB_2, ABB) remain for historical data
- New simplified codes used for all new transactions
- Journal entries provide audit trail; Note 22 stays invoice-based for accuracy
- This follows standard double-entry accounting principles

---

*Plan created: January 13, 2026*
*Status: Ready for implementation*
