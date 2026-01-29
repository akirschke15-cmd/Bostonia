'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  GitFork,
  Save,
  ArrowLeft,
  Loader2,
  Eye,
  EyeOff,
  Lock,
  Globe,
} from 'lucide-react';
import { charactersApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { cn, getInitials } from '@/lib/utils';
import { RemixBadge } from './RemixBadge';
import toast from 'react-hot-toast';

interface Character {
  id: string;
  name: string;
  tagline: string;
  description: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  systemPrompt: string;
  greeting: string;
  exampleDialogues: unknown[];
  traits: string[];
  background: string;
  voice: string;
  responseLength: string;
  visibility: string;
  category: string;
  tags: string[];
  isNsfw: boolean;
  status: string;
  allowRemix: boolean;
  isRemix: boolean;
  parentCharacterId: string | null;
  parentCharacter?: {
    id: string;
    name: string;
    avatarUrl: string | null;
    creator: {
      id: string;
      username: string;
      displayName: string | null;
    };
  };
  creator: {
    id: string;
    username: string;
    displayName: string | null;
  };
}

interface RemixEditorProps {
  characterId: string;
}

const VOICE_OPTIONS = ['FORMAL', 'CASUAL', 'PLAYFUL', 'SERIOUS', 'POETIC', 'TECHNICAL'];
const RESPONSE_LENGTH_OPTIONS = ['SHORT', 'MEDIUM', 'LONG', 'VARIABLE'];
const VISIBILITY_OPTIONS = [
  { value: 'PRIVATE', label: 'Private', icon: Lock },
  { value: 'UNLISTED', label: 'Unlisted', icon: EyeOff },
  { value: 'PUBLIC', label: 'Public', icon: Globe },
];

export function RemixEditor({ characterId }: RemixEditorProps) {
  const router = useRouter();
  const { user } = useAuthStore();

  const [formData, setFormData] = useState({
    name: '',
    tagline: '',
    description: '',
    systemPrompt: '',
    greeting: '',
    traits: [] as string[],
    background: '',
    voice: 'CASUAL',
    responseLength: 'MEDIUM',
    visibility: 'PRIVATE',
    category: '',
    tags: [] as string[],
    isNsfw: false,
    allowRemix: true,
  });

  const [newTrait, setNewTrait] = useState('');
  const [newTag, setNewTag] = useState('');

  const { data: characterData, isLoading } = useQuery({
    queryKey: ['character', characterId],
    queryFn: async () => {
      const response = await charactersApi.get(characterId);
      if (!response.success) {
        throw new Error('Failed to fetch character');
      }
      return response.data as Character;
    },
  });

  // Populate form when character data loads
  useEffect(() => {
    if (characterData) {
      setFormData({
        name: characterData.name,
        tagline: characterData.tagline,
        description: characterData.description,
        systemPrompt: characterData.systemPrompt,
        greeting: characterData.greeting,
        traits: characterData.traits,
        background: characterData.background,
        voice: characterData.voice,
        responseLength: characterData.responseLength,
        visibility: characterData.visibility,
        category: characterData.category,
        tags: characterData.tags,
        isNsfw: characterData.isNsfw,
        allowRemix: characterData.allowRemix,
      });
    }
  }, [characterData]);

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      charactersApi.update(characterId, {
        name: data.name,
        tagline: data.tagline,
        description: data.description,
        personality: {
          systemPrompt: data.systemPrompt,
          greeting: data.greeting,
          traits: data.traits,
          background: data.background,
          voice: data.voice.toLowerCase(),
          responseLength: data.responseLength.toLowerCase(),
          exampleDialogues: characterData?.exampleDialogues || [],
        },
        visibility: data.visibility.toLowerCase(),
        category: data.category,
        tags: data.tags,
        isNsfw: data.isNsfw,
        allowRemix: data.allowRemix,
      }),
    onSuccess: () => {
      toast.success('Character updated successfully!');
      router.push(`/characters/${characterId}`);
    },
    onError: () => {
      toast.error('Failed to update character');
    },
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      charactersApi.update(characterId, { status: 'published' }),
    onSuccess: () => {
      toast.success('Character published!');
      router.push(`/characters/${characterId}`);
    },
    onError: () => {
      toast.error('Failed to publish character');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleAddTrait = () => {
    if (newTrait.trim() && !formData.traits.includes(newTrait.trim())) {
      setFormData({
        ...formData,
        traits: [...formData.traits, newTrait.trim()],
      });
      setNewTrait('');
    }
  };

  const handleRemoveTrait = (trait: string) => {
    setFormData({
      ...formData,
      traits: formData.traits.filter((t) => t !== trait),
    });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, newTag.trim()],
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((t) => t !== tag),
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!characterData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Character not found</p>
      </div>
    );
  }

  // Check ownership
  if (characterData.creator.id !== user?.id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">
          You do not have permission to edit this character
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-space-950 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-3">
            {characterData.status === 'DRAFT' && (
              <button
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {publishMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                Publish
              </button>
            )}
          </div>
        </div>

        {/* Remix Attribution */}
        {characterData.isRemix && characterData.parentCharacter && (
          <div className="mb-6">
            <RemixBadge
              parentCharacter={characterData.parentCharacter}
              variant="full"
            />
          </div>
        )}

        {/* Editor Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <section className="bg-space-900 border border-space-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <GitFork className="h-5 w-5 text-purple-400" />
              Basic Information
            </h2>

            <div className="grid gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Tagline</label>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={(e) =>
                    setFormData({ ...formData, tagline: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={4}
                  className="w-full px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            </div>
          </section>

          {/* Personality */}
          <section className="bg-space-900 border border-space-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-6">Personality</h2>

            <div className="grid gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  System Prompt
                </label>
                <textarea
                  value={formData.systemPrompt}
                  onChange={(e) =>
                    setFormData({ ...formData, systemPrompt: e.target.value })
                  }
                  rows={6}
                  className="w-full px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Greeting Message
                </label>
                <textarea
                  value={formData.greeting}
                  onChange={(e) =>
                    setFormData({ ...formData, greeting: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Background</label>
                <textarea
                  value={formData.background}
                  onChange={(e) =>
                    setFormData({ ...formData, background: e.target.value })
                  }
                  rows={4}
                  className="w-full px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {/* Traits */}
              <div>
                <label className="block text-sm font-medium mb-2">Traits</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.traits.map((trait) => (
                    <span
                      key={trait}
                      className="flex items-center gap-1 px-3 py-1 bg-primary/20 text-primary rounded-full text-sm"
                    >
                      {trait}
                      <button
                        type="button"
                        onClick={() => handleRemoveTrait(trait)}
                        className="ml-1 hover:text-red-400"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTrait}
                    onChange={(e) => setNewTrait(e.target.value)}
                    placeholder="Add a trait"
                    className="flex-1 px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTrait();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddTrait}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Voice & Response Length */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Voice Style
                  </label>
                  <select
                    value={formData.voice}
                    onChange={(e) =>
                      setFormData({ ...formData, voice: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {VOICE_OPTIONS.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice.charAt(0) + voice.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Response Length
                  </label>
                  <select
                    value={formData.responseLength}
                    onChange={(e) =>
                      setFormData({ ...formData, responseLength: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {RESPONSE_LENGTH_OPTIONS.map((length) => (
                      <option key={length} value={length}>
                        {length.charAt(0) + length.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Settings */}
          <section className="bg-space-900 border border-space-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-6">Settings</h2>

            <div className="grid gap-6">
              {/* Visibility */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Visibility
                </label>
                <div className="flex gap-2">
                  {VISIBILITY_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, visibility: option.value })
                        }
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all',
                          formData.visibility === option.value
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-space-800 border-space-700 hover:border-space-600'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-2">Tags</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 px-3 py-1 bg-space-700 rounded-full text-sm"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:text-red-400"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add a tag"
                    className="flex-1 px-4 py-2 rounded-lg border border-space-700 bg-space-800 focus:outline-none focus:ring-2 focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.allowRemix}
                    onChange={(e) =>
                      setFormData({ ...formData, allowRemix: e.target.checked })
                    }
                    className="w-5 h-5 rounded border-space-600 bg-space-800 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="font-medium">Allow Remixing</span>
                    <p className="text-sm text-muted-foreground">
                      Let others create their own versions of this character
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isNsfw}
                    onChange={(e) =>
                      setFormData({ ...formData, isNsfw: e.target.checked })
                    }
                    className="w-5 h-5 rounded border-space-600 bg-space-800 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="font-medium">NSFW Content</span>
                    <p className="text-sm text-muted-foreground">
                      This character may include mature content
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </section>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 rounded-lg border border-space-700 hover:bg-space-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className={cn(
                'flex items-center gap-2 px-6 py-3 rounded-lg',
                'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
                'hover:from-purple-600 hover:to-pink-600 transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
