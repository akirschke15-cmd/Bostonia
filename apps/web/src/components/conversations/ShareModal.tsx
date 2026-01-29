'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Link as LinkIcon,
  Copy,
  Check,
  Globe,
  Lock,
  Eye,
  User,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface ShareSettings {
  allowComments?: boolean;
  showUsername?: boolean;
}

interface ShareStatus {
  isPublic: boolean;
  shareToken: string | null;
  shareUrl: string | null;
  sharedAt: string | null;
  shareSettings: ShareSettings;
  viewCount: number;
  lastViewedAt: string | null;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  conversationTitle: string;
  onShare: (settings: ShareSettings) => Promise<ShareStatus>;
  onUnshare: () => Promise<void>;
  onUpdateSettings: (settings: ShareSettings) => Promise<ShareStatus>;
  initialStatus?: ShareStatus | null;
  isLoading?: boolean;
}

export function ShareModal({
  isOpen,
  onClose,
  conversationId,
  conversationTitle,
  onShare,
  onUnshare,
  onUpdateSettings,
  initialStatus,
  isLoading = false,
}: ShareModalProps) {
  const [status, setStatus] = useState<ShareStatus | null>(initialStatus || null);
  const [showUsername, setShowUsername] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (initialStatus) {
      setStatus(initialStatus);
      setShowUsername(initialStatus.shareSettings?.showUsername !== false);
    }
  }, [initialStatus]);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

  const handleShare = async () => {
    setIsProcessing(true);
    try {
      const newStatus = await onShare({ showUsername, allowComments: false });
      setStatus(newStatus);
      toast.success('Conversation shared successfully');
    } catch (error) {
      toast.error('Failed to share conversation');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnshare = async () => {
    setIsProcessing(true);
    try {
      await onUnshare();
      setStatus(null);
      toast.success('Sharing disabled');
    } catch (error) {
      toast.error('Failed to disable sharing');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateSettings = async () => {
    if (!status?.isPublic) return;
    setIsProcessing(true);
    try {
      const newStatus = await onUpdateSettings({ showUsername, allowComments: false });
      setStatus(newStatus);
      toast.success('Settings updated');
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = async () => {
    if (!status?.shareUrl) return;
    const fullUrl = `${window.location.origin}${status.shareUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  if (!isOpen) return null;

  const fullShareUrl = status?.shareUrl
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${status.shareUrl}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-space-900 border border-space-700/50 rounded-2xl shadow-2xl shadow-primary-500/10 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-space-800">
          <h2 className="text-lg font-semibold text-space-100">Share Conversation</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-space-800 text-space-400 hover:text-space-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Conversation info */}
          <div className="flex items-center gap-3 p-3 bg-space-800/50 rounded-lg">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <MessageSquare className="h-5 w-5 text-primary-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-space-200 truncate">
                {conversationTitle || 'Untitled Conversation'}
              </p>
              <p className="text-xs text-space-500">
                {status?.isPublic ? 'Currently shared' : 'Not shared'}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
            </div>
          ) : status?.isPublic ? (
            <>
              {/* Share link */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-space-300">Share link</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-space-800 border border-space-700 rounded-lg">
                    <LinkIcon className="h-4 w-4 text-space-500 flex-shrink-0" />
                    <input
                      type="text"
                      value={fullShareUrl}
                      readOnly
                      className="flex-1 bg-transparent text-sm text-space-200 outline-none truncate"
                    />
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className={cn(
                      'p-2.5 rounded-lg transition-all',
                      copied
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-primary-500/10 text-primary-400 hover:bg-primary-500/20'
                    )}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* View stats */}
              {status.viewCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-space-400">
                  <Eye className="h-4 w-4" />
                  <span>{status.viewCount} view{status.viewCount !== 1 ? 's' : ''}</span>
                </div>
              )}

              {/* Privacy settings */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-space-300">Privacy settings</label>

                <label className="flex items-center justify-between p-3 bg-space-800/30 rounded-lg cursor-pointer hover:bg-space-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-space-400" />
                    <span className="text-sm text-space-200">Show your username</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={showUsername}
                    onChange={(e) => {
                      setShowUsername(e.target.checked);
                    }}
                    className="w-4 h-4 rounded border-space-600 bg-space-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                  />
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleUnshare}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-space-800 hover:bg-space-700 text-space-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" />
                  <span>Stop sharing</span>
                </button>
                <button
                  onClick={handleUpdateSettings}
                  disabled={isProcessing || showUsername === (status.shareSettings?.showUsername !== false)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-400 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>Save changes</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Not shared state */}
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-space-800 flex items-center justify-center">
                  <Globe className="h-8 w-8 text-space-500" />
                </div>
                <p className="text-space-300 mb-2">Share this conversation publicly</p>
                <p className="text-sm text-space-500">
                  Anyone with the link will be able to view the conversation
                </p>
              </div>

              {/* Privacy settings before sharing */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-space-300">Privacy settings</label>

                <label className="flex items-center justify-between p-3 bg-space-800/30 rounded-lg cursor-pointer hover:bg-space-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-space-400" />
                    <span className="text-sm text-space-200">Show your username</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={showUsername}
                    onChange={(e) => setShowUsername(e.target.checked)}
                    className="w-4 h-4 rounded border-space-600 bg-space-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                  />
                </label>
              </div>

              {/* Share button */}
              <button
                onClick={handleShare}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-400 hover:to-accent-400 text-white font-medium rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-primary-500/25"
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Globe className="h-5 w-5" />
                    <span>Create share link</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
