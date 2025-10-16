# Staging Environment Setup for Release Pipeline Testing

Comprehensive guide for setting up an isolated staging environment to test the Solr Client release pipeline without impacting production.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Option A: Dedicated Test Repository](#option-a-dedicated-test-repository)
4. [Option B: Forked Repository](#option-b-forked-repository)
5. [Option C: Protected Branch Strategy](#option-c-protected-branch-strategy)
6. [Environment Configuration](#environment-configuration)
7. [GHCR Staging Setup](#ghcr-staging-setup)
8. [Test Data Preparation](#test-data-preparation)
9. [Workflow Isolation](#workflow-isolation)
10. [Validation & Smoke Tests](#validation--smoke-tests)
11. [Cleanup Procedures](#cleanup-procedures)
12. [Troubleshooting](#troubleshooting)

---

## Overview

### Purpose

Provide a safe, production-like environment where the release pipeline can be executed, tested, and validated without:
- Creating releases in the main repository
- Publishing images to production GHCR namespace
- Affecting downstream consumers

### Goals

- **Isolation**: Complete separation from production artifacts
- **Fidelity**: Environment mirrors production setup as closely as possible
- **Repeatability**: Tests can be run multiple times with consistent results
- **Safety**: No risk of accidental production deployments

---

## Prerequisites

### Required Access & Permissions

- [ ] GitHub organization admin or repository admin access
- [ ] Ability to create repositories in HGNC organization (or personal account for Option B)
- [ ] GHCR package administration rights
- [ ] GitHub Actions workflows enabled
- [ ] Docker installed locally for image verification

### Required Secrets & Tokens

| Secret Name | Scope Required | Purpose |
|-------------|----------------|---------|
| `GITHUB_TOKEN` | `contents: write`, `packages: write` | Default workflow token |
| `GH_PAT` | Same as above | Fallback personal access token |
| `GHCR_TOKEN` | `packages: write` | GHCR authentication |

### Tools Installation

```bash
# GitHub CLI
brew install gh

# Docker (for local testing)
# Already installed - verify:
docker --version

# jq (JSON processing)
brew install jq

# Optional: act (local GitHub Actions testing)
brew install act
```

---

## Option A: Dedicated Test Repository

**Best for**: Comprehensive, long-term staging environment with full control.

### Step 1: Create Test Repository

```bash
# Using GitHub CLI
gh repo create HGNC/pgnc-solr-client-staging \
  --public \
  --description "Staging environment for solr-client release pipeline testing" \
  --clone

cd pgnc-solr-client-staging
```

**Manual Alternative**:
1. Navigate to https://github.com/organizations/HGNC/repositories/new
2. Repository name: `pgnc-solr-client-staging`
3. Visibility: Public (or Private if org policy requires)
4. Initialize with README: No (we'll copy from production)

### Step 2: Mirror Production Codebase

```bash
# Add production repo as remote
git remote add production https://github.com/HGNC/pgnc-solr-client.git

# Fetch production code
git fetch production

# Merge production release branch
git checkout -b release
git merge production/release --allow-unrelated-histories

# Push to staging repo
git push origin release
```

### Step 3: Configure Repository Settings

#### Branch Protection
```bash
# Protect release branch (via UI or API)
gh api repos/HGNC/pgnc-solr-client-staging/branches/release/protection \
  -X PUT \
  -f required_status_checks[strict]=true \
  -f required_status_checks[contexts][]=validate_inputs \
  -f required_status_checks[contexts][]=calculate_version \
  -f enforce_admins=false \
  -f required_pull_request_reviews=null \
  -f restrictions=null
```

#### Package Settings
1. Navigate to: Repository → Settings → Actions → General
2. Workflow permissions: **Read and write permissions**
3. Allow GitHub Actions to create and approve pull requests: ✓

---

## Option B: Forked Repository

**Best for**: Quick testing without creating organizational repos.

### Step 1: Fork Repository

```bash
# Fork to personal account
gh repo fork HGNC/pgnc-solr-client --clone --remote

cd pgnc-solr-client
```

**Configuration**:
- Fork will be at: `https://github.com/YOUR_USERNAME/pgnc-solr-client`
- Workflows copy automatically
- GHCR namespace becomes: `ghcr.io/YOUR_USERNAME/pgnc-solr-client`

### Step 2: Enable GitHub Actions

Forked repositories have Actions disabled by default:

1. Navigate to fork → Actions tab
2. Click "I understand my workflows, go ahead and enable them"

### Step 3: Configure Secrets

Secrets do NOT copy from upstream:

```bash
# Set required secrets
gh secret set GH_PAT --body "ghp_YOUR_TOKEN_HERE"
gh secret set GHCR_TOKEN --body "ghp_YOUR_TOKEN_HERE"
```

### Limitations of Forks

- ⚠️ GHCR namespace different from production (images go to personal account)
- ⚠️ Cannot fully test org-level package settings
- ✅ Perfect for isolated workflow logic testing
- ✅ No org permissions required

---

## Option C: Protected Branch Strategy

**Best for**: Testing within production repo using isolated branches.

### Setup Protected Test Branch

```bash
cd /path/to/pgnc-solr-client

# Create test branch from release
git checkout release
git pull origin release
git checkout -b release-test

# Modify workflow to trigger on release-test branch
```

### Workflow Modification

Edit `.github/workflows/solr-client-release.yml`:

```yaml
on:
  push:
    branches:
      - release
      - release-test  # Add test branch
  workflow_dispatch:
    # ... existing inputs
```

### Tag Isolation

Prefix all test tags to avoid conflicts:

```javascript
// In calculate-version/index.js
const TAG_PREFIX = process.env.TEST_MODE === 'true' ? 'test-' : '';

// Output version becomes: test-v1.0.0 instead of v1.0.0
```

### GHCR Isolation

Update workflow to use test package name:

```yaml
env:
  REGISTRY: ghcr.io
  IMAGE_REPOSITORY: ${{ github.event_name == 'workflow_dispatch' && github.event.inputs.test_mode == 'true' && 'ghcr.io/hgnc/pgnc-solr-client-test' || 'ghcr.io/hgnc/pgnc-solr-client' }}
```

### Pros & Cons

**Pros**:
- Test in production repository
- Same organizational settings
- Minimal setup

**Cons**:
- Risk of accidental merge to production
- Test artifacts pollute production repo
- Requires careful branch management

---

## Environment Configuration

### Repository Secrets Setup

Navigate to: `Settings → Secrets and variables → Actions → New repository secret`

| Secret Name | Value Source | Notes |
|-------------|--------------|-------|
| `GH_PAT` | Personal access token | Scopes: `repo`, `packages:write`, `workflow` |
| `GHCR_TOKEN` | Same as GH_PAT or separate token | For GHCR authentication |

### Verify Workflow Permissions

```bash
# Check current permissions
gh api repos/HGNC/pgnc-solr-client-staging --jq '.permissions'

# Ensure Actions can write packages
# Settings → Actions → General → Workflow permissions → Read and write
```

### Environment Variables

For test-specific behavior, add to workflow:

```yaml
env:
  STAGING_MODE: true
  GHCR_REPOSITORY: ghcr.io/hgnc/pgnc-solr-client-staging
  TAG_PREFIX: staging-
```

---

## GHCR Staging Setup

### Option 1: Separate Package Name

Recommended approach - publish to distinct package.

**Workflow Change**:
```yaml
env:
  IMAGE_REPOSITORY: ghcr.io/hgnc/pgnc-solr-client-staging
```

**Benefits**:
- Complete isolation from production images
- Easy to identify test artifacts
- Safe to delete entire package

### Option 2: Tag Prefix Strategy

Use same package but different tags.

**Tags**:
- Production: `v1.0.0`, `latest`, `release`
- Staging: `staging-v1.0.0`, `staging-latest`, `staging-release`

**Implementation**:
```yaml
tags: |
  ${{ env.IMAGE_REPOSITORY }}:staging-${{ needs.calculate_version.outputs.next_version }}
  ${{ env.IMAGE_REPOSITORY }}:staging-latest
  ${{ env.IMAGE_REPOSITORY }}:staging-release
```

### Package Visibility Settings

1. Navigate to: https://github.com/orgs/HGNC/packages/container/pgnc-solr-client-staging/settings
2. Visibility: **Public** (for testing) or **Private** (matches production)
3. Manage Actions access: Ensure staging repo can write

### Cleanup Policy

Configure automatic deletion of old staging images:

1. Package settings → Manage versions
2. Add version retention rule:
   - Delete versions older than: **7 days**
   - Keep at least: **3 most recent versions**
   - Pattern to match: `staging-*`

---

## Test Data Preparation

### Seeding Initial Tags

For non-bootstrap testing, seed repository with tags:

```bash
cd pgnc-solr-client-staging

# Create initial tag history
git tag v0.1.0
git push origin v0.1.0

git tag v0.2.0
git push origin v0.2.0

git tag v1.0.0
git push origin v1.0.0

# Verify tags
git tag -l
```

### Creating Test Commits

Generate commit history for release notes testing:

```bash
# Add commits with conventional commit messages
git commit --allow-empty -m "feat: add new feature X"
git commit --allow-empty -m "fix: resolve bug Y"
git commit --allow-empty -m "docs: update documentation"

git push origin release
```

### Simulating Production State

Match production repository state for accurate testing:

```bash
# Sync commit count
git rev-list --count origin/release

# Sync file structure
rsync -av --exclude='.git' \
  /path/to/production/solr-client/ \
  /path/to/staging/pgnc-solr-client-staging/
```

---

## Workflow Isolation

### Preventing Accidental Production Runs

Add safeguards to workflow file:

```yaml
jobs:
  validate_inputs:
    runs-on: ubuntu-latest
    steps:
      - name: Verify staging environment
        run: |
          if [[ "${GITHUB_REPOSITORY}" != "HGNC/pgnc-solr-client-staging" ]]; then
            echo "::error::This workflow should only run in staging repository"
            exit 1
          fi
```

### Concurrency Groups

Ensure staging runs don't interfere:

```yaml
concurrency:
  group: solr-client-release-staging-${{ github.ref }}
  cancel-in-progress: true
```

### Branch Restrictions

Limit workflow execution to specific branches:

```yaml
on:
  push:
    branches:
      - release
      - 'test/**'  # Allow test branches
  workflow_dispatch:
    # Manual trigger allowed
```

---

## Validation & Smoke Tests

### Pre-Test Checklist

Before running test scenarios:

- [ ] Staging repository created and configured
- [ ] All secrets set correctly
- [ ] Workflow file syntax valid (`yamllint .github/workflows/*.yml`)
- [ ] Calculate-version action present
- [ ] Initial tags created (if testing non-bootstrap)
- [ ] Permissions validated

### Quick Smoke Test

Run minimal test to verify environment:

```bash
# Trigger bootstrap release
cd pgnc-solr-client-staging
git commit --allow-empty -m "test: trigger bootstrap release"
git push origin release

# Monitor workflow
gh run watch

# Verify outputs
gh release list
gh run view --log
```

**Expected Results**:
- Workflow completes successfully
- Release `v1.0.0` (or `staging-v1.0.0`) created
- Image pushed to GHCR
- Job summary displays metrics

### Validation Script

Create automated validation:

```bash
#!/bin/bash
# validate-staging.sh

set -euo pipefail

REPO="HGNC/pgnc-solr-client-staging"
VERSION="v1.0.0"  # Adjust as needed

echo "Validating staging environment..."

# 1. Check release exists
if ! gh release view "$VERSION" --repo "$REPO" >/dev/null 2>&1; then
  echo "❌ Release $VERSION not found"
  exit 1
fi
echo "✅ Release exists"

# 2. Check tag exists
if ! git ls-remote --tags origin | grep -q "refs/tags/$VERSION"; then
  echo "❌ Tag $VERSION not found"
  exit 1
fi
echo "✅ Tag exists"

# 3. Check GHCR image
IMAGE="ghcr.io/hgnc/pgnc-solr-client-staging:$VERSION"
if ! docker pull "$IMAGE" >/dev/null 2>&1; then
  echo "❌ Image $IMAGE not pullable"
  exit 1
fi
echo "✅ Image pullable"

# 4. Verify image labels
LABELS=$(docker inspect "$IMAGE" --format='{{json .Config.Labels}}')
VERSION_LABEL=$(echo "$LABELS" | jq -r '."org.opencontainers.image.version"')
if [[ "$VERSION_LABEL" != "$VERSION" ]]; then
  echo "❌ Image version label mismatch: expected $VERSION, got $VERSION_LABEL"
  exit 1
fi
echo "✅ Image labels correct"

echo ""
echo "🎉 Staging environment validated successfully!"
```

Run validation:
```bash
chmod +x validate-staging.sh
./validate-staging.sh
```

---

## Cleanup Procedures

### Between Test Runs

Reset repository state for fresh tests:

```bash
# Delete all releases
for release in $(gh release list --repo HGNC/pgnc-solr-client-staging --limit 100 --json tagName --jq '.[].tagName'); do
  gh release delete "$release" --repo HGNC/pgnc-solr-client-staging --yes
done

# Delete all tags
git tag -l | xargs git tag -d
git push origin --delete $(git ls-remote --tags origin | awk '{print $2}' | sed 's|refs/tags/||')

# Or selectively delete test tags
git tag -l 'staging-*' | xargs git tag -d
git push origin --delete $(git ls-remote --tags origin | grep staging- | awk '{print $2}' | sed 's|refs/tags/||')
```

### GHCR Package Cleanup

```bash
# List all package versions
gh api /orgs/HGNC/packages/container/pgnc-solr-client-staging/versions \
  --jq '.[].id'

# Delete specific version
gh api -X DELETE /orgs/HGNC/packages/container/pgnc-solr-client-staging/versions/{version_id}

# Bulk delete (use with caution!)
gh api /orgs/HGNC/packages/container/pgnc-solr-client-staging/versions \
  --jq '.[].id' | while read id; do
  gh api -X DELETE /orgs/HGNC/packages/container/pgnc-solr-client-staging/versions/$id
done
```

### Complete Environment Teardown

When staging no longer needed:

```bash
# Delete repository (⚠️ IRREVERSIBLE)
gh repo delete HGNC/pgnc-solr-client-staging --yes

# Delete GHCR package
gh api -X DELETE /orgs/HGNC/packages/container/pgnc-solr-client-staging
```

---

## Troubleshooting

### Issue: Workflow not triggering

**Symptoms**:
- Push to `release` branch doesn't start workflow
- Actions tab shows no runs

**Diagnosis**:
```bash
# Check if Actions enabled
gh api repos/HGNC/pgnc-solr-client-staging --jq '.has_issues, .has_actions'

# Check workflow file exists
ls -la .github/workflows/
```

**Resolution**:
- Enable Actions: Settings → Actions → General → Allow all actions
- Verify workflow syntax: `yamllint .github/workflows/solr-client-release.yml`
- Check branch name matches trigger: `git branch --show-current`

---

### Issue: Permission denied pushing to GHCR

**Symptoms**:
- Build succeeds but push fails
- Error: "denied: permission_denied: write_package"

**Diagnosis**:
```bash
# Test GHCR authentication
echo "$GHCR_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin

# Check token scopes
gh auth status
```

**Resolution**:
- Verify `GHCR_TOKEN` has `packages: write` scope
- Ensure repository has permission to publish to GHCR package
- Check org-level package settings allow repository access

---

### Issue: Version calculation fails

**Symptoms**:
- `calculate_version` job fails
- Error accessing GitHub API

**Diagnosis**:
```bash
# Test token API access
gh api user

# Test repo access
gh api repos/HGNC/pgnc-solr-client-staging
```

**Resolution**:
- Ensure `GH_PAT` secret is set correctly
- Token needs `repo` scope for tag fetching
- Verify `calculate-version/index.js` exists and is valid

---

### Issue: Duplicate tag/release errors

**Symptoms**:
- Workflow fails: "Release vX.Y.Z already exists"
- Tag conflicts from previous test runs

**Resolution**:
```bash
# Check existing releases
gh release list --repo HGNC/pgnc-solr-client-staging

# Delete conflicting release
gh release delete vX.Y.Z --repo HGNC/pgnc-solr-client-staging --yes

# Delete conflicting tag
git push origin :refs/tags/vX.Y.Z
```

---

### Issue: Build cache not working

**Symptoms**:
- Every build is slow (cold cache)
- Cache hit rate 0%

**Diagnosis**:
```bash
# Check cache scope in workflow
grep "cache-from" .github/workflows/solr-client-release.yml
```

**Resolution**:
- Ensure cache scope is repository-specific
- Use: `cache-from: type=gha,scope=solr-client-staging`
- Verify Actions cache storage not full (Settings → Actions → Caches)

---

## Best Practices

### Regular Maintenance

- **Weekly**: Review and delete old test releases/tags
- **Monthly**: Validate staging environment still mirrors production setup
- **Per-release**: Run full test suite before production deployment

### Documentation

- Keep staging setup docs synchronized with production
- Document any differences between staging and production
- Maintain changelog of staging environment changes

### Security

- Rotate test tokens monthly
- Use separate tokens for staging (not production tokens)
- Restrict who can trigger staging workflows
- Audit staging workflow runs regularly

### Cost Management

- Delete unused GHCR images (automatic retention policy)
- Limit Actions minutes usage (set spending limits)
- Monitor storage usage for packages and caches

---

## Quick Reference Commands

```bash
# Create staging repo
gh repo create HGNC/pgnc-solr-client-staging --public --clone

# Trigger workflow manually
gh workflow run solr-client-release.yml --repo HGNC/pgnc-solr-client-staging

# Watch workflow execution
gh run watch --repo HGNC/pgnc-solr-client-staging

# List releases
gh release list --repo HGNC/pgnc-solr-client-staging

# Pull staging image
docker pull ghcr.io/hgnc/pgnc-solr-client-staging:v1.0.0

# Cleanup all releases
gh release list --repo HGNC/pgnc-solr-client-staging --limit 100 --json tagName \
  --jq '.[].tagName' | xargs -I {} gh release delete {} --repo HGNC/pgnc-solr-client-staging --yes

# Delete all tags
git tag -l | xargs git tag -d && git push origin --delete $(git ls-remote --tags origin | awk '{print $2}' | sed 's|refs/tags/||')
```

---

## Next Steps

1. Choose staging strategy (Option A, B, or C)
2. Execute setup steps for chosen option
3. Run smoke test to validate environment
4. Proceed to test scenario execution (see [test-scenarios.md](./test-scenarios.md))
5. Document any staging-specific configurations

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-16  
**Maintained By**: DevOps Team  
**Review Frequency**: Quarterly or after major pipeline changes
