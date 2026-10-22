"""Keep renderer selection inside the glass system, using committed patches.

These are static dependency checks, not build or rendering tests. Inspect the
post-change side of each hunk so deleted backend selection cannot fail a check.
"""

import re
from pathlib import Path


PATCHES = Path(__file__).resolve().parents[2] / "patches" / "personal"
BACKEND_SELECTION = re.compile(
    r"\b(?:GlassBackend|GetRequestedGlassBackend|ResolveGlassBackend|"
    r"ResolveGlassSurface|SetBackend|GetGlassFrameBackend|kArciumGlassBackendSwitch)\b"
    r"|\bparams\s*\.\s*backend\b|(?:->|\.)\s*backend\s*\("
)


def _post_change_files(patch):
    files = {}
    target = None
    in_hunk = False
    for line in patch.splitlines():
        if line.startswith("+++ "):
            target = line[4:].split("\t", 1)[0]
            for prefix in ("a/", "b/", "src/"):
                if target.startswith(prefix):
                    target = target[len(prefix):]
                    break
            files.setdefault(target, [])
            in_hunk = False
        elif line.startswith("@@ "):
            in_hunk = True
        elif line.startswith(("Index: ", "diff ", "--- ")):
            in_hunk = False
        elif in_hunk and target and line.startswith(("+", " ")):
            files[target].append(line[1:])
    return {path: "\n".join(lines) for path, lines in files.items()}


def _read_patch(name):
    files = _post_change_files((PATCHES / name).read_text(encoding="utf-8"))
    assert files, f"No file hunks found in {name}"
    return files


def _assert_no_backend_selection(files):
    violations = [
        f"{path}: {line.strip()}"
        for path, content in files.items()
        for line in content.splitlines()
        if BACKEND_SELECTION.search(line)
    ]
    assert not violations, "Consumer chooses a glass backend:\n" + "\n".join(violations)


def test_mru_consumers_do_not_select_glass_backend():
    files = {
        path: content
        for path, content in _read_patch("arcium-mru-tab-switcher.patch").items()
        if not Path(path).stem.endswith(("_unittest", "_browsertest"))
    }
    assert any("GlassSurface" in content for content in files.values()), (
        "Expected MRU glass consumer is missing"
    )
    _assert_no_backend_selection(files)


def test_performance_patch_consumer_does_not_select_glass_backend():
    files = _read_patch("arcium-feature-performance.patch")
    path = "chrome/browser/ui/views/frame/browser_view.cc"
    assert path in files, "Expected performance patch browser consumer is missing"
    assert "glass_surface_" in files[path], "Expected glass performance hunks are missing"
    _assert_no_backend_selection({path: files[path]})


def test_glass_surface_params_do_not_expose_backend():
    files = _read_patch("arcium-glass-system.patch")
    header = files["chrome/browser/ui/views/helium/glass_surface.h"]
    params = re.search(r"\bstruct GlassSurfaceParams\s*\{(.*?)^\};", header, re.M | re.S)
    assert params, "Expected complete GlassSurfaceParams definition in glass patch"
    assert not re.search(r"\b(?:backend|GlassBackend)\b", params.group(1)), (
        "GlassSurfaceParams must describe appearance without exposing backend selection"
    )


def test_native_widget_does_not_select_glass_backend():
    files = _read_patch("arcium-glass-system.patch")
    native_widgets = {
        path: content
        for path, content in files.items()
        if Path(path).name in ("browser_native_widget_mac.h", "browser_native_widget_mac.mm")
    }
    assert any(path.endswith(".mm") for path in native_widgets), (
        "Expected native widget glass integration is missing"
    )
    _assert_no_backend_selection(native_widgets)


def test_browser_widget_translucency_uses_shared_glass_policy():
    files = _read_patch("arcium-glass-system.patch")
    path = "chrome/browser/ui/views/frame/browser_widget.cc"
    assert path in files, "BrowserWidget translucency must integrate the shared glass policy"
    widget = files[path]
    assert re.search(
        r"if\s*\(\s*helium::ShouldUseNativeFrameGlass\(browser_view_\)\s*\)"
        r"\s*\{?\s*params\.opacity\s*=\s*"
        r"views::Widget::InitParams::WindowOpacity::kTranslucent",
        widget,
    ), "Translucent widget initialization must depend on the shared glass policy"
    _assert_no_backend_selection({path: widget})


def test_native_glass_integration_does_not_use_legacy_controls():
    files = _read_patch("arcium-glass-system.patch")
    integration = {
        path: content
        for path, content in files.items()
        if not Path(path).stem.endswith(("_unittest", "_browsertest"))
    }
    assert any(Path(path).name == "native_frame_materials.cc" for path in integration), (
        "Expected shared native material policy is missing"
    )
    legacy_controls = re.compile(
        r"\b(?:HeliumNativeFrameAvailable|ShouldUseNativeFrameMaterials|"
        r"OnNativeFrameMaterialsPrefChanged|kHeliumNativeFrameMaterials\w*|"
        r"heliumNativeFrameMaterials|nativeFrameMaterials\w*|"
        r"showNativeFrameMaterialsOption_?|IDS_SETTINGS_NATIVE_FRAME_MATERIALS\w*)\b"
        r"|helium-native-frame-materials|helium\.(?:browser\.)?native_frame_materials"
    )
    violations = [
        f"{path}: {line.strip()}"
        for path, content in integration.items()
        for line in content.splitlines()
        if legacy_controls.search(line)
    ]
    assert not violations, "Legacy controls survive glass integration:\n" + "\n".join(violations)


def test_glass_patch_removes_legacy_control_registrations():
    patch = (PATCHES / "arcium-glass-system.patch").read_text(encoding="utf-8")
    removed = "\n".join(
        line[1:] for line in patch.splitlines()
        if line.startswith("-") and not line.startswith("--- ")
    )
    # Absence in post-change hunks alone cannot prove untouched registrations
    # were removed. Require explicit removal evidence for every control family.
    for control in (
        "kHeliumNativeFrameMaterialsCommandLine",
        "kHeliumNativeFrameMaterials",
        "helium.browser.native_frame_materials",
        "showNativeFrameMaterialsOption",
        "showNativeFrameMaterialsOption_",
        "IDS_SETTINGS_NATIVE_FRAME_MATERIALS",
        "IDS_SETTINGS_NATIVE_FRAME_MATERIALS_DESCRIPTION",
        "nativeFrameMaterials",
        "OnNativeFrameMaterialsPrefChanged",
    ):
        assert re.search(r"(?<!\w)" + re.escape(control) + r"(?!\w)", removed), (
            f"Glass patch must explicitly remove legacy control {control}"
        )
