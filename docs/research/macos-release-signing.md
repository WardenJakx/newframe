# macOS release signing

Checked 2026-10-02 against Electron 42.5.1, electron-builder 26.15.2, and its built-in @electron/notarize 2.5.0 dependency. The lockfile and installed `app-builder-lib` import confirm that version. The app's direct @electron/notarize 3.1.1 dependency serves the older standard-build hook, which the release configuration does not use. Context7 supplied electron-builder documentation; Apple and Electron documentation were checked separately.

Use a Developer ID Application signing identity and an App Store Connect **team** API key. electron-builder signs and notarizes the app; the release workflow must also notarize and staple the final DMG. Both the app and distributed container then carry an offline notarization ticket. Apple recommends stapling the actual distribution file and testing the installed product. [Apple distribution guide](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)

## Human setup

The Apple Developer Program membership must be active. The Account Holder creates the Developer ID certificate; a cloud-managed certificate cannot replace the exportable signing identity needed by this workflow. Choose Developer ID Application for apps and disk images. Developer ID Installer is for signed PKG installers, which this release does not produce. [Apple Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates), [Apple notarization troubleshooting](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)

1. On the Mac that will hold the private key, open Keychain Access. Choose Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority.
2. Enter the account email and a descriptive Common Name, leave CA Email Address empty, select Saved to disk, and save the `.certSigningRequest`. [Apple CSR instructions](https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request)
3. In Apple Developer > Certificates, Identifiers & Profiles > Certificates, click `+`, choose Developer ID Application, upload the CSR, and download the `.cer`. If Apple asks which intermediate to use, choose the current recommended intermediate.
4. Double-click the certificate on the same Mac. In Keychain Access > login > My Certificates, confirm the Developer ID Application certificate expands to show its private key. [Apple certificate creation](https://developer.apple.com/help/account/certificates/create-developer-id-certificates)
5. Select the certificate and its private key, choose File > Export Items, select Personal Information Exchange `.p12`, and protect the export with a new password. A public `.cer` alone cannot sign a release. If `.p12` export is unavailable, the private key is missing or the wrong item is selected. [Apple keychain export](https://support.apple.com/guide/keychain-access/import-and-export-keychain-items-kyca35961/mac), [Apple signing identity export](https://developer.apple.com/documentation/xcode/sharing-your-teams-signing-certificates)

Base64-encode the `.p12` on macOS with `base64 -i /path/to/developer-id.p12 | pbcopy`. Save the clipboard value as the GitHub `CSC_LINK` secret and its export password as `CSC_KEY_PASSWORD`. electron-builder accepts a base64 certificate and manages the temporary signing keychain. [electron-builder environment variables](https://www.electron.build/docs/environment-variables/), [electron-builder signing troubleshooting](https://www.electron.build/v26/docs/troubleshooting/)

For notarization, sign in to App Store Connect as Account Holder or Admin. Open Users and Access > Integrations > App Store Connect API > Team Keys. If API access is unavailable, the Account Holder must first click Request Access and accept its terms; Apple reviews that request. Generate a key named `Newframe desktop notarization`, choose App Manager access, then download its `.p8` once and retain its Key ID and Issuer ID. Store the downloaded key securely. [Apple API access and team keys](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/), [Apple key download instructions](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)

The built-in @electron/notarize 2.5.0 README recommends App Manager; the current electron-builder guide recommends Developer. Apple's key-creation documentation does not establish the minimum notarytool role. Follow the pinned package's recommendation without claiming Developer cannot work. [@electron/notarize 2.5.0](https://github.com/electron/notarize/blob/v2.5.0/README.md), [electron-builder notarization guide](https://www.electron.build/docs/notarization/)

Use a team key. @electron/notarize 2.5.0 explicitly excludes individual keys, and electron-builder 26's built-in API authentication requires the issuer variable. The Team ID is the 10-character ID in Apple Developer > Account > Membership details, distinct from the API Issuer ID. [@electron/notarize 2.5.0](https://github.com/electron/notarize/blob/v2.5.0/README.md), [electron-builder v26 macOS options](https://www.electron.build/v26/docs/mac/), [Apple notarization credentials](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool)

## GitHub Actions contract

Create repository secrets under GitHub > repository > Settings > Secrets and variables > Actions. The implemented workflow uses these names:

| Secret                 | Value                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| `CSC_LINK`             | Base64 of the exported Developer ID Application `.p12`, including its private key |
| `CSC_KEY_PASSWORD`     | Password chosen when exporting that `.p12`                                        |
| `APPLE_API_KEY_BASE64` | `base64 -i /path/to/AuthKey_KEYID.p8` output                                      |
| `APPLE_API_KEY_ID`     | Key ID shown beside the downloaded team key                                       |
| `APPLE_API_ISSUER`     | Issuer ID shown in the Team Keys page                                             |
| `APPLE_TEAM_ID`        | Developer team ID matching the signing certificate                                |

`APPLE_API_KEY_BASE64` is this repository's secret name. The workflow decodes it into a temporary `.p8` file and passes its absolute path as `APPLE_API_KEY`. Do not pass base64 directly as `APPLE_API_KEY`: the environment reference requires a path, even though the current electron-builder notarization guide includes a conflicting base64 example. [electron-builder environment reference](https://www.electron.build/docs/environment-variables/)

Apple-ID authentication is also supported through `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`, but is unnecessary for the selected team-key flow. Never supply the account's ordinary sign-in password. [Apple notarization credential migration](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool)

## Build requirements and entitlements

For v26, signing settings belong directly under `mac`, including `hardenedRuntime`, `entitlements`, and `entitlementsInherit`. Current v27 examples place them under `mac.sign`; those examples must not be copied into this pinned configuration. `identity: null` disables signing. Use automatic identity discovery from the imported certificate, `forceCodeSigning: true`, and `notarize: true`. [electron-builder v26 macOS options](https://www.electron.build/v26/docs/mac/), [electron-builder troubleshooting](https://www.electron.build/v26/docs/troubleshooting/)

Apple requires a valid Developer ID signature, Hardened Runtime, a secure signing timestamp, and no enabled `com.apple.security.get-task-allow`. Extra exceptions are not intrinsically a notarization failure. [Apple notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [Apple troubleshooting](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)

Electron 42 needs `com.apple.security.cs.allow-jit`. The app's AirGap QR flow needs its existing camera entitlement and `NSCameraUsageDescription`. @electron/notarize advises against `allow-unsigned-executable-memory` for Electron 12+. Modern Electron does not need the existing DYLD environment-variable exception either. [@electron/notarize 2.5.0 entitlement guidance](https://github.com/electron/notarize/blob/v2.5.0/README.md), [electron-builder entitlement guidance](https://www.electron.build/docs/notarization/)

Library validation accepts Apple-signed or same-Team-ID libraries. @electron/osx-sign recursively discovers and signs nested binary files, including packaged native addons. Therefore correctly packaged, same-team-signed `node-hid` binaries should not require `disable-library-validation`; that conclusion is an inference from the signing implementation and Apple's policy, not a signed Newframe runtime test. The release uses a dedicated plist with only JIT and camera permissions. The first signed release still needs native-device and camera testing; standard and preview configuration retain their existing behavior. [Apple library validation](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.cs.disable-library-validation), [@electron/osx-sign binary traversal](https://github.com/electron/osx-sign/blob/main/src/util.ts)

## Release acceptance

Before upload, require `codesign --verify --deep --strict`, the expected TeamIdentifier, a Developer ID Application authority, a secure timestamp, and the app's runtime signature flag. After notarization, require `xcrun stapler validate` on the app and DMG and `spctl --assess --type exec` on the app inside the mounted final DMG. Compute checksums after stapling because stapling changes the distribution file. Signature verification alone does not establish Apple notarization approval. [Apple signing validation](https://developer.apple.com/documentation/security/resolving-common-notarization-issues), [Apple distribution validation](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)

The first successful signed release and a launch from its downloaded DMG still depend on credentials generated by the Account Holder. No certificate, private key, API key, or account setting was accessed or changed during this research.
