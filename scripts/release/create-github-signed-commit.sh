#!/usr/bin/env bash

set -euo pipefail

if (( $# < 5 )); then
  echo "usage: $0 <repository> <branch> <expected-head> <message> <file>..." >&2
  exit 2
fi

repository="$1"
branch="$2"
expected_head="$3"
message="$4"
shift 4

additions='[]'
for path in "$@"; do
  encoded="$(base64 < "$path" | tr -d '\n')"
  additions="$(
    jq -c \
      --arg path "$path" \
      --arg contents "$encoded" \
      '. + [{path: $path, contents: $contents}]' \
      <<< "$additions"
  )"
done

mutation='
  mutation CreateReleaseCommit($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) {
      commit {
        oid
      }
    }
  }
'

payload="$(
  jq -n \
    --arg query "$mutation" \
    --arg repository "$repository" \
    --arg branch "$branch" \
    --arg expectedHeadOid "$expected_head" \
    --arg headline "$message" \
    --argjson additions "$additions" \
    '{
      query: $query,
      variables: {
        input: {
          branch: {
            repositoryNameWithOwner: $repository,
            branchName: $branch
          },
          expectedHeadOid: $expectedHeadOid,
          message: {headline: $headline},
          fileChanges: {additions: $additions}
        }
      }
    }'
)"

response="$(gh api graphql --input - <<< "$payload")"
commit_sha="$(
  jq -er '.data.createCommitOnBranch.commit.oid' <<< "$response"
)"

printf '%s\n' "$commit_sha"
