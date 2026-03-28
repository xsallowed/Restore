import { useEffect } from 'react';

export interface RecentSection {
  path: string;
  name: string;
  icon: string;
  timestamp: number;
}

const STORAGE_KEY = 'recent-sections';
const MAX_RECENT = 6;

export function useRecentSections() {
  const getRecentSections = (): RecentSection[] => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  };

  const addRecentSection = (path: string, name: string, icon: string) => {
    const current = getRecentSections();
    
    // Remove if already exists
    const filtered = current.filter(s => s.path !== path);
    
    // Add to front with current timestamp
    const updated = [
      { path, name, icon, timestamp: Date.now() },
      ...filtered,
    ];
    
    // Keep only latest 6
    const limited = updated.slice(0, MAX_RECENT);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
  };

  return {
    getRecentSections,
    addRecentSection,
  };
}

// Hook to track current page
export function useTrackSection(path: string, name: string, icon: string) {
  const { addRecentSection } = useRecentSections();

  useEffect(() => {
    addRecentSection(path, name, icon);
  }, [path, name, icon, addRecentSection]);
}
