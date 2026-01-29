'use client';

import { Search, SlidersHorizontal, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortOption = 'recent' | 'oldest' | 'alphabetical';
export type FilterOption = 'all' | 'active' | 'archived';

interface ConversationFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
  filterBy: FilterOption;
  onFilterChange: (value: FilterOption) => void;
  showSortDropdown: boolean;
  onSortDropdownToggle: () => void;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'alphabetical', label: 'Alphabetical' },
];

const filterOptions: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export function ConversationFilters({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
  showSortDropdown,
  onSortDropdownToggle,
}: ConversationFiltersProps) {
  const currentSortLabel = sortOptions.find((opt) => opt.value === sortBy)?.label;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-space-400" />
        <input
          type="text"
          placeholder="Search by character name or message..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-10 py-3 rounded-lg border border-space-700 bg-space-900/50 text-space-100 placeholder:text-space-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-space-700 transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4 text-space-400" />
          </button>
        )}
      </div>

      {/* Filter Tabs & Sort */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onFilterChange(option.value)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                filterBy === option.value
                  ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/25'
                  : 'bg-space-800 text-space-300 hover:bg-space-700 border border-space-700'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={onSortDropdownToggle}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-space-800 border border-space-700 text-space-200 hover:bg-space-700 transition-colors text-sm"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>{currentSortLabel}</span>
            <ChevronDown className={cn(
              'h-4 w-4 transition-transform',
              showSortDropdown && 'rotate-180'
            )} />
          </button>

          {showSortDropdown && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={onSortDropdownToggle}
              />
              <div className="absolute right-0 top-full mt-2 bg-space-900/95 backdrop-blur-md border border-space-700/50 rounded-lg shadow-lg shadow-primary-500/10 py-1 z-50 min-w-[160px]">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      onSortDropdownToggle();
                    }}
                    className={cn(
                      'w-full text-left px-4 py-2 text-sm transition-colors',
                      sortBy === option.value
                        ? 'bg-primary/10 text-primary'
                        : 'text-space-200 hover:bg-space-800'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
