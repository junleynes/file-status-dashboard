"use client";

import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { readDb } from '@/lib/db';
import { updateBrandingSettings } from '@/lib/actions';
import type { BrandingSettings } from '@/types';

interface BrandingContextType {
  brandName: string;
  logo: string | null;
  brandingLoading: boolean;
  setBrandName: (name: string) => Promise<void>;
  setLogo: (logo: string | null) => Promise<void>;
  refreshBranding: () => Promise<void>;
}

export const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [brandName, setBrandNameState] = useState<string>('Your Brand');
  const [logo, setLogoState] = useState<string | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
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
    refreshBranding();
  }, [refreshBranding]);

  const setBrandName = async (name: string) => {
    await updateBrandingSettings({ brandName: name, logo: logo });
    setBrandNameState(name);
  };

  const setLogo = async (logoData: string | null) => {
    await updateBrandingSettings({ brandName: brandName, logo: logoData });
    setLogoState(logoData);
  };
  
  const value = { brandName, logo, brandingLoading, setBrandName, setLogo, refreshBranding };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
