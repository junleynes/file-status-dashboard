
export type User = {
  id: string;
  username: string;
  name: string;
  email?: string;
  role: 'admin' | 'user';
  password?: string;
  avatar?: string | null;
  twoFactorRequired?: boolean;
  twoFactorSecret?: string | null;
};

export type FileStatus = {
  id: string;
  name: string;
  status: 'processing' | 'failed' | 'published' | 'timed-out';
  source: string;
  lastUpdated: string;
  remarks?: string;
};

export type MonitoredPath = {
  id: string;
  name: string;
  path: string;
}

export type MonitoredPaths = {
  import: MonitoredPath;
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

export type ProcessingSettings = {
  autoTrimInvalidChars: boolean;
  autoExpandPrefixes: boolean;
}

export type BrandingSettings = {
  brandName: string;
  logo: string | null;
  favicon: string | null;
  footerText: string;
}

export type SmtpSettings = {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    }
}

export type ChartData = {
    date: string;
    count: number;
}

export type Database = {
    users: User[];
    branding: BrandingSettings;
    monitoredPaths: MonitoredPaths;
    monitoredExtensions: string[];
    fileStatuses: FileStatus[];
    cleanupSettings: CleanupSettings;
    processingSettings: ProcessingSettings;
    failureRemark: string;
    smtpSettings: SmtpSettings;
}
