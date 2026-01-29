'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Sparkles, Mail, Lock, Loader2 } from 'lucide-react';
import { authApi, api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const response = await authApi.login(data);
      if (response.success && response.data) {
        const { user, accessToken, refreshToken } = response.data as any;
        api.setAccessToken(accessToken);
        setAuth(user, accessToken, refreshToken);
        toast.success('Welcome back!');
        router.push('/characters');
      } else {
        toast.error(response.error?.message || 'Login failed');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-space-950 starfield p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
            <Sparkles className="h-8 w-8 text-primary-400 group-hover:text-accent-400 transition-colors animate-pulse-subtle" />
            <span className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">Bostonia</span>
          </Link>
          <h1 className="text-2xl font-semibold text-space-50">Welcome back</h1>
          <p className="text-space-400 mt-2">
            Sign in to continue to Bostonia
          </p>
        </div>

        <div className="cosmic-card rounded-xl p-6 shadow-xl shadow-primary-500/10">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5 text-space-200">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-space-500" />
                <input
                  {...register('email')}
                  type="email"
                  id="email"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-space-700 bg-space-900/50 text-space-100 placeholder:text-space-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="you@example.com"
                />
              </div>
              {errors.email && (
                <p className="text-sm text-red-400 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5 text-space-200">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-space-500" />
                <input
                  {...register('password')}
                  type="password"
                  id="password"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-space-700 bg-space-900/50 text-space-100 placeholder:text-space-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Enter your password"
                />
              </div>
              {errors.password && (
                <p className="text-sm text-red-400 mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-primary-500 to-accent-500 text-white hover:from-primary-400 hover:to-accent-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-space-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-space-900 text-space-400">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <a
                href="/api/auth/google"
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-space-700 bg-space-800/50 text-space-200 hover:bg-space-700 hover:border-space-600 transition-all"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </a>
              <a
                href="/api/auth/discord"
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-space-700 bg-space-800/50 text-space-200 hover:bg-space-700 hover:border-space-600 transition-all"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                Discord
              </a>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-space-400">
            Don't have an account?{' '}
            <Link href="/register" className="text-primary-400 hover:text-primary-300 transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
