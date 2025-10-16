# Release Pipeline Test Scenarios

Comprehensive test scenarios for validating the Solr Client release pipeline end-to-end.

## Test Matrix Overview

| Category | Scenario Count | Priority | Estimated Duration |
|----------|---------------|----------|-------------------|
| Version Calculation | 8 | High | 20 min |
| Release Creation | 6 | High | 15 min |
| Docker Build & Push | 7 | High | 30 min |
| Failure Recovery | 10 | Critical | 45 min |
| Security & Permissions | 5 | High | 20 min |
| Edge Cases | 6 | Medium | 25 min |
| **Total** | **42** | - | **~2.5 hours** |

---

## 1. Version Calculation Tests

### TC-VC-001: Bootstrap Release (No Prior Tags)
**Objective**: Verify first release in a repository with no existing tags.

**Preconditions**:
- Repository has no semantic version tags
- Workflow is triggered via push or manual dispatch

**Steps**:
1. Ensure repository has no tags: `git tag | grep -E '^v[0-9]'` returns empty
2. Trigger workflow via push to `release` branch
3. Monitor `calculate_version` job output

**Expected Results**:
- `next_version` = `v1.0.0`
- `is_bootstrap` = `true`
- `previous_version` = empty string
- `release_strategy` = `bootstrap`
- GitHub release created with tag `v1.0.0`

**Acceptance Criteria**:
- [ ] Version outputs match expected values
- [ ] Release notes indicate "Initial automated release"
- [ ] Docker image tagged with `v1.0.0`, `latest`, `release`

---

### TC-VC-002: Automatic Patch Bump
**Objective**: Verify default patch version increment on push.

**Preconditions**:
- Latest release tag is `v1.2.3`
- No manual dispatch inputs provided

**Steps**:
1. Verify current tag: `git describe --tags --abbrev=0` shows `v1.2.3`
2. Push commit to `release` branch
3. Verify workflow calculates version automatically

**Expected Results**:
- `next_version` = `v1.2.4`
- `is_bootstrap` = `false`
- `previous_version` = `v1.2.3`
- `release_strategy` = `auto`
- `resolved_release_type` = `patch`

**Acceptance Criteria**:
- [ ] Patch version incremented by 1
- [ ] Major and minor versions unchanged
- [ ] Release notes generated from commits between v1.2.3 and v1.2.4

---

### TC-VC-003: Manual Minor Bump
**Objective**: Test manual workflow dispatch with `release_type=minor`.

**Preconditions**:
- Latest release tag is `v1.4.9`

**Steps**:
1. Navigate to Actions → Solr Client Release
2. Click "Run workflow"
3. Set `release_type` = `minor`
4. Leave `explicit_version` blank
5. Submit workflow

**Expected Results**:
- `next_version` = `v1.5.0`
- `previous_version` = `v1.4.9`
- `release_strategy` = `auto`
- `resolved_release_type` = `minor`
- Patch version reset to 0

**Acceptance Criteria**:
- [ ] Minor version incremented from 4 to 5
- [ ] Major version unchanged
- [ ] Patch version is 0
- [ ] `confirm_major` not required

---

### TC-VC-004: Manual Major Bump with Confirmation
**Objective**: Test major version bump requiring confirmation.

**Preconditions**:
- Latest release tag is `v1.9.12`

**Steps**:
1. Navigate to Actions → Solr Client Release
2. Click "Run workflow"
3. Set `release_type` = `major`
4. Set `confirm_major` = `true`
5. Submit workflow

**Expected Results**:
- `next_version` = `v2.0.0`
- `previous_version` = `v1.9.12`
- `resolved_release_type` = `major`
- Minor and patch versions reset to 0

**Acceptance Criteria**:
- [ ] Major version incremented from 1 to 2
- [ ] Minor and patch reset to 0
- [ ] Workflow completes successfully
- [ ] Release notes indicate major version change

---

### TC-VC-005: Major Bump Without Confirmation (Negative Test)
**Objective**: Verify workflow fails when major bump lacks confirmation.

**Preconditions**:
- Latest release tag is `v1.5.0`

**Steps**:
1. Trigger workflow with `release_type=major`
2. Leave `confirm_major` = `false` (default)
3. Submit workflow

