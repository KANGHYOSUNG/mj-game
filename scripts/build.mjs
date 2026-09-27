import {mkdir,copyFile} from 'node:fs/promises';
await mkdir(new URL('../public/',import.meta.url),{recursive:true});
await copyFile(new URL('../index.html',import.meta.url),new URL('../public/index.html',import.meta.url));
console.log('Game ready. Vercel will deploy api/ functions alongside public/index.html.');
import {build} from 'esbuild';
await build({entryPoints:[new URL('../client/login.js',import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:new URL('../public/login.js',import.meta.url).pathname,minify:true});
