# Monitoring and Alerting Setup for Release Pipeline

Comprehensive guide for monitoring the Solr Client release pipeline workflow execution, setting up alerts for failures, and tracking key performance indicators.

## Table of Contents

1. [Overview](#overview)
2. [Monitoring Architecture](#monitoring-architecture)
3. [GitHub Actions Workflow Monitoring](#github-actions-workflow-monitoring)
4. [Alert Configuration](#alert-configuration)
5. [Metrics Collection](#metrics-collection)
6. [Dashboards](#dashboards)
7. [Notification Channels](#notification-channels)
8. [SLA/SLO Definitions](#slaslo-definitions)
9. [Incident Response Integration](#incident-response-integration)
10. [Appendix](#appendix)

---

## Overview

### Purpose

Establish proactive monitoring and alerting for the release pipeline to:
- Detect workflow failures immediately
- Track release pipeline performance
- Identify bottlenecks and optimization opportunities
- Ensure SLA compliance for release processes
- Enable rapid incident response

### Monitoring Objectives

| Objective | Target | Priority |
|-----------|--------|----------|
| Workflow failure detection | <2 minutes | Critical |
| Release success rate | >99% | High |
| Average workflow duration | <7 minutes | Medium |
| Time to detect issues | <5 minutes | High |
| Alert fatigue (false positives) | <5% | Medium |

### Key Principles

1. **Monitor What Matters**: Focus on actionable metrics
2. **Alert on Symptoms, Not Causes**: Detect user impact first
3. **Clear Ownership**: Every alert has a responsible team/person
4. **Runbook Required**: Every alert links to remediation steps
5. **Regular Review**: Weekly review of alert effectiveness

---

## Monitoring Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  GitHub Actions Workflow                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Validate │→ │Calculate │→ │  Create  │→ │Build/Push│  │
│  │  Inputs  │  │ Version  │  │ Release  │  │  Image   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│        │             │             │             │         │
│        └─────────────┴─────────────┴─────────────┘         │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           │ Webhook/API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               Monitoring & Alerting Layer                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   GitHub     │  │  PagerDuty/  │  │   Datadog/   │     │
│  │  Webhooks    │→ │   Opsgenie   │→ │   Grafana    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                  │             │
│         │                  ▼                  ▼             │
│         │          ┌──────────────┐  ┌──────────────┐     │
│         │          │    Slack/    │  │  Dashboard   │     │
│         └─────────→│    Email     │  │   Metrics    │     │
│                    └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **Data Sources**:
   - GitHub Actions workflow runs (via GitHub API)
   - GitHub webhooks for real-time events
   - Workflow job summaries
   - GHCR API for image metadata

2. **Collection Layer**:
   - GitHub Actions webhook receiver
   - Scheduled polling scripts
   - Custom metrics exporters

3. **Processing & Storage**:
   - Time-series database (Prometheus, InfluxDB, Datadog)
   - Event aggregation
   - Metric calculation

4. **Alerting Engine**:
   - Alert manager (PagerDuty, Opsgenie, Alertmanager)
   - Rule evaluation
   - Escalation policies

5. **Visualization**:
   - Grafana dashboards
   - GitHub Actions UI
   - Custom status pages

---

## GitHub Actions Workflow Monitoring

### Native GitHub Features

#### 1. GitHub Actions Status Badges

Add to repository README:

```markdown
[![Solr Client Release](https://github.com/HGNC/pgnc-solr-client/actions/workflows/solr-client-release.yml/badge.svg)](https://github.com/HGNC/pgnc-solr-client/actions/workflows/solr-client-release.yml)
```

**Benefits**:
- Quick visual status
- Links to workflow runs
- No setup required

#### 2. GitHub Notifications

Configure in repository settings:

1. Navigate to: `Settings → Notifications`
2. Enable: "Send notifications for failed workflows"
3. Recipients: Team members, mailing lists

**Limitations**:
- Email-only (no Slack/PagerDuty integration)
- Limited customization
- May be delayed

#### 3. GitHub Actions API Monitoring

Query workflow runs programmatically:

```bash
#!/bin/bash
# monitor-workflow.sh

REPO="HGNC/pgnc-solr-client"
WORKFLOW="solr-client-release.yml"

# Get recent runs
runs=$(gh api repos/${REPO}/actions/workflows/${WORKFLOW}/runs \
  --jq '.workflow_runs[:5] | .[] | {id: .id, status: .status, conclusion: .conclusion, created_at: .created_at}')

echo "$runs" | jq -r '. | "\(.id) \(.status) \(.conclusion) \(.created_at)"'
```

**Use Cases**:
- Custom dashboards
- Integration with third-party tools
- Historical analysis

---

### Advanced Monitoring with GitHub Webhooks

#### Setup Webhook Receiver

**Option A: Using Existing Services**

1. **GitHub + Slack**:
   - GitHub Marketplace: Install "GitHub" app for Slack
   - Subscribe to workflow run events:
     ```
     /github subscribe HGNC/pgnc-solr-client workflows:{event:"workflow_run" branch:"release"}
     ```

2. **GitHub + PagerDuty**:
   - Install PagerDuty GitHub integration
   - Configure service in PagerDuty
   - Add webhook URL to GitHub repository

3. **GitHub + Datadog**:
   - Enable Datadog GitHub integration
   - Configure webhook forwarding
   - Set up monitors on workflow metrics

**Option B: Custom Webhook Server**

Create a webhook receiver to process events:

```javascript
// webhook-receiver.js
const express = require('express');
const app = express();

app.post('/github-webhook', express.json(), (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  if (event === 'workflow_run') {
    handleWorkflowRun(payload);
  }

  res.status(200).send('OK');
});

function handleWorkflowRun(payload) {
  const { action, workflow_run } = payload;
  
  if (workflow_run.name === 'Solr Client Release') {
    if (action === 'completed' && workflow_run.conclusion !== 'success') {
      // Workflow failed - send alert
      sendAlert({
        severity: 'high',
        message: `Release workflow failed: ${workflow_run.html_url}`,
        runId: workflow_run.id,
        conclusion: workflow_run.conclusion
      });
    }
    
    // Collect metrics
    recordMetric('workflow_duration', workflow_run.run_duration_ms);
    recordMetric('workflow_conclusion', workflow_run.conclusion);
  }
}

app.listen(3000);
```

**Deploy**:
```bash
# Deploy to cloud (AWS Lambda, GCP Cloud Functions, etc.)
# Or run as container
docker build -t webhook-receiver .
docker run -p 3000:3000 webhook-receiver
```

**Configure in GitHub**:
1. Repository → Settings → Webhooks → Add webhook
2. Payload URL: `https://your-domain.com/github-webhook`
3. Content type: `application/json`
4. Events: Select "Workflow runs"
5. Secret: Generate and configure

---

## Alert Configuration

### Alert Categories

| Category | Severity | Response Time | Escalation |
|----------|----------|---------------|------------|
| Workflow Failure | High | 15 min | DevOps → Release Manager |
| Build Timeout | Medium | 30 min | DevOps |
| Image Push Failure | High | 15 min | DevOps |
| Authentication Error | Critical | 5 min | DevOps → Security |
| Performance Degradation | Low | 1 hour | DevOps |

### Alert Definitions

#### Alert 1: Workflow Failure

**Trigger**: Workflow run completes with `conclusion != 'success'`

**Condition**:
```yaml
# Example: PagerDuty rule
if:
  - workflow_run.name == "Solr Client Release"
  - workflow_run.conclusion in ["failure", "cancelled", "timed_out"]
then:
  create_incident:
    severity: high
    title: "Solr Client Release Workflow Failed"
    description: |
      Run ID: {{ workflow_run.id }}
      Conclusion: {{ workflow_run.conclusion }}
      URL: {{ workflow_run.html_url }}
      Triggered by: {{ workflow_run.triggering_actor.login }}
    runbook_url: "https://github.com/HGNC/pgnc-solr-client/docs/failure-scenarios-recovery.md"
```

**Notification**:
- Slack: `#deployments` channel
- PagerDuty: On-call DevOps engineer
- Email: Release manager

**Auto-Remediation**:
- None (requires human investigation)

---

#### Alert 2: Build Timeout

**Trigger**: Workflow run duration exceeds threshold (e.g., 15 minutes)

**Condition**:
```yaml
if:
  - workflow_run.status == "in_progress"
  - workflow_run.duration > 900  # 15 minutes
then:
  send_warning:
    severity: medium
    message: "Workflow taking longer than expected"
```

**Notification**:
- Slack: `#deployments` (warning, not page)

**Auto-Remediation**:
- Cancel run if exceeds maximum (e.g., 30 minutes)
- Investigate build cache issues

---

#### Alert 3: Consecutive Failures

**Trigger**: 3 consecutive workflow failures

**Condition**:
```python
# Pseudo-code
recent_runs = get_last_n_runs(workflow_id, n=3)
if all(run.conclusion == 'failure' for run in recent_runs):
    escalate_alert(severity='critical')
```

**Notification**:
- PagerDuty: Escalate to Release Manager
- Slack: `@channel` in `#deployments`

**Auto-Remediation**:
- Block further runs (manual gate)
- Create incident ticket automatically

---

#### Alert 4: Authentication/Permission Errors

**Trigger**: Workflow fails with authentication error

**Detection**:
```javascript
// Parse job logs for auth errors
const authErrors = [
  '401 Unauthorized',
  '403 Forbidden',
  'permission denied',
  'Bad credentials'
];

if (job_logs.includes(authErrors)) {
  sendAlert({
    severity: 'critical',
    category: 'security',
    message: 'Authentication failure in release workflow'
  });
}
```

**Notification**:
- PagerDuty: Security team + DevOps
- Slack: `#security-incidents`

**Auto-Remediation**:
- Disable workflow temporarily
- Rotate tokens as precaution

---

#### Alert 5: Image Publish Failure

**Trigger**: Release created but no image in GHCR

**Detection**:
```bash
#!/bin/bash
# check-release-image.sh

VERSION=$1
REPO="HGNC/pgnc-solr-client"
IMAGE="ghcr.io/hgnc/pgnc-solr-client:${VERSION}"

# Check if release exists
if gh release view "$VERSION" --repo "$REPO" >/dev/null 2>&1; then
  # Check if image exists
  if ! docker manifest inspect "$IMAGE" >/dev/null 2>&1; then
    # Alert: Release without image
    send_alert "Release $VERSION missing Docker image"
  fi
fi
```

**Run**: Every 5 minutes for recent releases

**Notification**:
- Slack: `#deployments`
- Create GitHub issue automatically

---

### Alert Routing Rules

```yaml
# Example: Alertmanager routing
route:
  receiver: 'default'
  group_by: ['workflow', 'severity']
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      continue: true
    
    - match:
        severity: high
      receiver: 'pagerduty-high'
      continue: true
    
    - match:
        category: security
      receiver: 'security-team'
    
    - match:
        severity: medium
      receiver: 'slack-deployments'
    
    - match_re:
        conclusion: 'failure|cancelled'
      receiver: 'slack-deployments'

receivers:
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '<key>'
        severity: 'critical'
  
  - name: 'pagerduty-high'
    pagerduty_configs:
      - service_key: '<key>'
        severity: 'high'
  
  - name: 'security-team'
    slack_configs:
      - channel: '#security-incidents'
        username: 'AlertBot'
  
  - name: 'slack-deployments'
    slack_configs:
      - channel: '#deployments'
        username: 'ReleaseBot'
```

---

## Metrics Collection

### Key Metrics to Track

#### Workflow Performance Metrics

| Metric | Description | Target | Alert Threshold |
|--------|-------------|--------|-----------------|
| `workflow_duration_seconds` | Total workflow execution time | <420s (7min) | >900s (15min) |
| `workflow_success_rate` | % of successful runs | >99% | <95% |
| `job_duration_seconds` | Individual job durations | Varies by job | 2x baseline |
| `workflow_frequency` | Runs per day/week | Varies | N/A (info only) |
| `time_to_detect_failure` | Alert latency | <120s (2min) | >300s (5min) |

#### Release Metrics

| Metric | Description | Target | Alert Threshold |
|--------|-------------|--------|-----------------|
| `releases_per_week` | Release cadence | Varies | N/A |
| `release_to_production_time` | Time from release to prod deploy | <24h | >72h |
| `rollback_rate` | % of releases rolled back | <1% | >5% |
| `hotfix_rate` | % of releases that are hotfixes | <10% | >25% |

#### Image Metrics

| Metric | Description | Target | Alert Threshold |
|--------|-------------|--------|-----------------|
| `image_build_duration_seconds` | Docker build time | <300s (5min) | >600s (10min) |
| `image_size_bytes` | Final image size | <500MB | >1GB |
| `image_push_duration_seconds` | Push to GHCR time | <120s (2min) | >300s (5min) |

### Metrics Collection Methods

#### Method 1: GitHub Actions Job Summary Scraping

Parse workflow job summaries for metrics:

```javascript
// metrics-collector.js
async function collectWorkflowMetrics(runId) {
  const run = await octokit.actions.getWorkflowRun({ owner, repo, run_id: runId });
  
  const metrics = {
    duration: (new Date(run.data.updated_at) - new Date(run.data.created_at)) / 1000,
    conclusion: run.data.conclusion,
    status: run.data.status,
    created_at: run.data.created_at
  };
  
  // Extract custom metrics from job summary
  const jobs = await octokit.actions.listJobsForWorkflowRun({ owner, repo, run_id: runId });
  
  for (const job of jobs.data.jobs) {
    if (job.name === 'build_and_push') {
      // Parse job outputs for image size, build duration, etc.
      metrics.image_size = extractImageSize(job);
      metrics.build_duration = job.completed_at - job.started_at;
    }
  }
  
  return metrics;
}

// Send to metrics backend
function sendMetrics(metrics) {
  // Example: Datadog
  dogstatsd.gauge('github.workflow.duration', metrics.duration, ['workflow:solr-client-release']);
  dogstatsd.increment('github.workflow.runs', 1, [`conclusion:${metrics.conclusion}`]);
  
  // Example: Prometheus
  workflowDurationGauge.set({ workflow: 'solr-client-release' }, metrics.duration);
  workflowRunsCounter.inc({ conclusion: metrics.conclusion });
}
```

#### Method 2: Workflow Outputs to External System

Modify workflow to export metrics:

```yaml
# .github/workflows/solr-client-release.yml
jobs:
  export_metrics:
    name: Export Metrics
    runs-on: ubuntu-latest
    needs: [finalize]
    if: always()
    steps:
      - name: Send metrics to Datadog
        env:
          DD_API_KEY: ${{ secrets.DATADOG_API_KEY }}
        run: |
          curl -X POST "https://api.datadoghq.com/api/v1/series" \
            -H "Content-Type: application/json" \
            -H "DD-API-KEY: ${DD_API_KEY}" \
            -d '{
              "series": [
                {
                  "metric": "github.workflow.duration",
                  "points": [['$(date +%s)', "${{ needs.finalize.outputs.build_duration_seconds }}"]],
                  "type": "gauge",
                  "tags": ["workflow:solr-client-release", "repo:pgnc-solr-client"]
                },
                {
                  "metric": "github.workflow.image_size",
                  "points": [['$(date +%s)', "${{ needs.finalize.outputs.image_size_bytes }}"]],
                  "type": "gauge",
                  "tags": ["workflow:solr-client-release"]
                }
              ]
            }'
```

#### Method 3: Scheduled Metrics Aggregation

Cron job to aggregate metrics:

```bash
#!/bin/bash
# aggregate-metrics.sh (runs every 15 minutes)

REPO="HGNC/pgnc-solr-client"
WORKFLOW="solr-client-release.yml"

# Get runs from last 15 minutes
since=$(date -u -d '15 minutes ago' '+%Y-%m-%dT%H:%M:%SZ')

runs=$(gh api "repos/${REPO}/actions/workflows/${WORKFLOW}/runs?created=>=${since}" \
  --jq '.workflow_runs[]')

# Aggregate metrics
total_runs=$(echo "$runs" | jq -s 'length')
successful_runs=$(echo "$runs" | jq -s '[.[] | select(.conclusion == "success")] | length')
failed_runs=$(echo "$runs" | jq -s '[.[] | select(.conclusion == "failure")] | length')

success_rate=$(echo "scale=2; $successful_runs / $total_runs * 100" | bc)

# Export to monitoring system
curl -X POST "https://metrics.example.com/api/v1/metrics" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_runs_total": '"$total_runs"',
    "workflow_success_rate": '"$success_rate"',
    "timestamp": "'"$(date -u +%s)"'"
  }'
```

---

## Dashboards

### Dashboard 1: Release Pipeline Overview

**Purpose**: High-level health of release process

**Widgets**:
1. **Success Rate (Last 30 Days)**
   - Gauge: 99.5%
   - Sparkline trend

2. **Workflow Run Status**
   - Pie chart: Success / Failure / In Progress

3. **Recent Runs** (Last 10)
   - Table: Run ID, Version, Status, Duration, Triggered By

4. **Average Duration**
   - Time series: Workflow duration over time
   - Show target line (7 min)

5. **Failure Rate Trend**
   - Line chart: % failures per day/week

6. **Active Incidents**
   - Count of open incidents related to releases

**Example: Grafana Dashboard JSON**
```json
{
  "dashboard": {
    "title": "Solr Client Release Pipeline",
    "panels": [
      {
        "id": 1,
        "title": "Workflow Success Rate (30d)",
        "type": "gauge",
        "targets": [
          {
            "expr": "sum(rate(github_workflow_runs{workflow=\"solr-client-release\",conclusion=\"success\"}[30d])) / sum(rate(github_workflow_runs{workflow=\"solr-client-release\"}[30d])) * 100"
          }
        ],
        "thresholds": [
          {"value": 0, "color": "red"},
          {"value": 95, "color": "yellow"},
          {"value": 99, "color": "green"}
        ]
      },
      {
        "id": 2,
        "title": "Workflow Duration",
        "type": "graph",
        "targets": [
          {
            "expr": "github_workflow_duration_seconds{workflow=\"solr-client-release\"}"
          }
        ],
        "yaxis": {"label": "Seconds"},
        "lines": true,
        "legend": {"show": true}
      }
    ]
  }
}
```

---

### Dashboard 2: Performance Metrics

**Purpose**: Deep-dive into workflow performance

**Widgets**:
1. **Job Duration Breakdown**
   - Stacked bar chart: Time spent in each job
   - Jobs: validate_inputs, calculate_version, create_release, build_and_push

2. **Build Time Trends**
   - Line chart: Docker build duration over time
   - Identify cache effectiveness

3. **Image Size History**
   - Line chart: Image size per release
   - Alert if size increases significantly

4. **Resource Usage**
   - CPU/Memory usage during builds (if available)

5. **Queue Time**
   - Time waiting for runner availability

---

### Dashboard 3: Operational Health

**Purpose**: Real-time monitoring during deployments

**Widgets**:
1. **Current Workflow Status**
   - Large status indicator: Running / Success / Failed
   - Live updates

2. **Job Progress**
   - Progress bar for each job
   - Current step indicator

3. **Recent Alerts**
   - List of alerts fired in last 24h

4. **GHCR Image Stats**
   - Total images published
   - Storage usage
   - Pull count

5. **Deployment Calendar**
   - Heatmap: Deployments per day
   - Identify patterns (day of week, time of day)

---

## Notification Channels

### Channel Configuration

#### Slack Integration

**Setup**:
1. Create Slack app or use incoming webhooks
2. Add to workspace
3. Configure channels:

| Channel | Alerts | Severity | Format |
|---------|--------|----------|--------|
| `#deployments` | All workflow events | Info, Medium, High | Detailed |
| `#incidents` | Failures only | High, Critical | Concise |
| `#security-incidents` | Auth/permission errors | Critical | Detailed |

**Message Template**:
```json
{
  "text": "Workflow Failed: Solr Client Release",
  "blocks": [
    {
      "type": "header",
      "text": {"type": "plain_text", "text": "🚨 Workflow Failure"}
    },
    {
      "type": "section",
      "fields": [
        {"type": "mrkdwn", "text": "*Workflow:*\nSolr Client Release"},
        {"type": "mrkdwn", "text": "*Conclusion:*\nfailure"},
        {"type": "mrkdwn", "text": "*Run ID:*\n12345"},
        {"type": "mrkdwn", "text": "*Triggered By:*\n@user"}
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "View Run"},
          "url": "https://github.com/HGNC/pgnc-solr-client/actions/runs/12345"
        },
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "Runbook"},
          "url": "https://github.com/HGNC/pgnc-solr-client/docs/failure-scenarios-recovery.md"
        }
      ]
    }
  ]
}
```

#### Email Alerts

**Configuration**:
- Recipient: `releases@hgnc.org`, `oncall@hgnc.org`
- Subject format: `[SEVERITY] Workflow Event: [Description]`
- Include: Run URL, conclusion, triggered by, timestamp

#### PagerDuty Integration

**Setup**:
1. Create service: "Solr Client Release Pipeline"
2. Configure escalation policy:
   - Level 1: On-call DevOps (notify immediately)
   - Level 2: DevOps Lead (after 15 min)
   - Level 3: Release Manager (after 30 min)

3. Integration key: Add to secrets as `PAGERDUTY_INTEGRATION_KEY`

**Trigger Example**:
```bash
curl -X POST "https://events.pagerduty.com/v2/enqueue" \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "'"$PAGERDUTY_INTEGRATION_KEY"'",
    "event_action": "trigger",
    "payload": {
      "summary": "Solr Client release workflow failed",
      "severity": "error",
      "source": "github-actions",
      "custom_details": {
        "run_id": "12345",
        "conclusion": "failure",
        "url": "https://github.com/HGNC/pgnc-solr-client/actions/runs/12345"
      }
    },
    "links": [
      {
        "href": "https://github.com/HGNC/pgnc-solr-client/docs/failure-scenarios-recovery.md",
        "text": "Runbook"
      }
    ]
  }'
```

---

## SLA/SLO Definitions

### Service Level Agreements

| Metric | SLA | Measurement Period | Consequence |
|--------|-----|-------------------|-------------|
| Workflow Availability | 99.5% | Monthly | Incident review if breached |
| Release Time (commit to publish) | <10 minutes (95th percentile) | Weekly | Process improvement |
| Alert Response Time | <15 minutes | Per incident | Escalation review |

### Service Level Objectives

| Objective | Target | Stretch Goal |
|-----------|--------|--------------|
| Workflow success rate | >99% | >99.9% |
| Mean time to release (MTTR) | <7 minutes | <5 minutes |
| Mean time to detect (MTTD) failure | <2 minutes | <1 minute |
| Mean time to resolve (MTR) incident | <30 minutes | <15 minutes |
| False positive alert rate | <5% | <2% |

### Error Budget

**Monthly Error Budget Calculation**:
```
Total minutes in month: 43,200 (30 days)
SLA: 99.5% availability
Allowed downtime: 43,200 * 0.005 = 216 minutes (3.6 hours)
```

**Tracking**:
- Weekly review of error budget consumption
- Incident postmortems for major budget burns
- Adjust priorities based on budget remaining

---

## Incident Response Integration

### Incident Lifecycle

```
Alert Fired → Incident Created → Investigation → Remediation → Resolution → Postmortem
     │              │                  │              │             │           │
     │              │                  │              │             │           │
  <2 min         <5 min            <15 min        <30 min       Document    Learn
```

### Automated Incident Creation

**Trigger**: Critical alert fired

**Actions**:
1. Create PagerDuty/Opsgenie incident
2. Create GitHub issue automatically:

```yaml
# .github/workflows/create-incident.yml
name: Create Incident
on:
  workflow_dispatch:
    inputs:
      alert_id:
        description: 'Alert ID'
        required: true
      severity:
        description: 'Severity'
        required: true

jobs:
  create_issue:
    runs-on: ubuntu-latest
    steps:
      - name: Create incident issue
        uses: actions/github-script@v7
        with:
          script: |
            const issue = await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `[INCIDENT] Release workflow failure - ${context.payload.inputs.alert_id}`,
              body: `
              ## Incident Details
              - **Alert ID**: ${context.payload.inputs.alert_id}
              - **Severity**: ${context.payload.inputs.severity}
              - **Time**: ${new Date().toISOString()}
              
              ## Status
              - [ ] Investigation started
              - [ ] Root cause identified
              - [ ] Fix implemented
              - [ ] Verified resolved
              - [ ] Postmortem scheduled
              
              ## Runbook
              [Failure Scenarios & Recovery](./docs/failure-scenarios-recovery.md)
              `,
              labels: ['incident', `severity:${context.payload.inputs.severity}`]
            });
            console.log(`Created issue ${issue.data.number}`);
```

3. Notify on-call via PagerDuty
4. Post to `#incidents` Slack channel
5. Update status page (if applicable)

---

## Appendix

### A. Sample Monitoring Scripts

**Full Monitoring Script** (`monitor-release-pipeline.sh`):
```bash
#!/bin/bash
# monitor-release-pipeline.sh
# Comprehensive monitoring script for release pipeline

set -euo pipefail

REPO="HGNC/pgnc-solr-client"
WORKFLOW="solr-client-release.yml"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL}"
PAGERDUTY_KEY="${PAGERDUTY_INTEGRATION_KEY}"

# Get latest run
latest_run=$(gh api "repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1" \
  --jq '.workflow_runs[0]')

run_id=$(echo "$latest_run" | jq -r '.id')
status=$(echo "$latest_run" | jq -r '.status')
conclusion=$(echo "$latest_run" | jq -r '.conclusion')
created_at=$(echo "$latest_run" | jq -r '.created_at')
updated_at=$(echo "$latest_run" | jq -r '.updated_at')

# Calculate duration
duration=$(( $(date -d "$updated_at" +%s) - $(date -d "$created_at" +%s) ))

# Check for failure
if [ "$conclusion" = "failure" ]; then
  # Send Slack alert
  curl -X POST "$SLACK_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d '{
      "text": "🚨 Release workflow failed",
      "attachments": [{
        "color": "danger",
        "fields": [
          {"title": "Run ID", "value": "'"$run_id"'", "short": true},
          {"title": "Duration", "value": "'"$duration"'s", "short": true},
          {"title": "URL", "value": "<https://github.com/'"$REPO"'/actions/runs/'"$run_id"'|View Run>"}
        ]
      }]
    }'
  
  # Create PagerDuty incident
  curl -X POST "https://events.pagerduty.com/v2/enqueue" \
    -H "Content-Type: application/json" \
    -d '{
      "routing_key": "'"$PAGERDUTY_KEY"'",
      "event_action": "trigger",
      "payload": {
        "summary": "Release workflow failed (Run '"$run_id"')",
        "severity": "error",
        "source": "github-actions"
      }
    }'
fi

# Collect metrics
echo "workflow_duration_seconds{workflow=\"solr-client-release\"} $duration"
echo "workflow_conclusion{workflow=\"solr-client-release\",conclusion=\"$conclusion\"} 1"
```

**Deploy as Cron**:
```bash
# Run every 5 minutes
*/5 * * * * /path/to/monitor-release-pipeline.sh >> /var/log/release-monitor.log 2>&1
```

---

### B. Metrics Export Formats

**Prometheus Format**:
```
# HELP github_workflow_duration_seconds Duration of workflow run
# TYPE github_workflow_duration_seconds gauge
github_workflow_duration_seconds{workflow="solr-client-release",conclusion="success"} 420

# HELP github_workflow_runs_total Total workflow runs
# TYPE github_workflow_runs_total counter
github_workflow_runs_total{workflow="solr-client-release",conclusion="success"} 145
github_workflow_runs_total{workflow="solr-client-release",conclusion="failure"} 2
```

**JSON Format** (for custom APIs):
```json
{
  "timestamp": 1697472000,
  "workflow": "solr-client-release",
  "metrics": {
    "duration_seconds": 420,
    "conclusion": "success",
    "image_size_bytes": 268435456,
    "build_duration_seconds": 240,
    "jobs": [
      {"name": "validate_inputs", "duration": 30, "conclusion": "success"},
      {"name": "calculate_version", "duration": 45, "conclusion": "success"},
      {"name": "create_release", "duration": 60, "conclusion": "success"},
      {"name": "build_and_push", "duration": 285, "conclusion": "success"}
    ]
  }
}
```

---

### C. Alert Runbook Template

**Runbook**: Workflow Failure Alert

**Alert Name**: `solr-client-release-workflow-failed`

**Severity**: High

**Description**: The Solr Client release workflow completed with a failure conclusion.

**Impact**: New releases cannot be published until resolved.

**Diagnosis**:
1. Access workflow run: [GitHub Actions URL]
2. Review failed job logs
3. Identify failure category (auth, build, push, etc.)

**Common Causes**:
- Authentication failure (token expired)
- Build error (code issue)
- Network timeout (GHCR unreachable)
- Version conflict (duplicate tag)

**Resolution Steps**:
1. Review logs for specific error
2. Consult [Failure Scenarios document](./failure-scenarios-recovery.md)
3. Apply appropriate fix
4. Re-run workflow or trigger new release

**Escalation**:
- If unresolved in 30 min: Escalate to Release Manager
- If security-related: Notify Security team immediately

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-16  
**Review Schedule**: Quarterly  
**Owner**: DevOps Team
