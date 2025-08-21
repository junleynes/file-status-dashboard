export type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
};

export type FileStatus = {
  id: string;
  name: string;
  status: 'transferred' | 'failed' | 'published';
  lastUpdated: string;
};

export type MonitoredPath = {
  id: string;
  path: string;
  label?: string;
};
