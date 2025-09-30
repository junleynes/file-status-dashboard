
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

export default function LoginPage() {
  const [username, setUsername] = useState('user');
  const [password, setPassword] = useState('P@ssw0rd');
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [userFor2fa, setUserFor2fa] = useState<User | null>(null);
  const { login, completeTwoFactorLogin } = useAuth();
  const { brandName } = useBranding();
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === '2fa') {
        handleTwoFactorSubmit();
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

    if (result.success) {
      if (result.twoFactorRequired && result.user) {
        setUserFor2fa(result.user);
        setStep('2fa');
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
          <CardDescription>Sign in to monitor and stay in control</CardDescription>
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

              {step === '2fa' && (
                <motion.div
                  key="2fa"
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
                      <Label htmlFor="2fa-token">Authentication Code</Label>
                      <Input
                        id="2fa-token"
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
