"""Create labels, milestones, epics and stories on GitHub from backlog.toml.

Idempotent: existing labels are updated, existing milestones and issues (matched by title) are
skipped. Requires the `gh` CLI, authenticated with `repo` scope.

    uv run --python 3.12 --no-project scripts/github/bootstrap.py ewoutbarendregt/rowlens [--dry-run]
"""

from __future__ import annotations

import json
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any

BACKLOG = Path(__file__).with_name("backlog.toml")


def gh(*args: str, dry_run: bool = False) -> str:
    if dry_run:
        print("DRY", "gh", *args[:4], "…")
        return ""
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def story_body(story: dict[str, Any], epic_number: int) -> str:
    lines = [f"**Epic**: #{epic_number}", "", "### Story", story["story"], "", "### Acceptance criteria"]
    lines += [f"- [ ] {item}" for item in story["ac"]]
    if notes := story.get("notes"):
        lines += ["", "### Notes", notes]
    return "\n".join(lines) + "\n"


def epic_body(epic: dict[str, Any], children: list[tuple[int, str]]) -> str:
    lines = ["### Goal", epic["goal"], "", "### Stories"]
    lines += [f"- [ ] #{n}" for n, _ in children] or ["_Stories are written when this milestone starts._"]
    return "\n".join(lines) + "\n"


def main(repo: str, dry_run: bool) -> None:
    data = tomllib.loads(BACKLOG.read_text())

    for label in data["label"]:
        gh("label", "create", label["name"], "-R", repo, "--force",
           "--color", label["color"], "--description", label["description"], dry_run=dry_run)

    existing_ms = {m["title"] for m in json.loads(gh("api", f"repos/{repo}/milestones?state=all") or "[]")}
    for ms in data["milestone"]:
        if ms["title"] not in existing_ms:
            gh("api", f"repos/{repo}/milestones", "-f", f"title={ms['title']}",
               "-f", f"description={ms['description']}", dry_run=dry_run)

    issues = json.loads(gh("issue", "list", "-R", repo, "--state", "all", "--limit", "500",
                           "--json", "number,title") or "[]")
    by_title: dict[str, int] = {i["title"]: i["number"] for i in issues}

    def create(title: str, body: str, labels: list[str], milestone: str) -> int:
        if title in by_title:
            return by_title[title]
        url = gh("issue", "create", "-R", repo, "--title", title, "--body", body,
                 "--milestone", milestone, *[a for lb in labels for a in ("--label", lb)],
                 dry_run=dry_run).strip()
        number = int(url.rsplit("/", 1)[-1]) if url else -1
        by_title[title] = number
        print(f"#{number} {title}")
        return number

    epics: dict[str, int] = {}
    for epic in data["epic"]:
        epics[epic["key"]] = create(epic["title"], epic_body(epic, []), ["epic", *epic["labels"]],
                                    epic["milestone"])

    children: dict[str, list[tuple[int, str]]] = {k: [] for k in epics}
    milestone_of = {e["key"]: e["milestone"] for e in data["epic"]}
    for story in data["story"]:
        key = story["epic"]
        n = create(story["title"], story_body(story, epics[key]), story["labels"], milestone_of[key])
        children[key].append((n, story["title"]))

    for epic in data["epic"]:
        if children[epic["key"]]:
            gh("issue", "edit", str(epics[epic["key"]]), "-R", repo,
               "--body", epic_body(epic, children[epic["key"]]), dry_run=dry_run)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], dry_run="--dry-run" in sys.argv)
