#!/usr/bin/env node

/** Compile the lab's SkSL against an existing Chromium Skia build, if present. */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const skslPath = resolve(here, 'glassmorphic.sksl');
const chromiumRoot = process.env.ARCIUM_CHROMIUM_SRC || '/Volumes/T9/ArciumBuild/build/src';
const skiaLibDir = process.env.ARCIUM_SKIA_LIB_DIR || join(chromiumRoot, 'out/Default');
const strict = process.argv.includes('--strict');
const required = [
  join(chromiumRoot, 'third_party/skia/include/effects/SkRuntimeEffect.h'),
  join(skiaLibDir, 'libskia.dylib')
];

if (!required.every(existsSync)) {
  const message = `Skia build not available; skipped native SkSL check (looked under ${chromiumRoot})`;
  if (strict) {
    console.error(message);
    process.exitCode = 1;
  } else {
    console.log(message);
  }
} else {
  const sourceText = readFileSync(skslPath, 'utf8');
  const contractValid = /uniform\s+float\s+uOpacity\s*;/.test(sourceText);
  if (!contractValid) {
    console.error('SkSL contract missing required uOpacity uniform');
  }
  const source = sourceText +
    '\nhalf4 main(float2 p) { return applyGlass(p); }\n';
  const program = `#include "third_party/skia/include/effects/SkRuntimeEffect.h"
#include "third_party/skia/include/private/SkLog.h"
#include <iostream>
#include <string>
void SkLog(SkLogPriority, const char[], ...) {}
int main() {
  const std::string source = R"ARCIUM_SKSL(${source})ARCIUM_SKSL";
  auto result = SkRuntimeEffect::MakeForShader(SkString(source.c_str()));
  if (!result.effect) {
    std::cerr << result.errorText.c_str() << "\\n";
    return 1;
  }
  std::cout << "SkRuntimeEffect compile passed\\n";
  return 0;
}
`;
  const temporary = mkdtempSync(join(tmpdir(), 'arcium-glass-sksl-'));
  const executable = join(temporary, 'check');
  const args = [
    '-O2', '-std=c++20', '-stdlib=libc++',
    `-I${chromiumRoot}`,
    `-I${join(chromiumRoot, 'third_party/skia')}`,
    `-I${join(chromiumRoot, 'third_party/skia/include')}`,
    `-L${skiaLibDir}`,
    `-Wl,-rpath,${skiaLibDir}`,
    '-x', 'c++', '-o', executable, '-', '-lskia'
  ];
  const compile = spawnSync('/usr/bin/clang++', args, {
    input: program,
    encoding: 'utf8'
  });
  process.stdout.write(compile.stdout || '');
  process.stderr.write(compile.stderr || '');
  if (compile.status === 0) {
    const run = spawnSync(executable, [], { encoding: 'utf8' });
    process.stdout.write(run.stdout || '');
    process.stderr.write(run.stderr || '');
    process.exitCode = contractValid ? (run.status || 0) : 1;
  } else {
    process.exitCode = compile.status || 1;
  }
  rmSync(temporary, { recursive: true, force: true });
}
