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
  status: 'processing' | 'failed' | 'published';
  source: string;
  lastUpdated: string;
};

export type MonitoredPath = {
  id: string;
  path: string;
  label: string;
};

export type CleanupSettings = {
  status: {
    value: string;
    unit: 'hours' | 'days';
  };
  files: {
    value: string;
    unit: 'hours' | 'days';
  }
}

export type BrandingSettings = {
  brandName: string;
  logo: string | null;
}

export type Database = {
    users: User[];
    branding: BrandingSettings;
    monitoredPaths: MonitoredPath[];
    monitoredExtensions: string[];
    fileStatuses: FileStatus[];
    cleanupSettings: CleanupSettings;
}
