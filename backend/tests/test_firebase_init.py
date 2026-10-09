"""Credential bootstrap: key file, Application Default Credentials, or the demo store.

firebase_admin is patched, so these run without a Firebase project or network access.
"""
import pytest

from app import config as config_module
from app import firebase


@pytest.fixture
def fresh(monkeypatch, tmp_path):
    """No Admin SDK app yet, and a key path that does not exist."""
    monkeypatch.setattr(firebase.firebase_admin, "_apps", {})
    monkeypatch.setenv("FIREBASE_CREDENTIALS_PATH", str(tmp_path / "missing.json"))
    config_module.get_settings.cache_clear()
    calls = []
    monkeypatch.setattr(firebase.firebase_admin, "initialize_app", lambda *a, **k: calls.append((a, k)))
    yield calls
    config_module.get_settings.cache_clear()


def test_auto_mode_without_a_key_falls_back_to_the_demo_store(fresh, monkeypatch):
    monkeypatch.setenv("DATA_BACKEND", "auto")
    config_module.get_settings.cache_clear()
    assert firebase.init_firebase() is False
    assert fresh == []  # never reaches for ambient cloud credentials by accident


def test_firestore_mode_without_a_key_uses_application_default_credentials(fresh, monkeypatch):
    monkeypatch.setenv("DATA_BACKEND", "firestore")
    config_module.get_settings.cache_clear()
    assert firebase.init_firebase() is True
    assert fresh == [((), {})]  # initialize_app() with no certificate -> ADC


def test_firestore_mode_reports_failure_when_adc_is_unavailable(fresh, monkeypatch):
    monkeypatch.setenv("DATA_BACKEND", "firestore")
    config_module.get_settings.cache_clear()

    def boom(*_a, **_k):
        raise ValueError("no default credentials")

    monkeypatch.setattr(firebase.firebase_admin, "initialize_app", boom)
    assert firebase.init_firebase() is False
