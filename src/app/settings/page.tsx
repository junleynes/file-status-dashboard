

"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonitoredPath, MonitoredPaths, User, CleanupSettings, SmtpSettings, ProcessingSettings } from "@/types";
import { KeyRound, PlusCircle, Trash2, UploadCloud, UserPlus, Users, XCircle, Clock, FolderCog, Save, Server, Folder, Edit, Check, MessageSquareText, Network, Info, MessageSquareWarning, ShieldCheck, ShieldOff, FileImage, Mail, Send, Wand2, Bot } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { readDb } from "@/lib/db";
import { 
    updateMonitoredPaths,
    addMonitoredExtension,
    removeMonitoredExtension,
    updateCleanupSettings,
    testPath,
    updateFailureRemark,
    enableTwoFactor,
    disableTwoFactor,
    updateSmtpSettings,
    testSmtpConnection,
    sendPasswordResetEmail,
    updateProcessingSettings,
} from "@/lib/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BrandLogo } from "@/components/brand-logo";

const defaultImportPath: MonitoredPath = {
  id: 'import-path',
  name: 'Import',
  path: '',
};

const defaultFailedPath: MonitoredPath = {
  id: 'failed-path',
  name: 'Failed',
  path: '',
};

const defaultSmtpSettings: SmtpSettings = {
    host: '',
    port: 587,
    secure: false,
    auth: {
        user: '',
        pass: ''
    }
};

const defaultProcessingSettings: ProcessingSettings = {
    autoTrimInvalidChars: false,
    autoExpandPrefixes: false,
};


