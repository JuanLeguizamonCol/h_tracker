"""Pydantic v2 resolves `Optional[date]` against the class's OWN namespace
first — for a field literally named `date` with a default, that namespace
already holds the field's default (None) by the time the annotation is
evaluated, so `date` silently becomes `NoneType` instead of `datetime.date`
and the field rejects every real date with a 422. Only fields named exactly
`date` (not `issue_date`, `review_date`, etc.) are at risk, and only when
they carry a default — see the `DateValue` comment in each fixed schema.
"""
from datetime import date

from schemas.invoice import InvoiceExpensePatch
from schemas.invoice_expenses import InvoiceExpenseUpdate
from schemas.time_entries import TimeEntryUpdate


def test_invoice_expense_patch_accepts_a_real_date():
    assert InvoiceExpensePatch(date=date(2026, 9, 30)).date == date(2026, 9, 30)


def test_invoice_expense_update_accepts_a_real_date():
    assert InvoiceExpenseUpdate(date=date(2026, 9, 30)).date == date(2026, 9, 30)


def test_time_entry_update_accepts_a_real_date():
    assert TimeEntryUpdate(date=date(2026, 9, 30)).date == date(2026, 9, 30)
