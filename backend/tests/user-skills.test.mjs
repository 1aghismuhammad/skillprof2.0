import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../lib/db.js';
import { signToken } from '../lib/auth.js';

// Import route handlers
import * as userSkillsRoute from '../app/api/user-skills/route.js';
import * as userSkillDetailRoute from '../app/api/user-skills/[id]/route.js';
import * as assessmentsRoute from '../app/api/user-skills/assessments/route.js';
import * as assessmentDetailRoute from '../app/api/user-skills/assessments/[id]/route.js';
import * as acceptRoute from '../app/api/user-skills/assessments/[id]/accept/route.js';
import * as rejectRoute from '../app/api/user-skills/assessments/[id]/reject/route.js';

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

test('User Skills & AI Assessment Review Test Suite', async (t) => {
  let user1 = null;
  let user2 = null;
  let token1 = null;
  let token2 = null;

  // 1. Setup isolated test users
  const timestamp = Date.now();
  const [res1] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Test User Alpha', `test_alpha_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user1 = { id: res1.insertId, name: 'Test User Alpha', email: `test_alpha_${timestamp}@test.local` };
  token1 = await signToken(user1);

  const [res2] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Test User Beta', `test_beta_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user2 = { id: res2.insertId, name: 'Test User Beta', email: `test_beta_${timestamp}@test.local` };
  token2 = await signToken(user2);

  t.after(async () => {
    // Teardown: Clean up test users (CASCADE removes their user_skills and user_skill_assessments)
    if (user1) {
      await pool.query('DELETE FROM users WHERE id = ?', [user1.id]);
    }
    if (user2) {
      await pool.query('DELETE FROM users WHERE id = ?', [user2.id]);
    }
    await pool.end();
  });

  // =========================================================================
  // GROUP 1: AUTHENTICATION ENFORCEMENT
  // =========================================================================
  await t.test('Group 1: Authentication enforcement on all endpoints without token', async () => {
    const endpoints = [
      { fn: () => userSkillsRoute.GET(createJsonRequest('http://localhost/api/user-skills', 'GET')) },
      { fn: () => userSkillsRoute.POST(createJsonRequest('http://localhost/api/user-skills', 'POST', null, { skill_id: 1 })) },
      { fn: () => userSkillDetailRoute.GET(createJsonRequest('http://localhost/api/user-skills/1', 'GET'), { params: Promise.resolve({ id: '1' }) }) },
      { fn: () => userSkillDetailRoute.PATCH(createJsonRequest('http://localhost/api/user-skills/1', 'PATCH', null, { score: 80 }), { params: Promise.resolve({ id: '1' }) }) },
      { fn: () => userSkillDetailRoute.DELETE(createJsonRequest('http://localhost/api/user-skills/1', 'DELETE'), { params: Promise.resolve({ id: '1' }) }) },
      { fn: () => assessmentsRoute.GET(createJsonRequest('http://localhost/api/user-skills/assessments', 'GET')) },
      { fn: () => assessmentDetailRoute.GET(createJsonRequest('http://localhost/api/user-skills/assessments/1', 'GET'), { params: Promise.resolve({ id: '1' }) }) },
      { fn: () => acceptRoute.POST(createJsonRequest('http://localhost/api/user-skills/assessments/1/accept', 'POST'), { params: Promise.resolve({ id: '1' }) }) },
      { fn: () => rejectRoute.POST(createJsonRequest('http://localhost/api/user-skills/assessments/1/reject', 'POST'), { params: Promise.resolve({ id: '1' }) }) },
    ];

    for (const ep of endpoints) {
      const res = await ep.fn();
      assert.equal(res.status, 401, 'Endpoint without token must return 401 Unauthorized');
      const body = await res.json();
      assert.equal(body.status, 'error');
    }
  });

  // =========================================================================
  // GROUP 2: MANUAL SKILL INPUT & ATOMICITY
  // =========================================================================
  let createdSkillId = null;

  await t.test('Group 2: Manual skill addition validations', async () => {
    // Missing skill_id
    const res1 = await userSkillsRoute.POST(
      createJsonRequest('http://localhost/api/user-skills', 'POST', token1, {
        proficiency_level: 'intermediate',
        score: 80,
      })
    );
    assert.equal(res1.status, 400);

    // Invalid proficiency level
    const res2 = await userSkillsRoute.POST(
      createJsonRequest('http://localhost/api/user-skills', 'POST', token1, {
        skill_id: 1,
        proficiency_level: 'super-expert',
        score: 80,
      })
    );
    assert.equal(res2.status, 400);

    // Invalid score (< 0 or > 100)
    const res3 = await userSkillsRoute.POST(
      createJsonRequest('http://localhost/api/user-skills', 'POST', token1, {
        skill_id: 1,
        proficiency_level: 'intermediate',
        score: 150,
      })
    );
    assert.equal(res3.status, 400);

    // Non-existent skill_id
    const res4 = await userSkillsRoute.POST(
      createJsonRequest('http://localhost/api/user-skills', 'POST', token1, {
        skill_id: 999999,
        proficiency_level: 'intermediate',
        score: 80,
      })
    );
    assert.equal(res4.status, 404);
  });

  await t.test('Group 2: Manual skill addition atomic success (user_skills active + assessment accepted)', async () => {
    const res = await userSkillsRoute.POST(
      createJsonRequest('http://localhost/api/user-skills', 'POST', token1, {
        skill_id: 1, // JavaScript
        proficiency_level: 'intermediate',
        score: 80,
        notes: 'Dipelajari saat mengerjakan proyek kuliah',
      })
    );
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.data.status, 'active');
    assert.equal(body.data.proficiency_level, 'intermediate');
    assert.equal(body.data.score, 80);
    assert.equal(body.data.assessment.review_status, 'accepted');
    assert.equal(body.data.assessment.source_type, 'manual');

    createdSkillId = body.data.id;

    // Verify in database directly
    const [dbSkill] = await pool.query('SELECT * FROM user_skills WHERE id = ?', [createdSkillId]);
    assert.equal(dbSkill.length, 1);
    assert.equal(dbSkill[0].status, 'active');
    assert.equal(dbSkill[0].proficiency_level, 'intermediate');
    assert.equal(dbSkill[0].score, 80);

    const [dbAssessments] = await pool.query('SELECT * FROM user_skill_assessments WHERE user_skill_id = ?', [createdSkillId]);
    assert.equal(dbAssessments.length, 1);
    assert.equal(dbAssessments[0].review_status, 'accepted');
    assert.equal(dbAssessments[0].source_type, 'manual');
  });

  await t.test('Group 2: Duplicate active skill addition is prevented (409 Conflict)', async () => {
    const res = await userSkillsRoute.POST(
      createJsonRequest('http://localhost/api/user-skills', 'POST', token1, {
        skill_id: 1, // Already added
        proficiency_level: 'advanced',
        score: 90,
      })
    );
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.status, 'error');
    assert.match(body.message, /sudah ada dalam profil aktif/i);
  });

  // =========================================================================
  // GROUP 3: LISTING & DETAIL & CROSS-USER ISOLATION
  // =========================================================================
  await t.test('Group 3: GET /api/user-skills returns user list with filters', async () => {
    const res = await userSkillsRoute.GET(
      createJsonRequest('http://localhost/api/user-skills?status=active', 'GET', token1)
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].skill_name, 'JavaScript');
    assert.equal(body.data[0].status, 'active');

    // User 2 query should be empty
    const res2 = await userSkillsRoute.GET(
      createJsonRequest('http://localhost/api/user-skills', 'GET', token2)
    );
    const body2 = await res2.json();
    assert.equal(body2.data.length, 0);
  });

  await t.test('Group 3: Cross-user access check (User 2 cannot view or mutate User 1 skill)', async () => {
    // User 2 GET detail of User 1's skill -> 404
    const resGet = await userSkillDetailRoute.GET(
      createJsonRequest(`http://localhost/api/user-skills/${createdSkillId}`, 'GET', token2),
      { params: Promise.resolve({ id: String(createdSkillId) }) }
    );
    assert.equal(resGet.status, 404);

    // User 2 PATCH User 1's skill -> 404
    const resPatch = await userSkillDetailRoute.PATCH(
      createJsonRequest(`http://localhost/api/user-skills/${createdSkillId}`, 'PATCH', token2, { score: 95 }),
      { params: Promise.resolve({ id: String(createdSkillId) }) }
    );
    assert.equal(resPatch.status, 404);

    // User 2 DELETE User 1's skill -> 404
    const resDel = await userSkillDetailRoute.DELETE(
      createJsonRequest(`http://localhost/api/user-skills/${createdSkillId}`, 'DELETE', token2),
      { params: Promise.resolve({ id: String(createdSkillId) }) }
    );
    assert.equal(resDel.status, 404);
  });

  // =========================================================================
  // GROUP 4: SKILL CORRECTION (PATCH) & SOFT DELETE (DELETE)
  // =========================================================================
  await t.test('Group 4: PATCH /api/user-skills/[id] updates active skill and records assessment', async () => {
    const res = await userSkillDetailRoute.PATCH(
      createJsonRequest(`http://localhost/api/user-skills/${createdSkillId}`, 'PATCH', token1, {
        proficiency_level: 'advanced',
        score: 92,
        notes: 'Peningkatan setelah sertifikasi JavaScript',
      }),
      { params: Promise.resolve({ id: String(createdSkillId) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.proficiency_level, 'advanced');
    assert.equal(body.data.score, 92);

    // Verify detail endpoint reflects new values and 2 assessments
    const resDetail = await userSkillDetailRoute.GET(
      createJsonRequest(`http://localhost/api/user-skills/${createdSkillId}`, 'GET', token1),
      { params: Promise.resolve({ id: String(createdSkillId) }) }
    );
    const detailBody = await resDetail.json();
    assert.equal(detailBody.data.score, 92);
    assert.equal(detailBody.data.assessments.length, 2);
  });

  await t.test('Group 4: DELETE /api/user-skills/[id] soft deletes with status rejected, keeping assessments', async () => {
    const res = await userSkillDetailRoute.DELETE(
      createJsonRequest(`http://localhost/api/user-skills/${createdSkillId}`, 'DELETE', token1),
      { params: Promise.resolve({ id: String(createdSkillId) }) }
    );
    assert.equal(res.status, 200);

    // DB verification: user_skills.status is 'rejected'
    const [dbSkill] = await pool.query('SELECT status FROM user_skills WHERE id = ?', [createdSkillId]);
    assert.equal(dbSkill[0].status, 'rejected');

    // DB verification: assessment history is PRESERVED (2 assessments still exist)
    const [dbAssessments] = await pool.query('SELECT COUNT(*) as c FROM user_skill_assessments WHERE user_skill_id = ?', [createdSkillId]);
    assert.equal(dbAssessments[0].c, 2);

    // Repeated delete fails
    const resRepeat = await userSkillDetailRoute.DELETE(
      createJsonRequest(`http://localhost/api/user-skills/${createdSkillId}`, 'DELETE', token1),
      { params: Promise.resolve({ id: String(createdSkillId) }) }
    );
    assert.equal(resRepeat.status, 400);

    // PATCH on rejected skill fails (Rule 5: PATCH only active skills)
    const resPatchRejected = await userSkillDetailRoute.PATCH(
      createJsonRequest(`http://localhost/api/user-skills/${createdSkillId}`, 'PATCH', token1, { score: 99 }),
      { params: Promise.resolve({ id: String(createdSkillId) }) }
    );
    assert.equal(resPatchRejected.status, 400);
  });

  await t.test('Group 4: Re-activating rejected skill via manual POST activates it with new assessment', async () => {
    const res = await userSkillsRoute.POST(
      createJsonRequest('http://localhost/api/user-skills', 'POST', token1, {
        skill_id: 1, // JavaScript (previously rejected)
        proficiency_level: 'intermediate',
        score: 85,
        notes: 'Mengaktifkan kembali skill JavaScript',
      })
    );
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.id, createdSkillId);
    assert.equal(body.data.status, 'active');
    assert.equal(body.data.score, 85);
  });

  // =========================================================================
  // GROUP 5: ASSESSMENT REVIEW WORKFLOW (ACCEPT, CORRECT, REJECT)
  // =========================================================================
  let aiAssessmentId = null;
  let aiUserSkillId = null;

  await t.test('Group 5: Setup pending AI assessment for review testing', async () => {
    // Skill 2: React
    // Insert user_skills with status needs_review
    const [skRes] = await pool.query(
      `INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) 
       VALUES (?, 2, NULL, NULL, 'needs_review')`,
      [user1.id]
    );
    aiUserSkillId = skRes.insertId;

    // Insert pending assessment
    const [assRes] = await pool.query(
      `INSERT INTO user_skill_assessments 
       (user_skill_id, source_type, analysis_skill_id, proficiency_level, score, notes, review_status) 
       VALUES (?, 'ai', NULL, 'beginner', 60, 'AI menganalisis implementasi React', 'pending')`,
      [aiUserSkillId]
    );
    aiAssessmentId = assRes.insertId;
  });

  await t.test('Group 5: GET /api/user-skills/assessments lists pending assessment with cross-user isolation', async () => {
    // User 1 sees it
    const res1 = await assessmentsRoute.GET(
      createJsonRequest('http://localhost/api/user-skills/assessments?status=pending', 'GET', token1)
    );
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.data.length, 1);
    assert.equal(body1.data[0].id, aiAssessmentId);
    assert.equal(body1.data[0].skill_name, 'React');

    // User 2 sees empty
    const res2 = await assessmentsRoute.GET(
      createJsonRequest('http://localhost/api/user-skills/assessments?status=pending', 'GET', token2)
    );
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.data.length, 0);

    // Cross-user accept/reject attempt returns 404
    const resAcceptOther = await acceptRoute.POST(
      createJsonRequest(`http://localhost/api/user-skills/assessments/${aiAssessmentId}/accept`, 'POST', token2),
      { params: Promise.resolve({ id: String(aiAssessmentId) }) }
    );
    assert.equal(resAcceptOther.status, 404);

    const resRejectOther = await rejectRoute.POST(
      createJsonRequest(`http://localhost/api/user-skills/assessments/${aiAssessmentId}/reject`, 'POST', token2),
      { params: Promise.resolve({ id: String(aiAssessmentId) }) }
    );
    assert.equal(resRejectOther.status, 404);
  });

  await t.test('Group 5: Accept assessment with user correction (intermediate, 78)', async () => {
    const res = await acceptRoute.POST(
      createJsonRequest(`http://localhost/api/user-skills/assessments/${aiAssessmentId}/accept`, 'POST', token1, {
        proficiency_level: 'intermediate',
        score: 78,
        notes: 'Diterima dengan koreksi skor 78',
      }),
      { params: Promise.resolve({ id: String(aiAssessmentId) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.review_status, 'accepted');
    assert.equal(body.data.user_skill_status, 'active');
    assert.equal(body.data.proficiency_level, 'intermediate');
    assert.equal(body.data.score, 78);

    // DB verify
    const [dbSk] = await pool.query('SELECT status, proficiency_level, score FROM user_skills WHERE id = ?', [aiUserSkillId]);
    assert.equal(dbSk[0].status, 'active');
    assert.equal(dbSk[0].proficiency_level, 'intermediate');
    assert.equal(dbSk[0].score, 78);

    // Re-accepting already accepted assessment fails
    const resReAccept = await acceptRoute.POST(
      createJsonRequest(`http://localhost/api/user-skills/assessments/${aiAssessmentId}/accept`, 'POST', token1),
      { params: Promise.resolve({ id: String(aiAssessmentId) }) }
    );
    assert.equal(resReAccept.status, 400);
  });

  await t.test('Group 5: Reject assessment workflow when no accepted assessments exist -> user_skills becomes rejected', async () => {
    // Skill 3: Vue.js (needs_review with 1 pending assessment)
    const [skRes] = await pool.query(
      `INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) 
       VALUES (?, 3, NULL, NULL, 'needs_review')`,
      [user1.id]
    );
    const vueSkillId = skRes.insertId;

    const [assRes] = await pool.query(
      `INSERT INTO user_skill_assessments 
       (user_skill_id, source_type, analysis_skill_id, proficiency_level, score, notes, review_status) 
       VALUES (?, 'ai', NULL, 'beginner', 55, 'Deteksi awal Vue.js', 'pending')`,
      [vueSkillId]
    );
    const vueAssessmentId = assRes.insertId;

    const resReject = await rejectRoute.POST(
      createJsonRequest(`http://localhost/api/user-skills/assessments/${vueAssessmentId}/reject`, 'POST', token1, {
        notes: 'Hanya coba-coba, belum menguasai Vue.js',
      }),
      { params: Promise.resolve({ id: String(vueAssessmentId) }) }
    );
    assert.equal(resReject.status, 200);
    const body = await resReject.json();
    assert.equal(body.data.review_status, 'rejected');
    assert.equal(body.data.user_skill_status, 'rejected');

    // DB verify: user_skills is rejected and has NULL level & score (Rule 7)
    const [dbSk] = await pool.query('SELECT status, proficiency_level, score FROM user_skills WHERE id = ?', [vueSkillId]);
    assert.equal(dbSk[0].status, 'rejected');
    assert.equal(dbSk[0].proficiency_level, null);
    assert.equal(dbSk[0].score, null);
  });

  await t.test('Group 5: Rejecting new AI assessment on an ACTIVE skill keeps skill active', async () => {
    // Skill 1 (JavaScript) is active with score 85
    // Add a new pending AI assessment to skill 1
    const [assRes] = await pool.query(
      `INSERT INTO user_skill_assessments 
       (user_skill_id, source_type, analysis_skill_id, proficiency_level, score, notes, review_status) 
       VALUES (?, 'ai', NULL, 'beginner', 50, 'Saran nilai AI rendah', 'pending')`,
      [createdSkillId]
    );
    const lowAiAssessmentId = assRes.insertId;

    // Reject this low AI assessment
    const resReject = await rejectRoute.POST(
      createJsonRequest(`http://localhost/api/user-skills/assessments/${lowAiAssessmentId}/reject`, 'POST', token1, {
        notes: 'Nilai AI terlalu rendah dan tidak akurat',
      }),
      { params: Promise.resolve({ id: String(lowAiAssessmentId) }) }
    );
    assert.equal(resReject.status, 200);

    // DB verify: user_skills REMAINS active with score 85!
    const [dbSk] = await pool.query('SELECT status, proficiency_level, score FROM user_skills WHERE id = ?', [createdSkillId]);
    assert.equal(dbSk[0].status, 'active');
    assert.equal(dbSk[0].score, 85);
  });

  // =========================================================================
  // GROUP 6: TRANSACTION ROLLBACK VERIFICATION
  // =========================================================================
  await t.test('Group 6: Transaction rollback on failure leaves database consistent', async () => {
    const conn = await pool.getConnection();
    await conn.beginTransaction();

    try {
      // Step 1: Insert user_skills
      const [insertSk] = await conn.query(
        `INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) 
         VALUES (?, 4, 'intermediate', 70, 'active')`,
        [user1.id]
      );
      const tempSkillId = insertSk.insertId;

      // Step 2: Deliberately fail (invalid foreign key / check constraint)
      await conn.query(
        `INSERT INTO user_skill_assessments 
         (user_skill_id, source_type, analysis_skill_id, proficiency_level, score, notes, review_status) 
         VALUES (?, 'manual', 999999, 'intermediate', 200, 'Invalid', 'accepted')`,
        [tempSkillId]
      );

      await conn.commit();
      assert.fail('Should have thrown an error on invalid score/fk constraint');
    } catch (err) {
      await conn.rollback();
    } finally {
      conn.release();
    }

    // Verify rollback: skill 4 was NOT committed to user_skills
    const [checkRows] = await pool.query(
      'SELECT id FROM user_skills WHERE user_id = ? AND skill_id = 4',
      [user1.id]
    );
    assert.equal(checkRows.length, 0, 'Rolled back user_skills must not exist in database');
  });
});