**Expected Results**:
- `validate_inputs` job fails with error message
- Error: "Major releases require confirm_major=true."
- Workflow stops before version calculation

**Acceptance Criteria**:
- [ ] Workflow fails at validation stage
- [ ] No version calculation occurs
- [ ] No release created
- [ ] Clear error message displayed

---

### TC-VC-006: Explicit Version Override
**Objective**: Test forcing a specific version via `explicit_version`.

**Preconditions**:
- Latest release tag is `v1.3.7`

**Steps**:
1. Trigger workflow with `explicit_version` = `v1.5.0`
2. Leave `release_type` at default (patch)
3. Submit workflow

**Expected Results**:
- `next_version` = `v1.5.0`
- `previous_version` = `v1.3.7`
- `release_strategy` = `explicit`
- `resolved_release_type` = N/A (explicit override)

**Acceptance Criteria**:
- [ ] Exact version specified is used
- [ ] Version validates as greater than previous
- [ ] `release_type` input ignored when explicit version provided
- [ ] Release created with specified version

---

### TC-VC-007: Invalid Explicit Version (Downgrade Attempt)
**Objective**: Verify workflow rejects version downgrades.

**Preconditions**:
- Latest release tag is `v2.1.0`

**Steps**:
1. Trigger workflow with `explicit_version` = `v2.0.5`
2. Submit workflow

**Expected Results**:
- Workflow fails at version validation step
- Error message: "Next version v2.0.5 must be greater than previous release v2.1.0."
- No release created

**Acceptance Criteria**:
- [ ] Downgrade attempt rejected
- [ ] Workflow fails with clear error
- [ ] No tags or releases modified
- [ ] Validation occurs after version calculation

---

### TC-VC-008: Malformed Explicit Version
**Objective**: Test input validation for malformed version strings.

**Preconditions**:
- Any repository state

**Test Cases**:
| Input | Expected Result |
|-------|----------------|
| `1.2.3` | Normalized to `v1.2.3` (accepts missing v prefix) |
| `v1.2` | Fails: "explicit_version must match vX.Y.Z" |
| `v1.2.3.4` | Fails: invalid format |
| `v1.2.x` | Fails: non-numeric component |
| `latest` | Fails: invalid format |

**Acceptance Criteria**:
- [ ] All invalid formats rejected at validation stage
- [ ] Missing `v` prefix automatically added
- [ ] Clear error messages for each failure mode

---

## 2. Release Creation Tests

### TC-RC-001: GitHub Release Creation
**Objective**: Verify release entity created with correct metadata.

**Preconditions**:
- Version calculated as `v1.3.0`
- Previous version is `v1.2.5`

**Steps**:
1. Wait for `create_release` job to complete
2. Navigate to repository Releases page
3. Inspect release `v1.3.0`

**Expected Results**:
- Release exists with tag `v1.3.0`
- Release is marked as "Latest"
- Release target is the current commit SHA
- Release notes auto-generated from commits between v1.2.5 and v1.3.0

**Acceptance Criteria**:
- [ ] Release visible in GitHub UI
- [ ] Tagged correctly
- [ ] Associated with correct commit
- [ ] Release notes non-empty and relevant

---

### TC-RC-002: Release Notes Generation (Bootstrap)
**Objective**: Verify release notes for first release.

**Preconditions**:
- Bootstrap scenario (`is_bootstrap=true`)
- No previous tags exist

**Steps**:
1. Review release notes for v1.0.0

**Expected Results**:
- Notes contain: "Initial automated release for v1.0.0"
- No commit comparison (no previous tag to compare)

**Acceptance Criteria**:
- [ ] Bootstrap message present
- [ ] No changelog/diff included
- [ ] Release marked as latest

---

### TC-RC-003: Release Notes with Manual Override
**Objective**: Test custom release notes via `notes_override` input.

**Preconditions**:
- Calculated version is `v1.4.0`

**Steps**:
1. Trigger workflow with `notes_override` containing custom markdown
2. Example override:
   ```markdown
   ## Major Changes
   - Implemented feature X
   - Fixed critical bug Y
   ```
3. Review created release

**Expected Results**:
- Release notes exactly match `notes_override` input
- Auto-generated notes ignored
- Job summary indicates "manual override" for notes

