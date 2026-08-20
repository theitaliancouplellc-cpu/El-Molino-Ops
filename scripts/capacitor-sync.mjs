import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const requestedPlatforms = process.argv.slice(2);
const result = spawnSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', ...requestedPlatforms], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

// Capacitor's SPM generator can emit Windows separators when sync runs on
// Windows. Swift package paths are slash-delimited on every build host.
const packagePath = new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url);
try {
  const source = await readFile(packagePath, 'utf8');
  const normalized = source.replaceAll('..\\..\\..\\node_modules\\', '../../../node_modules/');
  if (normalized !== source) await writeFile(packagePath, normalized, 'utf8');
} catch (error) {
  if (!requestedPlatforms.includes('android')) throw error;
}

// Remote notifications are a native capability, not web content. Keep the
// entitlement and Xcode capability declaration attached after every iOS sync.
// Xcode resolves aps-environment from the active provisioning profile when a
// signed device/archive build is produced.
if (!requestedPlatforms.includes('android')) {
  const projectPath = new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url);
  const source = await readFile(projectPath, 'utf8');
  let patched = source;

  if (!patched.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) {
    const buildSettingMarker = '\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;';
    const matches = patched.split(buildSettingMarker).length - 1;
    if (matches !== 2) {
      throw new Error(`Expected two iOS App target build settings, found ${matches}; refusing unsafe project rewrite.`);
    }
    patched = patched.replaceAll(
      buildSettingMarker,
      `${buildSettingMarker}\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;`,
    );
  }

  if (!patched.includes('com.apple.Push = {')) {
    const capabilityMarker = '\t\t\t\t\t\tProvisioningStyle = Automatic;';
    if (!patched.includes(capabilityMarker)) {
      throw new Error('Could not locate iOS target capability marker; refusing unsafe project rewrite.');
    }
    patched = patched.replace(
      capabilityMarker,
      `${capabilityMarker}\n\t\t\t\t\t\tSystemCapabilities = {\n\t\t\t\t\t\t\tcom.apple.Push = {\n\t\t\t\t\t\t\t\tenabled = 1;\n\t\t\t\t\t\t\t};\n\t\t\t\t\t\t};`,
    );
  }

  if (patched !== source) await writeFile(projectPath, patched, 'utf8');

  // WKAppBoundDomains must match the remote HTTPS origin actually embedded by
  // this native build. Keeping a stale domain here can make an otherwise valid
  // signed app unable to navigate to its configured production server.
  const productionOrigin = 'https://el-molino-ops.el-molino-ops-7537172ca8.workers.dev';
  const configuredOrigin = process.env.CAPACITOR_SERVER_URL || productionOrigin;
  const serverUrl = new URL(configuredOrigin);
  if (serverUrl.protocol !== 'https:') {
    throw new Error('CAPACITOR_SERVER_URL must use HTTPS before iOS app-bound domains are updated.');
  }

  const infoPath = new URL('../ios/App/App/Info.plist', import.meta.url);
  const infoSource = await readFile(infoPath, 'utf8');
  const appBoundDomainPattern = /(<key>WKAppBoundDomains<\/key>\s*<array>\s*<string>)[^<]+(<\/string>\s*<\/array>)/;
  if (!appBoundDomainPattern.test(infoSource)) {
    throw new Error('Could not locate WKAppBoundDomains in Info.plist; refusing unsafe plist rewrite.');
  }
  const infoPatched = infoSource.replace(appBoundDomainPattern, `$1${serverUrl.hostname}$2`);
  if (infoPatched !== infoSource) await writeFile(infoPath, infoPatched, 'utf8');
}
