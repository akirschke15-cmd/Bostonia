'use client';

export function ConversationSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
      <div className="flex items-start gap-4">
        {/* Avatar skeleton */}
        <div className="w-12 h-12 rounded-full bg-space-700 flex-shrink-0" />

        {/* Content skeleton */}
        <div className="flex-1 space-y-3">
          {/* Name and title */}
          <div className="space-y-2">
            <div className="h-5 bg-space-700 rounded w-32" />
            <div className="h-4 bg-space-700/70 rounded w-48" />
          </div>

          {/* Message preview */}
          <div className="space-y-1.5">
            <div className="h-4 bg-space-700/50 rounded w-full" />
            <div className="h-4 bg-space-700/50 rounded w-3/4" />
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4">
            <div className="h-4 bg-space-700/40 rounded w-24" />
            <div className="h-4 bg-space-700/40 rounded w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConversationListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <ConversationSkeleton key={i} />
      ))}
    </div>
  );
}
