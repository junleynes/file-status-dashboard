
"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonitoredPaths, User, CleanupSettings } from "@/types";
import { KeyRound, PlusCircle, Trash2, UploadCloud, UserPlus, Users, XCircle, Clock, FolderCog, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readDb } from "@/lib/db";
import { 
    updateMonitoredPaths,
    addMonitoredExtension,
    removeMonitoredExtension,
    updateCleanupSettings
} from "@/lib/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function SettingsPage() {
  const { user, loading, users, addUser, removeUser, updateUserPassword, refreshUsers } = useAuth();
  const { brandName, logo, setBrandName, setLogo, brandingLoading } = useBranding();
  const router = useRouter();

  const [paths, setPaths] = useState<MonitoredPaths>({ importPath: '', failedPath: '' });
  
  const [extensions, setExtensions] = useState<string[]>([]);
  const [newExtension, setNewExtension] = useState('');
  const [localBrandName, setLocalBrandName] = useState(brandName);

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const [cleanupSettings, setCleanupSettings] = useState<CleanupSettings>({
      status: { value: '7', unit: 'days'},
      files: { value: '30', unit: 'days'},
      timeout: { value: '24', unit: 'hours'}
  })

  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user?.role !== 'admin') {
      toast({
        title: "Access Denied",
        description: "You must be an admin to view this page.",
        variant: "destructive",
      });
      router.push('/dashboard');
    }
  }, [user, loading, router, toast]);
  
  useEffect(() => {
    if(!brandingLoading) {
      setLocalBrandName(brandName);
    }
  }, [brandName, brandingLoading]);

  useEffect(() => {
    const fetchData = async () => {
        const db = await readDb();
        setPaths(db.monitoredPaths);
        setExtensions(db.monitoredExtensions);
        setCleanupSettings(db.cleanupSettings);
    }
    fetchData();
  }, [])


  const handleSavePaths = () => {
    startTransition(async () => {
        await updateMonitoredPaths(paths);
        toast({ title: "Paths Updated", description: `Monitored paths have been saved.` });
    });
  };

  const handleAddExtension = (e: React.FormEvent) => {
    e.preventDefault();
    let cleanExtension = newExtension.trim().toLowerCase();
    if(cleanExtension === '') return;
    if (cleanExtension.startsWith('.')) {
        cleanExtension = cleanExtension.substring(1);
    }
    if (extensions.includes(cleanExtension)) {
        toast({ title: "Duplicate Extension", description: `The extension ".${cleanExtension}" is already being monitored.`, variant: "destructive" });
        return;
    }
     startTransition(async () => {
        await addMonitoredExtension(cleanExtension);
        setExtensions(prev => [...prev, cleanExtension]);
        setNewExtension('');
        toast({ title: "Extension Added", description: `Successfully added ".${cleanExtension}" to monitored extensions.`});
    });
  };

  const handleRemoveExtension = (ext: string) => {
    startTransition(async () => {
        await removeMonitoredExtension(ext);
        setExtensions(prev => prev.filter(e => e !== ext));
        toast({ title: "Extension Removed", description: `Successfully removed ".${ext}" from monitored extensions.`, variant: "destructive" });
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        startTransition(async () => {
            await setLogo(reader.result as string);
            toast({ title: "Logo Updated", description: "Your new brand logo has been saved." });
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearLogo = () => {
    startTransition(async () => {
        await setLogo(null);
        toast({ title: "Logo Cleared", description: "The brand logo has been removed.", variant: "destructive" });
    });
  };

  const handleBrandNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalBrandName(e.target.value);
  }

  const handleBrandNameSave = () => {
     startTransition(async () => {
        await setBrandName(localBrandName);
        toast({ title: "Brand Name Updated", description: "Your new brand name has been saved." });
    });
  }

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail || !newUserPassword) {
      toast({ title: "Missing User Information", description: "Please fill out all fields to add a user.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
        const success = await addUser({
            id: crypto.randomUUID(),
            name: newUserName,
            email: newUserEmail,
            password: newUserPassword,
            role: newUserRole,
            avatar: null
        });

        if (success) {
            toast({ title: "User Added", description: `User ${newUserName} has been added successfully.` });
            setNewUserName('');
            setNewUserEmail('');
            setNewUserPassword('');
            setNewUserRole('user');
            await refreshUsers();
        } else {
            toast({ title: "Error", description: "A user with this email already exists.", variant: "destructive" });
        }
    });
  };

  const handleRemoveUser = (userId: string) => {
    if (user?.id === userId) {
      toast({ title: "Cannot Remove Self", description: "You cannot remove your own user account.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
        await removeUser(userId);
        await refreshUsers();
        toast({ title: "User Removed", description: "The user has been removed successfully.", variant: "destructive" });
    });
  };

  const handleOpenResetDialog = (userToReset: User) => {
    setSelectedUser(userToReset);
    setNewPassword('');
    setIsResetDialogOpen(true);
  };

  const handlePasswordReset = () => {
    if (!selectedUser || !newPassword) {
      toast({ title: "Error", description: "Please enter a new password.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
        await updateUserPassword(selectedUser.id, newPassword);
        toast({ title: "Password Reset", description: `Password for ${selectedUser.name} has been updated.` });
        setIsResetDialogOpen(false);
        setSelectedUser(null);
    });
  };

  const handleSaveCleanupSettings = () => {
    startTransition(async () => {
        await updateCleanupSettings(cleanupSettings);
        toast({ title: "Cleanup Settings Saved", description: "Your cleanup preferences have been updated." });
    });
  }

  const handleCleanupSettingChange = <T extends keyof CleanupSettings, K extends keyof CleanupSettings[T]>(
      category: T,
      field: K,
      value: CleanupSettings[T][K]
  ) => {
      setCleanupSettings(prev => ({
          ...prev,
          [category]: {
              ...prev[category],
              [field]: value
          }
      }))
  }


  if (loading || user?.role !== 'admin' || brandingLoading) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Configure application settings, users, and branding.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monitored Folders</CardTitle>
          <CardDescription>Define the main import and failed folders to be monitored by the application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="import-path">Main Import Folder</Label>
                <Input
                  id="import-path"
                  placeholder="e.g., /mnt/storage/import or C:\\Users\\...\\import"
                  value={paths.importPath}
                  onChange={(e) => setPaths(p => ({...p, importPath: e.target.value}))}
                  disabled={isPending}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="failed-path">Failed Folder</Label>
                <Input
                  id="failed-path"
                  placeholder="e.g., /mnt/storage/failed or C:\\Users\\...\\failed"
                  value={paths.failedPath}
                  onChange={(e) => setPaths(p => ({...p, failedPath: e.target.value}))}
                  disabled={isPending}
                />
            </div>
            <Button onClick={handleSavePaths} disabled={isPending}>
              <Save className="mr-2 h-4 w-4" />
              Save Folders
            </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Add, remove, and manage user accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 items-end">
              <div className="space-y-2">
                  <Label htmlFor="new-user-name">Name</Label>
                  <Input id="new-user-name" placeholder="John Doe" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} disabled={isPending} />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="new-user-email">Email</Label>
                  <Input id="new-user-email" type="email" placeholder="user@example.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} disabled={isPending} />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="new-user-password">Password</Label>
                  <Input id="new-user-password" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} disabled={isPending} />
              </div>
              <div className="space-y-2">
                  <Label>Role</Label>
                  <RadioGroup value={newUserRole} onValueChange={(v: 'user'|'admin') => setNewUserRole(v)} className="flex gap-4 pt-2" disabled={isPending}>
                      <div className="flex items-center space-x-2">
                          <RadioGroupItem value="user" id="role-user" />
                          <Label htmlFor="role-user">User</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                          <RadioGroupItem value="admin" id="role-admin" />
                          <Label htmlFor="role-admin">Admin</Label>
                      </div>
                  </RadioGroup>
              </div>
              <Button type="submit" className="w-full lg:col-span-4" disabled={isPending}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
              </Button>
          </form>

          <div className="space-y-2 rounded-lg border p-2">
            <h3 className="text-sm font-medium px-2 pt-1 flex items-center gap-2"><Users className="h-4 w-4" /> Current Users</h3>
            <AnimatePresence>
                {users.length > 0 ? (
                    users.map((u: User) => (
                        <motion.div
                            key={u.id}
                            layout
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-center justify-between rounded-md p-2 hover:bg-muted/50"
                        >
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                    {u.avatar && <AvatarImage src={u.avatar} alt={u.name ?? ''} />}
                                    <AvatarFallback>{u.name?.[0].toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                    <p className="font-medium text-sm">{u.name} <span className="text-xs text-muted-foreground capitalize">({u.role})</span></p>
                                    <p className="text-xs text-muted-foreground">{u.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" onClick={() => handleOpenResetDialog(u)} disabled={isPending}>
                                    <KeyRound className="mr-2 h-4 w-4" />
                                    Reset Password
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveUser(u.id)} disabled={user?.id === u.id || isPending}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        </motion.div>
                    ))
                ) : (
                    <div className="text-center text-muted-foreground p-4">No users found.</div>
                )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Monitored File Extensions</CardTitle>
          <CardDescription>Specify which file extensions or containers to monitor. Add one extension at a time.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddExtension} className="flex gap-4 mb-4">
            <div className="flex-1 space-y-2">
                <Label htmlFor="new-extension">Extension</Label>
                <Input
                id="new-extension"
                placeholder="e.g., mov, wav, pdf"
                value={newExtension}
                onChange={(e) => setNewExtension(e.target.value)}
                disabled={isPending}
                />
            </div>
            <div className="self-end">
              <Button type="submit" className="w-full md:w-auto" disabled={isPending}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Extension
              </Button>
            </div>
          </form>

          <div className="space-y-2 rounded-lg border p-2">
            <AnimatePresence>
                {extensions.length > 0 ? (
                    <div className="flex flex-wrap gap-2 p-2">
                    {extensions.map(ext => (
                        <motion.div
                            key={ext}
                            layout
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground"
                        >
                            <span>.{ext}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full" onClick={() => handleRemoveExtension(ext)} disabled={isPending}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                        </motion.div>
                    ))}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground p-4">No extensions are being monitored. All files will be tracked.</div>
                )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cleanup & Timeout Settings</CardTitle>
          <CardDescription>Configure automatic cleanup rules and processing timeouts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
              <Label>Flag files as Timed-out after</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="number" 
                  className="w-24"
                  value={cleanupSettings.timeout.value}
                  onChange={(e) => handleCleanupSettingChange('timeout', 'value', e.target.value)}
                  min="1"
                  disabled={isPending}
                />
                <Select value={cleanupSettings.timeout.unit} onValueChange={(v: 'hours'|'days') => handleCleanupSettingChange('timeout', 'unit', v)} disabled={isPending}>
                    <SelectTrigger className="w-[120px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Automatically flag files in 'Processing' as 'Timed-out' after this period.</p>
          </div>
          <div className="space-y-2">
              <Label>Clear status from dashboard after</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="number" 
                  className="w-24"
                  value={cleanupSettings.status.value}
                  onChange={(e) => handleCleanupSettingChange('status', 'value', e.target.value)}
                  min="1"
                  disabled={isPending}
                />
                <Select value={cleanupSettings.status.unit} onValueChange={(v: 'hours'|'days') => handleCleanupSettingChange('status', 'unit', v)} disabled={isPending}>
                    <SelectTrigger className="w-[120px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Automatically remove file status entries from the dashboard after this period.</p>
          </div>
           <div className="space-y-2">
              <Label>Clear files from monitored folders after</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="number" 
                  className="w-24"
                  value={cleanupSettings.files.value}
                  onChange={(e) => handleCleanupSettingChange('files', 'value', e.target.value)}
                  min="1"
                  disabled={isPending}
                />
                <Select value={cleanupSettings.files.unit} onValueChange={(v: 'hours' | 'days') => handleCleanupSettingChange('files', 'unit', v)} disabled={isPending}>
                    <SelectTrigger className="w-[120px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Automatically delete files from their source folders after this period.</p>
          </div>
          <Button onClick={handleSaveCleanupSettings} disabled={isPending}>
            <Clock className="mr-2 h-4 w-4" />
            Save Cleanup Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Customize the look and feel of your application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="brand-name">Brand Name</Label>
                <div className="flex gap-2">
                    <Input id="brand-name" value={localBrandName} onChange={handleBrandNameChange} disabled={isPending} />
                    <Button onClick={handleBrandNameSave} disabled={isPending || localBrandName === brandName}>Save</Button>
                </div>
            </div>
            <div className="space-y-2">
                <Label>Logo</Label>
                <div className="flex items-center gap-4">
                    <div className="relative h-16 w-16 rounded-md border p-1">
                      {logo ? (
                        <Image src={logo} alt="Brand Logo" layout="fill" objectFit="contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                           <UploadCloud className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                        <Input id="logo-upload" type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={isPending} />
                        <Button asChild variant="outline" disabled={isPending}>
                            <label htmlFor="logo-upload">
                                <UploadCloud className="mr-2 h-4 w-4" />
                                Upload Logo
                            </label>
                        </Button>
                        {logo && (
                            <Button variant="destructive" onClick={handleClearLogo} disabled={isPending}>
                                <XCircle className="mr-2 h-4 w-4" />
                                Clear Logo
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </CardContent>
      </Card>
      
       <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password for {selectedUser?.name}</DialogTitle>
            <DialogDescription>
              Enter a new password for the selected user. They will be able to use this password to log in next time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reset-password">New Password</Label>
            <Input
              id="reset-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              disabled={isPending}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePasswordReset} disabled={isPending || !newPassword}>Set Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
