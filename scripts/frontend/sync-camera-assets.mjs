/* global process */

import { createWriteStream, cpSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = resolve(__dirname, '..', '..');
const frontendRoot = resolve(workspaceRoot, 'frontend');

const faceApiSource = resolve(frontendRoot, 'node_modules', '@vladmandic', 'face-api', 'model');
const faceApiTarget = resolve(frontendRoot, 'public', 'vendor', 'face-api', 'model');

const mediaPipeWasmSource = resolve(frontendRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const mediaPipeWasmTarget = resolve(frontendRoot, 'public', 'vendor', 'mediapipe', 'wasm');
const mediaPipeModelTarget = resolve(frontendRoot, 'public', 'vendor', 'mediapipe', 'models', 'efficientdet_lite0.tflite');
const mediaPipeModelUrl =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

const ensureDir = (path) => {
  mkdirSync(path, { recursive: true });
};

const copyDir = (source, target) => {
  if (!existsSync(source)) {
    throw new Error(`Required source folder not found: ${source}`);
  }

  ensureDir(dirname(target));
  cpSync(source, target, {
    force: true,
    recursive: true,
  });
};

const downloadFile = async (url, targetPath) => {
  ensureDir(dirname(targetPath));

  const tempPath = `${targetPath}.tmp`;
  await new Promise((resolvePromise, rejectPromise) => {
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        const redirect = response.headers.location;
        if (!redirect) {
          rejectPromise(new Error(`Redirect without location while downloading ${url}`));
          return;
        }
        response.resume();
        downloadFile(redirect, targetPath).then(resolvePromise).catch(rejectPromise);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        rejectPromise(new Error(`Failed to download ${url}. HTTP status: ${response.statusCode}`));
        return;
      }

      const output = createWriteStream(tempPath);
      response.pipe(output);

      output.on('finish', () => {
        output.close();
        renameSync(tempPath, targetPath);
        resolvePromise();
      });

      output.on('error', (error) => {
        response.resume();
        try {
          unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors for temp files.
        }
        rejectPromise(error);
      });
    });

    request.on('error', (error) => {
      rejectPromise(error);
    });
  });
};

const syncAssets = async () => {
  copyDir(faceApiSource, faceApiTarget);
  copyDir(mediaPipeWasmSource, mediaPipeWasmTarget);

  if (!existsSync(mediaPipeModelTarget)) {
    await downloadFile(mediaPipeModelUrl, mediaPipeModelTarget);
  }
};

syncAssets()
  .then(() => {
    process.stdout.write('Camera model assets synchronized successfully.\n');
  })
  .catch((error) => {
    process.stderr.write(`Failed to sync camera assets: ${error.message}\n`);
    process.exitCode = 1;
  });
