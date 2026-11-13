"""Email dispatch (utils/email.py) — Graph first, SMTP fallback, safe no-op
with neither configured. See utils/graph_email.py for the actual Graph
Mail.Send client-credentials flow (not exercised here — no real HTTP calls).
"""
import utils.email as email_mod
import utils.graph_email as graph_email


def _reset_smtp(monkeypatch, host=None, from_email=None):
    monkeypatch.setattr(email_mod, "SMTP_HOST", host)
    monkeypatch.setattr(email_mod, "SMTP_FROM_EMAIL", from_email)


def test_graph_email_configured_requires_every_var(monkeypatch):
    for var in ("GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_SENDER", "AZURE_TENANT_ID"):
        monkeypatch.delenv(var, raising=False)
    assert graph_email.email_configured() is False

    monkeypatch.setenv("GRAPH_TENANT_ID", "tenant")
    monkeypatch.setenv("GRAPH_CLIENT_ID", "client")
    monkeypatch.setenv("GRAPH_CLIENT_SECRET", "secret")
    monkeypatch.setenv("GRAPH_SENDER", "no-reply@impactpoint.com")
    assert graph_email.email_configured() is True


def test_graph_email_falls_back_to_azure_tenant_id(monkeypatch):
    monkeypatch.delenv("GRAPH_TENANT_ID", raising=False)
    monkeypatch.setenv("AZURE_TENANT_ID", "tenant")
    monkeypatch.setenv("GRAPH_CLIENT_ID", "client")
    monkeypatch.setenv("GRAPH_CLIENT_SECRET", "secret")
    monkeypatch.setenv("GRAPH_SENDER", "no-reply@impactpoint.com")
    assert graph_email.email_configured() is True


def test_nothing_configured_is_a_safe_no_op(monkeypatch):
    monkeypatch.setattr(graph_email, "email_configured", lambda: False)
    _reset_smtp(monkeypatch)
    assert email_mod.email_enabled() is False
    assert email_mod.send_email("a@x.com", "Subject", "<p>Body</p>") is False


def test_no_recipient_never_calls_either_transport(monkeypatch):
    calls = []
    monkeypatch.setattr(graph_email, "email_configured", lambda: True)
    monkeypatch.setattr(graph_email, "send_email", lambda *a: calls.append(a) or True)
    assert email_mod.send_email("", "Subject", "<p>Body</p>") is False
    assert calls == []


def test_graph_is_tried_first_when_both_are_configured(monkeypatch):
    calls = []
    monkeypatch.setattr(graph_email, "email_configured", lambda: True)
    monkeypatch.setattr(graph_email, "send_email", lambda to, subject, body: calls.append(("graph", to)) or True)
    monkeypatch.setattr(email_mod, "_send_via_smtp", lambda *a: calls.append(("smtp",)) or True)
    _reset_smtp(monkeypatch, host="smtp.example.com", from_email="no-reply@x.com")

    assert email_mod.email_enabled() is True
    assert email_mod.send_email("a@x.com", "Subject", "<p>Body</p>") is True
    assert calls == [("graph", "a@x.com")]


def test_falls_back_to_smtp_when_graph_is_not_configured(monkeypatch):
    calls = []
    monkeypatch.setattr(graph_email, "email_configured", lambda: False)
    monkeypatch.setattr(email_mod, "_send_via_smtp", lambda to, subject, body: calls.append(("smtp", to)) or True)
    _reset_smtp(monkeypatch, host="smtp.example.com", from_email="no-reply@x.com")

    assert email_mod.email_enabled() is True
    assert email_mod.send_email("a@x.com", "Subject", "<p>Body</p>") is True
    assert calls == [("smtp", "a@x.com")]
