#!/usr/bin/env python3
"""PreToolUse hook: block agents from reading sibling Agent Canvas workspaces.

Reads a HookEvent JSON from stdin. Denies terminal / file tools that target:
  - sibling hex dirs under the same workspaces root
  - the workspaces parent itself (listing other conversations)
  - global personal skill dirs (~/.openhands/skills, ~/.agents/skills)
  - parent-directory escapes like `ls ..` / `cd ..`

Exit 0 + {"decision":"allow"}  -> allow
Exit 2 + {"decision":"deny"}   -> block the tool call
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable

HEX_DIR_RE = re.compile(r"^[0-9a-f]{16,}$", re.IGNORECASE)

PATH_TOKEN_RE = re.compile(
    r"(?:"
    r"~/\.openhands(?:/[^\s'\"`;|&<>]*)?"
    r"|"
    r"~/\.agents/skills(?:/[^\s'\"`;|&<>]*)?"
    r"|"
    r"/home/[^/\s'\"]+/\.openhands(?:/[^\s'\"`;|&<>]*)?"
    r"|"
    r"/home/[^/\s'\"]+/\.agents/skills(?:/[^\s'\"`;|&<>]*)?"
    r"|"
    r"(?:\.\./)+"
    r"(?:[^\s'\"`;|&<>]*)?"
    r")"
)

# `ls ..`, `cd ..`, `find ..`, optionally with flags before the `..`.
PARENT_ESCAPE_RE = re.compile(
    r"(?:^|[\s;|&])(?:cd|pushd|ls|ll|dir|tree|find|du|stat|cat|less|more|"
    r"head|tail|rg|grep|bat)\s+(?:--?\S+\s+)*\.\.(?:/|\s|$)",
    re.IGNORECASE,
)

FILE_EDITOR_COMMANDS = {"view", "create", "str_replace", "insert", "undo_edit"}

PATH_KEYS = (
    "path",
    "file_path",
    "filepath",
    "target_file",
    "target_directory",
    "directory",
    "dir",
    "cwd",
    "working_directory",
    "glob",
)


def emit(decision: str, reason: str) -> int:
    print(json.dumps({"decision": decision, "reason": reason}, ensure_ascii=False))
    return 0 if decision == "allow" else 2


def resolve_working_dir(event: dict[str, Any]) -> Path:
    raw = (
        event.get("working_dir")
        or os.environ.get("OPENHANDS_PROJECT_DIR")
        or os.getcwd()
    )
    try:
        return Path(str(raw)).expanduser().resolve()
    except OSError:
        return Path(str(raw)).expanduser().absolute()


def find_workspaces_root(working_dir: Path) -> Path | None:
    for candidate in [working_dir, *working_dir.parents]:
        if candidate.parent.name == "workspaces" and HEX_DIR_RE.match(candidate.name):
            return candidate.parent
    return None


def current_workspace_root(working_dir: Path, workspaces_root: Path | None) -> Path:
    if workspaces_root is None:
        return working_dir
    for candidate in [working_dir, *working_dir.parents]:
        if candidate.parent == workspaces_root and HEX_DIR_RE.match(candidate.name):
            return candidate
    return working_dir


def is_under(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def global_skill_roots() -> list[Path]:
    home = Path.home()
    roots: list[Path] = []
    for rel in (Path(".openhands") / "skills", Path(".agents") / "skills"):
        try:
            roots.append((home / rel).resolve())
        except OSError:
            roots.append((home / rel).absolute())
    return roots


def forbidden_reason(
    path: Path,
    workspace_root: Path,
    workspaces_root: Path | None,
) -> str | None:
    try:
        resolved = path.expanduser().resolve(strict=False)
    except OSError:
        resolved = path.expanduser().absolute()

    if is_under(resolved, workspace_root) or resolved == workspace_root:
        return None

    for skills_root in global_skill_roots():
        if resolved == skills_root or is_under(resolved, skills_root):
            return f"blocked global skills path outside this conversation: {resolved}"

    if workspaces_root is not None:
        if resolved == workspaces_root:
            return "blocked listing Agent Canvas workspaces root (sibling isolation)"
        if is_under(resolved, workspaces_root):
            return f"blocked sibling / foreign workspace path: {resolved}"
        if resolved == workspaces_root.parent:
            return "blocked Agent Canvas parent directory (sibling isolation)"

    return None


def collect_paths_from_mapping(data: Any, out: list[str]) -> None:
    if isinstance(data, dict):
        for key, value in data.items():
            key_l = str(key).lower()
            if key_l in PATH_KEYS and isinstance(value, str) and value.strip():
                out.append(value.strip())
            else:
                collect_paths_from_mapping(value, out)
    elif isinstance(data, list):
        for item in data:
            collect_paths_from_mapping(item, out)


def extract_command_paths(command: str, working_dir: Path) -> list[Path]:
    paths: list[Path] = []
    for match in PATH_TOKEN_RE.finditer(command):
        token = match.group(0)
        if token.startswith(".."):
            try:
                paths.append((working_dir / token).resolve(strict=False))
            except OSError:
                paths.append((working_dir / token).absolute())
            continue
        try:
            paths.append(Path(token).expanduser().resolve(strict=False))
        except OSError:
            paths.append(Path(token).expanduser().absolute())
    return paths


def iter_candidate_paths(
    tool_input: dict[str, Any] | None,
    working_dir: Path,
) -> Iterable[Path]:
    if not tool_input:
        return []
    raw: list[str] = []
    collect_paths_from_mapping(tool_input, raw)

    command = tool_input.get("command")
    if (
        isinstance(command, str)
        and ("/" in command or "~" in command or ".." in command)
        and command not in FILE_EDITOR_COMMANDS
    ):
        yield from extract_command_paths(command, working_dir)

    for item in raw:
        p = Path(item)
        if not p.is_absolute() and not item.startswith("~"):
            p = working_dir / item
        try:
            yield p.expanduser().resolve(strict=False)
        except OSError:
            yield p.expanduser().absolute()


def evaluate(event: dict[str, Any]) -> tuple[str, str]:
    working_dir = resolve_working_dir(event)
    workspaces_root = find_workspaces_root(working_dir)
    workspace_root = current_workspace_root(working_dir, workspaces_root)
    tool_input = event.get("tool_input") or {}
    if not isinstance(tool_input, dict):
        tool_input = {}

    command = tool_input.get("command")
    if isinstance(command, str) and command not in FILE_EDITOR_COMMANDS:
        if PARENT_ESCAPE_RE.search(command):
            return (
                "deny",
                "blocked parent-directory escape from the current skill workspace",
            )
        # Bare `..` anywhere as a path argument.
        if re.search(r"(^|[\s\"'])\.\.($|[\s\"'/])", command):
            try:
                parent = (working_dir / "..").resolve(strict=False)
            except OSError:
                parent = (working_dir / "..").absolute()
            reason = forbidden_reason(parent, workspace_root, workspaces_root)
            if reason:
                return "deny", reason

    for path in iter_candidate_paths(tool_input, working_dir):
        reason = forbidden_reason(path, workspace_root, workspaces_root)
        if reason:
            return "deny", reason

    return "allow", "within current workspace"


def main() -> int:
    try:
        raw = sys.stdin.read()
        event = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return emit("allow", "unreadable hook event; default allow")

    if not isinstance(event, dict):
        return emit("allow", "non-object hook event; default allow")

    decision, reason = evaluate(event)
    return emit(decision, reason)


if __name__ == "__main__":
    sys.exit(main())
