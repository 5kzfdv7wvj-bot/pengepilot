import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dk.pengepilot.app',
  appName: 'PengePilot',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  }
};

export default config;
