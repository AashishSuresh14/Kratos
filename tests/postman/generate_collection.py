"""Generates tests/postman/Kratos.postman_collection.json (Postman v2.1).

Run:    python tests/postman/generate_collection.py
Use:    newman run tests/postman/Kratos.postman_collection.json --env-var baseUrl=http://localhost:5080 --env-var password=<demo password>
"""
import json
import pathlib


def req(name, method, path, token_var=None, body=None, tests=(), prerequest=None):
    headers = [{"key": "Content-Type", "value": "application/json"}]
    if token_var:
        headers.append({"key": "Authorization", "value": "Bearer {{" + token_var + "}}"})
    item = {
        "name": name,
        "request": {
            "method": method,
            "header": headers,
            "url": {"raw": "{{baseUrl}}/api/v1" + path, "host": ["{{baseUrl}}"], "path": ["api", "v1"] + [p for p in path.split("?")[0].split("/") if p]},
        },
        "event": [{"listen": "test", "script": {"type": "text/javascript", "exec": list(tests)}}],
    }
    if "?" in path:
        item["request"]["url"]["query"] = [{"key": k, "value": v} for k, v in (kv.split("=") for kv in path.split("?")[1].split("&"))]
    if body is not None:
        item["request"]["body"] = {"mode": "raw", "raw": json.dumps(body, indent=2)}
    if prerequest:
        item["event"].append({"listen": "prerequest", "script": {"type": "text/javascript", "exec": prerequest}})
    return item


def status(code):
    return f"pm.test('status {code}', () => pm.response.to.have.status({code}));"


def login(email, var):
    return req(f"Sign in as {email}", "POST", "/auth/login", body={"email": email, "password": "{{password}}"},
               tests=[status(200), f"pm.collectionVariables.set('{var}', pm.response.json().token);"])


items = [
    {"name": "0. Health and auth", "item": [
        req("Health (public)", "GET", "/health", tests=[status(200), "pm.test('db ok', () => pm.expect(pm.response.json().db).to.eql('ok'));"]),
        req("Anonymous request is rejected", "GET", "/accounts", tests=[status(401)]),
        login("priya.am@kratos.demo", "tokenAm"),
        login("exec@kratos.demo", "tokenExec"),
        login("admin@kratos.demo", "tokenAdmin"),
        login("nbd.lead@kratos.demo", "tokenLead"),
    ]},
    {"name": "1. Account plan (AC 1, 2)", "item": [
        req("List my accounts", "GET", "/accounts", "tokenAm", tests=[
            status(200), "const a = pm.response.json(); pm.test('scoped list', () => pm.expect(a.length).to.be.above(0));",
            "pm.collectionVariables.set('accountId', a[0].id);"]),
        req("Get account plan (S1-S12)", "GET", "/accounts/{{accountId}}", "tokenAm", tests=[
            status(200), "const p = pm.response.json();",
            "pm.test('11 sections', () => pm.expect(p.sections.length).to.eql(11));",
            "pm.test('scores 0-100', () => pm.expect(p.scores.health).to.be.within(0, 100));",
            "pm.collectionVariables.set('rowVersion', p.rowVersion); pm.collectionVariables.set('captainId', p.summary.captainId);"]),
        req("Update S2 info base", "PUT", "/accounts/{{accountId}}/infobase", "tokenAm",
            {"unknowns": "Budget owner for FY27", "knownUnconfirmed": "Consolidation programme", "growthLevers": "CIO reference", "rowVersion": "{{rowVersion}}"},
            [status(200)]),
        req("Stale rowVersion conflicts", "PUT", "/accounts/{{accountId}}/infobase", "tokenAm",
            {"unknowns": "stale", "rowVersion": "{{rowVersion}}"}, [status(409)]),
        req("Executive cannot edit", "PUT", "/accounts/{{accountId}}/vision", "tokenExec",
            {"threeYear": "x", "rowVersion": "{{rowVersion}}"}, [status(403)]),
        req("Admin cannot read plan content", "GET", "/accounts/{{accountId}}", "tokenAdmin", tests=[status(403)]),
    ]},
    {"name": "2. Actions and versions (AC 3, 4)", "item": [
        req("Create action", "POST", "/accounts/{{accountId}}/actions", "tokenAm",
            {"title": "Book discovery workshop", "sourceSection": "actionPlan", "ownerId": "{{captainId}}", "dueDate": "2026-12-15"},
            [status(200), "pm.collectionVariables.set('actionId', pm.response.json().id);"]),
        req("Move action to in progress", "PATCH", "/actions/{{actionId}}", "tokenAm", {"status": "InProgress"}, [status(200)]),
        req("Overdue actions in my groups", "GET", "/actions?overdue=true", "tokenLead", tests=[status(200)]),
        req("Save plan version", "POST", "/accounts/{{accountId}}/versions", "tokenAm", {"changeSummary": "Postman review"}, [status(200)]),
        req("Score trend", "GET", "/accounts/{{accountId}}/scores/trend", "tokenAm", tests=[
            status(200), "pm.test('has points', () => pm.expect(pm.response.json().points.length).to.be.above(1));"]),
    ]},
    {"name": "3. Views (AC 7)", "item": [
        req("MAC portfolio", "GET", "/views/mac", "tokenExec", tests=[status(200)]),
        req("NBD view", "GET", "/views/nbd", "tokenExec", tests=[status(200)]),
        req("EBD cross-sell", "GET", "/views/ebd", "tokenExec", tests=[status(200)]),
    ]},
    {"name": "4. Configuration (AC 9)", "item": [
        req("Master data", "GET", "/master", "tokenAm", tests=[status(200)]),
        req("Update scoring weight", "PUT", "/admin/scoring-weights", "tokenAdmin", {"weights": [{"key": "health.brickwall", "weight": 25}]}, [status(200)]),
        req("Non-admin blocked from admin", "GET", "/admin/users", "tokenAm", tests=[status(403)]),
    ]},
    {"name": "5. Exports (AC 6)", "item": [
        req("BD pack", "GET", "/exports/bd-pack", "tokenLead", tests=[status(200)]),
        req("Executive pack", "GET", "/exports/executive-pack", "tokenExec", tests=[status(200)]),
        req("Account manager blocked from executive pack", "GET", "/exports/executive-pack", "tokenAm", tests=[status(403)]),
    ]},
    {"name": "6. AI (AC 8) — needs API keys", "item": [
        req("Next best action", "POST", "/accounts/{{accountId}}/ai/next-best-action", "tokenAm", tests=[
            "pm.test('200 or 503 when AI is not configured', () => pm.expect([200, 503]).to.include(pm.response.code));"]),
        req("Risk scan", "POST", "/ai/risk-scan", "tokenExec", tests=[
            "pm.test('200 or 503', () => pm.expect([200, 503]).to.include(pm.response.code));"]),
    ]},
    {"name": "7. Security", "item": [
        req("Run security scan", "POST", "/security/scan", "tokenAdmin", tests=[status(200)]),
        req("Audit log", "GET", "/security/audit?take=20", "tokenAdmin", tests=[status(200)]),
    ]},
]

collection = {
    "info": {"name": "Kratos Digital KAM API", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
             "description": "Acceptance-criteria walkthrough for the Kratos API. Set baseUrl and password (the demo seed password)."},
    "variable": [{"key": "baseUrl", "value": "http://localhost:5080"}, {"key": "password", "value": ""}],
    "item": items,
}
out = pathlib.Path(__file__).with_name("Kratos.postman_collection.json")
out.write_text(json.dumps(collection, indent=2))
print(f"wrote {out} with {sum(len(g['item']) for g in items)} requests")
