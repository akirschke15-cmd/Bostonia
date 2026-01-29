/**
 * Tenant Context Middleware for White-Label Multi-tenancy
 *
 * This middleware extracts tenant information from incoming requests and
 * provides helpers for tenant-scoped database queries.
 *
 * Tenant Resolution Priority:
 * 1. Custom domain (e.g., chat.acme.com)
 * 2. Subdomain (e.g., acme.bostonia.ai)
 * 3. X-Tenant-ID header (for API clients)
 *
 * @module middleware/tenant
 */

import type { Request, Response, NextFunction } from 'express';

// ============================================================================
// Types
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  isActive: boolean;
  settings: OrganizationSettings;
}

export interface OrganizationBranding {
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  appName: string | null;
  customCss: string | null;
  welcomeMessage: string | null;
  footerText: string | null;
  supportEmail: string | null;
  metadata: Record<string, unknown>;
}

export interface OrganizationSettings {
  // Feature flags
  features?: {
    voiceEnabled?: boolean;
    imageGeneration?: boolean;
    customCharacters?: boolean;
    apiAccess?: boolean;
  };
  // Limits and quotas
  limits?: {
    maxUsers?: number;
    maxCharacters?: number;
    maxConversationsPerUser?: number;
    monthlyMessageLimit?: number;
  };
  // Content settings
  content?: {
    allowNsfw?: boolean;
    defaultContentFilter?: 'strict' | 'moderate' | 'relaxed';
  };
  // Integration settings
  integrations?: {
    ssoEnabled?: boolean;
    ssoProvider?: string;
    webhookUrl?: string;
  };
}

export interface TenantContext {
  organizationId: string | null;
  organization: Organization | null;
  branding: OrganizationBranding | null;
  isWhiteLabel: boolean;
  resolvedFrom: 'domain' | 'subdomain' | 'header' | 'none';
}

export interface TenantRequest extends Request {
  tenant: TenantContext;
}

// ============================================================================
// Configuration
// ============================================================================

export interface TenantMiddlewareConfig {
  /**
   * Primary platform domain (e.g., "bostonia.ai")
   */
  platformDomain: string;

  /**
   * Function to look up organization by custom domain
   */
  findByDomain: (domain: string) => Promise<Organization | null>;

  /**
   * Function to look up organization by slug (subdomain)
   */
  findBySlug: (slug: string) => Promise<Organization | null>;

  /**
   * Function to look up organization by ID (header)
   */
  findById: (id: string) => Promise<Organization | null>;

  /**
   * Function to get branding for an organization
   */
  getBranding: (organizationId: string) => Promise<OrganizationBranding | null>;

  /**
   * Optional: Skip tenant resolution for certain paths
   */
  skipPaths?: string[];

  /**
   * Optional: Header name for tenant ID (default: "X-Tenant-ID")
   */
  tenantHeader?: string;
}

// ============================================================================
// Default Branding (Platform defaults)
// ============================================================================

export const DEFAULT_BRANDING: OrganizationBranding = {
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#6366f1', // Indigo-500
  secondaryColor: '#8b5cf6', // Violet-500
  appName: 'Bostonia',
  customCss: null,
  welcomeMessage: null,
  footerText: null,
  supportEmail: null,
  metadata: {},
};

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Creates tenant context middleware
 *
 * @example
 * ```typescript
 * import { createTenantMiddleware } from '@bostonia/shared/middleware/tenant';
 * import { prisma } from './db';
 *
 * const tenantMiddleware = createTenantMiddleware({
 *   platformDomain: 'bostonia.ai',
 *   findByDomain: (domain) => prisma.organization.findUnique({ where: { domain } }),
 *   findBySlug: (slug) => prisma.organization.findUnique({ where: { slug } }),
 *   findById: (id) => prisma.organization.findUnique({ where: { id } }),
 *   getBranding: (orgId) => prisma.organizationBranding.findUnique({
 *     where: { organizationId: orgId }
 *   }),
 * });
 *
 * app.use(tenantMiddleware);
 * ```
 */
