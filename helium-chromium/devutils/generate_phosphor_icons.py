#!/usr/bin/env python3

# Copyright 2026 The Helium Authors
# You can use, redistribute, and/or modify this source code under
# the terms of the GPL-3.0 license that can be found in the LICENSE file.
"""Generate the Space icon catalog from an extracted @phosphor-icons/core package.

Usage:
    npm pack @phosphor-icons/core@2.1.1 && tar xzf phosphor-icons-core-2.1.1.tgz
    generate_phosphor_icons.py package "$SRC/third_party/phosphor-icons"

Writes phosphor_regular_icons.inc (one C++ initializer per icon: name,
search keywords, SVG path data in a 256-unit square) and copies LICENSE.
"""

import json
import re
import shutil
import sys
from pathlib import Path

_ICON = re.compile(r'\{\s*name: "([^"]+)",(.*?)\n  \}', re.S)
_ENUM = re.compile(r'\(\(i\) => \((.*?), i\)\)\((\w) \|\| \{\}\)', re.S)
_ENUM_ENTRY = re.compile(r'i\.(\w+) = "([^"]+)"')
_PATH = re.compile(r'<path d="([^"]+)"')


def _enums(source):
    enums = {}
    for body, name in _ENUM.findall(source):
        enums[name] = dict(_ENUM_ENTRY.findall(body))
    return enums


def _keywords(name, body, enums):
    words = name.split('-')
    tags = re.search(r'tags: \[(.*?)\]', body, re.S)
    if tags:
        words += [t for t in re.findall(r'"([^"]+)"', tags.group(1)) if not t.startswith('*')]
    categories = re.search(r'categories: \[(.*?)\]', body, re.S)
    if categories:
        for enum, key in re.findall(r'(\w)\.(\w+)', categories.group(1)):
            words.append(enums.get(enum, {}).get(key, ''))
    seen = []
    for word in ' '.join(words).lower().split():
        if word not in seen and word != '&':
            seen.append(word)
    return ' '.join(seen)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    package, output = Path(sys.argv[1]), Path(sys.argv[2])
    meta = json.loads((package / 'package.json').read_text(encoding='utf-8'))
    source = (package / 'dist' / 'index.mjs').read_text(encoding='utf-8')
    enums = _enums(source)
    lines = [
        f'// Generated from {meta["name"]} {meta["version"]} (regular weight) by',
        '// helium-chromium/devutils/generate_phosphor_icons.py. Do not edit.',
    ]
    # Sorted by name: the browser looks glyphs up with a binary search.
    for name, body in sorted(_ICON.findall(source)):
        svg = (package / 'assets' / 'regular' / f'{name}.svg').read_text(encoding='utf-8')
        path = ' '.join(_PATH.findall(svg))
        if not path or '"' in path:
            sys.exit(f'unexpected SVG for {name}')
        lines.append(f'{{"{name}", "{_keywords(name, body, enums)}", "{path}"}},')
    output.mkdir(parents=True, exist_ok=True)
    (output / 'phosphor_regular_icons.inc').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    shutil.copyfile(package / 'LICENSE', output / 'LICENSE')
    print(f'wrote {len(lines) - 2} icons to {output}')


if __name__ == '__main__':
    main()
