// Builds notation-engine (the from-scratch MusicXML engraving engine that
// `?renderer=engine` renders scores with) and vendors its build output into
// `vendor/notation-engine/`, which `package.json` depends on as
// `file:./vendor/notation-engine`.
//
// Why vendored rather than a sibling `file:../../notation-engine` link: the
// engine is not on npm and its `dist/` is gitignored, so CI (and anyone
// cloning only this repo) would have nothing to install. The vendored copy
// is committed instead, and this script is how it gets refreshed.
//
// Usage: `npm run sync:engine` (engine checkout at ../../notation-engine
// relative to Frontend/), or `NOTATION_ENGINE_DIR=/path/to/engine npm run
// sync:engine`. Then `npm install` if the version changed.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = resolve(frontendDir, process.env.NOTATION_ENGINE_DIR ?? '../../notation-engine');
const vendorDir = join(frontendDir, 'vendor', 'notation-engine');

if (!existsSync(join(engineDir, 'package.json'))) {
	console.error(`notation-engine not found at ${engineDir} (set NOTATION_ENGINE_DIR).`);
	process.exit(1);
}

const run = (cmd, args) => execFileSync(cmd, args, { cwd: engineDir, encoding: 'utf8' }).trim();

console.log(`Building notation-engine in ${engineDir}`);
execFileSync('npm', ['run', 'build'], { cwd: engineDir, stdio: 'inherit' });

const enginePkg = JSON.parse(readFileSync(join(engineDir, 'package.json'), 'utf8'));
const distDir = join(engineDir, 'dist');
const sha = run('git', ['rev-parse', '--short', 'HEAD']);
// A build of uncommitted engine changes is not reproducible from the SHA
// alone, so say so in the recorded version.
const dirty = run('git', ['status', '--porcelain', '--untracked-files=no', '--', 'src']) !== '';
const commit = dirty ? `${sha}-dirty` : sha;

// Only what `index.js` (the `.` export) needs. `examples.*` and
// `demo-score.d.ts` back the engine's separate `./examples` export, which
// nothing in `index.js` imports; source maps are not shipped either.
const SKIP = new Set(['examples.js', 'examples.d.ts', 'demo-score.d.ts']);
const keep = (path) => !path.endsWith('.map') && !SKIP.has(path.split('/').pop() ?? '');

rmSync(vendorDir, { recursive: true, force: true });
mkdirSync(vendorDir, { recursive: true });
for (const entry of readdirSync(distDir)) {
	if (!keep(entry)) continue;
	cpSync(join(distDir, entry), join(vendorDir, entry), {
		recursive: true,
		filter: (src) => keep(src)
	});
}

if (existsSync(join(engineDir, 'LICENSE'))) cpSync(join(engineDir, 'LICENSE'), join(vendorDir, 'LICENSE'));

const rootExport = enginePkg.exports?.['.'];
const vendoredPkg = {
	name: 'notation-engine',
	version: enginePkg.version,
	private: true,
	description: `Vendored build of notation-engine at ${commit}. Do not edit: regenerate with \`npm run sync:engine\`.`,
	license: enginePkg.license,
	type: 'module',
	// The build's own entry points sit at this directory's root, not under
	// `dist/`, so strip that prefix from the engine's paths.
	main: stripDist(enginePkg.main),
	types: stripDist(enginePkg.types),
	exports: {
		'.': { types: stripDist(rootExport.types), import: stripDist(rootExport.import) },
		'./package.json': './package.json'
	},
	sideEffects: false,
	notationEngineCommit: commit
};
writeFileSync(join(vendorDir, 'package.json'), `${JSON.stringify(vendoredPkg, null, '\t')}\n`);
writeFileSync(join(vendorDir, 'VERSION'), `${enginePkg.version} ${commit}\n`);

console.log(`Vendored notation-engine ${enginePkg.version} (${commit}) into ${vendorDir}`);

function stripDist(path) {
	return path.replace(/^\.\/dist\//, './');
}