**Acceptance Criteria**:
- [ ] Custom notes used instead of auto-generated
- [ ] Markdown formatting preserved
- [ ] Override status visible in workflow summary

---

### TC-RC-004: Duplicate Release Prevention
**Objective**: Ensure workflow prevents duplicate releases.

**Preconditions**:
- Release `v1.5.0` already exists

**Steps**:
1. Trigger workflow that would calculate version as `v1.5.0`
2. Observe `create_release` job behavior

**Expected Results**:
- Job fails with error: "Release v1.5.0 already exists."
- Workflow stops before attempting to create release
- Guidance provided: "Bump the version or remove the existing release before rerunning."

**Acceptance Criteria**:
- [ ] Duplicate detection occurs before API call
- [ ] Clear error message
- [ ] No partial state created
- [ ] Idempotency maintained

---

### TC-RC-005: Tag vs Release Misalignment Detection
**Objective**: Test scenario where Git tag exists but release doesn't.

**Preconditions**:
- Git tag `v1.6.0` exists locally or remotely
- No GitHub release object for `v1.6.0`

**Steps**:
1. Create tag manually: `git tag v1.6.0 && git push origin v1.6.0`
2. Trigger workflow that calculates `v1.6.0`

**Expected Results**:
- Workflow detects existing tag before creating release
- Error: "Git tag v1.6.0 already exists."
- Workflow fails gracefully

**Acceptance Criteria**:
- [ ] Both tag and release existence checked
- [ ] Tag check happens before release creation
- [ ] Prevents orphaned tags

---

### TC-RC-006: Release URL Output Validation
**Objective**: Verify release URL output is correctly set and accessible.

**Preconditions**:
- Release created successfully as `v1.7.0`

**Steps**:
1. Check `create_release` job outputs
2. Extract `release_url` value
3. Visit URL in browser

**Expected Results**:
- Output format: `https://github.com/{owner}/{repo}/releases/tag/v1.7.0`
- URL accessible and points to created release
- Release page loads correctly

**Acceptance Criteria**:
- [ ] URL format correct
- [ ] URL accessible
- [ ] Used in downstream jobs and summaries

---

## 3. Docker Build & Push Tests

### TC-DB-001: Multi-Architecture Build
**Objective**: Verify image builds for multiple platforms.

**Preconditions**:
- Workflow configured with `platforms: linux/amd64,linux/arm64`

**Steps**:
1. Monitor `build_and_push` job
2. Check build logs for platform indicators
3. Inspect pushed manifest

**Expected Results**:
- Build logs show both architectures
- Manifest list pushed to GHCR
- Both platform images available

**Verification Command**:
```bash
docker buildx imagetools inspect ghcr.io/hgnc/pgnc-solr-client:v1.8.0
```

**Expected Output Excerpt**:
```
MediaType: application/vnd.docker.distribution.manifest.list.v2+json
Manifests:
  - linux/amd64
  - linux/arm64
```

**Acceptance Criteria**:
- [ ] Both platforms built successfully
- [ ] Manifest list created
- [ ] Individual images pullable per platform

---

### TC-DB-002: Tag Validation
**Objective**: Confirm all required tags pushed to GHCR.

**Preconditions**:
- Version is `v1.9.0`

**Steps**:
1. Complete workflow run
2. Query GHCR package versions
3. Validate tags present

**Expected Tags**:
- `v1.9.0` (semantic version)
- `latest` (rolling latest)
- `release` (release branch alias)

**Verification Command**:
```bash
gh api /orgs/hgnc/packages/container/pgnc-solr-client/versions \
  --jq '.[] | .metadata.container.tags[]' | sort -u
```

**Acceptance Criteria**:
- [ ] All three tags present
- [ ] Tags point to same image digest
- [ ] `latest` updated to new version

---

### TC-DB-003: Build Cache Effectiveness
**Objective**: Measure cache hit rate across builds.

**Test Setup**:
1. Run workflow creating `v2.0.0` (cold cache)
2. Make trivial change (e.g., update README)
3. Run workflow creating `v2.0.1` (warm cache)

**Metrics to Capture**:
- Build duration (cold vs. warm)
- Cache hit ratio (from BuildKit logs)
- Layer reuse percentage

**Expected Results**:
- Cold build: 5-8 minutes
- Warm build: 2-4 minutes (40-50% faster)
- High cache hit ratio (>70%) for unchanged layers