export function createTenantMiddleware(config: TenantMiddlewareConfig) {
  const {
    platformDomain,
    findByDomain,
    findBySlug,
    findById,
    getBranding,
    skipPaths = [],
    tenantHeader = 'X-Tenant-ID',
  } = config;

  return async function tenantMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // Initialize default tenant context
    const tenantContext: TenantContext = {
      organizationId: null,
      organization: null,
      branding: null,
      isWhiteLabel: false,
      resolvedFrom: 'none',
    };

    // Check if path should skip tenant resolution
    if (skipPaths.some((path) => req.path.startsWith(path))) {
      (req as TenantRequest).tenant = tenantContext;
      return next();
    }

    try {
      let organization: Organization | null = null;

      // 1. Try custom domain resolution
      const host = req.hostname || req.get('host') || '';
      const hostWithoutPort = host.split(':')[0] || '';

      if (hostWithoutPort && !hostWithoutPort.endsWith(platformDomain)) {
        // This is a custom domain
        organization = await findByDomain(hostWithoutPort);
        if (organization) {
          tenantContext.resolvedFrom = 'domain';
        }
      }

      // 2. Try subdomain resolution if no custom domain match
      if (!organization && hostWithoutPort && hostWithoutPort.endsWith(platformDomain)) {
        const subdomain = extractSubdomain(hostWithoutPort, platformDomain);
        if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
          organization = await findBySlug(subdomain);
          if (organization) {
            tenantContext.resolvedFrom = 'subdomain';
          }
        }
      }

      // 3. Try header-based resolution if no domain/subdomain match
      if (!organization) {
        const tenantId = req.get(tenantHeader);
        if (tenantId) {
          organization = await findById(tenantId);
          if (organization) {
            tenantContext.resolvedFrom = 'header';
          }
        }
      }

      // Populate tenant context if organization found
      if (organization) {
        if (!organization.isActive) {
          // Organization is deactivated
          res.status(403).json({
            error: 'Organization is not active',
            code: 'ORGANIZATION_INACTIVE',
          });
          return;
        }

        tenantContext.organizationId = organization.id;
        tenantContext.organization = organization;
        tenantContext.isWhiteLabel = true;

        // Load branding
        const branding = await getBranding(organization.id);
        tenantContext.branding = branding || {
          ...DEFAULT_BRANDING,
          appName: organization.name,
        };
      }

      // Attach tenant context to request
      (req as TenantRequest).tenant = tenantContext;
      next();
    } catch (error) {
      console.error('[TenantMiddleware] Error resolving tenant:', error);
      // Continue without tenant context on error (graceful degradation)
      (req as TenantRequest).tenant = tenantContext;
      next();
    }
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract subdomain from hostname
 */
function extractSubdomain(hostname: string, platformDomain: string): string | null {
  // Remove platform domain suffix
  const withoutPlatform = hostname.replace(`.${platformDomain}`, '');

  // If nothing remains or it's the same, no subdomain
  if (!withoutPlatform || withoutPlatform === hostname) {
    return null;
  }

  // Return the subdomain (handle nested subdomains by taking the first part)
  return withoutPlatform.split('.')[0] ?? null;
}

/**
 * Create a Prisma query filter for tenant-scoped queries
 *
 * @example
 * ```typescript
 * // In a route handler
 * const filter = createTenantFilter(req.tenant);
 *
 * // Query characters within tenant scope
 * const characters = await prisma.character.findMany({
 *   where: {
 *     ...filter,
 *     status: 'PUBLISHED',
 *   },
 * });
 * ```
 */
export function createTenantFilter(tenant: TenantContext): { organizationId?: string | null } {
  if (tenant.isWhiteLabel && tenant.organizationId) {
    // White-label tenant: only show tenant's data
    return { organizationId: tenant.organizationId };
  }

  // Platform users: show data without organization (null) OR marked as public
  // Note: Adjust this logic based on your data sharing requirements
  return { organizationId: null };
}

/**
 * Create a Prisma query filter that includes both platform and tenant data
 * Useful for searching across shared content
 *
 * @example
 * ```typescript
 * const filter = createTenantFilterWithPlatform(req.tenant);
 *
 * const characters = await prisma.character.findMany({
 *   where: {
 *     OR: [
 *       filter.tenantOnly,
 *       { visibility: 'PUBLIC', organizationId: null },
 *     ],
 *   },
 * });
 * ```
 */
export function createTenantFilterWithPlatform(tenant: TenantContext) {
  return {
    tenantOnly: createTenantFilter(tenant),
    includePlatform: { organizationId: null },
  };
}

/**
 * Validate that a user belongs to the current tenant
 */
export function validateUserTenant(
  userOrganizationId: string | null,
  tenant: TenantContext
): boolean {
  if (!tenant.isWhiteLabel) {
    // Platform context: user should not have an organization
    return userOrganizationId === null;
  }

  // White-label context: user must belong to this organization
  return userOrganizationId === tenant.organizationId;
}

/**
 * Get the effective app name for display
 */
export function getEffectiveAppName(tenant: TenantContext): string {
  if (tenant.branding?.appName) {
    return tenant.branding.appName;
  }
  if (tenant.organization?.name) {
    return tenant.organization.name;
  }
  return 'Bostonia';
}

/**
 * Generate CSS variables from branding
 */
export function generateBrandingCssVariables(branding: OrganizationBranding): string {
  const variables: Record<string, string> = {
    '--brand-primary': branding.primaryColor,
    '--brand-secondary': branding.secondaryColor,
  };

  // Add any additional CSS variables from metadata
  if (branding.metadata && typeof branding.metadata === 'object') {
    const meta = branding.metadata as Record<string, unknown>;
    const cssVars = meta['cssVariables'];
    if (cssVars && typeof cssVars === 'object') {
      Object.entries(cssVars as Record<string, string>).forEach(([key, value]) => {
        if (typeof value === 'string') {
          variables[key] = value;
        }
      });
    }
  }

  return Object.entries(variables)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n');
}

/**
 * Type guard to check if request has tenant context
 */
export function hasTenantContext(req: Request): req is TenantRequest {
  return 'tenant' in req && req.tenant !== undefined;
}

// ============================================================================
// Express Request Type Augmentation
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export default createTenantMiddleware;
