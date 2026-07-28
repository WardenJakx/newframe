# Releasing Newframe

Newframe Desktop and Newframe Browser Extension have independent versions, tags, changelogs, artifacts, and release workflows. Never infer or recalculate a release version in CI:

- Desktop reads its committed package version and `apps/newframe/CHANGELOG.md`, tags `desktop-v<version>`, and publishes `Newframe-Desktop-<version>-macOS-arm64.dmg` plus its `.sha256`.
- Browser Extension requires the committed versions in `apps/newframe-extension/package.json` and `apps/newframe-extension/src/manifest.json` to match, reads the exact `## <version>` entry in `apps/newframe-extension/CHANGELOG.md`, tags `extension-v<version>`, and publishes `Newframe-Browser-Extension-<version>.zip` plus its `.sha256`.

Published artifacts and tags are immutable release records. Do not move a release tag, replace an asset, reuse a version, or edit a checksum to repair a release.

## 1. Prepare

- Start from a clean, current `main` checkout with current tags, then run exactly one preparation command:

  ```bash
  bun run prepare-release:desktop
  # or
  bun run prepare-release:extension
  ```

- The command derives that product's next independent UTC CalVer (`YYYY.MDD.N`) from existing `desktop-v*` or `extension-v*` tags. It updates only the selected product, creates no tag or release, and prints the expected tag.
- Replace the generated `- Describe changes before release.` placeholder under the exact `## <version>` heading with complete user-facing notes. The workflow rejects an empty entry and uses the section as its release notes source.
- For an extension release, confirm the package and manifest contain the same generated three-part numeric version.
- Confirm the artifact names implied by the version and confirm that the intended version tag and GitHub release do not already exist.
- Run a frozen install, focused tests, type checks, and the production build locally.

## 2. Review

- Merge the release-preparation change through normal review.
- Confirm the merge commit on `main` contains the intended product version files, changelog entry, workflow, and source changes.
- Review the changelog for security-sensitive changes, breaking behavior, known limitations, and rollback guidance.
- Do not dispatch from a release branch, tag, or stale `main` commit.

## 3. Dispatch

In GitHub Actions, select the workflow for the surface and choose **Run workflow** against `main`. The workflow rejects every ref except the exact current `main` commit. Do not push another change to `main` while the release run is in progress; the workflow rechecks the remote commit before publishing.

The extension workflow performs a frozen clean install, tests, type checking, a production build, structural Chromium and Firefox package validation, ZIP-root and version checks, checksum generation and verification, and release-state checks. Only its publish job has `contents: write`.

A failed extension publish can be rerun safely only when no GitHub release exists and either:

- `extension-v<version>` is absent, or
- the tag exists at the exact dispatched commit because an earlier attempt pushed the tag but failed before creating the release.

Any existing release or tag at a different commit is a hard stop. Investigate instead of deleting or moving it.

## 4. Smoke-test

After the workflow build checks pass, test the same release shape:

- Verify each artifact with its published `.sha256`.
- On Apple silicon, install the DMG, complete the documented Gatekeeper approval, launch Newframe, unlock it, and make a basic local provider request.
- Extract the extension ZIP and confirm `manifest.json` is at the extracted directory root.
- Load the directory in Chrome 121 or newer, Brave, or Chromium and connect a test web app to the running desktop app.
- Temporarily load the same `manifest.json` in Firefox, connect the test web app, restart Firefox, and confirm the temporary extension is removed as documented.
- Check the GitHub release title, tag, changelog text, asset names, and downloadability. Confirm an extension release did not become the repository's **Latest** release.

Record who tested, the operating system and browser versions, the release tag, and the smoke-test result.

## 5. Publish and announce

The workflow publishes the GitHub release after all automated gates pass. Before announcing it:

- Confirm the tag points to the reviewed `main` commit.
- Re-run checksum verification on files downloaded from the public release page.
- Link to the GitHub release, not to an Actions artifact or mutable branch URL.
- State the unsigned macOS arm64 limitation for desktop releases.
- State that the extension is manual/unpacked, has no automatic updates, requires the desktop app, and is temporary-only in Firefox.

## 6. Withdraw

If a published release is unsafe or unusable:

- Stop announcements and mark the GitHub release title and body clearly as withdrawn, including impact, the last known safe version, and available mitigation.
- Do not move its tag or silently replace its assets or checksum.
- If removal is necessary for safety, remove public download access while preserving an incident record. Repository release immutability settings may require an administrator.
- Tell users to roll back to the named safe version. For an extension, they must remove the loaded directory and load the verified prior ZIP. For desktop, they must quit the app and install the verified prior DMG.
- Prepare a new version and changelog entry for the fix. Release it through the normal workflow; never reuse the withdrawn version.

## 7. Follow up

- Publish the fix-forward release and update the withdrawn release with a link to it.
- Document root cause, affected versions, detection, mitigation, and preventive action.
- Verify public README instructions and artifact names still match the workflows.
- Track signing/notarization, browser-store distribution, automatic updates, or additional platform artifacts as separate future work. Do not claim those distribution paths before they exist.