**Acceptance Criteria**:
- [ ] Warm builds significantly faster
- [ ] Cache keys scoped correctly (`scope=solr-client`)
- [ ] Cache mode set to `max` for comprehensive caching

---

### TC-DB-004: Build Arguments and Labels
**Objective**: Verify build metadata correctly embedded.

**Preconditions**:
- Build for version `v2.1.0`
- Commit SHA: `***REMOVED_SECRET***`

**Steps**:
1. Pull image: `docker pull ghcr.io/hgnc/pgnc-solr-client:v2.1.0`
2. Inspect labels: `docker inspect ghcr.io/hgnc/pgnc-solr-client:v2.1.0`
3. Check build args (if exposed in runtime)

**Expected Labels**:
```json
{
  "org.opencontainers.image.source": "hgnc/pgnc-solr-client",
  "org.opencontainers.image.revision": "***REMOVED_SECRET***",
  "org.opencontainers.image.version": "v2.1.0",
  "org.opencontainers.image.created": "2025-10-16T15:30:00Z"
}
```

**Expected Build Args** (if runtime-visible):
- `BUILD_VERSION=v2.1.0`
- `BUILD_COMMIT=***REMOVED_SECRET***`
- `NODE_ENV=production`

**Acceptance Criteria**:
- [ ] All labels present and accurate
- [ ] Timestamps in ISO 8601 format
- [ ] Commit SHA matches workflow context

---

### TC-DB-005: GHCR Authentication
**Objective**: Test authentication mechanism and token permissions.

**Preconditions**:
- Workflow has `packages: write` permission
- `secrets.GHCR_TOKEN` configured (or using `github.token`)

**Steps**:
1. Review `ghcr-login` step logs
2. Confirm authentication success
3. Verify push permissions

**Expected Results**:
- Login step succeeds
- Push operations complete without 401/403 errors
- Token scopes sufficient for package publishing

**Failure Scenarios to Test**:
| Scenario | Expected Behavior |
|----------|------------------|
| Missing token | Workflow fails with clear error at login step |
| Insufficient scopes | Fails at push with permission error |
| Expired token | Login fails with authentication error |

**Acceptance Criteria**:
- [ ] Login success confirmed in logs
- [ ] Token validation occurs early
- [ ] Failure messages guide remediation

---

### TC-DB-006: Tag Conflict Resolution
**Objective**: Test automatic cleanup of conflicting GHCR tags.

**Preconditions**:
- GHCR already has entry for `v2.2.0` (from previous run)
- Workflow calculates same version `v2.2.0`

**Steps**:
1. Trigger workflow for `v2.2.0`
2. Observe `Guard against tag conflicts` step
3. Verify cleanup occurs

**Expected Results**:
- Workflow detects existing GHCR entry
- Issues DELETE request to remove conflicting version
- Proceeds with build and push
- New image replaces old one

**Acceptance Criteria**:
- [ ] Conflict detection works
- [ ] Automatic cleanup successful
- [ ] Workflow completes without manual intervention
- [ ] Idempotent behavior maintained

---

### TC-DB-007: Image Size and Build Duration Tracking
**Objective**: Validate metrics collection and reporting.

**Preconditions**:
- Successful build for version `v2.3.0`

**Steps**:
1. Review `build_and_push` job outputs
2. Check workflow summary

**Expected Metrics**:
- `image_size_bytes`: Numeric value (e.g., 256000000)
- `build_duration_seconds`: Numeric value (e.g., 360)
- Human-readable size in summary (e.g., "244 MiB")

**Acceptance Criteria**:
- [ ] Metrics accurately captured
- [ ] Displayed in job summary
- [ ] Available as job outputs for downstream use
- [ ] Trends trackable over time

---

## 4. Failure Recovery Tests

### TC-FR-001: Network Failure During GitHub API Call
**Objective**: Test resilience when GitHub API is unreachable.

**Simulation**:
- Temporarily break network during `create_release` job (e.g., via firewall rule in test environment)

**Expected Results**:
- Workflow fails at API call with timeout/connection error
- No partial state created (release, tags)
- Retry mechanism in place (if configured)

**Recovery Procedure**:
1. Resolve network issue
2. Re-run workflow from failed job
3. Verify workflow completes successfully

