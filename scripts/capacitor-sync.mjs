import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const result = spawnSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

// Capacitor's SPM generator can emit Windows separators when sync runs on
// Windows. Swift package paths are slash-delimited on every build host.
const packagePath = new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url);
try {
  const source = await readFile(packagePath, 'utf8');
  const normalized = source.replaceAll('..\\..\\..\\node_modules\\', '../../../node_modules/');
  if (normalized !== source) await writeFile(packagePath, normalized, 'utf8');
} catch (error) {
  if (!process.argv.slice(2).includes('android')) throw error;
}
