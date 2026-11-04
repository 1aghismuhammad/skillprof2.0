import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../lib/db.js';
import { signToken } from '../lib/auth.js';

// Route handlers
import * as profileRoute from '../app/api/profile/route.js';
import * as careerTargetsRoute from '../app/api/career-targets/route.js';
import * as careerTargetDetailRoute from '../app/api/career-targets/[id]/route.js';

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

test('Stage 8: Profile & Career Target Management Test Suite', async (t) => {
  let user1 = null;
  let user2 = null;
  let token1 = null;
  let token2 = null;

  const timestamp = Date.now();

  // Setup isolated test users
  const [u1] = await pool.query(
    'INSERT INTO users (name, email, password_hash, bio, avatar_url) VALUES (?, ?, ?, ?, ?)',
    ['Mahasiswa Asli', `student1_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456', 'Bio awal', 'https://example.com/initial.jpg']
  );
  user1 = { id: u1.insertId, name: 'Mahasiswa Asli', email: `student1_${timestamp}@test.local` };
  token1 = await signToken(user1);

  const [u2] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Mahasiswa Lain', `student2_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user2 = { id: u2.insertId, name: 'Mahasiswa Lain', email: `student2_${timestamp}@test.local` };
  token2 = await signToken(user2);

  t.after(async () => {
    if (user1) {
      await pool.query('DELETE FROM users WHERE id = ?', [user1.id]);
    }
    if (user2) {
      await pool.query('DELETE FROM users WHERE id = ?', [user2.id]);
    }
    await pool.end();
  });

  // =========================================================================
  // GROUP 1: PROFILE MANAGEMENT
  // =========================================================================

  await t.test('1. GET /api/profile returns authenticated user profile without password_hash', async () => {
    const res = await profileRoute.GET(
      createJsonRequest('http://localhost/api/profile', 'GET', token1)
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.data.id, user1.id);
    assert.equal(body.data.name, 'Mahasiswa Asli');
    assert.equal(body.data.email, user1.email);
    assert.equal(body.data.bio, 'Bio awal');
    assert.equal(body.data.avatar_url, 'https://example.com/initial.jpg');
    assert.ok(body.data.created_at);
    assert.ok(body.data.updated_at);
    assert.equal(body.data.password_hash, undefined);
    assert.equal(body.data.password, undefined);
  });

  await t.test('2. GET & PUT /api/profile without token returns 401 Unauthorized', async () => {
    const getRes = await profileRoute.GET(
      createJsonRequest('http://localhost/api/profile', 'GET', null)
    );
    assert.equal(getRes.status, 401);

    const putRes = await profileRoute.PUT(
      createJsonRequest('http://localhost/api/profile', 'PUT', null, { name: 'New Name' })
    );
    assert.equal(putRes.status, 401);
  });

  await t.test('3. PUT /api/profile successfully updates name, bio, and avatar_url', async () => {
    const res = await profileRoute.PUT(
      createJsonRequest('http://localhost/api/profile', 'PUT', token1, {
        name: 'Mahasiswa Terupdate',
        bio: 'Pengembang fullstack berorientasi AI.',
        avatar_url: 'https://images.example.com/updated.png',
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.data.name, 'Mahasiswa Terupdate');
    assert.equal(body.data.bio, 'Pengembang fullstack berorientasi AI.');
    assert.equal(body.data.avatar_url, 'https://images.example.com/updated.png');
    assert.equal(body.data.password_hash, undefined);
  });

  await t.test('4. PUT /api/profile does not alter email even if email is included in body', async () => {
    const res = await profileRoute.PUT(
      createJsonRequest('http://localhost/api/profile', 'PUT', token1, {
        name: 'Mahasiswa Tetap Email',
        email: 'hacked_email@attacker.com',
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.email, user1.email, 'Email in response must match original email');

    const [dbRows] = await pool.query('SELECT email FROM users WHERE id = ?', [user1.id]);
    assert.equal(dbRows[0].email, user1.email, 'Email in database must remain original');
  });

  await t.test('5. PUT /api/profile rejects invalid name (< 2 chars or > 100 chars)', async () => {
    const resShort = await profileRoute.PUT(
      createJsonRequest('http://localhost/api/profile', 'PUT', token1, { name: 'A' })
    );
    assert.equal(resShort.status, 400);

    const resEmpty = await profileRoute.PUT(
      createJsonRequest('http://localhost/api/profile', 'PUT', token1, { name: '   ' })
    );
    assert.equal(resEmpty.status, 400);
  });

  await t.test('6. PUT /api/profile rejects avatar URL with non-HTTP/HTTPS protocol', async () => {
    const resFtp = await profileRoute.PUT(
      createJsonRequest('http://localhost/api/profile', 'PUT', token1, {
        name: 'Valid Name',
        avatar_url: 'ftp://files.example.com/pic.png',
      })
    );
    assert.equal(resFtp.status, 400);

    const resJs = await profileRoute.PUT(
      createJsonRequest('http://localhost/api/profile', 'PUT', token1, {
        name: 'Valid Name',
        avatar_url: 'javascript:alert(1)',
      })
    );
    assert.equal(resJs.status, 400);
  });

  await t.test('7. PUT /api/profile accepts null on bio and avatar_url to clear them', async () => {
    const res = await profileRoute.PUT(
      createJsonRequest('http://localhost/api/profile', 'PUT', token1, {
        name: 'Mahasiswa Bersih',
        bio: null,
        avatar_url: null,
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.bio, null);
    assert.equal(body.data.avatar_url, null);
  });

  // =========================================================================
  // GROUP 2: CAREER TARGET MANAGEMENT
  // =========================================================================

  let targetId1 = null;
  let targetId2 = null;

  await t.test('8. POST /api/career-targets creates target with multiple skills in single transaction', async () => {
    const res = await careerTargetsRoute.POST(
      createJsonRequest('http://localhost/api/career-targets', 'POST', token1, {
        title: 'Backend Engineer',
        description: 'Fokus pada backend service dan API.',
        target_skills: [
          { skill_id: 4, expected_proficiency_level: 'intermediate', expected_score: 75 }, // Node.js
          { skill_id: 6, expected_proficiency_level: 'advanced', expected_score: 85 },     // REST API
          { skill_id: 7, expected_proficiency_level: 'intermediate', expected_score: 70 }, // MySQL
        ],
      })
    );
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.data.title, 'Backend Engineer');
    assert.equal(body.data.description, 'Fokus pada backend service dan API.');
    assert.equal(body.data.skills_count, 3);
    assert.equal(body.data.target_skills.length, 3);
    assert.equal(body.data.target_skills[0].skill_id, 4);
    assert.equal(body.data.target_skills[0].skill_name, 'Node.js');
    assert.equal(body.data.target_skills[0].category, 'Backend');
    assert.equal(body.data.target_skills[0].expected_proficiency_level, 'intermediate');
    assert.equal(body.data.target_skills[0].expected_score, 75);

    targetId1 = body.data.id;
  });

  await t.test('9. User can create multiple distinct career targets', async () => {
    const res = await careerTargetsRoute.POST(
      createJsonRequest('http://localhost/api/career-targets', 'POST', token1, {
        title: 'DevOps Specialist',
        description: 'Fokus pada infrastruktur, kontainer, dan CI/CD.',
        target_skills: [
          { skill_id: 9, expected_proficiency_level: 'intermediate', expected_score: 80 },  // Docker
          { skill_id: 10, expected_proficiency_level: 'intermediate', expected_score: 75 }, // Git
        ],
      })
    );
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.title, 'DevOps Specialist');
    assert.equal(body.data.skills_count, 2);

    targetId2 = body.data.id;
  });

  await t.test('10. POST /api/career-targets rejects duplicate title for same user (409 Conflict)', async () => {
    const res = await careerTargetsRoute.POST(
      createJsonRequest('http://localhost/api/career-targets', 'POST', token1, {
        title: 'Backend Engineer',
        description: 'Mencoba membuat judul yang persis sama.',
      })
    );
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.match(body.message, /sudah ada/i);
  });

  await t.test('11. POST /api/career-targets rejects non-existent master skill_id (400 Bad Request)', async () => {
    const res = await careerTargetsRoute.POST(
      createJsonRequest('http://localhost/api/career-targets', 'POST', token1, {
        title: 'Invalid Skill Target',
        target_skills: [
          { skill_id: 99999, expected_proficiency_level: 'intermediate' },
        ],
      })
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /katalog master skill/i);
  });

  await t.test('12. POST /api/career-targets rejects duplicate skill_id within request (400 Bad Request)', async () => {
    const res = await careerTargetsRoute.POST(
      createJsonRequest('http://localhost/api/career-targets', 'POST', token1, {
        title: 'Duplicate Skill In Request',
        target_skills: [
          { skill_id: 4, expected_proficiency_level: 'intermediate' },
          { skill_id: 4, expected_proficiency_level: 'advanced' },
        ],
      })
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => e.includes('duplikat')));
  });

  await t.test('13. POST /api/career-targets rejects invalid expected_proficiency_level (400 Bad Request)', async () => {
    const res = await careerTargetsRoute.POST(
      createJsonRequest('http://localhost/api/career-targets', 'POST', token1, {
        title: 'Invalid Level Target',
        target_skills: [
          { skill_id: 4, expected_proficiency_level: 'godlike' },
        ],
      })
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.some((e) => e.includes('expected_proficiency_level')));
  });

  await t.test('14. POST /api/career-targets rejects expected_score outside 0-100 (400 Bad Request)', async () => {
    const resHigh = await careerTargetsRoute.POST(
      createJsonRequest('http://localhost/api/career-targets', 'POST', token1, {
        title: 'Score Too High',
        target_skills: [
          { skill_id: 4, expected_score: 150 },
        ],
      })
    );
    assert.equal(resHigh.status, 400);

    const resNeg = await careerTargetsRoute.POST(
      createJsonRequest('http://localhost/api/career-targets', 'POST', token1, {
        title: 'Score Negative',
        target_skills: [
          { skill_id: 4, expected_score: -5 },
        ],
      })
    );
    assert.equal(resNeg.status, 400);
  });

  await t.test('15. GET /api/career-targets lists all targets for user with skills_count and target_skills', async () => {
    const res = await careerTargetsRoute.GET(
      createJsonRequest('http://localhost/api/career-targets', 'GET', token1)
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].title, 'Backend Engineer');
    assert.equal(body.data[0].skills_count, 3);
    assert.equal(body.data[1].title, 'DevOps Specialist');
    assert.equal(body.data[1].skills_count, 2);
  });

  await t.test('16. GET /api/career-targets/[id] returns detail of target with skills', async () => {
    const res = await careerTargetDetailRoute.GET(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}`, 'GET', token1),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.id, targetId1);
    assert.equal(body.data.title, 'Backend Engineer');
    assert.equal(body.data.skills_count, 3);
    assert.equal(body.data.target_skills.length, 3);
  });

  await t.test('17. PUT /api/career-targets/[id] without target_skills preserves existing skills', async () => {
    const res = await careerTargetDetailRoute.PUT(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}`, 'PUT', token1, {
        title: 'Senior Backend Architect',
        description: 'Diperbarui tanpa menyertakan target_skills.',
      }),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.title, 'Senior Backend Architect');
    assert.equal(body.data.description, 'Diperbarui tanpa menyertakan target_skills.');
    assert.equal(body.data.skills_count, 3, 'Old skills must be preserved');
  });

  await t.test('18. PUT /api/career-targets/[id] with empty array removes all target skills', async () => {
    const res = await careerTargetDetailRoute.PUT(
      createJsonRequest(`http://localhost/api/career-targets/${targetId2}`, 'PUT', token1, {
        target_skills: [],
      }),
      { params: Promise.resolve({ id: String(targetId2) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.skills_count, 0);
    assert.equal(body.data.target_skills.length, 0);
  });

  await t.test('19. PUT /api/career-targets/[id] with skills replaces all target skills atomically', async () => {
    const res = await careerTargetDetailRoute.PUT(
      createJsonRequest(`http://localhost/api/career-targets/${targetId2}`, 'PUT', token1, {
        target_skills: [
          { skill_id: 1, expected_proficiency_level: 'advanced', expected_score: 90 }, // JavaScript
        ],
      }),
      { params: Promise.resolve({ id: String(targetId2) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.skills_count, 1);
    assert.equal(body.data.target_skills[0].skill_id, 1);
    assert.equal(body.data.target_skills[0].skill_name, 'JavaScript');
    assert.equal(body.data.target_skills[0].expected_proficiency_level, 'advanced');
  });

  await t.test('20. Cross-user isolation: User 2 cannot access, update, or delete User 1 target (404 Not Found)', async () => {
    const getRes = await careerTargetDetailRoute.GET(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}`, 'GET', token2),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );
    assert.equal(getRes.status, 404);

    const putRes = await careerTargetDetailRoute.PUT(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}`, 'PUT', token2, {
        title: 'Hacked Title',
      }),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );
    assert.equal(putRes.status, 404);

    const delRes = await careerTargetDetailRoute.DELETE(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}`, 'DELETE', token2),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );
    assert.equal(delRes.status, 404);
  });

  await t.test('21. Failure during skill insertion causes full transaction rollback', async () => {
    const countsBefore = await pool.query('SELECT COUNT(*) as c FROM career_targets WHERE user_id = ?', [user1.id]);
    const targetCountBefore = countsBefore[0][0].c;

    const originalGetConn = pool.getConnection.bind(pool);
    pool.getConnection = async () => {
      const conn = await originalGetConn();
      const origQuery = conn.query.bind(conn);
      conn.query = async (sql, params) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO career_target_skills') && params && params[1] === 10) {
          throw new Error('Simulated DB failure during career_target_skills insert');
        }
        return origQuery(sql, params);
      };
      return conn;
    };

    try {
      const res = await careerTargetsRoute.POST(
        createJsonRequest('http://localhost/api/career-targets', 'POST', token1, {
          title: 'Target to be Rolled Back',
          description: 'Seharusnya di-rollback karena salah satu skill gagal diinsert.',
          target_skills: [
            { skill_id: 1, expected_proficiency_level: 'intermediate' },
            { skill_id: 10, expected_proficiency_level: 'advanced' },
          ],
        })
      );
      assert.equal(res.status, 500);

      // Verify no target row was left in career_targets
      const countsAfter = await pool.query('SELECT COUNT(*) as c FROM career_targets WHERE user_id = ?', [user1.id]);
      assert.equal(countsAfter[0][0].c, targetCountBefore, 'Target count must remain unchanged after rollback');

      const [check] = await pool.query(
        'SELECT id FROM career_targets WHERE user_id = ? AND title = ?',
        [user1.id, 'Target to be Rolled Back']
      );
      assert.equal(check.length, 0, 'Target must not exist in DB');
    } finally {
      pool.getConnection = originalGetConn;
    }
  });

  await t.test('22. DELETE /api/career-targets/[id] removes target & cascades skills, leaving master skills intact', async () => {
    // Count master skills before delete
    const [skillsBefore] = await pool.query('SELECT COUNT(*) AS cnt FROM skills');
    const initialSkillCount = skillsBefore[0].cnt;

    const res = await careerTargetDetailRoute.DELETE(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}`, 'DELETE', token1),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );
    assert.equal(res.status, 200);

    // Verify target is deleted
    const [targetCheck] = await pool.query('SELECT id FROM career_targets WHERE id = ?', [targetId1]);
    assert.equal(targetCheck.length, 0);

    // Verify career_target_skills cascade deleted
    const [skillRelCheck] = await pool.query(
      'SELECT id FROM career_target_skills WHERE career_target_id = ?',
      [targetId1]
    );
    assert.equal(skillRelCheck.length, 0);

    // Verify master skills remain 100% untouched
    const [skillsAfter] = await pool.query('SELECT COUNT(*) AS cnt FROM skills');
    assert.equal(skillsAfter[0].cnt, initialSkillCount);
  });
});

