
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { FileStatus, User } from "@/types";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "./ui/button";
import { RefreshCw, FilePenLine, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


interface FileStatusTableProps {
  files: FileStatus[];
  onRetry: (file: FileStatus) => void;
  onRename: (file: FileStatus) => void;
  onDelete: (file: FileStatus) => void;
  isReadOnly?: boolean;
  userRole?: User['role'];
}

export function FileStatusTable({ files, onRetry, onRename, onDelete, isReadOnly = false, userRole }: FileStatusTableProps) {
  const getStatusClasses = (status: FileStatus['status']): string => {
    switch (status) {
      case 'processing':
        return 'bg-yellow-500/80 border-transparent text-white';
      case 'failed':
        return 'bg-red-500/80 border-transparent text-white';
      case 'published':
        return 'bg-green-500/80 border-transparent text-white';
      case 'timed-out':
        return 'bg-orange-500/80 border-transparent text-white';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const formatLastUpdated = (dateString: string) => {
    try {
      return format(new Date(dateString), "MM/dd/yyyy hh:mm:ss a");
    } catch (e) {
      return "Invalid date";
    }
  };


  return (
    <TooltipProvider>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">File Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="text-right w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {files.length > 0 ? (
                files.map((file) => (
                  <motion.tr
                    key={file.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full"
                  >
                    <TableCell className="font-medium max-w-xs truncate">
                       <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{file.name}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{file.name}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getStatusClasses(file.status)} capitalize transition-colors duration-500`}>
                        {file.status}
                      </Badge>
                    </TableCell>
                     <TableCell className="text-muted-foreground whitespace-normal">
                      {file.remarks}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatLastUpdated(file.lastUpdated)}
                    </TableCell>
                    <TableCell className="text-right">
                      {file.status === 'failed' && (
                        <div className="flex gap-1 justify-end">
                           <Tooltip>
                            <TooltipTrigger asChild>
                               <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onRename(file)} disabled={isReadOnly}>
                                <FilePenLine className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Rename & Retry</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onRetry(file)} disabled={isReadOnly}>
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Retry</p>
                            </TooltipContent>
                          </Tooltip>
                           {userRole === 'admin' && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8 hover:bg-destructive/10" onClick={() => onDelete(file)} disabled={isReadOnly}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                <p>Delete File</p>
                                </TooltipContent>
                            </Tooltip>
                           )}
                        </div>
                      )}
                    </TableCell>
                  </motion.tr>
                ))
              ) : (
                  <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                      No files found for the current filter.
                      </TableCell>
                  </TableRow>
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
