
"use client";

import { useEffect, useState, useMemo, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FileStatusTable } from "@/components/file-status-table";
import { useAuth } from "@/hooks/use-auth";
import type { FileStatus } from "@/types";
import { Trash2, Search, X, CheckCircle2, AlertTriangle, Loader, Clock, Info, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearAllFileStatuses, retryFile, renameFile, checkWriteAccess, deleteFailedFile } from "@/lib/actions";
import { readDb } from "@/lib/db";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export default function DashboardPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FileStatus['status'] | 'all'>('all');
  const [isPending, startTransition] = useTransition();
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState<FileStatus | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileStatus | null>(null);
  const { toast } = useToast();
  const [canWrite, setCanWrite] = useState(true);

  useEffect(() => {
    const fetchFiles = async () => {
      const db = await readDb();
      setFiles(db.fileStatuses);
    };
    fetchFiles();

    const intervalId = setInterval(fetchFiles, 5000); 

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    async function verifyAccess() {
      const { canWrite } = await checkWriteAccess();
      setCanWrite(canWrite);
    }
    verifyAccess();
  }, []);


  const handleClearAll = () => {
    startTransition(async () => {
      await clearAllFileStatuses();
      setFiles([]);
      toast({
        title: "Database Cleared",
        description: "All file statuses have been removed.",
      });
    });
  };

  const handleRetry = (file: FileStatus) => {
    startTransition(async () => {
      const result = await retryFile(file.name);
      if (result.success) {
        toast({
          title: "File Sent for Retry",
          description: `"${file.name}" has been moved back to the import folder.`,
        });
      } else {
        toast({
          title: "Retry Failed",
          description: result.error,
          variant: "destructive",
        });
      }
    });
  }

  const handleOpenRenameDialog = (file: FileStatus) => {
    setFileToRename(file);
    setNewFileName(file.name);
    setIsRenameDialogOpen(true);
  };
  
  const handleRename = () => {
    if (!fileToRename || !newFileName.trim()) return;

    startTransition(async () => {
      const result = await renameFile(fileToRename.name, newFileName.trim());
      if (result.success) {
        toast({
          title: "File Renamed & Retried",
          description: `"${fileToRename.name}" has been renamed and moved to the import folder.`,
        });
      } else {
        toast({
          title: "Rename Failed",
          description: result.error,
          variant: "destructive",
        });
      }
       setIsRenameDialogOpen(false);
       setFileToRename(null);
       setNewFileName("");
    });
  };

  const handleOpenDeleteDialog = (file: FileStatus) => {
    setFileToDelete(file);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (!fileToDelete) return;

    startTransition(async () => {
      const result = await deleteFailedFile(fileToDelete.name);
      if (result.success) {
        toast({
          title: "File Deleted",
          description: `"${fileToDelete.name}" has been permanently deleted.`,
        });
      } else {
        toast({
          title: "Delete Failed",
          description: result.error,
          variant: "destructive",
        });
      }
      setIsDeleteDialogOpen(false);
      setFileToDelete(null);
    });
  };


  const filteredFiles = useMemo(() => {
    return files
      .filter(file => statusFilter === 'all' || file.status === statusFilter)
      .filter(file => file.name.toLowerCase().includes(searchTerm.toLowerCase()));
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
          <Button variant="destructive" onClick={handleClearAll} disabled={isPending}>
            <Trash2 className="mr-2 h-4 w-4" />
            {isPending ? "Clearing..." : "Clear All"}
          </Button>
        )}
      </div>

       <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
          <Card className="bg-yellow-500/20 dark:bg-yellow-500/10 border-yellow-500 text-yellow-900 dark:text-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 md:p-4">
              <CardTitle className="text-xs font-medium">Processing</CardTitle>
              <Loader className="h-4 w-4 text-yellow-500 animate-spin" />
            </CardHeader>
            <CardContent className="p-2 pt-0 md:p-4 md:pt-0">
                <div className="text-lg md:text-2xl font-bold">{statusCounts.processing || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-500/20 dark:bg-green-500/10 border-green-500 text-green-900 dark:text-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 md:p-4">
              <CardTitle className="text-xs font-medium">Published</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent className="p-2 pt-0 md:p-4 md:pt-0">
                <div className="text-lg md:text-2xl font-bold">{statusCounts.published || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-500/20 dark:bg-red-500/10 border-red-500 text-red-900 dark:text-red-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 md:p-4">
              <CardTitle className="text-xs font-medium">Failed</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent className="p-2 pt-0 md:p-4 md:pt-0">
                 <div className="text-lg md:text-2xl font-bold">{statusCounts.failed || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-orange-500/20 dark:bg-orange-500/10 border-orange-500 text-orange-900 dark:text-orange-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 md:p-4">
              <CardTitle className="text-xs font-medium">Timed-out</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent className="p-2 pt-0 md:p-4 md:pt-0">
                 <div className="text-lg md:text-2xl font-bold">{statusCounts['timed-out'] || 0}</div>
            </CardContent>
          </Card>
       </div>

      <Card>
        <CardHeader>
             <CardTitle>File Status</CardTitle>
        </CardHeader>
        <CardContent>
          {!canWrite && (
            <Alert variant="destructive" className="mb-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                The application does not have write permissions for the monitored folders. The "Retry" and "Rename" actions are disabled. Please grant write access to the application user on the server or contact your system administrator.
              </AlertDescription>
            </Alert>
          )}
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by file name..."
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
                <Button size="sm" variant={statusFilter === 'all' ? 'default' : 'outline'} onClick={() => setStatusFilter('all')}>All</Button>
                <Button size="sm" variant={statusFilter === 'processing' ? 'secondary' : 'outline'} className={statusFilter === 'processing' ? 'bg-yellow-500/80 text-white hover:bg-yellow-500/70' : ''} onClick={() => setStatusFilter('processing')}>Processing</Button>
                <Button size="sm" variant={statusFilter === 'published' ? 'secondary' : 'outline'} className={statusFilter === 'published' ? 'bg-green-500/80 text-white hover:bg-green-500/70' : ''} onClick={() => setStatusFilter('published')}>Published</Button>
                <Button size="sm" variant={statusFilter === 'failed' ? 'destructive' : 'outline'} onClick={() => setStatusFilter('failed')}>Failed</Button>
                <Button size="sm" variant={statusFilter === 'timed-out' ? 'secondary' : 'outline'} className={statusFilter === 'timed-out' ? 'bg-orange-500/80 text-white hover:bg-orange-500/70' : ''} onClick={() => setStatusFilter('timed-out')}>Timed-out</Button>
            </div>
          </div>
          <FileStatusTable
            files={filteredFiles}
            onRetry={handleRetry}
            onRename={handleOpenRenameDialog}
            onDelete={handleOpenDeleteDialog}
            isReadOnly={!canWrite}
            userRole={user?.role}
          />
        </CardContent>
      </Card>
      
       <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename & Retry File</DialogTitle>
            <DialogDescription>
              Enter a new name for the file. This will also move the file to the import folder to be processed again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="new-file-name">New File Name</Label>
            <Input
              id="new-file-name"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="Enter new filename"
              disabled={isPending}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={isPending || !newFileName.trim()}>
              {isPending ? 'Processing...' : 'Rename & Retry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the file <span className="font-bold">"{fileToDelete?.name}"</span> from the rejected folder and remove its status from the dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
              {isPending ? 'Deleting...' : 'Yes, delete file'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </motion.div>
  );
}
