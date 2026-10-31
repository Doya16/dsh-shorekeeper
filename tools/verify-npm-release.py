"""Verify public npm metadata and tarball bytes against the published Git commit.

Run from a clone containing the release commit:
    python tools/verify-npm-release.py 1.2.3
This is read-only: it neither installs the package nor extracts files to disk.
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def verify(version):
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', version):
        raise ValueError('Expected a specific npm version')
    with urllib.request.urlopen(f'https://registry.npmjs.org/dsh-shorekeeper/{version}', timeout=30) as response:
        metadata = json.load(response)
    head = metadata.get('gitHead', '')
    if not re.fullmatch(r'[0-9a-f]{40}', head):
        raise ValueError('Published npm metadata has no valid gitHead')
    url = metadata['dist']['tarball']
    if not url.startswith('https://registry.npmjs.org/dsh-shorekeeper/-/'):
        raise ValueError('Unexpected package download URL')
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read(16 * 1024 * 1024 + 1)
    if len(data) > 16 * 1024 * 1024:
        raise ValueError('Plugin archive exceeds verification size limit')
    integrity = 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode('ascii')
    if metadata['dist']['integrity'] != integrity:
        raise ValueError('npm integrity does not match downloaded archive')
    differences, seen = [], set()
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for member in archive:
            if member.isdir():
                continue
            path = PurePosixPath(member.name)
            if (not member.isfile() or path.parts[0] != 'package' or '..' in path.parts
                    or member.name in seen or member.size > 16 * 1024 * 1024):
                raise ValueError(f'Unexpected package member: {member.name}')
            seen.add(member.name)
            name = str(path.relative_to('package'))
            committed = subprocess.check_output(['git', 'cat-file', 'blob', f'{head}:{name}'], cwd=ROOT)
            actual = archive.extractfile(member).read()
            if actual != committed:
                differences.append(name)
            if name == 'package.json':
                package = json.loads(actual)
                if package['name'] != 'dsh-shorekeeper' or package['version'] != version:
                    raise ValueError('Package identity does not match registry metadata')
    if not seen or 'package/package.json' not in seen:
        raise ValueError('Package has no manifest')
    if differences:
        raise ValueError('Archive bytes differ from gitHead: ' + ', '.join(differences))
    return dict(version=version, gitHead=head, files=len(seen), bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(), exact_git_match=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('version')
    args = parser.parse_args()
    print(json.dumps(verify(args.version), indent=2))