**Acceptance Criteria**:
- [ ] Failure detected and reported clearly
- [ ] No inconsistent state (orphaned tags/releases)
- [ ] Retry succeeds without manual cleanup

---

### TC-FR-002: GHCR Push Failure (Quota/Rate Limit)
**Objective**: Simulate GHCR push failure due to quota or rate limiting.

**Simulation**:
- Use account approaching rate limits
- Or simulate by returning 429 error

**Expected Results**:
- Push fails with rate limit error
- Workflow logs indicate retry-after information
- Job fails but release already created

**Recovery Procedure**:
1. Wait for rate limit window
2. Re-run workflow
3. Workflow detects existing release, skips creation
4. Completes push to GHCR

**Acceptance Criteria**:
- [ ] Error clearly indicates rate limiting
- [ ] Release state preserved
- [ ] Workflow idempotent on retry
- [ ] Push succeeds after cooldown

---

### TC-FR-003: Docker Build Failure (Compilation Error)
**Objective**: Test behavior when Docker build fails (e.g., syntax error in code).

**Simulation**:
- Introduce build error in Dockerfile or source code
- Example: invalid npm package, missing dependency

**Expected Results**:
- Build fails during `docker/build-push-action` step
- GitHub release already created (job dependency)
- No image pushed to GHCR

**Outcome**:
- Release exists but tagged as failed/incomplete
- No container images available

**Recovery Procedure**:
1. Fix build error
2. Push fix to `release` branch
3. Workflow triggers automatically
4. Version calculation detects existing release v1.X.0
5. **Question**: Should we allow rebuilding same version or require bump?

**Decision Points**:
- [ ] Document whether releases should be mutable
- [ ] Decide if failed releases should be deleted automatically
- [ ] Define rollback vs. rebuild policy

**Acceptance Criteria**:
- [ ] Build failure clearly logged
- [ ] Release state visible (no image)
- [ ] Recovery path documented

---

### TC-FR-004: Concurrency Conflict
**Objective**: Test concurrent workflow executions on same branch.

**Simulation**:
1. Trigger workflow manually for `v3.0.0`
2. Immediately push commit to `release` branch (triggers second run)
3. Both workflows execute simultaneously

**Expected Results**:
- Concurrency group setting takes effect
- Second workflow run cancels first (in-progress cancellation)
- Only one release created
- Deterministic version outcome

**Acceptance Criteria**:
- [ ] Concurrency group: `solr-client-release-${{ github.ref }}`
- [ ] `cancel-in-progress: true` honored
- [ ] No race condition creating duplicate releases
- [ ] Logs show cancellation of earlier run

---

### TC-FR-005: Partial Failure - Release Created, Push Failed
**Objective**: Test recovery when release exists but image push incomplete.

**Scenario**:
- `create_release` job succeeded
- `build_and_push` job failed (network interruption during push)

**Current State**:
- GitHub release `v3.1.0` exists
- No GHCR image for `v3.1.0`

**Recovery Steps**:
1. Re-run workflow
2. `calculate_version` still outputs `v3.1.0`
3. `create_release` detects existing release, skips creation (or updates)
4. `build_and_push` completes successfully

**Expected Behavior**:
- Workflow idempotent - reruns complete missing steps
- No duplicate release error
- Image eventually pushed

**Acceptance Criteria**:
- [ ] Workflow re-runnable without errors
- [ ] Existing release not duplicated
- [ ] Image pushed on retry
- [ ] Finalize job confirms alignment

---

### TC-FR-006: Token Expiration Mid-Workflow
**Objective**: Simulate token expiring between jobs.

**Simulation** (difficult to reproduce reliably):
- Use short-lived token
- Long-running workflow

**Expected Results**:
- Jobs dependent on token fail with auth error
- Error message indicates token issue
- Jobs that already used token succeed

**Recovery Procedure**:
1. Refresh/replace token
2. Re-run workflow

**Acceptance Criteria**:
- [ ] Auth failures clearly identified
- [ ] Guidance provided for token refresh
- [ ] No unrecoverable state

---

### TC-FR-007: Version Calculation Failure
**Objective**: Test when `calculate-version` action itself fails.

**Simulation**:
- Modify `calculate-version/index.js` to throw error
- Or introduce invalid logic

