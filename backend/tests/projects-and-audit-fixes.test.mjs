import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../lib/db.js';
import { signToken } from '../lib/auth.js';
import { MockAIProvider } from '../lib/ai/provider.js';

// Route handlers
import * as projectsRoute from '../app/api/projects/route.js';
import * as projectDetailRoute from '../app/api/projects/[id]/route.js';
import * as analyzeRoute from '../app/api/projects/[id]/analyze/route.js';
import * as healthRoute from '../app/api/health/route.js';

function createJsonRequest(url, method, token = null, body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const init = { method, headers };
  if (body !== null && body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

test('Stage 7: Projects Transaction & Audit Fixes Test Suite', async (t) => {
  let user1 = null;
  let user2 = null;
  let token1 = null;
  let token2 = null;

  const timestamp = Date.now();

  // Setup isolated test users
  const [u1] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Fixes Test User 1', `fix1_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user1 = { id: u1.insertId, name: 'Fixes Test User 1', email: `fix1_${timestamp}@test.local` };
  token1 = await signToken(user1);

  const [u2] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Fixes Test User 2', `fix2_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user2 = { id: u2.insertId, name: 'Fixes Test User 2', email: `fix2_${timestamp}@test.local` };
  token2 = await signToken(user2);

  // Set AI_PROVIDER to mock for deterministic offline analyze testing
  const originalAiProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'mock';

  t.after(async () => {
    process.env.AI_PROVIDER = originalAiProvider;
    if (user1) {
      await pool.query('DELETE FROM users WHERE id = ?', [user1.id]);
    }
    if (user2) {
      await pool.query('DELETE FROM users WHERE id = ?', [user2.id]);
    }
    await pool.end();
  });

  // =========================================================================
  // 1. POST PROJECT TRANSACTION SUCCESS WITH MULTIPLE EVIDENCES
  // =========================================================================
  let createdProjectId = null;

  await t.test('1. POST project succeeds with multiple evidences in single transaction', async () => {
    const res = await projectsRoute.POST(
      createJsonRequest('http://localhost/api/projects', 'POST', token1, {
        title: 'Project with Multi Evidences',
        description: 'Deskripsi proyek dengan beberapa bukti terlampir.',
        repository_url: 'https://github.com/test/multi',
        live_url: 'https://multi.example.com',
        evidences: [
          {
            title: 'Evidence Repo',
            evidence_type: 'repository',
            url: 'https://github.com/test/multi',
          },
          {
            title: 'Evidence Demo',
            evidence_type: 'demo',
            url: 'https://multi.example.com',
          },
        ],
      })
    );

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data.id);
    assert.equal(body.data.evidences.length, 2);

    createdProjectId = body.data.id;

    // Verify DB
    const [evRows] = await pool.query(
      'SELECT id, title FROM project_evidences WHERE project_id = ? ORDER BY id ASC',
      [createdProjectId]
    );
    assert.equal(evRows.length, 2);
    assert.equal(evRows[0].title, 'Evidence Repo');
    assert.equal(evRows[1].title, 'Evidence Demo');
  });

  // =========================================================================
  // 2. POST PROJECT ROLLBACK IF EVIDENCE INSERT FAILS
  // =========================================================================
  await t.test('2. POST project rolls back completely if evidence insertion fails', async () => {
    const countsBefore = await pool.query('SELECT COUNT(*) as c FROM projects WHERE user_id = ?', [user1.id]);
    const projCountBefore = countsBefore[0][0].c;

    // Intercept pool.getConnection to inject a failure on evidence insert
    const originalGetConn = pool.getConnection.bind(pool);
    pool.getConnection = async () => {
      const conn = await originalGetConn();
      const origQuery = conn.query.bind(conn);
      conn.query = async (sql, params) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO project_evidences') && params && params[1] === 'FAIL_ME') {
          throw new Error('Simulated DB failure during evidence insert');
        }
        return origQuery(sql, params);
      };
      return conn;
    };

    try {
      const res = await projectsRoute.POST(
        createJsonRequest('http://localhost/api/projects', 'POST', token1, {
          title: 'Project to be Rolled Back',
          description: 'Proyek ini seharusnya di-rollback karena bukti gagal.',
          evidences: [
            {
              title: 'FAIL_ME',
              evidence_type: 'document',
              url: 'https://doc.example.com',
            },
          ],
        })
      );

      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.status, 'error');

      // Verify that no orphan project was left in database
      const countsAfter = await pool.query('SELECT COUNT(*) as c FROM projects WHERE user_id = ?', [user1.id]);
      assert.equal(countsAfter[0][0].c, projCountBefore, 'Project row must be rolled back');

      const [orphan] = await pool.query('SELECT id FROM projects WHERE title = ?', ['Project to be Rolled Back']);
      assert.equal(orphan.length, 0, 'Orphan project must not exist');
    } finally {
      pool.getConnection = originalGetConn;
    }
  });

  // =========================================================================
  // 3. PUT PROJECT TRANSACTION SUCCESS REPLACING EVIDENCES
  // =========================================================================
  await t.test('3. PUT project successfully updates project and replaces evidences', async () => {
    const res = await projectDetailRoute.PUT(
      createJsonRequest(`http://localhost/api/projects/${createdProjectId}`, 'PUT', token1, {
        title: 'Updated Project Title',
        evidences: [
          {
            title: 'Brand New Evidence',
            evidence_type: 'certificate',
            url: 'https://cert.example.com/verified',
          },
        ],
      }),
      { params: Promise.resolve({ id: String(createdProjectId) }) }
    );

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.title, 'Updated Project Title');
    assert.equal(body.data.evidences.length, 1);
    assert.equal(body.data.evidences[0].title, 'Brand New Evidence');

    // Verify in DB
    const [dbEv] = await pool.query('SELECT title, evidence_type FROM project_evidences WHERE project_id = ?', [createdProjectId]);
    assert.equal(dbEv.length, 1);
    assert.equal(dbEv[0].title, 'Brand New Evidence');
  });

  // =========================================================================
  // 4. PUT PROJECT ROLLBACK PRESERVES OLD EVIDENCES IF INSERT FAILS
  // =========================================================================
  await t.test('4. PUT project rolls back and preserves old evidences if evidence insert fails', async () => {
    // Intercept pool.getConnection to inject a failure on evidence insert during PUT
    const originalGetConn = pool.getConnection.bind(pool);
    pool.getConnection = async () => {
      const conn = await originalGetConn();
      const origQuery = conn.query.bind(conn);
      conn.query = async (sql, params) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO project_evidences') && params && params[1] === 'BAD_EVIDENCE') {
          throw new Error('Simulated DB failure during PUT evidence replacement');
        }
        return origQuery(sql, params);
      };
      return conn;
    };

    try {
      const res = await projectDetailRoute.PUT(
        createJsonRequest(`http://localhost/api/projects/${createdProjectId}`, 'PUT', token1, {
          title: 'Should Not Update',
          evidences: [
            {
              title: 'BAD_EVIDENCE',
              evidence_type: 'demo',
              url: 'https://bad.example.com',
            },
          ],
        }),
        { params: Promise.resolve({ id: String(createdProjectId) }) }
      );

      assert.equal(res.status, 500);

      // Verify that old evidence ('Brand New Evidence') is STILL INTACT!
      const [dbEv] = await pool.query('SELECT title FROM project_evidences WHERE project_id = ?', [createdProjectId]);
      assert.equal(dbEv.length, 1);
      assert.equal(dbEv[0].title, 'Brand New Evidence', 'Old evidence must be preserved on rollback');

      // Verify project title was not updated
      const [dbProj] = await pool.query('SELECT title FROM projects WHERE id = ?', [createdProjectId]);
      assert.equal(dbProj[0].title, 'Updated Project Title', 'Project title must not change on rollback');
    } finally {
      pool.getConnection = originalGetConn;
    }
  });

  // =========================================================================
  // 5. USER CANNOT UPDATE ANOTHER USER'S PROJECT (OWNERSHIP CHECK)
  // =========================================================================
  await t.test("5. User 2 cannot update User 1's project (404 Not Found)", async () => {
    const res = await projectDetailRoute.PUT(
      createJsonRequest(`http://localhost/api/projects/${createdProjectId}`, 'PUT', token2, {
        title: 'Malicious Hijack Attempt',
      }),
      { params: Promise.resolve({ id: String(createdProjectId) }) }
    );

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.status, 'error');

    // Verify title untouched
    const [dbProj] = await pool.query('SELECT title FROM projects WHERE id = ?', [createdProjectId]);
    assert.equal(dbProj[0].title, 'Updated Project Title');
  });

  // =========================================================================
  // 6. SIMULTANEOUS CONCURRENT ANALYSIS ON SAME PROJECT HANDLED SAFELY
  // =========================================================================
  await t.test('6. Simultaneous concurrent analyze requests on same project: one succeeds, one gets 409', async () => {
    // Fire two concurrent analyze requests for the same project
    const p1 = analyzeRoute.POST(
      createJsonRequest(`http://localhost/api/projects/${createdProjectId}/analyze`, 'POST', token1),
      { params: Promise.resolve({ id: String(createdProjectId) }) }
    );
    const p2 = analyzeRoute.POST(
      createJsonRequest(`http://localhost/api/projects/${createdProjectId}/analyze`, 'POST', token1),
      { params: Promise.resolve({ id: String(createdProjectId) }) }
    );

    const [res1, res2] = await Promise.all([p1, p2]);
    const statuses = [res1.status, res2.status].sort();

    // Exactly one must be 201 Created and the other must be 409 Conflict
    assert.deepEqual(statuses, [201, 409], 'Concurrent analyze requests must yield one 201 and one 409 Conflict');

    const conflictRes = res1.status === 409 ? res1 : res2;
    const conflictBody = await conflictRes.json();
    assert.match(conflictBody.message, /sedang berjalan/i);
  });

  // =========================================================================
  // 7. SIMULTANEOUS ANALYSIS ON DIFFERENT PROJECTS DO NOT BLOCK EACH OTHER
  // =========================================================================
  await t.test('7. Simultaneous analyze requests on different projects do not block each other', async () => {
    // Create a project for User 2
    const [p2Res] = await pool.query(
      `INSERT INTO projects (user_id, title, description) 
       VALUES (?, 'User 2 Project', 'Deskripsi proyek kedua untuk pengujian analisis independen.')`,
      [user2.id]
    );
    const proj2Id = p2Res.insertId;

    // Fire concurrent analyze on createdProjectId (user 1) and proj2Id (user 2)
    const pA = analyzeRoute.POST(
      createJsonRequest(`http://localhost/api/projects/${createdProjectId}/analyze`, 'POST', token1),
      { params: Promise.resolve({ id: String(createdProjectId) }) }
    );
    const pB = analyzeRoute.POST(
      createJsonRequest(`http://localhost/api/projects/${proj2Id}/analyze`, 'POST', token2),
      { params: Promise.resolve({ id: String(proj2Id) }) }
    );

    const [resA, resB] = await Promise.all([pA, pB]);

    // Both should succeed (201 Created) because they use different project lock keys!
    assert.equal(resA.status, 201, 'Project 1 analyze should succeed');
    assert.equal(resB.status, 201, 'Project 2 analyze should succeed concurrently');
  });

  // =========================================================================
  // 8. HEALTH ENDPOINT DOES NOT EXPOSE INTERNAL DATABASE NAME
  // =========================================================================
  await t.test('8. Health endpoint returns healthy without exposing internal database name', async () => {
    const res = await healthRoute.GET();
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.equal(body.service, 'skillproof-backend');
    assert.equal(body.database?.status, 'connected');
    assert.equal(body.database?.name, undefined, 'Internal database name must NOT be exposed');
  });
});

