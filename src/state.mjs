import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ValidationError } from './spec.mjs';

const DEFAULT_PATH = join(homedir(), '.ai-automation-builder', 'state.sqlite');
const WINDOW_MS = 30 * 60 * 1000;
export const fingerprint = (spec) => createHash('sha256').update(JSON.stringify(spec)).digest('hex');

export class StateStore {
  constructor(env = process.env, now = () => Date.now()) {
    this.now = now;
    const location = env.AAB_STATE_PATH || DEFAULT_PATH;
    if (location !== ':memory:') {
      const absolute = resolve(location);
      mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
      this.db = new DatabaseSync(absolute, { timeout: 5000 });
      try { chmodSync(absolute, 0o600); } catch { /* Filesystem may not support POSIX mode. */ }
    } else this.db = new DatabaseSync(':memory:');
    this.db.exec(`PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS previews (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        spec_json TEXT NOT NULL,
        digest TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        approved_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS deployments (
        request_key TEXT PRIMARY KEY,
        preview_id TEXT NOT NULL,
        digest TEXT NOT NULL,
        provider TEXT NOT NULL,
        state TEXT NOT NULL,
        resource_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_deploy_preview ON deployments(preview_id);
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        resource_key TEXT NOT NULL,
        recorded_at INTEGER NOT NULL
      );`);
  }
  close() { this.db.close(); }
  audit(event, key) {
    this.db.prepare('INSERT INTO audit (event, resource_key, recorded_at) VALUES (?, ?, ?)').run(event, key, this.now());
  }
  createPreview(provider, spec) {
    const id = randomUUID(), digest = fingerprint(spec), created = this.now();
    this.db.prepare(`INSERT INTO previews
      (id, provider, spec_json, digest, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, provider, JSON.stringify(spec), digest, created, created + WINDOW_MS);
    this.audit('preview_created', id);
    return { previewId: id, fingerprint: digest, expiresAt: new Date(created + WINDOW_MS).toISOString() };
  }
  preview(id) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new ValidationError('Invalid preview ID');
    const row = this.db.prepare('SELECT * FROM previews WHERE id = ?').get(id);
    if (!row) throw new ValidationError('Preview not found');
    const spec = JSON.parse(row.spec_json);
    if (fingerprint(spec) !== row.digest) throw new ValidationError('Preview integrity check failed');
    return { ...row, spec };
  }
  approve(id) {
    const preview = this.preview(id);
    if (this.now() >= preview.expires_at) throw new ValidationError('Preview expired; create another preview');
    this.db.prepare('UPDATE previews SET approved_at = ? WHERE id = ?').run(this.now(), id);
    this.audit('preview_approved', id);
    return { previewId: id, fingerprint: preview.digest, approved: true };
  }
  claim(previewId, requestKey) {
    if (typeof requestKey !== 'string' || !/^[A-Za-z0-9._-]{12,128}$/.test(requestKey)) {
      throw new ValidationError('idempotencyKey must be 12-128 safe characters');
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const preview = this.preview(previewId);
      const existing = this.db.prepare('SELECT * FROM deployments WHERE request_key = ?').get(requestKey);
      if (existing) {
        if (existing.preview_id !== previewId || existing.digest !== preview.digest) throw new ValidationError('Idempotency key already belongs to another preview');
        this.db.exec('COMMIT');
        return { claimed: false, existing, preview };
      }
      if (this.now() >= preview.expires_at) throw new ValidationError('Preview has expired');
      if (preview.approved_at === null) throw new ValidationError('Preview requires local human approval: ai-automation-builder approve ' + previewId);
      if (this.db.prepare('SELECT 1 FROM deployments WHERE preview_id = ?').get(previewId)) throw new ValidationError('Preview already claimed with another idempotency key');
      this.db.prepare(`INSERT INTO deployments
        (request_key, preview_id, digest, provider, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'in_progress', ?, ?)`)
        .run(requestKey, previewId, preview.digest, preview.provider, this.now(), this.now());
      this.audit('deployment_claimed', requestKey);
      this.db.exec('COMMIT');
      return { claimed: true, preview };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  finish(requestKey, state, resourceId = null) {
    if (!['created_inactive', 'uncertain'].includes(state)) throw new ValidationError('Invalid deployment state');
    const result = this.db.prepare(`UPDATE deployments SET state = ?, resource_id = ?, updated_at = ?
      WHERE request_key = ? AND state = 'in_progress'`).run(state, resourceId, this.now(), requestKey);
    if (result.changes !== 1) throw new ValidationError('Deployment state transition rejected');
    this.audit('deployment_' + state, requestKey);
  }
  status(requestKey) {
    if (typeof requestKey !== 'string' || !/^[A-Za-z0-9._-]{12,128}$/.test(requestKey)) throw new ValidationError('Invalid idempotency key');
    const row = this.db.prepare('SELECT * FROM deployments WHERE request_key = ?').get(requestKey);
    if (!row) throw new ValidationError('Deployment not found');
    if (row.state === 'in_progress' && this.now() - row.updated_at > 90000) {
      this.db.prepare("UPDATE deployments SET state = 'uncertain', updated_at = ? WHERE request_key = ? AND state = 'in_progress'").run(this.now(), requestKey);
      row.state = 'uncertain';
      this.audit('deployment_stale_uncertain', requestKey);
    }
    return {
      idempotencyKey: row.request_key, provider: row.provider, previewId: row.preview_id,
      fingerprint: row.digest, status: row.state, ...(row.resource_id ? { workflowId: row.resource_id } : {}),
    };
  }
}