**Expected Results**:
- `calculate_version` job fails
- Downstream jobs skipped (dependency not met)
- No release or image created
- Clear error from action

**Recovery Procedure**:
1. Fix action code
2. Re-run workflow
3. Verify version calculation succeeds

**Acceptance Criteria**:
- [ ] Action failure detected immediately
- [ ] Job marked as failed with error details
- [ ] No partial execution of downstream jobs
- [ ] Action code testable independently

---

### TC-FR-008: Rollback After Bad Release
**Objective**: Document and test complete rollback of a bad release.

**Scenario**:
- Release `v3.2.0` deployed
- Critical bug discovered
- Need to rollback to `v3.1.5`

**Rollback Steps**:
1. Delete GitHub release `v3.2.0`
2. Delete Git tag `v3.2.0`
3. Delete GHCR images for `v3.2.0`
4. Update `latest` tag to point to `v3.1.5`
5. Notify downstream deployers

**Commands**:
```bash
# Delete GitHub release
gh release delete v3.2.0 --yes

# Delete Git tag
git push origin :refs/tags/v3.2.0

# Delete GHCR versions (via API or UI)
gh api -X DELETE /orgs/hgnc/packages/container/pgnc-solr-client/versions/{version_id}

# Re-tag latest
docker pull ghcr.io/hgnc/pgnc-solr-client:v3.1.5
docker tag ghcr.io/hgnc/pgnc-solr-client:v3.1.5 ghcr.io/hgnc/pgnc-solr-client:latest
docker push ghcr.io/hgnc/pgnc-solr-client:latest
```

**Acceptance Criteria**:
- [ ] All artifacts removed cleanly
- [ ] Rollback procedure documented
- [ ] Downstream systems notified
- [ ] Process automated where possible

---

### TC-FR-009: Divergent Branch State
**Objective**: Test when `release` branch is behind origin.

**Simulation**:
1. Local `release` branch at commit A
2. Origin `release` branch at commit B (ahead)
3. Attempt to trigger workflow from local

**Expected Results**:
- `Validate repository state` step detects divergence
- Error: "Release branch release is behind origin/release by N commit(s)."
- Workflow fails before proceeding

**Recovery Procedure**:
1. Pull latest changes: `git pull origin release`
2. Re-run workflow

**Acceptance Criteria**:
- [ ] Divergence detection works
- [ ] Clear remediation guidance
- [ ] Prevents releasing stale code

---

### TC-FR-010: Cleanup After Workflow Cancellation
**Objective**: Test manual cancellation and cleanup requirements.

**Scenario**:
1. Start workflow run
2. `create_release` completes (release created)
3. User manually cancels workflow during `build_and_push`

**Result State**:
- Release exists
- No image in GHCR
- Workflow marked as cancelled

**Cleanup Options**:
A. **Delete release and retry**: Remove incomplete release, re-run workflow
B. **Resume and complete**: Re-run workflow (idempotent), complete image push

**Acceptance Criteria**:
- [ ] Cancellation leaves known state
- [ ] Recovery paths documented
- [ ] Partial artifacts identifiable
- [ ] Re-run completes missing steps

---

## 5. Security & Permissions Tests

### TC-SP-001: Minimum Required Permissions
**Objective**: Verify workflow operates with least privilege.

**Test Matrix**:
| Permission | Required | Test Result |
|------------|----------|-------------|
| `contents: write` | Yes | Workflow fails without it |
| `packages: write` | Yes | Cannot push to GHCR without it |
| `contents: read` | No (write includes read) | N/A |
| `issues: write` | No | Not used, verify workflow succeeds without |
| `pull-requests: write` | No | Not used, verify workflow succeeds without |

**Acceptance Criteria**:
- [ ] Workflow permissions explicitly declared
- [ ] Only necessary scopes granted
- [ ] Documentation lists required permissions

---

### TC-SP-002: Token Scope Validation
**Objective**: Test pre-flight token scope checks.

**Preconditions**:
- `validate_inputs` job includes scope validation

**Test Cases**:
1. Token with full scopes → Passes validation
2. Token missing `packages: write` → Warning issued
3. Token missing `contents: write` → Warning issued
4. No token available → Error, workflow fails

