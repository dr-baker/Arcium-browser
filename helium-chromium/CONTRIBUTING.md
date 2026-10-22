# Contributing to Arcium

This repository contains Arcium's shared Chromium patches, resources, and
development tools. Platform repositories contain the build, packaging, and
operating-system integration:

- [Arcium for macOS](https://github.com/dr-baker/Arcium-browser)

The same contribution guidelines apply to all platform repos.

## Before you start

### General

- For platform-specific issues or features, open the issue or PR in the
  related platform repository instead of this one.
- You can use AI-assisted tools. You remain responsible for the result.
- Understand and review all generated text and code before you submit it.
- State any uncertainty or missing verification in the issue or pull request.

### Issues

- Search existing issues before opening a new bug report or feature request.
- Follow the template and include enough detail to reproduce or evaluate the
  request.
- Do not create duplicate, automated, or unreviewed issues.

### Contributions

- For non-trivial changes, start with an issue and wait until a maintainer
  confirms the bug or agrees that the feature should be implemented.
- If an issue you want to work on is stale, mention an active maintainer
  and show your intent to contribute.
- Review and test every contribution, including work made with AI-assisted
  tools. Disclose generated work that needs extra review.
- Do not submit generated changes that you do not understand.

## Development
macOS is the primary development platform and the recommended environment for
contributions.

Linux packaging includes a similar development script, so the same guide
can be applied there too.

[See the Arcium-macOS development guide][macos-guide].

## Working with patches

Most code changes in this repository are maintained as quilt patches
applied on top of Chromium.

- Make code changes in the selected build lane's Chromium source tree, then
  save the change into its owning patch.
- Put Arcium-owned behavior in focused `patches/personal/*.patch` files. Shared
  browser behavior belongs under `helium-chromium/`; macOS integration belongs
  in the top-level `patches/` directory.
- Keep patch ordering and ownership intact.

From the top-level `Arcium-browser` directory, source `dev.sh` and follow the
[patch workflow][macos-patches]. The source checkout and build lane are selected
separately; generated merged catalogs and source are lane-owned state.

Pop every later patch before editing an earlier owner. Capture changes explicitly
with `he save-patch`, then use `he replay` to establish a complete zero-fuzz replay.
Use `he merge` only with the stack fully popped. The
[build guide][macos-guide] describes the lane lock, preparation, and verification
requirements.

Commit shared and macOS changes in this repository, then verify the combined product. Compilation, packaging, exact launch,
and visible behavior are separate verification steps.

## Code style

- Follow Chromium style and conventions.
- Prefer existing Chromium or Arcium patterns over new abstractions.
- Keep changes focused and minimal.
- Proofread surrounding code before submitting.
- When adding new Arcium-authored files to the Chromium tree, use the copyright
  header found in adjacent project files.
- Refer to existing Arcium patches when you need an example.

## Git style

### Clear commit messages

Use a short, plain-language feature name or user-facing outcome as the title.
Do not add conventional-commit prefixes. Use the body for the change's purpose,
technical details, constraints, and validation when those help a reviewer.

Examples from the Arcium history:

```text
durable tabs, previews and Arc import
NativeLink Siso configuration
Settings selector accent
```

### Clean commit history

Keep branch history tidy before opening a pull request.

- If your changes are big, split them into several commits with a smaller scope.
- If you find a bug in an unmerged commit, prefer folding the fix into the
  commit that introduced it.
- Use `git commit --amend` when fixing the latest commit.
- Use `git commit --fixup=<hash>` for older commits, then squash during an
  interactive rebase.
- Use `git cherry-pick <hash>` for single-commit changes if a rebase is
  too complex.
- Land multi-commit features with `--no-ff`, so first-parent history describes
  each feature group. Small single-concept changes can commit directly to `main`.
- Preserve shared `main` history. Rewriting a published branch requires
  coordination with its owners.

This keeps the branch history easier to review, bisect, and revert.

## Pull requests

Before opening a pull request, make sure that:

- The change is tied to an approved feature request or confirmed bug.
- The branch builds and runs without issues and has been thoroughly tested.
  Otherwise, the pull request is marked as draft.
- The pull request description clearly explains the change scope. The
  description includes visuals (screenshots, videos) if applicable.
- You mention which platforms you tested on.
- The branch is rebased on `main`, or at least the latest Chromium milestone.

Small and focused pull requests are much easier to review. Please split your
changes into several follow-up PRs if necessary.

## Licensing

By contributing to Arcium, you agree that your changes will be licensed under
the repository's existing licensing terms.

<!-- Long referenced links -->
[macos-guide]: https://github.com/dr-baker/Arcium-browser/blob/main/docs/building.md#development-build-and-environment
[macos-patches]: https://github.com/dr-baker/Arcium-browser/blob/main/docs/building.md#update-an-existing-patch
