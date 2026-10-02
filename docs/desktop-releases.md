# Desktop releases

The `Release Newframe Desktop` workflow publishes a Developer ID signed, Apple notarized macOS arm64 DMG and its SHA-256 checksum. Both the app and DMG carry stapled notarization tickets for offline installation. Windows, Linux, Intel Macs, and browser extensions are outside this workflow.

Signing requires six repository secrets. The bundle ID is already `sh.newframe.app`; no source edits, App Store listing, app record, registered App ID, or provisioning profile are needed for this outside-store distribution.

## Create the signing identity

You need active Apple Developer Program membership. The Account Holder creates the Developer ID certificate. Use a CSR to create an exportable signing identity.

1. On the Mac that will hold the private key, open **Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority**.
2. Enter your Apple account email and a descriptive Common Name, such as `Newframe desktop releases`. Leave CA Email Address empty. Select **Saved to disk** and save the `.certSigningRequest` file.
3. Open [Apple Developer certificates](https://developer.apple.com/account/resources/certificates/list), click **+**, and choose **Developer ID Application**. Upload the CSR and download the `.cer`. If Apple asks for an intermediate certificate, use its current recommended option. Developer ID Installer is for PKG installers and is not used here.
4. Double-click the `.cer` on the same Mac. In **Keychain Access > login > My Certificates**, find `Developer ID Application: ...`. Expand it and confirm its private key appears underneath.
5. Select that signing identity, choose **File > Export Items**, and export **Personal Information Exchange `.p12`**. Protect it with a new password. The export must include the private key; the public `.cer` alone cannot sign an app.
6. Open [Apple Developer membership details](https://developer.apple.com/account) and record your 10-character **Team ID**. It must match the team on the certificate.

Keep the `.p12`, its export password, and the original private key in secure storage outside the repository.

## Create the notarization API key

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com/access/integrations/api) as the Account Holder or an Admin.
2. Open **Users and Access > Integrations > App Store Connect API > Team Keys**. If API access is unavailable, the Account Holder must first **Request Access** and accept Apple's terms. Wait for Apple to approve that request.
3. Generate a **team key** named `Newframe desktop notarization` with **App Manager** access, as recommended by the pinned `@electron/notarize` version. Individual keys do not match this workflow's authentication settings.
4. Download `AuthKey_<KEY_ID>.p8` and record its **Key ID** and **Issuer ID**. Apple allows the private key to be downloaded only once; keep a secure backup outside the repository.

Use the same developer team as the signing certificate. The API Issuer ID is a UUID and is different from the 10-character Developer Team ID.

## Add the GitHub repository secrets

Create these as **repository secrets** in [Settings > Secrets and variables > Actions](https://github.com/WardenJakx/newframe/settings/secrets/actions), under **New repository secret**. These are secrets, not repository variables or environment secrets.

| Name                   | Value                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `CSC_LINK`             | Base64 of the password-protected Developer ID Application `.p12`, including its private key |
| `CSC_KEY_PASSWORD`     | Password chosen when exporting that `.p12`                                                  |
| `APPLE_API_KEY_BASE64` | Base64 of the downloaded team API key `.p8`                                                 |
| `APPLE_API_KEY_ID`     | API Key ID from App Store Connect                                                           |
| `APPLE_API_ISSUER`     | API Issuer ID from App Store Connect                                                        |
| `APPLE_TEAM_ID`        | Developer Team ID matching the certificate                                                  |

The following macOS commands upload all six with GitHub CLI. Authenticate with `gh auth login` first if needed, using an account allowed to manage this repository's Actions secrets. Replace the two absolute file paths before running. The four interactive prompts request the `.p12` password, Key ID, Issuer ID, and Team ID in that order.

```bash
(
  set -euo pipefail
  umask 077
  signing_setup_dir="$(mktemp -d /tmp/newframe-signing.XXXXXX)"
  trap 'rm -rf "$signing_setup_dir"' EXIT

  base64 -i "/absolute/path/Newframe-Developer-ID.p12" |
    tr -d '\r\n' > "$signing_setup_dir/CSC_LINK"
  base64 -i "/absolute/path/AuthKey_KEYID.p8" |
    tr -d '\r\n' > "$signing_setup_dir/APPLE_API_KEY_BASE64"

  gh secret set CSC_LINK --repo WardenJakx/newframe \
    < "$signing_setup_dir/CSC_LINK"
  gh secret set APPLE_API_KEY_BASE64 --repo WardenJakx/newframe \
    < "$signing_setup_dir/APPLE_API_KEY_BASE64"
  gh secret set CSC_KEY_PASSWORD --repo WardenJakx/newframe
  gh secret set APPLE_API_KEY_ID --repo WardenJakx/newframe
  gh secret set APPLE_API_ISSUER --repo WardenJakx/newframe
  gh secret set APPLE_TEAM_ID --repo WardenJakx/newframe
)
```

The encoded files are private temporary files and are removed when the block exits. Secret values never need to be printed or placed in command arguments. To confirm the names were saved without displaying their values:

```bash
gh secret list --repo WardenJakx/newframe
```

The workflow decodes `APPLE_API_KEY_BASE64` into a temporary file and supplies its path as `APPLE_API_KEY`. Do not create an extra `APPLE_API_KEY` secret or supply an Apple account sign-in password.

## Publish a desktop release

After the signing PR is merged and the six secrets are configured:

1. Open [Actions > Release Newframe Desktop](https://github.com/WardenJakx/newframe/actions/workflows/release-desktop.yml).
2. Choose **Run workflow**, select **main**, and optionally enter a one-line release introduction of at most 500 characters. Dispatch from the exact current `main` commit.
3. Watch the run. It prepares the version, tests and builds on Apple Silicon, signs and notarizes the app, signs and notarizes the DMG, and validates the final mounted app's signature, team, runtime, version, architecture, notarization tickets, and Gatekeeper acceptance. It then computes the checksum and publishes a `desktop-v<version>` GitHub release with a GitHub-signed release commit.

The same dispatch can be started from the CLI:

```bash
gh workflow run release-desktop.yml --repo WardenJakx/newframe --ref main
```

For the first signed release, download its DMG and matching `.sha256` from GitHub, verify the checksum, install into Applications, and launch through Finder. Check Ledger hardware access and AirGap camera scanning. CI verifies signing and notarization; those physical-device checks need a person. Signing credentials and a successful Apple notarization run are required before the signed flow can be confirmed end to end.

Future releases use the same workflow and credentials. Renew or replace the signing certificate before it expires, and update the corresponding secrets when credentials change. Automatic app updates remain disabled.

## If a release fails

Signing or notarization failures stop asset publication. Fix the reported issue before starting another release.

| Failure                                                                       | Action                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing repository secret                                                     | Add the exact named secret above. Confirm it was added under repository Actions secrets.                                                                                                                                                            |
| No Developer ID Application identity, failed `.p12` import, or password error | Re-export the certificate together with its private key from the Mac that created the CSR. Confirm the export password matches `CSC_KEY_PASSWORD`. `.cer`, Apple Development, and Developer ID Installer certificates do not satisfy this workflow. |
| `.p12` export unavailable                                                     | Check **My Certificates** for the private key beneath the certificate. Importing the public `.cer` on another Mac does not recreate that key.                                                                                                       |
| Notarization authentication error                                             | Confirm the `.p8`, Key ID, and Issuer ID belong to the same active team API key with App Manager access. Use the Issuer ID, not the Developer Team ID. Confirm API access and membership are active.                                                |
| Unexpected TeamIdentifier                                                     | Set `APPLE_TEAM_ID` to the certificate's team and use a notarization key from that same team.                                                                                                                                                       |
| Apple rejects notarization                                                    | Read Apple's notarization error in the run log. Fix the specific signing or packaging failure; a checksum alone does not prove notarization.                                                                                                        |
| Workflow refuses a stale commit                                               | Dispatch again from the current `main`. Releases require the exact current main commit.                                                                                                                                                             |

Setup sources: [Apple CSR instructions](https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request), [Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates), [App Store Connect API access](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/), and [the builder's pinned notarization package](https://github.com/electron/notarize/blob/v2.5.0/README.md). See [the signing research note](research/macos-release-signing.md) for version-specific details and validation sources.
