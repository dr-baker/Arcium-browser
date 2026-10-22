# Arcium glassmorphic glass lab

This is the fast inner loop for the Chromium glass spike. It renders a
deterministic 960x680 WebGL frame in a local headless Chrome, using the same
effect equations as [`glassmorphic.sksl`](glassmorphic.sksl). The
WebGL page supplies a procedural backdrop because the production effect will
receive Chromium's live backdrop as a Skia child shader.

The scenes deliberately exercise different failure modes:

- `light`: pale checkerboard, grid, type-like rows, and saturated circles.
- `dark`: low-luminance checkerboard, neon stripes, and bright circles.
- `dense`: scan lines, narrow columns, and an image-like card edge.
- `motion`: animated gradients and video-like moving geometry at a fixed time.

The presets are `basic`, `glassmorphic`, `spectral`, `quiet`, and
`overshifted_lens`. The last preset is a neutral, central rounded-square lens
inspired by the visual target in OverShifted/LiquidGlass: it uses a
superellipse silhouette, inward bulge/refraction, downscaled-looking blur,
fine monochrome grain, and a restrained rim with no RGB dispersion. The runner
captures every scene/preset pair, checks image statistics against the baseline,
and measures 1,024 draw+GPU-finish iterations per pair (in 128-frame batches so
sub-millisecond browser timer quantization does not report a misleading zero).

## Run

From the nested Arcium core checkout:

```sh
node devutils/glassmorphic_lab/render_lab.mjs --update-baseline
node devutils/glassmorphic_lab/render_lab.mjs
node devutils/glassmorphic_lab/check_sksl.mjs --strict
```

The first command is only for an intentional shader/backdrop change. The
second command is the repeatable regression check. It writes PNGs and metrics
under `devutils/glassmorphic_lab/artifacts/` and keeps the pixel-stat
baseline in `baselines/pixel-stats.json`.

The third command is a lightweight native Skia syntax/semantic check and
verifies the production `uOpacity` uniform contract. It links only against an
already-built `libskia.dylib`; it does not configure or build Chromium. Omit
`--strict` when working on a machine without that prebuilt library.

The runner uses the local Google Chrome executable and the installed
`playwright-core` package. Override either when needed:

```sh
CHROME_BIN=/path/to/Chrome \
PLAYWRIGHT_CORE=/path/to/playwright-core \
node devutils/glassmorphic_lab/render_lab.mjs
```

## Interactive playground

Serve this directory and open `glassmorphic_lab.html` in the in-app
browser or another WebGL2-capable browser:

```sh
cd devutils/glassmorphic_lab
python3 -m http.server 8765
```

The left-hand playground exposes grouped Surface, Tone + texture, Rim + shape,
and Lighting controls. It includes glass opacity, blur radius, edge width,
refraction, bulge, tint color/strength, saturation, grain, specular intensity,
rim intensity, dispersion, shape power, corner radius, light direction X/Y,
elevation, and intensity. The five first-class preset buttons seed every control while leaving
the controls editable. A manual edit changes the badge to `Custom`; Reset
restores the last selected preset. Copy JSON is an explicit button action and
also leaves the export visible for manual copying if browser clipboard access
is unavailable. Custom values are encoded in the URL as `params=` so a material
can be reopened deterministically. The parser accepts the old internal
`preset=plasmorphic` spelling as a one-way lab-only migration alias for an
already-open link, then rewrites the URL to `preset=glassmorphic`.

Exercise the actual DOM controls, preset/reset/export/query behavior, and the
responsive 640px layout with:

```sh
node devutils/glassmorphic_lab/verify_controls.mjs
```

The interaction test changes all 18 editable parameters and compares a canvas
hash plus render delta for each one. It writes desktop/mobile review captures
to `artifacts/playground--desktop.png` and
`artifacts/playground--mobile.png`, plus a 50% opacity review capture at
`artifacts/playground--opacity-50.png`. It also proves opacity 0 is byte-exact
with the effect-disabled backdrop, opacity 1 is byte-exact with the complete
preset, and opacity 0.5 follows a source-to-complete-effect blend.

`glassmorphic.sksl` remains the source of truth for both production
porting and the WebGL adapter. Lighting is represented by the shared
`uLightXY`, `uLightElevation`, and `uLightIntensity` uniforms rather than a
hardcoded vector. `uOpacity` is applied only at the final composite: zero
short-circuits to the untouched child shader, one returns the complete glass
result, and intermediate values blend those two images. The render runner
records opacity endpoint/intermediate checks for every scene and preset in the
metrics and baseline files. `check_sksl.mjs --strict` validates that source
against the available prebuilt Skia library.

## Acceptance checks

The runner establishes these pre-integration acceptance thresholds: panel black
pixels below 2%, center luma above 0.020, maximum panel RGB spread below 0.970,
non-basic edge delta above 0.004, alpha at least 0.980, corner delta below
0.002, per-draw p95 below 4ms in the headless lab, and opacity 0/1 exact endpoint
matches with an intermediate blend within 0.25 mean / 1.5 maximum 8-bit channel
units. It also rejects a frame
that never rises above 0.10 in any channel or whose luma statistics drift from
the checked-in baseline. These checks cover black/inverted output, readable
centers, bounded dispersion, visible edge response, stable corners/alpha, and
a reasonable inner-loop budget. The baseline tolerances are deliberately wide
enough for GPU quantization but narrow enough to catch a broken shader or
coordinate transform. Timing is reported as mean, p95, and max per
scene/preset; this lab does not pretend those numbers are Chromium compositor
frame-time proof.

For visual review, inspect the generated PNGs. The useful first comparison is:

```text
light--basic.png         light--glassmorphic.png
dark--glassmorphic.png   dense--spectral.png
motion--glassmorphic.png  light--overshifted_lens.png
dark--overshifted_lens.png
```

The lab is evidence for effect math and parameter choices only. It does not
prove that Chromium can provide a live backdrop texture to an arbitrary Views
layer. That integration requires a separate, approved Chromium patch and
runtime validation.
