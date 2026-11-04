import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../lib/db.js';
import { signToken } from '../lib/auth.js';
import { executeProjectAnalysis } from '../lib/ai/analyzer.js';
import { MockAIProvider } from '../lib/ai/provider.js';
import * as analyzeRoute from '../app/api/projects/[id]/analyze/route.js';
import * as assessmentsRoute from '../app/api/user-skills/assessments/route.js';
import * as userSkillsRoute from '../app/api/user-skills/route.js';

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

test('Stage 4: AI Assessment Integration Test Suite', async (t) => {
  let userA = null;
  let userB = null;
  let tokenA = null;
  let tokenB = null;
  let projectA = null;
  let projectB = null;

  const timestamp = Date.now();

  // Setup isolated test users and projects
  const [u1] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['AI Test User Alpha', `ai_alpha_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  userA = { id: u1.insertId, name: 'AI Test User Alpha', email: `ai_alpha_${timestamp}@test.local` };
  tokenA = await signToken(userA);

  const [u2] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['AI Test User Beta', `ai_beta_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  userB = { id: u2.insertId, name: 'AI Test User Beta', email: `ai_beta_${timestamp}@test.local` };
  tokenB = await signToken(userB);

  // Setup projects
  const [p1] = await pool.query(
    `INSERT INTO projects (user_id, title, description, repository_url, live_url) 
     VALUES (?, ?, ?, ?, ?)`,
    [
      userA.id,
      'Proyek Alpha Fullstack',
      'Implementasi sistem katalog web menggunakan JavaScript dan MySQL dengan API terstruktur.',
      'https://github.com/test/alpha',
      'https://alpha.example.com',
    ]
  );
  projectA = {
    id: p1.insertId,
    user_id: userA.id,
    title: 'Proyek Alpha Fullstack',
    description: 'Implementasi sistem katalog web menggunakan JavaScript dan MySQL dengan API terstruktur.',
    repository_url: 'https://github.com/test/alpha',
    live_url: 'https://alpha.example.com',
  };

  const [p2] = await pool.query(
    `INSERT INTO projects (user_id, title, description) 
     VALUES (?, ?, ?)`,
    [
      userB.id,
      'Proyek Beta Pengguna Lain',
      'Aplikasi mobile sederhana.',
    ]
  );
  projectB = {
    id: p2.insertId,
    user_id: userB.id,
    title: 'Proyek Beta Pengguna Lain',
    description: 'Aplikasi mobile sederhana.',
  };

  t.after(async () => {
    // Teardown: Clean up test users and projects (CASCADE will clean dependent rows)
    if (userA) {
      await pool.query('DELETE FROM users WHERE id = ?', [userA.id]);
    }
    if (userB) {
      await pool.query('DELETE FROM users WHERE id = ?', [userB.id]);
    }
    await pool.end();
  });

  // =========================================================================
  // TEST 1: NEW SKILLS CREATED WITH needs_review, NULL PROFICIENCY & SCORE
  // =========================================================================
  await t.test('Test 1: AI analysis successfully creates needs_review user_skills and pending assessments', async () => {
    const customMock = new MockAIProvider({
      customResponse: {
        summary: 'Aplikasi manajemen data berbasis web dengan antarmuka dinamis.',
        feedback: 'Tingkatkan pengujian unit dan optimasi indeks database.',
        skills: [
          {
            name: 'JavaScript', // skill_id: 1
            category: 'Frontend',
            proficiency_level: 'intermediate',
            score: 75,
            reasoning: 'Logika frontend dan backend terstruktur rapi dengan JavaScript.',
            evidence: 'Tercantum pada repositori proyek.',
          },
          {
            name: 'React', // skill_id: 2
            category: 'Frontend',
            proficiency_level: 'intermediate',
            score: 70,
            reasoning: 'Komponen modular dibangun dengan React.',
            evidence: 'Tercantum pada dependensi proyek.',
          },
        ],
      },
    });

    const result = await executeProjectAnalysis({
      project: projectA,
      evidences: [],
      customProvider: customMock,
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.skills.length, 2);

    // Verify first skill (JavaScript)
    const jsSkill = result.skills.find((s) => s.skill_id === 1);
    assert.ok(jsSkill);
    assert.equal(jsSkill.user_skill_status, 'needs_review');
    assert.equal(jsSkill.review_status, 'pending');

    // Check user_skills in database
    const [dbUserSkill] = await pool.query(
      'SELECT id, user_id, skill_id, proficiency_level, score, status FROM user_skills WHERE user_id = ? AND skill_id = 1',
      [userA.id]
    );
    assert.equal(dbUserSkill.length, 1);
    assert.equal(dbUserSkill[0].status, 'needs_review');
    assert.equal(dbUserSkill[0].proficiency_level, null, 'New skill proficiency_level must be NULL');
    assert.equal(dbUserSkill[0].score, null, 'New skill score must be NULL');

    // Check user_skill_assessments in database
    const [dbAssessment] = await pool.query(
      'SELECT * FROM user_skill_assessments WHERE id = ?',
      [jsSkill.assessment_id]
    );
    assert.equal(dbAssessment.length, 1);
    assert.equal(dbAssessment[0].source_type, 'ai');
    assert.equal(dbAssessment[0].review_status, 'pending');
    assert.equal(dbAssessment[0].proficiency_level, 'intermediate');
    assert.equal(dbAssessment[0].score, 75);
    assert.equal(dbAssessment[0].notes, 'Logika frontend dan backend terstruktur rapi dengan JavaScript.');
    assert.equal(dbAssessment[0].analysis_skill_id, jsSkill.analysis_skill_id);
  });

  // =========================================================================
  // TEST 2: ALREADY ACTIVE SKILLS ARE NOT OVERWRITTEN BY AI ANALYSIS
  // =========================================================================
  await t.test('Test 2: Already active skill is NOT overwritten by subsequent AI analysis', async () => {
    // 1. Manually set Skill 1 (JavaScript) to active with high score
    await pool.query(
      `UPDATE user_skills 
       SET status = 'active', proficiency_level = 'advanced', score = 95 
       WHERE user_id = ? AND skill_id = 1`,
      [userA.id]
    );

    // Verify it is active with 95
    const [beforeSkill] = await pool.query(
      'SELECT status, proficiency_level, score FROM user_skills WHERE user_id = ? AND skill_id = 1',
      [userA.id]
    );
    assert.equal(beforeSkill[0].status, 'active');
    assert.equal(beforeSkill[0].proficiency_level, 'advanced');
    assert.equal(beforeSkill[0].score, 95);

    // 2. Run new AI analysis with lower score for JavaScript (score: 55, beginner)
    const secondMock = new MockAIProvider({
      customResponse: {
        summary: 'Analisis kedua.',
        feedback: 'Tinjauan ulang.',
        skills: [
          {
            name: 'JavaScript',
            category: 'Frontend',
            proficiency_level: 'beginner',
            score: 55,
            reasoning: 'Bukti terlihat sederhana pada commit terbaru.',
            evidence: 'Deskripsi singkat.',
          },
        ],
      },
    });

    const result = await executeProjectAnalysis({
      project: projectA,
      evidences: [],
      customProvider: secondMock,
    });

    assert.equal(result.skills.length, 1);
    const newAssId = result.skills[0].assessment_id;

    // 3. Verify user_skills active values were NOT overwritten (Rule 3)
    const [afterSkill] = await pool.query(
      'SELECT status, proficiency_level, score FROM user_skills WHERE user_id = ? AND skill_id = 1',
      [userA.id]
    );
    assert.equal(afterSkill[0].status, 'active', 'Status must remain active');
    assert.equal(afterSkill[0].proficiency_level, 'advanced', 'Proficiency level must NOT be overwritten');
    assert.equal(afterSkill[0].score, 95, 'Score must NOT be overwritten');

    // 4. Verify new pending assessment was created for the active skill
    const [newAss] = await pool.query(
      'SELECT score, review_status, proficiency_level FROM user_skill_assessments WHERE id = ?',
      [newAssId]
    );
    assert.equal(newAss[0].score, 55);
    assert.equal(newAss[0].proficiency_level, 'beginner');
    assert.equal(newAss[0].review_status, 'pending');
  });

  // =========================================================================
  // TEST 3: PROJECT OWNERSHIP ISOLATION
  // =========================================================================
  await t.test('Test 3: Project ownership isolation on AI analysis endpoint', async () => {
    // User B tries to analyze User A's project -> 404
    const resForbidden = await analyzeRoute.POST(
      createJsonRequest(`http://localhost/api/projects/${projectA.id}/analyze`, 'POST', tokenB),
      { params: Promise.resolve({ id: String(projectA.id) }) }
    );
    assert.equal(resForbidden.status, 404);
    const body = await resForbidden.json();
    assert.equal(body.status, 'error');

    // User B cannot see User A's pending assessments
    const resAssessments = await assessmentsRoute.GET(
      createJsonRequest('http://localhost/api/user-skills/assessments?status=pending', 'GET', tokenB)
    );
    const assBody = await resAssessments.json();
    assert.equal(assBody.data.length, 0);
  });

  // =========================================================================
  // TEST 4: PREVENT DUPLICATE ASSESSMENTS FOR SAME ANALYSIS SKILL ID
  // =========================================================================
  await t.test('Test 4: analysis_skill_id uniqueness prevents duplicate assessments', async () => {
    // Query an existing analysis_skill_id
    const [aasRows] = await pool.query(
      'SELECT id, analysis_id FROM ai_analysis_skills ORDER BY id DESC LIMIT 1'
    );
    assert.ok(aasRows.length > 0);
    const existingAasId = aasRows[0].id;

    // Check that exactly one assessment references this analysis_skill_id
    const [countRows] = await pool.query(
      'SELECT COUNT(*) as c FROM user_skill_assessments WHERE analysis_skill_id = ?',
      [existingAasId]
    );
    assert.equal(countRows[0].c, 1);

    // Attempting a second insert with the same analysis_skill_id must throw ER_DUP_ENTRY
    await assert.rejects(async () => {
      await pool.query(
        `INSERT INTO user_skill_assessments 
         (user_skill_id, source_type, analysis_skill_id, proficiency_level, score, notes, review_status) 
         VALUES (?, 'ai', ?, 'beginner', 50, 'Duplicate test', 'pending')`,
        [1, existingAasId]
      );
    }, (err) => err.code === 'ER_DUP_ENTRY');
  });

  // =========================================================================
  // TEST 5: TRANSACTION ROLLBACK ON STORAGE FAILURE
  // =========================================================================
  await t.test('Test 5: Transaction rolls back completely if assessment insertion fails', async () => {
    const countsBefore = {};
    for (const tbl of ['ai_analyses', 'ai_analysis_skills', 'user_skills', 'user_skill_assessments']) {
      const [r] = await pool.query(`SELECT COUNT(*) as c FROM ${tbl}`);
      countsBefore[tbl] = r[0].c;
    }

    // Force an invalid project with invalid user_id to trigger FK failure on user_skills
    const brokenProject = {
      id: projectA.id,
      user_id: 9999999, // Non-existent user
      title: projectA.title,
      description: projectA.description,
    };

    const mock = new MockAIProvider({
      customResponse: {
        summary: 'Rollback test summary.',
        feedback: 'Rollback feedback.',
        skills: [
          { name: 'JavaScript', category: 'Frontend', proficiency_level: 'intermediate', score: 70 },
        ],
      },
    });

    await assert.rejects(async () => {
      await executeProjectAnalysis({
        project: brokenProject,
        evidences: [],
        customProvider: mock,
      });
    });

    // Verify complete rollback: zero rows created across all 4 tables!
    for (const tbl of ['ai_analyses', 'ai_analysis_skills', 'user_skills', 'user_skill_assessments']) {
      const [r] = await pool.query(`SELECT COUNT(*) as c FROM ${tbl}`);
      assert.equal(r[0].c, countsBefore[tbl], `Table ${tbl} must not have partial data after rollback`);
    }
  });

  // =========================================================================
  // TEST 6: AI PROVIDER FAILURE LEAVES NO PARTIAL DATA
  // =========================================================================
  await t.test('Test 6: AI provider failure leaves no partial analysis or assessment data', async () => {
    const countsBefore = {};
    for (const tbl of ['ai_analyses', 'ai_analysis_skills', 'user_skills', 'user_skill_assessments']) {
      const [r] = await pool.query(`SELECT COUNT(*) as c FROM ${tbl}`);
      countsBefore[tbl] = r[0].c;
    }

    const failingMock = new MockAIProvider({ shouldFail: true, failureStatus: 500 });

    await assert.rejects(async () => {
      await executeProjectAnalysis({
        project: projectA,
        evidences: [],
        customProvider: failingMock,
      });
    });

    for (const tbl of ['ai_analyses', 'ai_analysis_skills', 'user_skills', 'user_skill_assessments']) {
      const [r] = await pool.query(`SELECT COUNT(*) as c FROM ${tbl}`);
      assert.equal(r[0].c, countsBefore[tbl], `Table ${tbl} must be unchanged on provider failure`);
    }
  });
});

