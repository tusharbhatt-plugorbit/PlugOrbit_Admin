"""Platform configuration: freshness thresholds, ranking weights, route battery reserve,
feature flags and commission plans. One document (`config/platform`), versioned, audited."""
import copy

from ..domain.trust import DEFAULT_LIVE_MAX_AGE_MS, DEFAULT_STALE_AFTER_MS
from ..schemas.ops import DEFAULT_RANKING_WEIGHTS, FEATURE_FLAGS, ConfigUpdate
from ..security.principal import Principal
from ..store.base import Store
from . import audit
from .common import check_version, diff, stamp

CONFIG = "config"
CONFIG_ID = "platform"

DEFAULT_COMMISSION_PLANS = [
    {"id": "standard", "name": "Standard revenue share", "model": "revenue_share",
     "commissionPercent": 12.0, "flatFeePerKwh": None, "note": "Default for new network partners."},
    {"id": "launch", "name": "Launch partner", "model": "revenue_share",
     "commissionPercent": 8.0, "flatFeePerKwh": None, "note": "Reduced rate for the first 12 months."},
    {"id": "listing", "name": "Listing only", "model": "listing_only",
     "commissionPercent": None, "flatFeePerKwh": None, "note": "Operator collects payment; no PlugOrbit fee."},
]


def default_config() -> dict:
    flags = {name: bool(meta["built"]) for name, meta in FEATURE_FLAGS.items()}
    return {
        "liveMaxAgeSec": DEFAULT_LIVE_MAX_AGE_MS // 1000,
        "staleAfterSec": DEFAULT_STALE_AFTER_MS // 1000,
        "minRouteBatteryReservePct": 12,
        "adminIdleTimeoutMinutes": 30,
        "platformFeeGstPercent": 18.0,
        "settlementMakerChecker": True,
        "rankingWeights": copy.deepcopy(DEFAULT_RANKING_WEIGHTS),
        "featureFlags": flags,
        "commissionPlans": copy.deepcopy(DEFAULT_COMMISSION_PLANS),
    }


def get(store: Store) -> dict:
    doc = store.get(CONFIG, CONFIG_ID)
    if doc is None:
        doc = store.create(CONFIG, CONFIG_ID, stamp(default_config()))
    # Newly-introduced flags appear (off unless built) without a migration.
    flags = {**{n: bool(m["built"]) for n, m in FEATURE_FLAGS.items()}, **doc.get("featureFlags", {})}
    return {**doc, "featureFlags": {k: v for k, v in flags.items() if k in FEATURE_FLAGS}}


def public(doc: dict) -> dict:
    return {**doc, "featureCatalog": FEATURE_FLAGS}


def thresholds(cfg: dict) -> tuple[int, int]:
    """(live_max_age_ms, stale_after_ms)."""
    return cfg["liveMaxAgeSec"] * 1000, cfg["staleAfterSec"] * 1000


def update(store: Store, principal: Principal, body: ConfigUpdate) -> dict:
    current = get(store)
    check_version(current, body.expectedVersion)
    new = body.model_dump(exclude={"expectedVersion", "reason"})
    new["commissionPlans"] = [p.model_dump() for p in body.commissionPlans]
    saved = store.update(CONFIG, CONFIG_ID, stamp(new, current, actor_uid=principal.uid))
    before, after = diff(current, saved, list(new))
    if after:
        audit.record(principal, "config.update", "config", CONFIG_ID, label="Platform settings",
                     before=before, after=after, reason=body.reason)
    return public(saved)
