-- Backfill Journal Entries for 2026 Payments
-- This script creates journal entries for all active 2026 payments that don't have them yet
-- Run once after deploying the payment journal feature

-- Ensure required account codes exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'CASH' AND is_active = true) THEN
        RAISE EXCEPTION 'Account code CASH not found or inactive';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'BANK_PBB' AND is_active = true) THEN
        RAISE EXCEPTION 'Account code BANK_PBB not found or inactive';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'BANK_ABB' AND is_active = true) THEN
        RAISE EXCEPTION 'Account code BANK_ABB not found or inactive';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM account_codes WHERE code = 'TR' AND is_active = true) THEN
        RAISE EXCEPTION 'Account code TR (Trade Receivables) not found or inactive';
    END IF;
END $$;

-- Create journal entries for 2026 payments
DO $$
DECLARE
    payment_rec RECORD;
    new_journal_id INTEGER;
    ref_no TEXT;
    debit_account TEXT;
    payment_year INTEGER;
    payment_month INTEGER;
    seq_num INTEGER;
    total_processed INTEGER := 0;
    total_skipped INTEGER := 0;
BEGIN
    -- Loop through all 2026 active payments without journal entries
    FOR payment_rec IN
        SELECT
            p.payment_id,
            p.invoice_id,
            p.payment_date,
            p.amount_paid,
            p.payment_method,
            p.bank_account,
            p.payment_reference,
            i.customerid,
            c.name as customer_name
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        LEFT JOIN customers c ON i.customerid = c.id
        WHERE EXTRACT(YEAR FROM p.payment_date) = 2026
          AND (p.status IS NULL OR p.status = 'active')
          AND p.journal_entry_id IS NULL
        ORDER BY p.payment_date, p.payment_id
    LOOP
        -- Determine debit account based on bank_account
        debit_account := COALESCE(payment_rec.bank_account,
            CASE payment_rec.payment_method
                WHEN 'cash' THEN 'CASH'
                WHEN 'cheque' THEN 'BANK_PBB'
                WHEN 'bank_transfer' THEN 'BANK_PBB'
                WHEN 'online' THEN 'BANK_PBB'
                ELSE 'CASH'
            END
        );

        -- Generate reference number (REC-YYYYMM-XXXX)
        payment_year := EXTRACT(YEAR FROM payment_rec.payment_date);
        payment_month := EXTRACT(MONTH FROM payment_rec.payment_date);

        SELECT COALESCE(MAX(
            CASE
                WHEN reference_no ~ ('^REC-' || TO_CHAR(payment_rec.payment_date, 'YYYYMM') || '-[0-9]+$')
                THEN CAST(SUBSTRING(reference_no FROM '[0-9]+$') AS INTEGER)
                ELSE 0
            END
        ), 0) + 1 INTO seq_num
        FROM journal_entries
        WHERE reference_no LIKE 'REC-' || TO_CHAR(payment_rec.payment_date, 'YYYYMM') || '-%';

        ref_no := 'REC-' || TO_CHAR(payment_rec.payment_date, 'YYYYMM') || '-' || LPAD(seq_num::TEXT, 4, '0');

        -- Create journal entry header
        INSERT INTO journal_entries (
            reference_no,
            entry_type,
            entry_date,
            description,
            total_debit,
            total_credit,
            status,
            created_at,
            updated_at,
            posted_at
        ) VALUES (
            ref_no,
            'REC',
            payment_rec.payment_date::DATE,
            'Payment received from ' || COALESCE(payment_rec.customer_name, 'Customer') ||
            ' for Invoice ' || payment_rec.invoice_id ||
            CASE WHEN payment_rec.payment_reference IS NOT NULL
                 THEN ' (Ref: ' || payment_rec.payment_reference || ')'
                 ELSE '' END,
            ROUND(payment_rec.amount_paid::NUMERIC, 2),
            ROUND(payment_rec.amount_paid::NUMERIC, 2),
            'posted',
            NOW(),
            NOW(),
            NOW()
        ) RETURNING id INTO new_journal_id;

        -- Create journal entry lines
        -- Line 1: Debit Bank/Cash
        INSERT INTO journal_entry_lines (
            journal_entry_id,
            line_number,
            account_code,
            debit_amount,
            credit_amount,
            reference,
            particulars
        ) VALUES (
            new_journal_id,
            1,
            debit_account,
            ROUND(payment_rec.amount_paid::NUMERIC, 2),
            0,
            'INV-' || payment_rec.invoice_id,
            'Payment received - ' || INITCAP(REPLACE(payment_rec.payment_method, '_', ' '))
        );

        -- Line 2: Credit Trade Receivables
        INSERT INTO journal_entry_lines (
            journal_entry_id,
            line_number,
            account_code,
            debit_amount,
            credit_amount,
            reference,
            particulars
        ) VALUES (
            new_journal_id,
            2,
            'TR',
            0,
            ROUND(payment_rec.amount_paid::NUMERIC, 2),
            'INV-' || payment_rec.invoice_id,
            COALESCE(payment_rec.customer_name, 'Customer') || ' - Invoice ' || payment_rec.invoice_id
        );

        -- Update payment with journal_entry_id
        UPDATE payments
        SET journal_entry_id = new_journal_id
        WHERE payment_id = payment_rec.payment_id;

        total_processed := total_processed + 1;
    END LOOP;

    RAISE NOTICE 'Backfill complete: % journal entries created', total_processed;
END $$;

-- Verify the results
SELECT
    'Summary' as info,
    COUNT(*) as total_2026_payments,
    COUNT(CASE WHEN journal_entry_id IS NOT NULL THEN 1 END) as with_journal,
    COUNT(CASE WHEN journal_entry_id IS NULL THEN 1 END) as without_journal
FROM payments
WHERE EXTRACT(YEAR FROM payment_date) = 2026
  AND (status IS NULL OR status = 'active');
