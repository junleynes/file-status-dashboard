"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { initialMonitoredPaths } from "@/lib/mock-data";
import type { MonitoredPath } from "@/types";
import { PlusCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [paths, setPaths] = useState<MonitoredPath[]>(initialMonitoredPaths);
  const [newPath, setNewPath] = useState('');
  const [newLabel, setNewLabel] = useState('');
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
    if (newPath.trim() === '') return;
    setPaths(prev => [...prev, { id: crypto.randomUUID(), path: newPath, label: newLabel || undefined }]);
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
  
  if (loading || user?.role !== 'admin') {
    return null; // Or a loading spinner
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
          Configure which folders and paths are being monitored.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monitored Paths</CardTitle>
          <CardDescription>Add or remove network and local paths to monitor.</CardDescription>
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
                <Label htmlFor="new-label">Label (Optional)</Label>
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
                                {path.label && <p className="text-xs text-muted-foreground">{path.label}</p>}
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
    </motion.div>
  );
}
