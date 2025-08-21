import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useBranding } from '@/hooks/use-branding';

export function BrandLogo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
    const { logo } = useBranding();

    if (logo) {
        return <Image src={logo} alt="Brand Logo" className={cn("h-6 w-6", className)} width={24} height={24} />;
    }

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("h-6 w-6", className)}
            {...props}
        >
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5"></path>
            <path d="M2 12l10 5 10-5"></path>
        </svg>
    );
}
