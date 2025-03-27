import { build } from 'bun';

await build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  minify: false,
  sourcemap: 'none',
  target: 'browser',
});

console.log('Bundle complete');
