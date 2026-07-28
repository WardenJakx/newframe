# Releasing Newframe

Newframe Desktop and Newframe Browser Extension have independent versions, tags, changelogs, artifacts, and manually dispatched release workflows. The workflow is the release button: do not use GitHub's **Draft a new release** form or create release tags by hand.

- Desktop creates `desktop-v<version>` and publishes `Newframe-Desktop-<version>-macOS-arm64.dmg` plus its `.sha256`.
- Browser Extension creates `extension-v<version>` and publishes `Newframe-Browser-Extension-<version>.zip` plus its `.sha256`.

Published artifacts, checksums, and tags are immutable release records. Fix problems in source and publish a new version; never move a tag, replace an asset, reuse a version, or edit a checksum.

## 1. Confirm `main` is ready

- Merge and verify all intended product changes on `main`.
- Complete the relevant local, CI, and manual product testing before starting a stable release.
- Prepare concise, user-facing release notes describing the changes and known limitations.
- Do not start desktop and extension releases at the same time. Each workflow writes its own release commit to `main`; finish one before starting the other.

## 2. Run one product workflow

1. Open the repository's **Actions** tab.
2. Select **Release Newframe Desktop** or **Release browser extension**.
3. Choose **Run workflow**, select `main`, enter the release notes, and start the run.

That one run:

1. Verifies it was dispatched from the exact current `main`.
2. Derives the product's next independent UTC CalVer (`YYYY.MDD.N`) from its existing product-prefixed tags.
3. Updates only that product's version files and changelog.
4. Creates a local release commit for those metadata changes.
5. Installs frozen dependencies and tests, builds, packages, and validates that exact release commit.
6. Generates and verifies the named artifact and SHA-256 checksum.
7. Atomically pushes the release commit to `main` and creates the product tag at that commit.
8. Publishes the stable GitHub Release with the validated files and supplied release notes.

Desktop and extension counters remain independent. The desktop workflow marks its release as the repository's **Latest** release; the extension workflow does not replace it.

The release commit and tag are not pushed until all build gates pass. If `main` changes before publication, the atomic push fails without overwriting `main` or leaving a partial tag. Start a new run from the updated `main`.

## 3. Handle a failed run

- Before the release commit and tag are pushed, fix the cause and rerun the workflow.
- If the commit and tag were pushed but GitHub Release publication failed, rerun the failed publish job from the same Actions run. It may resume only when the tag still points to that exact candidate commit and no GitHub Release exists.
- If a GitHub Release already exists, the workflow refuses to replace it.
- A tag at any other commit is a hard stop. Never delete or move it to make a retry pass.

## 4. Verify and smoke-test

After the workflow succeeds:

- Verify each artifact with its published `.sha256`.
- On Apple silicon, install the DMG, complete the documented Gatekeeper approval, launch Newframe, unlock it, and make a basic local provider request.
- Extract the extension ZIP and confirm `manifest.json` is at the extracted directory root.
- Load the directory in Chrome 121 or newer, Brave, or Chromium and connect a test web app to the running desktop app.
- Temporarily load the same `manifest.json` in Firefox, connect the test web app, restart Firefox, and confirm the temporary extension is removed as documented.
- Check the GitHub release title, tag, changelog text, asset names, and downloadability. Confirm an extension release did not become the repository's **Latest** release.

Record who tested, the operating system and browser versions, the release tag, and the smoke-test result.

## 5. Announce

Before announcing the release:

- Confirm the tag points to the reviewed `main` commit.
- Re-run checksum verification on files downloaded from the public release page.
- Link to the GitHub release, not to an Actions artifact or mutable branch URL.
- State the unsigned macOS arm64 limitation for desktop releases.
- State that the extension is manual/unpacked, has no automatic updates, requires the desktop app, and is temporary-only in Firefox.

## 6. Fix forward

- Correct the problem in source, repeat the normal review and testing process, and publish a new version through the appropriate workflow.
- Do not alter the earlier release, tag, asset, or checksum.
- Document root cause, affected versions, detection, and preventive action when appropriate.
- Verify public README instructions and artifact names still match the workflows.
- Track signing/notarization, browser-store distribution, automatic updates, or additional platform artifacts as separate future work. Do not claim those distribution paths before they exist.
