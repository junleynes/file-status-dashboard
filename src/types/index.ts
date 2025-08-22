export type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  password?: string;
};

export type FileStatus = {
  id: string;
  name: string;
  status: 'processing' | 'transferred' | 'failed' | 'published';
  source: string;
  lastUpdated: string;
};

export type MonitoredPath = {
  id: string;
  path: string;
  label: string;
};
