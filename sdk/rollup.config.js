import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default [
  // CommonJS and ES Module builds (for Node.js)
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        exports: 'named',
        sourcemap: true
      },
      {
        file: 'dist/index.esm.js',
        format: 'es',
        sourcemap: true
      }
    ],
    plugins: [
      resolve({
        preferBuiltins: false
      }),
      commonjs()
    ],
    external: ['fs', 'path', 'url', 'pdfjs-dist']
  },
  // UMD build (for browsers and CDN)
  {
    input: 'src/browser.js',
    output: [
      {
        file: 'dist/angela-flow-sdk.umd.js',
        format: 'umd',
        name: 'angelaFlowSDK',
        exports: 'named',
        sourcemap: true,
        globals: {
          'fs': 'null',
          'path': 'null',
          'url': 'null',
          'pdfjs-dist': 'null'
        }
      },
      {
        file: 'dist/angela-flow-sdk.umd.min.js',
        format: 'umd',
        name: 'angelaFlowSDK',
        exports: 'named',
        sourcemap: true,
        plugins: [
          terser({
            compress: {
              drop_console: true
            }
          })
        ],
        globals: {
          'fs': 'null',
          'path': 'null',
          'url': 'null',
          'pdfjs-dist': 'null'
        }
      }
    ],
    plugins: [
      resolve({
        preferBuiltins: false,
        browser: true
      }),
      commonjs()
    ],
    external: ['fs', 'path', 'url', 'pdfjs-dist']
  }
]; 
