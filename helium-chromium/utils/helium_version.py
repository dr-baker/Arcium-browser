#!/usr/bin/env python3

# Copyright 2025 The Helium Authors
# You can use, redistribute, and/or modify this source code under
# the terms of the GPL-3.0 license that can be found in the LICENSE file.
"""
Script to generate Helium version numbers
and inject them into the Chromium build tree.
"""

import argparse
from pathlib import Path

CHROME_VERSION_BASE = 136


def get_version_part(path):
    """
    Gets the (first) digit representing a part of
    the version from a particular file.
    """
    with open(path, "r", encoding="utf-8") as file:
        return int(file.readline().split(".")[0].strip())


def refresh_version(path, version_parts):
    """Replace generated Helium fields while preserving Chromium fields."""
    original = path.read_text(encoding="utf-8")
    lines = [line for line in original.splitlines() if not line.startswith("HELIUM_")]
    lines.extend(f"{name}={version}" for name, version in version_parts.items())
    updated = "\n".join(lines) + "\n"
    if updated != original:
        path.write_text(updated, encoding="utf-8")


def parse_args():
    """Argument parsing"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--tree", type=Path, required=True)
    parser.add_argument("--platform-tree", type=Path)
    parser.add_argument("--chromium-tree", type=Path)
    parser.add_argument("--print", action=argparse.BooleanOptionalAction)
    args = parser.parse_args()
    return (args.tree, args.platform_tree, args.chromium_tree, args.print)


def get_version_parts(tree, platform_tree):
    """Compiles all the version parts into the full version"""
    version_paths = {
        "HELIUM_MAJOR": tree / "version.txt",
        "HELIUM_MINOR": tree / "chromium_version.txt",
        "HELIUM_PATCH": tree / "revision.txt",
    }

    if platform_tree is not None:
        version_paths["HELIUM_PLATFORM"] = platform_tree / "revision.txt"

    version_parts = {}
    for name, path in version_paths.items():
        delta = 0 if name != "HELIUM_MINOR" else -CHROME_VERSION_BASE
        version_parts[name] = str(get_version_part(path) + delta)
    return version_parts


def main():
    """CLI entrypoint"""
    tree, platform_tree, chromium_tree, should_print = parse_args()

    version_parts = get_version_parts(tree, platform_tree)
    if should_print:
        print('.'.join(version_parts.values()))
    else:
        chrome_version_path = chromium_tree / "chrome/VERSION"
        refresh_version(chrome_version_path, version_parts)


if __name__ == "__main__":
    main()
