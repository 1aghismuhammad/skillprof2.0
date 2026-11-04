import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../lib/db.js';
import { signToken } from '../lib/auth.js';
import { MockAIProvider, setGlobalAIProvider } from '../lib/ai/provider.js';

// Route handlers
import * as portfoliosRoute from '../app/api/portfolios/route.js';
import * as generateRoute from '../app/api/portfolios/generate/route.js';
import * as portfolioDetailRoute from '../app/api/portfolios/[id]/route.js';

function createJsonRequest(url, method = 'GET', token = null, body = null) {
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

test('Stage 11B: Portfolio Builder & AI Portfolio Generator Test Suite', async (t) => {
  let user1 = null;
  let user2 = null;
  let userEmpty = null;
  let token1 = null;
  let token2 = null;
  let tokenEmpty = null;

  let u1ProjectId1 = null;
  let u1ProjectId2 = null;
  let u2ProjectId = null;

  let u1SkillId1 = null; // Active (JavaScript)
  let u1SkillId2 = null; // Active (React)
  let u1SkillIdNeedsReview = null; // Needs review (Next.js)
  let u1SkillIdRejected = null; // Rejected (MySQL)

  let u1TargetId = null;
  let u2TargetId = null;

  const timestamp = Date.now();

  // Setup isolated test users immediately with cleanup hook
  t.after(async () => {
    // Kembalikan AI Provider default
    setGlobalAIProvider(null);

    if (user1) {
      await pool.query('DELETE FROM projects WHERE user_id = ?', [user1.id]);
      await pool.query('DELETE FROM users WHERE id = ?', [user1.id]);
    }
    if (user2) {
      await pool.query('DELETE FROM projects WHERE user_id = ?', [user2.id]);
      await pool.query('DELETE FROM users WHERE id = ?', [user2.id]);
    }
    if (userEmpty) {
      await pool.query('DELETE FROM users WHERE id = ?', [userEmpty.id]);
    }
  });

  // 1. Buat User 1, User 2, dan User Kosong (Empty)
  const [u1] = await pool.query(
    'INSERT INTO users (name, email, password_hash, bio) VALUES (?, ?, ?, ?)',
    ['Ahmad Portofolio 1', `port1_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456', 'Pengembang Web Fullstack']
  );
  user1 = { id: u1.insertId, name: 'Ahmad Portofolio 1', email: `port1_${timestamp}@test.local` };
  token1 = await signToken(user1);

  const [u2] = await pool.query(
    'INSERT INTO users (name, email, password_hash, bio) VALUES (?, ?, ?, ?)',
    ['Budi Portofolio 2', `port2_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456', 'Mobile App Developer']
  );
  user2 = { id: u2.insertId, name: 'Budi Portofolio 2', email: `port2_${timestamp}@test.local` };
  token2 = await signToken(user2);

  const [uEmpty] = await pool.query(
    'INSERT INTO users (name, email, password_hash, bio) VALUES (?, ?, ?, ?)',
    ['Cici Kosong', `portempty_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456', null]
  );
  userEmpty = { id: uEmpty.insertId, name: 'Cici Kosong', email: `portempty_${timestamp}@test.local` };
  tokenEmpty = await signToken(userEmpty);

  // 2. Setup Proyek untuk User 1
  const [p1] = await pool.query(
    `INSERT INTO projects (user_id, title, description, repository_url, live_url) 
     VALUES (?, ?, ?, ?, ?)`,
    [user1.id, 'Proyek Katalog E-Commerce', 'Deskripsi asli proyek 1 oleh user 1.', 'https://github.com/u1/p1', 'https://p1.test.local']
  );
  u1ProjectId1 = p1.insertId;

  await pool.query(
    `INSERT INTO project_evidences (project_id, title, evidence_type, url)
     VALUES (?, 'Demo Toko', 'demo', 'https://demo.u1.test.local')`,
    [u1ProjectId1]
  );

  const [p2] = await pool.query(
    `INSERT INTO projects (user_id, title, description, repository_url, live_url) 
     VALUES (?, ?, ?, ?, ?)`,
    [user1.id, 'Proyek Dashboard Analitik', 'Deskripsi asli proyek 2 oleh user 1.', 'https://github.com/u1/p2', 'https://p2.test.local']
  );
  u1ProjectId2 = p2.insertId;

  // Setup Proyek untuk User 2 (untuk cross-user test)
  const [pU2] = await pool.query(
    `INSERT INTO projects (user_id, title, description, repository_url, live_url) 
     VALUES (?, ?, ?, ?, ?)`,
    [user2.id, 'Proyek User 2 Rahasia', 'Deskripsi proyek milik user 2.', 'https://github.com/u2/secret', 'https://u2.test.local']
  );
  u2ProjectId = pU2.insertId;

  // 3. Setup Skill untuk User 1
  // Skill 1: JavaScript (active, intermediate, 80)
  const [us1] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, 1, "intermediate", 80, "active")',
    [user1.id]
  );
  u1SkillId1 = 1;

  // Skill 2: React (active, advanced, 90)
  const [us2] = await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, 2, "advanced", 90, "active")',
    [user1.id]
  );
  u1SkillId2 = 2;

  // Skill 5: Next.js (needs_review) -> BUKAN ACTIVE
  await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, 5, "intermediate", 75, "needs_review")',
    [user1.id]
  );
  u1SkillIdNeedsReview = 5;

  // Skill 7: MySQL (rejected) -> BUKAN ACTIVE
  await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, 7, "beginner", 50, "rejected")',
    [user1.id]
  );
  u1SkillIdRejected = 7;

  // 4. Setup Career Target untuk User 1 dan User 2
  const [ct1] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, "Senior Fullstack Engineer", "Target karier 1")',
    [user1.id]
  );
  u1TargetId = ct1.insertId;

  const [ct2] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, "Mobile Engineer User 2", "Target karier milik user 2")',
    [user2.id]
  );
  u2TargetId = ct2.insertId;

  // =========================================================================
  // TEST GROUP 1: AUTHENTICATION ENFORCEMENT (401)
  // =========================================================================
  await t.test('Test 1: Authentication enforcement on all 6 endpoints returns 401 without token', async () => {
    // 1. GET /api/portfolios
    const resGet = await portfoliosRoute.GET(createJsonRequest('http://localhost/api/portfolios'));
    assert.equal(resGet.status, 401);

    // 2. POST /api/portfolios
    const resPost = await portfoliosRoute.POST(createJsonRequest('http://localhost/api/portfolios', 'POST', null, {}));
    assert.equal(resPost.status, 401);

    // 3. POST /api/portfolios/generate
    const resGen = await generateRoute.POST(createJsonRequest('http://localhost/api/portfolios/generate', 'POST', null, {}));
    assert.equal(resGen.status, 401);

    // 4. GET /api/portfolios/[id]
    const resGetDetail = await portfolioDetailRoute.GET(createJsonRequest('http://localhost/api/portfolios/1'), { params: Promise.resolve({ id: '1' }) });
    assert.equal(resGetDetail.status, 401);

    // 5. PUT /api/portfolios/[id]
    const resPut = await portfolioDetailRoute.PUT(createJsonRequest('http://localhost/api/portfolios/1', 'PUT', null, {}), { params: Promise.resolve({ id: '1' }) });
    assert.equal(resPut.status, 401);

    // 6. DELETE /api/portfolios/[id]
    const resDel = await portfolioDetailRoute.DELETE(createJsonRequest('http://localhost/api/portfolios/1', 'DELETE'), { params: Promise.resolve({ id: '1' }) });
    assert.equal(resDel.status, 401);
  });

  // =========================================================================
  // TEST GROUP 2: PRE-CONDITION VALIDATION FOR AI GENERATOR (422)
  // =========================================================================
  await t.test('Test 2: Pre-condition validation (422) when user has 0 projects or 0 active skills', async () => {
    // UserEmpty memiliki 0 proyek dan 0 skill
    const resEmpty = await generateRoute.POST(
      createJsonRequest('http://localhost/api/portfolios/generate', 'POST', tokenEmpty, {})
    );
    assert.equal(resEmpty.status, 422);
    const bodyEmpty = await resEmpty.json();
    assert.match(bodyEmpty.message, /minimal satu proyek/i);

    // Buat 1 proyek untuk UserEmpty, tapi tetap 0 skill aktif
    const [pEmpty] = await pool.query(
      'INSERT INTO projects (user_id, title, description) VALUES (?, "Proyek Tunggal", "Deskripsi")',
      [userEmpty.id]
    );

    const resNoSkill = await generateRoute.POST(
      createJsonRequest('http://localhost/api/portfolios/generate', 'POST', tokenEmpty, {})
    );
    assert.equal(resNoSkill.status, 422);
    const bodyNoSkill = await resNoSkill.json();
    assert.match(bodyNoSkill.message, /minimal satu skill aktif/i);

    // Bersihkan proyek UserEmpty
    await pool.query('DELETE FROM projects WHERE id = ?', [pEmpty.insertId]);
  });

  // =========================================================================
  // TEST GROUP 3: AI DRAFT GENERATOR WITH ANTI-HALLUCINATION & STATELESSNESS
  // =========================================================================
  await t.test('Test 3: POST /api/portfolios/generate produces strictly grounded draft and discards hallucinations', async () => {
    // Mock AI yang mencoba memasukkan ID proyek dan skill fiktif (halusinasi)
    const mockHallucinatoryOutput = {
      title: 'Fullstack Architect AI',
      summary: 'Mahasiswa kompeten dengan proyek nyata.',
      custom_bio: 'Bio profesional teruji.',
      suggested_slug: 'ahmad-portofolio-slug',
      selected_project_ids: [u1ProjectId1, 999999], // 999999 adalah proyek fiktif
      project_contributions: [
        {
          project_id: u1ProjectId1,
          custom_description: 'Membuat backend REST API terstruktur dan query optimal.',
        },
        {
          project_id: 999999,
          custom_description: 'Proyek fiktif rekaan AI.',
        },
      ],
      selected_skill_ids: [u1SkillId1, u1SkillIdNeedsReview, 888888], // u1SkillIdNeedsReview bukan active, 888888 fiktif
    };

    const mockProvider = new MockAIProvider({ customResponse: mockHallucinatoryOutput });
    setGlobalAIProvider(mockProvider);

    // Simpan hitungan baris database sebelum panggil generate
    const [countsBefore] = await pool.query('SELECT COUNT(*) as c FROM portfolios');

    const res = await generateRoute.POST(
      createJsonRequest('http://localhost/api/portfolios/generate', 'POST', token1, {
        career_target_id: u1TargetId,
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    const draft = body.data;
    assert.equal(draft.title, 'Fullstack Architect AI');
    assert.equal(draft.suggested_slug, 'ahmad-portofolio-slug');
    assert.ok(draft.career_target);
    assert.equal(draft.career_target.id, u1TargetId);

    // Verifikasi anti-halusinasi proyek: proyek 999999 DIBUANG
    assert.equal(draft.suggested_projects.length, 1);
    assert.equal(draft.suggested_projects[0].project_id, u1ProjectId1);
    assert.equal(draft.suggested_projects[0].custom_description, 'Membuat backend REST API terstruktur dan query optimal.');
    assert.equal(draft.suggested_projects[0].evidences_count, 1);

    // Verifikasi anti-halusinasi skill: skill non-active (u1SkillIdNeedsReview) dan fiktif (888888) DIBUANG
    assert.equal(draft.suggested_skills.length, 1);
    assert.equal(draft.suggested_skills[0].skill_id, u1SkillId1);
    assert.equal(draft.suggested_skills[0].skill_name, 'JavaScript');

    // Verifikasi STATELESS / ZERO-MUTATION: Endpoint generate TIDAK MENULIS ke tabel portfolios
    const [countsAfter] = await pool.query('SELECT COUNT(*) as c FROM portfolios');
    assert.equal(countsAfter[0].c, countsBefore[0].c, 'POST /generate must not persist draft to database');
  });

  // =========================================================================
  // TEST GROUP 4: AI ERROR HANDLING (INVALID JSON, RATE LIMIT, TIMEOUT, 503)
  // =========================================================================
  await t.test('Test 4: AI Fault Tolerance handles malformed JSON (502), Rate Limit (429), and Timeout (504)', async () => {
    // 1. Invalid JSON (502)
    const malformedProvider = new MockAIProvider({ customResponse: 'Bukan format JSON { invalid: ' });
    setGlobalAIProvider(malformedProvider);

    const res502 = await generateRoute.POST(
      createJsonRequest('http://localhost/api/portfolios/generate', 'POST', token1, {})
    );
    assert.equal(res502.status, 502);
    const json502 = await res502.json();
    assert.match(json502.message, /format JSON yang valid/i);

    // 2. Rate limit (429)
    const rateLimitProvider = new MockAIProvider({ shouldFail: true, failureStatus: 429 });
    setGlobalAIProvider(rateLimitProvider);

    const res429 = await generateRoute.POST(
      createJsonRequest('http://localhost/api/portfolios/generate', 'POST', token1, {})
    );
    assert.equal(res429.status, 429);
    const json429 = await res429.json();
    assert.match(json429.message, /rate limit/i);

    // 3. Timeout (504)
    const timeoutProvider = new MockAIProvider({ shouldFail: true, failureStatus: 504 });
    setGlobalAIProvider(timeoutProvider);

    const res504 = await generateRoute.POST(
      createJsonRequest('http://localhost/api/portfolios/generate', 'POST', token1, {})
    );
    assert.equal(res504.status, 504);
    const json504 = await res504.json();
    assert.match(json504.message, /batas waktu/i);
  });

  // =========================================================================
  // TEST GROUP 5: SLUG VALIDATION & RESERVED WORDS (400)
  // =========================================================================
  await t.test('Test 5: Slug validation rejects illegal patterns, lengths, and reserved words', async () => {
    const invalidSlugs = [
      'ab',                       // Terlalu pendek (< 3)
      'ahmad_fauzi',              // Underscore tidak diizinkan
      'ahmad--fauzi',             // Double hyphen tidak diizinkan
      '-ahmad-fauzi',             // Leading hyphen
      'ahmad-fauzi-',             // Trailing hyphen
      'AhmadFauzi',               // Huruf besar
      'admin',                    // Reserved word
      'api',                      // Reserved word
      'dashboard',                // Reserved word
      'portfolio',                // Reserved word
    ];

    for (const badSlug of invalidSlugs) {
      const payload = {
        title: 'Portofolio Uji',
        slug: badSlug,
      };
      const res = await portfoliosRoute.POST(
        createJsonRequest('http://localhost/api/portfolios', 'POST', token1, payload)
      );
      assert.equal(res.status, 400, `Slug '${badSlug}' must be rejected with 400`);
      const body = await res.json();
      assert.ok(body.errors || body.message);
    }
  });

  // =========================================================================
  // TEST GROUP 6: OWNERSHIP & SECURITY VALIDATIONS (CROSS-USER INJECTION)
  // =========================================================================
  await t.test('Test 6: Cross-user injection of career target, projects, and skills is rejected (400)', async () => {
    // 1. Cross-user career target injection: User 1 mencoba memakai career_target milik User 2
    const resCrossTarget = await portfoliosRoute.POST(
      createJsonRequest('http://localhost/api/portfolios', 'POST', token1, {
        title: 'Portofolio Hack Target',
        slug: 'u1-hack-target',
        career_target_id: u2TargetId, // Milik User 2!
      })
    );
    assert.equal(resCrossTarget.status, 400);
    const bodyTarget = await resCrossTarget.json();
    assert.match(bodyTarget.message, /bukan milik Anda/i);

    // 2. Cross-user project injection: User 1 mencoba memakai project milik User 2
    const resCrossProject = await portfoliosRoute.POST(
      createJsonRequest('http://localhost/api/portfolios', 'POST', token1, {
        title: 'Portofolio Hack Project',
        slug: 'u1-hack-project',
        projects: [
          { project_id: u2ProjectId, display_order: 1 }, // Milik User 2!
        ],
      })
    );
    assert.equal(resCrossProject.status, 400);
    const bodyProj = await resCrossProject.json();
    assert.match(bodyProj.message, /bukan milik Anda/i);

    // 3. Skill status validation: User 1 mencoba menyisipkan skill needs_review atau rejected
    const resSkillNeedsReview = await portfoliosRoute.POST(
      createJsonRequest('http://localhost/api/portfolios', 'POST', token1, {
        title: 'Portofolio Hack Skill',
        slug: 'u1-hack-skill',
        skills: [
          { skill_id: u1SkillIdNeedsReview, display_order: 1 }, // Status needs_review!
        ],
      })
    );
    assert.equal(resSkillNeedsReview.status, 400);
    const bodySkill = await resSkillNeedsReview.json();
    assert.match(bodySkill.message, /belum berstatus aktif/i);
  });

  // =========================================================================
  // TEST GROUP 7: ATOMIC SAVE PORTFOLIO & PRIVATE DEFAULT (201)
  // =========================================================================
  let createdPortfolioId = null;

  await t.test('Test 7: POST /api/portfolios saves portfolio atomically with private default (is_published = false)', async () => {
    const payload = {
      title: 'Portofolio Profesional Ahmad',
      summary: 'Ringkasan komprehensif keahlian web dan performa database.',
      custom_bio: 'Pengembang yang fokus pada clean code.',
      slug: 'ahmad-fauzi-official',
      career_target_id: u1TargetId,
      public_email: 'ahmad.public@test.local',
      github_url: 'https://github.com/ahmad-test',
      linkedin_url: 'https://linkedin.com/in/ahmad-test',
      website_url: 'https://ahmad.test.local',
      // is_published tidak disertakan -> harus default ke false!
      projects: [
        {
          project_id: u1ProjectId1,
          display_order: 1,
          is_featured: true,
          custom_description: 'Kontribusi backend dan skema MySQL proyek 1.',
        },
        {
          project_id: u1ProjectId2,
          display_order: 2,
          is_featured: false,
          custom_description: 'Optimasi performa dashboard proyek 2.',
        },
      ],
      skills: [
        { skill_id: u1SkillId1, display_order: 1, is_featured: true },
        { skill_id: u1SkillId2, display_order: 2, is_featured: true },
      ],
    };

    const res = await portfoliosRoute.POST(
      createJsonRequest('http://localhost/api/portfolios', 'POST', token1, payload)
    );
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.status, 'success');

    const port = body.data;
    assert.ok(port.id);
    createdPortfolioId = port.id;
    assert.equal(port.user_id, user1.id);
    assert.equal(port.title, 'Portofolio Profesional Ahmad');
    assert.equal(port.slug, 'ahmad-fauzi-official');
    assert.equal(port.is_published, false, 'Default is_published must be false');
    assert.equal(port.career_target.id, u1TargetId);

    // Periksa relasi proyek
    assert.equal(port.projects.length, 2);
    assert.equal(port.projects[0].project_id, u1ProjectId1);
    assert.equal(port.projects[0].custom_description, 'Kontribusi backend dan skema MySQL proyek 1.');
    assert.equal(port.projects[0].display_description, 'Kontribusi backend dan skema MySQL proyek 1.');
    assert.equal(port.projects[0].is_featured, true);
    assert.equal(port.projects[0].evidences.length, 1);

    // Periksa relasi skill (live data verified)
    assert.equal(port.skills.length, 2);
    assert.equal(port.skills[0].skill_id, u1SkillId1);
    assert.equal(port.skills[0].name, 'JavaScript');
    assert.equal(port.skills[0].proficiency_level, 'intermediate');
    assert.equal(port.skills[0].score, 80);
  });

  // =========================================================================
  // TEST GROUP 8: SINGLE PORTFOLIO PER USER & DUPLICATE SLUG (409)
  // =========================================================================
  await t.test('Test 8: Prevents creating second portfolio for same user and rejects duplicate slug across users (409)', async () => {
    // 1. User 1 mencoba membuat portofolio kedua -> 409 Conflict
    const resSecond = await portfoliosRoute.POST(
      createJsonRequest('http://localhost/api/portfolios', 'POST', token1, {
        title: 'Portofolio Kedua User 1',
        slug: 'ahmad-kedua',
      })
    );
    assert.equal(resSecond.status, 409);
    const bodySecond = await resSecond.json();
    assert.match(bodySecond.message, /sudah memiliki portofolio/i);

    // 2. User 2 mencoba membuat portofolio dengan slug milik User 1 ('ahmad-fauzi-official') -> 409 Conflict
    const resDupSlug = await portfoliosRoute.POST(
      createJsonRequest('http://localhost/api/portfolios', 'POST', token2, {
        title: 'Portofolio User 2 Duplikat Slug',
        slug: 'ahmad-fauzi-official', // Sudah terpakai oleh User 1!
      })
    );
    assert.equal(resDupSlug.status, 409);
    const bodyDup = await resDupSlug.json();
    assert.match(bodyDup.message, /sudah digunakan/i);
  });

  // =========================================================================
  // TEST GROUP 9: GET PORTFOLIO & OWNERSHIP ISOLATION (404)
  // =========================================================================
  await t.test('Test 9: GET /api/portfolios returns user portfolio, and cross-user detail access returns 404', async () => {
    // 1. User 1 memanggil GET /api/portfolios -> sukses mengembalikan portofolio miliknya
    const resU1 = await portfoliosRoute.GET(
      createJsonRequest('http://localhost/api/portfolios', 'GET', token1)
    );
    assert.equal(resU1.status, 200);
    const bodyU1 = await resU1.json();
    assert.equal(bodyU1.data.id, createdPortfolioId);

    // 2. User 2 memanggil GET /api/portfolios -> sukses mengembalikan data: null (karena belum punya)
    const resU2 = await portfoliosRoute.GET(
      createJsonRequest('http://localhost/api/portfolios', 'GET', token2)
    );
    assert.equal(resU2.status, 200);
    const bodyU2 = await resU2.json();
    assert.equal(bodyU2.data, null);

    // 3. User 1 memanggil GET /api/portfolios/[id] miliknya -> 200
    const resDetailU1 = await portfolioDetailRoute.GET(
      createJsonRequest(`http://localhost/api/portfolios/${createdPortfolioId}`, 'GET', token1),
      { params: Promise.resolve({ id: String(createdPortfolioId) }) }
    );
    assert.equal(resDetailU1.status, 200);

    // 4. User 2 mencoba mengakses GET /api/portfolios/[id] milik User 1 -> 404 Not Found
    const resCrossDetail = await portfolioDetailRoute.GET(
      createJsonRequest(`http://localhost/api/portfolios/${createdPortfolioId}`, 'GET', token2),
      { params: Promise.resolve({ id: String(createdPortfolioId) }) }
    );
    assert.equal(resCrossDetail.status, 404);
  });

  // =========================================================================
  // TEST GROUP 10: UPDATE PORTFOLIO & SOURCE DATA INTEGRITY (PUT)
  // =========================================================================
  await t.test('Test 10: PUT /api/portfolios/[id] updates portfolio and preserves original project/skill data', async () => {
    // Catat deskripsi asli proyek di tabel projects
    const [origProjRows] = await pool.query('SELECT description FROM projects WHERE id = ?', [u1ProjectId1]);
    const originalProjectDescription = origProjRows[0].description;

    // Update portofolio: ganti judul, publish, dan ubah custom_description
    const updatePayload = {
      title: 'Portofolio Ahmad (Revisi)',
      is_published: true,
      projects: [
        {
          project_id: u1ProjectId1,
          display_order: 1,
          is_featured: true,
          custom_description: 'Deskripsi kustom revisi hanya untuk portofolio.',
        },
      ],
    };

    const res = await portfolioDetailRoute.PUT(
      createJsonRequest(`http://localhost/api/portfolios/${createdPortfolioId}`, 'PUT', token1, updatePayload),
      { params: Promise.resolve({ id: String(createdPortfolioId) }) }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    const updated = body.data;
    assert.equal(updated.title, 'Portofolio Ahmad (Revisi)');
    assert.equal(updated.is_published, true);
    assert.equal(updated.projects.length, 1);
    assert.equal(updated.projects[0].custom_description, 'Deskripsi kustom revisi hanya untuk portofolio.');

    // VERIFIKASI INTEGRITAS: Periksa bahwa tabel `projects` asli sama sekali TIDAK BERUBAH
    const [checkProjRows] = await pool.query('SELECT description FROM projects WHERE id = ?', [u1ProjectId1]);
    assert.equal(
      checkProjRows[0].description,
      originalProjectDescription,
      'Original projects.description must remain strictly untouched after portfolio edit'
    );

    // Cross-user PUT: User 2 mencoba mengedit portofolio User 1 -> 404
    const resCrossPut = await portfolioDetailRoute.PUT(
      createJsonRequest(`http://localhost/api/portfolios/${createdPortfolioId}`, 'PUT', token2, { title: 'Hack' }),
      { params: Promise.resolve({ id: String(createdPortfolioId) }) }
    );
    assert.equal(resCrossPut.status, 404);
  });

  // =========================================================================
  // TEST GROUP 11: DELETE PORTFOLIO & SOURCE DATA INTEGRITY (DELETE)
  // =========================================================================
  await t.test('Test 11: DELETE /api/portfolios/[id] cascades relations but preserves original projects and skills', async () => {
    // Cross-user DELETE: User 2 mencoba menghapus portofolio User 1 -> 404
    const resCrossDel = await portfolioDetailRoute.DELETE(
      createJsonRequest(`http://localhost/api/portfolios/${createdPortfolioId}`, 'DELETE', token2),
      { params: Promise.resolve({ id: String(createdPortfolioId) }) }
    );
    assert.equal(resCrossDel.status, 404);

    // User 1 menghapus portofolio miliknya -> 200 OK
    const resDel = await portfolioDetailRoute.DELETE(
      createJsonRequest(`http://localhost/api/portfolios/${createdPortfolioId}`, 'DELETE', token1),
      { params: Promise.resolve({ id: String(createdPortfolioId) }) }
    );
    assert.equal(resDel.status, 200);

    // Verifikasi relasi portofolio terhapus
    const [pRows] = await pool.query('SELECT COUNT(*) as c FROM portfolios WHERE id = ?', [createdPortfolioId]);
    assert.equal(pRows[0].c, 0);

    const [ppRows] = await pool.query('SELECT COUNT(*) as c FROM portfolio_projects WHERE portfolio_id = ?', [createdPortfolioId]);
    assert.equal(ppRows[0].c, 0);

    const [psRows] = await pool.query('SELECT COUNT(*) as c FROM portfolio_skills WHERE portfolio_id = ?', [createdPortfolioId]);
    assert.equal(psRows[0].c, 0);

    // VERIFIKASI INTEGRITAS: Tabel `projects` dan `user_skills` tetap ada dan utuh
    const [u1ProjCheck] = await pool.query('SELECT COUNT(*) as c FROM projects WHERE user_id = ?', [user1.id]);
    assert.equal(u1ProjCheck[0].c, 2, 'User 1 projects must NOT be deleted when portfolio is deleted');

    const [u1SkillCheck] = await pool.query('SELECT COUNT(*) as c FROM user_skills WHERE user_id = ?', [user1.id]);
    assert.equal(u1SkillCheck[0].c, 4, 'User 1 user_skills must NOT be deleted when portfolio is deleted');
  });
});

