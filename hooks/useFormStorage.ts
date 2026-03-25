import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook that manages form state with automatic session storage persistence
 * @param key - Unique key for storing in session storage
 * @param initialValue - Default value if nothing is stored
 * @param options - Optional configuration
 */
export function useFormStorage<T>(
  key: string,
  initialValue: T,
  options?: {
    debounceMs?: number;
  }
): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `form_${key}`;
  let debounceTimeout: NodeJS.Timeout | null = null;

  // Initialize state from session storage
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : initialValue;
    } catch (error) {
      console.warn(`Failed to parse form storage for ${key}:`, error);
      return initialValue;
    }
  });

  // Persist to session storage on changes
  useEffect(() => {
    const debounceMs = options?.debounceMs || 300;

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    debounceTimeout = setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(value));
      } catch (error) {
        console.warn(`Failed to save form storage for ${key}:`, error);
      }
    }, debounceMs);

    return () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
    };
  }, [value, storageKey, options?.debounceMs]);

  // Wrapper to handle both direct values and updater functions
  const setValueWithStorage = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prevValue => {
      const nextValue = typeof newValue === 'function' 
        ? (newValue as (prev: T) => T)(prevValue)
        : newValue;
      return nextValue;
    });
  }, []);

  return [value, setValueWithStorage];
}

/**
 * Clear all form storage for a given prefix
 */
export function clearFormStorage(prefix?: string): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith('form_')) {
      if (!prefix || key.startsWith(`form_${prefix}`)) {
        keysToRemove.push(key);
      }
    }
  }
  keysToRemove.forEach(key => sessionStorage.removeItem(key));
}
