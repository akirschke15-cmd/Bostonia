'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Sparkles, Users, Zap, Brain, Shield, Star } from 'lucide-react';
import { Header } from '@/components/header';
import { charactersApi } from '@/lib/api';
import { getInitials } from '@/lib/utils';

interface Character {
  id: string;
  name: string;
  tagline: string;
  avatarUrl: string | null;
  category: string;
  rating: number;
}

export default function HomePage() {
  // Fetch featured characters
  const { data: featuredData } = useQuery({
    queryKey: ['featured-characters'],
    queryFn: () => charactersApi.featured(),
  });

  const featuredCharacters = (featuredData?.data || []).slice(0, 4) as Character[];

  return (
    <div className="min-h-screen bg-space-950 starfield">
      <Header transparent />

      {/* Hero */}
      <main className="container mx-auto px-4">
        <div className="py-20 md:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/20 border border-primary-500/30 text-primary-300 text-sm font-medium mb-6 animate-glow-pulse">
              <Sparkles className="h-4 w-4 animate-twinkle" />
              Powered by Claude AI
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary-400 via-accent-400 to-stardust-400 bg-clip-text text-transparent glow">
              Chat with AI Characters
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Engage in meaningful conversations with AI-powered characters.
              From philosophers to pirates, explore endless possibilities.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/characters"
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white hover:from-primary-400 hover:to-accent-400 transition-all hover:scale-105 text-lg font-medium shadow-lg shadow-primary-500/30 hover:shadow-primary-500/50"
              >
                Explore Characters
              </Link>
              <Link
                href="/register"
                className="px-8 py-4 rounded-xl border border-space-600 hover:border-primary-500/50 hover:bg-space-800/50 transition-all text-lg font-medium text-space-100"
              >
                Get Started Free
              </Link>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap justify-center gap-8 mt-16 text-center">
              <div className="px-6 py-4 rounded-xl bg-space-900/50 border border-space-700/50 backdrop-blur-sm">
                <p className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">200+</p>
                <p className="text-space-300">Characters</p>
              </div>
              <div className="px-6 py-4 rounded-xl bg-space-900/50 border border-space-700/50 backdrop-blur-sm">
                <p className="text-3xl font-bold bg-gradient-to-r from-accent-400 to-stardust-400 bg-clip-text text-transparent">50K+</p>
                <p className="text-space-300">Conversations</p>
              </div>
              <div className="px-6 py-4 rounded-xl bg-space-900/50 border border-space-700/50 backdrop-blur-sm">
                <p className="text-3xl font-bold bg-gradient-to-r from-stardust-400 to-primary-400 bg-clip-text text-transparent">4.9</p>
                <p className="text-space-300">User Rating</p>
              </div>
            </div>
          </div>
        </div>

        {/* Featured Characters */}
        {featuredCharacters.length > 0 && (
          <section className="py-16">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Featured Characters</h2>
              <p className="text-muted-foreground">Meet some of our most popular AI companions</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredCharacters.map((character) => (
                <Link
                  key={character.id}
                  href={`/characters/${character.id}`}
                  className="group cosmic-card rounded-xl p-6 hover:shadow-xl hover:shadow-primary-500/20 transition-all"
                >
                  <div className="flex flex-col items-center text-center">
                    {character.avatarUrl ? (
                      <img
                        src={character.avatarUrl}
                        alt={character.name}
                        className="w-20 h-20 rounded-full object-cover mb-4 group-hover:scale-105 transition-transform ring-2 ring-primary-500/30 group-hover:ring-primary-400/60"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-2xl mb-4 group-hover:scale-105 transition-transform shadow-lg shadow-primary-500/30">
                        {getInitials(character.name)}
                      </div>
                    )}
                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                      {character.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {character.tagline}
                    </p>
                    <div className="flex items-center gap-1 mt-3 text-sm">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <span>{character.rating.toFixed(1)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link
                href="/characters"
                className="text-primary hover:underline font-medium"
              >
                View all characters &rarr;
              </Link>
            </div>
          </section>
        )}

        {/* Features */}
        <section className="py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Choose Bostonia?</h2>
            <p className="text-muted-foreground">Experience the next generation of AI conversation</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl cosmic-card group hover:shadow-lg hover:shadow-primary-500/10 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500/20 to-primary-500/10 border border-primary-500/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MessageSquare className="h-6 w-6 text-primary-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-space-50">Natural Conversations</h3>
              <p className="text-space-300">
                Powered by Claude AI, our characters engage in nuanced, context-aware dialogue that feels genuinely human.
              </p>
            </div>
            <div className="p-8 rounded-2xl cosmic-card group hover:shadow-lg hover:shadow-accent-500/10 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500/20 to-accent-500/10 border border-accent-500/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="h-6 w-6 text-accent-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-space-50">Diverse Characters</h3>
              <p className="text-space-300">
                Choose from hundreds of unique characters across every genre, or create your own with our intuitive builder.
              </p>
            </div>
            <div className="p-8 rounded-2xl cosmic-card group hover:shadow-lg hover:shadow-stardust-500/10 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-stardust-500/20 to-stardust-500/10 border border-stardust-500/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Brain className="h-6 w-6 text-stardust-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-space-50">Memory System</h3>
              <p className="text-space-300">
                Characters remember your conversations and build meaningful relationships with you over time.
              </p>
            </div>
            <div className="p-8 rounded-2xl cosmic-card group hover:shadow-lg hover:shadow-nova-500/10 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-nova-500/20 to-nova-500/10 border border-nova-500/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="h-6 w-6 text-nova-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-space-50">Real-time Streaming</h3>
              <p className="text-space-300">
                Watch responses appear in real-time with our streaming technology for a more immersive experience.
              </p>
            </div>
            <div className="p-8 rounded-2xl cosmic-card group hover:shadow-lg hover:shadow-green-500/10 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-green-500/10 border border-green-500/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Shield className="h-6 w-6 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-space-50">Safe & Moderated</h3>
              <p className="text-space-300">
                Our AI moderation system ensures all conversations remain safe and appropriate for all users.
              </p>
            </div>
            <div className="p-8 rounded-2xl cosmic-card group hover:shadow-lg hover:shadow-primary-500/10 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-500/10 border border-primary-500/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Sparkles className="h-6 w-6 text-primary-400 animate-twinkle" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-space-50">Voice Coming Soon</h3>
              <p className="text-space-300">
                Soon you'll be able to hear your characters speak with realistic AI-generated voices.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16">
          <div className="relative bg-gradient-to-r from-primary-500/20 via-accent-500/20 to-stardust-500/20 rounded-3xl p-12 text-center border border-space-700/50 overflow-hidden">
            <div className="absolute inset-0 bg-space-950/50 backdrop-blur-sm"></div>
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-primary-300 via-accent-300 to-stardust-300 bg-clip-text text-transparent">
                Ready to Start Your Adventure?
              </h2>
              <p className="text-space-300 text-lg mb-8 max-w-xl mx-auto">
                Join thousands of users exploring new worlds and having amazing conversations with AI characters.
              </p>
              <Link
                href="/register"
                className="inline-flex px-8 py-4 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white hover:from-primary-400 hover:to-accent-400 transition-all hover:scale-105 text-lg font-medium shadow-lg shadow-primary-500/30 hover:shadow-primary-500/50"
              >
                Create Free Account
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 border-t border-space-800/50">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-6 w-6 text-primary-400" />
              <span className="text-xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">Bostonia</span>
            </div>
            <p className="text-sm text-space-400">
              The next generation of AI character conversations, powered by Claude.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-space-100">Product</h4>
            <ul className="space-y-2 text-sm text-space-400">
              <li><Link href="/characters" className="hover:text-primary-400 transition-colors">Characters</Link></li>
              <li><Link href="/pricing" className="hover:text-primary-400 transition-colors">Pricing</Link></li>
              <li><Link href="/creators" className="hover:text-primary-400 transition-colors">For Creators</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-space-100">Company</h4>
            <ul className="space-y-2 text-sm text-space-400">
              <li><Link href="/about" className="hover:text-primary-400 transition-colors">About</Link></li>
              <li><Link href="/blog" className="hover:text-primary-400 transition-colors">Blog</Link></li>
              <li><Link href="/careers" className="hover:text-primary-400 transition-colors">Careers</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-space-100">Legal</h4>
            <ul className="space-y-2 text-sm text-space-400">
              <li><Link href="/privacy" className="hover:text-primary-400 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-primary-400 transition-colors">Terms of Service</Link></li>
              <li><Link href="/contact" className="hover:text-primary-400 transition-colors">Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-space-800/50 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-space-500">
          <p>&copy; {new Date().getFullYear()} Bostonia. All rights reserved.</p>
          <p>Made with Claude AI by Anthropic</p>
        </div>
      </footer>
    </div>
  );
}
