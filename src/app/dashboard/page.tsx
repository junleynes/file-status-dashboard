"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileStatusTable } from "@/components/file-status-table";
import { useAuth } from "@/hooks/use-auth";
import type { FileStatus } from "@/types";
import { initialFileStatuses } from "@/lib/mock-data";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { packageJson } from "firebase-frameworks";


export default function DashboardPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileStatus[]>(initialFileStatuses);
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
        if (currentFiles.length === 0) return [];
        const newFiles = [...currentFiles];
        const randomIndex = Math.floor(Math.random() * newFiles.length);
        const statuses: FileStatus['status'][] = ['imported', 'failed', 'published'];
        const currentStatus = newFiles[randomIndex].status;
        let nextStatus: FileStatus['status'];
        do {
            nextStatus = statuses[Math.floor(Math.random() * statuses.length)];
        } while (nextStatus === currentStatus)

        newFiles[randomIndex] = {
          ...newFiles[randomIndex],
          status: nextStatus,
          lastUpdated: new Date().toISOString(),
        };
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

      <Card>
        <CardHeader>
             <CardTitle>File Status</CardTitle>
        </CardHeader>
        <CardContent>
            <FileStatusTable files={files} />
        </CardContent>
      </Card>

    </motion.div>
  );
}
