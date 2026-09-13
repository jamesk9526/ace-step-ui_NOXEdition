import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export interface UISettings {
  theme: 'dark' | 'light';
  language: 'en' | 'zh' | 'ja' | 'ko';
  volume: number;
  playbackRate: number;
  isShuffle: boolean;
  repeatMode: 'none' | 'all' | 'one';
  showRightSidebar: boolean;
  showLeftSidebar: boolean;
  // Player display settings
  showLyrics: boolean;
  showDescription: boolean;
  showMetadata: boolean;
  // Playback settings
  autoPlayNext: boolean;
  // View preferences
  playerCompactMode: boolean;
  defaultViewMode: 'create' | 'library' | 'trending' | 'news';
  // Visualization and Effects
  visualizationType: 'waveform' | 'equalizer' | 'spectrum' | 'none';
  enableAnimations: boolean;
}

interface SettingsContextType {
  settings: UISettings;
  updateSetting: <K extends keyof UISettings>(key: K, value: UISettings[K]) => void;
  updateSettings: (partial: Partial<UISettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const DEFAULT_SETTINGS: UISettings = {
  theme: 'dark', // Set dark as default
  language: 'en',
  volume: 0.8,
  playbackRate: 1.0,
  isShuffle: false,
  repeatMode: 'all',
  showRightSidebar: true,
  showLeftSidebar: true,
  showLyrics: true,
  showDescription: true,
  showMetadata: true,
  autoPlayNext: true,
  playerCompactMode: false,
  defaultViewMode: 'create',
  visualizationType: 'waveform',
  enableAnimations: true,
};

const SETTINGS_KEY = 'acestep_ui_settings';

function getStoredSettings(): UISettings {
  try {
    const stored = sessionStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn('Failed to parse stored settings:', error);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: UISettings): void {
  try {
    sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save settings to session storage:', error);
  }
}

export function SettingsProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [settings, setSettings] = useState<UISettings>(getStoredSettings);

  // Update single setting
  const updateSetting = useCallback(<K extends keyof UISettings>(key: K, value: UISettings[K]) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  // Update multiple settings at once
  const updateSettings = useCallback((partial: Partial<UISettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...partial };
      saveSettings(updated);
      return updated;
    });
  }, []);

  // Reset to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  const value: SettingsContextType = {
    settings,
    updateSetting,
    updateSettings,
    resetSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
