#!/usr/bin/env python3
"""Generate the EV Rental Platform architecture diagram as an .excalidraw scene.

Written as a generator rather than hand-authored JSON so ids, text bindings and
geometry stay consistent: every box gets a bound label (so the label moves when
the box moves) and every arrow gets both endpoints bound (so it re-routes).
"""
import json, random, string

random.seed(20260910)
NOW = 1789000000000

def rid():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=21))

def nonce():
    return random.randint(1, 2_000_000_000)

# --- Enterprise palette -----------------------------------------------------
APP     = ("#e7f5ff", "#1971c2")   # our app tier
DATA    = ("#ebfbee", "#2f9e44")   # data tier
ASYNC   = ("#fff4e6", "#e8590c")   # off the request path
NEUTRAL = ("#f8f9fa", "#343a40")   # plain module
GROUP   = ("#f1f3f5", "#adb5bd")   # container
INK     = "#212529"
MUTED   = "#868e96"
ARROW   = "#495057"

elements = []

def base(x, y, w, h):
    return dict(x=x, y=y, width=w, height=h, angle=0, strokeWidth=2,
                strokeStyle="solid", roughness=0, opacity=100, groupIds=[],
                frameId=None, seed=nonce(), version=1, versionNonce=nonce(),
                isDeleted=False, boundElements=[], updated=NOW, link=None,
                locked=False)

def box(x, y, w, h, label, role=NEUTRAL, dashed=False, size=16):
    """A rounded rectangle with its label bound to it."""
    bg, stroke = role
    bid, tid = rid(), rid()
    rect = dict(id=bid, type="rectangle", **base(x, y, w, h))
    rect.update(backgroundColor=bg, strokeColor=stroke, fillStyle="solid",
                roundness={"type": 3})
    if dashed:
        rect["strokeStyle"] = "dashed"
    rect["boundElements"] = [{"type": "text", "id": tid}]

    lines = label.count("\n") + 1
    lh = size * 1.25
    th = lh * lines
    text = dict(id=tid, type="text", **base(x + 12, y + (h - th) / 2, w - 24, th))
    text.update(strokeColor=INK, backgroundColor="transparent", fillStyle="solid",
                text=label, originalText=label, fontSize=size, fontFamily=2,
                textAlign="center", verticalAlign="middle", containerId=bid,
                lineHeight=1.25, baseline=int(size * 0.9), autoResize=False)
    elements.extend([rect, text])
    return bid

def container(x, y, w, h):
    bg, stroke = GROUP
    c = dict(id=rid(), type="rectangle", **base(x, y, w, h))
    c.update(backgroundColor=bg, strokeColor=stroke, fillStyle="solid",
             roundness={"type": 3}, strokeWidth=1, opacity=60)
    elements.append(c)
    return c["id"]

def label(x, y, txt, size=20, color=INK, w=None):
    lines = txt.count("\n") + 1
    lh = size * 1.25
    t = dict(id=rid(), type="text", **base(x, y, w or (len(max(txt.split(chr(10)), key=len)) * size * 0.58), lh * lines))
    t.update(strokeColor=color, backgroundColor="transparent", fillStyle="solid",
             text=txt, originalText=txt, fontSize=size, fontFamily=2,
             textAlign="left", verticalAlign="top", containerId=None,
             lineHeight=1.25, baseline=int(size * 0.9), autoResize=True)
    elements.append(t)
    return t["id"]

def arrow(x, y, dx, dy, src, dst):
    a = dict(id=rid(), type="arrow", **base(x, y, abs(dx) or 1, abs(dy) or 1))
    a.update(strokeColor=ARROW, backgroundColor="transparent", fillStyle="solid",
             points=[[0, 0], [dx, dy]], roundness={"type": 2},
             startArrowhead=None, endArrowhead="arrow",
             startBinding={"elementId": src, "focus": 0, "gap": 8},
             endBinding={"elementId": dst, "focus": 0, "gap": 8})
    elements.append(a)
    # Excalidraw needs the arrow recorded on both shapes to re-route on drag.
    for eid in (src, dst):
        for e in elements:
            if e["id"] == eid:
                e.setdefault("boundElements", []).append({"type": "arrow", "id": a["id"]})
    return a["id"]

# --- Header -----------------------------------------------------------------
label(80, 40, "EV Rental Platform — Target Architecture", size=28)
label(80, 84, "Multi-tenant fleet operations.  Phase 1 ships the admin web app on Spring Boot + PostgreSQL with tenant isolation enforced in the database.",
      size=15, color=MUTED)
label(80, 112, "Solid = Phase 1 (building now)          Dashed = Phase 2 / 3 (roadmap)",
      size=14, color=MUTED)

