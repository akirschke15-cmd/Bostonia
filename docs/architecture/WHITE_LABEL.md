# White-Label Architecture Document
## Bostonia Enterprise Multi-tenancy

---

## Table of Contents

1. [Overview](#1-overview)
2. [Database Architecture](#2-database-architecture)
3. [Tenant Resolution](#3-tenant-resolution)
4. [Data Isolation Patterns](#4-data-isolation-patterns)
5. [Custom Domain Management](#5-custom-domain-management)
6. [Branding System](#6-branding-system)
7. [Frontend Integration](#7-frontend-integration)
8. [API Design](#8-api-design)
9. [Security Considerations](#9-security-considerations)
10. [Deployment Strategy](#10-deployment-strategy)
11. [Migration Guide](#11-migration-guide)
12. [Future Considerations](#12-future-considerations)

---

## 1. Overview

### 1.1 Purpose

The white-label system enables enterprise customers to deploy Bostonia as their own branded AI character chat platform. This document outlines the architecture for supporting multiple tenants with:

- Custom branding (logos, colors, fonts)
- Custom domains (e.g., `chat.enterprise.com`)
- Data isolation (tenant data is completely segregated)
- Feature customization (per-tenant feature flags)
- Independent user bases

### 1.2 Architecture Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WHITE-LABEL ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│   │   Tenant A  │    │   Tenant B  │    │   Tenant C  │                    │
│   │ acme.com    │    │ beta.corp   │    │ gamma.io    │                    │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                    │
│          │                  │                  │                            │
│          └──────────────────┼──────────────────┘                            │
│                             │                                                │
│                    ┌────────▼────────┐                                      │
│                    │  Tenant Router  │                                      │
│                    │   (Middleware)  │                                      │
│                    └────────┬────────┘                                      │
│                             │                                                │
│          ┌──────────────────┼──────────────────┐                            │
│          │                  │                  │                            │
│   ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐                    │
│   │   Next.js   │    │   Services  │    │   Database  │                    │
│   │   Frontend  │    │   (API)     │    │  (Scoped)   │                    │
│   └─────────────┘    └─────────────┘    └─────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Tenant Types

| Tenant Type | Domain Pattern | Use Case |
|-------------|----------------|----------|
| Platform | `bostonia.ai`, `app.bostonia.ai` | Main platform users |
| Subdomain | `{slug}.bostonia.ai` | Self-service enterprise |
| Custom Domain | `chat.{customer}.com` | Premium enterprise |

---

## 2. Database Architecture

### 2.1 Multi-tenancy Model

We use a **shared database with tenant discriminator** approach:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHARED DATABASE MODEL                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL Database                     │  │
│  │                                                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │Organizations│  │   Users     │  │ Characters  │       │  │
│  │  │             │  │             │  │             │       │  │
│  │  │ id          │◄─┤organizationId│◄─┤organizationId│      │  │
│  │  │ slug        │  │             │  │             │       │  │
│  │  │ domain      │  └─────────────┘  └─────────────┘       │  │
│  │  └─────────────┘                                          │  │
│  │         │                                                  │  │
│  │         ▼                                                  │  │
│  │  ┌─────────────┐  ┌─────────────┐                        │  │
│  │  │  Branding   │  │Conversations│                        │  │
│  │  │             │  │             │                        │  │
│  │  │organizationId│  │organizationId│                       │  │
│  │  └─────────────┘  └─────────────┘                        │  │
│  │                                                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Note: organizationId = NULL means platform data                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Schema Design

```prisma
// Organization (Tenant)
model Organization {
  id        String   @id @default(uuid())
  name      String                          // Display name
  slug      String   @unique                // URL-safe identifier
  domain    String?  @unique                // Custom domain
  isActive  Boolean  @default(true)
  settings  Json     @default("{}")         // Feature flags, limits
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  branding             OrganizationBranding?
  members              OrganizationMember[]
  users                User[]
  characters           Character[]
  conversations        Conversation[]
  domainVerifications  DomainVerification[]
}

// Branding Configuration
model OrganizationBranding {
  id             String @id @default(uuid())
  organizationId String @unique
  logoUrl        String?
  faviconUrl     String?
  primaryColor   String @default("#6366f1")
  secondaryColor String @default("#8b5cf6")
  appName        String?
  customCss      String?
  welcomeMessage String?
  footerText     String?
  supportEmail   String?
  metadata       Json   @default("{}")

  organization Organization @relation(...)
}

// Organization Membership
model OrganizationMember {
  id             String        @id @default(uuid())
  organizationId String
  userId         String
  role           OrgMemberRole @default(MEMBER)
  invitedBy      String?
  invitedAt      DateTime      @default(now())
  acceptedAt     DateTime?

  organization Organization @relation(...)
  user         User         @relation(...)

  @@unique([organizationId, userId])
}

enum OrgMemberRole {
  OWNER   // Full control, billing
  ADMIN   // Manage members, settings
  MEMBER  // Standard access
}
```

### 2.3 Tenant-Scoped Tables

The following tables include `organizationId` for tenant isolation:

| Table | Isolation Level | Notes |
|-------|-----------------|-------|
| `User` | Full | Users belong to one org |
| `Character` | Full | Characters scoped to org |
| `Conversation` | Full | Conversations within org |
| `CreditTransaction` | Indirect | Via user's org |
| `Subscription` | Indirect | Via user's org |

### 2.4 Settings Schema

```typescript
interface OrganizationSettings {
  features: {
    voiceEnabled: boolean;        // TTS functionality
    imageGeneration: boolean;     // Image generation
    customCharacters: boolean;    // User-created characters
    apiAccess: boolean;           // External API access
    memoryNexus: boolean;         // Long-term memory
    multiCharacter: boolean;      // Multi-character chats
  };
  limits: {
    maxUsers: number;             // User cap (0 = unlimited)
    maxCharacters: number;        // Character cap
    maxConversationsPerUser: number;
    monthlyMessageLimit: number;
    maxTokensPerMessage: number;
  };
  content: {
    allowNsfw: boolean;
    defaultContentFilter: 'strict' | 'moderate' | 'relaxed';
    blockedCategories: string[];
  };
  integrations: {
    ssoEnabled: boolean;
    ssoProvider: 'okta' | 'azure' | 'google' | null;
    ssoConfig: Record<string, unknown>;
    webhookUrl: string | null;
    webhookEvents: string[];
  };
  billing: {
    plan: 'starter' | 'professional' | 'enterprise';
    billingEmail: string;
    stripeCustomerId: string | null;
  };
}
```

---

## 3. Tenant Resolution

### 3.1 Resolution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT RESOLUTION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Incoming Request                                                │
│        │                                                         │
│        ▼                                                         │
│  ┌──────────────┐                                               │
│  │ Extract Host │                                               │
│  │   Header     │                                               │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐    Yes    ┌──────────────┐                   │
│  │ Is Custom    │──────────▶│ Lookup by    │                   │
│  │ Domain?      │           │ Domain       │                   │
│  └──────┬───────┘           └──────┬───────┘                   │
│         │ No                        │                            │
│         ▼                           │                            │
│  ┌──────────────┐    Yes    ┌──────┴───────┐                   │
│  │ Has Sub-     │──────────▶│ Lookup by    │                   │
│  │ domain?      │           │ Slug         │                   │
│  └──────┬───────┘           └──────┬───────┘                   │
│         │ No                        │                            │
│         ▼                           │                            │
│  ┌──────────────┐    Yes    ┌──────┴───────┐                   │
│  │ X-Tenant-ID  │──────────▶│ Lookup by    │                   │
│  │ Header?      │           │ ID           │                   │
│  └──────┬───────┘           └──────┬───────┘                   │
│         │ No                        │                            │
│         ▼                           ▼                            │
│  ┌──────────────┐           ┌──────────────┐                   │
│  │ Platform     │           │ Load Org &   │                   │
│  │ Context      │           │ Branding     │                   │
│  └──────┬───────┘           └──────┬───────┘                   │
│         │                           │                            │
│         └───────────┬───────────────┘                           │
│                     ▼                                            │
│              ┌──────────────┐                                   │
│              │ Attach to    │                                   │
│              │ Request      │                                   │
│              └──────────────┘                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Middleware Implementation

```typescript
// packages/shared/src/middleware/tenant.middleware.ts

interface TenantContext {
  organizationId: string | null;
  organization: Organization | null;
  branding: OrganizationBranding | null;
  isWhiteLabel: boolean;
  resolvedFrom: 'domain' | 'subdomain' | 'header' | 'none';
}

function createTenantMiddleware(config: TenantMiddlewareConfig) {
  return async (req, res, next) => {
    const host = req.hostname;
    let org: Organization | null = null;

    // 1. Custom domain check
    if (!host.endsWith(config.platformDomain)) {
      org = await config.findByDomain(host);
    }

    // 2. Subdomain check
    if (!org && host.endsWith(config.platformDomain)) {
      const subdomain = extractSubdomain(host, config.platformDomain);
      if (subdomain) {
        org = await config.findBySlug(subdomain);
      }
    }

    // 3. Header check
    if (!org) {
      const tenantId = req.get('X-Tenant-ID');
      if (tenantId) {
        org = await config.findById(tenantId);
      }
    }

    // Attach context
    req.tenant = {
      organizationId: org?.id || null,
      organization: org,
      branding: org ? await config.getBranding(org.id) : null,
      isWhiteLabel: !!org,
      resolvedFrom: determineSource(org),
    };

    next();
  };
}
```

### 3.3 Usage in Services

```typescript
// In any service route handler
app.get('/api/characters', async (req, res) => {
  const { tenant } = req;

  const characters = await prisma.character.findMany({
    where: {
      organizationId: tenant.organizationId,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
    },
  });

  res.json(characters);
});
```

---

## 4. Data Isolation Patterns

### 4.1 Query Filter Pattern

All queries MUST include tenant scope:

```typescript
// Helper function
function createTenantFilter(tenant: TenantContext) {
  return {
    organizationId: tenant.isWhiteLabel ? tenant.organizationId : null,
  };
}

// Usage in queries
const characters = await prisma.character.findMany({
  where: {
    ...createTenantFilter(req.tenant),
    status: 'PUBLISHED',
  },
});
```

### 4.2 Row-Level Security (Future Enhancement)

For additional security, PostgreSQL RLS policies can be implemented:

```sql
-- Enable RLS
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY tenant_isolation ON characters
  USING (
    organization_id = current_setting('app.current_tenant_id')::uuid
    OR organization_id IS NULL  -- Platform content
  );

-- Set tenant in connection
SET app.current_tenant_id = 'uuid-here';
```

**Note:** RLS adds overhead. Use query filters for MVP, consider RLS for compliance-critical deployments.

### 4.3 Isolation Levels

| Data Type | Isolation Strategy | Cross-Tenant Access |
|-----------|-------------------|---------------------|
| Users | Strict | Never |
| Characters | Strict | Never |
| Conversations | Strict | Never |
| Messages | Strict | Never |
| Platform Characters | None | Public read |

### 4.4 Data Sharing Options

For shared platform content (official characters):

```typescript
// Query with platform fallback
const characters = await prisma.character.findMany({
  where: {
    OR: [
      // Tenant's own characters
      { organizationId: tenant.organizationId },
      // Platform public characters (if enabled)
      tenant.organization?.settings.allowPlatformContent
        ? { organizationId: null, visibility: 'PUBLIC' }
        : { id: 'never-match' },
    ],
  },
});
```

---

## 5. Custom Domain Management

### 5.1 Domain Setup Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOM DOMAIN SETUP FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Customer enters domain in admin panel                        │
│     │                                                            │
│     ▼                                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ System generates verification token                       │   │
│  │ Example: bostonia-verify=abc123def456                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│     │                                                            │
│     ▼                                                            │
│  2. Customer adds DNS record                                     │
│     │                                                            │
│     │  Option A: CNAME (Recommended)                            │
│     │  chat.customer.com CNAME tenant.bostonia.ai               │
│     │                                                            │
│     │  Option B: TXT Record                                     │
│     │  _bostonia.customer.com TXT "bostonia-verify=abc123"     │
│     │                                                            │
│     ▼                                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ System verifies DNS (cron job every 5 minutes)           │   │
│  └──────────────────────────────────────────────────────────┘   │
│     │                                                            │
│     ▼                                                            │
│  3. Once verified:                                               │
│     - Domain marked as verified                                  │
│     - SSL certificate provisioned (via Cloudflare/Let's Encrypt)│
│     - Domain mapped to tenant                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 DNS Verification

```typescript
// Domain verification service
async function verifyDomain(verification: DomainVerification): Promise<boolean> {
  const { domain, verificationToken, verificationMethod } = verification;

  switch (verificationMethod) {
    case 'DNS_TXT':
      return verifyDnsTxt(domain, verificationToken);
    case 'DNS_CNAME':
      return verifyDnsCname(domain);
    case 'META_TAG':
      return verifyMetaTag(domain, verificationToken);
    case 'FILE_UPLOAD':
      return verifyFileUpload(domain, verificationToken);
    default:
      return false;
  }
}

async function verifyDnsTxt(domain: string, token: string): Promise<boolean> {
  const records = await dns.resolveTxt(`_bostonia.${domain}`);
  return records.flat().some(record =>
    record.includes(`bostonia-verify=${token}`)
  );
}

async function verifyDnsCname(domain: string): Promise<boolean> {
  const records = await dns.resolveCname(domain);
  return records.some(record =>
    record.endsWith('.bostonia.ai')
  );
}
```

### 5.3 SSL/TLS Strategy

**Option A: Cloudflare (Recommended)**
- Use Cloudflare as CDN/proxy
- Automatic SSL via Universal SSL
- Customer points CNAME to Cloudflare zone

**Option B: Let's Encrypt**
- Automated certificate provisioning
- Use Certbot or ACME client
- Requires verification domain ownership first

```yaml
# Infrastructure setup (Kubernetes)
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: tenant-wildcard
spec:
  secretName: tenant-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - "*.bostonia.ai"
    - "{{ custom_domain }}"  # Dynamic per tenant
```

### 5.4 Routing Configuration

```nginx
# Nginx configuration for custom domains
server {
    listen 443 ssl;
    server_name ~^(?<tenant>.+)\.bostonia\.ai$;
    server_name ~^(?<custom_domain>.+)$;

    # SSL handled by Cloudflare/cert-manager

    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. Branding System

### 6.1 Branding Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    BRANDING CONFIGURATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Visual Identity                                                 │
│  ├── Logo (logoUrl)                                             │
│  ├── Favicon (faviconUrl)                                       │
│  ├── Primary Color (primaryColor)                               │
│  ├── Secondary Color (secondaryColor)                           │
│  └── Custom CSS (customCss)                                     │
│                                                                  │
│  Text Content                                                    │
│  ├── App Name (appName)                                         │
│  ├── Welcome Message (welcomeMessage)                           │
│  ├── Footer Text (footerText)                                   │
│  └── Support Email (supportEmail)                               │
│                                                                  │
│  Extended Options (metadata)                                     │
│  ├── Custom Fonts                                               │
│  ├── Additional CSS Variables                                   │
│  ├── Social Links                                               │
│  └── Analytics IDs                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 CSS Variable Injection

```typescript
// Generate CSS variables from branding
function generateBrandingStyles(branding: OrganizationBranding): string {
  return `
    :root {
      --brand-primary: ${branding.primaryColor};
      --brand-primary-hover: ${adjustColor(branding.primaryColor, -10)};
      --brand-secondary: ${branding.secondaryColor};
      --brand-secondary-hover: ${adjustColor(branding.secondaryColor, -10)};
      ${branding.metadata.cssVariables || ''}
    }
  `;
}

// Color adjustment helper
function adjustColor(hex: string, percent: number): string {
  // Lighten or darken color by percent
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}
```

### 6.3 Asset Storage

Branding assets (logos, favicons) are stored in cloud storage:

```
s3://bostonia-assets/
└── organizations/
    └── {organization_id}/
        ├── logo.png
        ├── logo@2x.png
        ├── favicon.ico
        ├── favicon-32x32.png
        └── favicon-16x16.png
```

Asset URLs follow pattern:
```
https://assets.bostonia.ai/organizations/{org_id}/logo.png
```

---

## 7. Frontend Integration

### 7.1 Next.js Tenant Detection

```typescript
// middleware.ts (Next.js Edge Middleware)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const response = NextResponse.next();

  // Extract tenant info
  let tenantSlug: string | null = null;
  let isCustomDomain = false;

  if (!hostname.endsWith('bostonia.ai')) {
    // Custom domain - lookup required
    isCustomDomain = true;
    // Set header for API to resolve
    response.headers.set('X-Custom-Domain', hostname);
  } else {
    // Subdomain
    const subdomain = hostname.split('.')[0];
    if (subdomain !== 'app' && subdomain !== 'www') {
      tenantSlug = subdomain;
    }
  }

  // Pass tenant info to app
  if (tenantSlug) {
    response.headers.set('X-Tenant-Slug', tenantSlug);
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

### 7.2 Branding Provider

```tsx
// providers/BrandingProvider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { OrganizationBranding } from '@bostonia/shared';

interface BrandingContextValue {
  branding: OrganizationBranding | null;
  isWhiteLabel: boolean;
  appName: string;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: null,
  isWhiteLabel: false,
  appName: 'Bostonia',
});

export function BrandingProvider({
  children,
  initialBranding,
}: {
  children: React.ReactNode;
  initialBranding: OrganizationBranding | null;
}) {
  const [branding] = useState(initialBranding);

  // Inject CSS variables
  useEffect(() => {
    if (branding) {
      const root = document.documentElement;
      root.style.setProperty('--brand-primary', branding.primaryColor);
      root.style.setProperty('--brand-secondary', branding.secondaryColor);

      // Apply custom CSS
      if (branding.customCss) {
        const style = document.createElement('style');
        style.id = 'custom-branding';
        style.textContent = branding.customCss;
        document.head.appendChild(style);

        return () => {
          document.getElementById('custom-branding')?.remove();
        };
      }
    }
  }, [branding]);

  return (
    <BrandingContext.Provider
      value={{
        branding,
        isWhiteLabel: !!branding,
        appName: branding?.appName || 'Bostonia',
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
```

### 7.3 Server Component Branding

```tsx
// app/layout.tsx
import { headers } from 'next/headers';
import { BrandingProvider } from '@/providers/BrandingProvider';

async function getBranding(): Promise<OrganizationBranding | null> {
  const headersList = headers();
  const tenantSlug = headersList.get('X-Tenant-Slug');
  const customDomain = headersList.get('X-Custom-Domain');

  if (!tenantSlug && !customDomain) {
    return null; // Platform mode
  }

  // Fetch branding from API
  const res = await fetch(
    `${process.env.API_URL}/organizations/branding`,
    {
      headers: {
        'X-Tenant-Slug': tenantSlug || '',
        'X-Custom-Domain': customDomain || '',
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    }
  );

  if (!res.ok) return null;
  return res.json();
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const branding = await getBranding();

  return (
    <html lang="en">
      <head>
        {branding?.faviconUrl && (
          <link rel="icon" href={branding.faviconUrl} />
        )}
        <title>{branding?.appName || 'Bostonia'}</title>
      </head>
      <body>
        <BrandingProvider initialBranding={branding}>
          {children}
        </BrandingProvider>
      </body>
    </html>
  );
}
```

### 7.4 Component Usage

```tsx
// components/Header.tsx
'use client';

import { useBranding } from '@/providers/BrandingProvider';
import Image from 'next/image';

export function Header() {
  const { branding, appName } = useBranding();

  return (
    <header className="border-b bg-background">
      <div className="container flex h-16 items-center">
        {branding?.logoUrl ? (
          <Image
            src={branding.logoUrl}
            alt={appName}
            width={120}
            height={40}
            className="object-contain"
          />
        ) : (
          <span className="text-xl font-bold">{appName}</span>
        )}
      </div>
    </header>
  );
}
```

---

## 8. API Design

### 8.1 Organization Management Endpoints

```yaml
# Public Endpoints
GET /api/v1/organizations/:slug/branding
  Description: Get public branding for organization
  Auth: None required
  Response: OrganizationBranding

# Admin Endpoints (Organization Owner/Admin)
GET /api/v1/admin/organization
  Description: Get current organization details
  Auth: Bearer token (owner/admin)
  Response: Organization

PATCH /api/v1/admin/organization
  Description: Update organization settings
  Auth: Bearer token (owner)
  Body: { name?, settings? }
  Response: Organization

GET /api/v1/admin/organization/branding
  Description: Get branding configuration
  Auth: Bearer token (owner/admin)
  Response: OrganizationBranding

PUT /api/v1/admin/organization/branding
  Description: Update branding configuration
  Auth: Bearer token (owner/admin)
  Body: OrganizationBranding
  Response: OrganizationBranding

POST /api/v1/admin/organization/branding/logo
  Description: Upload logo
  Auth: Bearer token (owner/admin)
  Body: multipart/form-data
  Response: { logoUrl: string }

# Member Management
GET /api/v1/admin/organization/members
  Description: List organization members
  Auth: Bearer token (admin)
  Response: OrganizationMember[]

POST /api/v1/admin/organization/members/invite
  Description: Invite new member
  Auth: Bearer token (admin)
  Body: { email, role }
  Response: OrganizationMember

DELETE /api/v1/admin/organization/members/:userId
  Description: Remove member
  Auth: Bearer token (admin)
  Response: { success: true }

# Domain Management
GET /api/v1/admin/organization/domains
  Description: List domain configurations
  Auth: Bearer token (owner)
  Response: DomainVerification[]

POST /api/v1/admin/organization/domains
  Description: Add domain for verification
  Auth: Bearer token (owner)
  Body: { domain, verificationMethod }
  Response: DomainVerification

POST /api/v1/admin/organization/domains/:id/verify
  Description: Trigger domain verification
  Auth: Bearer token (owner)
  Response: DomainVerification

DELETE /api/v1/admin/organization/domains/:id
  Description: Remove domain
  Auth: Bearer token (owner)
  Response: { success: true }
```

### 8.2 Webhook Events

Organizations can subscribe to webhook events:

```typescript
interface WebhookPayload {
  event: string;
  timestamp: string;
  organization: {
    id: string;
    slug: string;
  };
  data: Record<string, unknown>;
}

// Available events
type WebhookEvent =
  | 'user.created'
  | 'user.deleted'
  | 'conversation.created'
  | 'conversation.completed'
  | 'message.sent'
  | 'character.created'
  | 'character.published'
  | 'subscription.created'
  | 'subscription.canceled';
```

### 8.3 Request/Response Examples

```bash
# Get branding
curl https://api.bostonia.ai/v1/organizations/acme-corp/branding

{
  "logoUrl": "https://assets.bostonia.ai/organizations/uuid/logo.png",
  "faviconUrl": "https://assets.bostonia.ai/organizations/uuid/favicon.ico",
  "primaryColor": "#1a1a2e",
  "secondaryColor": "#16213e",
  "appName": "ACME Chat",
  "welcomeMessage": "Welcome to ACME's AI Assistant",
  "footerText": "Powered by ACME Corp",
  "supportEmail": "support@acme.com"
}

# Update branding
curl -X PUT https://api.bostonia.ai/v1/admin/organization/branding \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "primaryColor": "#ff6b6b",
    "secondaryColor": "#4ecdc4",
    "appName": "ACME Assistant"
  }'

# Verify domain
curl -X POST https://api.bostonia.ai/v1/admin/organization/domains/uuid/verify \
  -H "Authorization: Bearer $TOKEN"

{
  "id": "uuid",
  "domain": "chat.acme.com",
  "status": "VERIFIED",
  "verifiedAt": "2026-01-29T10:00:00Z"
}
```

---

## 9. Security Considerations

### 9.1 Tenant Isolation Checklist

- [ ] All database queries include tenant filter
- [ ] API endpoints validate tenant access
- [ ] File storage paths include tenant ID
- [ ] Cache keys include tenant ID
- [ ] Logs include tenant ID for tracing
- [ ] Rate limits are per-tenant

### 9.2 Access Control Matrix

| Resource | Platform Admin | Org Owner | Org Admin | Org Member |
|----------|---------------|-----------|-----------|------------|
| View org settings | Yes | Yes | Yes | No |
| Edit org settings | Yes | Yes | No | No |
| Manage branding | Yes | Yes | Yes | No |
| Manage members | Yes | Yes | Yes | No |
| Manage domains | Yes | Yes | No | No |
| Delete organization | Yes | Yes | No | No |
| View analytics | Yes | Yes | Yes | No |

### 9.3 Data Encryption

```yaml
At Rest:
  - Database: AES-256 (RDS encryption)
  - File Storage: Server-side encryption (S3)
  - Backups: Encrypted with customer-specific keys

In Transit:
  - TLS 1.3 for all connections
  - Certificate pinning for mobile apps

Sensitive Fields:
  - API keys: bcrypt hashed
  - Webhook secrets: AES-256 encrypted
  - SSO credentials: Vault storage
```

### 9.4 Audit Logging

```typescript
interface AuditLog {
  id: string;
  organizationId: string;
  actorId: string;         // User who performed action
  actorType: 'user' | 'system' | 'api';
  action: string;          // e.g., 'branding.updated'
  resource: string;        // e.g., 'organization'
  resourceId: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}
```

---

## 10. Deployment Strategy

### 10.1 Infrastructure Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                      ┌───────────────┐                          │
│                      │  Cloudflare   │                          │
│                      │  (CDN + SSL)  │                          │
│                      └───────┬───────┘                          │
│                              │                                   │
│              ┌───────────────┴───────────────┐                  │
│              │                               │                   │
│       ┌──────▼──────┐               ┌───────▼──────┐           │
│       │   Vercel    │               │     AWS      │           │
│       │  (Frontend) │               │   (Backend)  │           │
│       └─────────────┘               └──────────────┘           │
│                                            │                    │
│                    ┌───────────────────────┼─────────────┐      │
│                    │                       │             │      │
│             ┌──────▼──────┐         ┌──────▼────┐  ┌────▼────┐ │
│             │    RDS      │         │   Redis   │  │   S3    │ │
│             │ (Postgres)  │         │  (Cache)  │  │ (Assets)│ │
│             └─────────────┘         └───────────┘  └─────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Environment Configuration

```yaml
# Environment variables per deployment
PLATFORM_DOMAIN: bostonia.ai
DATABASE_URL: postgres://...
REDIS_URL: redis://...
ASSET_BUCKET: bostonia-assets
CLOUDFLARE_ZONE_ID: ...
CLOUDFLARE_API_TOKEN: ...

# Feature flags
ENABLE_WHITE_LABEL: true
ENABLE_CUSTOM_DOMAINS: true
DEFAULT_TENANT_FEATURES: '{"voiceEnabled":true,...}'
```

### 10.3 Scaling Considerations

| Component | Scaling Strategy | Notes |
|-----------|-----------------|-------|
| Frontend | Vercel auto-scale | Edge caching for branding |
| API | Horizontal (EKS) | Stateless services |
| Database | Vertical + Read replicas | Consider sharding at scale |
| Cache | Redis Cluster | Tenant-prefixed keys |
| Assets | CDN + S3 | Per-tenant paths |

---

## 11. Migration Guide

### 11.1 Adding Tenant Support to Existing Data

```sql
-- Add organization columns
ALTER TABLE users ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE characters ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE conversations ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- Create indexes
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_characters_org ON characters(organization_id);
CREATE INDEX idx_conversations_org ON conversations(organization_id);

-- Existing data remains with NULL organization_id (platform data)
```

### 11.2 Service Migration Steps

1. **Phase 1: Schema Changes**
   - Add organization tables
   - Add organizationId to tenant-scoped tables
   - Deploy schema changes (zero-downtime)

2. **Phase 2: Middleware Deployment**
   - Deploy tenant middleware to all services
   - Initially returns null tenant (backward compatible)
   - Verify no regressions

3. **Phase 3: Query Updates**
   - Update all queries to include tenant filter
   - Deploy incrementally per service
   - Existing data (organizationId=null) continues to work

4. **Phase 4: Enable White-Label**
   - Enable organization creation
   - Enable custom domains
   - Onboard first enterprise customer

### 11.3 Rollback Plan

```bash
# If issues arise, rollback in reverse order:

# 1. Disable new organization signups
UPDATE feature_flags SET enabled = false WHERE name = 'white_label_signup';

# 2. Redirect custom domains to maintenance page
# (Update Cloudflare rules)

# 3. Revert to previous API version
kubectl rollout undo deployment/api-service

# 4. Schema changes are additive, no rollback needed
```

---

## 12. Future Considerations

### 12.1 Phase 4+ Features

| Feature | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| SSO Integration | High | Medium | SAML/OIDC support |
| Data Export | High | Low | GDPR compliance |
| Custom Email Templates | Medium | Low | Per-tenant emails |
| White-Label Mobile | Medium | High | Separate app builds |
| Data Residency | Low | High | Regional databases |
| Custom AI Models | Low | High | Per-tenant fine-tuning |

### 12.2 Enterprise SSO Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         SSO FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User visits tenant domain                                       │
│        │                                                         │
│        ▼                                                         │
│  ┌──────────────┐                                               │
│  │ Check SSO    │                                               │
│  │ enabled      │                                               │
│  └──────┬───────┘                                               │
│         │ Yes                                                    │
│         ▼                                                         │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │ Redirect to  │────────▶│ IdP (Okta/   │                      │
│  │ IdP          │         │ Azure AD)    │                      │
│  └──────────────┘         └──────┬───────┘                      │
│                                   │                              │
│                                   ▼                              │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │ Validate     │◀────────│ SAML/OIDC    │                      │
│  │ Response     │         │ Response     │                      │
│  └──────┬───────┘         └──────────────┘                      │
│         │                                                        │
│         ▼                                                         │
│  ┌──────────────┐                                               │
│  │ Create/Update│                                               │
│  │ User Session │                                               │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.3 Analytics Segregation

Future: Per-tenant analytics dashboards

```typescript
interface TenantAnalytics {
  overview: {
    totalUsers: number;
    activeUsers: number;
    totalConversations: number;
    messagesThisMonth: number;
  };
  usage: {
    messagesPerDay: DataPoint[];
    activeUsersPerDay: DataPoint[];
    topCharacters: Character[];
  };
  engagement: {
    averageSessionDuration: number;
    messagesPerSession: number;
    returnRate: number;
  };
}
```

---

## Appendix A: Configuration Reference

### A.1 Organization Settings Schema

```typescript
const OrganizationSettingsSchema = z.object({
  features: z.object({
    voiceEnabled: z.boolean().default(true),
    imageGeneration: z.boolean().default(false),
    customCharacters: z.boolean().default(true),
    apiAccess: z.boolean().default(false),
    memoryNexus: z.boolean().default(true),
    multiCharacter: z.boolean().default(false),
  }).default({}),

  limits: z.object({
    maxUsers: z.number().int().min(0).default(0),
    maxCharacters: z.number().int().min(0).default(100),
    maxConversationsPerUser: z.number().int().min(0).default(100),
    monthlyMessageLimit: z.number().int().min(0).default(0),
    maxTokensPerMessage: z.number().int().min(100).max(4000).default(2000),
  }).default({}),

  content: z.object({
    allowNsfw: z.boolean().default(false),
    defaultContentFilter: z.enum(['strict', 'moderate', 'relaxed']).default('moderate'),
    blockedCategories: z.array(z.string()).default([]),
  }).default({}),

  integrations: z.object({
    ssoEnabled: z.boolean().default(false),
    ssoProvider: z.enum(['okta', 'azure', 'google']).nullable().default(null),
    ssoConfig: z.record(z.unknown()).default({}),
    webhookUrl: z.string().url().nullable().default(null),
    webhookEvents: z.array(z.string()).default([]),
  }).default({}),
});
```

### A.2 Branding Metadata Schema

```typescript
const BrandingMetadataSchema = z.object({
  fonts: z.object({
    heading: z.string().optional(),
    body: z.string().optional(),
  }).optional(),

  cssVariables: z.record(z.string()).optional(),

  social: z.object({
    twitter: z.string().url().optional(),
    discord: z.string().url().optional(),
    website: z.string().url().optional(),
  }).optional(),

  analytics: z.object({
    googleAnalyticsId: z.string().optional(),
    mixpanelToken: z.string().optional(),
  }).optional(),

  legal: z.object({
    termsUrl: z.string().url().optional(),
    privacyUrl: z.string().url().optional(),
  }).optional(),
});
```

---

*Document Version: 1.0*
*Last Updated: January 29, 2026*
*Author: System Architecture Team*
