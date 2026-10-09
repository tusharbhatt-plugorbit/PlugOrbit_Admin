from .conftest import Admin, code


def test_lists_and_details_never_contain_raw_contact_data(sup, store):
    page = sup.get("/users?limit=200").json()
    raw_phones = {u["phone"] for u in store.list("users")}
    raw_emails = {u["email"] for u in store.list("users")}
    blob = str(page)
    assert not any(p in blob for p in raw_phones) and not any(e in blob for e in raw_emails)
    u = page["items"][0]
    assert "•" in u["phoneMasked"] and "•" in u["emailMasked"] and "name" not in u
    detail = sup.get(f"/users/{u['id']}").json()
    assert not any(p in str(detail) for p in raw_phones)


def test_user_search_by_exact_contact_and_name_prefix(sup, store):
    user = store.get("users", "usr-1000")
    assert [u["id"] for u in sup.get(f"/users?q={user['email']}").json()["items"]] == ["usr-1000"]
    assert "usr-1000" in [u["id"] for u in sup.get("/users?q=9876543241").json()["items"]]
    assert sup.get("/users?q=a").json()["total"] == 0  # one letter never fishes through people


def test_restriction_needs_a_reason_and_is_fully_audited(sup):
    assert sup.post("/users/usr-1001/restrict", {"reason": "x"}).status_code == 422
    r = sup.post("/users/usr-1001/restrict", {"reason": "Suspected card fraud on 3 sessions"})
    assert r.status_code == 200 and r.json()["status"] == "restricted"
    res = r.json()["restriction"]
    assert res["reason"] and res["by"] == "dev-support" and res["at"]
    assert code(sup.post("/users/usr-1001/restrict", {"reason": "again please"})) == "ALREADY_RESTRICTED"
    back = sup.post("/users/usr-1001/unrestrict", {"reason": "Cleared after verification"}).json()
    assert back["status"] == "active" and [h["action"] for h in back["restrictionHistory"]] == ["restricted", "unrestricted"]


def test_restrict_audit_entries(sa, sup):
    sup.post("/users/usr-1002/restrict", {"reason": "Abusive behaviour at a station"})
    e = sa.get("/audit?action=user.restrict&entityId=usr-1002").json()["items"][0]
    assert e["before"]["status"] == "active" and e["after"]["status"] == "restricted" and e["actor"]["role"] == "support"
    assert "name" not in str(e["entityLabel"]).lower() or "." in e["entityLabel"]  # display name only, e.g. "Priya K."


def test_revealing_contact_details_is_reasoned_and_audited(sup, sa):
    assert sup.post("/users/usr-1000/reveal", {"reason": "ok"}).status_code == 422
    r = sup.post("/users/usr-1000/reveal", {"reason": "Calling the driver about ticket"})
    assert r.status_code == 200 and r.json()["phone"] == "+919876543241"
    e = sa.get("/audit?action=user.reveal").json()["items"][0]
    assert e["entityId"] == "usr-1000" and e["reason"] == "Calling the driver about ticket"


def test_finance_cannot_reveal_or_restrict(fin):
    assert fin.post("/users/usr-1000/reveal", {"reason": "curious about it"}).status_code == 403
    assert fin.post("/users/usr-1000/restrict", {"reason": "curious about it"}).status_code == 403


def test_unpaid_integrated_sessions_are_surfaced(sup):
    rows = sup.get("/users?unpaid=true&limit=200").json()["items"]
    assert rows and all(u["unpaidIntegratedSessions"] > 0 for u in rows)


# ---------------------------------------------------------------------- support ------
def test_ticket_list_summary_and_sla(sup):
    page = sup.get("/tickets?status=active").json()
    assert page["summary"]["open"] == page["total"] and page["summary"]["urgent"] >= 1
    assert page["items"][0]["priority"] in ("urgent", "high")  # most urgent first
    old = next(t for t in page["items"] if t["id"] and t["slaBreached"] is not None)
    assert "slaDueAt" in old


def test_creating_a_ticket_from_a_session_links_station_and_user(sup, store):
    r = sup.post("/tickets", {"category": "payment_issue", "priority": "high", "subject": "Charged twice for one session", "sessionId": "PO-6A4K92"})
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["stationId"] == "st-chargezone-neemrana" and t["userId"] == "usr-1000" and t["userPhone"] == "98•••41"
    assert t["id"].startswith("TKT-") and t["ownerId"] == "dev-support"
    assert t["id"] in [x["id"] for x in sup.get("/transactions/PO-6A4K92").json()["tickets"]]


def test_ticket_lifecycle_notes_and_assignment(sup, client):
    tid = sup.post("/tickets", {"category": "other", "subject": "Question about receipts"}).json()["id"]
    r = sup.patch(f"/tickets/{tid}", {"status": "in_review", "ownerId": "dev-ops"})
    assert r.json()["status"] == "in_review" and r.json()["ownerName"] == "Meera Iyer"
    n = sup.post(f"/tickets/{tid}/notes", {"body": "Asked the partner for the invoice."}).json()
    assert n["notes"][-1]["internal"] is True and n["notes"][-1]["byName"] == "Isha Nair"
    done = sup.patch(f"/tickets/{tid}", {"status": "resolved"}).json()
    assert done["resolvedAt"] and sup.patch(f"/tickets/{tid}", {"status": "open"}).json()["resolvedAt"] is None
    assert code(sup.patch(f"/tickets/{tid}", {"ownerId": "nobody"})) == "UNKNOWN_OWNER"
    unassigned = sup.patch(f"/tickets/{tid}", {"unassign": True}).json()
    assert unassigned["ownerId"] is None


def test_ticket_rejects_unknown_links(sup):
    assert code(sup.post("/tickets", {"category": "other", "subject": "Bad link here", "sessionId": "PO-NOPE"})) == "UNKNOWN_SESSION"
    assert code(sup.post("/tickets", {"category": "other", "subject": "Bad link here", "stationId": "st-nope"})) == "UNKNOWN_STATION"


def test_finance_can_read_but_not_write_tickets(fin):
    assert fin.get("/tickets").status_code == 200
    assert fin.post("/tickets", {"category": "other", "subject": "Nope not me"}).status_code == 403
