#!/usr/bin/env node

/**
 * Render deterministic glassmorphic-glass lab frames without a Chromium build.
 *
 * The browser is used only as a WebGL harness. Production shader source lives
 * in glassmorphic.sksl and is adapted by the page into GLSL ES. The
 * runner captures canvas PNGs, compares lightweight pixel statistics against a
 * checked-in baseline, and measures draw+GPU-finish time.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(here, '..', '..');
const outputDir = resolve(here, 'artifacts');
const baselinePath = resolve(here, 'baselines', 'pixel-stats.json');
const htmlPath = resolve(here, 'glassmorphic_lab.html');
const chromePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const playwrightPath = process.env.PLAYWRIGHT_CORE ||
  '/Users/daniel/.cursor/extensions/snowflake.snowflake-vsc-1.37.0-darwin-arm64/bin/browser_daemon/node_modules/playwright-core';
const require = createRequire(import.meta.url);

const { chromium } = require(playwrightPath);

const scenes = ['light', 'dark', 'dense', 'motion'];
const presets = ['basic', 'glassmorphic', 'spectral', 'quiet', 'overshifted_lens'];
const acceptance = {
  minReadableCenterLuma: 0.020,
  maxPanelBlackFraction: 0.020,
  maxPanelChannelSpread: 0.970,
  minEffectEdgeDelta: 0.004,
  minAlpha: 0.980,
  maxCornerDelta: 0.002,
  maxPerDrawP95Ms: 4.0
};
const opacityAcceptance = {
  maxIntermediateMeanByteDelta: 0.25,
  maxIntermediateByteDelta: 1.5
};
const updateBaseline = process.argv.includes('--update-baseline');
const port = Number(process.env.GLASS_LAB_PORT || 0);

function contentType(path) {
  switch (extname(path)) {
    case '.html': return 'text/html; charset=utf-8';
    case '.sksl': return 'text/plain; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
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
    response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolveServer(server));
  });
}

function closeServer(server) {
  return new Promise(resolveServer => server.close(resolveServer));
}

function nearlyEqual(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

function checkRecord(actual, expected) {
  // Browser/GPU implementations can vary by a few quantization steps. These
  // intentionally broad limits detect a broken shader while avoiding a false
  // failure from a different driver.
  const checks = [
    ['meanLuma', 0.045],
    ['lumaStdDev', 0.045],
    ['panelMeanLuma', 0.055],
    ['centerMeanLuma', 0.055],
    ['edgeMeanLuma', 0.07],
    ['panelMaxChannelSpread', 0.08],
    ['blackFraction', 0.012],
    ['panelBlackFraction', 0.012],
    ['minAlpha', 0.002],
    ['maxAlpha', 0.002],
    ['minChannel', 0.03],
    ['maxChannel', 0.03]
  ];
  const failures = [];
  for (const [field, tolerance] of checks) {
    if (!nearlyEqual(actual.effect[field], expected.effect[field], tolerance)) {
      failures.push(`${field}=${actual.effect[field].toFixed(4)} expected ${expected.effect[field].toFixed(4)} ± ${tolerance}`);
    }
  }
  if (actual.effect.panelBlackFraction > acceptance.maxPanelBlackFraction) {
    failures.push(`panelBlackFraction=${actual.effect.panelBlackFraction.toFixed(4)} exceeds ${acceptance.maxPanelBlackFraction.toFixed(4)}`);
  }
  if (actual.effect.panelMaxChannelSpread > acceptance.maxPanelChannelSpread) {
    failures.push(`panelMaxChannelSpread=${actual.effect.panelMaxChannelSpread.toFixed(4)} exceeds ${acceptance.maxPanelChannelSpread.toFixed(4)}`);
  }
  if (actual.effect.maxChannel < 0.10) {
    failures.push(`maxChannel=${actual.effect.maxChannel.toFixed(4)} is too dark to verify output`);
  }
  if (actual.effect.centerMeanLuma < acceptance.minReadableCenterLuma) {
    failures.push(`centerMeanLuma=${actual.effect.centerMeanLuma.toFixed(4)} is below ${acceptance.minReadableCenterLuma.toFixed(4)}`);
  }
  if (actual.effect.minAlpha < acceptance.minAlpha || actual.effect.maxAlpha < acceptance.minAlpha) {
    failures.push(`alpha range=${actual.effect.minAlpha.toFixed(4)}..${actual.effect.maxAlpha.toFixed(4)} is unstable`);
  }
  if (actual.deltas.cornerMeanAbsoluteDelta > acceptance.maxCornerDelta) {
    failures.push(`corner delta=${actual.deltas.cornerMeanAbsoluteDelta.toFixed(4)} exceeds ${acceptance.maxCornerDelta.toFixed(4)}`);
  }
  if (actual.deltas.edgeMeanAbsoluteDelta < acceptance.minEffectEdgeDelta && actual.preset !== 'basic') {
    failures.push(`edge delta=${actual.deltas.edgeMeanAbsoluteDelta.toFixed(4)} is not visibly different`);
  }
  if (actual.timing.p95Ms > acceptance.maxPerDrawP95Ms) {
    failures.push(`per-draw p95=${actual.timing.p95Ms.toFixed(4)}ms exceeds ${acceptance.maxPerDrawP95Ms.toFixed(4)}ms lab budget`);
  }
  return failures;
}

function checkOpacityRecord(actual, expected) {
  const failures = [];
  if (!actual.zeroExact) failures.push('opacity=0 differs from untouched backdrop');
  if (!actual.oneExact) failures.push('opacity=1 differs from preset output');
  if (actual.blend.meanByteDelta > opacityAcceptance.maxIntermediateMeanByteDelta) {
    failures.push(`opacity=${actual.intermediate} mean blend delta=${actual.blend.meanByteDelta.toFixed(4)} exceeds ` +
      `${opacityAcceptance.maxIntermediateMeanByteDelta.toFixed(4)} bytes`);
  }
  if (actual.blend.maxByteDelta > opacityAcceptance.maxIntermediateByteDelta) {
    failures.push(`opacity=${actual.intermediate} max blend delta=${actual.blend.maxByteDelta.toFixed(4)} exceeds ` +
      `${opacityAcceptance.maxIntermediateByteDelta.toFixed(4)} bytes`);
  }
  if (expected) {
    if (!nearlyEqual(actual.blend.meanByteDelta, expected.blend.meanByteDelta, 0.25)) {
      failures.push(`intermediate mean blend delta=${actual.blend.meanByteDelta.toFixed(4)} expected ` +
        `${expected.blend.meanByteDelta.toFixed(4)} ± 0.25`);
    }
    if (!nearlyEqual(actual.blend.maxByteDelta, expected.blend.maxByteDelta, 0.75)) {
      failures.push(`intermediate max blend delta=${actual.blend.maxByteDelta.toFixed(4)} expected ` +
        `${expected.blend.maxByteDelta.toFixed(4)} ± 0.75`);
    }
  }
  return failures;
}

async function main() {
  if (!existsSync(chromePath)) {
    throw new Error(`Chrome executable not found: ${chromePath}`);
  }
  mkdirSync(outputDir, { recursive: true });
  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--disable-background-networking', '--disable-features=Translate']
  });
  const context = await browser.newContext({
    viewport: { width: 960, height: 680 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const records = [];
  const opacityChecks = [];
  try {
    await page.goto(`${baseUrl}/glassmorphic_lab.html?scene=light&preset=glassmorphic&time=0.37`, {
      waitUntil: 'networkidle'
    });
    await page.waitForFunction(() => window.__glassLab && window.__glassLab.ready, null, {
      timeout: 20_000
    });
    for (const scene of scenes) {
      for (const preset of presets) {
        await page.evaluate(({ scene, preset }) => {
          window.__glassLab.render(scene, preset, 0.37);
        }, { scene, preset });
        const fileName = `${scene}--${preset}.png`;
        const imagePath = join(outputDir, fileName);
        const imageDataUrl = await page.evaluate(() =>
          document.getElementById('glass-canvas').toDataURL('image/png'));
        writeFileSync(imagePath,
          Buffer.from(imageDataUrl.slice('data:image/png;base64,'.length), 'base64'));
        const result = await page.evaluate(() => window.__glassLab.stats());
        const timing = await page.evaluate(({ scene, preset }) =>
          window.__glassLab.measure(scene, preset, 40), { scene, preset });
      records.push({ ...result, timing, image: fileName });
        console.log(`${scene.padEnd(6)} ${preset.padEnd(11)} ` +
          `mean=${result.effect.meanLuma.toFixed(3)} ` +
          `edge=${result.deltas.edgeMeanAbsoluteDelta.toFixed(3)} ` +
          `batch-p95=${timing.batchP95Ms.toFixed(3)}ms ` +
          `per-draw=${timing.p95Ms.toFixed(5)}ms`);
      }
    }
    for (const scene of scenes) {
      for (const preset of presets) {
        const check = await page.evaluate(({ scene, preset }) =>
          window.__glassLab.opacityRegression(scene, preset, 0.37, 0.5), { scene, preset });
        opacityChecks.push(check);
        console.log(`${scene.padEnd(6)} ${preset.padEnd(11)} ` +
          `opacity0=${check.zeroExact ? 'exact' : 'FAIL'} ` +
          `opacity1=${check.oneExact ? 'exact' : 'FAIL'} ` +
          `mid-mean=${check.blend.meanByteDelta.toFixed(3)}B ` +
          `mid-max=${check.blend.maxByteDelta.toFixed(3)}B`);
      }
    }
  } finally {
    await browser.close();
    await closeServer(server);
  }

  const metrics = {
    schema: 2,
    generatedBy: 'devutils/glassmorphic_lab/render_lab.mjs',
    dimensions: { width: 960, height: 680 },
    panel: { x: 120, y: 120, width: 720, height: 440, radius: 30 },
    acceptance,
    opacityAcceptance,
    opacityChecks,
    records
  };
  const metricsPath = join(outputDir, 'metrics.json');
  writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);

  let failures = [];
  if (updateBaseline) {
    const baseline = {
      schema: 2,
      generatedBy: 'devutils/glassmorphic_lab/render_lab.mjs',
      dimensions: metrics.dimensions,
      panel: metrics.panel,
      acceptance,
      opacityAcceptance,
      opacityChecks: Object.fromEntries(opacityChecks.map(check => [
        `${check.scene}/${check.preset}`, {
          scene: check.scene,
          preset: check.preset,
          intermediate: check.intermediate,
          zeroExact: check.zeroExact,
          oneExact: check.oneExact,
          blend: check.blend
        }
      ])),
      records: Object.fromEntries(records.map(record => [
        `${record.scene}/${record.preset}`, {
          scene: record.scene,
          preset: record.preset,
          panel: record.panel,
          effect: record.effect
        }
      ]))
    };
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`baseline updated: ${baselinePath}`);
  } else {
    if (!existsSync(baselinePath)) {
      throw new Error(`baseline missing: ${baselinePath}; run with --update-baseline once`);
    }
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    for (const record of records) {
      const expected = baseline.records[`${record.scene}/${record.preset}`];
      if (!expected) {
        failures.push(`${record.scene}/${record.preset}: missing baseline record`);
        continue;
      }
      for (const failure of checkRecord(record, expected)) {
        failures.push(`${record.scene}/${record.preset}: ${failure}`);
      }
    }
    if (!baseline.opacityChecks) {
      failures.push('opacity endpoint baseline is missing');
    } else {
      for (const check of opacityChecks) {
        const expected = baseline.opacityChecks[`${check.scene}/${check.preset}`];
        if (!expected) {
          failures.push(`${check.scene}/${check.preset}: missing opacity endpoint baseline record`);
          continue;
        }
        for (const failure of checkOpacityRecord(check, expected)) {
          failures.push(`${check.scene}/${check.preset}: ${failure}`);
        }
      }
    }
    if (failures.length) {
      console.error(`pixel-stat regression failed (${failures.length}):`);
      for (const failure of failures) console.error(`  ${failure}`);
    } else {
      console.log(`pixel-stat regression passed: ${records.length} frames`);
    }
  }
  console.log(`PNG output: ${outputDir}`);
  console.log(`metrics: ${metricsPath}`);
  console.log(`timing: ${(records.map(record => record.timing.batchP95Ms).reduce((a, b) => a + b, 0) / records.length).toFixed(3)}ms average 128-draw batch p95 ` +
    `(${(records.map(record => record.timing.p95Ms).reduce((a, b) => a + b, 0) / records.length).toFixed(5)}ms per draw)`);
  if (failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