# --- Row A: clients ---------------------------------------------------------
container(80, 160, 1980, 200)
label(104, 176, "CLIENTS", size=14, color=MUTED)
b_admin = box(170, 218, 560, 118,
              "Admin web app\nReact 19 · Vite · TypeScript · MUI\nTanStack Query · RHF + Zod", APP)
box(790, 218, 560, 118, "Rider mobile app\nRent · pay · raise a ticket\nPhase 2", APP, dashed=True)
box(1410, 218, 560, 118, "Field engineer app\nJob cards · repair cost · QC\nPhase 2", APP, dashed=True)

# --- Row B: edge ------------------------------------------------------------
b_edge = box(170, 430, 1720, 90,
             "Edge  —  Nginx · TLS termination · static assets · rate limiting", NEUTRAL)

# --- Row C: API -------------------------------------------------------------
c_api = container(80, 580, 1980, 390)
label(104, 596, "API   ·   Spring Boot 3.3   ·   Java 21   ·   REST /api   ·   OpenAPI / Swagger", size=16, color=MUTED)
box(140, 636, 1860, 96,
    "Spring Security + JWT  (15 min access · 7 day refresh)      ·      TenantFilter  →  SET LOCAL app.tenant_id\n"
    "Role gate:  SUPER_ADMIN   ·   TENANT_ADMIN   ·   TENANT_STAFF", APP)

mods = [
    "auth\nlogin · refresh\npassword reset",
    "platform\ntenants · plans\ninquiries · analytics",
    "tenantadmin\nvehicles · riders\nassignments · payments",
    "shared\ncross-tenant\nblacklist",
    "notification\nemail · SMS\ndispatch",
    "excel\n.xlsx bulk\nimport",
]
mx = 145
for m in mods:
    box(mx, 776, 290, 152, m, NEUTRAL)
    mx += 312

# --- Row D: data (left) + async (right) -------------------------------------
c_data = container(80, 1030, 1180, 330)
label(104, 1046, "DATA", size=14, color=MUTED)
box(130, 1090, 520, 130,
    "PostgreSQL 16\nRow-Level Security per tenant\nFlyway migrations", DATA)
box(690, 1090, 520, 130,
    "Redis\ncache · sessions · rate limits\nPhase 2", DATA, dashed=True)
box(130, 1240, 1080, 90,
    "Object storage  —  rider documents, chassis photos      Phase 2", DATA, dashed=True)

c_async = container(1320, 1030, 740, 330)
label(1344, 1046, "ASYNC & SCHEDULED", size=14, color=MUTED)
box(1360, 1090, 660, 130,
    "@Async + ThreadPoolTaskExecutor\nPhase 1\n→ RabbitMQ  (Phase 2)", ASYNC)
box(1360, 1240, 660, 90,
    "Jobs — Monday SMS reminder\nweekly billing run", ASYNC)

# --- Row E: external --------------------------------------------------------
c_ext = container(80, 1430, 1980, 210)
label(104, 1446, "EXTERNAL INTEGRATIONS", size=14, color=MUTED)
box(140, 1490, 420, 118, "SMTP / MailHog\n→ SMS gateway", ASYNC)
box(620, 1490, 420, 118, "WhatsApp\nPhase 2", ASYNC, dashed=True)
box(1100, 1490, 420, 118, "Payment gateway\nPhase 2", ASYNC, dashed=True)
box(1580, 1490, 420, 118, "GPS / telematics\nPhase 3", ASYNC, dashed=True)

# --- Flow -------------------------------------------------------------------
# Phase 1 traffic is the admin web app, so the request path leaves that box.
arrow(450, 336, 0, 86, b_admin, b_edge)
arrow(1070, 520, 0, 52, b_edge, c_api)
label(1090, 530, "HTTPS  /api", size=13, color=MUTED)

arrow(600, 970, 0, 52, c_api, c_data)
label(620, 980, "JDBC · RLS scoped", size=13, color=MUTED)

arrow(1650, 970, 0, 52, c_api, c_async)
label(1670, 980, "enqueue", size=13, color=MUTED)

# Bound to the whole external group: dispatch feeds every provider in it.
arrow(1650, 1360, 0, 62, c_async, c_ext)
label(1670, 1375, "send", size=13, color=MUTED)

scene = {
    "type": "excalidraw",
    "version": 2,
    "source": "https://excalidraw.com",
    "elements": elements,
    "appState": {"viewBackgroundColor": "#ffffff", "gridSize": None},
    "files": {},
}

out = "docs/architecture/ev-rental-architecture.excalidraw"
with open(out, "w") as f:
    json.dump(scene, f, indent=2)
print(f"wrote {out} — {len(elements)} elements")
