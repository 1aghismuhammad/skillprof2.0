import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../lib/db.js';
import { signToken } from '../lib/auth.js';

// Route handlers
import * as targetGapRoute from '../app/api/career-targets/[id]/gap-analysis/route.js';
import * as allTargetsGapRoute from '../app/api/career-targets/gap-analysis/route.js';
import * as acceptAssessmentRoute from '../app/api/user-skills/assessments/[id]/accept/route.js';
import * as rejectAssessmentRoute from '../app/api/user-skills/assessments/[id]/reject/route.js';

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

test('Stage 9: Skill Gap Analysis Test Suite', async (t) => {
  let user1 = null;
  let user2 = null;
  let token1 = null;
  let token2 = null;

  const timestamp = Date.now();

  // 1. Setup isolated test users
  const [u1] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Gap Test User 1', `gap1_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user1 = { id: u1.insertId, name: 'Gap Test User 1', email: `gap1_${timestamp}@test.local` };
  token1 = await signToken(user1);

  const [u2] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Gap Test User 2', `gap2_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user2 = { id: u2.insertId, name: 'Gap Test User 2', email: `gap2_${timestamp}@test.local` };
  token2 = await signToken(user2);

  // Setup career target for User 1 with multiple skills:
  // - Skill 1 (JavaScript): Expected intermediate, score 75
  // - Skill 2 (React): Expected advanced, score 80
  // - Skill 3 (Vue.js): Expected intermediate, score 70
  // - Skill 4 (Node.js): Expected intermediate, score NULL (score NULL test)
  // - Skill 5 (Next.js): Expected intermediate, score 75
  // - Skill 6 (REST API): Expected beginner, score 60
  // - Skill 7 (MySQL): Expected intermediate, score 80
  const [ct1] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
    [user1.id, 'Fullstack Web Architect', 'Target karier untuk pengujian gap analysis komprehensif.']
  );
  const targetId1 = ct1.insertId;

  const targetSkillsData = [
    { skill_id: 1, expected_level: 'intermediate', expected_score: 75 }, // will be fulfilled
    { skill_id: 2, expected_level: 'advanced', expected_score: 80 },     // will be under-qualified (level lower)
    { skill_id: 3, expected_level: 'intermediate', expected_score: 85 }, // will be under-qualified (score lower)
    { skill_id: 4, expected_level: 'intermediate', expected_score: null },// expected_score NULL test (fulfilled)
    { skill_id: 5, expected_level: 'intermediate', expected_score: 75 }, // will be pending_review
    { skill_id: 6, expected_level: 'beginner', expected_score: 60 },     // will be rejected -> missing
    { skill_id: 7, expected_level: 'intermediate', expected_score: 80 }, // will be completely missing
  ];

  for (const s of targetSkillsData) {
    await pool.query(
      `INSERT INTO career_target_skills 
       (career_target_id, skill_id, expected_proficiency_level, expected_score)
       VALUES (?, ?, ?, ?)`,
      [targetId1, s.skill_id, s.expected_level, s.expected_score]
    );
  }

  // Target 2 for User 1 without requirements (N = 0)
  const [ct2] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
    [user1.id, 'Empty Requirement Target', 'Target tanpa kriteria skill.']
  );
  const targetIdEmpty = ct2.insertId;

  // Target for User 2 (for cross-user testing)
  const [ctUser2] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
    [user2.id, 'User 2 Target', 'Target milik User 2.']
  );
  const targetIdUser2 = ctUser2.insertId;

  // Seed user competencies for User 1:
  // 1. Skill 1: Active intermediate 80 (meets intermediate 75 -> FULFILLED)
  const [us1] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 1, 'intermediate', 80, 'active']
  );
  await pool.query(
    'INSERT INTO user_skill_assessments (user_skill_id, source_type, proficiency_level, score, review_status) VALUES (?, ?, ?, ?, ?)',
    [us1.insertId, 'manual', 'intermediate', 80, 'accepted']
  );

  // 2. Skill 2: Active intermediate 90 (expected advanced 80 -> UNDER-QUALIFIED because level is lower)
  const [us2] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 2, 'intermediate', 90, 'active']
  );
  await pool.query(
    'INSERT INTO user_skill_assessments (user_skill_id, source_type, proficiency_level, score, review_status) VALUES (?, ?, ?, ?, ?)',
    [us2.insertId, 'manual', 'intermediate', 90, 'accepted']
  );

  // 3. Skill 3: Active intermediate 70 (expected intermediate 85 -> UNDER-QUALIFIED because score is lower)
  // Also seed a NEW pending AI assessment to test active skill together with pending assessment!
  const [us3] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 3, 'intermediate', 70, 'active']
  );
  await pool.query(
    'INSERT INTO user_skill_assessments (user_skill_id, source_type, proficiency_level, score, review_status) VALUES (?, ?, ?, ?, ?)',
    [us3.insertId, 'manual', 'intermediate', 70, 'accepted']
  );
  await pool.query(
    'INSERT INTO user_skill_assessments (user_skill_id, source_type, proficiency_level, score, review_status, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [us3.insertId, 'ai', 'advanced', 88, 'pending', 'Hasil AI analisis proyek baru']
  );

  // 4. Skill 4: Active intermediate 65 (expected intermediate NULL -> FULFILLED because expected_score is NULL)
  const [us4] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 4, 'intermediate', 65, 'active']
  );
  await pool.query(
    'INSERT INTO user_skill_assessments (user_skill_id, source_type, proficiency_level, score, review_status) VALUES (?, ?, ?, ?, ?)',
    [us4.insertId, 'manual', 'intermediate', 65, 'accepted']
  );

  // 5. Skill 5: Needs review with MULTIPLE pending assessments (test latest pending selection: created_at DESC, id DESC)
  const [us5] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 5, null, null, 'needs_review']
  );
  // Older assessment
  const [oldAssessment] = await pool.query(
    `INSERT INTO user_skill_assessments 
     (user_skill_id, source_type, proficiency_level, score, review_status, notes, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, '2026-01-01 10:00:00')`,
    [us5.insertId, 'ai', 'beginner', 50, 'pending', 'Older pending assessment']
  );
  // Newer assessment (should be selected)
  const [newAssessment] = await pool.query(
    `INSERT INTO user_skill_assessments 
     (user_skill_id, source_type, proficiency_level, score, review_status, notes, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, '2026-02-01 12:00:00')`,
    [us5.insertId, 'ai', 'intermediate', 78, 'pending', 'Newer pending assessment']
  );
  const pendingAssessmentIdToAccept = newAssessment.insertId;

  // 6. Skill 6: Status rejected (treated as missing)
  const [us6] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 6, null, null, 'rejected']
  );
  await pool.query(
    'INSERT INTO user_skill_assessments (user_skill_id, source_type, proficiency_level, score, review_status, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [us6.insertId, 'ai', 'beginner', 40, 'rejected', 'Ditolak sebelumnya']
  );

  // 7. Skill 7 (MySQL): No row in user_skills at all -> MISSING

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
  // TEST CASES
  // =========================================================================

  await t.test('1. GET /api/career-targets/[id]/gap-analysis without token returns 401', async () => {
    const res = await targetGapRoute.GET(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}/gap-analysis`, 'GET', null),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );
    assert.equal(res.status, 401);
  });

  await t.test('2. GET gap analysis on non-existent target returns 404', async () => {
    const res = await targetGapRoute.GET(
      createJsonRequest('http://localhost/api/career-targets/999999/gap-analysis', 'GET', token1),
      { params: Promise.resolve({ id: '999999' }) }
    );
    assert.equal(res.status, 404);
  });

  await t.test('3. Cross-user access returns 404 (User 2 cannot inspect User 1 target)', async () => {
    const res = await targetGapRoute.GET(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}/gap-analysis`, 'GET', token2),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );
    assert.equal(res.status, 404);
  });

  let gapData = null;

  await t.test('4. Gap analysis returns correct status for all 7 skill requirements', async () => {
    const res = await targetGapRoute.GET(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}/gap-analysis`, 'GET', token1),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    gapData = body.data;

    assert.equal(gapData.career_target.id, targetId1);
    assert.equal(gapData.skills.length, 7);

    // Find each skill
    const skill1 = gapData.skills.find((s) => s.skill_id === 1);
    const skill2 = gapData.skills.find((s) => s.skill_id === 2);
    const skill3 = gapData.skills.find((s) => s.skill_id === 3);
    const skill4 = gapData.skills.find((s) => s.skill_id === 4);
    const skill5 = gapData.skills.find((s) => s.skill_id === 5);
    const skill6 = gapData.skills.find((s) => s.skill_id === 6);
    const skill7 = gapData.skills.find((s) => s.skill_id === 7);

    // Skill 1: fulfilled (active level intermediate >= intermediate, score 80 >= 75)
    assert.equal(skill1.gap_status, 'fulfilled');
    assert.equal(skill1.user_competency.status, 'active');

    // Skill 2: under-qualified because level is intermediate < advanced
    assert.equal(skill2.gap_status, 'under-qualified');
    assert.match(skill2.notes, /Tingkat kemahiran/i);

    // Skill 3: under-qualified because score 70 < 85 (same level)
    assert.equal(skill3.gap_status, 'under-qualified');
    assert.match(skill3.notes, /Skor kompetensi/i);

    // Skill 3: also verifies active skill with new pending assessment:
    // Main status is under-qualified, but pending_assessment is attached!
    assert.ok(skill3.user_competency.pending_assessment);
    assert.equal(skill3.user_competency.pending_assessment.proficiency_level, 'advanced');
    assert.equal(skill3.user_competency.pending_assessment.score, 88);

    // Skill 4: expected_score is NULL -> fulfilled because level intermediate >= intermediate
    assert.equal(skill4.gap_status, 'fulfilled');

    // Skill 5: pending_review (multiple pending assessments -> latest one selected)
    assert.equal(skill5.gap_status, 'pending_review');
    assert.equal(skill5.user_competency.pending_assessment.assessment_id, pendingAssessmentIdToAccept);
    assert.equal(skill5.user_competency.pending_assessment.proficiency_level, 'intermediate');
    assert.equal(skill5.user_competency.pending_assessment.score, 78);
    assert.equal(skill5.user_competency.pending_assessment.total_pending, 2);

    // Skill 6: rejected user_skill -> missing
    assert.equal(skill6.gap_status, 'missing');
    assert.match(skill6.notes, /ditolak/i);

    // Skill 7: completely absent from user_skills -> missing
    assert.equal(skill7.gap_status, 'missing');
    assert.equal(skill7.user_competency, null);
  });

  await t.test('5. Summary counts and readiness percentages match exact formula', async () => {
    const summary = gapData.summary;
    assert.equal(summary.total_skills, 7);
    assert.equal(summary.fulfilled_count, 2);        // Skills 1 & 4
    assert.equal(summary.under_qualified_count, 2);  // Skills 2 & 3
    assert.equal(summary.pending_review_count, 1);   // Skill 5
    assert.equal(summary.missing_count, 2);          // Skills 6 & 7

    // Invariant: sum of categories === total_skills
    assert.equal(
      summary.fulfilled_count +
        summary.under_qualified_count +
        summary.pending_review_count +
        summary.missing_count,
      summary.total_skills
    );

    // Readiness: fulfilled / total = 2 / 7 * 100 = 28.571... -> 28.6%
    assert.equal(summary.readiness_percentage, 28.6);

    // Projected: (fulfilled + 0.5 * under) / total = (2 + 1) / 7 * 100 = 42.857... -> 42.9%
    assert.equal(summary.projected_readiness_percentage, 42.9);
  });

  await t.test('6. Career target without requirements (N = 0) returns 0.0% and has_requirements: false', async () => {
    const res = await targetGapRoute.GET(
      createJsonRequest(`http://localhost/api/career-targets/${targetIdEmpty}/gap-analysis`, 'GET', token1),
      { params: Promise.resolve({ id: String(targetIdEmpty) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.summary.total_skills, 0);
    assert.equal(body.data.summary.readiness_percentage, 0.0);
    assert.equal(body.data.summary.projected_readiness_percentage, 0.0);
    assert.equal(body.data.summary.has_requirements, false);
    assert.equal(body.data.skills.length, 0);
  });

  await t.test('7. Accepting pending assessment dynamically updates gap analysis without cache staleness', async () => {
    // Accept Skill 5's pending assessment
    const acceptRes = await acceptAssessmentRoute.POST(
      createJsonRequest(
        `http://localhost/api/user-skills/assessments/${pendingAssessmentIdToAccept}/accept`,
        'POST',
        token1,
        {}
      ),
      { params: Promise.resolve({ id: String(pendingAssessmentIdToAccept) }) }
    );
    assert.equal(acceptRes.status, 200);

    // Re-query gap analysis
    const res = await targetGapRoute.GET(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}/gap-analysis`, 'GET', token1),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    const updatedSkill5 = body.data.skills.find((s) => s.skill_id === 5);

    // Skill 5 was expected intermediate 75. Accepted assessment is intermediate 78 -> now FULFILLED!
    assert.equal(updatedSkill5.gap_status, 'fulfilled');

    // Fulfilled count increased from 2 to 3!
    assert.equal(body.data.summary.fulfilled_count, 3);
    assert.equal(body.data.summary.pending_review_count, 0);
    // Readiness: 3 / 7 * 100 = 42.857... -> 42.9%
    assert.equal(body.data.summary.readiness_percentage, 42.9);
  });

  await t.test('8. GET /api/career-targets/gap-analysis returns list of all targets for user', async () => {
    const res = await allTargetsGapRoute.GET(
      createJsonRequest('http://localhost/api/career-targets/gap-analysis', 'GET', token1)
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data.length, 2, 'User 1 has 2 career targets');

    const target1Result = body.data.find((t) => t.career_target.id === targetId1);
    assert.ok(target1Result);
    assert.equal(target1Result.summary.total_skills, 7);

    const emptyTargetResult = body.data.find((t) => t.career_target.id === targetIdEmpty);
    assert.ok(emptyTargetResult);
    assert.equal(emptyTargetResult.summary.total_skills, 0);
  });

  await t.test('9. Verification: GET gap analysis does NOT alter or pollute database', async () => {
    const [countsBefore] = await pool.query('SELECT COUNT(*) AS cnt FROM career_targets');
    const [skillsCountBefore] = await pool.query('SELECT COUNT(*) AS cnt FROM career_target_skills');

    await targetGapRoute.GET(
      createJsonRequest(`http://localhost/api/career-targets/${targetId1}/gap-analysis`, 'GET', token1),
      { params: Promise.resolve({ id: String(targetId1) }) }
    );

    const [countsAfter] = await pool.query('SELECT COUNT(*) AS cnt FROM career_targets');
    const [skillsCountAfter] = await pool.query('SELECT COUNT(*) AS cnt FROM career_target_skills');

    assert.equal(countsAfter[0].cnt, countsBefore[0].cnt);
    assert.equal(skillsCountAfter[0].cnt, skillsCountBefore[0].cnt);
  });
});

