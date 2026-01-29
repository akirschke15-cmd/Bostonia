import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { successResponse, ErrorCodes } from '@bostonia/shared';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { AppError } from '../middleware/error-handler.js';
import { apiKeyService, type ApiKeyScope } from '../services/api-key.service.js';

export const apiKeyRouter: Router = Router();

// Validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  scopes: z
    .array(z.enum(['read', 'write', 'admin']))
    .min(1, 'At least one scope is required')
    .default(['read']),
  rateLimit: z.number().int().positive().max(10000).nullable().optional(),
  expiresAt: z
    .string()
    .datetime()
    .transform(val => new Date(val))
    .nullable()
    .optional(),
  description: z.string().max(500).nullable().optional(),
});

const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.enum(['read', 'write', 'admin'])).min(1).optional(),
  isActive: z.boolean().optional(),
  rateLimit: z.number().int().positive().max(10000).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

// ============================================================================
// POST /api-keys - Create a new API key
// ============================================================================
apiKeyRouter.post(
  '/',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const validatedData = createApiKeySchema.parse(req.body);

      const result = await apiKeyService.createApiKey(userId, {
        name: validatedData.name,
        scopes: validatedData.scopes as ApiKeyScope[],
        rateLimit: validatedData.rateLimit ?? null,
        expiresAt: validatedData.expiresAt ?? null,
        description: validatedData.description ?? null,
      });

      // Return the full key only once - it cannot be retrieved again
      res.status(201).json(
        successResponse({
          apiKey: result.apiKey,
          key: result.key,
          warning: 'Store this key securely. It will not be shown again.',
        })
      );
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /api-keys - List all API keys for the authenticated user
// ============================================================================
apiKeyRouter.get(
  '/',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const apiKeys = await apiKeyService.listApiKeys(userId);

      res.json(successResponse({ apiKeys }));
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /api-keys/:id - Get a specific API key's details
// ============================================================================
apiKeyRouter.get(
  '/:id',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;
      const { id } = req.params;

      if (!id) {
        throw new AppError(ErrorCodes.INVALID_INPUT, 'API key ID is required');
      }

      const apiKey = await apiKeyService.getApiKey(id, userId);

      res.json(successResponse({ apiKey }));
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// PATCH /api-keys/:id - Update an API key
// ============================================================================
apiKeyRouter.patch(
  '/:id',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;
      const { id } = req.params;

      if (!id) {
        throw new AppError(ErrorCodes.INVALID_INPUT, 'API key ID is required');
      }

      const validatedData = updateApiKeySchema.parse(req.body);

      // Check if any update data was provided
      if (Object.keys(validatedData).length === 0) {
        throw new AppError(ErrorCodes.INVALID_INPUT, 'No update data provided');
      }

      const apiKey = await apiKeyService.updateApiKey(id, userId, {
        name: validatedData.name,
        scopes: validatedData.scopes as ApiKeyScope[] | undefined,
        isActive: validatedData.isActive,
        rateLimit: validatedData.rateLimit,
        description: validatedData.description,
      });

      res.json(successResponse({ apiKey }));
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// DELETE /api-keys/:id - Revoke (delete) an API key
// ============================================================================
apiKeyRouter.delete(
  '/:id',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;
      const { id } = req.params;

      if (!id) {
        throw new AppError(ErrorCodes.INVALID_INPUT, 'API key ID is required');
      }

      await apiKeyService.revokeApiKey(id, userId);

      res.json(successResponse({ message: 'API key revoked successfully' }));
    } catch (error) {
      next(error);
    }
  }
);
