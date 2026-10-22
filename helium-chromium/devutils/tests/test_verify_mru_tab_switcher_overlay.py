"""Tests for the sparse MRU tab-switcher patch verifier."""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import verify_mru_tab_switcher_overlay
sys.path.pop(0)


def test_patch_paths_normalize_common_source_prefixes():
    """Patch paths should resolve relative to the Chromium source root."""
    patch = """--- a/chrome/browser/ui/example.cc
+++ b/chrome/browser/ui/example.cc
@@ -1 +1 @@
-old
+new
--- /dev/null
+++ src/chrome/browser/ui/new_example.cc
@@ -0,0 +1 @@
+new
"""

    with tempfile.TemporaryDirectory() as tmpdirname:
        patch_path = Path(tmpdirname, "feature.patch")
        patch_path.write_text(patch, encoding="utf-8")

        paths, added_paths = verify_mru_tab_switcher_overlay._patch_paths(patch_path)

    assert paths == {
        Path("chrome/browser/ui/example.cc"),
        Path("chrome/browser/ui/new_example.cc"),
    }
    assert added_paths == {Path("chrome/browser/ui/new_example.cc")}


def test_filtered_patch_uses_normalized_target_path():
    """Filtering should match a source-relative target regardless of prefix."""
    patch = """--- a/chrome/browser/ui/example.cc
+++ b/chrome/browser/ui/example.cc
@@ -1 +1 @@
-old
+new
"""

    with tempfile.TemporaryDirectory() as tmpdirname:
        patch_path = Path(tmpdirname, "feature.patch")
        output_path = Path(tmpdirname, "filtered.patch")
        patch_path.write_text(patch, encoding="utf-8")

        selected = verify_mru_tab_switcher_overlay._write_filtered_patch(
            patch_path,
            {Path("chrome/browser/ui/example.cc")},
            output_path,
        )

        assert selected == 1
        filtered = output_path.read_text(encoding="utf-8")
        assert "--- a/chrome/browser/ui/example.cc" in filtered
        assert "+++ b/chrome/browser/ui/example.cc" in filtered
