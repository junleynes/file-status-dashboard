
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  password?: string;
  avatar?: string | null;
};

export type FileStatus = {
  id: string;
  name: string;
  status: 'processing' | 'failed' | 'published' | 'timed-out';
  source: string;
  lastUpdated: string;
};

export type MonitoredPath = {
  id: string;
  name: string;
  type: 'local' | 'network';
  path: string;
  username: string;
  password: string;
}

export type MonitoredPaths = {
  import: MonitoredPath[];
  failed: MonitoredPath;
};


export type CleanupRule = {
  enabled: boolean;
  value: string;
  unit: 'hours' | 'days';
}

export type CleanupSettings = {
  status: CleanupRule;
  files: CleanupRule;
  timeout: CleanupRule;
}

export type BrandingSettings = {
  brandName: string;
  logo: string | null;
}

export type Database = {
    users: User[];
    branding: BrandingSettings;
    monitoredPaths: MonitoredPaths;
    monitoredExtensions: string[];
    fileStatuses: FileStatus[];
    cleanupSettings: CleanupSettings;
}
