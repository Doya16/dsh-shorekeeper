import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve, isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
}

export function verifyFiles(root, files) {
  if (!lstatSync(resolve(root, '.git')).isDirectory()) {
    throw new Error('Publish from a normal Git clone with a .git directory so npm can record gitHead.');
  }
  if (git(root, 'status', '--porcelain', '--untracked-files=normal').length) {
    throw new Error('Commit all changes before publishing; the Git working tree must be clean.');
  }
  const head = git(root, 'rev-parse', 'HEAD').toString().trim();
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  if (pkg.gitHead) throw new Error('Do not hard-code gitHead; let npm derive it from the release commit.');
  for (const hook of ['prepare', 'prepack', 'postpack']) {
    if (pkg.scripts?.[hook]) throw new Error(`Remove ${hook}: package files must not change after source verification.`);
  }
  if (!files.length) throw new Error('npm returned an empty package file list.');
  const differences = [];
  for (const { path: name } of files) {
    const local = resolve(root, name);
    const rel = relative(root, local);
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || name.includes('\\')) {
      throw new Error(`Invalid package path: ${name}`);
    }
    if (!lstatSync(local).isFile()) throw new Error(`Package member must be a regular file: ${name}`);
    let committed;
    try { committed = git(root, 'cat-file', 'blob', `${head}:${name}`); }
    catch { throw new Error(`Package member is absent from the release commit: ${name}`); }
    if (!readFileSync(local).equals(committed)) differences.push(name);
  }
  if (differences.length) {
    throw new Error(`Package bytes differ from Git HEAD (including line endings): ${differences.join(', ')}`);
  }
  return { gitHead: head, files: files.length, version: pkg.version };
}

export function verifyPublish(root, npmCli) {
  if (!npmCli) throw new Error('Run npm run verify:publish or npm publish from the repository root.');
  const output = execFileSync(process.execPath, [npmCli, 'pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  const [pack] = JSON.parse(output);
  const result = verifyFiles(root, pack.files);
  const remote = git(root, 'ls-remote', 'origin', 'refs/heads/main').toString().trim().split(/\s+/)[0];
  if (remote !== result.gitHead) throw new Error('Push the release commit to origin/main before publishing.');
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(verifyPublish(process.cwd(), process.env.npm_execpath)));
  } catch (error) {
    console.error(`Publish blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
