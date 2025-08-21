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
import { cn } from "@/lib/utils";
import type { FileStatus } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";

interface FileStatusTableProps {
  files: FileStatus[];
}

export function FileStatusTable({ files }: FileStatusTableProps) {
  const getStatusVariant = (status: FileStatus['status']): 'default' | 'destructive' | 'secondary' => {
    switch (status) {
      case 'imported':
        return 'default'; // Primary color
      case 'failed':
        return 'destructive';
      case 'published':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50%]">File Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Last Updated</TableHead>
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
                  <TableCell className="font-medium">{file.name}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(file.status)} className="capitalize transition-colors duration-500">
                      {file.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDistanceToNow(new Date(file.lastUpdated), { addSuffix: true })}
                  </TableCell>
                </motion.tr>
              ))
            ) : (
                <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center">
                    No files found.
                    </TableCell>
                </TableRow>
            )}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  );
}
