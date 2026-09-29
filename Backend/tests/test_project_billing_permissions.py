"""A Manager can create a project, but never its billing config (fixed fee /
Managed Services) — see routers/projects.py. Exercises the same model_copy
scrub the router applies, since that's the part worth pinning: Pydantic v2
must mark the overridden fields as "set" so model_dump(exclude_unset=True)
(what services/projects.py::create_project keys off) actually includes them.
"""
from schemas.projects import ProjectCreate

NON_ADMIN_SCRUB = {
    "is_fixed_fee": False, "fixed_fee_amount": None, "fixed_fee_period": "project",
    "is_managed_services": False, "managed_services_min_hours": None,
}


def test_scrub_overrides_a_managers_billing_fields():
    p = ProjectCreate(client_id="c1", name="Test", is_fixed_fee=True, fixed_fee_amount=5000.0,
                       is_managed_services=False)
    scrubbed = p.model_copy(update=NON_ADMIN_SCRUB).model_dump(exclude_unset=True)
    for field, value in NON_ADMIN_SCRUB.items():
        assert scrubbed[field] == value


def test_scrub_applies_even_when_the_request_never_mentioned_billing():
    p = ProjectCreate(client_id="c1", name="Test")
    scrubbed = p.model_copy(update=NON_ADMIN_SCRUB).model_dump(exclude_unset=True)
    assert scrubbed["is_fixed_fee"] is False
    assert scrubbed["is_managed_services"] is False
