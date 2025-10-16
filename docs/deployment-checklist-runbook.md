# Production Deployment Checklist and Runbook

Comprehensive guide for deploying Solr Client releases to production with safety checks, rollback procedures, and operational best practices.

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Execution](#deployment-execution)
4. [Post-Deployment Verification](#post-deployment-verification)
5. [Rollback Procedures](#rollback-procedures)
6. [Operational Runbooks](#operational-runbooks)
7. [Common Issues & Resolutions](#common-issues--resolutions)
8. [Emergency Contacts](#emergency-contacts)

---

## Overview

### Purpose

This document provides step-by-step procedures for safely deploying Solr Client releases from development through production, including verification steps and rollback plans.

### Deployment Pipeline Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Development │────▶│   Staging    │────▶│   Pre-Prod   │────▶│  Production  │
│    (dev)     │     │  (staging)   │     │  (preprod)   │     │    (prod)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
      │                     │                     │                     │
      │                     │                     │                     │
   Feature             Integration            Final             Live
   Testing              Testing             Validation         Traffic
```

### Deployment Principles

1. **Never deploy to production on Friday** (unless emergency hotfix)
2. **Always test in staging first**
3. **Deploy during low-traffic windows** (configure per timezone)
4. **Have rollback plan ready before deployment**
5. **Monitor actively for 30 minutes post-deployment**
6. **Document all changes in release notes**

### Roles & Responsibilities

| Role | Responsibility | Required for Production |
|------|----------------|------------------------|
| Release Manager | Overall deployment coordination | Yes |
| DevOps Engineer | Execute deployment, monitoring | Yes |
| QA Lead | Verify deployment success | Recommended |
| Product Owner | Business approval | For major releases |
| On-call Engineer | Incident response if needed | Yes (standby) |

---

## Pre-Deployment Checklist

### Phase 1: Release Preparation (T-24 hours)

#### 1.1 Verify Release Candidate

- [ ] **Release tagged in GitHub**: Version `vX.Y.Z` exists
  ```bash
  gh release view vX.Y.Z --repo HGNC/pgnc-solr-client
  ```

- [ ] **Docker image built and pushed to GHCR**
  ```bash
  docker pull ghcr.io/hgnc/pgnc-solr-client:vX.Y.Z
  ```

- [ ] **Image tagged as `latest` and `release`**
  ```bash
  docker buildx imagetools inspect ghcr.io/hgnc/pgnc-solr-client:vX.Y.Z
  ```

- [ ] **Multi-architecture support verified** (`linux/amd64` and `linux/arm64`)
  ```bash
  docker manifest inspect ghcr.io/hgnc/pgnc-solr-client:vX.Y.Z
  ```

#### 1.2 Review Release Content

- [ ] **Release notes reviewed** and approved
  - Navigate to: `https://github.com/HGNC/pgnc-solr-client/releases/tag/vX.Y.Z`
  - Check for breaking changes
  - Verify dependency updates noted

- [ ] **Changelog updated** (if maintained separately from release notes)

- [ ] **Known issues documented**

- [ ] **Migration steps identified** (if database/config changes required)

#### 1.3 Staging Validation

- [ ] **Deploy to staging environment**
  ```bash
  # Update staging docker-compose.yml or k8s deployment
  # Set image: ghcr.io/hgnc/pgnc-solr-client:vX.Y.Z
  ```

- [ ] **Run integration test suite** (see [test-scenarios.md](./test-scenarios.md))
  - All critical paths tested
  - Performance benchmarks met
  - No regressions detected

- [ ] **Staging environment smoke tests passed**
  - Health check endpoint: `/health` returns 200 OK
  - Solr queries returning expected results
  - API endpoints responsive

- [ ] **Load testing completed** (if major release)
  - Simulate production traffic levels
  - Verify resource usage acceptable
  - No memory leaks observed

#### 1.4 Security & Compliance

- [ ] **Security scan passed** (no critical vulnerabilities)
  ```bash
  # Using Snyk, Trivy, or similar
  trivy image ghcr.io/hgnc/pgnc-solr-client:vX.Y.Z
  ```

- [ ] **Dependency audit clean**
  ```bash
  npm audit --production
  ```

- [ ] **Secrets/credentials not exposed** in image or logs

- [ ] **Compliance requirements met** (if applicable)

#### 1.5 Infrastructure Readiness

- [ ] **Production environment healthy**
  - All services running
  - No ongoing incidents
  - Resource capacity sufficient

- [ ] **Database migrations tested** (if applicable)
  - Backup created
  - Migration scripts validated in staging
  - Rollback procedure documented

- [ ] **Configuration updated** (environment variables, config files)

- [ ] **Dependencies available**
  - External APIs accessible
  - Third-party services operational

#### 1.6 Team Coordination

- [ ] **Deployment window scheduled** and communicated
  - Date/time confirmed
  - Stakeholders notified
  - On-call schedule verified

- [ ] **Change request/ticket created** (if required by process)
  - Change ID: `CHG-XXXXXX`
  - Approvals obtained

- [ ] **Rollback plan documented** (see [Rollback Procedures](#rollback-procedures))

- [ ] **Communication plan ready**
  - Status page updated (if maintenance window)
  - Users notified (if downtime expected)

---

### Phase 2: Pre-Deployment (T-1 hour)

#### 2.1 Final Checks

- [ ] **Re-verify image integrity**
  ```bash
  docker pull ghcr.io/hgnc/pgnc-solr-client:vX.Y.Z
  docker inspect ghcr.io/hgnc/pgnc-solr-client:vX.Y.Z --format='{{.RepoDigests}}'
  ```

- [ ] **Confirm no blockers** in monitoring/alerts

- [ ] **Production backup created**
  - Database snapshot (if applicable)
  - Configuration backup
  - Previous image version noted

#### 2.2 Team Readiness

- [ ] **All deployment personnel online**
  - Release Manager
  - DevOps Engineer
  - On-call Engineer (standby)

- [ ] **Communication channels open**
  - Slack/Teams channel active
  - Video call ready (if needed)
  - Emergency contacts available

- [ ] **Runbook accessible** (this document)

---

## Deployment Execution

### Step-by-Step Deployment Procedure

#### Step 1: Notify Stakeholders (T=0)

```bash
# Post to status page/slack
echo "🚀 Deployment of solr-client v${VERSION} starting at $(date)"
```

**Communication Template**:
> **Deployment Starting**  
> Version: `vX.Y.Z`  
> Estimated Duration: 15 minutes  
> Expected Downtime: None (rolling update) / X minutes  
> Rollback Plan: Available

#### Step 2: Enable Maintenance Mode (If Required)

```bash
# If deployment requires downtime
# Set load balancer to maintenance page
# OR set application to read-only mode
```

⚠️ **Skip if rolling deployment with no downtime**

#### Step 3: Deploy New Version

**Option A: Docker Compose (Simple Deployment)**

```bash
# Navigate to deployment directory
cd /path/to/production/deployment

# Backup current docker-compose.yml
cp docker-compose.yml docker-compose.yml.backup

# Update image version
sed -i.bak "s|ghcr.io/hgnc/pgnc-solr-client:.*|ghcr.io/hgnc/pgnc-solr-client:v${VERSION}|g" docker-compose.yml

# Pull new image
docker-compose pull solr-client

# Restart service (rolling update if multiple replicas)
docker-compose up -d solr-client

# Wait for healthy status
timeout 120 bash -c 'until docker-compose ps solr-client | grep -q "healthy"; do sleep 2; done'
```

**Option B: Kubernetes (Orchestrated Deployment)**

```bash
# Update deployment manifest
kubectl set image deployment/solr-client \
  solr-client=ghcr.io/hgnc/pgnc-solr-client:v${VERSION} \
  --namespace=production

# Watch rollout
kubectl rollout status deployment/solr-client --namespace=production

# Verify pods running
kubectl get pods -l app=solr-client --namespace=production
```

**Option C: Cloud Provider (AWS ECS, GCP Cloud Run, etc.)**

```bash
# Example for AWS ECS
aws ecs update-service \
  --cluster production-cluster \
  --service solr-client \
  --task-definition solr-client:${TASK_DEF_REVISION} \
  --force-new-deployment

# Monitor deployment
aws ecs wait services-stable \
  --cluster production-cluster \
  --services solr-client
```

#### Step 4: Run Database Migrations (If Required)

```bash
# Only if release includes schema changes
# Ensure backup created in Phase 2

# Run migrations
docker exec solr-client-prod npm run migrate

# Verify migration success
docker exec solr-client-prod npm run migrate:status
```

#### Step 5: Warm Up Caches (If Applicable)

```bash
# Prime application caches
curl -X POST https://solr-client.production/api/admin/warm-cache

# Pre-load frequently accessed data
```

#### Step 6: Disable Maintenance Mode

```bash
# Re-enable traffic
# Update load balancer to route to new version
# OR disable read-only mode
```

#### Step 7: Verify Deployment

Quick verification immediately after deployment:

```bash
# Check health endpoint
curl -f https://solr-client.production/health || echo "❌ Health check failed"

# Verify version
curl -s https://solr-client.production/api/version | jq -r '.version'
# Expected output: vX.Y.Z

# Test critical endpoint
curl -f https://solr-client.production/api/search?q=test || echo "❌ Search failed"
```

---

## Post-Deployment Verification

### Immediate Verification (T+5 min)

#### Application Health

- [ ] **Health check returning 200 OK**
  ```bash
  curl -f https://solr-client.production/health
  ```

- [ ] **Version endpoint correct**
  ```bash
  curl https://solr-client.production/api/version | jq
  # Verify version matches deployed vX.Y.Z
  ```

- [ ] **No error spikes in logs**
  ```bash
  # Check last 5 minutes of logs
  kubectl logs -l app=solr-client --since=5m --tail=100 | grep -i error
  ```

#### Service Functionality

- [ ] **Critical user journeys functional**
  - Search query works
  - Data retrieval successful
  - Filters/facets working

- [ ] **API response times acceptable**
  ```bash
  # Check p50, p95, p99 latencies
  # Use your monitoring tool (Datadog, New Relic, etc.)
  ```

- [ ] **No 5xx errors** in application logs or monitoring

#### Infrastructure

- [ ] **CPU usage normal** (<70% average)

- [ ] **Memory usage normal** (<80% of limit)

- [ ] **Network connectivity healthy**

- [ ] **Database connections stable**

---

### Extended Monitoring (T+30 min)

- [ ] **Error rate baseline** (compare to pre-deployment)
  - Target: No increase in error rate
  - Alert if >1% increase

- [ ] **Request throughput stable**
  - Handling expected traffic volume
  - No significant drop in requests

- [ ] **Response time degradation check**
  - p95 latency within acceptable range
  - No timeouts reported

- [ ] **Resource usage trends**
  - CPU/Memory not climbing unexpectedly
  - No memory leaks detected

---

### Sign-Off (T+1 hour)

- [ ] **All verification checks passed**

- [ ] **No incidents reported**

- [ ] **Monitoring dashboards green**

- [ ] **Deployment documented**
  - Version deployed: `vX.Y.Z`
  - Deployment time: `YYYY-MM-DD HH:MM UTC`
  - Deployed by: `[Name]`
  - Incident tickets: `None` / `[Ticket IDs]`

**Deployment Complete Notification**:
```bash
echo "✅ Deployment of solr-client v${VERSION} completed successfully at $(date)"
```

---

## Rollback Procedures

### When to Rollback

Rollback immediately if:
- **Critical functionality broken** (search not working, data loss, etc.)
- **Error rate >5%** sustained for >5 minutes
- **Performance degradation >50%** in key metrics
- **Security vulnerability detected** in deployed version
- **Incidents affecting >10% of users**

### Rollback Decision Tree

```
Incident Detected
      │
      ├─ Critical? ────────────────────────────────────────▶ Immediate Rollback
      │   (User-facing, data loss, security)
      │
      ├─ High Impact? ─────────────────────────────────────▶ Assess and Decide
      │   (Performance degradation, partial functionality)    (15 min window)
      │                                                        │
      │                                                        ├─ Fixable quickly? → Hotfix
      │                                                        └─ Complex? → Rollback
      │
      └─ Low Impact? ──────────────────────────────────────▶ Monitor and Plan Fix
          (Minor bugs, edge cases)                           (Next release)
```

### Rollback Procedure

#### Fast Rollback (5-10 minutes)

**Option A: Docker Compose**

```bash
cd /path/to/production/deployment

# Identify previous version
PREV_VERSION=$(docker inspect solr-client-prod --format='{{.Config.Image}}' | cut -d: -f2)

# Or manually specify
PREV_VERSION="v1.2.3"  # Last known good version

# Update docker-compose.yml
sed -i.bak "s|ghcr.io/hgnc/pgnc-solr-client:.*|ghcr.io/hgnc/pgnc-solr-client:${PREV_VERSION}|g" docker-compose.yml

# Pull previous image (should be in cache)
docker-compose pull solr-client

# Restart with previous version
docker-compose up -d solr-client

# Verify rollback
curl https://solr-client.production/api/version | jq -r '.version'
# Should show PREV_VERSION
```

**Option B: Kubernetes**

```bash
# Rollback to previous deployment
kubectl rollout undo deployment/solr-client --namespace=production

# Watch rollback
kubectl rollout status deployment/solr-client --namespace=production

# Verify
kubectl get pods -l app=solr-client --namespace=production
```

**Option C: Re-tag Latest**

```bash
# Quick rollback by re-pointing 'latest' tag
docker pull ghcr.io/hgnc/pgnc-solr-client:v${PREV_VERSION}
docker tag ghcr.io/hgnc/pgnc-solr-client:v${PREV_VERSION} ghcr.io/hgnc/pgnc-solr-client:latest
docker push ghcr.io/hgnc/pgnc-solr-client:latest

# Trigger deployment update to pull latest
# (deployment configured to pull 'latest' tag)
```

#### Post-Rollback Actions

- [ ] **Verify services healthy** (repeat post-deployment checks)

- [ ] **Notify stakeholders** of rollback
  ```
  ⚠️ Rollback executed
  From: vX.Y.Z
  To: vX.Y.W (previous stable)
  Reason: [Brief explanation]
  Status: Investigating
  ```

- [ ] **Create incident ticket** for root cause analysis

- [ ] **Schedule post-mortem** (for critical rollbacks)

- [ ] **Document lessons learned**

#### Database Rollback (If Migrations Were Applied)

⚠️ **High Risk - Only if absolutely necessary**

```bash
# Restore database backup
pg_restore -d production_db /backups/pre-deployment-$(date +%Y%m%d).dump

# OR revert migrations
docker exec solr-client-prod npm run migrate:undo
```

**Caution**:
- Data created after deployment may be lost
- Coordinate with data team
- Notify affected users

---

## Operational Runbooks

### Runbook 1: Hotfix Deployment

**Scenario**: Critical bug discovered, requires immediate fix.

**Prerequisites**:
- Hotfix branch created from production tag
- Fix tested in staging
- Approval from Release Manager

**Procedure**:

```bash
# 1. Create hotfix release
cd /path/to/pgnc-solr-client
git checkout vX.Y.Z  # Current production version
git checkout -b hotfix/vX.Y.Z+1

# 2. Apply fix and test locally
# ... make changes ...
npm test

# 3. Commit and push
git commit -am "hotfix: critical bug fix"
git push origin hotfix/vX.Y.Z+1

# 4. Trigger release workflow with explicit version
gh workflow run solr-client-release.yml \
  --field explicit_version=vX.Y.Z+1 \
  --field notes_override="Hotfix: [Description of fix]"

# 5. Wait for workflow completion
gh run watch

# 6. Deploy hotfix (skip staging validation)
# Follow standard deployment procedure
```

**Post-Hotfix**:
- Merge hotfix back into `release` branch
- Document in incident report
- Plan long-term fix if hotfix is temporary

---

### Runbook 2: Blue-Green Deployment

**Scenario**: Zero-downtime deployment for major releases.

**Setup**:
- Blue environment: Current production (vX.Y.Z)
- Green environment: New version (vX.Y+1.0)

**Procedure**:

```bash
# 1. Deploy to Green environment
kubectl apply -f deployment-green.yaml
# (Green environment runs new version in parallel)

# 2. Warm up Green environment
curl -X POST https://green.solr-client.production/api/admin/warm-cache

# 3. Run smoke tests against Green
./scripts/smoke-test.sh https://green.solr-client.production

# 4. Switch traffic to Green (gradual canary)
# a. 10% traffic to Green
kubectl patch service solr-client -p '{"spec":{"selector":{"version":"green","weight":"10"}}}'
sleep 300  # Monitor for 5 minutes

# b. 50% traffic to Green
kubectl patch service solr-client -p '{"spec":{"selector":{"version":"green","weight":"50"}}}'
sleep 300  # Monitor for 5 minutes

# c. 100% traffic to Green
kubectl patch service solr-client -p '{"spec":{"selector":{"version":"green"}}}'

# 5. Keep Blue running for quick rollback (30 min)
sleep 1800

# 6. Decommission Blue if no issues
kubectl delete -f deployment-blue.yaml
```

**Rollback**: Simply switch traffic back to Blue environment.

---

### Runbook 3: Emergency Stop

**Scenario**: Catastrophic failure, need to stop service immediately.

**Warning**: This causes downtime. Use only for critical security issues or data integrity threats.

```bash
# Docker Compose
docker-compose stop solr-client

# Kubernetes
kubectl scale deployment/solr-client --replicas=0 --namespace=production

# Enable maintenance page
# (Configure load balancer to show static page)

# Investigate and fix
# ... root cause analysis ...

# Restart when safe
docker-compose start solr-client
# OR
kubectl scale deployment/solr-client --replicas=3 --namespace=production
```

---

### Runbook 4: Scale Up/Down

**Scenario**: Traffic surge or maintenance window.

**Scale Up**:
```bash
# Kubernetes
kubectl scale deployment/solr-client --replicas=10 --namespace=production

# Docker Compose (if using swarm/stack)
docker service scale solr-client=10
```

**Scale Down**:
```bash
# Return to normal
kubectl scale deployment/solr-client --replicas=3 --namespace=production
```

**Auto-scaling** (if configured):
```yaml
# HPA configuration
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: solr-client-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: solr-client
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

### Runbook 5: Configuration Update (No Code Change)

**Scenario**: Update environment variables or config without redeploying code.

**Procedure**:

```bash
# Update ConfigMap (Kubernetes)
kubectl edit configmap solr-client-config --namespace=production

# Restart pods to pick up new config
kubectl rollout restart deployment/solr-client --namespace=production

# OR update docker-compose.yml env vars
# and restart
docker-compose up -d solr-client

# Verify new config applied
curl https://solr-client.production/api/config | jq
```

---

## Common Issues & Resolutions

### Issue 1: Image Pull Failure

**Symptoms**:
- Deployment stuck
- Error: "Failed to pull image"

**Diagnosis**:
```bash
# Test image availability
docker pull ghcr.io/hgnc/pgnc-solr-client:vX.Y.Z

# Check credentials
docker login ghcr.io
```

**Resolution**:
```bash
# Re-authenticate to GHCR
echo "$GHCR_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin

# Retry deployment
docker-compose up -d solr-client
```

---

### Issue 2: Health Check Failing

**Symptoms**:
- Container restarting
- Health endpoint returns 500

**Diagnosis**:
```bash
# Check container logs
docker logs solr-client-prod

# Test health endpoint
curl -v https://solr-client.production/health
```

**Resolution**:
- Review logs for startup errors
- Verify dependencies (Solr, database) are accessible
- Check environment variables configured correctly
- Increase health check timeout if startup is slow

---

### Issue 3: Database Connection Errors

**Symptoms**:
- Application logs: "ECONNREFUSED" or "Connection timeout"

**Diagnosis**:
```bash
# Test database connectivity
docker exec solr-client-prod nc -zv postgres-host 5432

# Check connection string
docker exec solr-client-prod env | grep DATABASE_URL
```

**Resolution**:
```bash
# Verify database is running
docker-compose ps postgres  # OR kubectl get pods postgres

# Check network connectivity
# Ensure solr-client can reach database host

# Verify credentials
# Double-check DATABASE_URL format and credentials
```

---

### Issue 4: Performance Degradation

**Symptoms**:
- Slow response times
- Timeout errors
- CPU/Memory high

**Diagnosis**:
```bash
# Check resource usage
docker stats solr-client-prod

# Review slow query logs
docker logs solr-client-prod | grep -i "slow query"

# Profile application
# (Use APM tool: New Relic, Datadog APM, etc.)
```

**Resolution**:
- Scale horizontally (add replicas)
- Optimize slow queries
- Increase resource limits (if constrained)
- Enable caching for frequently accessed data

---

## Emergency Contacts

| Role | Name | Phone | Email | Slack |
|------|------|-------|-------|-------|
| Release Manager | [Name] | +1-XXX-XXX-XXXX | name@hgnc.org | @name |
| DevOps Lead | [Name] | +1-XXX-XXX-XXXX | name@hgnc.org | @name |
| On-Call Engineer | Rotation | See PagerDuty | oncall@hgnc.org | @oncall |
| Product Owner | [Name] | +1-XXX-XXX-XXXX | name@hgnc.org | @name |
| Database Admin | [Name] | +1-XXX-XXX-XXXX | name@hgnc.org | @name |

**Escalation Path**:
1. On-Call Engineer (first responder)
2. DevOps Lead (if on-call needs support)
3. Release Manager (for rollback decisions)
4. Product Owner (for business impact decisions)

**Communication Channels**:
- **Incidents**: #incidents (Slack)
- **Deployments**: #deployments (Slack)
- **Status Page**: https://status.hgnc.org
- **PagerDuty**: https://hgnc.pagerduty.com

---

## Appendix: Quick Reference Commands

```bash
# Health check
curl -f https://solr-client.production/health

# Version check
curl https://solr-client.production/api/version | jq -r '.version'

# View logs (last 100 lines)
kubectl logs -l app=solr-client --tail=100 --namespace=production

# Restart service
kubectl rollout restart deployment/solr-client --namespace=production

# Rollback to previous version
kubectl rollout undo deployment/solr-client --namespace=production

# Scale replicas
kubectl scale deployment/solr-client --replicas=5 --namespace=production

# Check deployment status
kubectl rollout status deployment/solr-client --namespace=production

# Pull latest image
docker pull ghcr.io/hgnc/pgnc-solr-client:latest

# Cleanup old images
docker image prune -a --filter "until=168h"  # 7 days
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-16  
**Review Schedule**: After each production deployment  
**Owner**: DevOps Team  
**Approval**: Release Manager
