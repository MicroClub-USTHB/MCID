import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: false,
  dts: false,
  // Workspace packages are private, so they ship inside the bundle, together
  // with the CommonJS modules they require: an ESM bundle cannot require() them.
  // The bundled CommonJS modules call require() on Node built-ins (form-schema
  // uses node:vm), which an ESM bundle only has through createRequire.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  noExternal: [/^@mcid\//, /^validator\//],
});
