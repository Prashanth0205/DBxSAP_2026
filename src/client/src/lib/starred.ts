import { useEffect, useState } from 'react';

const STORAGE_KEY = 'disha:starred';
const EVENT = 'disha:starred-changed';

export interface StarredDistrict {
  key: string;
  district: string;
  state: string;
  capability: string;
  gap_score: number;
  total_facilities: number;
  matching_facilities: number;
  confidence: number;
  starred_at: string;
}

export function starKey(state: string, district: string, capability: string): string {
  return `${state}::${district}::${capability}`;
}

function read(): StarredDistrict[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: StarredDistrict[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function useStarred(): {
  starred: StarredDistrict[];
  isStarred: (key: string) => boolean;
  toggle: (entry: Omit<StarredDistrict, 'starred_at'>) => void;
  remove: (key: string) => void;
  clear: () => void;
} {
  const [starred, setStarred] = useState<StarredDistrict[]>(() => read());

  useEffect(() => {
    function refresh() {
      setStarred(read());
    }
    window.addEventListener(EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  function toggle(entry: Omit<StarredDistrict, 'starred_at'>) {
    const items = read();
    const idx = items.findIndex((s) => s.key === entry.key);
    if (idx >= 0) {
      items.splice(idx, 1);
    } else {
      items.push({ ...entry, starred_at: new Date().toISOString() });
    }
    write(items);
  }

  function remove(key: string) {
    write(read().filter((s) => s.key !== key));
  }

  function clear() {
    write([]);
  }

  function isStarred(key: string) {
    return starred.some((s) => s.key === key);
  }

  return { starred, isStarred, toggle, remove, clear };
}
