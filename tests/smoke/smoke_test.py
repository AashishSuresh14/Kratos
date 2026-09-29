"""End-to-end smoke test against a running Kratos API.

Usage:  python tests/smoke/smoke_test.py [base_url] [--ai]
Env:    KRATOS_DEMO_PASSWORD (defaults to the development seed password)
        --ai also exercises the AI agents (spends tokens).
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://localhost:5080") + "/api/v1"
RUN_AI = "--ai" in sys.argv
PASSWORD = os.environ.get("KRATOS_DEMO_PASSWORD", "Kratos#Demo2026")
results = []


def call(method, path, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            content = r.read()
            return r.status, (content if raw else (json.loads(content) if content else None))
    except urllib.error.HTTPError as e:
        content = e.read()
        try:
            return e.code, json.loads(content) if content else None
        except json.JSONDecodeError:
            return e.code, content.decode(errors="replace")


def check(name, ok, detail=""):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  -- ' + str(detail)[:300]) if not ok and detail else ''}")


def login(email):
    s, b = call("POST", "/auth/login", body={"email": email, "password": PASSWORD})
    check(f"login {email}", s == 200 and "token" in (b or {}), b)
    return b["token"] if s == 200 else None


s, b = call("GET", "/health")
check("health", s == 200 and b["db"] == "ok", b)

s, _ = call("GET", "/accounts")
check("anonymous request is rejected (401)", s == 401)

s, b = call("POST", "/auth/login", body={"email": "priya.am@kratos.demo", "password": "wrong-password"})
check("bad password gives 401 with generic message", s == 401 and "incorrect" in json.dumps(b), b)

admin, exec_, nbd, ebd, priya, arjun = (login(e) for e in [
    "admin@kratos.demo", "exec@kratos.demo", "nbd.lead@kratos.demo", "ebd.lead@kratos.demo", "priya.am@kratos.demo", "arjun.am@kratos.demo"])

# ---- Scoping (AC 10) ----
_, all_exec = call("GET", "/accounts", exec_)
_, mine_priya = call("GET", "/accounts", priya)
_, nbd_lead = call("GET", "/accounts", nbd)
check("executive sees all 10 accounts", len(all_exec) == 10, len(all_exec))
check("account manager sees only their accounts", 0 < len(mine_priya) < 10, len(mine_priya))
check("NBD lead sees NBD accounts (plus any they are on)", all(a["type"] == "NBD" for a in nbd_lead) and len(nbd_lead) >= 4, [a["name"] for a in nbd_lead])

priya_ids = {a["id"] for a in mine_priya}
outside = next(a for a in all_exec if a["id"] not in priya_ids)
s, _ = call("GET", f"/accounts/{outside['id']}", priya)
check("account manager gets 404 for an account outside scope", s == 404, s)

own = mine_priya[0]
s, plan = call("GET", f"/accounts/{own['id']}", priya)
check("account plan loads with 11 sections S1-S12", s == 200 and len(plan["sections"]) == 11 and plan["sections"][0]["code"] == "S1", s)
check("plan has deterministic scores", 0 <= plan["scores"]["health"] <= 100 and plan["scores"]["riskLevel"] in ("Low", "Medium", "High"))

s, _ = call("GET", f"/accounts/{own['id']}", admin)
check("admin cannot open plan content (403)", s == 403, s)
s, _ = call("PUT", f"/accounts/{own['id']}/infobase", exec_, {"unknowns": "x", "rowVersion": plan["rowVersion"]})
check("executive cannot edit plans (403)", s == 403, s)
s, _ = call("GET", "/admin/users", priya)
check("non-admin cannot reach admin endpoints (403)", s == 403, s)

# ---- Section edit, validation, concurrency (AC 1, 2) ----
s, updated = call("PUT", f"/accounts/{own['id']}/infobase", priya,
                  {"unknowns": "Who owns the FY27 data budget", "knownUnconfirmed": "Platform consolidation next quarter",
                   "growthLevers": "CIO is a reference", "rowVersion": plan["rowVersion"]})
check("update S2 info base", s == 200 and updated["infobase"]["unknowns"].startswith("Who owns"), updated)
s, b = call("PUT", f"/accounts/{own['id']}/infobase", priya, {"unknowns": "stale write", "rowVersion": plan["rowVersion"]})
check("stale rowVersion gives 409 conflict", s == 409, b)
s, b = call("POST", f"/accounts/{own['id']}/opportunities", priya, {"title": "", "offeringId": "00000000-0000-0000-0000-000000000000", "potential": 9, "effort": 1, "complexity": 1, "isPriority": False})
check("invalid opportunity gives 422 with field errors", s == 422 and "errors" in b, b)

_, master = call("GET", "/master", priya)
s, withopp = call("POST", f"/accounts/{own['id']}/opportunities", priya,
                  {"title": "Smoke test opportunity", "offeringId": master["offerings"][0]["id"], "potential": 5, "effort": 2, "complexity": 2, "estimatedValue": 120000, "isPriority": True})
new_opp = next(o for o in withopp["opportunities"] if o["title"] == "Smoke test opportunity")
check("add opportunity computes a score", s == 200 and new_opp["score"] > 0, new_opp)

# ---- Actions (AC 4) ----
s, act = call("POST", f"/accounts/{own['id']}/actions", priya,
              {"title": "Book discovery workshop", "sourceSection": "priorityActions", "opportunityId": new_opp["id"],
               "ownerId": plan["summary"]["captainId"], "dueDate": "2026-12-15"})
check("create action linked to S10 and an opportunity", s == 200 and act["sourceSection"] == "priorityActions", act)
s, sub = call("POST", f"/accounts/{own['id']}/actions", priya,
              {"title": "Send pre-read", "sourceSection": "actionPlan", "ownerId": plan["summary"]["captainId"], "dueDate": "2026-12-30", "parentId": act["id"]})
check("sub-action due after parent is rejected (422)", s == 422, sub)
s, _ = call("PATCH", f"/actions/{act['id']}", priya, {"status": "InProgress"})
check("update action status", s == 200)
s, overdue = call("GET", "/actions?overdue=true", nbd)
check("overdue actions listed for group lead", s == 200 and isinstance(overdue, list), s)

# ---- Versions and trends (AC 3) ----
s, v = call("POST", f"/accounts/{own['id']}/versions", priya, {"changeSummary": "Smoke test review"})
check("save version", s == 200 and v["number"] >= 2, v)
s, trend = call("GET", f"/accounts/{own['id']}/scores/trend", priya)
check("score trend across versions", s == 200 and len(trend["points"]) >= 2, trend)
s, diff = call("GET", f"/accounts/{own['id']}/versions/{v['number']}/diff?against=1", priya)
check("diff between versions shows changes", s == 200 and len(diff["changes"]) > 0, diff)

# ---- Views (AC 7) ----
for view in ("mac", "nbd", "ebd"):
    s, b = call("GET", f"/views/{view}", exec_)
    check(f"{view.upper()} view", s == 200, b)
s, _ = call("GET", "/views/mac", admin)
check("admin cannot see portfolio views (403)", s == 403, s)

# ---- Admin configuration (AC 9) ----
s, w = call("PUT", "/admin/scoring-weights", admin, {"weights": [{"key": "health.brickwall", "weight": 30}]})
check("admin updates a scoring weight", s == 200 and any(x["key"] == "health.brickwall" and x["weight"] == 30 for x in w), w)
s, b = call("PUT", "/admin/scoring-weights", admin, {"weights": [{"key": "nope", "weight": 3}]})
check("unknown weight key rejected", s == 422, b)
s, off = call("POST", "/admin/master/offerings", admin, {"name": "Smoke Offering", "category": "Test", "isActive": True})
check("admin adds an offering", s == 200 and off["name"] == "Smoke Offering", off)

# ---- Exports (AC 5, 6) ----
s, xl = call("GET", f"/accounts/{own['id']}/export", priya, raw=True)
check("account workbook export (.xlsx)", s == 200 and xl[:2] == b"PK", s)
s, xl = call("GET", "/exports/bd-pack", nbd, raw=True)
check("BD pack export", s == 200 and xl[:2] == b"PK", s)
s, xl = call("GET", "/exports/executive-pack", exec_, raw=True)
check("Executive pack export", s == 200 and xl[:2] == b"PK", s)
s, _ = call("GET", "/exports/executive-pack", priya, raw=True)
check("account manager cannot download executive pack (403)", s == 403, s)

# ---- Security Sentinel ----
for _ in range(6):
    call("POST", "/auth/login", body={"email": "arjun.am@kratos.demo", "password": "bad"})
s, b = call("POST", "/auth/login", body={"email": "arjun.am@kratos.demo", "password": PASSWORD})
check("account locks after 5 failed sign-ins (429)", s == 429 and "failed sign-in attempts" in json.dumps(b), b)
s, findings = call("POST", "/security/scan", admin)
check("security sentinel flags brute-force", s == 200 and any(f["rule"] == "Brute-force sign-in" for f in findings), findings)
s, audit = call("GET", "/security/audit?take=50", admin)
check("audit log records denied access", s == 200 and any(a["outcome"] == "Denied" for a in audit), s)

# ---- AI agents (AC 8) ----
if RUN_AI:
    s, rec = call("POST", f"/accounts/{own['id']}/ai/next-best-action", priya)
    check("next best action agent", s == 200 and rec.get("action"), rec)
    if s == 200:
        print("      ->", rec["action"], "|", rec["channel"], "|", rec["meta"])
        s, a2 = call("POST", f"/ai/recommendations/{rec['id']}/accept", priya, {"ownerId": plan["summary"]["captainId"], "dueDate": "2026-11-30"})
        check("accept recommendation creates a tracked action", s == 200 and a2["origin"] == "AiNextBestAction", a2)
    s, cp = call("POST", f"/accounts/{own['id']}/ai/copilot", priya, {"section": "vision", "instruction": "Draft a sharper 1-year vision"})
    check("plan copilot agent", s == 200 and len(cp.get("suggestion", "")) > 20, cp)
    s, rs = call("POST", "/ai/risk-scan", exec_)
    check("risk sentinel agent", s == 200 and len(rs["accounts"]) > 0, rs)
    s, br = call("GET", "/ai/executive-brief", exec_)
    check("executive brief agent", s == 200 and len(br.get("sections", [])) >= 3, br)
    s, ev = call("POST", "/ai/evaluations/run", admin)
    check("agent evaluator", s == 200 and len(ev) >= 1, ev)
    s, us = call("GET", "/ai/usage", admin)
    check("AI usage is tracked", s == 200 and us["usedTokens"] > 0, us)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
