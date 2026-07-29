# Release commit signing

The desktop and browser-extension release workflows create their release commits
inside GitHub Actions. They import one dedicated GPG key from a repository secret
and sign the generated commit before testing, packaging, tagging, and publishing
it.

## One-time GitHub setup

1. Create a dedicated, signing-only GPG key for release automation using this
   identity:
   `WardenJakx <114708157+WardenJakx@users.noreply.github.com>`.
   Do not use your everyday personal private key. Leave this automation key
   without a passphrase so GPG can sign non-interactively; the private key is
   protected by GitHub Actions secrets.
2. Add the corresponding public GPG key to the GitHub account that should receive
   the **Verified** attribution. The workflow identity is hard-coded, and that
   noreply address must be associated with the key on the `WardenJakx` account.
3. Add the ASCII-armored private key export as the repository Actions secret
   `RELEASE_GPG_PRIVATE_KEY`.

For example:

```bash
gpg --batch --passphrase '' --quick-generate-key \
  "WardenJakx <114708157+WardenJakx@users.noreply.github.com>" \
  ed25519 sign 2y

fingerprint="$(
  gpg --batch --with-colons \
    --list-secret-keys "114708157+WardenJakx@users.noreply.github.com" |
    awk -F: '$1 == "fpr" { print $10; exit }'
)"
gpg --armor --export "$fingerprint" > release-signing-public.asc
(umask 077; gpg --armor --export-secret-keys "$fingerprint" \
  > release-signing-private.asc)
gh secret set RELEASE_GPG_PRIVATE_KEY < release-signing-private.asc
```

Paste `release-signing-public.asc` into **GitHub account settings → SSH and GPG
keys → New GPG key**. Store or dispose of `release-signing-private.asc`
carefully after uploading it. The key in this example expires after two years,
so rotate the public key and repository secret before then.

The workflows fail before dependency installation if the secret is missing, the
private key cannot be imported, or it does not match the hard-coded release
email. They also run `git verify-commit` before the signed candidate leaves the
preparation job.

The product release tags remain lightweight tags that point directly to the
signed release commit. GitHub Release records continue to be authored by
`github-actions[bot]` because publication uses the workflow's scoped
`GITHUB_TOKEN`; that is independent of the signed commit's author and signer.
