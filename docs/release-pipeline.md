# Solr Client Release Pipeline

Comprehensive guide for the automated release workflow that turns `release` branch updates into GitHub releases and GHCR images for the `solr-client` service.

## 1. Workflow Triggers

| Trigger | Description | Typical Usage |
| ------- | ----------- | ------------- |
| `push` to `release` | Primary automation path. Every merge or commit to `release` runs the pipeline end-to-end. | Standard release cadence from PR merges. |
| `workflow_dispatch` | Manual trigger with override inputs. Accepts `release_type`, `explicit_version`, and confirmation flags. | Hotfixes, backfills, retries, or controlled major/minor bumps. |

### Trigger Guardrails
- Workflow enforces concurrency: the latest run for a given ref cancels any in-flight executions to keep tagging deterministic.
- Manual dispatch requests still respect dependency ordering (version calculation before release creation, etc.).

## 2. Manual Override Inputs

| Input | Type | Allowed Values | Purpose |
| ----- | ---- | -------------- | ------- |
| `release_type` | string | `patch` (default), `minor`, `major` | Bump semantic version by the specified component. |
| `explicit_version` | string | SemVer string `vX.Y.Z` | Force a specific version when automation is insufficient (e.g., backfills). |
| `confirm_major` | boolean | `true` / `false` | Required affirmation when `release_type=major` or `explicit_version` jumps a major component. Prevents accidental breaking releases. |
| `notes_override` *(optional future)* | string | Markdown | Manual release notes supplement when auto-generation is insufficient. |

### Override Resolution Rules
1. If `explicit_version` is supplied, it supersedes other inputs after validation.
2. Otherwise the workflow inspects `release_type` (defaulting to `patch`).
3. Major overrides require `confirm_major=true`; without it the run fails fast.
4. Each override is validated against the newest tag to prevent downgrades or duplicates.

## 3. Required Permissions & Secrets

| Scope | Value | Rationale |
| ----- | ----- | --------- |
| Workflow `permissions` | `packages: write`, `contents: write` | Publish images to GHCR and create releases/tags. |
| Auth Token | `${{ secrets.GITHUB_TOKEN }}` | Default token (scoped via permissions) handles GitHub API calls and registry login. |
| Optional PAT (fallback) | `secrets.GHCR_PAT` | Only needed if repository settings block the default token. |

### Repository Settings Checklist
- Enable GitHub Packages for the org/repo.
- Allow workflow-created releases and tags.
- (Optional) Restrict who can trigger `workflow_dispatch` if manual overrides require approval.

## 4. Version Calculation Logic

The composite action `.github/actions/calculate-version` emits two outputs:
- `next_version`: semantic version string prefixed with `v`.
- `is_bootstrap`: `true` when no prior tags exist (first release).

### Algorithm Summary
1. Fetch latest release tag using GitHub API (ignoring prereleases/drafts).
2. When no tags exist, emit `v1.0.0` (`is_bootstrap=true`).
3. When tags exist:
   - If `explicit_version` provided, validate it is strictly greater than latest.
   - Else increment the component implied by `release_type`.
     - `major`: `MAJOR+1.0.0`
     - `minor`: `MAJOR.MINOR+1.0`
     - `patch` (default): `MAJOR.MINOR.PATCH+1`
4. Write resolved version to `GITHUB_OUTPUT` for downstream jobs.

### Override Examples
- `release_type=minor` on latest `v1.4.2` → `v1.5.0`
- `release_type=major`, `confirm_major=true` on `v1.5.3` → `v2.0.0`
- `explicit_version=v1.6.0` on `v1.5.3` → `v1.6.0`
- `explicit_version=v1.5.2` on `v1.5.3` → **fails** (downgrade attempt)

## 5. Workflow Structure

```
.github/workflows/solr-client-release.yml
└── jobs
    ├── calculate-version
    │   └── uses: ./.github/actions/calculate-version
    ├── create-release
    │   └── uses: actions/github-script (generate notes) + gh CLI
    └── build-and-push
        └── uses: docker/build-push-action@v6
```

