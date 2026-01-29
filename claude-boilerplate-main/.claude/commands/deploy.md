# Deploy Command

Guide through deployment process with safety checks and validation.

## Pre-Deployment Checklist

### 1. Code Quality Verification
- [ ] All tests passing
- [ ] Linting passes
- [ ] Type checking passes (if applicable)
- [ ] Code review approved
- [ ] No TODO or FIXME comments in critical paths

### 2. Security Checks
- [ ] No secrets in code or environment files
- [ ] Dependencies scanned for vulnerabilities
- [ ] Security headers configured
- [ ] Authentication/authorization tested

### 3. Documentation
- [ ] CHANGELOG updated
- [ ] API documentation current
- [ ] Deployment notes written
- [ ] Rollback procedure documented

### 4. Infrastructure Readiness
- [ ] Infrastructure changes reviewed
- [ ] Database migrations prepared
- [ ] Backup verified
- [ ] Monitoring configured
- [ ] Alerts set up

## Deployment Process

### For Application Deployment

1. **Pre-deployment validation:**
   ```bash
   # Run tests
   npm test
   # or
   pytest

   # Build production assets
   npm run build
   # or
   python -m build

   # Security scan
   npm audit
   # or
   pip-audit
   ```

2. **Deployment steps by platform:**

   **AWS (Terraform):**
   ```bash
   cd terraform/environments/production
   terraform plan -out=tfplan
   # Review plan carefully
   terraform apply tfplan
   ```

   **Docker/Kubernetes:**
   ```bash
   # Build image
   docker build -t app:$VERSION .

   # Tag and push
   docker tag app:$VERSION registry/app:$VERSION
   docker push registry/app:$VERSION

   # Deploy
   kubectl apply -f k8s/production/
   kubectl rollout status deployment/app
   ```

   **Serverless:**
   ```bash
   # Deploy with framework
   serverless deploy --stage production
   # or
   sam deploy --stack-name app-production
   ```

3. **Post-deployment validation:**
   ```bash
   # Health check
   curl https://api.example.com/health

   # Smoke tests
   npm run test:e2e:production

   # Monitor logs
   kubectl logs -f deployment/app
   # or
   aws logs tail /aws/lambda/app --follow
   ```

### For Infrastructure Deployment (Terraform)

1. **Validate configuration:**
   ```bash
   terraform fmt -check -recursive
   terraform validate
   tfsec .
   checkov -d .
   ```

2. **Plan and review:**
   ```bash
   terraform plan -out=tfplan
   terraform show tfplan
   # Review changes carefully!
   ```

3. **Apply changes:**
   ```bash
   terraform apply tfplan
   ```

4. **Verify:**
   ```bash
   terraform output
   # Test resources
   ```

## Rollback Procedure

If deployment fails or issues are detected:

**Application:**
```bash
# Kubernetes
kubectl rollout undo deployment/app

# Docker
docker service update --rollback app

# Serverless
serverless deploy --stage production --rollback
```

**Infrastructure:**
```bash
# Terraform
terraform apply -auto-approve \
  -target=aws_instance.app \
  -var="app_version=previous_version"
```

## Monitoring Checklist

After deployment, monitor:
- [ ] Error rates (should stay normal)
- [ ] Response times (should not degrade)
- [ ] CPU/Memory usage (should be within limits)
- [ ] Database connections (should be stable)
- [ ] Log errors (should not spike)

Monitor for at least 15-30 minutes after deployment.

## Deployment Report Template

```markdown
## Deployment Report

**Date:** YYYY-MM-DD HH:MM
**Environment:** Production
**Version:** vX.Y.Z
**Deployed by:** Name

### Changes
- Feature/fix 1
- Feature/fix 2

### Deployment Steps Completed
- [x] Tests passed
- [x] Security scan passed
- [x] Infrastructure updated
- [x] Application deployed
- [x] Health checks passed

### Monitoring
- Error rate: X%
- Response time (p95): Xms
- No critical alerts

### Rollback Plan
Documented at: [link to runbook]

### Notes
[Any special considerations or observations]
```

Please specify the deployment target (application, infrastructure, or both) and environment (dev, staging, production).
