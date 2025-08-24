
"use client";

import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { readDb } from '@/lib/db';
import { updateBrandingSettings } from '@/lib/actions';
import type { BrandingSettings } from '@/types';

interface BrandingContextType {
  brandName: string;
  logo: string | null;
  footerText: string;
  brandingLoading: boolean;
  setBrandName: (name: string) => Promise<void>;
  setLogo: (logo: string | null) => Promise<void>;
  setFooterText: (text: string) => Promise<void>;
  refreshBranding: () => Promise<void>;
}

export const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [brandName, setBrandNameState] = useState<string>('');
  const [logo, setLogoState] = useState<string | null>(null);
  const [footerText, setFooterTextState] = useState<string>('');
  const [brandingLoading, setBrandingLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
    setBrandingLoading(true);
    try {
        const db = await readDb();
        if (db.branding) {
            setBrandNameState(db.branding.brandName);
            setLogoState(db.branding.logo);
            setFooterTextState(db.branding.footerText);
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
    await updateBrandingSettings({ brandName: name, logo: logo, footerText: footerText });
    await refreshBranding();
  };

  const setLogo = async (logoData: string | null) => {
    await updateBrandingSettings({ brandName: brandName, logo: logoData, footerText: footerText });
    await refreshBranding();
  };

  const setFooterText = async (text: string) => {
    await updateBrandingSettings({ brandName: brandName, logo: logo, footerText: text });
    await refreshBranding();
  }
  
  const value = { brandName, logo, footerText, brandingLoading, setBrandName, setLogo, setFooterText, refreshBranding };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
