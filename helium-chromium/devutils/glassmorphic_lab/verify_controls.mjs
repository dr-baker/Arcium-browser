#!/usr/bin/env node

/**
 * Exercise the interactive material playground without a Chromium build.
 *
 * This intentionally drives the real DOM controls and input events, then
 * compares a deterministic canvas hash before/after each parameter change.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { extname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const outputDir = resolve(here, 'artifacts');
const chromePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const playwrightPath = process.env.PLAYWRIGHT_CORE ||
  '/Users/daniel/.cursor/extensions/snowflake.snowflake-vsc-1.37.0-darwin-arm64/bin/browser_daemon/node_modules/playwright-core';
const require = createRequire(import.meta.url);
const { chromium } = require(playwrightPath);

const changes = {
  opacity: 0,
  blur: 32,
  edge: 80,
  refraction: 20,
  bulge: 0.6,
  tint: '#ff2200',
  tintStrength: 1,
  saturation: 2,
  grain: 0.08,
  specular: 1,
  borderAlpha: 1,
  dispersion: 0.5,
  shapePower: 6,
  cornerRadius: 100,
  lightX: 1,
  lightY: 1,
  lightElevation: 2,
  lightIntensity: 2
};

function contentType(path) {
  switch (extname(path)) {
    case '.html': return 'text/html; charset=utf-8';
    case '.sksl': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function startServer() {
  const server = createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
    const relative = requestPath === '/' ? 'glassmorphic_lab.html' : requestPath.slice(1);
    const filePath = resolve(here, relative);
    if (!filePath.startsWith(`${here}/`) || !existsSync(filePath)) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': 'no-store'
    });
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

function closeServer(server) {
  return new Promise(resolveServer => server.close(resolveServer));
}

function fail(message) {
  throw new Error(message);
}

async function waitUntilReady(page) {
  await page.waitForFunction(() => window.__glassLab && window.__glassLab.ready, null, {
    timeout: 20_000
  });
}

async function main() {
  if (!existsSync(chromePath)) fail(`Chrome executable not found: ${chromePath}`);
  mkdirSync(outputDir, { recursive: true });
  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--disable-background-networking', '--disable-features=Translate']
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  try {
    await page.goto(`${baseUrl}/glassmorphic_lab.html`, { waitUntil: 'networkidle' });
    await waitUntilReady(page);

    const controlKeys = await page.evaluate(() => window.__glassLab.controlKeys);
    const expectedKeys = Object.keys(changes);
    if (JSON.stringify(controlKeys) !== JSON.stringify(expectedKeys)) {
      fail(`control key mismatch: ${JSON.stringify(controlKeys)}`);
    }

    const results = [];
    for (const key of expectedKeys) {
      await page.evaluate(() => window.__glassLab.selectPreset('glassmorphic'));
      const before = await page.evaluate(() => window.__glassLab.interactiveStats());
      await page.evaluate(({ key, value }) => {
        if (!window.__glassLab.setInteractiveParameter(key, value)) {
          throw new Error(`unknown interactive parameter: ${key}`);
        }
      }, { key, value: changes[key] });
      const after = await page.evaluate(() => window.__glassLab.interactiveStats());
      const changed = before.pixelHash !== after.pixelHash;
      if (!changed) {
        fail(`${key} did not change the rendered canvas`);
      }
      results.push({
        key,
        before: before.pixelHash,
        after: after.pixelHash,
        changed,
        meanDelta: after.deltas.meanAbsoluteDelta
      });
    }

    const opacityRegression = await page.evaluate(() =>
      window.__glassLab.opacityRegression('dense', 'glassmorphic', 0.37, 0.5));
    if (!opacityRegression.zeroExact || !opacityRegression.oneExact ||
        opacityRegression.blend.meanByteDelta > 0.25 ||
        opacityRegression.blend.maxByteDelta > 1.5) {
      fail(`opacity endpoint/intermediate regression failed: ${JSON.stringify(opacityRegression)}`);
    }
    await page.evaluate(() => window.__glassLab.selectPreset('glassmorphic'));
    await page.locator('#scene').selectOption('dense');
    await page.evaluate(() => window.__glassLab.setInteractiveParameter('opacity', 0.5));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(outputDir, 'playground--opacity-50.png') });

    await page.locator('button[data-preset="overshifted_lens"]').click();
    const seeded = await page.evaluate(() => ({
      status: document.getElementById('control-status').textContent,
      shapePower: Number(document.querySelector('[data-control="shapePower"]').value),
      custom: window.__glassLab.getInteractiveState().parameters.shapePower,
      active: document.querySelector('[data-preset="overshifted_lens"]').classList.contains('active')
    }));
    if (seeded.status !== 'OverShifted Lens' || seeded.shapePower !== 4.3 ||
        seeded.custom !== 4.3 || !seeded.active) {
      fail(`OverShifted preset did not seed controls: ${JSON.stringify(seeded)}`);
    }

    await page.evaluate(() => window.__glassLab.setInteractiveParameter('shapePower', 6));
    const customState = await page.evaluate(() => ({
      status: document.getElementById('control-status').textContent,
      active: document.querySelector('[data-preset="overshifted_lens"]').classList.contains('active')
    }));
    if (customState.status !== 'Custom' || customState.active) {
      fail(`manual edit did not enter Custom state: ${JSON.stringify(customState)}`);
    }

    await page.locator('#reset-controls').click();
    const resetState = await page.evaluate(() => ({
      status: document.getElementById('control-status').textContent,
      shapePower: Number(document.querySelector('[data-control="shapePower"]').value),
      active: document.querySelector('[data-preset="overshifted_lens"]').classList.contains('active')
    }));
    if (resetState.status !== 'OverShifted Lens' || resetState.shapePower !== 4.3 || !resetState.active) {
      fail(`reset did not restore the selected preset: ${JSON.stringify(resetState)}`);
    }

    await page.locator('#copy-parameters').click();
    const exported = await page.evaluate(() => JSON.parse(document.getElementById('parameter-json').value));
    if (exported.schema !== 1 || exported.preset !== 'overshifted_lens' ||
        exported.parameters.shapePower !== 4.3 || exported.parameters.opacity !== 1) {
      fail(`parameter export was incomplete: ${JSON.stringify(exported)}`);
    }

    await page.evaluate(() => window.__glassLab.setInteractiveParameter('opacity', 0.55));
    await page.evaluate(() => window.__glassLab.setInteractiveParameter('grain', 0.055));
    const shareUrl = page.url();
    if (!shareUrl.includes('params=')) fail(`custom state was not written to the URL: ${shareUrl}`);
    await page.reload({ waitUntil: 'networkidle' });
    await waitUntilReady(page);
    const restored = await page.evaluate(() => ({
      custom: document.getElementById('control-status').textContent,
      grain: Number(document.querySelector('[data-control="grain"]').value),
      opacity: Number(document.querySelector('[data-control="opacity"]').value),
      preset: window.__glassLab.getInteractiveState().preset
    }));
    if (restored.custom !== 'Custom' || restored.grain !== 0.055 ||
        restored.opacity !== 0.55 || restored.preset !== 'overshifted_lens') {
      fail(`URL state did not restore: ${JSON.stringify(restored)}`);
    }

    const migrated = await browser.newPage({
      viewport: { width: 1100, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce'
    });
    try {
      // Keep the old internal query spelling readable for an already-open lab
      // link; the page immediately rewrites it to the canonical spelling.
      await migrated.goto(`${baseUrl}/glassmorphic_lab.html?preset=plasmorphic`, {
        waitUntil: 'networkidle'
      });
      await waitUntilReady(migrated);
      const migratedPreset = await migrated.evaluate(() => window.__glassLab.getInteractiveState().preset);
      if (migratedPreset !== 'glassmorphic') {
        fail(`legacy preset query did not migrate: ${migratedPreset}`);
      }
    } finally {
      await migrated.close();
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(outputDir, 'playground--desktop.png') });

    const mobile = await browser.newPage({
      viewport: { width: 640, height: 960 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce'
    });
    try {
      await mobile.goto(`${baseUrl}/glassmorphic_lab.html?preset=overshifted_lens`, {
        waitUntil: 'networkidle'
      });
      await waitUntilReady(mobile);
      const responsive = await mobile.evaluate(() => {
        const controls = document.querySelector('.controls').getBoundingClientRect();
        return {
          viewport: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          controlsWidth: controls.width,
          controlsHeight: controls.height,
          presetButtons: document.querySelectorAll('.preset-button').length
        };
      });
      if (responsive.scrollWidth > responsive.viewport + 1 || responsive.controlsWidth <= 0 ||
          responsive.controlsHeight <= 0 || responsive.presetButtons !== 5) {
        fail(`mobile playground layout failed: ${JSON.stringify(responsive)}`);
      }
      await mobile.screenshot({ path: join(outputDir, 'playground--mobile.png'), fullPage: true });
    } finally {
      await mobile.close();
    }

    if (pageErrors.length) fail(`page errors: ${pageErrors.join('; ')}`);
    console.log(`interactive controls passed: ${results.length}/${expectedKeys.length}`);
    console.log(`opacity endpoints passed: zero exact, one exact, 0.5 blend within tolerance`);
    console.log(`preset/reset/export/query checks passed`);
    console.log(`responsive layout passed at 640px viewport`);
    console.log(`control evidence: ${join(outputDir, 'playground--desktop.png')}`);
    console.log(`mobile evidence: ${join(outputDir, 'playground--mobile.png')}`);
    console.log(`opacity evidence: ${join(outputDir, 'playground--opacity-50.png')}`);
    for (const result of results) {
      console.log(`  ${result.key.padEnd(16)} changed=${result.changed ? 'yes' : 'NO'} ` +
        `effect-delta=${result.meanDelta.toFixed(6)}`);
    }
  } finally {
    await browser.close();
    await closeServer(server);
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
