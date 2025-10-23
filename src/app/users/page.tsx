
"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { User } from "@/types";
import { KeyRound, UserPlus, Users, Trash2, ShieldCheck, ShieldOff, Pencil, Mail, MessageSquareWarning, Upload, Download, AlertTriangle } from "lucide-react";
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
import { 
    enableTwoFactor,
    disableTwoFactor,
    sendPasswordResetEmail,
    resetUserPasswordByAdmin,
    exportUsersToCsv,
    importUsersFromCsv,
} from "@/lib/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


export default function UsersPage() {
  const { user, loading, users, addUser, removeUser, updateUser, refreshUsers } = useAuth();
  const router = useRouter();

  const [newUsername, setNewUsername] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedUsername, setEditedUsername] = useState('');
  const [editedName, setEditedName] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [editedRole, setEditedRole] = useState<'user' | 'admin'>('user');
  
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  React.useEffect(() => {
    if (!loading && user?.role !== 'admin') {
      toast({
        title: "Access Denied",
        description: "You must be an admin to view this page.",
        variant: "destructive",
      });
      router.push('/dashboard');
    }
  }, [user, loading, router, toast]);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newUserName || !newUserPassword) {
      toast({ title: "Missing User Information", description: "Please fill out Username, Full Name, and Password.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
        const result = await addUser({
            id: 'user-' + Date.now(),
            username: newUsername,
            name: newUserName,
            email: newUserEmail,
            password: newUserPassword,
            role: newUserRole,
            avatar: null
        });

        if (result.success) {
            toast({ title: "User Added", description: `User ${newUserName} has been added successfully.` });
            setNewUsername('');
            setNewUserName('');
            setNewUserEmail('');
            setNewUserPassword('');
            setNewUserRole('user');
        } else {
            toast({ title: "Error", description: result.message, variant: "destructive" });
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
    setNewPassword('');
    setConfirmNewPassword('');
    setIsResetDialogOpen(true);
  };

  const handlePasswordResetEmail = () => {
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

  const handleManualPasswordReset = () => {
    if (!selectedUser || !newPassword) return;
    
    if (newPassword !== confirmNewPassword) {
        toast({ title: "Passwords do not match", variant: "destructive" });
        return;
    }
     if (newPassword.length < 6) {
        toast({ title: "Password must be at least 6 characters long.", variant: "destructive" });
        return;
    }

    startTransition(async () => {
        const result = await resetUserPasswordByAdmin(selectedUser.id, newPassword);
        if (result.success) {
            toast({ title: "Password Reset Successfully", description: `The password for ${selectedUser.name} has been updated.` });
            setIsResetDialogOpen(false);
            setSelectedUser(null);
        } else {
            toast({ title: "Failed to Reset Password", description: result.error, variant: "destructive" });
        }
    });
  };
  
    const handleOpenEditDialog = (userToEdit: User) => {
        setEditingUser(userToEdit);
        setEditedName(userToEdit.name);
        setEditedUsername(userToEdit.username);
        setEditedEmail(userToEdit.email || '');
        setEditedRole(userToEdit.role);
        setIsEditDialogOpen(true);
    };

    const handleUpdateUser = () => {
        if (!editingUser || !editedName || !editedUsername) {
             toast({ title: "Missing Information", description: "Full Name and Username cannot be empty.", variant: "destructive" });
            return;
        }

        startTransition(async () => {
            const updatedDetails: User = {
                ...editingUser,
                name: editedName,
                username: editedUsername,
                email: editedEmail,
                role: editedRole,
            };
            await updateUser(updatedDetails);
            toast({ title: "User Updated", description: `${editedName}'s details have been saved.` });
            setIsEditDialogOpen(false);
            setEditingUser(null);
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
  
  const handleExport = () => {
    startTransition(async () => {
      const { csv, error } = await exportUsersToCsv();
      if (error) {
        toast({ title: "Export Failed", description: error, variant: "destructive" });
        return;
      }
      const blob = new Blob([csv!], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      const date = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `user-backup-${date}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Export Successful", description: "User data has been downloaded." });
    });
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setImportError('Invalid file type. Please upload a CSV file.');
        setImportFile(null);
      } else {
        setImportFile(file);
        setImportError(null);
      }
    }
  };

  const handleImport = () => {
    if (!importFile) return;

    startTransition(async () => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        const result = await importUsersFromCsv(content);
        if (result.error) {
          toast({ title: "Import Failed", description: result.error, variant: "destructive", duration: 10000 });
        } else {
          toast({ title: "Import Successful", description: `${result.importedCount} users have been imported.` });
          await refreshUsers();
        }
        setIsImportDialogOpen(false);
        setImportFile(null);
        setImportError(null);
      };
      reader.readAsText(importFile);
    });
  };


  if (loading || user?.role !== 'admin') {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
            <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
            <p className="text-muted-foreground">Add, remove, and manage user accounts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} disabled={isPending}>
                <Upload className="mr-2 h-4 w-4" />
                Import Users
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={isPending}>
                <Download className="mr-2 h-4 w-4" />
                {isPending ? "Exporting..." : "Export Users"}
            </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add New User</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddUser} className="space-y-4">
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
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle>Current Users</CardTitle>
            <CardDescription>Manage existing user accounts and permissions.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="space-y-2 rounded-lg border">
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
                                className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-md p-2 hover:bg-muted/50 gap-2 border-b"
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
                                    <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(u)} disabled={isPending}>
                                        <Pencil className="mr-2 h-4 w-4" />
                                        <span className="hidden sm:inline">Edit</span>
                                    </Button>
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
      
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit User: {editingUser?.name}</DialogTitle>
                    <DialogDescription>
                        Update the user's details below.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit-user-name">Full Name</Label>
                        <Input id="edit-user-name" value={editedName} onChange={(e) => setEditedName(e.target.value)} disabled={isPending} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-user-username">Username</Label>
                        <Input id="edit-user-username" value={editedUsername} onChange={(e) => setEditedUsername(e.target.value)} disabled={isPending} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-user-email">Email Address</Label>
                        <Input id="edit-user-email" type="email" value={editedEmail} onChange={(e) => setEditedEmail(e.target.value)} disabled={isPending} />
                    </div>
                    <div className="space-y-2">
                        <Label>Role</Label>
                        <RadioGroup 
                            value={editedRole} 
                            onValueChange={(v: 'user'|'admin') => setEditedRole(v)} 
                            className="flex gap-4 pt-2" 
                            disabled={isPending || editingUser?.id === user?.id}
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="user" id="edit-role-user" />
                                <Label htmlFor="edit-role-user">User</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="admin" id="edit-role-admin" />
                                <Label htmlFor="edit-role-admin">Admin</Label>
                            </div>
                        </RadioGroup>
                         {editingUser?.id === user?.id && (
                            <p className="text-xs text-muted-foreground">You cannot change your own role.</p>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdateUser} disabled={isPending}>
                        {isPending ? "Saving..." : "Save Changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

       <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password for {selectedUser?.name}</DialogTitle>
             <DialogDescription>
                Choose a method to reset the user's password.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="send-email" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="send-email" disabled={!selectedUser?.email}>Send Reset Email</TabsTrigger>
                <TabsTrigger value="set-manually">Set Manually</TabsTrigger>
            </TabsList>
            <TabsContent value="send-email">
                <div className="py-4 space-y-4">
                    <p className="text-sm text-muted-foreground">
                        This will generate a new random password and email it to the user.
                    </p>
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
                </div>
                 <DialogFooter>
                    <Button variant="outline" onClick={() => setIsResetDialogOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={handlePasswordResetEmail} 
                        disabled={isPending || !selectedUser?.email}
                    >
                    {isPending ? 'Sending...' : 'Send Reset Email'}
                    </Button>
                </DialogFooter>
            </TabsContent>
            <TabsContent value="set-manually">
                 <div className="py-4 space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Enter a new password for the user. They will not be notified of this change.
                    </p>
                    <div className="space-y-2">
                        <Label htmlFor="new-password">New Password</Label>
                        <Input 
                            id="new-password"
                            type="password" 
                            value={newPassword} 
                            onChange={(e) => setNewPassword(e.target.value)} 
                            disabled={isPending}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                        <Input 
                            id="confirm-new-password"
                            type="password" 
                            value={confirmNewPassword} 
                            onChange={(e) => setConfirmNewPassword(e.target.value)} 
                            disabled={isPending}
                        />
                    </div>
                </div>
                 <DialogFooter>
                    <Button variant="outline" onClick={() => setIsResetDialogOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={handleManualPasswordReset} 
                        disabled={isPending || !newPassword || newPassword !== confirmNewPassword}
                    >
                    {isPending ? 'Saving...' : 'Set New Password'}
                    </Button>
                </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Import Users from CSV</DialogTitle>
                  <DialogDescription>
                      Upload a CSV file to bulk add or update users. The CSV must contain 'id', 'username', 'name', 'role', and 'password' columns.
                  </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                  <div className="grid w-full max-w-sm items-center gap-1.5">
                      <Label htmlFor="csv-file">CSV File</Label>
                      <Input id="csv-file" type="file" accept=".csv" onChange={handleImportFileChange} />
                  </div>
                  {importError && (
                      <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Error</AlertTitle>
                          <AlertDescription>{importError}</AlertDescription>
                      </Alert>
                  )}
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleImport} disabled={!importFile || isPending}>
                      {isPending ? 'Importing...' : 'Import Users'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
      
    </motion.div>
  );
}
