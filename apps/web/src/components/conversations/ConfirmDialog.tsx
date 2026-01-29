'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, isLoading]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'text-destructive bg-destructive/10',
      button: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    },
    warning: {
      icon: 'text-nova-500 bg-nova-500/10',
      button: 'bg-nova-500 text-white hover:bg-nova-400',
    },
    default: {
      icon: 'text-primary bg-primary/10',
      button: 'bg-primary text-primary-foreground hover:bg-primary/90',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-space-950/80 backdrop-blur-sm"
        onClick={!isLoading ? onClose : undefined}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-space-900 border border-space-700 rounded-xl shadow-2xl shadow-primary-500/10 w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-space-800 transition-colors disabled:opacity-50"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5 text-space-400" />
        </button>

        {/* Icon */}
        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mb-4', styles.icon)}>
          <AlertTriangle className="h-6 w-6" />
        </div>

        {/* Content */}
        <h2 id="dialog-title" className="text-xl font-semibold text-space-100 mb-2">
          {title}
        </h2>
        <p className="text-space-400 mb-6">{message}</p>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg border border-space-700 text-space-200 hover:bg-space-800 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 rounded-lg transition-colors disabled:opacity-50',
              styles.button
            )}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
