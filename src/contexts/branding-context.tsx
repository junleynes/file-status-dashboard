"use client";

import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { readDb, writeDb } from '@/lib/db';
import type { BrandingSettings } from '@/types';

interface BrandingContextType {
  brandName: string;
  logo: string | null;
  brandingLoading: boolean;
  setBrandName: (name: string) => Promise<void>;
  setLogo: (logo: string | null) => Promise<void>;
}

export const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [brandName, setBrandNameState] = useState<string>('Your Brand');
  const [logo, setLogoState] = useState<string | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(true);

  const syncBrandingFromDb = useCallback(async () => {
    try {
        const db = await readDb();
        if (db.branding) {
            setBrandNameState(db.branding.brandName);
            setLogoState(db.branding.logo);
        }
    } catch (error) {
        console.error("Failed to load branding from DB", error);
    } finally {
        setBrandingLoading(false);
    }
  }, []);

  useEffect(() => {
    syncBrandingFromDb();
  }, [syncBrandingFromDb]);

  const setBrandName = async (name: string) => {
    setBrandNameState(name);
    const db = await readDb();
    const newBranding: BrandingSettings = { ...db.branding, brandName: name };
    await writeDb({ ...db, branding: newBranding });
  };

  const setLogo = async (logoData: string | null) => {
    setLogoState(logoData);
    const db = await readDb();
    const newBranding: BrandingSettings = { ...db.branding, logo: logoData };
    await writeDb({ ...db, branding: newBranding });
  };
  
  const value = { brandName, logo, brandingLoading, setBrandName, setLogo };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
