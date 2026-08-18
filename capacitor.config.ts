import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const productionOrigin = 'https://el-molino-ops.vercel.app';
const configuredOrigin = process.env.CAPACITOR_SERVER_URL || productionOrigin;
const serverUrl = new URL(configuredOrigin);

if (serverUrl.protocol !== 'https:') {
  throw new Error('CAPACITOR_SERVER_URL must use HTTPS.');
}

const config: CapacitorConfig = {
  appId: 'com.elmolino.ops',
  appName: 'El Molino Ops',
  webDir: 'mobile-shell',
  server: {
    url: serverUrl.origin,
    cleartext: false,
    allowNavigation: [serverUrl.hostname],
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#f5f2ea',
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    backgroundColor: '#f5f2ea',
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 900,
      backgroundColor: '#f5f2eaff',
      showSpinner: false,
    },
    Keyboard: {
      resize: KeyboardResize.Native,
      style: KeyboardStyle.Default,
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#173d2a',
      overlaysWebView: false,
    },
  },
};

export default config;
