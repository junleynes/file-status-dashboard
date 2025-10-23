
import { getMaintenanceSettings, getBranding } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import { AlertTriangle } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function MaintenancePage() {
    const maintenanceSettings = await getMaintenanceSettings();
    const branding = await getBranding();

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
             <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                        <BrandLogo className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="flex items-center justify-center gap-2">
                        <AlertTriangle className="h-6 w-6 text-destructive" />
                        <span>Under Maintenance</span>
                    </CardTitle>
                    <CardDescription>{branding.brandName}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        {maintenanceSettings.message}
                    </p>
                </CardContent>
             </Card>
        </div>
    );
}