**Expected Warnings/Errors**:
```
::warning::GITHUB_TOKEN may lack packages:write/contents:write scopes.
Configure a GH_PAT repository secret with required scopes.
```

**Acceptance Criteria**:
- [ ] Scope checks run before version calculation
- [ ] Warnings inform without blocking (if defaults might work)
- [ ] Errors block when token missing entirely

---

### TC-SP-003: Repository Publish Capability Check
**Objective**: Verify repository settings allow package publishing.

**Preconditions**:
- Repository has Actions enabled
- Package publishing allowed

**Steps**:
1. Query repository permissions via GraphQL
2. Check `viewerPermission` for workflow token

**Expected Permission**:
- `ADMIN` or `WRITE` (sufficient to publish packages)

**Negative Test**:
- Set repository to read-only for Actions
- Workflow should fail with clear error

**Acceptance Criteria**:
- [ ] Permission check in `validate_inputs` job
- [ ] Clear error if insufficient access
- [ ] Guidance to fix repository settings

---

### TC-SP-004: Secrets Management
**Objective**: Validate secrets properly used and not exposed.

**Checks**:
1. `GITHUB_TOKEN` used from context (not hardcoded)
2. `secrets.GH_PAT` fallback mechanism works
3. `secrets.GHCR_TOKEN` used for GHCR login
4. No secrets leaked in logs

**Log Scrubbing Test**:
- Review workflow logs for masked values
- Confirm tokens appear as `***` in output

**Acceptance Criteria**:
- [ ] All tokens sourced from secrets/context
- [ ] Logs do not expose sensitive values
- [ ] Fallback chain tested (GH_PAT → github.token)

---

### TC-SP-005: Organization-Level Package Settings
**Objective**: Test package visibility and access controls.

**Preconditions**:
- Repository belongs to organization (HGNC)
- Package `pgnc-solr-client` configured

**Settings to Validate**:
- Package visibility: Public or Private
- Package permissions: Ensure Actions can write
- Inherited permissions from org settings

**Test**:
1. Publish package via workflow
2. Verify package accessible based on visibility setting
3. Confirm workflow has write access

**Acceptance Criteria**:
- [ ] Package visibility aligns with security requirements
- [ ] Actions permitted to publish
- [ ] Org-level settings documented

---

## 6. Edge Cases & Integration Tests

### TC-EC-001: First Release After Repository Migration
**Objective**: Test bootstrap scenario in migrated repository.

**Scenario**:
- Repository migrated from another org
- Contains commits but no releases/tags

**Steps**:
1. Trigger workflow
2. Verify bootstrap detection
3. Confirm `v1.0.0` creation

**Expected Results**:
- Behaves as new repository (bootstrap)
- Version history starts fresh at `v1.0.0`

**Acceptance Criteria**:
- [ ] Migration does not interfere with version calculation
- [ ] No hidden tags interfere
- [ ] Clean slate established

---

### TC-EC-002: Hotfix Release Process
**Objective**: Test workflow for out-of-order hotfix releases.

**Scenario**:
- Current release: `v3.5.0`
- Need to release hotfix on older version: `v3.4.1` (patch for v3.4.0)

**Challenge**:
- Workflow assumes linear version progression
- Hotfix branches not directly supported

**Workaround**:
1. Create branch from `v3.4.0` tag
2. Apply hotfix commits
3. Manually tag and release as `v3.4.1`
4. Later merge hotfix into `release` branch
5. Next release becomes `v3.5.1` (incorporates hotfix)

**Acceptance Criteria**:
- [ ] Process documented for hotfix releases
- [ ] Manual tagging steps clear
- [ ] Integration back to main branch defined

---

### TC-EC-003: Release with Empty Commit History
**Objective**: Test release when no commits exist between versions.

**Scenario**:
- Force a new release without code changes (e.g., configuration-only update)
- Previous version: `v3.6.0`
- Trigger workflow for `v3.6.1`

**Expected Results**:
- Version increments normally
- Release notes indicate "No new commits" or minimal changelog
- Image rebuilds with same codebase (possibly different build metadata)

**Acceptance Criteria**:
- [ ] Workflow does not require code changes
- [ ] Release notes handle empty diffs gracefully
- [ ] Use case supported (e.g., dependency updates in Dockerfile)

---

