"use client";

import React, { createContext, useState, useEffect, ReactNode } from 'react';

const DEFAULT_BRAND_NAME = 'Your Brand';
const BRAND_NAME_STORAGE_KEY = 'file-tracker-brand-name';
const LOGO_STORAGE_KEY = 'file-tracker-logo';

interface BrandingContextType {
  brandName: string;
  logo: string | null;
  brandingLoading: boolean;
  setBrandName: (name: string) => void;
  setLogo: (logo: string | null) => void;
}

export const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [brandName, setBrandNameState] = useState<string>(DEFAULT_BRAND_NAME);
  const [logo, setLogoState] = useState<string | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(true);

  useEffect(() => {
    try {
      const storedName = localStorage.getItem(BRAND_NAME_STORAGE_KEY);
      const storedLogo = localStorage.getItem(LOGO_STORAGE_KEY);

      if (storedName) {
        setBrandNameState(storedName);
      }
      if (storedLogo) {
        setLogoState(storedLogo);
      }
    } catch (error) {
        console.error("Failed to load branding from local storage", error);
    } finally {
        setBrandingLoading(false);
    }
  }, []);

  const setBrandName = (name: string) => {
    setBrandNameState(name);
    localStorage.setItem(BRAND_NAME_STORAGE_KEY, name);
  };

  const setLogo = (logoData: string | null) => {
    setLogoState(logoData);
    if (logoData) {
      localStorage.setItem(LOGO_STORAGE_KEY, logoData);
    } else {
      localStorage.removeItem(LOGO_STORAGE_KEY);
    }
  };
  
  const value = { brandName, logo, brandingLoading, setBrandName, setLogo };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
