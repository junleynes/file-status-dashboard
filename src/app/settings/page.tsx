"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { initialMonitoredPaths, initialMonitoredExtensions } from "@/lib/mock-data";
import type { MonitoredPath } from "@/types";
import { PlusCircle, Trash2, UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const { brandName, logo, setBrandName, setLogo } = useBranding();
  const router = useRouter();

  const [paths, setPaths] = useState<MonitoredPath[]>(initialMonitoredPaths);
  const [newPath, setNewPath] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const [extensions, setExtensions] = useState<string[]>(initialMonitoredExtensions);
  const [newExtension, setNewExtension] = useState('');
  const [localBrandName, setLocalBrandName] = useState(brandName);

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

  const handleAddPath = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPath.trim() === '' || newLabel.trim() === '') {
        toast({
            title: "Missing Information",
            description: "Please provide both a path and a label.",
            variant: "destructive",
        });
        return;
    }
    setPaths(prev => [...prev, { id: crypto.randomUUID(), path: newPath, label: newLabel }]);
    setNewPath('');
    setNewLabel('');
    toast({
        title: "Path Added",
        description: `Successfully added "${newPath}" to monitored paths.`,
      });
  };

  const handleRemovePath = (id: string) => {
    const pathToRemove = paths.find(p => p.id === id);
    setPaths(prev => prev.filter(p => p.id !== id));
    toast({
        title: "Path Removed",
        description: `Successfully removed "${pathToRemove?.path}" from monitored paths.`,
        variant: 'destructive'
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
        toast({
            title: "Duplicate Extension",
            description: `The extension ".${cleanExtension}" is already being monitored.`,
            variant: "destructive",
        });
        return;
    }
    setExtensions(prev => [...prev, cleanExtension]);
    setNewExtension('');
    toast({
        title: "Extension Added",
        description: `Successfully added ".${cleanExtension}" to monitored extensions.`,
    });
  };

  const handleRemoveExtension = (ext: string) => {
    setExtensions(prev => prev.filter(e => e !== ext));
    toast({
        title: "Extension Removed",
        description: `Successfully removed ".${ext}" from monitored extensions.`,
        variant: "destructive",
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogo(reader.result as string);
        toast({
            title: "Logo Updated",
            description: "Your new brand logo has been saved.",
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBrandNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalBrandName(e.target.value);
  }

  const handleBrandNameSave = () => {
    setBrandName(localBrandName);
    toast({
        title: "Brand Name Updated",
        description: "Your new brand name has been saved.",
    });
  }

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
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Configure branding, monitored paths, and file types.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Customize the look and feel of your application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="brand-name">Brand Name</Label>
                <div className="flex gap-2">
                    <Input id="brand-name" value={localBrandName} onChange={handleBrandNameChange} />
                    <Button onClick={handleBrandNameSave}>Save</Button>
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
                    <Input id="logo-upload" type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    <Button asChild variant="outline">
                        <label htmlFor="logo-upload">
                            <UploadCloud className="mr-2 h-4 w-4" />
                            Upload Logo
                        </label>
                    </Button>
                </div>
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monitored Paths</CardTitle>
          <CardDescription>Add or remove network and local paths to monitor. The label provides a friendly name for the source of a file.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddPath} className="flex flex-col gap-4 mb-4 md:flex-row">
            <div className="flex-1 space-y-2">
                <Label htmlFor="new-path">Path</Label>
                <Input
                id="new-path"
                placeholder="e.g., /mnt/storage/import or C:\\Users\\..."
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="new-label">Label</Label>
                <Input
                id="new-label"
                placeholder="e.g., Main Storage"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                />
            </div>
            <div className="self-end">
              <Button type="submit" className="w-full md:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Path
              </Button>
            </div>
          </form>

          <div className="space-y-2 rounded-lg border p-2">
            <AnimatePresence>
                {paths.length > 0 ? (
                    paths.map(path => (
                        <motion.div
                            key={path.id}
                            layout
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-center justify-between rounded-md p-2 hover:bg-muted/50"
                        >
                            <div className="flex flex-col">
                                <p className="font-mono text-sm">{path.path}</p>
                                <p className="text-xs text-muted-foreground">{path.label}</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => handleRemovePath(path.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </motion.div>
                    ))
                ) : (
                    <div className="text-center text-muted-foreground p-4">No paths are being monitored.</div>
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
                />
            </div>
            <div className="self-end">
              <Button type="submit" className="w-full md:w-auto">
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
                            <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full" onClick={() => handleRemoveExtension(ext)}>
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
    </motion.div>
  );
}
