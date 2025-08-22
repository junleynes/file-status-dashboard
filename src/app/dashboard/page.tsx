"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { FileStatusTable } from "@/components/file-status-table";
import { useAuth } from "@/hooks/use-auth";
import type { FileStatus } from "@/types";
import { initialFileStatuses } from "@/lib/mock-data";
import { Trash2, Search, X, CheckCircle2, AlertTriangle, Loader } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function DashboardPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileStatus[]>(initialFileStatuses);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FileStatus['status'] | 'all'>('all');
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedFiles = localStorage.getItem('file-statuses');
      if (storedFiles) {
        setFiles(JSON.parse(storedFiles));
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('file-statuses', JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFiles(currentFiles => {
        const newFiles = [...currentFiles];
        const processingFiles = newFiles.filter(f => f.status === 'processing');
        
        // Randomly decide to process a file or add a new one
        if (processingFiles.length > 0 && Math.random() > 0.3) {
            // Process an existing file
            const fileToProcessIndex = newFiles.findIndex(f => f.id === processingFiles[0].id);
            if (fileToProcessIndex !== -1) {
                const outcome = Math.random();
                if (outcome < 0.2) { // 20% chance of failure
                    newFiles[fileToProcessIndex] = {
                        ...newFiles[fileToProcessIndex],
                        status: 'failed',
                        source: 'Failed Folder',
                        lastUpdated: new Date().toISOString()
                    };
                } else { // 80% chance of success
                    newFiles[fileToProcessIndex] = {
                        ...newFiles[fileToProcessIndex],
                        status: 'published',
                        lastUpdated: new Date().toISOString()
                    };
                }
            }
        } else {
            // Add a new file
            const newFile: FileStatus = {
              id: crypto.randomUUID(),
              name: `New_Ingest_${Math.floor(Math.random() * 1000)}.mxf`,
              status: 'processing',
              source: 'Main Import',
              lastUpdated: new Date().toISOString(),
            };
            newFiles.push(newFile);
        }

        return newFiles.sort((a,b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
      });
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const handleClearAll = () => {
    setFiles([]);
    toast({
      title: "Database Cleared",
      description: "All file statuses have been removed.",
    });
  };

  const filteredFiles = useMemo(() => {
    return files
      .filter(file => statusFilter === 'all' || file.status === statusFilter)
      .filter(file => 
        file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.source.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [files, statusFilter, searchTerm]);

  const statusCounts = useMemo(() => {
    return files.reduce((acc, file) => {
      acc[file.status] = (acc[file.status] || 0) + 1;
      return acc;
    }, {} as Record<FileStatus['status'], number>);
  }, [files]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Real-time status of all monitored files.
          </p>
        </div>
        {user?.role === 'admin' && (
          <Button variant="destructive" onClick={handleClearAll}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All
          </Button>
        )}
      </div>

       <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-yellow-500/20 dark:bg-yellow-500/10 border-yellow-500 text-yellow-900 dark:text-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
              <Loader className="h-4 w-4 text-yellow-500 animate-spin" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{statusCounts.processing || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-500/20 dark:bg-green-500/10 border-green-500 text-green-900 dark:text-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{statusCounts.published || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-500/20 dark:bg-red-500/10 border-red-500 text-red-900 dark:text-red-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
                 <div className="text-2xl font-bold">{statusCounts.failed || 0}</div>
            </CardContent>
          </Card>
       </div>

      <Card>
        <CardHeader>
             <CardTitle>File Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by file name or source..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearchTerm('')}>
                   <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <Button variant={statusFilter === 'all' ? 'default' : 'outline'} onClick={() => setStatusFilter('all')}>All</Button>
                <Button variant={statusFilter === 'processing' ? 'secondary' : 'outline'} className={statusFilter === 'processing' ? 'bg-yellow-500/80 text-white' : ''} onClick={() => setStatusFilter('processing')}>Processing</Button>
                <Button variant={statusFilter === 'published' ? 'secondary' : 'outline'} className={statusFilter === 'published' ? 'bg-green-500/80 text-white' : ''} onClick={() => setStatusFilter('published')}>Published</Button>
                <Button variant={statusFilter === 'failed' ? 'destructive' : 'outline'} onClick={() => setStatusFilter('failed')}>Failed</Button>
            </div>
          </div>
          <FileStatusTable files={filteredFiles} />
        </CardContent>
      </Card>

    </motion.div>
  );
}
