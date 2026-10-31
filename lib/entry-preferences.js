import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicJson } from './desktop.js';

// Stored outside the runtime directory so replacing the EXE cannot bring back
// the deployment launcher. Explicitly restoring it overrides auto-hide.
export class EntryPreferences {
  constructor(base) {
    this.file = join(base, 'entry-preferences.json');
    this.pending = readFile(this.file, 'utf8').then(JSON.parse).catch(() => ({})).then(value => (this.value = {
      mode: ['auto', 'shown', 'hidden'].includes(value?.mode) ? value.mode : 'auto',
      deployed: value?.deployed === true,
    }));
  }
  update(change) {
    const next = this.pending.then(async () => {
      const value = { ...this.value, ...change };
      await atomicJson(this.file, value);
      this.value = value;
      return value;
    });
    // Recover the write queue without accepting a failed preference change.
    this.pending = next.catch(() => {});
    return next;
  }
  async status(installed, running) {
    await this.pending;
    let value = this.value;
    if (installed && running && !value.deployed) value = await this.update({ deployed: true });
    return { entryHidden: installed && (value.mode === 'hidden' || (value.mode === 'auto' && value.deployed)) };
  }
  async setHidden(hidden) {
    if (typeof hidden !== 'boolean') throw new Error('入口显示设置无效');
    await this.update({ mode: hidden ? 'hidden' : 'shown' });
  }
}
