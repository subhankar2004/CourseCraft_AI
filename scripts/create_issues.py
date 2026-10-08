#!/usr/bin/env python3
"""Create labels, milestones and the 50 roadmap issues from docs/ISSUES.md.

Usage:
  python3 scripts/create_issues.py --dry-run     # parse and print, no GitHub calls
  python3 scripts/create_issues.py               # create on GitHub (needs `gh auth login`)

Idempotent: existing labels/milestones are reused and issues whose title already
exists are skipped. Aborts if a new issue's number doesn't match its roadmap number,
because the "Depends on #N" references rely on that.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = "subhankar2004/CourseCraft_AI"
ROOT = Path(__file__).resolve().parent.parent
ISSUES_MD = ROOT / "docs" / "ISSUES.md"

MILESTONES = {
    "P0": ("P0 Setup", "Monorepo, local infra, scaffolds, shared contracts, CI"),
    "P1": ("P1 Core", "Schema, seed, auth, catalog API and UI"),
    "P2": ("P2 Ingestion", "Metadata, transcripts, Whisper, chunking, embeddings"),
    "P3": ("P3 Generation", "Notes, structuring, job pipeline, admin generate and review"),
    "P4": ("P4 Learning UX", "Split view, progress, pathing, dashboard"),
    "P5": ("P5 RAG Chat", "Grounded course-aware chatbot with citations"),
    "P6": ("P6 Evaluation", "Faithfulness, relevance, cognitive load"),
    "P7": ("P7 Deploy & Report", "E2E, hardening, S3/CDN, AWS production"),
}
LABEL_COLORS = {"phase": "5319e7", "area": "0e8a16", "type": "fbca04"}


def gh(*args: str, check: bool = True) -> str:
    res = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and res.returncode != 0:
        sys.exit(f"gh {' '.join(args)} failed:\n{res.stderr}")
    return res.stdout


def parse() -> list[dict]:
    text = ISSUES_MD.read_text()
    blocks = re.split(r"^## (\d+)\. (.+)$", text, flags=re.M)
    issues = []
    for i in range(1, len(blocks), 3):
        num, title, body = int(blocks[i]), blocks[i + 1].strip(), blocks[i + 2]
        body = re.split(r"^(?:---|# )", body, flags=re.M)[0].strip()
        meta_line, _, rest = body.partition("\n")
        meta = dict(kv.strip().split("=", 1) for kv in meta_line.removeprefix("Meta:").split("|"))
        deps = [d for d in meta["depends"].split(",") if d.strip()]
        labels = [f"phase:{meta['phase']}"]
        labels += [f"area:{a}" for a in meta["area"].split(",")]
        labels += [f"type:{meta['type']}"]
        header = f"**Phase:** {MILESTONES[meta['phase']][0]}"
        if deps:
            header += " · **Depends on:** " + ", ".join(f"#{d.strip()}" for d in deps)
        footer = "\n\n---\nSpec: [SPEC.md](../blob/main/SPEC.md) · Roadmap: [docs/ISSUES.md](../blob/main/docs/ISSUES.md)"
        issues.append({
            "num": num, "title": title, "phase": meta["phase"], "labels": labels,
            "body": f"{header}\n\n{rest.strip()}{footer}",
        })
    nums = [x["num"] for x in issues]
    assert nums == list(range(1, len(nums) + 1)), f"issue numbers not sequential: {nums}"
    return issues


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    issues = parse()
    labels = sorted({l for x in issues for l in x["labels"]})
    print(f"Parsed {len(issues)} issues, {len(labels)} labels, {len(MILESTONES)} milestones")
    if args.dry_run:
        for x in issues:
            print(f"#{x['num']:>2} [{x['phase']}] {x['title']}  {x['labels']}")
        return

    for l in labels:
        gh("label", "create", l, "-R", REPO, "--force", "--color", LABEL_COLORS[l.split(":")[0]])
    existing_ms = {m["title"] for m in json.loads(gh("api", f"repos/{REPO}/milestones?state=all&per_page=100"))}
    for title, desc in MILESTONES.values():
        if title not in existing_ms:
            gh("api", f"repos/{REPO}/milestones", "-f", f"title={title}", "-f", f"description={desc}")

    existing = {i["title"]: i["number"] for i in json.loads(
        gh("issue", "list", "-R", REPO, "--state", "all", "--limit", "500", "--json", "title,number"))}
    for x in issues:
        if x["title"] in existing:
            print(f"skip #{existing[x['title']]} {x['title']} (exists)")
            continue
        cmd = ["issue", "create", "-R", REPO, "--title", x["title"], "--body", x["body"],
               "--milestone", MILESTONES[x["phase"]][0]]
        for l in x["labels"]:
            cmd += ["--label", l]
        url = gh(*cmd).strip()
        got = int(url.rsplit("/", 1)[1])
        print(f"created #{got} {x['title']}")
        if got != x["num"]:
            sys.exit(f"Number mismatch: expected #{x['num']}, got #{got}. Stopping so dependency refs stay correct.")


if __name__ == "__main__":
    main()
