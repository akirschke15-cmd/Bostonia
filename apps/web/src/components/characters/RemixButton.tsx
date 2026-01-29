'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { GitFork, X, Loader2 } from 'lucide-react';
import { charactersApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface RemixButtonProps {
  characterId: string;
  characterName: string;
  allowRemix: boolean;
  className?: string;
}

export function RemixButton({
  characterId,
  characterName,
  allowRemix,
  className,
}: RemixButtonProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');

  const remixMutation = useMutation({
    mutationFn: (data?: { name?: string }) =>
      charactersApi.remix(characterId, data),
    onSuccess: (response) => {
      if (response.success && response.data) {
        const newCharacter = response.data as { id: string };
        toast.success('Character remixed successfully!');
        setIsModalOpen(false);
        router.push(`/characters/${newCharacter.id}/edit`);
      } else {
        toast.error('Failed to remix character');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remix character');
    },
  });

  const handleRemixClick = () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to remix characters');
      router.push('/login');
      return;
    }
    setIsModalOpen(true);
  };

  const handleConfirmRemix = () => {
    remixMutation.mutate(customName ? { name: customName } : undefined);
  };

  if (!allowRemix) {
    return (
      <button
        disabled
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg',
          'bg-muted text-muted-foreground cursor-not-allowed opacity-50',
          className
        )}
        title="Remixing is disabled for this character"
      >
        <GitFork className="h-4 w-4" />
        <span>Remix Disabled</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleRemixClick}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg',
          'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
          'hover:from-purple-600 hover:to-pink-600 transition-all',
          'shadow-lg shadow-purple-500/25',
          className
        )}
      >
        <GitFork className="h-4 w-4" />
        <span>Remix</span>
      </button>

      {/* Remix Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Remix Character</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-muted-foreground mb-4">
              Create your own version of <strong>{characterName}</strong>. You
              can customize everything after the remix is created.
            </p>

            <div className="mb-6">
              <label
                htmlFor="remixName"
                className="block text-sm font-medium mb-2"
              >
                Character Name (optional)
              </label>
              <input
                id="remixName"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={`${characterName} (Remix)`}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to use the default name
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemix}
                disabled={remixMutation.isPending}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
                  'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
                  'hover:from-purple-600 hover:to-pink-600 transition-all',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {remixMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <GitFork className="h-4 w-4" />
                    Create Remix
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
