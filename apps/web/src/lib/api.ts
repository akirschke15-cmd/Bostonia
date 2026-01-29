import type { ApiResponse } from '@bostonia/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

type FetchOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>;
};

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
    const url = new URL(path, this.baseUrl || window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return url.toString();
  }

  private async request<T>(
    path: string,
    options: FetchOptions = {}
  ): Promise<ApiResponse<T>> {
    const { params, ...fetchOptions } = options;
    const url = this.buildUrl(path, params);

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    };

    if (this.accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
    });

    const data = await response.json();
    return data as ApiResponse<T>;
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>) {
    return this.request<T>(path, { method: 'GET', params });
  }

  async post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE);

// Auth API
export const authApi = {
  register: (data: { email: string; password: string; username: string }) =>
    api.post('/api/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post('/api/auth/login', data),

  logout: () => api.post('/api/auth/logout'),

  refresh: (refreshToken: string) =>
    api.post('/api/auth/refresh', { refreshToken }),

  me: () => api.get('/api/auth/me'),
};

// Characters API
export const charactersApi = {
  list: (params?: { page?: number; limit?: number; query?: string; category?: string }) =>
    api.get('/api/characters', params),

  featured: () => api.get('/api/characters/featured'),

  get: (id: string) => api.get(`/api/characters/${id}`),

  create: (data: unknown) => api.post('/api/characters', data),

  update: (id: string, data: unknown) => api.patch(`/api/characters/${id}`, data),

  delete: (id: string) => api.delete(`/api/characters/${id}`),

  rate: (id: string, rating: number) =>
    api.post(`/api/characters/${id}/rate`, { rating }),

  favorite: (id: string) => api.post(`/api/characters/${id}/favorite`),

  categories: () => api.get('/api/characters/meta/categories'),

  // Remix endpoints (Week 12)
  remix: (id: string, data?: { name?: string; tagline?: string; description?: string }) =>
    api.post(`/api/characters/${id}/remix`, data),

  getRemixes: (id: string, params?: { page?: number; limit?: number }) =>
    api.get(`/api/characters/${id}/remixes`, params),

  getRemixChain: (id: string, params?: { maxDepth?: number }) =>
    api.get(`/api/characters/${id}/remix-chain`, params),

  updateRemixSettings: (id: string, data: { allowRemix: boolean }) =>
    api.patch(`/api/characters/${id}/remix-settings`, data),
};

// Conversations API
export const conversationsApi = {
  list: (params?: { page?: number; limit?: number; characterId?: string }) =>
    api.get('/api/conversations', params),

  get: (id: string) => api.get(`/api/conversations/${id}`),

  create: (data: { characterId: string; title?: string; mode?: string }) =>
    api.post('/api/conversations', data),

  update: (id: string, data: { title?: string; status?: string }) =>
    api.patch(`/api/conversations/${id}`, data),

  messages: (id: string, params?: { page?: number; limit?: number }) =>
    api.get(`/api/conversations/${id}/messages`, params),

  sendMessage: (id: string, content: string) =>
    api.post(`/api/conversations/${id}/messages`, { content }),

  export: (id: string, format?: 'json' | 'txt') =>
    api.get(`/api/conversations/${id}/export`, { format }),

  delete: (id: string) => api.delete(`/api/conversations/${id}`),

  // Share endpoints (Week 12 - Shared Conversations)
  getShareStatus: (id: string) =>
    api.get(`/api/conversations/${id}/share`),

  share: (id: string, settings?: { allowComments?: boolean; showUsername?: boolean }) =>
    api.post(`/api/conversations/${id}/share`, { settings }),

  unshare: (id: string) =>
    api.delete(`/api/conversations/${id}/share`),

  updateShareSettings: (id: string, settings: { allowComments?: boolean; showUsername?: boolean }) =>
    api.patch(`/api/conversations/${id}/share`, { settings }),

  getShared: (token: string) =>
    api.get(`/api/shared/${token}`),
};

// Users API
export const usersApi = {
  get: (id: string) => api.get(`/api/users/${id}`),

  update: (id: string, data: unknown) => api.patch(`/api/users/${id}`, data),

  preferences: (id: string) => api.get(`/api/users/${id}/preferences`),

  updatePreferences: (id: string, data: unknown) =>
    api.patch(`/api/users/${id}/preferences`, data),

  favorites: (id: string, params?: { page?: number; limit?: number }) =>
    api.get(`/api/users/${id}/favorites`, params),

  credits: (id: string) => api.get(`/api/users/${id}/credits`),

  // Follow endpoints (Week 12 - Creator Following System)
  follow: (id: string) => api.post(`/api/users/${id}/follow`),

  unfollow: (id: string) => api.delete(`/api/users/${id}/follow`),

  getFollowers: (id: string, params?: { page?: number; limit?: number }) =>
    api.get(`/api/users/${id}/followers`, params),

  getFollowing: (id: string, params?: { page?: number; limit?: number }) =>
    api.get(`/api/users/${id}/following`, params),

  getFollowStatus: (id: string) => api.get(`/api/users/${id}/follow-status`),
};

// Payments API
export const paymentsApi = {
  pricing: () => api.get('/api/payments/pricing'),

  subscription: () => api.get('/api/payments/subscription'),

  checkoutSubscription: (data: { tier: string; successUrl: string; cancelUrl: string }) =>
    api.post('/api/payments/checkout/subscription', data),

  checkoutCredits: (data: { amount: number; successUrl: string; cancelUrl: string }) =>
    api.post('/api/payments/checkout/credits', data),

  cancelSubscription: () => api.post('/api/payments/subscription/cancel'),

  resumeSubscription: () => api.post('/api/payments/subscription/resume'),

  changeSubscription: (data: { tier: string }) =>
    api.post('/api/payments/subscription/change', data),

  invoices: (params?: { page?: number; limit?: number }) =>
    api.get('/api/payments/invoices', params),

  usage: () => api.get('/api/payments/usage'),

  portalSession: (returnUrl: string) =>
    api.post('/api/payments/portal', { returnUrl }),

  creditBalance: () => api.get('/api/payments/credits'),

  creditPackages: () => api.get('/api/payments/credit-packages'),
};