export default function SettingsPage() {
  const { user, loading, users, addUser, removeUser, refreshUsers } = useAuth();
  const { brandName, logo, favicon, footerText, setBrandName, setLogo, setFavicon, setFooterText, brandingLoading } = useBranding();
  const router = useRouter();

  const [paths, setPaths] = useState<MonitoredPaths>({ import: defaultImportPath, failed: defaultFailedPath });
  const [editingPathId, setEditingPathId] = useState<string | null>(null);
  
  const [extensions, setExtensions] = useState<string[]>([]);
  const [newExtension, setNewExtension] = useState('');
  const [localBrandName, setLocalBrandName] = useState(brandName);
  const [localFooterText, setLocalFooterText] = useState(footerText);

  const [newUsername, setNewUsername] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const [cleanupSettings, setCleanupSettings] = useState<CleanupSettings>({
      status: { enabled: true, value: '7', unit: 'days'},
      files: { enabled: false, value: '30', unit: 'days'},
      timeout: { enabled: true, value: '24', unit: 'hours'}
  })
  
  const [failureRemark, setFailureRemark] = useState('');
  const [initialFailureRemark, setInitialFailureRemark] = useState('');
  
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>(defaultSmtpSettings);
  
  const [processingSettings, setProcessingSettings] = useState<ProcessingSettings>(defaultProcessingSettings);


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
      setLocalFooterText(footerText);
    }
  }, [brandName, footerText, brandingLoading]);

  useEffect(() => {
    const fetchData = async () => {
        const db = await readDb();
        setPaths(db.monitoredPaths);
        setExtensions(db.monitoredExtensions);
        setCleanupSettings(db.cleanupSettings);
        setFailureRemark(db.failureRemark || '');
        setInitialFailureRemark(db.failureRemark || '');
        setSmtpSettings(db.smtpSettings || defaultSmtpSettings);
        setProcessingSettings(db.processingSettings || defaultProcessingSettings);
    }
    fetchData();
  }, [])


  const handleSavePath = (id: 'import' | 'failed') => {
    startTransition(async () => {
        const pathData = paths[id];
        if (!pathData.name || !pathData.path) {
             toast({ title: "Error", description: `Please fill in all required fields for the ${pathData.name} Location.`, variant: "destructive" });
             return;
        }

        await updateMonitoredPaths(paths);
        toast({ title: "Location Saved", description: `Configuration for ${pathData.name} has been saved.` });
        setEditingPathId(null);
    });
  };

  const handleTestPath = (id: 'import' | 'failed') => {
    startTransition(async () => {
        const pathData = paths[id];
        if (!pathData.path) {
            toast({ title: "Error", description: "Path cannot be empty.", variant: "destructive" });
            return;
        }
        const result = await testPath(pathData.path);
        if (result.success) {
            toast({ 
              title: "Success", 
              description: `Path "${pathData.path}" is accessible.`,
            });
        } else {
            toast({ title: "Error", description: result.error, variant: "destructive", duration: 10000 });
        }
    });
  }

  const handlePathChange = (
    type: 'import' | 'failed', 
    field: keyof MonitoredPath, 
    value: MonitoredPath[keyof MonitoredPath]
  ) => {
    setPaths(prev => ({
        ...prev,
        [type]: {
            ...prev[type],
            [field]: value
        }
    }));
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
  
  const handleSaveFailureRemark = () => {
    startTransition(async () => {
        await updateFailureRemark(failureRemark);
        setInitialFailureRemark(failureRemark);
        toast({ title: "Failure Remark Saved", description: "The global failure remark has been updated." });
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
  
  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        startTransition(async () => {
            await setFavicon(reader.result as string);
            toast({ title: "Favicon Updated", description: "Your new favicon has been saved. It may take a moment to update in your browser." });
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
  
  const handleClearFavicon = () => {
    startTransition(async () => {
        await setFavicon(null);
        toast({ title: "Favicon Cleared", description: "The favicon has been removed.", variant: "destructive" });
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

  const handleFooterTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalFooterText(e.target.value);
  }

  const handleFooterTextSave = () => {
     startTransition(async () => {
        await setFooterText(localFooterText);
        toast({ title: "Footer Text Updated", description: "Your new footer text has been saved." });
    });
  }


  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newUserName || !newUserPassword) {
      toast({ title: "Missing User Information", description: "Please fill out Username, Full Name, and Password.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
        const success = await addUser({
            id: 'user-' + Date.now(),
            username: newUsername,
            name: newUserName,
            email: newUserEmail,
            password: newUserPassword,
            role: newUserRole,
            avatar: null
        });

        if (success) {
            toast({ title: "User Added", description: `User ${newUserName} has been added successfully.` });
            setNewUsername('');
            setNewUserName('');
            setNewUserEmail('');
            setNewUserPassword('');
            setNewUserRole('user');
        } else {
            toast({ title: "Error", description: "A user with this username already exists.", variant: "destructive" });
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
        toast({ title: "User Removed", description: "The user has been removed successfully.", variant: "destructive" });
    });
  };

  const handleOpenResetDialog = (userToReset: User) => {
    setSelectedUser(userToReset);
    setIsResetDialogOpen(true);
  };

  const handlePasswordReset = () => {
    if (!selectedUser) return;

    if (!selectedUser.email) {
      toast({
        title: "Cannot Reset Password",
        description: "This user does not have a registered email address to send the temporary password to.",
        variant: "destructive"
      });
      return;
    }

    startTransition(async () => {
      const result = await sendPasswordResetEmail(selectedUser.id);
      if (result.success) {
        toast({
          title: "Password Reset Email Sent",
          description: `A temporary password has been sent to ${selectedUser.name}.`
        });
        setIsResetDialogOpen(false);
        setSelectedUser(null);
      } else {
        toast({
          title: "Failed to Send Email",
          description: result.error,
          variant: "destructive"
        });
      }
    });
  };
  
  const handleEnableTwoFactor = async (userId: string) => {
    startTransition(async () => {
        await enableTwoFactor(userId);
        await refreshUsers();
        toast({ title: "2FA Enabled", description: "User will be prompted to set up 2FA on their next login." });
    });
  };

  const handleDisableTwoFactor = async (userId: string) => {
    startTransition(async () => {
        await disableTwoFactor(userId);
        await refreshUsers();
        toast({ title: "2FA Disabled", description: "Two-factor authentication has been disabled for this user." });
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
  
  const handleSmtpSettingChange = (field: keyof SmtpSettings | `auth.${keyof SmtpSettings['auth']}`, value: any) => {
    setSmtpSettings(prev => {
        const newSettings = { ...prev };
        if (field.startsWith('auth.')) {
            const authField = field.split('.')[1] as keyof SmtpSettings['auth'];
            newSettings.auth = { ...newSettings.auth, [authField]: value };
        } else {
            (newSettings as any)[field] = value;
        }
        return newSettings;
    });
  };

  const handleSaveSmtpSettings = () => {
    startTransition(async () => {
        await updateSmtpSettings(smtpSettings);
        toast({ title: "SMTP Settings Saved", description: "Your email configuration has been updated." });
    });
  };
  
  const handleTestSmtpConnection = () => {
    startTransition(async () => {
        await updateSmtpSettings(smtpSettings); // Save before testing
        const result = await testSmtpConnection();
        if (result.success) {
            toast({ title: "SMTP Connection Successful", description: "The application successfully connected to your SMTP server." });
        } else {
            toast({ title: "SMTP Connection Failed", description: result.error, variant: "destructive", duration: 10000 });
        }
    });
  }
  
  const handleProcessingSettingsChange = (field: keyof ProcessingSettings, value: boolean) => {
    startTransition(async () => {
        const newSettings = { ...processingSettings, [field]: value };
        await updateProcessingSettings(newSettings);
        setProcessingSettings(newSettings);
        toast({ title: "Processing Settings Saved", description: "Your file processing rules have been updated." });
    });
  }


  if (loading || user?.role !== 'admin' || brandingLoading) {
    return null;
  }

  const renderPath = (p: MonitoredPath, type: 'import' | 'failed') => {
    const isEditing = editingPathId === p.id;
    const onPathChange = (field: keyof MonitoredPath, value: any) => handlePathChange(type, field, value);

    return (
        <div className="rounded-lg border p-4 space-y-4 relative bg-muted/20">
            <div className="absolute top-2 right-2 flex gap-1">
                 {isEditing ? (
                    <Button variant="ghost" size="icon" onClick={() => handleSavePath(type)} disabled={isPending}>
                        <Check className="h-5 w-5 text-green-600" />
                    </Button>
                ) : (
                    <Button variant="ghost" size="icon" onClick={() => setEditingPathId(p.id)} disabled={isPending}>
                        <Edit className="h-4 w-4" />
                    </Button>
                )}
                 <Button variant="ghost" size="icon" onClick={() => handleTestPath(type)} disabled={isPending} title="Test Path">
                    <Network className="h-4 w-4" />
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor={`name-${p.id}`}>Name</Label>
                    <Input id={`name-${p.id}`} placeholder="e.g., Main Storage" value={p.name} onChange={e => onPathChange('name', e.target.value)} disabled={!isEditing || isPending} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor={`path-${p.id}`}>Path</Label>
                    <Input id={`path-${p.id}`} placeholder="e.g., /mnt/storage/import" value={p.path} onChange={e => onPathChange('path', e.target.value)} disabled={!isEditing || isPending} />
                </div>
            </div>
             <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Provide the full local path to the folder. If it's a network share, it must be mounted on the server's operating system first.
                  </AlertDescription>
            </Alert>
        </div>
    )
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
          <CardTitle>Monitored Locations</CardTitle>
          <CardDescription>Define the import and failed locations to be monitored by the application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div>
              <Label className="text-base font-medium">Import Location</Label>
              <div className="mt-2">
                {renderPath(paths.import, 'import')}
              </div>
            </div>
            
            <div>
                 <Label className="text-base font-medium">Failed Location</Label>
                 <div className="mt-2">
                     {renderPath(paths.failed, 'failed')}
                 </div>
            </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>File Processing</CardTitle>
          <CardDescription>Configure automated rules for how files are handled in the `rejected` folder.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-row items-start space-x-4 rounded-lg border p-4">
                <Switch
                    id="auto-trim-chars"
                    checked={processingSettings.autoTrimInvalidChars}
                    onCheckedChange={(checked) => handleProcessingSettingsChange('autoTrimInvalidChars', checked)}
                    disabled={isPending}
                />
                <div className="flex-1 space-y-1">
                    <Label htmlFor="auto-trim-chars">Auto-fix invalid filenames</Label>
                    <p className="text-xs text-muted-foreground">Automatically remove leading, trailing, and multiple consecutive spaces from filenames in the rejected folder and retry them.</p>
                </div>
            </div>
             <div className="flex flex-row items-start space-x-4 rounded-lg border p-4">
                <Switch
                    id="auto-expand-prefixes"
                    checked={processingSettings.autoExpandPrefixes}
                    onCheckedChange={(checked) => handleProcessingSettingsChange('autoExpandPrefixes', checked)}
                    disabled={isPending}
                />
                <div className="flex-1 space-y-1">
                    <Label htmlFor="auto-expand-prefixes">Auto Expand Filename Prefixes</Label>
                    <p className="text-xs text-muted-foreground">When a file in `rejected` matches `PBPCPN..._xxxxxx_xxxxxx_xxxxx.ext`, automatically create copies in `import` for each valid 'P', 'B', or 'C' prefix pair.</p>
                </div>
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Failure Reason Management</CardTitle>
          <CardDescription>Configure the global reason text for all file processing failures.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="space-y-2">
                <Label htmlFor="failure-remark">Failure Remark</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Input 
                        id="failure-remark"
                        value={failureRemark} 
                        onChange={(e) => setFailureRemark(e.target.value)} 
                        disabled={isPending} 
                        placeholder="Enter a default failure remark"
                    />
                    <Button onClick={handleSaveFailureRemark} disabled={isPending || failureRemark === initialFailureRemark} className="w-full sm:w-auto">
                        <Save className="mr-2 h-4 w-4" />
                        Save
                    </Button>
                </div>
                 <p className="text-xs text-muted-foreground">This text will be applied to the remarks field of any file that fails processing.</p>
            </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Add, remove, and manage user accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddUser} className="mb-6 space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
               <div className="space-y-2">
                  <Label htmlFor="new-user-username">Username</Label>
                  <Input id="new-user-username" placeholder="johndoe" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} disabled={isPending} />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="new-user-name">Full Name</Label>
                  <Input id="new-user-name" placeholder="John Doe" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} disabled={isPending} />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="new-user-email">Email (Optional)</Label>
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
               <Button type="submit" disabled={isPending} className="w-full lg:w-auto">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
              </Button>
            </div>
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
                            className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-md p-2 hover:bg-muted/50 gap-2"
                        >
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                    {u.avatar && <AvatarImage src={u.avatar} alt={u.name ?? ''} />}
                                    <AvatarFallback>{u.name?.[0].toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-medium text-sm">{u.name} <span className="text-xs text-muted-foreground">({u.role})</span></p>
                                    <p className="text-xs text-muted-foreground">@{u.username} {u.email && `· ${u.email}`}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap self-end sm:self-center">
                                {u.twoFactorRequired ? (
                                    <Button variant="outline" size="sm" onClick={() => handleDisableTwoFactor(u.id)} disabled={isPending}>
                                        <ShieldOff className="mr-2 h-4 w-4 text-destructive" />
                                        <span className="hidden sm:inline">Disable 2FA</span>
                                    </Button>
                                ) : (
                                     <Button variant="outline" size="sm" onClick={() => handleEnableTwoFactor(u.id)} disabled={isPending}>
                                        <ShieldCheck className="mr-2 h-4 w-4 text-green-600" />
                                        <span className="hidden sm:inline">Enable 2FA</span>
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" onClick={() => handleOpenResetDialog(u)} disabled={isPending}>
                                    <KeyRound className="mr-2 h-4 w-4" />
                                    <span className="hidden sm:inline">Reset Password</span>
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
          <CardTitle>SMTP Configuration</CardTitle>
          <CardDescription>Configure your SMTP server to send password reset emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="smtp-host">SMTP Host</Label>
                    <Input id="smtp-host" value={smtpSettings.host} onChange={(e) => handleSmtpSettingChange('host', e.target.value)} disabled={isPending} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="smtp-port">Port</Label>
                    <Input id="smtp-port" type="number" value={smtpSettings.port} onChange={(e) => handleSmtpSettingChange('port', parseInt(e.target.value, 10))} disabled={isPending} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="smtp-user">Username</Label>
                    <Input id="smtp-user" value={smtpSettings.auth.user} onChange={(e) => handleSmtpSettingChange('auth.user', e.target.value)} disabled={isPending} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="smtp-pass">Password</Label>
                    <Input id="smtp-pass" type="password" value={smtpSettings.auth.pass} onChange={(e) => handleSmtpSettingChange('auth.pass', e.target.value)} disabled={isPending} />
                </div>
            </div>
             <div className="flex items-center space-x-2">
                <Switch id="smtp-secure" checked={smtpSettings.secure} onCheckedChange={(checked) => handleSmtpSettingChange('secure', checked)} disabled={isPending} />
                <Label htmlFor="smtp-secure">Use SSL/TLS</Label>
            </div>
             <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button onClick={handleSaveSmtpSettings} disabled={isPending}>
                    <Save className="mr-2 h-4 w-4" /> Save SMTP Settings
                </Button>
                <Button variant="outline" onClick={handleTestSmtpConnection} disabled={isPending}>
                    <Send className="mr-2 h-4 w-4" /> Test Connection
                </Button>
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monitored File Extensions</CardTitle>
          <CardDescription>Specify which file extensions or containers to monitor. Add one extension at a time.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddExtension} className="flex flex-col sm:flex-row gap-4 mb-4">
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
              <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
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
        <CardContent className="space-y-4">
           <div className="flex flex-row items-start space-x-4 rounded-lg border p-4">
                <Switch
                    id="timeout-enabled"
                    checked={cleanupSettings.timeout.enabled}
                    onCheckedChange={(checked) => handleCleanupSettingChange('timeout', 'enabled', checked)}
                    disabled={isPending}
                />
                <div className="flex-1 space-y-1">
                    <Label htmlFor="timeout-enabled">Flag files as Timed-out</Label>
                    <p className="text-xs text-muted-foreground">Automatically flag files in 'Processing' as 'Timed-out' after a set period.</p>
                     <div className="flex items-center gap-2 pt-2" style={{ opacity: cleanupSettings.timeout.enabled ? 1 : 0.5 }}>
                        <Input 
                        type="number" 
                        className="w-24"
                        value={cleanupSettings.timeout.value}
                        onChange={(e) => handleCleanupSettingChange('timeout', 'value', e.target.value)}
                        min="1"
                        disabled={isPending || !cleanupSettings.timeout.enabled}
                        />
                        <Select value={cleanupSettings.timeout.unit} onValueChange={(v: 'hours'|'days') => handleCleanupSettingChange('timeout', 'unit', v)} disabled={isPending || !cleanupSettings.timeout.enabled}>
                            <SelectTrigger className="w-[120px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="hours">Hours</SelectItem>
                                <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="flex flex-row items-start space-x-4 rounded-lg border p-4">
                 <Switch
                    id="status-enabled"
                    checked={cleanupSettings.status.enabled}
                    onCheckedChange={(checked) => handleCleanupSettingChange('status', 'enabled', checked)}
                    disabled={isPending}
                />
                 <div className="flex-1 space-y-1">
                    <Label htmlFor="status-enabled">Clear status from dashboard</Label>
                    <p className="text-xs text-muted-foreground">Automatically remove file status entries from the dashboard after a set period.</p>
                    <div className="flex items-center gap-2 pt-2" style={{ opacity: cleanupSettings.status.enabled ? 1 : 0.5 }}>
                        <Input 
                        type="number" 
                        className="w-24"
                        value={cleanupSettings.status.value}
                        onChange={(e) => handleCleanupSettingChange('status', 'value', e.target.value)}
                        min="1"
                        disabled={isPending || !cleanupSettings.status.enabled}
                        />
                        <Select value={cleanupSettings.status.unit} onValueChange={(v: 'hours'|'days') => handleCleanupSettingChange('status', 'unit', v)} disabled={isPending || !cleanupSettings.status.enabled}>
                            <SelectTrigger className="w-[120px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="hours">Hours</SelectItem>
                                <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="flex flex-row items-start space-x-4 rounded-lg border p-4">
                <Switch
                    id="files-enabled"
                    checked={cleanupSettings.files.enabled}
                    onCheckedChange={(checked) => handleCleanupSettingChange('files', 'enabled', checked)}
                    disabled={isPending}
                />
                <div className="flex-1 space-y-1">
                    <Label htmlFor="files-enabled">Clear files from monitored folders</Label>
                    <p className="text-xs text-muted-foreground">Automatically delete files from their source folders after a set period.</p>
                    <div className="flex items-center gap-2 pt-2" style={{ opacity: cleanupSettings.files.enabled ? 1 : 0.5 }}>
                        <Input 
                        type="number" 
                        className="w-24"
                        value={cleanupSettings.files.value}
                        onChange={(e) => handleCleanupSettingChange('files', 'value', e.target.value)}
                        min="1"
                        disabled={isPending || !cleanupSettings.files.enabled}
                        />
                        <Select value={cleanupSettings.files.unit} onValueChange={(v: 'hours' | 'days') => handleCleanupSettingChange('files', 'unit', v)} disabled={isPending || !cleanupSettings.files.enabled}>
                            <SelectTrigger className="w-[120px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="hours">Hours</SelectItem>
                                <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
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
                <div className="flex flex-col sm:flex-row gap-2">
                    <Input id="brand-name" value={localBrandName} onChange={handleBrandNameChange} disabled={isPending} />
                    <Button onClick={handleBrandNameSave} disabled={isPending || localBrandName === brandName} className="w-full sm:w-auto">Save</Button>
                </div>
            </div>
            <div className="space-y-2">
                <Label>Logo</Label>
                <div className="flex items-center gap-4">
                    <div className="relative h-16 w-16 rounded-md border p-1">
                      <BrandLogo className="h-full w-full" />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
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
            <div className="space-y-2">
                <Label>Favicon</Label>
                 <div className="flex items-center gap-4">
                    <div className="relative h-16 w-16 rounded-md border p-2 flex items-center justify-center">
                      {favicon ? (
                        <Image src={favicon} alt="Favicon preview" layout="fill" objectFit="contain" />
                      ) : (
                        <FileImage className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input id="favicon-upload" type="file" accept="image/png, image/jpeg, image/svg+xml, image/x-icon, image/vnd.microsoft.icon" onChange={handleFaviconUpload} className="hidden" disabled={isPending} />
                        <Button asChild variant="outline" disabled={isPending}>
                            <label htmlFor="favicon-upload">
                                <UploadCloud className="mr-2 h-4 w-4" />
                                Upload Favicon
                            </label>
                        </Button>
                        {favicon && (
                            <Button variant="destructive" onClick={handleClearFavicon} disabled={isPending}>
                                <XCircle className="mr-2 h-4 w-4" />
                                Clear Favicon
                            </Button>
                        )}
                    </div>
                </div>
            </div>
             <div className="space-y-2">
                <Label htmlFor="footer-text">Footer Text</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Input id="footer-text" value={localFooterText} onChange={handleFooterTextChange} disabled={isPending} />
                    <Button onClick={handleFooterTextSave} disabled={isPending || localFooterText === footerText} className="w-full sm:w-auto">Save</Button>
                </div>
            </div>
        </CardContent>
      </Card>
      
       <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password for {selectedUser?.name}</DialogTitle>
            <DialogDescription>
                This will generate a new random password and email it to the user. Are you sure you want to continue?
            </DialogDescription>
          </DialogHeader>
          {selectedUser?.email ? (
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                An email with the temporary password will be sent to <strong>{selectedUser.email}</strong>.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <MessageSquareWarning className="h-4 w-4" />
              <AlertDescription>
                This user does not have a registered email address. Cannot send password reset email.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetDialogOpen(false)}>Cancel</Button>
            <Button 
                onClick={handlePasswordReset} 
                disabled={isPending || !selectedUser?.email}
            >
              {isPending ? 'Sending...' : 'Send Reset Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

    

    