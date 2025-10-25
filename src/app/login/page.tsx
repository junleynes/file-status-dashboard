
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { useBranding } from '@/hooks/use-branding';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { BrandLogo } from '@/components/brand-logo';
import { AnimatePresence, motion } from 'framer-motion';
import type { User } from '@/types';
import { generateTwoFactorSecretForUser } from '@/lib/actions';
import { Skeleton } from '@/components/ui/skeleton';


type LoginStep = 'credentials' | '2fa_verify' | '2fa_setup';

export default function LoginPage() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('P@ssw00rd');
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>('credentials');
  const [userFor2fa, setUserFor2fa] = useState<User | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const { login, completeTwoFactorLogin } = useAuth();
  const { brandName } = useBranding();
  const router = useRouter();
  const { toast } = useToast();
  
  useEffect(() => {
    if (step === '2fa_setup' && userFor2fa && !qrCode) {
      const generateQr = async () => {
        setIsLoading(true);
        try {
          const result = await generateTwoFactorSecretForUser(userFor2fa.id, userFor2fa.username, brandName);
          if (result.qrCodeDataUrl) {
            setQrCode(result.qrCodeDataUrl);
          } else {
             toast({ title: "Error", description: "Could not generate QR code. Please try logging in again.", variant: "destructive" });
             handleBackToCredentials();
          }
        } catch (e) {
           toast({ title: "Error", description: "Could not generate QR code. Please try logging in again.", variant: "destructive" });
           handleBackToCredentials();
        } finally {
            setIsLoading(false);
        }
      }
      generateQr();
    }
  }, [step, userFor2fa, qrCode, brandName, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (step === '2fa_verify' || step === '2fa_setup') {
        await handleTwoFactorSubmit();
        return;
    }

    if (!username || !password) {
      toast({
        title: "Login Failed",
        description: "Please enter both username and password.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    const result = await login(username, password);
    setIsLoading(false);

    if (result.success && result.user) {
        setUserFor2fa(result.user);
        if (result.requiresTwoFactorSetup) {
            setStep('2fa_setup');
        } else if (result.twoFactorRequired) {
            setStep('2fa_verify');
        } else {
            router.push('/dashboard');
        }
    } else {
      toast({
        title: "Login Failed",
        description: "Invalid username or password.",
        variant: "destructive",
      });
    }
  };

  const handleTwoFactorSubmit = async () => {
    if (!userFor2fa || !token) {
       toast({
        title: "2FA Failed",
        description: "Please enter the 2FA token.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    const success = await completeTwoFactorLogin(userFor2fa.id, token);
    setIsLoading(false);

    if (success) {
        router.push('/dashboard');
    } else {
        toast({
            title: "2FA Failed",
            description: "The token is invalid. Please try again.",
            variant: "destructive",
        });
        setToken('');
    }
  }

  const handleBackToCredentials = () => {
    setStep('credentials');
    setUserFor2fa(null);
    setPassword('');
    setToken('');
    setQrCode(null);
  }

  const variants = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm overflow-hidden">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <BrandLogo className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>{brandName}</CardTitle>
          <CardDescription>
             {step === 'credentials' && "Sign in to monitor and stay in control"}
             {step === '2fa_setup' && "Two-Factor Authentication Setup"}
             {step === '2fa_verify' && "Two-Factor Authentication"}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <div className="relative">
            <AnimatePresence initial={false} mode="wait">
              {step === 'credentials' && (
                <motion.div
                  key="credentials"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={variants}
                  transition={{ duration: 0.3 }}
                >
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        type="text"
                        placeholder="e.g. johndoe"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Signing In...' : 'Sign In'}
                    </Button>
                  </CardFooter>
                </motion.div>
              )}

              {step === '2fa_setup' && (
                <motion.div
                  key="2fa-setup"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={variants}
                  transition={{ duration: 0.3 }}
                >
                  <CardContent className="space-y-4">
                    <p className="text-center text-sm text-muted-foreground">
                        Scan this QR code with your authenticator app (e.g., Google Authenticator).
                    </p>
                    <div className="flex justify-center items-center py-4">
                      {isLoading || !qrCode ? (
                          <div className="flex flex-col items-center gap-4">
                              <Skeleton className="h-48 w-48" />
                          </div>
                      ) : (
                          <Image src={qrCode} alt="2FA QR Code" width={192} height={192} />
                      )}
                    </div>
                     <p className="text-center text-sm text-muted-foreground">
                        Then enter the 6-digit code below to verify.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="2fa-token-setup">Authentication Code</Label>
                      <Input
                        id="2fa-token-setup"
                        type="text"
                        placeholder="123456"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        required
                        disabled={isLoading}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="\d{6}"
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2">
                    <Button type="submit" className="w-full" disabled={isLoading || !qrCode}>
                      {isLoading ? 'Verifying...' : 'Verify & Sign In'}
                    </Button>
                    <Button variant="link" size="sm" onClick={handleBackToCredentials} disabled={isLoading}>
                        Cancel
                    </Button>
                  </CardFooter>
                </motion.div>
              )}


              {step === '2fa_verify' && (
                <motion.div
                  key="2fa-verify"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={variants}
                  transition={{ duration: 0.3 }}
                >
                  <CardContent className="space-y-4">
                     <p className="text-center text-sm text-muted-foreground">
                        Enter the 6-digit code from your authenticator app.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="2fa-token-verify">Authentication Code</Label>
                      <Input
                        id="2fa-token-verify"
                        type="text"
                        placeholder="123456"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        required
                        disabled={isLoading}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="\d{6}"
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-2">
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Verifying...' : 'Verify'}
                    </Button>
                     <Button variant="link" size="sm" onClick={handleBackToCredentials} disabled={isLoading}>
                        Back to login
                    </Button>
                  </CardFooter>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </form>
      </Card>
    </div>
  );
}
