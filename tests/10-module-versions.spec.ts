import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Every module is served with a one-year immutable cache, so a module is only
 * ever refetched when its ?v= cache-buster changes. Two ways that goes wrong:
 *
 *  - an import with no ?v= at all can never be refreshed
 *  - two importers disagreeing on the version load the module twice, and one
 *    of those copies can be arbitrarily old
 *
 * Either one lets a browser pair a new app.js with a stale dependency, which
 * fails at module-link time and takes the whole app down.
 */
const WEB = path.join(__dirname, '..', 'src', 'web');

function sourceFiles(): string[] {
  const files = fs.readdirSync(WEB).filter(f => f.endsWith('.js')).map(f => path.join(WEB, f));
  const utils = path.join(WEB, 'utils');
  for (const f of fs.readdirSync(utils)) {
    if (f.endsWith('.js')) files.push(path.join(utils, f));
  }
  return files;
}

/** Every relative import across the app, as { importer, specifier } */
function imports() {
  const found: { importer: string; specifier: string }[] = [];
  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, 'utf-8');
    for (const m of src.matchAll(/from\s+'(\.\/[^']+\.js(?:\?v=\d+)?)'/g)) {
      found.push({ importer: path.relative(WEB, file), specifier: m[1] });
    }
  }
  return found;
}

test.describe('Module cache-busters', () => {
  test('every module import carries a version', () => {
    const unversioned = imports().filter(i => !i.specifier.includes('?v='));
    expect(unversioned, `unversioned imports can never be cache-busted: ${JSON.stringify(unversioned)}`)
      .toEqual([]);
  });

  test('all importers agree on a module version', () => {
    const versions = new Map<string, Map<string, string[]>>();

    for (const { importer, specifier } of imports()) {
      const [stem, query] = specifier.split('?');
      const name = path.basename(stem);
      if (!versions.has(name)) versions.set(name, new Map());
      const byVersion = versions.get(name)!;
      if (!byVersion.has(query)) byVersion.set(query, []);
      byVersion.get(query)!.push(importer);
    }

    const conflicts = [...versions.entries()]
      .filter(([, byVersion]) => byVersion.size > 1)
      .map(([name, byVersion]) => `${name}: ${JSON.stringify(Object.fromEntries(byVersion))}`);

    expect(conflicts, `a module loaded at two versions can serve a stale copy:\n${conflicts.join('\n')}`)
      .toEqual([]);
  });

  test('index.html loads app.js with a version', () => {
    const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf-8');
    expect(html).toMatch(/src="app\.js\?v=\d+"/);
  });
});
