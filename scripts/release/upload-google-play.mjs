import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

const base64url = (value) => Buffer.from(value).toString('base64url');

function createServiceAccountAssertion(serviceAccount) {
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Google Play service account JSON is missing client_email or private_key');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(serviceAccount.private_key).toString('base64url')}`;
}

async function jsonRequest(url, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body,
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 2000) };
    }
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || data?.raw || `${response.status} ${response.statusText}`;
    throw new Error(`Google API request failed (${response.status}): ${message}`);
  }
  return data;
}

async function getAccessToken(serviceAccount) {
  const assertion = createServiceAccountAssertion(serviceAccount);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const response = await jsonRequest(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.access_token) throw new Error('Google OAuth response did not contain access_token');
  return response.access_token;
}

function appendOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  return import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`));
}

function appendSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  return import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`));
}

async function main() {
  const packageName = required('GOOGLE_PLAY_PACKAGE_NAME');
  const aabPath = required('GOOGLE_PLAY_AAB_PATH');
  const expectedBuildNumber = required('EL_MOLINO_BUILD_NUMBER');
  const versionName = required('EL_MOLINO_VERSION_NAME');
  const releaseSha = required('EL_MOLINO_RELEASE_SHA');
  const track = required('EL_MOLINO_GOOGLE_PLAY_TRACK');
  const rawServiceAccount = required('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');

  if (!/^[A-Za-z0-9._-]+$/.test(track)) throw new Error('Google Play track contains unsupported characters');

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  const aab = await readFile(aabPath);
  if (aab.length === 0) throw new Error('Android App Bundle is empty');

  const token = await getAccessToken(serviceAccount);
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`;

  const edit = await jsonRequest(`${base}/edits`, {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!edit.id) throw new Error('Google Play did not return an edit id');

  const uploadUrl = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(edit.id)}/bundles?uploadType=media`;
  const bundle = await jsonRequest(uploadUrl, {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: aab,
  });

  const versionCode = String(bundle.versionCode ?? '');
  if (!versionCode) throw new Error('Google Play upload did not return a versionCode');
  if (versionCode !== expectedBuildNumber) {
    throw new Error(`Uploaded Google Play versionCode ${versionCode} does not match expected build ${expectedBuildNumber}; edit will not be committed`);
  }

  await jsonRequest(`${base}/edits/${encodeURIComponent(edit.id)}/tracks/${encodeURIComponent(track)}`, {
    token,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      track,
      releases: [
        {
          name: `${versionName} (${expectedBuildNumber})`,
          versionCodes: [versionCode],
          status: 'completed',
        },
      ],
    }),
  });

  const committed = await jsonRequest(`${base}/edits/${encodeURIComponent(edit.id)}:commit`, {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  await Promise.all([
    appendOutput('google_play_version_code', versionCode),
    appendOutput('google_play_edit_id', edit.id),
    appendOutput('google_play_track', track),
    appendSummary([
      'Google Play beta upload committed',
      `- package: \`${packageName}\``,
      `- track: \`${track}\``,
      `- version/build: \`${versionName} (${versionCode})\``,
      `- release SHA: \`${releaseSha}\``,
      `- edit id: \`${committed.id || edit.id}\``,
    ]),
  ]);
}

main().catch((error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});
