'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  User,
  Settings,
  Heart,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { usersApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Header } from '@/components/header';
import {
  ProfileHeader,
  SettingsPanel,
  FavoritesSection,
  EditProfileModal,
} from '@/components/profile';
import { cn } from '@/lib/utils';

type TabType = 'overview' | 'settings' | 'favorites';

interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: string;
  createdAt: string;
  _count?: { characters: number };
}

interface UserPreferences {
  theme: string;
  language: string;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  defaultChatMode: string;
  contentFilter: string;
  autoSaveConversations: boolean;
}

interface FavoriteCharacter {
  id: string;
  name: string;
  tagline: string;
  avatarUrl: string | null;
  category: string;
  rating: number;
}

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user: authUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Handle URL query params for tab
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['overview', 'settings', 'favorites'].includes(tabParam)) {
      setActiveTab(tabParam as TabType);
    }
  }, [searchParams]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  // Fetch user profile
  const {
    data: profileData,
    isLoading: isLoadingProfile,
    error: profileError,
  } = useQuery({
    queryKey: ['user', authUser?.id],
    queryFn: () => usersApi.get(authUser!.id),
    enabled: !!authUser?.id,
  });

  // Fetch user preferences
  const {
    data: preferencesData,
    isLoading: isLoadingPreferences,
  } = useQuery({
    queryKey: ['preferences', authUser?.id],
    queryFn: () => usersApi.preferences(authUser!.id),
    enabled: !!authUser?.id,
  });

  // Fetch favorites
  const {
    data: favoritesData,
    isLoading: isLoadingFavorites,
  } = useQuery({
    queryKey: ['favorites', authUser?.id],
    queryFn: () => usersApi.favorites(authUser!.id, { limit: 8 }),
    enabled: !!authUser?.id,
  });

  const profile = profileData?.data as UserProfile | undefined;
  const preferences = preferencesData?.data as UserPreferences | undefined;
  const favorites = (favoritesData?.data || []) as FavoriteCharacter[];
  const favoritesTotal = favoritesData?.meta?.total;

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: User },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
    { id: 'favorites' as TabType, label: 'Favorites', icon: Heart },
  ];

  // Loading state
  if (!isAuthenticated || !authUser) {
    return (
      <div className="min-h-screen bg-space-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
      </div>
    );
  }

  // Error state
  if (profileError) {
    return (
      <div className="min-h-screen bg-space-950">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="cosmic-card rounded-xl p-8 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-space-50 mb-2">
                Failed to load profile
              </h2>
              <p className="text-space-400 mb-4">
                There was an error loading your profile. Please try again.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-400 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-space-950">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Back link */}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-space-400 hover:text-space-200 transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>

          {/* Profile Header */}
          <div className="cosmic-card rounded-2xl overflow-hidden mb-8">
            {isLoadingProfile ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
              </div>
            ) : profile ? (
              <ProfileHeader
                user={profile}
                isOwnProfile={true}
                onEditProfile={() => setIsEditModalOpen(true)}
              />
            ) : (
              <ProfileHeader
                user={{
                  id: authUser.id,
                  username: authUser.username,
                  displayName: authUser.displayName,
                  avatarUrl: authUser.avatarUrl,
                  bio: null,
                  role: authUser.role,
                  createdAt: new Date().toISOString(),
                }}
                isOwnProfile={true}
                onEditProfile={() => setIsEditModalOpen(true)}
              />
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-primary-500/20 to-accent-500/20 text-primary-300 border border-primary-500/30'
                    : 'text-space-400 hover:text-space-200 hover:bg-space-800/50'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="cosmic-card rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                      {authUser.credits?.toLocaleString() || 0}
                    </p>
                    <p className="text-sm text-space-400 mt-1">Credits</p>
                  </div>
                  <div className="cosmic-card rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold bg-gradient-to-r from-accent-400 to-stardust-400 bg-clip-text text-transparent capitalize">
                      {authUser.subscriptionTier || 'Free'}
                    </p>
                    <p className="text-sm text-space-400 mt-1">Plan</p>
                  </div>
                  <div className="cosmic-card rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold bg-gradient-to-r from-stardust-400 to-nova-400 bg-clip-text text-transparent">
                      {favoritesTotal || 0}
                    </p>
                    <p className="text-sm text-space-400 mt-1">Favorites</p>
                  </div>
                  <div className="cosmic-card rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold bg-gradient-to-r from-nova-400 to-primary-400 bg-clip-text text-transparent">
                      {profile?._count?.characters || 0}
                    </p>
                    <p className="text-sm text-space-400 mt-1">Characters</p>
                  </div>
                </div>

                {/* Recent Favorites Preview */}
                <FavoritesSection
                  favorites={favorites.slice(0, 4)}
                  isLoading={isLoadingFavorites}
                  total={favoritesTotal}
                  showViewAll={true}
                />

                {/* Quick Actions */}
                <div className="cosmic-card rounded-xl p-6">
                  <h3 className="font-semibold text-space-50 mb-4">Quick Actions</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Link
                      href="/characters"
                      className="flex flex-col items-center gap-2 p-4 rounded-lg bg-space-800/50 border border-space-700 hover:border-primary-500/50 transition-all text-center"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary-400" />
                      </div>
                      <span className="text-sm text-space-200">Browse Characters</span>
                    </Link>
                    <Link
                      href="/conversations"
                      className="flex flex-col items-center gap-2 p-4 rounded-lg bg-space-800/50 border border-space-700 hover:border-accent-500/50 transition-all text-center"
                    >
                      <div className="w-10 h-10 rounded-lg bg-accent-500/20 flex items-center justify-center">
                        <Settings className="h-5 w-5 text-accent-400" />
                      </div>
                      <span className="text-sm text-space-200">My Chats</span>
                    </Link>
                    <Link
                      href="/pricing"
                      className="flex flex-col items-center gap-2 p-4 rounded-lg bg-space-800/50 border border-space-700 hover:border-stardust-500/50 transition-all text-center"
                    >
                      <div className="w-10 h-10 rounded-lg bg-stardust-500/20 flex items-center justify-center">
                        <Heart className="h-5 w-5 text-stardust-400" />
                      </div>
                      <span className="text-sm text-space-200">Upgrade Plan</span>
                    </Link>
                    <button
                      onClick={() => setActiveTab('settings')}
                      className="flex flex-col items-center gap-2 p-4 rounded-lg bg-space-800/50 border border-space-700 hover:border-nova-500/50 transition-all text-center"
                    >
                      <div className="w-10 h-10 rounded-lg bg-nova-500/20 flex items-center justify-center">
                        <Settings className="h-5 w-5 text-nova-400" />
                      </div>
                      <span className="text-sm text-space-200">Settings</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <SettingsPanel
                userId={authUser.id}
                preferences={preferences || null}
                isLoading={isLoadingPreferences}
              />
            )}

            {/* Favorites Tab */}
            {activeTab === 'favorites' && (
              <FavoritesSection
                favorites={favorites}
                isLoading={isLoadingFavorites}
                total={favoritesTotal}
                showViewAll={false}
              />
            )}
          </div>
        </div>
      </main>

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        user={{
          id: authUser.id,
          username: authUser.username,
          displayName: profile?.displayName ?? authUser.displayName,
          avatarUrl: profile?.avatarUrl ?? authUser.avatarUrl,
          bio: profile?.bio ?? null,
        }}
      />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-space-950 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}
