'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  User,
  Bell,
  Palette,
  Shield,
  CreditCard,
  Save,
  Loader2,
} from 'lucide-react';
import { usersApi } from '@/lib/api';
import { useAuthStore, useUIStore } from '@/lib/store';
import { Header } from '@/components/header';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

type TabType = 'profile' | 'preferences' | 'notifications' | 'security';

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user, updateUser } = useAuthStore();
  const { theme, setTheme } = useUIStore();
  const [activeTab, setActiveTab] = useState<TabType>('profile');

  // Profile form state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');

  // Preferences state
  const [language, setLanguage] = useState('en');
  const [autoplay, setAutoplay] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);

  // Notifications state
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);

  // Fetch user preferences
  const { data: preferencesData } = useQuery({
    queryKey: ['preferences', user?.id],
    queryFn: () => usersApi.preferences(user!.id),
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (preferencesData?.data) {
      const prefs = preferencesData.data as any;
      setLanguage(prefs.language || 'en');
      setAutoplay(prefs.autoplayVoice ?? true);
      setShowOnlineStatus(prefs.showOnlineStatus ?? true);
      setEmailNotifications(prefs.emailNotifications ?? true);
      setPushNotifications(prefs.pushNotifications ?? true);
      setMarketingEmails(prefs.marketingEmails ?? false);
    }
  }, [preferencesData]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: () =>
      usersApi.update(user!.id, { displayName, bio, avatarUrl }),
    onSuccess: () => {
      updateUser({ displayName, avatarUrl });
      toast.success('Profile updated successfully');
    },
    onError: () => {
      toast.error('Failed to update profile');
    },
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: () =>
      usersApi.updatePreferences(user!.id, {
        theme,
        language,
        autoplayVoice: autoplay,
        showOnlineStatus,
        emailNotifications,
        pushNotifications,
        marketingEmails,
      }),
    onSuccess: () => {
      toast.success('Preferences saved');
    },
    onError: () => {
      toast.error('Failed to save preferences');
    },
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs = [
    { id: 'profile' as TabType, label: 'Profile', icon: User },
    { id: 'preferences' as TabType, label: 'Preferences', icon: Palette },
    { id: 'notifications' as TabType, label: 'Notifications', icon: Bell },
    { id: 'security' as TabType, label: 'Security', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/dashboard"
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Settings</h1>
              <p className="text-muted-foreground">
                Manage your account settings and preferences
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-8">
            {/* Sidebar */}
            <aside className="md:w-56 flex-shrink-0">
              <nav className="flex md:flex-col gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left',
                      activeTab === tab.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-muted-foreground'
                    )}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}

                <div className="h-px bg-border my-2 hidden md:block" />

                <Link
                  href="/pricing"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-muted text-muted-foreground transition-colors"
                >
                  <CreditCard className="h-4 w-4" />
                  Billing
                </Link>
              </nav>
            </aside>

            {/* Content */}
            <div className="flex-1">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="bg-card border border-border rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-6">Profile Information</h2>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your display name"
                        className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Bio
                      </label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Tell us about yourself..."
                        rows={3}
                        className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Avatar URL
                      </label>
                      <input
                        type="url"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        placeholder="https://example.com/avatar.jpg"
                        className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter a URL to an image for your profile picture
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={user.email}
                        disabled
                        className="w-full px-4 py-2 rounded-lg border border-input bg-muted text-muted-foreground cursor-not-allowed"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Email cannot be changed
                      </p>
                    </div>

                    <button
                      onClick={() => updateProfileMutation.mutate()}
                      disabled={updateProfileMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {updateProfileMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Changes
                    </button>
                  </div>
                </div>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <div className="bg-card border border-border rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-6">Preferences</h2>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Theme
                      </label>
                      <div className="flex gap-3">
                        {(['light', 'dark', 'system'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setTheme(t)}
                            className={cn(
                              'px-4 py-2 rounded-lg border text-sm font-medium transition-colors capitalize',
                              theme === t
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-input hover:bg-muted'
                            )}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Language
                      </label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="ja">Japanese</option>
                        <option value="ko">Korean</option>
                        <option value="zh">Chinese</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Autoplay Voice</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically play character voice messages
                        </p>
                      </div>
                      <button
                        onClick={() => setAutoplay(!autoplay)}
                        className={cn(
                          'w-12 h-6 rounded-full transition-colors relative',
                          autoplay ? 'bg-primary' : 'bg-muted'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                            autoplay ? 'translate-x-7' : 'translate-x-1'
                          )}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Show Online Status</p>
                        <p className="text-sm text-muted-foreground">
                          Let others see when you're online
                        </p>
                      </div>
                      <button
                        onClick={() => setShowOnlineStatus(!showOnlineStatus)}
                        className={cn(
                          'w-12 h-6 rounded-full transition-colors relative',
                          showOnlineStatus ? 'bg-primary' : 'bg-muted'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                            showOnlineStatus ? 'translate-x-7' : 'translate-x-1'
                          )}
                        />
                      </button>
                    </div>

                    <button
                      onClick={() => updatePreferencesMutation.mutate()}
                      disabled={updatePreferencesMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {updatePreferencesMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Preferences
                    </button>
                  </div>
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div className="bg-card border border-border rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-6">Notification Settings</h2>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Email Notifications</p>
                        <p className="text-sm text-muted-foreground">
                          Receive updates and alerts via email
                        </p>
                      </div>
                      <button
                        onClick={() => setEmailNotifications(!emailNotifications)}
                        className={cn(
                          'w-12 h-6 rounded-full transition-colors relative',
                          emailNotifications ? 'bg-primary' : 'bg-muted'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                            emailNotifications ? 'translate-x-7' : 'translate-x-1'
                          )}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Push Notifications</p>
                        <p className="text-sm text-muted-foreground">
                          Receive push notifications on your device
                        </p>
                      </div>
                      <button
                        onClick={() => setPushNotifications(!pushNotifications)}
                        className={cn(
                          'w-12 h-6 rounded-full transition-colors relative',
                          pushNotifications ? 'bg-primary' : 'bg-muted'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                            pushNotifications ? 'translate-x-7' : 'translate-x-1'
                          )}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Marketing Emails</p>
                        <p className="text-sm text-muted-foreground">
                          Receive news, updates, and promotional content
                        </p>
                      </div>
                      <button
                        onClick={() => setMarketingEmails(!marketingEmails)}
                        className={cn(
                          'w-12 h-6 rounded-full transition-colors relative',
                          marketingEmails ? 'bg-primary' : 'bg-muted'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                            marketingEmails ? 'translate-x-7' : 'translate-x-1'
                          )}
                        />
                      </button>
                    </div>

                    <button
                      onClick={() => updatePreferencesMutation.mutate()}
                      disabled={updatePreferencesMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {updatePreferencesMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Notifications
                    </button>
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <div className="bg-card border border-border rounded-xl p-6">
                    <h2 className="text-lg font-semibold mb-6">Change Password</h2>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Current Password
                        </label>
                        <input
                          type="password"
                          placeholder="Enter current password"
                          className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          New Password
                        </label>
                        <input
                          type="password"
                          placeholder="Enter new password"
                          className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          placeholder="Confirm new password"
                          className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                        Update Password
                      </button>
                    </div>
                  </div>

                  <div className="bg-card border border-destructive/50 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-destructive mb-4">
                      Danger Zone
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Once you delete your account, there is no going back. Please be
                      certain.
                    </p>
                    <button className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors">
                      Delete Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
