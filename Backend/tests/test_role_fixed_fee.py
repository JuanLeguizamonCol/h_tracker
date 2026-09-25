import pytest
from pydantic import ValidationError

from schemas.project_roles import ProjectRoleCreate, ProjectRoleUpdate
from services.export_excel import _line_subtotal
from services.export_pdf import _build_professional_rows

BASE = dict(project_id="p", name="Dev", hourly_rate_usd=0)


def test_fixed_fee_role_needs_a_positive_amount():
    assert ProjectRoleCreate(**BASE, fixed_fee_period="week", fixed_fee_amount=1000).fixed_fee_amount == 1000
    for bad in (dict(fixed_fee_period="week"), dict(fixed_fee_period="week", fixed_fee_amount=0)):
        with pytest.raises(ValidationError):
            ProjectRoleCreate(**BASE, **bad)


def test_hourly_role_drops_a_stray_fee_amount():
    assert ProjectRoleCreate(**BASE, fixed_fee_amount=55).fixed_fee_amount is None


def test_update_only_touches_fee_fields_when_sent():
    assert ProjectRoleUpdate(name="x").model_dump(exclude_unset=True) == {"name": "x"}
    back = ProjectRoleUpdate(fixed_fee_period=None, fixed_fee_amount=None).model_dump(exclude_unset=True)
    assert back == {"fixed_fee_period": None, "fixed_fee_amount": None}


def test_fee_line_bills_its_amount_in_pdf_and_xlsx():
    fee_line = {"employee_name": "Ana", "title": "Dev", "hours": 0, "hourly_rate": 0, "amount": 2500,
                "fee_period": "week", "fee_unit_amount": 2500, "discount_value": 0}
    hourly = {"employee_name": "Bo", "title": "PM", "hours": 10, "hourly_rate": 100, "discount_value": 0}
    _, subtotal, discount, net = _build_professional_rows([fee_line, hourly])
    assert (subtotal, discount, net) == (3500.0, 0.0, 3500.0)
    assert _line_subtotal(fee_line, 0, 0) == 2500.0
    assert _line_subtotal({}, 10, 100) == 1000
