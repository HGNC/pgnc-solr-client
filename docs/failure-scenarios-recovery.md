# Failure Scenarios and Recovery Procedures

Comprehensive guide for testing failure modes and recovery mechanisms in the Solr Client release pipeline.

## Table of Contents

1. [Overview](#overview)
2. [Failure Testing Methodology](#failure-testing-methodology)
3. [Infrastructure Failures](#infrastructure-failures)
4. [Authentication & Authorization Failures](#authentication--authorization-failures)
5. [Build & Compilation Failures](#build--compilation-failures)
6. [Version Calculation Failures](#version-calculation-failures)
7. [Release Creation Failures](#release-creation-failures)
8. [Image Publishing Failures](#image-publishing-failures)
9. [Concurrency & Race Conditions](#concurrency--race-conditions)
10. [Data Integrity & Validation Failures](#data-integrity--validation-failures)
11. [Recovery Playbooks](#recovery-playbooks)
12. [Post-Incident Procedures](#post-incident-procedures)

---

## Overview

### Purpose

This document provides structured test scenarios for deliberate failure injection and validates that the release pipeline handles errors gracefully with clear recovery paths.

### Failure Classification

| Category | Risk Level | Impact | Recovery Time |
|----------|------------|--------|---------------|
| Infrastructure | High | Workflow hangs/timeout | 5-30 min |
| Authentication | Critical | Complete failure | 1-5 min |
| Build | Medium | No artifacts | 10-30 min |
| Version | Medium | Wrong version | 2-10 min |
| Release | High | Partial state | 5-20 min |
| Publishing | Medium | Image unavailable | 10-30 min |
| Concurrency | Low | Duplicate attempts | 1-5 min |
| Validation | Low | Early failure | 1-2 min |

### Testing Principles

1. **Fail Fast**: Errors should be detected as early as possible
2. **Clear Messaging**: Error messages must indicate root cause and remediation
3. **No Silent Failures**: All failures logged and visible
4. **Idempotent Recovery**: Re-running workflow should complete successfully
5. **State Consistency**: No orphaned artifacts (tags without releases, releases without images)

---

## Failure Testing Methodology

### Test Environment Requirements

- Staging repository with workflow isolation
- Ability to simulate network failures
- Test tokens with controlled scopes
- Rollback capabilities for each test

### Failure Injection Techniques

| Technique | Implementation | Use Case |
|-----------|----------------|----------|
| Network partition | Firewall rules, `iptables` | Simulate API unavailability |
| Token revocation | Delete/expire PAT | Auth failures |
| Bad code injection | Introduce syntax errors | Build failures |
| Resource limits | Restrict memory/CPU | OOM scenarios |
| API rate limiting | Exhaust quota | Throttling behavior |
| Manual cancellation | Stop workflow mid-run | Partial completion |
| Concurrent triggers | Parallel workflow runs | Race conditions |
| Data corruption | Malformed JSON/YAML | Validation errors |

### Success Criteria for Failure Tests

- [ ] Error detected within appropriate job
- [ ] Clear error message with remediation guidance
- [ ] Workflow fails explicitly (not silent failure or hang)
- [ ] No partial state requiring manual cleanup
- [ ] Recovery procedure documented and tested
- [ ] Re-run after fix succeeds without manual intervention

---

## Infrastructure Failures

### FS-001: GitHub Actions Service Outage

**Scenario**: GitHub Actions platform unavailable during workflow execution.

**Simulation**:
- Cannot directly simulate; must test during actual incident
- Alternative: Use `act` locally and kill process mid-execution

**Expected Behavior**:
- Workflow status: "Queued" or "In Progress" → "Cancelled" or "Timed Out"
- No artifacts created
- Auto-retry on platform recovery (if enabled)

**Recovery Procedure**:
1. Wait for GitHub status to report green: https://www.githubstatus.com/
2. Re-trigger workflow manually or via push
3. Workflow executes from beginning

**Acceptance Criteria**:
- [ ] Workflow recognizes platform issue (not repo-specific error)
- [ ] Re-run after recovery succeeds without changes
- [ ] No cleanup required

---

### FS-002: Network Timeout During GitHub API Call

**Scenario**: Network latency or timeout when fetching releases/tags.

**Simulation**:
```bash
# On runner (or locally with act)
# Add delay/timeout to simulate
curl --max-time 1 https://api.github.com/repos/HGNC/pgnc-solr-client-staging/releases
```

**Inject into Action**:
Modify `calculate-version/index.js` temporarily:
```javascript
// Add timeout simulation
const timeout = setTimeout(() => {
  throw new Error('ETIMEDOUT: API request timed out');
}, 1000);
```

**Expected Behavior**:
- Job fails with error: "Request timeout when fetching releases"
- Workflow stops at `calculate_version` job
- Clear guidance: "Check network connectivity or retry"

**Recovery Procedure**:
1. Verify GitHub API status: `gh api rate-limit`
2. Re-run workflow
3. If persistent, check runner network configuration

**Acceptance Criteria**:
- [ ] Timeout error clearly identified (not generic failure)
- [ ] Retry mechanism attempts request (if configured)
- [ ] Workflow fails cleanly without hanging

---

### FS-003: Disk Space Exhausted on Runner

**Scenario**: Docker build fails due to insufficient disk space.

**Simulation**:
```bash
# Fill disk on runner (be careful!)
dd if=/dev/zero of=/tmp/filler bs=1M count=50000  # 50GB

# Trigger build
```

**Expected Behavior**:
- Build fails with error: "no space left on device"
- Job logs indicate disk space issue
- Workflow fails at `build_and_push` job

**Recovery Procedure**:
1. GitHub-hosted runners: Re-run (fresh runner allocated)
2. Self-hosted runners: Clear disk space, then re-run
   ```bash
   docker system prune -a --volumes
   ```

**Acceptance Criteria**:
- [ ] Error clearly indicates disk space issue
- [ ] Actionable remediation provided
- [ ] Re-run on fresh runner succeeds

---

### FS-004: Container Registry Unreachable

**Scenario**: GHCR is down or network blocks access.

**Simulation**:
```bash
# Block GHCR domain temporarily
sudo echo "0.0.0.0 ghcr.io" >> /etc/hosts
```

**Expected Behavior**:
- Login fails: "Error: Cannot connect to ghcr.io"
- `build_and_push` job fails at login step
- Clear error message

**Recovery Procedure**:
1. Check GHCR status: https://www.githubstatus.com/
2. Verify network/firewall rules
3. Re-run workflow when registry accessible

**Acceptance Criteria**:
- [ ] Login failure detected early (before build)
- [ ] Network connectivity issue identified
- [ ] No resources wasted on build if publish will fail

---

## Authentication & Authorization Failures

### FS-010: Missing GitHub Token

**Scenario**: `GITHUB_TOKEN` not available in workflow context.

**Simulation**:
Remove token reference from workflow:
```yaml
# Comment out token
# github_token: ${{ secrets.GITHUB_TOKEN }}
```

**Expected Behavior**:
- `validate_inputs` pre-flight check fails
- Error: "No GitHub token detected from secrets.GH_PAT or github.token"
- Workflow terminates immediately

**Recovery Procedure**:
1. Verify workflow has `permissions: contents: write, packages: write`
2. Ensure `github.token` accessible in context
3. Or set `secrets.GH_PAT` with appropriate scopes

**Acceptance Criteria**:
- [ ] Pre-flight validation catches missing token
- [ ] Failure occurs before any API calls
- [ ] Clear guidance on required secrets

---

### FS-011: Insufficient Token Scopes

**Scenario**: Token lacks `packages: write` or `contents: write`.

**Simulation**:
Create PAT with only `repo` scope, set as `GH_PAT` secret.

**Expected Behavior**:
- Token validation step warns: "Token may lack packages:write scope"
- Push to GHCR fails: "permission_denied: write_package"
- Error message indicates scope issue

**Recovery Procedure**:
1. Regenerate PAT with required scopes:
   - `contents: write`
   - `packages: write`
2. Update `GH_PAT` secret
3. Re-run workflow

**Acceptance Criteria**:
- [ ] Scope validation detects insufficient permissions
- [ ] Warning issued before failure (if possible to detect)
- [ ] Actionable error when operation fails

---

### FS-012: Expired Personal Access Token

**Scenario**: `GH_PAT` expires mid-workflow (unlikely but possible).

**Simulation**:
- Set PAT with 1-hour expiration
- Trigger long-running workflow
- Or delete token during execution

**Expected Behavior**:
- Jobs using token fail with auth error: "401 Unauthorized"
- Error message: "Bad credentials" or "Token expired"

**Recovery Procedure**:
1. Generate new PAT
2. Update `GH_PAT` secret
3. Re-run workflow

**Acceptance Criteria**:
- [ ] Auth failure clearly identified
- [ ] Jobs that already ran not re-executed unnecessarily
- [ ] New token picked up on retry

---

### FS-013: GHCR Package Publishing Forbidden

**Scenario**: Organization policy blocks package publishing from Actions.

**Simulation**:
- Navigate to Org Settings → Packages
- Disable "Allow members to publish packages"

**Expected Behavior**:
- GHCR login succeeds (authentication OK)
- Push fails: "403 Forbidden: insufficient permissions"
- Error indicates org policy issue

**Recovery Procedure**:
1. Org admin: Enable package publishing for workflows
2. Re-run workflow

**Acceptance Criteria**:
- [ ] Error distinguishes between auth (401) and authorization (403)
- [ ] Guidance points to org settings
- [ ] Clear message that user cannot self-remediate

---

### FS-014: Repository Not Allowed to Publish to Package

**Scenario**: GHCR package visibility settings exclude staging repo.

**Simulation**:
- Navigate to Package settings → Manage Actions access
- Remove staging repository from allowed list

**Expected Behavior**:
- Push fails: "permission denied: repository not in allowed list"

**Recovery Procedure**:
1. Package admin: Add repository to allowed list
2. Re-run workflow

**Acceptance Criteria**:
- [ ] Error message specifies package access issue
- [ ] Links to package settings provided
- [ ] Re-run succeeds after access granted

---

## Build & Compilation Failures

### FS-020: Dockerfile Syntax Error

**Scenario**: Invalid instruction in Dockerfile.

**Injection**:
```dockerfile
# Add invalid line to Dockerfile
FORM node:20-alpine  # Typo: should be FROM
```

**Expected Behavior**:
- Docker build fails with parse error
- Error message: "unknown instruction: FORM"
- Job: `build_and_push` fails

**Recovery Procedure**:
1. Fix Dockerfile syntax
2. Commit and push fix
3. Workflow auto-triggers (or manual re-run)

**Acceptance Criteria**:
- [ ] Build failure clearly indicates Dockerfile issue
- [ ] Line number of error provided
- [ ] No image pushed (build stopped early)

---

### FS-021: Missing Build Dependency

**Scenario**: npm package missing from `package.json` but referenced in code.

**Injection**:
```javascript
// src/index.ts
import { someFn } from 'nonexistent-package';
```

**Expected Behavior**:
- npm install or build step fails
- Error: "Cannot find module 'nonexistent-package'"
- Build logs show dependency resolution failure

**Recovery Procedure**:
1. Add missing package: `npm install nonexistent-package`
2. Update `package.json`
3. Commit and push

**Acceptance Criteria**:
- [ ] Dependency error clear in logs
- [ ] Failure occurs during build (not at runtime)
- [ ] Package name clearly indicated

---

### FS-022: TypeScript Compilation Error

**Scenario**: Type error in source code.

**Injection**:
```typescript
// Introduce type mismatch
const num: number = "not a number";
```

**Expected Behavior**:
- Build step fails with TypeScript error
- Error message shows file, line, and type mismatch
- `build_and_push` job fails

**Recovery Procedure**:
1. Fix type error
2. Verify locally: `npm run build`
3. Commit and push fix

**Acceptance Criteria**:
- [ ] TypeScript error clearly displayed
- [ ] File and line number provided
- [ ] Build fails before Docker image creation

---

### FS-023: Out of Memory During Build

**Scenario**: Build process exceeds available memory.

**Simulation**:
```dockerfile
# Increase memory consumption artificially
RUN node -e "const arr = []; while(true) arr.push(new Array(1e6))"
```

**Expected Behavior**:
- Build fails with OOM error: "signal: killed" or "out of memory"
- Docker build stops mid-step

**Recovery Procedure**:
1. Optimize build (reduce memory usage)
2. Or request larger runner (if self-hosted)
3. GitHub-hosted: Use `runs-on: ubuntu-latest` (7GB RAM)

**Acceptance Criteria**:
- [ ] OOM error clearly identified (not obscure failure)
- [ ] Guidance provided for optimizing build
- [ ] Consider multi-stage builds to reduce memory

---

### FS-024: Build Timeout

**Scenario**: Build exceeds maximum job execution time.

**Simulation**:
```dockerfile
# Add artificially slow step
RUN sleep 21600  # 6 hours (exceeds default timeout)
```

**Expected Behavior**:
- Job cancelled after timeout (default: 360 minutes)
- Error: "The job running on runner has exceeded the maximum execution time"

**Recovery Procedure**:
1. Optimize slow build steps
2. Increase timeout if justified:
   ```yaml
   jobs:
     build_and_push:
       timeout-minutes: 60  # Adjust as needed
   ```

**Acceptance Criteria**:
- [ ] Timeout clearly indicated
- [ ] Job cancelled cleanly (not hanging)
- [ ] Timeout value configurable

---

## Version Calculation Failures

### FS-030: No Tags Found (Unexpected Bootstrap)

**Scenario**: Expecting existing tags but repository has none.

**Setup**:
- Delete all tags accidentally:
  ```bash
  git tag -l | xargs git tag -d
  git push origin --delete $(git ls-remote --tags origin | awk '{print $2}' | sed 's|refs/tags/||')
  ```

**Expected Behavior**:
- `is_bootstrap` = `true`
- Next version = `v1.0.0`
- Warning: "No existing tags found, bootstrapping at v1.0.0"

**Recovery Procedure**:
1. If unintended: Restore tags from backup or Git reflog
2. If intended: Accept bootstrap and proceed

**Acceptance Criteria**:
- [ ] Bootstrap scenario handled gracefully
- [ ] Warning issued if unexpected
- [ ] Version calculation proceeds

---

### FS-031: Tag Fetch Failure

**Scenario**: Unable to fetch tags from GitHub API.

**Simulation**:
- Temporarily revoke API access in `calculate-version/index.js`
- Or simulate API error response

**Expected Behavior**:
- Error: "Failed to fetch releases from GitHub API"
- HTTP status code displayed (e.g., 503)
- Job fails with actionable error

**Recovery Procedure**:
1. Check GitHub API status
2. Verify token has `repo` scope
3. Re-run workflow

**Acceptance Criteria**:
- [ ] API failure clearly identified
- [ ] Status code and error message logged
- [ ] Retry guidance provided

---

### FS-032: Downgrade Attempt Detected

**Scenario**: Explicit version lower than current latest.

**Setup**:
- Latest version: `v2.5.0`
- Trigger with `explicit_version: v2.4.0`

**Expected Behavior**:
- `calculate_version` succeeds (version calculated)
- `validate_version_progression` job fails
- Error: "Next version v2.4.0 must be greater than previous release v2.5.0"

**Recovery Procedure**:
1. Correct `explicit_version` to higher value (e.g., `v2.5.1`)
2. Or remove override to use auto-increment
3. Re-run workflow

**Acceptance Criteria**:
- [ ] Downgrade detected and blocked
- [ ] Clear error indicating version comparison
- [ ] Suggestion to use higher version

---

### FS-033: Version Calculation Logic Error

**Scenario**: Bug in `calculate-version/index.js` produces invalid version.

**Simulation**:
Introduce bug:
```javascript
// Example bug: off-by-one in patch increment
const patch = parseInt(parts[2]) + 2;  // Should be +1
```

**Expected Behavior**:
- Incorrect version calculated (e.g., `v1.2.5` instead of `v1.2.4`)
- Version progression validation may catch if it skips a version
- Or incorrect version released (if validation doesn't catch)

**Recovery Procedure**:
1. Fix bug in `calculate-version/index.js`
2. Add unit tests to prevent regression
3. If incorrect release created: rollback release and re-run

**Acceptance Criteria**:
- [ ] Unit tests for version calculation exist
- [ ] Edge cases covered (major rollover, minor rollover)
- [ ] Validation catches unexpected version jumps

---

## Release Creation Failures

### FS-040: Duplicate Release Exists

**Scenario**: Attempting to create release that already exists.

**Setup**:
- Manually create release `v3.0.0`
- Trigger workflow calculating same version

**Expected Behavior**:
- Pre-flight check detects existing release
- Error: "Release v3.0.0 already exists. Bump the version or remove the existing release."
- Job fails before API call

**Recovery Procedure**:
Option A: Delete existing release and re-run
```bash
gh release delete v3.0.0 --yes
```
Option B: Bump version and re-run with new version

**Acceptance Criteria**:
- [ ] Duplicate check occurs before release creation
- [ ] Clear remediation options provided
- [ ] Idempotent: re-run after fix succeeds

---

### FS-041: Git Tag Exists Without Release

**Scenario**: Tag exists (manually created or orphaned) but no release object.

**Setup**:
```bash
git tag v3.1.0
git push origin v3.1.0
```

**Expected Behavior**:
- Tag check detects existing tag
- Error: "Git tag v3.1.0 already exists. Delete the tag or bump the version."
- Workflow fails at `create_release` job

**Recovery Procedure**:
```bash
# Delete orphaned tag
git push origin :refs/tags/v3.1.0
git tag -d v3.1.0

# Re-run workflow
```

**Acceptance Criteria**:
- [ ] Tag check separate from release check
- [ ] Both checks prevent duplicates
- [ ] Recovery requires manual tag deletion

---

### FS-042: Release Notes Generation Failure

**Scenario**: GitHub API fails to generate release notes.

**Simulation**:
- Simulate API error in `generate release notes` step
- Or exceed rate limit for release notes API

**Expected Behavior**:
- Fallback to basic release notes: "Automated release notes for vX.Y.Z"
- Warning logged but workflow continues
- Or job fails if notes are critical

**Recovery Procedure**:
If warning (non-blocking):
1. Manually edit release notes in GitHub UI

If failure (blocking):
1. Use `notes_override` input to provide manual notes
2. Re-run workflow

**Acceptance Criteria**:
- [ ] Fallback mechanism for notes generation
- [ ] Workflow not completely blocked by notes failure
- [ ] Option to override notes manually

---

### FS-043: Release Creation API Failure

**Scenario**: `gh release create` command fails due to API error.

**Simulation**:
- Introduce transient API failure (500 error)

**Expected Behavior**:
- Release creation fails with HTTP error
- Error: "Failed to create release: 500 Internal Server Error"
- Workflow stops at `create_release` job

**Recovery Procedure**:
1. Wait for GitHub API recovery
2. Check status: `gh api rate-limit`
3. Re-run workflow

**Acceptance Criteria**:
- [ ] Transient API errors detected
- [ ] Retry logic in place (if applicable)
- [ ] Re-run after API recovery succeeds

---

## Image Publishing Failures

### FS-050: GHCR Login Failure

**Scenario**: Cannot authenticate to GHCR.

**Simulation**:
- Use invalid token for GHCR login
- Or revoke `GHCR_TOKEN` mid-workflow

**Expected Behavior**:
- Login step fails: "Error: Cannot login to ghcr.io"
- `build_and_push` job fails at login
- Workflow ensures login succeeded before build

**Recovery Procedure**:
1. Verify `GHCR_TOKEN` secret is set correctly
2. Token must have `packages: write` scope
3. Update secret and re-run

**Acceptance Criteria**:
- [ ] Login failure detected immediately
- [ ] Clear error message (not obscure auth error)
- [ ] Workflow doesn't waste time on build if publish will fail

---

### FS-051: Image Push Failure (Rate Limited)

**Scenario**: GHCR rate limit exceeded during push.

**Simulation**:
- Difficult to simulate; would require many rapid pushes
- Check GHCR rate limit headers

**Expected Behavior**:
- Push fails with: "429 Too Many Requests"
- Retry-after header indicates wait time
- Error guidance: "Rate limited, retry after X seconds"

**Recovery Procedure**:
1. Wait for rate limit window
2. Re-run workflow
3. Consider spacing out releases if hitting limits

**Acceptance Criteria**:
- [ ] Rate limit clearly identified
- [ ] Retry-after value displayed
- [ ] Workflow re-runnable after cooldown

---

### FS-052: Partial Push Failure (Network Interruption)

**Scenario**: Network drops mid-push, leaving partial image.

**Simulation**:
- Difficult to simulate reliably
- Could interrupt Docker daemon during push

**Expected Behavior**:
- Push fails mid-stream
- Error: "Error pushing image: connection reset"
- Image may be partially uploaded

**Recovery Procedure**:
1. Re-run workflow
2. Push should resume or restart
3. GHCR handles partial uploads gracefully

**Acceptance Criteria**:
- [ ] Partial push detected
- [ ] Re-push succeeds (resumable or restarts)
- [ ] No corrupted images published

---

### FS-053: Tag Conflict in GHCR

**Scenario**: Image tag already exists in GHCR from previous run.

**Expected Behavior** (Current Implementation):
- Workflow detects existing tag
- Deletes conflicting GHCR version
- Proceeds with push (idempotent)

**Test**:
1. Run workflow creating `v4.0.0`
2. Re-run same workflow
3. Verify conflict detection and cleanup

**Acceptance Criteria**:
- [ ] Conflict detected automatically
- [ ] Old version deleted before push
- [ ] Re-run succeeds without manual intervention
- [ ] Idempotent behavior

---

### FS-054: Image Build Success But Push Fails

**Scenario**: Build completes but push to GHCR fails.

**State After Failure**:
- Local image built successfully
- GitHub release created
- GHCR has no image

**Expected Behavior**:
- `build_and_push` job fails at push step
- Error logged: "Image built successfully but push failed"
- Release exists without image

**Recovery Procedure**:
1. Investigate push failure (auth, network, rate limit)
2. Fix issue
3. Re-run workflow:
   - Release already exists (skipped)
   - Image push reattempted
   - Workflow completes

**Acceptance Criteria**:
- [ ] Partial state recoverable via re-run
- [ ] Release not duplicated on retry
- [ ] Image eventually published

---

### FS-055: Multi-Architecture Build Failure

**Scenario**: One platform builds successfully, another fails.

**Simulation**:
```dockerfile
# Platform-specific failure
RUN if [ "$TARGETPLATFORM" = "linux/arm64" ]; then exit 1; fi
```

**Expected Behavior**:
- Build fails for `linux/arm64`
- Error indicates platform-specific issue
- No manifest pushed (all platforms required)

**Recovery Procedure**:
1. Fix platform-specific issue
2. Test locally: `docker buildx build --platform linux/arm64 .`
3. Re-run workflow

**Acceptance Criteria**:
- [ ] Platform failure clearly identified
- [ ] Error logs show which platform failed
- [ ] Fix verifiable locally before pushing

---

## Concurrency & Race Conditions

### FS-060: Concurrent Workflow Runs on Same Branch

**Scenario**: Two workflow runs triggered simultaneously on `release` branch.

**Setup**:
1. Trigger workflow manually (run ID: 123)
2. Immediately push commit to `release` (run ID: 124)

**Expected Behavior**:
- Concurrency group: `solr-client-release-release`
- `cancel-in-progress: true` cancels run 123
- Only run 124 proceeds
- No duplicate releases

**Recovery Procedure**:
- No recovery needed; workflow handles automatically

**Acceptance Criteria**:
- [ ] Earlier run cancelled
- [ ] Later run completes
- [ ] Only one release created
- [ ] Version deterministic

---

### FS-061: Manual Cancellation Mid-Workflow

**Scenario**: User manually cancels workflow during execution.

**Setup**:
1. Trigger workflow
2. Wait for `create_release` to complete
3. Manually cancel during `build_and_push`

**State After Cancellation**:
- Release created
- No image in GHCR
- Workflow status: "Cancelled"

**Recovery Procedure**:
1. Re-run workflow
2. Workflow detects existing release
3. Skips release creation
4. Completes image build and push

**Acceptance Criteria**:
- [ ] Cancellation leaves known state
- [ ] Re-run completes missing steps
- [ ] Idempotent recovery

---

### FS-062: Parallel Pushes from Different Branches

**Scenario**: Workflows on `release` and `staging` branches run simultaneously.

**Expected Behavior**:
- Different concurrency groups:
  - `release`: `solr-client-release-refs/heads/release`
  - `staging`: `solr-client-release-refs/heads/staging`
- Both can run in parallel
- No interference

**Acceptance Criteria**:
- [ ] Workflows isolated by branch
- [ ] No cross-contamination
- [ ] Separate versions/tags

---

## Data Integrity & Validation Failures

### FS-070: Malformed Workflow Input

**Scenario**: Invalid input provided to `workflow_dispatch`.

**Test Cases**:
| Input | Value | Expected Result |
|-------|-------|-----------------|
| `release_type` | `invalid` | Validation fails: "Unsupported release_type" |
| `explicit_version` | `1.2.3` | Auto-corrected to `v1.2.3` |
| `explicit_version` | `abc` | Validation fails: "must match vX.Y.Z" |
| `confirm_major` | `false` (with `release_type=major`) | Fails: "requires confirm_major=true" |

**Expected Behavior**:
- `validate_inputs` job catches all invalid inputs
- Workflow fails before version calculation
- Clear error for each failure mode

**Acceptance Criteria**:
- [ ] All input validated before processing
- [ ] Validation errors human-readable
- [ ] Fail fast on invalid inputs

---

### FS-071: Corrupted Action State

**Scenario**: `calculate-version/index.js` returns malformed JSON.

**Simulation**:
Modify action to output invalid JSON:
```javascript
console.log('invalid json output');
```

**Expected Behavior**:
- Workflow cannot parse action output
- Error: "Invalid JSON from calculate-version action"
- Job fails at output parsing

**Recovery Procedure**:
1. Fix action code
2. Test action independently:
   ```bash
   cd .github/actions/calculate-version
   node index.js
   ```
3. Re-run workflow

**Acceptance Criteria**:
- [ ] Output validation catches malformed data
- [ ] Action failure clearly attributed
- [ ] Unit tests prevent regression

---

### FS-072: Missing Required Output

**Scenario**: Action completes but doesn't set required output.

**Simulation**:
```javascript
// Forget to set output
// core.setOutput('next_version', version);
```

**Expected Behavior**:
- Downstream jobs receive empty output
- Validation step catches: "Calculated next_version is empty"
- Workflow fails with actionable error

**Recovery Procedure**:
1. Fix action to set all required outputs
2. Verify: Check `GITHUB_OUTPUT` in action logs
3. Re-run workflow

**Acceptance Criteria**:
- [ ] Missing outputs detected
- [ ] Validation step after action execution
- [ ] Clear indication of which output missing

---

## Recovery Playbooks

### Playbook 1: Complete Rollback of Bad Release

**Trigger**: Critical bug discovered in released version

**Scenario**: Release `v5.0.0` is broken, need to rollback to `v4.9.5`

**Steps**:

```bash
#!/bin/bash
# rollback-release.sh

set -euo pipefail

BAD_VERSION="v5.0.0"
ROLLBACK_TO="v4.9.5"
REPO="HGNC/pgnc-solr-client"
PACKAGE="pgnc-solr-client"

echo "Rolling back ${BAD_VERSION} to ${ROLLBACK_TO}..."

# 1. Delete GitHub release
echo "Deleting GitHub release..."
gh release delete "${BAD_VERSION}" --repo "${REPO}" --yes

# 2. Delete Git tag
echo "Deleting Git tag..."
git push origin ":refs/tags/${BAD_VERSION}"
git tag -d "${BAD_VERSION}"

# 3. Get GHCR version IDs for bad version
echo "Finding GHCR versions..."
version_ids=$(gh api "/orgs/HGNC/packages/container/${PACKAGE}/versions" \
  --jq ".[] | select(.metadata.container.tags[]? == \"${BAD_VERSION}\") | .id")

# 4. Delete GHCR images
echo "Deleting GHCR images..."
while IFS= read -r id; do
  [ -z "$id" ] && continue
  gh api -X DELETE "/orgs/HGNC/packages/container/${PACKAGE}/versions/${id}"
  echo "  Deleted version ID: ${id}"
done <<<"${version_ids}"

# 5. Re-tag 'latest' to rollback version
echo "Updating 'latest' tag to ${ROLLBACK_TO}..."
docker pull "ghcr.io/hgnc/${PACKAGE}:${ROLLBACK_TO}"
docker tag "ghcr.io/hgnc/${PACKAGE}:${ROLLBACK_TO}" "ghcr.io/hgnc/${PACKAGE}:latest"
docker push "ghcr.io/hgnc/${PACKAGE}:latest"

# 6. Notify stakeholders
echo "Rollback complete. Notify downstream deployers:"
echo "  - Version ${BAD_VERSION} removed"
echo "  - Latest now points to ${ROLLBACK_TO}"
echo "  - Update deployments to pull ${ROLLBACK_TO} or latest"

# 7. Create incident report
cat <<EOF >incident-report-$(date +%Y%m%d).md
# Rollback Incident Report

**Date**: $(date -u +'%Y-%m-%d %H:%M:%S UTC')
**Bad Version**: ${BAD_VERSION}
**Rollback Version**: ${ROLLBACK_TO}

## Actions Taken
- Deleted GitHub release ${BAD_VERSION}
- Deleted Git tag ${BAD_VERSION}
- Deleted GHCR images for ${BAD_VERSION}
- Re-tagged 'latest' to ${ROLLBACK_TO}

## Root Cause
[To be filled in]

## Prevention
[To be filled in]
EOF

echo "Incident report created: incident-report-$(date +%Y%m%d).md"
```

**Post-Rollback**:
- [ ] Verify `latest` tag points to rollback version
- [ ] Notify all downstream consumers
- [ ] Document root cause
- [ ] Implement prevention measures
- [ ] Plan hotfix release if needed

---

### Playbook 2: Recovering from Partial Workflow Failure

**Trigger**: Workflow fails after creating release but before pushing image

**Scenario**:
- Release `v6.0.0` created ✓
- Build succeeded (locally) ✓
- Push to GHCR failed ✗

**Diagnosis**:
```bash
# Check if release exists
gh release view v6.0.0

# Check if image exists
docker pull ghcr.io/hgnc/pgnc-solr-client:v6.0.0
# Error: manifest unknown

# Review workflow logs
gh run view --log
```

**Recovery**:
```bash
# Option A: Re-run workflow (recommended)
gh run rerun <run-id>

# Workflow will:
# 1. Detect existing release (skip creation)
# 2. Build image
# 3. Push to GHCR (completes missing step)

# Option B: Manual push (if workflow cannot be re-run)
# 1. Checkout release commit
git checkout v6.0.0

# 2. Build image locally
docker build -t ghcr.io/hgnc/pgnc-solr-client:v6.0.0 .

# 3. Login to GHCR
echo "$GHCR_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin

# 4. Push image
docker push ghcr.io/hgnc/pgnc-solr-client:v6.0.0
docker tag ghcr.io/hgnc/pgnc-solr-client:v6.0.0 ghcr.io/hgnc/pgnc-solr-client:latest
docker push ghcr.io/hgnc/pgnc-solr-client:latest
```

**Verification**:
```bash
# Confirm image is pullable
docker pull ghcr.io/hgnc/pgnc-solr-client:v6.0.0

# Verify tags
docker buildx imagetools inspect ghcr.io/hgnc/pgnc-solr-client:v6.0.0

# Check release is complete
gh release view v6.0.0
```

---

### Playbook 3: Fixing Version Calculation Bug

**Trigger**: Incorrect version calculated due to action bug

**Scenario**:
- Expected: `v7.1.0`
- Calculated: `v7.2.0` (skipped v7.1.0)

**Immediate Actions**:
```bash
# 1. Delete incorrect release (if already created)
gh release delete v7.2.0 --yes
git push origin :refs/tags/v7.2.0

# 2. Fix calculate-version action
cd .github/actions/calculate-version
# Edit index.js to fix bug

# 3. Test fix locally
npm test  # Run unit tests
node index.js  # Manual test

# 4. Commit fix
git commit -am "fix: correct version increment logic"
git push origin release

# 5. Trigger corrected release
# Workflow will now calculate v7.1.0
```

**Prevention**:
- [ ] Add unit test covering bug scenario
- [ ] Implement version validation (no skipping)
- [ ] Code review for action changes

---

### Playbook 4: Resolving GHCR Authentication Issues

**Trigger**: Workflow fails to push image due to auth errors

**Common Causes**:
1. Token expired
2. Token missing `packages: write` scope
3. Repository not allowed to publish to package
4. Organization policy blocking workflow access

**Diagnosis**:
```bash
# Test token validity
gh auth status

# Test GHCR login manually
echo "$GHCR_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin

# Check token scopes
gh api user --jq '.permissions'

# Verify package permissions
gh api /orgs/HGNC/packages/container/pgnc-solr-client
```

**Resolution Matrix**:

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Invalid/expired token | Regenerate token, update secret |
| 403 Forbidden | Insufficient scopes | Add `packages: write` scope |
| 403 Forbidden | Repo not allowed | Add repo to package allowed list |
| 403 Forbidden | Org policy | Org admin: Enable workflow package publishing |

**Steps**:
```bash
# 1. Regenerate PAT with correct scopes
# Visit: https://github.com/settings/tokens
# Scopes needed: repo, packages:write

# 2. Update repository secret
gh secret set GHCR_TOKEN --body "ghp_NEW_TOKEN_HERE"

# 3. Verify package permissions
# Navigate to package → Settings → Manage Actions access
# Ensure repository is in allowed list

# 4. Re-run workflow
gh run rerun <run-id>
```

---

## Post-Incident Procedures

### Incident Documentation Template

```markdown
# Release Pipeline Incident Report

**Incident ID**: INC-20251016-001
**Date**: 2025-10-16
**Severity**: [Critical/High/Medium/Low]
**Status**: [Investigating/Resolved/Monitoring]

## Summary
Brief description of what went wrong.

## Timeline
- **HH:MM** - Issue first detected
- **HH:MM** - Investigation began
- **HH:MM** - Root cause identified
- **HH:MM** - Fix implemented
- **HH:MM** - Service restored

## Impact
- Affected version(s):
- Downtime duration:
- Users/systems impacted:

## Root Cause
Detailed technical explanation.

## Resolution
Steps taken to resolve.

## Prevention
Measures to prevent recurrence:
- [ ] Code changes
- [ ] Process changes
- [ ] Documentation updates
- [ ] Monitoring improvements

## Lessons Learned
Key takeaways from the incident.
```

### Post-Incident Checklist

After any failure:

- [ ] Document incident using template above
- [ ] Update this failure scenarios document if new failure mode discovered
- [ ] Add automated test to prevent regression
- [ ] Update monitoring/alerting if gaps identified
- [ ] Review and update runbooks
- [ ] Conduct blameless postmortem (if severe)
- [ ] Share learnings with team

### Continuous Improvement

- Monthly: Review incident log for patterns
- Quarterly: Update failure test suite
- After major incidents: Revise recovery playbooks
- Annually: Full pipeline resilience audit

---

## Appendix: Quick Reference

### Common Error Codes

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| 401 | Unauthorized | Invalid/expired token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 422 | Unprocessable | Invalid request data |
| 429 | Too Many Requests | Rate limited |
| 500 | Internal Server Error | GitHub/GHCR issue |
| 503 | Service Unavailable | Temporary outage |

### Diagnostic Commands

```bash
# Check GitHub API status
gh api /status

# View workflow run details
gh run view <run-id> --log

# List recent releases
gh release list --limit 10

# Check GHCR package versions
gh api /orgs/HGNC/packages/container/pgnc-solr-client/versions

# Test Docker build locally
docker build -t test:local .

# Verify token scopes
gh auth status

# Check rate limits
gh api rate_limit
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-16  
**Review After Each Incident**: Yes  
**Owner**: DevOps Team
