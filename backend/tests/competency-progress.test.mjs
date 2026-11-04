import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../lib/db.js';
import { signToken } from '../lib/auth.js';

// Route handlers
import * as summaryRoute from '../app/api/competency-progress/route.js';
import * as skillDetailRoute from '../app/api/competency-progress/skills/[id]/route.js';
import * as targetProgressRoute from '../app/api/competency-progress/career-targets/[id]/route.js';

function createJsonRequest(url, method = 'GET', token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return new Request(url, { method, headers });
}

test('Stage 11A: Competency Progress Test Suite', async (t) => {
  let user1 = null;
  let user2 = null;
  let user3 = null;
  let token1 = null;
  let token2 = null;
  let token3 = null;

  let targetIdWithReqs = null;
  let targetIdEmpty = null;
  let targetIdUser2 = null;

  let user1SkillId1 = null; // JavaScript
  let user1SkillId2 = null; // React
  let user1SkillId4 = null; // Node.js (score null)
  let user1SkillId5 = null; // Next.js (needs_review)
  let user1SkillId6 = null; // REST API (rejected)
  let user2SkillId = null;
  let projectId = null;

  // Cleanup registered immediately to ensure teardown runs even on setup errors
  t.after(async () => {
    if (user1) {
      await pool.query('DELETE FROM projects WHERE user_id = ?', [user1.id]);
      await pool.query('DELETE FROM users WHERE id = ?', [user1.id]);
    }
    if (user2) {
      await pool.query('DELETE FROM users WHERE id = ?', [user2.id]);
    }
    if (user3) {
      await pool.query('DELETE FROM users WHERE id = ?', [user3.id]);
    }
  });

  const timestamp = Date.now();

  // 1. Setup isolated test users
  const [u1] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Progress User 1', `prog1_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user1 = { id: u1.insertId, name: 'Progress User 1', email: `prog1_${timestamp}@test.local` };
  token1 = await signToken(user1);

  const [u2] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Progress User 2', `prog2_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user2 = { id: u2.insertId, name: 'Progress User 2', email: `prog2_${timestamp}@test.local` };
  token2 = await signToken(user2);

  const [u3] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Progress User 3 Empty', `prog3_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user3 = { id: u3.insertId, name: 'Progress User 3 Empty', email: `prog3_${timestamp}@test.local` };
  token3 = await signToken(user3);

  // Setup Skills for User 1:
  // Skill 1 (JavaScript, id=1): active, intermediate, score 80
  const [us1] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 1, 'intermediate', 80, 'active']
  );
  user1SkillId1 = us1.insertId;

  // Assessments for Skill 1:
  // - Assessment 1: Manual, accepted, beginner, 60
  await pool.query(
    `INSERT INTO user_skill_assessments (user_skill_id, source_type, review_status, proficiency_level, score, notes, created_at)
     VALUES (?, 'manual', 'accepted', 'beginner', 60, 'Manual self-assessment awal', '2026-01-01 10:00:00')`,
    [user1SkillId1]
  );

  // - Assessment 2: AI, accepted, intermediate, 80 (linked to project)
  const [proj] = await pool.query(
    'INSERT INTO projects (user_id, title, description) VALUES (?, ?, ?)',
    [user1.id, 'Proyek Audit Kompetensi', 'Deskripsi proyek audit']
  );
  projectId = proj.insertId;

  const [an] = await pool.query(
    `INSERT INTO ai_analyses (project_id, summary, feedback, raw_response, status)
     VALUES (?, 'Ringkasan audit', 'Feedback audit', '{"status":"ok"}', 'completed')`,
    [projectId]
  );
  const analysisId = an.insertId;

  const [ans] = await pool.query(
    `INSERT INTO ai_analysis_skills (analysis_id, skill_id, proficiency_level, score, reasoning)
     VALUES (?, ?, ?, ?, ?)`,
    [analysisId, 1, 'intermediate', 80, 'Terbukti implementasi arsitektur rapi']
  );
  const analysisSkillId = ans.insertId;

  await pool.query(
    `INSERT INTO user_skill_assessments (user_skill_id, analysis_skill_id, source_type, review_status, proficiency_level, score, notes, created_at)
     VALUES (?, ?, 'ai', 'accepted', 'intermediate', 80, 'Divalidasi dari evaluasi AI proyek', '2026-01-02 11:00:00')`,
    [user1SkillId1, analysisSkillId]
  );

  // Skill 2 (React, id=2): active, advanced, score 90
  const [us2] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 2, 'advanced', 90, 'active']
  );
  user1SkillId2 = us2.insertId;

  await pool.query(
    `INSERT INTO user_skill_assessments (user_skill_id, source_type, review_status, proficiency_level, score, notes, created_at)
     VALUES (?, 'manual', 'accepted', 'advanced', 90, 'Pengalaman React production', '2026-01-03 12:00:00')`,
    [user1SkillId2]
  );

  // Skill 4 (Node.js, id=4): active, beginner, score NULL (score NULL test in user_skills)
  const [us4] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 4, 'beginner', null, 'active']
  );
  user1SkillId4 = us4.insertId;

  await pool.query(
    `INSERT INTO user_skill_assessments (user_skill_id, source_type, review_status, proficiency_level, score, notes, created_at)
     VALUES (?, 'manual', 'accepted', 'beginner', 70, 'Dasar Node.js', '2026-01-04 13:00:00')`,
    [user1SkillId4]
  );

  // Skill 5 (Next.js, id=5): needs_review, intermediate, score 75 (NOT ACTIVE)
  const [us5] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 5, 'intermediate', 75, 'needs_review']
  );
  user1SkillId5 = us5.insertId;

  await pool.query(
    `INSERT INTO user_skill_assessments (user_skill_id, source_type, review_status, proficiency_level, score, notes, created_at)
     VALUES (?, 'ai', 'pending', 'intermediate', 75, 'Menunggu persetujuan mahasiswa', '2026-01-05 14:00:00')`,
    [user1SkillId5]
  );

  // Skill 6 (REST API, id=6): rejected (NOT ACTIVE)
  const [us6] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 6, 'beginner', 50, 'rejected']
  );
  user1SkillId6 = us6.insertId;

  await pool.query(
    `INSERT INTO user_skill_assessments (user_skill_id, source_type, review_status, proficiency_level, score, notes, created_at)
     VALUES (?, 'ai', 'rejected', 'beginner', 50, 'Ditolak mahasiswa karena tidak relevan', '2026-01-06 15:00:00')`,
    [user1SkillId6]
  );

  // User 2 Setup: 1 skill & 1 career target
  const [usU2] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user2.id, 3, 'intermediate', 70, 'active']
  );
  user2SkillId = usU2.insertId;

  const [ctU2] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
    [user2.id, 'User 2 Target', 'Target milik user 2']
  );
  targetIdUser2 = ctU2.insertId;

  // Setup Career Targets for User 1:
  // Target 1: Target with requirements
  const [ct1] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
    [user1.id, 'Senior Web Architect', 'Target karier utama']
  );
  targetIdWithReqs = ct1.insertId;

  const targetSkills = [
    { skill_id: 1, level: 'intermediate', score: 75 }, // Skill 1: intermediate 80 >= 75 -> FULFILLED
    { skill_id: 2, level: 'advanced', score: 95 },     // Skill 2: advanced 90 < 95 -> UNDER-QUALIFIED
    { skill_id: 5, level: 'intermediate', score: 70 }, // Skill 5: needs_review -> PENDING_REVIEW
    { skill_id: 7, level: 'intermediate', score: 80 }, // Skill 7 (MySQL): no record -> MISSING
  ];

  for (const ts of targetSkills) {
    await pool.query(
      `INSERT INTO career_target_skills (career_target_id, skill_id, expected_proficiency_level, expected_score)
       VALUES (?, ?, ?, ?)`,
      [targetIdWithReqs, ts.skill_id, ts.level, ts.score]
    );
  }

  // Target 2: Target without requirements (N=0)
  const [ct2] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
    [user1.id, 'Empty Competency Target', 'Target tanpa requirement skill']
  );
  targetIdEmpty = ct2.insertId;

  // =========================================================================
  // TEST GROUP 1: AUTHENTICATION ENFORCEMENT (401)
  // =========================================================================
  await t.test('Test 1: Authentication enforcement on all 3 endpoints returns 401 without token', async () => {
    // 1. GET /api/competency-progress
    const res1 = await summaryRoute.GET(createJsonRequest('http://localhost/api/competency-progress'));
    assert.equal(res1.status, 401);
    const json1 = await res1.json();
    assert.equal(json1.status, 'error');
    assert.match(json1.message, /tidak sah/i);

    // 2. GET /api/competency-progress/skills/[id]
    const res2 = await skillDetailRoute.GET(
      createJsonRequest(`http://localhost/api/competency-progress/skills/${user1SkillId1}`),
      { params: Promise.resolve({ id: String(user1SkillId1) }) }
    );
    assert.equal(res2.status, 401);
    const json2 = await res2.json();
    assert.equal(json2.status, 'error');

    // 3. GET /api/competency-progress/career-targets/[id]
    const res3 = await targetProgressRoute.GET(
      createJsonRequest(`http://localhost/api/competency-progress/career-targets/${targetIdWithReqs}`),
      { params: Promise.resolve({ id: String(targetIdWithReqs) }) }
    );
    assert.equal(res3.status, 401);
    const json3 = await res3.json();
    assert.equal(json3.status, 'error');
  });

  // =========================================================================
  // TEST GROUP 2: INPUT VALIDATION (400)
  // =========================================================================
  await t.test('Test 2: Invalid [id] parameter returns 400 for skill and career-target endpoints', async () => {
    // Non-numeric skill ID
    const resSkillAlpha = await skillDetailRoute.GET(
      createJsonRequest('http://localhost/api/competency-progress/skills/abc', 'GET', token1),
      { params: Promise.resolve({ id: 'abc' }) }
    );
    assert.equal(resSkillAlpha.status, 400);
    const jsonSkillAlpha = await resSkillAlpha.json();
    assert.match(jsonSkillAlpha.message, /tidak valid/i);

    // Negative skill ID
    const resSkillNeg = await skillDetailRoute.GET(
      createJsonRequest('http://localhost/api/competency-progress/skills/-5', 'GET', token1),
      { params: Promise.resolve({ id: '-5' }) }
    );
    assert.equal(resSkillNeg.status, 400);

    // Non-numeric target ID
    const resTargetAlpha = await targetProgressRoute.GET(
      createJsonRequest('http://localhost/api/competency-progress/career-targets/xyz', 'GET', token1),
      { params: Promise.resolve({ id: 'xyz' }) }
    );
    assert.equal(resTargetAlpha.status, 400);
    const jsonTargetAlpha = await resTargetAlpha.json();
    assert.match(jsonTargetAlpha.message, /tidak valid/i);

    // Zero target ID
    const resTargetZero = await targetProgressRoute.GET(
      createJsonRequest('http://localhost/api/competency-progress/career-targets/0', 'GET', token1),
      { params: Promise.resolve({ id: '0' }) }
    );
    assert.equal(resTargetZero.status, 400);
  });

  // =========================================================================
  // TEST GROUP 3: OWNERSHIP ISOLATION AND NOT FOUND (404)
  // =========================================================================
  await t.test('Test 3: Returns 404 for non-existent resource or cross-user access', async () => {
    // Non-existent skill ID
    const resNonExistentSkill = await skillDetailRoute.GET(
      createJsonRequest('http://localhost/api/competency-progress/skills/999999', 'GET', token1),
      { params: Promise.resolve({ id: '999999' }) }
    );
    assert.equal(resNonExistentSkill.status, 404);
    const jsonNonExistentSkill = await resNonExistentSkill.json();
    assert.match(jsonNonExistentSkill.message, /tidak ditemukan/i);

    // User 1 attempting to access User 2's skill
    const resCrossSkill = await skillDetailRoute.GET(
      createJsonRequest(`http://localhost/api/competency-progress/skills/${user2SkillId}`, 'GET', token1),
      { params: Promise.resolve({ id: String(user2SkillId) }) }
    );
    assert.equal(resCrossSkill.status, 404);

    // Non-existent career target ID
    const resNonExistentTarget = await targetProgressRoute.GET(
      createJsonRequest('http://localhost/api/competency-progress/career-targets/999999', 'GET', token1),
      { params: Promise.resolve({ id: '999999' }) }
    );
    assert.equal(resNonExistentTarget.status, 404);
    const jsonNonExistentTarget = await resNonExistentTarget.json();
    assert.match(jsonNonExistentTarget.message, /tidak ditemukan/i);

    // User 1 attempting to access User 2's career target
    const resCrossTarget = await targetProgressRoute.GET(
      createJsonRequest(`http://localhost/api/competency-progress/career-targets/${targetIdUser2}`, 'GET', token1),
      { params: Promise.resolve({ id: String(targetIdUser2) }) }
    );
    assert.equal(resCrossTarget.status, 404);
  });

  // =========================================================================
  // TEST GROUP 4: GET /api/competency-progress (SUMMARY)
  // =========================================================================
  await t.test('Test 4: Competency progress summary computes metrics, scores, and filters correctly', async () => {
    const res = await summaryRoute.GET(
      createJsonRequest('http://localhost/api/competency-progress', 'GET', token1)
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    const data = body.data;
    assert.ok(data.summary);
    assert.ok(data.active_skills);
    assert.ok(data.recent_accepted_assessments);

    // 1. Total active skills: only JavaScript, React, Node.js (3 active skills)
    // Next.js (needs_review) and REST API (rejected) MUST NOT be counted
    assert.equal(data.summary.total_active_skills, 3);
    assert.equal(data.active_skills.length, 3);

    // 2. Level distribution
    assert.equal(data.summary.level_distribution.beginner, 1);    // Node.js
    assert.equal(data.summary.level_distribution.intermediate, 1);// JavaScript
    assert.equal(data.summary.level_distribution.advanced, 1);    // React

    // 3. Score calculation with NULL score handling
    // JavaScript (80) + React (90) = 170 / 2 = 85.0
    // Node.js score is NULL so it should not corrupt the average
    assert.equal(data.summary.skills_with_score_count, 2);
    assert.equal(data.summary.average_score, 85.0);

    // 4. Total accepted assessments: 4 accepted (2 for JS, 1 for React, 1 for Node.js)
    // Pending (Next.js) and Rejected (REST API) must be excluded
    assert.equal(data.summary.total_accepted_assessments, 4);

    // 5. Recent accepted assessments list
    assert.ok(Array.isArray(data.recent_accepted_assessments));
    assert.equal(data.recent_accepted_assessments.length, 4);
    for (const a of data.recent_accepted_assessments) {
      assert.ok(a.assessment_id);
      assert.ok(a.skill_id);
      assert.ok(a.skill_name);
      assert.ok(a.source_type);
      assert.ok(a.proficiency_level);
      assert.ok(a.created_at);
    }

    // Verify AI assessment has project link
    const aiAssessment = data.recent_accepted_assessments.find((a) => a.source_type === 'ai');
    assert.ok(aiAssessment);
    assert.ok(aiAssessment.project);
    assert.equal(aiAssessment.project.id, projectId);
    assert.equal(aiAssessment.project.title, 'Proyek Audit Kompetensi');
  });

  await t.test('Test 4B: Competency progress summary returns clean empty state for user with 0 skills', async () => {
    const res = await summaryRoute.GET(
      createJsonRequest('http://localhost/api/competency-progress', 'GET', token3)
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    const data = body.data;
    assert.equal(data.summary.total_active_skills, 0);
    assert.equal(data.summary.average_score, null);
    assert.equal(data.summary.skills_with_score_count, 0);
    assert.equal(data.summary.total_accepted_assessments, 0);
    assert.deepEqual(data.summary.level_distribution, {
      beginner: 0,
      intermediate: 0,
      advanced: 0,
    });
    assert.deepEqual(data.active_skills, []);
    assert.deepEqual(data.recent_accepted_assessments, []);
  });

  // =========================================================================
  // TEST GROUP 5: GET /api/competency-progress/skills/[id] (SKILL TIMELINE)
  // =========================================================================
  await t.test('Test 5: Skill detail returns chronological assessment timeline and statistics', async () => {
    // Access by master skill ID (id = 1, JavaScript)
    const res = await skillDetailRoute.GET(
      createJsonRequest(`http://localhost/api/competency-progress/skills/1`, 'GET', token1),
      { params: Promise.resolve({ id: '1' }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    const data = body.data;
    assert.equal(data.skill.id, 1);
    assert.equal(data.skill.name, 'JavaScript');

    assert.equal(data.current_state.user_skill_id, user1SkillId1);
    assert.equal(data.current_state.status, 'active');
    assert.equal(data.current_state.proficiency_level, 'intermediate');
    assert.equal(data.current_state.score, 80);

    assert.equal(data.assessment_statistics.total_assessments, 2);
    assert.equal(data.assessment_statistics.accepted_count, 2);
    assert.equal(data.assessment_statistics.pending_count, 0);
    assert.equal(data.assessment_statistics.rejected_count, 0);

    // Check chronological order (created_at ASC)
    assert.equal(data.assessment_history.length, 2);
    assert.equal(data.assessment_history[0].source_type, 'manual');
    assert.equal(data.assessment_history[0].proficiency_level, 'beginner');
    assert.equal(data.assessment_history[0].score, 60);
    assert.equal(data.assessment_history[0].project, null);

    assert.equal(data.assessment_history[1].source_type, 'ai');
    assert.equal(data.assessment_history[1].proficiency_level, 'intermediate');
    assert.equal(data.assessment_history[1].score, 80);
    assert.ok(data.assessment_history[1].project);
    assert.equal(data.assessment_history[1].project.id, projectId);

    // Also verify access by user_skill_id works
    const resByUserSkillId = await skillDetailRoute.GET(
      createJsonRequest(`http://localhost/api/competency-progress/skills/${user1SkillId1}`, 'GET', token1),
      { params: Promise.resolve({ id: String(user1SkillId1) }) }
    );
    assert.equal(resByUserSkillId.status, 200);
    const bodyUserSkillId = await resByUserSkillId.json();
    assert.equal(bodyUserSkillId.data.skill.id, 1);
  });

  // =========================================================================
  // TEST GROUP 6: GET /api/competency-progress/career-targets/[id]
  // =========================================================================
  await t.test('Test 6: Career target progress calculates readiness and requirements consistently', async () => {
    // 1. Target with requirements
    const res = await targetProgressRoute.GET(
      createJsonRequest(`http://localhost/api/competency-progress/career-targets/${targetIdWithReqs}`, 'GET', token1),
      { params: Promise.resolve({ id: String(targetIdWithReqs) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    const data = body.data;
    assert.equal(data.career_target.id, targetIdWithReqs);
    assert.equal(data.career_target.title, 'Senior Web Architect');
    assert.equal(data.has_requirements, true);

    // Requirements analysis:
    // Total: 4
    // Fulfilled: 1 (JavaScript: intermediate 80 >= 75)
    // Under-qualified: 1 (React: advanced 90 < 95)
    // Pending review: 1 (Next.js: needs_review)
    // Missing: 1 (MySQL: no user skill)
    // Readiness: 1 / 4 * 100 = 25.0%
    assert.equal(data.summary.total_skills, 4);
    assert.equal(data.summary.fulfilled_count, 1);
    assert.equal(data.summary.under_qualified_count, 1);
    assert.equal(data.summary.pending_review_count, 1);
    assert.equal(data.summary.missing_count, 1);
    assert.equal(data.readiness_percentage, 25.0);

    // Check individual skills progress
    assert.equal(data.skills_progress.length, 4);

    const jsProgress = data.skills_progress.find((s) => s.skill_id === 1);
    assert.ok(jsProgress);
    assert.equal(jsProgress.gap_status, 'fulfilled');
    assert.equal(jsProgress.is_fulfilled, true);
    assert.equal(jsProgress.current_proficiency.status, 'active');
    assert.equal(jsProgress.current_proficiency.proficiency_level, 'intermediate');
    assert.equal(jsProgress.current_proficiency.score, 80);

    const reactProgress = data.skills_progress.find((s) => s.skill_id === 2);
    assert.ok(reactProgress);
    assert.equal(reactProgress.gap_status, 'under-qualified');
    assert.equal(reactProgress.is_fulfilled, false);

    const nextProgress = data.skills_progress.find((s) => s.skill_id === 5);
    assert.ok(nextProgress);
    assert.equal(nextProgress.gap_status, 'pending_review');
    assert.equal(nextProgress.is_fulfilled, false);

    const mysqlProgress = data.skills_progress.find((s) => s.skill_id === 7);
    assert.ok(mysqlProgress);
    assert.equal(mysqlProgress.gap_status, 'missing');
    assert.equal(mysqlProgress.is_fulfilled, false);
    assert.equal(mysqlProgress.current_proficiency.status, 'missing');
  });

  await t.test('Test 6B: Career target without requirements (N=0) returns has_requirements: false and 0.0%', async () => {
    const res = await targetProgressRoute.GET(
      createJsonRequest(`http://localhost/api/competency-progress/career-targets/${targetIdEmpty}`, 'GET', token1),
      { params: Promise.resolve({ id: String(targetIdEmpty) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    const data = body.data;
    assert.equal(data.career_target.id, targetIdEmpty);
    assert.equal(data.has_requirements, false);
    assert.equal(data.readiness_percentage, 0.0);
    assert.equal(data.projected_readiness_percentage, 0.0);
    assert.deepEqual(data.skills_progress, []);
    assert.match(data.message, /belum memiliki kriteria/i);
  });

  // =========================================================================
  // TEST GROUP 7: ZERO-MUTATION VERIFICATION (DATABASE REMAINS UNTOUCHED)
  // =========================================================================
  await t.test('Test 7: Verification that progress endpoints are strictly read-only and leave database row counts identical', async () => {
    const tables = [
      'career_targets',
      'career_target_skills',
      'user_skills',
      'user_skill_assessments',
      'skills',
      'ai_analyses',
      'ai_analysis_skills',
      'projects',
      'project_evidences',
      'users',
    ];

    const countsBefore = {};
    for (const tbl of tables) {
      const [r] = await pool.query(`SELECT COUNT(*) as c FROM ${tbl}`);
      countsBefore[tbl] = r[0].c;
    }

    // Call all 3 endpoints multiple times
    await summaryRoute.GET(createJsonRequest('http://localhost/api/competency-progress', 'GET', token1));
    await skillDetailRoute.GET(createJsonRequest(`http://localhost/api/competency-progress/skills/${user1SkillId1}`, 'GET', token1), { params: Promise.resolve({ id: String(user1SkillId1) }) });
    await targetProgressRoute.GET(createJsonRequest(`http://localhost/api/competency-progress/career-targets/${targetIdWithReqs}`, 'GET', token1), { params: Promise.resolve({ id: String(targetIdWithReqs) }) });

    // Verify row counts after execution
    for (const tbl of tables) {
      const [r] = await pool.query(`SELECT COUNT(*) as c FROM ${tbl}`);
      assert.equal(
        r[0].c,
        countsBefore[tbl],
        `Table ${tbl} row count must remain exactly the same (no mutations permitted)`
      );
    }
  });
});
