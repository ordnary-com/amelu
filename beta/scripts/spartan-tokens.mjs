// Run after `ng g @spartan-ng/cli:ui <name>` (pnpm spartan:tokens).
//
// spartan's helm components use shadcn's colour names. Two of them mean
// something else in Amelu: `accent` is our brand blue and `muted` our grey
// text colour. In helm they are the light hover/selected background, so the
// generated files are rewritten to use `subtle` (and `foreground` for
// `accent-foreground`). See src/spartan.css for how the rest maps onto
// Amelu's palette.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../src/app/ui/', import.meta.url).pathname;
const colour = '(bg|border|ring|fill|stroke|from|to|via|outline|divide|decoration|caret|shadow)';
const rules = [
  [new RegExp(`\\b${colour}-accent-foreground\\b`, 'g'), '$1-foreground'],
  [/\btext-accent-foreground\b/g, 'text-foreground'],
  [new RegExp(`\\b${colour}-(muted|accent)\\b(?!-)`, 'g'), '$1-subtle'],
];

let changed = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.ts')) {
      const before = readFileSync(path, 'utf8');
      const after = rules.reduce((text, [re, to]) => text.replace(re, to), before);
      if (after !== before) {
        writeFileSync(path, after);
        changed++;
      }
    }
  }
};
walk(root);
console.log(`spartan-tokens: rewrote ${changed} file(s)`);
