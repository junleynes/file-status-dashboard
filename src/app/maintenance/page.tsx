
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readDb } from '@/lib/db';
import { BrandLogo } from '@/components/brand-logo';
import { useBranding } from '@/hooks/use-branding';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import type { MaintenanceSettings } from '@/types';

export default function MaintenancePage() {
    const { user } = useAuth();
    const { brandName, brandingLoading } = useBranding();
    const [settings, setSettings] = useState<MaintenanceSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        async function fetchSettings() {
            try {
                const db = await readDb();
                setSettings(db.maintenanceSettings);
                if (!db.maintenanceSettings.enabled) {
                   // If maintenance mode got disabled, redirect to dashboard
                   router.replace('/dashboard');
                }
            } catch (e) {
                console.error("Failed to fetch maintenance settings", e);
            } finally {
                setLoading(false);
            }
        }
        fetchSettings();
    }, [router]);

    // If the user is an admin, they should not be on this page.
    useEffect(() => {
        if (user?.role === 'admin') {
            router.replace('/dashboard');
        }
    }, [user, router]);


    const isLoading = loading || brandingLoading;
    const message = settings?.message.replace('{Brand Name}', brandName) || '';

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-2xl"
            >
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                    {isLoading ? (
                        <Skeleton className="h-12 w-12 rounded-full" />
                    ) : (
                        <BrandLogo className="h-12 w-12 text-primary" />
                    )}
                </div>

                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    {isLoading ? <Skeleton className="h-9 w-3/4 mx-auto" /> : 'Maintenance in Progress'}
                </h1>
                
                <div className="mt-6 space-y-2 text-muted-foreground">
                    {isLoading ? (
                        <>
                            <Skeleton className="h-4 w-full mx-auto" />
                            <Skeleton className="h-4 w-5/6 mx-auto" />
                            <Skeleton className="h-4 w-3/4 mx-auto" />
                        </>
                    ) : (
                         message.split('\n').map((line, index) => <p key={index}>{line}</p>)
                    )}
                </div>
            </motion.div>
        </div>
    );
}
