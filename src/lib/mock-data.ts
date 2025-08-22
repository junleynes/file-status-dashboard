import type { FileStatus, MonitoredPath } from '@/types';

export const initialFileStatuses: FileStatus[] = [
  { id: '1', name: 'Project_Alpha_Render.mov', status: 'processing', source: 'Main Import', lastUpdated: new Date(Date.now() - 3600000).toISOString() },
  { id: '2', name: 'Scene_04_Take_2.wav', status: 'published', source: 'Main Import', lastUpdated: new Date(Date.now() - 7200000).toISOString() },
  { id: '3', name: 'Client_Feedback_Round2.pdf', status: 'transferred', source: 'Local Import', lastUpdated: new Date(Date.now() - 120000).toISOString() },
  { id: '4', name: 'Final_Cut_V3.mp4', status: 'failed', source: 'Failed Folder', lastUpdated: new Date(Date.now() - 86400000).toISOString() },
  { id: '5', name: 'Assets_Pack.zip', status: 'published', source: 'Main Import', lastUpdated: new Date(Date.now() - 172800000).toISOString() },
  { id: '6', name: 'Lower_Thirds.ae', status: 'transferred', source: 'Local Import', lastUpdated: new Date(Date.now() - 60000).toISOString() },
  { id: '7', name: 'Color_Grade_LUT.cube', status: 'published', source: 'Main Import', lastUpdated: new Date(Date.now() - 259200000).toISOString() },
];

export const initialMonitoredPaths: MonitoredPath[] = [
    { id: '1', path: '/mnt/network-storage/import', label: 'Main Import' },
    { id: '2', path: '/mnt/network-storage/failed', label: 'Failed Folder' },
    { id: '3', path: 'C:\\Users\\Default\\Documents\\local-import', label: 'Local Import' },
];

export const initialMonitoredExtensions: string[] = ['mov', 'wav', 'pdf', 'mp4', 'zip', 'ae', 'cube', 'mxf'];
