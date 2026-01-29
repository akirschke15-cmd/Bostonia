'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sparkles,
  Menu,
  X,
  User,
  Settings,
  CreditCard,
  LogOut,
  MessageSquare,
  Heart,
  ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { cn, getInitials } from '@/lib/utils';

interface HeaderProps {
  transparent?: boolean;
}

export function Header({ transparent = false }: HeaderProps) {
  const pathname = usePathname();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    clearAuth();
    setUserMenuOpen(false);
  };

  const navLinks = [
    { href: '/characters', label: 'Characters' },
    { href: '/pricing', label: 'Pricing' },
  ];

  const userMenuItems = [
    { href: '/dashboard', label: 'Dashboard', icon: User },
    { href: '/dashboard', label: 'My Chats', icon: MessageSquare },
    { href: '/favorites', label: 'Favorites', icon: Heart },
    { href: '/settings', label: 'Settings', icon: Settings },
    { href: '/pricing', label: 'Billing', icon: CreditCard },
  ];

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-colors',
        transparent
          ? 'bg-transparent border-transparent'
          : 'bg-space-950/90 backdrop-blur-md border-space-800/50'
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <Sparkles className="h-6 w-6 text-primary-400 group-hover:text-accent-400 transition-colors animate-pulse-subtle" />
            <span className="text-xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">Bostonia</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'text-sm font-medium transition-colors hover:text-primary',
                  pathname === link.href
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Auth */}
          <div className="hidden md:flex items-center gap-4">
            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-1.5 rounded-full hover:bg-muted transition-colors"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName || user.username}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                      {getInitials(user.displayName || user.username)}
                    </div>
                  )}
                  <ChevronDown className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    userMenuOpen && 'rotate-180'
                  )} />
                </button>

                {/* User Dropdown */}
                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-space-900/95 backdrop-blur-md border border-space-700/50 rounded-xl shadow-lg shadow-primary-500/10 py-2 z-50">
                      <div className="px-4 py-2 border-b border-border">
                        <p className="font-medium truncate">
                          {user.displayName || user.username}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {user.email}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                            {user.credits?.toLocaleString() || 0} credits
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-muted rounded-full capitalize">
                            {user.subscriptionTier || 'Free'}
                          </span>
                        </div>
                      </div>

                      <div className="py-1">
                        {userMenuItems.map((item) => (
                          <Link
                            key={item.href + item.label}
                            href={item.href}
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted transition-colors"
                          >
                            <item.icon className="h-4 w-4 text-muted-foreground" />
                            {item.label}
                          </Link>
                        ))}
                      </div>

                      <div className="border-t border-border pt-1">
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-3 w-full px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/login?tab=register"
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-accent-500 text-white text-sm font-medium hover:from-primary-400 hover:to-accent-400 transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    pathname === link.href
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  {link.label}
                </Link>
              ))}

              {isAuthenticated && user ? (
                <>
                  <div className="h-px bg-border my-2" />
                  {userMenuItems.map((item) => (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                    >
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      {item.label}
                    </Link>
                  ))}
                  <button
                    onClick={() => {
                      handleLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-destructive hover:bg-muted transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <div className="h-px bg-border my-2" />
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/login?tab=register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mx-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium text-center hover:bg-primary/90 transition-colors"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
