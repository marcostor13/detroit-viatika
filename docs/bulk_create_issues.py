#!/usr/bin/env python3
"""
bulk_create_issues.py
Crea labels, milestones e issues en GitHub leyendo VIATIKA_Issues_GitHub.md
Uso: set GITHUB_TOKEN=<tu_token> && python bulk_create_issues.py
"""

import re, os, sys, time
import requests

REPO  = "marcostor13/viatika"
MD    = "VIATIKA_Issues_GitHub.md"
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GHP_TOKEN", "")

if not TOKEN:
    # Intentar leer del .env de viatika-back
    env_path = os.path.join(os.path.dirname(__file__), "viatika-back", ".env")
    if os.path.exists(env_path):
        for line in open(env_path, encoding="utf-8"):
            line = line.strip()
            if line.startswith("GHP_TOKEN="):
                TOKEN = line.split("=", 1)[1].strip()
                break

if not TOKEN:
    print("ERROR: define GITHUB_TOKEN o GHP_TOKEN, o ponlo en viatika-back/.env")
    sys.exit(1)

BASE   = "https://api.github.com"
OWNER, REPO_NAME = REPO.split("/")
HEADS  = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# ── helpers ──────────────────────────────────────────────────────────────────

def get(path):
    r = requests.get(f"{BASE}{path}", headers=HEADS)
    r.raise_for_status()
    return r.json()

def post(path, data):
    r = requests.post(f"{BASE}{path}", headers=HEADS, json=data)
    if r.status_code == 422:   # ya existe
        return None
    r.raise_for_status()
    return r.json()

def rate_wait(r):
    remaining = int(r.headers.get("X-RateLimit-Remaining", 1))
    if remaining < 5:
        reset = int(r.headers.get("X-RateLimit-Reset", time.time() + 60))
        wait = max(reset - time.time() + 2, 1)
        print(f"  Rate limit bajo ({remaining}). Esperando {int(wait)}s...")
        time.sleep(wait)

# ── 1. Labels ─────────────────────────────────────────────────────────────────

LABEL_COLORS = {
    "historia-usuario":    "1F4E79",
    "transversal":         "2E75B6",
}
for n in range(1, 11):
    LABEL_COLORS[f"fase-{n}"] = "C00000"

ROLE_COLORS = {
    "rol:admin":           "0075CA",
    "rol:colaborador":     "E4E669",
    "rol:superadmin":      "D93F0B",
    "rol:tesorero":        "BFD4F2",
    "rol:todos":           "FBCA04",
}
LABEL_COLORS.update(ROLE_COLORS)

def ensure_labels(all_labels: set):
    existing = {l["name"] for l in get(f"/repos/{REPO}/labels")}
    for name in sorted(all_labels):
        if name in existing:
            continue
        color = LABEL_COLORS.get(name, "EDEDED")
        r = requests.post(
            f"{BASE}/repos/{REPO}/labels",
            headers=HEADS,
            json={"name": name, "color": color},
        )
        if r.status_code not in (201, 422):
            r.raise_for_status()
        status = "creado" if r.status_code == 201 else "ya existia"
        print(f"  label [{status}] {name}")

# ── 2. Milestones ─────────────────────────────────────────────────────────────

def ensure_milestones(all_milestones: set) -> dict:
    existing = {m["title"]: m["number"] for m in get(f"/repos/{REPO}/milestones?state=all&per_page=100")}
    for title in sorted(all_milestones):
        if title not in existing:
            r = requests.post(
                f"{BASE}/repos/{REPO}/milestones",
                headers=HEADS,
                json={"title": title},
            )
            if r.status_code == 201:
                existing[title] = r.json()["number"]
                print(f"  milestone [creado] {title}")
            elif r.status_code == 422:
                print(f"  milestone [ya existia] {title}")
            else:
                r.raise_for_status()
        else:
            print(f"  milestone [ya existia] {title}")
    # Refrescar por si acaso
    return {m["title"]: m["number"] for m in get(f"/repos/{REPO}/milestones?state=all&per_page=100")}

# ── 3. Parsear MD ─────────────────────────────────────────────────────────────

def parse_issues(path):
    text = open(path, encoding="utf-8").read()
    blocks = re.findall(r"---ISSUE---\s*\n(.*?)\n---END-ISSUE---", text, re.DOTALL)
    issues = []
    for blk in blocks:
        title  = re.search(r"^TITLE:\s*(.+)$",    blk, re.M).group(1).strip()
        labels = re.search(r"^LABELS:\s*(.+)$",   blk, re.M).group(1).strip()
        milest = re.search(r"^MILESTONE:\s*(.+)$", blk, re.M).group(1).strip()
        body_m = re.search(r"^BODY:\s*\n(.*)$",   blk, re.DOTALL | re.M)
        body   = body_m.group(1).strip() if body_m else ""
        issues.append({
            "title":     title,
            "labels":    [l.strip() for l in labels.split(",")],
            "milestone": milest,
            "body":      body,
        })
    return issues

# ── 4. Crear issues ───────────────────────────────────────────────────────────

def existing_titles() -> set:
    titles, page = set(), 1
    while True:
        items = get(f"/repos/{REPO}/issues?state=all&per_page=100&page={page}")
        if not items:
            break
        titles.update(i["title"] for i in items)
        page += 1
    return titles

def create_issues(issues, milestone_map):
    already = existing_titles()
    total   = len(issues)
    created = skipped = errors = 0

    for idx, iss in enumerate(issues, 1):
        title = iss["title"]
        if title in already:
            print(f"[{idx}/{total}] SKIP (ya existe): {title}")
            skipped += 1
            continue

        mn = milestone_map.get(iss["milestone"])
        payload = {
            "title":     title,
            "body":      iss["body"],
            "labels":    iss["labels"],
        }
        if mn:
            payload["milestone"] = mn

        r = requests.post(f"{BASE}/repos/{REPO}/issues", headers=HEADS, json=payload)
        rate_wait(r)

        if r.status_code == 201:
            print(f"[{idx}/{total}] OK: {title}")
            created += 1
        else:
            print(f"[{idx}/{total}] ERROR {r.status_code}: {title} — {r.text[:120]}")
            errors += 1

        time.sleep(0.5)   # evitar rate limit secundario

    return created, skipped, errors

# ── main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Repo: {REPO}")
    print(f"Archivo: {MD}\n")

    issues = parse_issues(MD)
    print(f"Issues encontrados: {len(issues)}\n")

    all_labels     = {l for iss in issues for l in iss["labels"]}
    all_milestones = {iss["milestone"] for iss in issues}

    print("-- Creando labels --")
    ensure_labels(all_labels)

    print("\n-- Creando milestones --")
    milestone_map = ensure_milestones(all_milestones)

    print("\n-- Creando issues --")
    created, skipped, errors = create_issues(issues, milestone_map)

    print(f"\nCreados: {created}  |  Saltados: {skipped}  |  Errores: {errors}")
