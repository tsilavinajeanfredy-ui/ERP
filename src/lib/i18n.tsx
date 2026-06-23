import * as React from 'react';

export type Language = 'FR' | 'EN';

// Translations are loaded synchronously from the bundled object.
// For true lazy loading (split chunk per locale) use dynamic import below.
import { translations } from './i18n_translations';
import { supabase } from './supabase';


type LanguageContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
};

const LanguageContext = React.createContext<LanguageContextType | undefined>(undefined);

// Helper to format snake_case/camelCase keys into readable sentences
function formatKeyToLabel(key: string): string {
  if (!key) return '';
  if (key.includes(' ')) return key;
  
  // Replace underscores and hyphens with spaces
  let formatted = key.replace(/[_-]+/g, ' ');
  
  // Insert spaces before capital letters (camelCase)
  formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Capitalize first letter, keep rest lowercased
  return formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase();
}

// Simple rule-based detector for French words
function isFrench(text: string): boolean {
  const lowercase = text.toLowerCase();
  
  // Check for common French accents
  if (/[éèàùçâêîôûëïü]/.test(lowercase)) return true;
  
  // Check for common French stop words
  const frStopWords = [' de ', ' le ', ' la ', ' les ', ' pour ', ' dans ', ' sur ', ' en ', ' et ', ' ou ', ' avec ', ' par ', ' une ', ' un ', ' du ', ' des '];
  if (frStopWords.some(word => lowercase.includes(word))) return true;
  if (lowercase.startsWith('le ') || lowercase.startsWith('la ') || lowercase.startsWith('les ') || lowercase.startsWith('un ') || lowercase.startsWith('une ')) return true;
  
  return false;
}

// Set to keep track of translations in progress to avoid double-fetching
const pendingTranslations = new Set<string>();

async function performAutoTranslation(
  key: string,
  onComplete: (fr: string, en: string) => void
) {
  if (pendingTranslations.has(key)) return;
  pendingTranslations.add(key);

  try {
    const defaultLabel = formatKeyToLabel(key);
    const sourceIsFr = isFrench(defaultLabel);
    
    const sourceLang = sourceIsFr ? 'fr' : 'en';
    const targetLang = sourceIsFr ? 'en' : 'fr';
    
    // Free MyMemory Translation API (no authentication/tokens required)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(defaultLabel)}&langpair=${sourceLang}|${targetLang}`;
    const res = await fetch(url);
    const data = await res.json();
    
    const translatedText = data?.responseData?.translatedText || defaultLabel;
    
    const frValue = sourceIsFr ? defaultLabel : translatedText;
    const enValue = sourceIsFr ? translatedText : defaultLabel;
    
    onComplete(frValue, enValue);
    
    // Save to Supabase custom_translations table for persistent sharing
    if (supabase) {
      await supabase.from('custom_translations').upsert({
        key,
        fr: frValue,
        en: enValue
      });
    }
  } catch (error) {
    console.warn('[i18n Auto-Translate] Error translating key:', key, error);
    const fallback = formatKeyToLabel(key);
    onComplete(fallback, fallback);
  } finally {
    pendingTranslations.delete(key);
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = React.useState<Language>('FR');
  const [dynamicTranslations, setDynamicTranslations] = React.useState<Record<Language, Record<string, string>>>({
    FR: {},
    EN: {}
  });

  // 1. Load dynamic translations from local cache and fetch from Supabase
  React.useEffect(() => {
    // Load from local storage
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('gsi_dynamic_translations') : null;
      if (saved) {
        setDynamicTranslations(JSON.parse(saved));
      }
    } catch {}

    // Load from Supabase shared table
    if (supabase) {
      supabase
        .from('custom_translations')
        .select('*')
        .then(({ data, error }: { data: any; error: any }) => {
          if (data && !error) {
            const loadedFR: Record<string, string> = {};
            const loadedEN: Record<string, string> = {};
            data.forEach((row: { key: string; fr: string; en: string }) => {
              loadedFR[row.key] = row.fr;
              loadedEN[row.key] = row.en;
            });
            
            setDynamicTranslations(prev => {
              const next = {
                FR: { ...prev.FR, ...loadedFR },
                EN: { ...prev.EN, ...loadedEN }
              };
              try {
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem('gsi_dynamic_translations', JSON.stringify(next));
                }
              } catch {}
              return next;
            });
          }
        });
    }
  }, []);

  // 2. Translation getter
  const t = (key: string): string => {
    if (!key) return '';
    
    // Check static translations first
    const staticVal = (translations[lang] as any)[key];
    if (staticVal) return staticVal;
    
    // Check dynamic cached translations
    const dynamicVal = dynamicTranslations[lang][key];
    if (dynamicVal) return dynamicVal;
    
    // Asynchronously translate and update state for future renders
    performAutoTranslation(key, (frVal, enVal) => {
      setDynamicTranslations(prev => {
        const next = {
          FR: { ...prev.FR, [key]: frVal },
          EN: { ...prev.EN, [key]: enVal }
        };
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('gsi_dynamic_translations', JSON.stringify(next));
          }
        } catch {}
        return next;
      });
    });
    
    // Immediate fallback until translated
    return formatKeyToLabel(key);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = React.useContext(LanguageContext);
  if (!context) throw new Error('useTranslation must be used within a LanguageProvider');
  return context;
}

const COMMON_TERMS: Record<string, string> = {
  'savon': 'Soap',
  'bougie': 'Candle',
  'papier': 'Paper',
  'hygiénique': 'Toilet',
  'encaustique': 'Polish',
  'soude': 'Soda',
  'caustique': 'Caustic',
  'corde': 'Rope',
  'carton': 'Box',
  'rouge': 'Red',
  'blanc': 'White',
  'bleu': 'Blue',
  'vert': 'Green',
  'jaune': 'Yellow',
  'parfum': 'Fragrance',
  'citron': 'Lemon',
  'pomme': 'Apple',
  'fraise': 'Strawberry',
  'vaisselle': 'Dishwashing Liquid',
  'pâte': 'Pulp',
  'cire': 'Wax',
};

export function translateProductName(name: string, lang: Language): string {
  if (lang !== 'EN') return name;
  if (!name) return '';
  
  let translated = name;
  Object.keys(COMMON_TERMS).forEach(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    translated = translated.replace(regex, COMMON_TERMS[term]);
  });
  
  return translated;
}
