'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { authApi, api } from '@/lib/api';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const accessToken = searchParams.get('accessToken');
      const refreshToken = searchParams.get('refreshToken');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setStatus('error');
        setError(decodeURIComponent(errorParam));
        return;
      }

      if (!accessToken || !refreshToken) {
        setStatus('error');
        setError('Missing authentication tokens');
        return;
      }

      try {
        // Set the access token for API calls
        api.setAccessToken(accessToken);

        // Fetch user data
        const response = await authApi.me();

        if (response.success && response.data) {
          const user = response.data as {
            id: string;
            email: string;
            username: string;
            displayName: string | null;
            avatarUrl: string | null;
            role: string;
            credits: number;
            subscriptionTier: string;
          };

          // Store auth state
          setAuth(
            {
              id: user.id,
              email: user.email,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
              role: user.role,
              credits: user.credits,
              subscriptionTier: user.subscriptionTier,
            },
            accessToken,
            refreshToken
          );

          setStatus('success');

          // Redirect to dashboard after a short delay
          setTimeout(() => {
            router.push('/dashboard');
          }, 1500);
        } else {
          throw new Error('Failed to fetch user data');
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setStatus('error');
        setError('Authentication failed. Please try again.');
      }
    };

    handleCallback();
  }, [searchParams, setAuth, router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-8">
        {status === 'loading' && (
          <>
            <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-2">Signing you in...</h1>
            <p className="text-muted-foreground">
              Please wait while we complete your authentication.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-2">Welcome!</h1>
            <p className="text-muted-foreground">
              Authentication successful. Redirecting to your dashboard...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-2">Authentication Failed</h1>
            <p className="text-muted-foreground mb-6">
              {error || 'Something went wrong during authentication.'}
            </p>
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
