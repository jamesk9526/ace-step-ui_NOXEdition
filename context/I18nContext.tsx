import React, { createContext, useContext, useState, ReactNode } from 'react';
import { translations, Language, TranslationKey } from '../i18n/translations';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    // Try session storage first, then fall back to localStorage
    const sessionStored = sessionStorage.getItem('language') as Language;
    if (sessionStored === 'zh' || sessionStored === 'en' || sessionStored === 'ja' || sessionStored === 'ko') {
      return sessionStored;
    }
    const localStored = localStorage.getItem('language') as Language;
    return localStored === 'zh' || localStored === 'en' || localStored === 'ja' || localStored === 'ko' ? localStored : 'en';
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    sessionStorage.setItem('language', lang);
    localStorage.setItem('language', lang); // Also keep in localStorage for persistence across sessions
  };

  const t = (key: TranslationKey): string => {
    return translations[language][key] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
};