### Job Order & Dependencies
1. **calculate-version**: Outputs `version`, `is_bootstrap`, override metadata.
2. **create-release** (needs 1): Generates release notes, creates/updates GitHub release.
3. **build-and-push** (needs 2): Builds Docker image, pushes semantic + rolling tags, writes job summary.

## 6. Docker Build & Tagging

- Build context: `solr-client/`
- Dockerfile: `solr-client/Dockerfile` (Node 20 Alpine base).
- Tags pushed to `ghcr.io/hgnc/solr-client`:
  - `${{ steps.version.outputs.version }}` (e.g., `v1.2.3`)
  - `latest`
  - `release`
- Enable build cache via `cache-from`/`cache-to` pointing to GHCR registry cache.

### Authentication Step
```yaml
- name: Login to GHCR
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

## 7. Bootstrap Scenario (`v1.0.0`)

- Triggered when repository lacks any tagged releases.
- Workflow still creates a GitHub release and pushes an image tagged `v1.0.0` and `latest`.
- `is_bootstrap` output can be used to add explanatory notes (e.g., “Initial automated release”).

## 8. Manual Release Playbook

1. Navigate to *Actions → Solr Client Release* workflow.
2. Click **Run workflow** and provide inputs as needed:
   - Leave inputs blank for patch bump.
   - Supply `release_type` for minor/major.
   - Supply `explicit_version` for bespoke tag (ensure it is higher).
   - Toggle `confirm_major` when bumping major.
3. Monitor run (approx. 5–7 minutes). Key checkpoints:
   - `calculate-version` logs resolved version.
   - `create-release` prints release URL.
   - `build-and-push` emits image digests in job summary.
4. Verify GitHub Release and GHCR tags match.

## 9. Rollback Procedures

| Scenario | Action |
| -------- | ------ |
| Incorrect release notes / metadata | Edit release manually, rerun workflow for same tag (idempotent). |
| Bad container image | Delete GHCR tag `vX.Y.Z` and `latest` (if impacted), revert offending commit, push fix to `release`, rerun pipeline. |
| Wrong version bump | Delete Git tag + GitHub release + GHCR image, re-run workflow with correct overrides. |
| Failed workflow after tag creation but before image push | Re-run workflow; jobs detect existing tag and update release/image as needed. |

> **Note:** Deleting tags should be coordinated with downstream deployers to avoid pulling removed versions.

## 10. Troubleshooting Guide

| Symptom | Likely Cause | Resolution |
| ------- | ------------ | ---------- |
| Workflow fails during version calculation | Missing `GITHUB_TOKEN` scope or override validation failure | Check permissions section above; review logs for validation error message. |
| Release created but image missing | GHCR login failure or Docker build error | Inspect `build-and-push` logs, confirm credentials, retry run. |
| Duplicate tag error | Manual tag already exists | Delete conflicting tag/release or bump version via override. |
| `confirm_major` error | Major override without confirmation | Re-run with `confirm_major=true`. |
| Rate-limited release notes | Excessive reruns in short window | Wait for GitHub API cool-down or supply `notes_override`. |

## 11. Frequently Asked Questions

**Q: Can we run this workflow from branches other than `release`?**  
No. Only the `release` branch (or manual dispatch) is supported to prevent divergent version streams.

**Q: How are pre-release tags handled?**  
Currently unsupported. Add separate workflow for prerelease channels if needed.

**Q: Can we publish multi-arch images?**  
Yes—extend `docker/build-push-action` with `platforms: linux/amd64,linux/arm64`. Ensure base image and app support both.

**Q: Where do job summaries appear?**  
GitHub Actions run → *Summary* tab. Includes resolved version, overrides, image digests, release link.

## 12. Best Practices

- Merge PRs into `release` via squash/merge to keep history linear for release notes.
- Run smoke tests against the built image before promoting to downstream environments.
- Treat manual overrides as exceptions; document rationale in PR or release notes.
- Store rollback checklists alongside this doc and keep them updated after each real incident.

---

_Last reviewed: 2025-10-15. Update this document whenever workflow inputs, versioning rules, or release processes change._
