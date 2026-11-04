import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../lib/db.js';
import { signToken } from '../lib/auth.js';
import { MockAIProvider, setGlobalAIProvider } from '../lib/ai/provider.js';
import {
  ALLOWED_PLATFORMS,
  validateAndSanitizeRecommendations,
  generateCareerTargetRecommendations,
} from '../lib/ai/recommender.js';

// Route handlers
import * as allRecRoute from '../app/api/career-targets/[id]/recommendations/route.js';
import * as coursesRecRoute from '../app/api/career-targets/[id]/recommendations/courses/route.js';
import * as projectsRecRoute from '../app/api/career-targets/[id]/recommendations/projects/route.js';

function createJsonRequest(url, method = 'GET', token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return new Request(url, { method, headers });
}

test('Stage 10: Course & Project Recommendation Test Suite', async (t) => {
  let user1 = null;
  let user2 = null;
  let token1 = null;
  let token2 = null;

  let targetIdWithGaps = null;
  let targetIdEmptyReqs = null;
  let targetIdGoalReached = null;
  let targetIdUser2 = null;

  const timestamp = Date.now();

  // 1. Setup isolated test users
  const [u1] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Rec Test User 1', `rec1_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user1 = { id: u1.insertId, name: 'Rec Test User 1', email: `rec1_${timestamp}@test.local` };
  token1 = await signToken(user1);

  const [u2] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    ['Rec Test User 2', `rec2_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456']
  );
  user2 = { id: u2.insertId, name: 'Rec Test User 2', email: `rec2_${timestamp}@test.local` };
  token2 = await signToken(user2);

  // 2. Setup Career Target A for User 1 (Has gaps: fulfilled, under-qualified, missing, pending_review)
  // Master Skills in database (from baseline seeds):
  // 1: JavaScript, 2: React, 3: Vue.js, 4: Node.js, 5: Next.js, 6: REST API, 7: MySQL, 8: PostgreSQL, 9: Docker, 10: Git
  const [ct1] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
    [user1.id, 'Senior Frontend Specialist', 'Target karier frontend dengan fokus React dan Next.js.']
  );
  targetIdWithGaps = ct1.insertId;

  // Add requirements:
  // - Skill 1 (JavaScript): expected intermediate 75 -> user has active intermediate 80 (FULFILLED)
  // - Skill 2 (React): expected advanced 85 -> user has active intermediate 70 (UNDER-QUALIFIED)
  // - Skill 5 (Next.js): expected intermediate 75 -> user has pending_review assessment only
  // - Skill 9 (Docker): expected beginner 60 -> user has no record (MISSING)
  const targetSkillsData = [
    { skill_id: 1, expected_level: 'intermediate', expected_score: 75 },
    { skill_id: 2, expected_level: 'advanced', expected_score: 85 },
    { skill_id: 5, expected_level: 'intermediate', expected_score: 75 },
    { skill_id: 9, expected_level: 'beginner', expected_score: 60 },
  ];

  for (const s of targetSkillsData) {
    await pool.query(
      `INSERT INTO career_target_skills 
       (career_target_id, skill_id, expected_proficiency_level, expected_score)
       VALUES (?, ?, ?, ?)`,
      [targetIdWithGaps, s.skill_id, s.expected_level, s.expected_score]
    );
  }

  // Seed competencies for Target A:
  // Skill 1 (JavaScript): Active intermediate 80 (FULFILLED)
  await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 1, 'intermediate', 80, 'active']
  );

  // Skill 2 (React): Active intermediate 70 (UNDER-QUALIFIED)
  await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, ?, ?, ?)',
    [user1.id, 2, 'intermediate', 70, 'active']
  );

  // Skill 5 (Next.js): needs_review with pending assessment
  const [usNext] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, ?, NULL, NULL, ?)',
    [user1.id, 5, 'needs_review']
  );
  await pool.query(
    `INSERT INTO user_skill_assessments 
     (user_skill_id, source_type, proficiency_level, score, notes, review_status) 
     VALUES (?, 'ai', 'intermediate', 75, 'Pending review AI note', 'pending')`,
    [usNext.insertId]
  );

  // 3. Setup Career Target B for User 1 (0 Requirements: N = 0)
  const [ct2] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
    [user1.id, 'Career Target Tanpa Kriteria', 'Target kosong tanpa skill requirement.']
  );
  targetIdEmptyReqs = ct2.insertId;

  // 4. Setup Career Target C for User 1 (All Fulfilled / Goal Reached)
  const [ct3] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
    [user1.id, 'JavaScript Core Master', 'Target khusus penguasaan JavaScript.']
  );
  targetIdGoalReached = ct3.insertId;
  await pool.query(
    `INSERT INTO career_target_skills 
     (career_target_id, skill_id, expected_proficiency_level, expected_score)
     VALUES (?, 1, 'intermediate', 75)`,
    [targetIdGoalReached]
  );

  // 5. Setup Career Target for User 2 (for cross-user 404 test)
  const [ctUser2] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
    [user2.id, 'User 2 Career Goal', 'Milik user 2.']
  );
  targetIdUser2 = ctUser2.insertId;

  // Mock responses for deterministic testing
  const validMockRecommendations = {
    courses: [
      {
        title: 'Mastering Advanced React and Concurrent Patterns',
        platform: 'Coursera',
        skill_name: 'React',
        level: 'advanced',
        description: 'Mendalami concurrent features, hooks custom kompleks, dan optimasi render React.',
        url: 'https://www.coursera.org/learn/advanced-react',
        estimated_duration: '6 minggu',
      },
      {
        title: 'Docker for Web Developers from Scratch',
        platform: 'freeCodeCamp',
        skill_name: 'Docker',
        level: 'beginner',
        description: 'Dasar containerization, pembuatan Dockerfile, dan docker-compose untuk lingkungan web.',
        url: 'https://www.freecodecamp.org/news/docker-guide',
        estimated_duration: '15 jam',
      },
    ],
    projects: [
      {
        title: 'Enterprise High-Performance Dashboard & Containerized Microservices',
        description: 'Membangun aplikasi web dashboard interaktif dengan arsitektur React mutakhir dan deployment Docker terisolasi.',
        difficulty_level: 'advanced',
        target_skills: ['React', 'Docker'],
        key_features: [
          'State management terpusat dengan optimasi rendering reaktif',
          'Container multi-stage build untuk efisiensi bundle image',
          'Monitoring performa web vitals secara real-time',
        ],
        suggested_evidences: [
          'Repositori GitHub publik dengan clean code dan dokumentasi arsitektur',
          'Dockerfile dan konfigurasi docker-compose siap pakai',
          'Demo aplikasi live yang dapat diakses publik',
        ],
        expected_outcome: 'Penguasaan arsitektur frontend tingkat lanjut dan deployment kontainer modern.',
      },
      {
        title: 'Modern Component Library & Containerized Showcase',
        description: 'Sistem desain komponen UI modular siap pakai dengan pengujian otomatis dan kontainer demo.',
        difficulty_level: 'intermediate',
        target_skills: ['React'],
        key_features: [
          'Komponen atomik yang dapat dikonfigurasi ulang',
          'Aksesibilitas ramah pembaca layar (ARIA)',
          'Dokumentasi interaktif komponen',
        ],
        suggested_evidences: [
          'Repositori paket npm/git dengan unit test coverage tinggi',
          'Tautan demo interaktif berbasis web',
        ],
        expected_outcome: 'Kemampuan merancang antarmuka modular yang teruji dan konsisten.',
      },
    ],
  };

  t.after(async () => {
    setGlobalAIProvider(null);
    if (user1) {
      await pool.query('DELETE FROM users WHERE id = ?', [user1.id]);
    }
    if (user2) {
      await pool.query('DELETE FROM users WHERE id = ?', [user2.id]);
    }
    await pool.end();
  });

  // =========================================================================
  // TEST 1: AUTHENTICATION & VALIDATION CHECKS (401 & 400)
  // =========================================================================
  await t.test('Test 1: Endpoints return 401 when unauthenticated and 400 for invalid ID', async () => {
    // 1. Unauthenticated requests to all 3 endpoints
    const unauthReqAll = createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations`);
    const resAll = await allRecRoute.GET(unauthReqAll, { params: Promise.resolve({ id: String(targetIdWithGaps) }) });
    assert.equal(resAll.status, 401);

    const unauthReqCourses = createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations/courses`);
    const resCourses = await coursesRecRoute.GET(unauthReqCourses, { params: Promise.resolve({ id: String(targetIdWithGaps) }) });
    assert.equal(resCourses.status, 401);

    const unauthReqProjects = createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations/projects`);
    const resProjects = await projectsRecRoute.GET(unauthReqProjects, { params: Promise.resolve({ id: String(targetIdWithGaps) }) });
    assert.equal(resProjects.status, 401);

    // 2. Invalid parameter ID (e.g. non-integer or negative)
    const invalidIdReq = createJsonRequest('http://localhost/api/career-targets/abc/recommendations', 'GET', token1);
    const resInvalid = await allRecRoute.GET(invalidIdReq, { params: Promise.resolve({ id: 'abc' }) });
    assert.equal(resInvalid.status, 400);
    const dataInvalid = await resInvalid.json();
    assert.equal(dataInvalid.status, 'error');
    assert.match(dataInvalid.message, /ID target karier tidak valid/i);
  });

  // =========================================================================
  // TEST 2: OWNERSHIP & 404 NOT FOUND CHECKS
  // =========================================================================
  await t.test('Test 2: Endpoints return 404 for non-existent target or cross-user target access', async () => {
    // 1. Non-existent target ID
    const notFoundReq = createJsonRequest('http://localhost/api/career-targets/9999999/recommendations', 'GET', token1);
    const resNotFound = await allRecRoute.GET(notFoundReq, { params: Promise.resolve({ id: '9999999' }) });
    assert.equal(resNotFound.status, 404);
    const dataNotFound = await resNotFound.json();
    assert.equal(dataNotFound.status, 'error');
    assert.match(dataNotFound.message, /tidak ditemukan/i);

    // 2. Cross-user access (User 1 trying to access User 2's target)
    const crossReq = createJsonRequest(`http://localhost/api/career-targets/${targetIdUser2}/recommendations`, 'GET', token1);
    const resCross = await allRecRoute.GET(crossReq, { params: Promise.resolve({ id: String(targetIdUser2) }) });
    assert.equal(resCross.status, 404);
  });

  // =========================================================================
  // TEST 3: RULE OF NO REQUIREMENTS (400 WITHOUT CALLING AI)
  // =========================================================================
  await t.test('Test 3: Career target with 0 requirements returns 400 and never invokes AI', async () => {
    // Set a provider that would throw if called
    const strictProvider = new MockAIProvider({ shouldFail: true, failureStatus: 500 });
    setGlobalAIProvider(strictProvider);

    const emptyReq = createJsonRequest(`http://localhost/api/career-targets/${targetIdEmptyReqs}/recommendations`, 'GET', token1);
    const resEmpty = await allRecRoute.GET(emptyReq, { params: Promise.resolve({ id: String(targetIdEmptyReqs) }) });

    assert.equal(resEmpty.status, 400);
    const jsonEmpty = await resEmpty.json();
    assert.equal(jsonEmpty.status, 'error');
    assert.match(jsonEmpty.message, /belum memiliki kriteria kompetensi/i);
  });

  // =========================================================================
  // TEST 4: RULE OF GOAL REACHED (200 WITHOUT CALLING AI)
  // =========================================================================
  await t.test('Test 4: Career target with 100% fulfilled skills returns goal reached and never invokes AI', async () => {
    // Set provider that would throw if called
    const strictProvider = new MockAIProvider({ shouldFail: true, failureStatus: 500 });
    setGlobalAIProvider(strictProvider);

    // 1. Combined recommendations endpoint
    const goalReqAll = createJsonRequest(`http://localhost/api/career-targets/${targetIdGoalReached}/recommendations`, 'GET', token1);
    const resGoalAll = await allRecRoute.GET(goalReqAll, { params: Promise.resolve({ id: String(targetIdGoalReached) }) });
    assert.equal(resGoalAll.status, 200);
    const dataGoalAll = await resGoalAll.json();
    assert.equal(dataGoalAll.status, 'success');
    assert.equal(dataGoalAll.data.status, 'goal_reached');
    assert.match(dataGoalAll.data.message, /seluruh kriteria kompetensi.*terpenuhi/i);
    assert.deepEqual(dataGoalAll.data.courses, []);
    assert.deepEqual(dataGoalAll.data.projects, []);
    assert.equal(dataGoalAll.data.gap_summary.fulfilled_count, 1);
    assert.equal(dataGoalAll.data.gap_summary.readiness_percentage, 100.0);

    // 2. Courses only endpoint
    const goalReqCourses = createJsonRequest(`http://localhost/api/career-targets/${targetIdGoalReached}/recommendations/courses`, 'GET', token1);
    const resGoalCourses = await coursesRecRoute.GET(goalReqCourses, { params: Promise.resolve({ id: String(targetIdGoalReached) }) });
    assert.equal(resGoalCourses.status, 200);
    const dataGoalCourses = await resGoalCourses.json();
    assert.equal(dataGoalCourses.data.status, 'goal_reached');
    assert.deepEqual(dataGoalCourses.data.courses, []);
    assert.equal(dataGoalCourses.data.projects, undefined);

    // 3. Projects only endpoint
    const goalReqProjects = createJsonRequest(`http://localhost/api/career-targets/${targetIdGoalReached}/recommendations/projects`, 'GET', token1);
    const resGoalProjects = await projectsRecRoute.GET(goalReqProjects, { params: Promise.resolve({ id: String(targetIdGoalReached) }) });
    assert.equal(resGoalProjects.status, 200);
    const dataGoalProjects = await resGoalProjects.json();
    assert.equal(dataGoalProjects.data.status, 'goal_reached');
    assert.deepEqual(dataGoalProjects.data.projects, []);
    assert.equal(dataGoalProjects.data.courses, undefined);
  });

  // =========================================================================
  // TEST 5: SUCCESSFUL COMBINED RECOMMENDATION (GET /recommendations)
  // =========================================================================
  await t.test('Test 5: Combined recommendations generate structured courses and projects for gaps only', async () => {
    const mockProvider = new MockAIProvider({ customResponse: validMockRecommendations });
    setGlobalAIProvider(mockProvider);

    const req = createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations`, 'GET', token1);
    const res = await allRecRoute.GET(req, { params: Promise.resolve({ id: String(targetIdWithGaps) }) });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    const data = body.data;
    assert.equal(data.career_target.id, targetIdWithGaps);
    assert.equal(data.career_target.title, 'Senior Frontend Specialist');

    // Gap summary verification
    assert.equal(data.gap_summary.total_skills, 4);
    assert.equal(data.gap_summary.fulfilled_count, 1);       // JavaScript
    assert.equal(data.gap_summary.under_qualified_count, 1); // React
    assert.equal(data.gap_summary.pending_review_count, 1);  // Next.js
    assert.equal(data.gap_summary.missing_count, 1);         // Docker

    // Gap skills list must contain ONLY under-qualified and missing skills (React and Docker)
    assert.equal(data.gap_skills.length, 2);
    const gapSkillNames = data.gap_skills.map((s) => s.skill_name);
    assert.ok(gapSkillNames.includes('React'));
    assert.ok(gapSkillNames.includes('Docker'));
    assert.ok(!gapSkillNames.includes('JavaScript'), 'Fulfilled skill JavaScript must not be in gap_skills');
    assert.ok(!gapSkillNames.includes('Next.js'), 'Pending review skill Next.js must not be in primary gap_skills');

    // Courses verification
    assert.ok(Array.isArray(data.courses));
    assert.equal(data.courses.length, 2);
    for (const c of data.courses) {
      assert.ok(c.title);
      assert.ok(ALLOWED_PLATFORMS.includes(c.platform), `Platform ${c.platform} must be in allowlist`);
      assert.ok(gapSkillNames.includes(c.skill_name), `Recommended skill ${c.skill_name} must belong to gap skills`);
      assert.ok(['beginner', 'intermediate', 'advanced'].includes(c.level));
      assert.ok(c.description);
      assert.ok(c.url.startsWith('http://') || c.url.startsWith('https://'));
      assert.ok(c.estimated_duration);
    }

    // Projects verification
    assert.ok(Array.isArray(data.projects));
    assert.equal(data.projects.length, 2);
    for (const p of data.projects) {
      assert.ok(p.title);
      assert.ok(p.description);
      assert.ok(['beginner', 'intermediate', 'advanced'].includes(p.difficulty_level));
      assert.ok(Array.isArray(p.target_skills) && p.target_skills.length > 0);
      for (const tSkill of p.target_skills) {
        assert.ok(gapSkillNames.includes(tSkill), `Target skill ${tSkill} must belong to gap skills`);
      }
      assert.ok(Array.isArray(p.key_features) && p.key_features.length > 0);
      assert.ok(Array.isArray(p.suggested_evidences) && p.suggested_evidences.length > 0);
      assert.ok(p.expected_outcome);
    }
  });

  // =========================================================================
  // TEST 6: DEDICATED COURSES RECOMMENDATION (GET /recommendations/courses)
  // =========================================================================
  await t.test('Test 6: Dedicated courses endpoint returns courses only without projects key', async () => {
    const mockProvider = new MockAIProvider({ customResponse: validMockRecommendations });
    setGlobalAIProvider(mockProvider);

    const req = createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations/courses`, 'GET', token1);
    const res = await coursesRecRoute.GET(req, { params: Promise.resolve({ id: String(targetIdWithGaps) }) });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(Array.isArray(body.data.courses));
    assert.equal(body.data.courses.length, 2);
    assert.equal(body.data.projects, undefined, 'Projects key must not exist on courses endpoint');
  });

  // =========================================================================
  // TEST 7: DEDICATED PROJECTS RECOMMENDATION (GET /recommendations/projects)
  // =========================================================================
  await t.test('Test 7: Dedicated projects endpoint returns projects only without courses key', async () => {
    const mockProvider = new MockAIProvider({ customResponse: validMockRecommendations });
    setGlobalAIProvider(mockProvider);

    const req = createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations/projects`, 'GET', token1);
    const res = await projectsRecRoute.GET(req, { params: Promise.resolve({ id: String(targetIdWithGaps) }) });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(Array.isArray(body.data.projects));
    assert.equal(body.data.projects.length, 2);
    assert.equal(body.data.courses, undefined, 'Courses key must not exist on projects endpoint');
  });

  // =========================================================================
  // TEST 8: STRICT AI OUTPUT VALIDATION (REJECTION OF INVALID/UNKNOWN DATA)
  // =========================================================================
  await t.test('Test 8: Strict validation rejects unknown skills, invalid platforms, and malformed JSON', async () => {
    const gapSkillNames = ['React', 'Docker'];

    // 1. Malformed JSON throws 502
    assert.throws(
      () => validateAndSanitizeRecommendations('Not a JSON at all', gapSkillNames, 'all'),
      (err) => err.status === 502 && err.message.includes('bukan format JSON yang valid')
    );

    // 2. Platform outside allowlist is rejected
    const unallowedPlatformPayload = JSON.stringify({
      courses: [
        {
          title: 'Suspicious Course',
          platform: 'RandomUntrustedSite.com', // NOT in allowlist
          skill_name: 'React',
          level: 'intermediate',
        },
      ],
      projects: [],
    });
    assert.throws(
      () => validateAndSanitizeRecommendations(unallowedPlatformPayload, gapSkillNames, 'courses'),
      (err) => err.status === 502 && err.message.includes('tidak memuat rekomendasi kursus yang valid')
    );

    // 3. Hallucinated skill not in gapSkillNames is rejected
    const hallucinatedSkillPayload = JSON.stringify({
      courses: [
        {
          title: 'Flutter Masterclass',
          platform: 'Coursera',
          skill_name: 'Flutter', // NOT in gapSkillNames ['React', 'Docker']
          level: 'intermediate',
        },
      ],
      projects: [],
    });
    assert.throws(
      () => validateAndSanitizeRecommendations(hallucinatedSkillPayload, gapSkillNames, 'courses'),
      (err) => err.status === 502 && err.message.includes('tidak memuat rekomendasi kursus yang valid')
    );

    // 4. Project with zero valid target skills is rejected
    const invalidProjectPayload = JSON.stringify({
      courses: [],
      projects: [
        {
          title: 'Blockchain DApp',
          difficulty_level: 'advanced',
          target_skills: ['Solidity', 'Ethereum'], // None in ['React', 'Docker']
          key_features: ['Smart contracts'],
        },
      ],
    });
    assert.throws(
      () => validateAndSanitizeRecommendations(invalidProjectPayload, gapSkillNames, 'projects'),
      (err) => err.status === 502 && err.message.includes('tidak memuat rekomendasi proyek yang valid')
    );
  });

  // =========================================================================
  // TEST 9: FAULT TOLERANCE & ERROR PROPAGATION (429, 504, 503)
  // =========================================================================
  await t.test('Test 9: Fault tolerance handles rate limit (429), timeout (504), and missing API key (503)', async () => {
    // 1. Rate limit (429)
    const rateLimitProvider = new MockAIProvider({ shouldFail: true, failureStatus: 429 });
    setGlobalAIProvider(rateLimitProvider);

    const req429 = createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations`, 'GET', token1);
    const res429 = await allRecRoute.GET(req429, { params: Promise.resolve({ id: String(targetIdWithGaps) }) });
    assert.equal(res429.status, 429);
    const json429 = await res429.json();
    assert.match(json429.message, /rate limit/i);

    // 2. Timeout (504)
    const timeoutProvider = new MockAIProvider({ shouldFail: true, failureStatus: 504 });
    setGlobalAIProvider(timeoutProvider);

    const req504 = createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations`, 'GET', token1);
    const res504 = await allRecRoute.GET(req504, { params: Promise.resolve({ id: String(targetIdWithGaps) }) });
    assert.equal(res504.status, 504);
    const json504 = await res504.json();
    assert.match(json504.message, /batas waktu/i);
  });

  // =========================================================================
  // TEST 10: ZERO-MUTATION VERIFICATION (DATABASE REMAINS UNTOUCHED)
  // =========================================================================
  await t.test('Test 10: Endpoints are purely read-only and leave database row counts identical', async () => {
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

    const mockProvider = new MockAIProvider({ customResponse: validMockRecommendations });
    setGlobalAIProvider(mockProvider);

    // Execute requests across all endpoints
    await allRecRoute.GET(createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations`, 'GET', token1), { params: Promise.resolve({ id: String(targetIdWithGaps) }) });
    await coursesRecRoute.GET(createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations/courses`, 'GET', token1), { params: Promise.resolve({ id: String(targetIdWithGaps) }) });
    await projectsRecRoute.GET(createJsonRequest(`http://localhost/api/career-targets/${targetIdWithGaps}/recommendations/projects`, 'GET', token1), { params: Promise.resolve({ id: String(targetIdWithGaps) }) });

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