### TC-EC-004: Very Long Release Notes
**Objective**: Test handling of large changelogs (many commits).

**Scenario**:
- 100+ commits between `v4.0.0` and `v4.1.0`
- Auto-generated release notes may be extensive

**Expected Results**:
- Release notes generation completes
- GitHub API may truncate or paginate
- Workflow handles large payloads

**Potential Issues**:
- API rate limiting
- Timeout during note generation

**Acceptance Criteria**:
- [ ] Large changelogs processed without timeout
- [ ] Graceful handling of API limits
- [ ] Option to use `notes_override` for curated summary

---

### TC-EC-005: Multi-Branch Concurrent Workflows
**Objective**: Test isolation when workflows run on different branches.

**Scenario**:
1. `release` branch workflow running (version `v5.0.0`)
2. `staging` branch also has workflow (if configured)

**Expected Results**:
- Concurrency groups differentiated by `github.ref`
- No interference between branch workflows
- Separate versioning streams if applicable

**Acceptance Criteria**:
- [ ] Workflows isolated by branch
- [ ] No cross-contamination of versions or artifacts
- [ ] Concurrency group scoped correctly

---

### TC-EC-006: Workflow Re-run After Partial Failure
**Objective**: Full end-to-end re-run scenario.

**Initial Run**:
1. All jobs succeed except `finalize` (verification failed)

**State After Initial Run**:
- Release `v5.1.0` created
- Image `v5.1.0` pushed to GHCR
- `finalize` job failed due to temporary check issue

**Re-run**:
1. Re-run entire workflow
2. `create_release` detects existing release `v5.1.0`
3. `build_and_push` detects existing image tags
4. Guards against duplicates should allow completion

**Expected Results**:
- Re-run completes successfully
- No errors about duplicates
- `finalize` job succeeds on retry

**Acceptance Criteria**:
- [ ] Workflow fully idempotent
- [ ] Duplicate checks permit re-runs
- [ ] All jobs re-executable safely

---

## Test Execution Checklist

### Pre-Test Setup
- [ ] Create isolated test repository or use staging environment
- [ ] Configure all required secrets (`GITHUB_TOKEN`, `GH_PAT`, `GHCR_TOKEN`)
- [ ] Verify workflow file syntax and structure
- [ ] Set up test tagging strategy (e.g., `test-v1.0.0` prefix)
- [ ] Document baseline repository state

### During Testing
- [ ] Execute tests in priority order (High → Medium → Low)
- [ ] Record actual results vs. expected for each test case
- [ ] Capture workflow run IDs and timestamps
- [ ] Screenshot critical steps and outputs
- [ ] Log any deviations or unexpected behaviors

### Post-Test Analysis
- [ ] Compile test results into summary report
- [ ] Identify failed test cases and root causes
- [ ] Document bugs discovered during testing
- [ ] Update workflow or documentation based on findings
- [ ] Mark test scenarios as passed/failed/skipped

### Test Environment Requirements
- **Repository**: Dedicated test repo with workflow enabled
- **Permissions**: Full admin access to configure secrets and settings
- **Tooling**: `gh` CLI, Docker, `curl`, `jq`
- **Time**: Allocate 3-4 hours for full test suite execution
- **Cleanup**: Script to reset repository state between test runs

---

## Success Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Test Pass Rate | ≥95% | TBD |
| Critical Bugs Found | 0 | TBD |
| Workflow Execution Time (avg) | <7 minutes | TBD |
| Idempotency Failures | 0 | TBD |
| Documentation Gaps Identified | <5 | TBD |

---

## Test Report Template

```markdown
# Release Pipeline Test Report

**Date**: YYYY-MM-DD
**Tester**: [Name]
**Environment**: [Test Repo URL]
**Workflow Version**: [Commit SHA]

## Summary
- Total Tests: 42
- Passed: X
- Failed: Y
- Skipped: Z

## Failed Tests
1. TC-XX-XXX: [Title]
   - **Reason**: [Root cause]
   - **Impact**: [Severity]
   - **Remediation**: [Fix planned]

## Observations
- [Notable findings]
- [Performance insights]
- [Recommendations]

## Sign-off
- [ ] All critical tests passed
- [ ] Workflow ready for production
- [ ] Documentation updated
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-16  
**Next Review**: After first production deployment
