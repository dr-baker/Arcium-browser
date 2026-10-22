# October 17 preview

This first preview is for Apple Silicon Macs running macOS 26 or later.
It uses the preserved October 17 browser build. The source snapshot includes
both the shared core and macOS integration; see [SOURCE.json](../SOURCE.json)
for their original revisions.

## Install

Open the downloaded DMG, open **Install Arcium**, and click **Install**.
The installer copies Arcium to Applications and offers to open it.
The first launch includes Helium's setup choices, including whether to enable
its online services.

New profiles get a light pastel sidebar, navigation above the tabs, Peek,
recent-tab cycling, and Little Arc for external links. Existing profiles retain
their settings. The installer refuses to replace an app already in Applications;
quit and move the older app to the Trash first. Your profile remains in
`~/Library/Application Support/Arcium`.

The first-run settings live in
`resources/preview/initial-preferences.json`. The installer places them in a
new Arcium data directory before the browser opens. It never writes them into
an existing profile.

## What to expect

This build uses Chromium **151.0.7922.71**. It is behind the current Chromium
security releases, so treat this as a development preview rather than an
up-to-date everyday browser. Automatic updates are not configured. Download
later releases manually.

Spaces share cookies and logins within one browser profile. Arc sidebar import
is available, but repeat imports replace the source-owned Space trees, including
local edits inside them. Back up your profile first.

Peek opens and closes, but its control strip can paint incorrectly in this
build. The recent-tab preview also has a very translucent glass background.

This build does not include the later October 21 sidebar footer and icon-picker
changes or any October 22 feature work.

## Verification

The preserved app's 554 Mach-O files passed independent code-page hash checks.
All six resource manifests passed checks covering 311 resources and 549 nested
code seals. Its non-system dynamic-library dependencies resolve inside the app.

The source association comes from the saved October 17 build and install record.
This preview is a re-signed preserved, optimized component build, not a new
reproducible build. The ordinary `./build.sh arm64` recipe uses a different
official release configuration. [Reconstructed portable component defaults](../resources/preview/reconstructed-browser-args.gn)
come from the selected source; the original GN arguments and local compiler
settings were not preserved.
The native installer is newly compiled from the source in this repository.
Its checks cover fresh defaults, existing-profile preservation, and refusing a
symbolic-link profile path.

Signing, notarization, the final SHA-256 checksum, and runtime checks for the
download are recorded in the GitHub release. These are separate from the
historical browser validation.

## Package from source

Build the browser using [the build guide](building.md). For the preview installer,
start with a complete, self-contained, Developer ID-signed Arcium.app:

```sh
export ARCIUM_CODESIGN_IDENTITY='Developer ID Application: Your Name (TEAMID)'
devutils/preview-installer/build.sh /path/to/Arcium.app /path/to/Install-Arcium.app
```

Sign and notarize the installer before distributing it. Keep its matching source
and checksums with the download. The disabled workflow files are upstream build
references, not configured release automation for this repository.
