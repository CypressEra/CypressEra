import React from 'react';
import { useLanguage } from '../LanguageContext';
import './LanguageSwitcher.css';

export const LanguageSwitcher: React.FC = () => {
  const { currentLanguage, setLanguage, languages } = useLanguage();

  const getFlag = (code: string) => {
    const flags: Record<string, string> = {
      en: '🇺🇸',
      fr: '🇫🇷',
      zh: '🇨🇳',
      es: '🇪🇸',
    };
    return flags[code] || '';
  };

  return (
    <div className="language-switcher">
      <select
        value={currentLanguage}
        onChange={(e) => setLanguage(e.target.value as any)}
        className="language-select"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {getFlag(lang.code)} {lang.nativeName}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSwitcher;
