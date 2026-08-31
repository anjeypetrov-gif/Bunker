import esbuild from 'esbuild-wasm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  console.log('Initializing esbuild-wasm...');
  await esbuild.initialize({});

  console.log('Building Bunker Client bundle...');
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/main.tsx')],
    bundle: true,
    minify: false,
    sourcemap: true,
    outfile: path.join(__dirname, 'dist/bundle.js'),
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.css': 'css',
      '.svg': 'text'
    },
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });
  console.log('Client build successful -> dist/bundle.js');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
