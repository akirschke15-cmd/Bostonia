'use client';

import { Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShareButtonProps {
  onClick: () => void;
  isShared?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ShareButton({
  onClick,
  isShared = false,
  className,
  size = 'md',
}: ShareButtonProps) {
  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-lg transition-all',
        'hover:bg-space-800 text-space-300 hover:text-space-100',
        isShared && 'text-primary-400 hover:text-primary-300',
        sizeClasses[size],
        className
      )}
      title={isShared ? 'Manage sharing' : 'Share conversation'}
      aria-label={isShared ? 'Manage sharing' : 'Share conversation'}
    >
      <Share2 className={iconSizes[size]} />
    </button>
  );
}
