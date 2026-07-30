# Release commit signing

The desktop and browser-extension workflows build and validate a local candidate
without publishing it. After validation succeeds, the publish job uses GitHub's
`createCommitOnBranch` mutation and the workflow's short-lived `GITHUB_TOKEN` to
write the tested version files to `main`.

GitHub authors the commit as `github-actions[bot]`, signs it with GitHub's own
key, and reports it as **Verified**. The workflow confirms that the signed
commit's source tree exactly matches the tested candidate before creating the
release tag.

No GPG key, personal signing identity, or additional repository secret is
required.
