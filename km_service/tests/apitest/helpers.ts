/**
 * Shared helpers for backend API tests (Hono routes)
 *
 * Strategy: use mock.module() to replace heavy dependencies (db, runAgent, etc.)
 * then test Hono routes via app.request() — no HTTP server needed.
 */
import { Hono } from 'hono';

// ── PUT helper ──────────────────────────────────────────────────────────────

/** PUT JSON to a Hono app and return { status, body } */
export async function putJSON(app: Hono, path: string, data: unknown, headers?: Record<string, string>) {
  const res = await app.request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  return { status: res.status, body };
}

// ── Mock DB builder ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/**
 * Create a chainable mock db that returns `rows` for select queries
 * and captures inserts/updates/deletes for verification.
 *
 * Usage:
 *   const { db, inserted, updated } = createMockDb({ rows: [...], countVal: 5 });
 */
export function createMockDb(opts: {
  rows?: Row[];
  countVal?: number;
  returning?: Row[];
} = {}) {
  const { rows = [], countVal = 0, returning = [] } = opts;
  const inserted: Row[] = [];
  const updated: Row[] = [];
  const deleted: string[] = [];

  const chain = (data: Row[] = rows) => ({
    from: () => chain(data),
    where: () => chain(data),
    orderBy: () => chain(data),
    limit: (n: number) => chain(data.slice(0, n)),
    offset: (n: number) => chain(data.slice(n)),
    // drizzle returns a promise-like array — make chain thenable
    then: (resolve: (v: Row[]) => void) => resolve(data),
    [Symbol.iterator]: () => data[Symbol.iterator](),
  });

  const db = {
    select: (fields?: unknown) => {
      if (fields && typeof fields === 'object' && 'count' in (fields as any)) {
        return { from: () => ({ then: (r: (v: Row[]) => void) => r([{ count: countVal }]) }) };
      }
      return chain();
    },
    insert: () => ({
      values: (v: Row | Row[]) => {
        const items = Array.isArray(v) ? v : [v];
        inserted.push(...items);
        return {
          returning: () => ({ then: (r: (v: Row[]) => void) => r(returning.length ? returning : items) }),
          then: (r: (v: void) => void) => r(),
        };
      },
    }),
    update: () => ({
      set: (v: Row) => {
        updated.push(v);
        return {
          where: () => ({ then: (r: (v: void) => void) => r() }),
          then: (r: (v: void) => void) => r(),
        };
      },
    }),
    delete: () => ({
      where: () => {
        deleted.push('deleted');
        return { then: (r: (v: void) => void) => r() };
      },
    }),
    $count: () => countVal,
  };

  return { db, inserted, updated, deleted };
}

// ── Request helpers ─────────────────────────────────────────────────────────

/** POST JSON to a Hono app and return { status, body } */
export async function postJSON(app: Hono, path: string, data: unknown, headers?: Record<string, string>) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  return { status: res.status, body };
}

/** GET from a Hono app and return { status, body } */
export async function getJSON(app: Hono, path: string, headers?: Record<string, string>) {
  const res = await app.request(path, { headers });
  const body = await res.json();
  return { status: res.status, body };
}

/** DELETE from a Hono app and return { status, body } */
export async function deleteJSON(app: Hono, path: string, headers?: Record<string, string>) {
  const res = await app.request(path, { method: 'DELETE', headers });
  const body = await res.json();
  return { status: res.status, body };
}
