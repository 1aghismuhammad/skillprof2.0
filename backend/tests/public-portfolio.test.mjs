import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../lib/db.js';
import { signToken } from '../lib/auth.js';

// Route handlers
import * as publicPortfolioRoute from '../app/api/public/portfolios/[slug]/route.js';
import * as portfoliosRoute from '../app/api/portfolios/route.js';
import * as portfolioDetailRoute from '../app/api/portfolios/[id]/route.js';
import * as sharingRoute from '../app/api/portfolios/[id]/sharing/route.js';

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

test('Stage 11C: Public Portfolio & Privacy Sharing Settings Test Suite', async (t) => {
  let user1 = null;
  let user2 = null;
  let token1 = null;
  let token2 = null;

  let u1ProjectId1 = null;
  let u1ProjectId2 = null;
  let u2ProjectId = null;

  let u1SkillId1 = null; // Active (JavaScript)
  let u1SkillId2 = null; // Active (React)
  let u1SkillIdNeedsReview = null; // Needs review (Next.js)
  let u1SkillIdRejected = null; // Rejected (MySQL)

  let u1TargetId = null;
  let u1PortfolioId = null;

  const timestamp = Date.now();
  const u1Slug = `ahmad-public-${timestamp}`;
  const u2Slug = `budi-public-${timestamp}`;

  // Teardown hook
  t.after(async () => {
    if (user1) {
      await pool.query('DELETE FROM projects WHERE user_id = ?', [user1.id]);
      await pool.query('DELETE FROM users WHERE id = ?', [user1.id]);
    }
    if (user2) {
      await pool.query('DELETE FROM projects WHERE user_id = ?', [user2.id]);
      await pool.query('DELETE FROM users WHERE id = ?', [user2.id]);
    }
  });

  // 1. Setup isolated test users
  const [u1] = await pool.query(
    'INSERT INTO users (name, email, password_hash, bio, avatar_url) VALUES (?, ?, ?, ?, ?)',
    ['Ahmad Public Test', `ahmad_pub_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456', 'Pengembang Web Fullstack', 'https://avatars.test.local/ahmad.png']
  );
  user1 = { id: u1.insertId, name: 'Ahmad Public Test', email: `ahmad_pub_${timestamp}@test.local` };
  token1 = await signToken(user1);

  const [u2] = await pool.query(
    'INSERT INTO users (name, email, password_hash, bio, avatar_url) VALUES (?, ?, ?, ?, ?)',
    ['Budi Public Test', `budi_pub_${timestamp}@test.local`, '$2a$10$abcdefghijklmnopqrstuvwxyz123456', 'Mobile App Specialist', 'https://avatars.test.local/budi.png']
  );
  user2 = { id: u2.insertId, name: 'Budi Public Test', email: `budi_pub_${timestamp}@test.local` };
  token2 = await signToken(user2);

  // 2. Setup Proyek untuk User 1
  const [p1] = await pool.query(
    `INSERT INTO projects (user_id, title, description, repository_url, live_url) 
     VALUES (?, ?, ?, ?, ?)`,
    [user1.id, 'Sistem Informasi Akademik', 'Deskripsi asli SIAKAD.', 'https://github.com/ahmad/siakad', 'https://siakad.test.local']
  );
  u1ProjectId1 = p1.insertId;

  await pool.query(
    `INSERT INTO project_evidences (project_id, title, evidence_type, url)
     VALUES (?, 'Dokumentasi REST API', 'documentation', 'https://docs.siakad.test.local')`,
    [u1ProjectId1]
  );

  const [p2] = await pool.query(
    `INSERT INTO projects (user_id, title, description, repository_url, live_url) 
     VALUES (?, ?, ?, ?, ?)`,
    [user1.id, 'Dashboard Monitoring IoT', 'Deskripsi asli IoT.', 'https://github.com/ahmad/iot', 'https://iot.test.local']
  );
  u1ProjectId2 = p2.insertId;

  // Setup Proyek untuk User 2
  const [pU2] = await pool.query(
    `INSERT INTO projects (user_id, title, description, repository_url, live_url) 
     VALUES (?, ?, ?, ?, ?)`,
    [user2.id, 'Proyek Rahasia User 2', 'Deskripsi rahasia.', 'https://github.com/budi/secret', 'https://secret.test.local']
  );
  u2ProjectId = pU2.insertId;

  // 3. Setup Skill untuk User 1
  // Skill 1: JavaScript (active, intermediate, 85)
  await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, 1, "intermediate", 85, "active")',
    [user1.id]
  );
  u1SkillId1 = 1;

  // Skill 2: React (active, advanced, 92)
  await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, 2, "advanced", 92, "active")',
    [user1.id]
  );
  u1SkillId2 = 2;

  // Skill 5: Next.js (needs_review)
  await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, 5, "intermediate", 75, "needs_review")',
    [user1.id]
  );
  u1SkillIdNeedsReview = 5;

  // Skill 7: MySQL (rejected)
  await pool.query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) VALUES (?, 7, "beginner", 50, "rejected")',
    [user1.id]
  );
  u1SkillIdRejected = 7;

  // 4. Setup Career Target untuk User 1
  const [ct1] = await pool.query(
    'INSERT INTO career_targets (user_id, title, description) VALUES (?, "Senior Full-Stack Developer", "Target karier impian")',
    [user1.id]
  );
  u1TargetId = ct1.insertId;

  // 5. Buat Portofolio Awal User 1 (Default: is_published = false)
  const initialPayload = {
    title: 'Portofolio Profesional Ahmad',
    summary: 'Pengembang fullstack berorientasi performa tinggi.',
    custom_bio: 'Menyukai arsitektur clean code dan cloud infrastructure.',
    slug: u1Slug,
    career_target_id: u1TargetId,
    // public_email sengaja dikosongkan untuk uji default privacy
    projects: [
      {
        project_id: u1ProjectId1,
        display_order: 1,
        custom_description: 'Merancang arsitektur backend REST API dan skema database.',
        is_featured: true,
      },
      {
        project_id: u1ProjectId2,
        display_order: 2,
        custom_description: 'Membangun antarmuka real-time dashboard.',
        is_featured: false,
      },
    ],
    skills: [
      { skill_id: u1SkillId1, display_order: 1 },
      { skill_id: u1SkillId2, display_order: 2 },
    ],
  };

  const createRes = await portfoliosRoute.POST(
    createJsonRequest('http://localhost/api/portfolios', 'POST', token1, initialPayload)
  );
  assert.equal(createRes.status, 201);
  const createdJson = await createRes.json();
  u1PortfolioId = createdJson.data.id;

  // =========================================================================
  // TEST 1: PUBLIC ENDPOINT ACCESSIBLE WITHOUT TOKEN
  // =========================================================================
  await t.test('Test 1: Public endpoint can be accessed without token and without cookies', async () => {
    // Akses tanpa header Authorization dan tanpa cookie
    const res = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    // Karena portofolio masih berstatus privat (is_published = false), mengembalikan 404
    assert.equal(res.status, 404, 'Must return 404 for private portfolio without throwing 401');
    const body = await res.json();
    assert.equal(body.status, 'error');
    assert.match(body.message, /tidak ditemukan/i);
  });

  // =========================================================================
  // TEST 2 & 3: PRIVATE PORTFOLIO RETURNS 404; PUBLISHED RETURNS 200
  // =========================================================================
  await t.test('Test 2 & 3: Private returns 404; after publishing, returns 200 with structured data', async () => {
    // 1. Verifikasi privat menghasilkan 404
    const resPrivate = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    assert.equal(resPrivate.status, 404);

    // 2. Publish portofolio via PATCH /api/portfolios/[id]/sharing
    const pubRes = await sharingRoute.PATCH(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'PATCH', token1, {
        is_published: true,
      }),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );
    assert.equal(pubRes.status, 200);
    const pubBody = await pubRes.json();
    assert.equal(pubBody.data.is_published, true);

    // 3. Akses kembali endpoint publik tanpa token -> Sekarang 200 OK
    const resPub = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    assert.equal(resPub.status, 200);
    const pubData = await resPub.json();
    assert.equal(pubData.status, 'success');

    const p = pubData.data;
    assert.equal(p.title, 'Portofolio Profesional Ahmad');
    assert.equal(p.slug, u1Slug);
    assert.equal(p.summary, 'Pengembang fullstack berorientasi performa tinggi.');
    assert.equal(p.author.name, 'Ahmad Public Test');
    assert.equal(p.author.avatar_url, 'https://avatars.test.local/ahmad.png');
    assert.equal(p.career_target.title, 'Senior Full-Stack Developer');
    assert.equal(p.projects.length, 2);
    assert.equal(p.skills.length, 2);
  });

  // =========================================================================
  // TEST 4: NON-EXISTENT SLUG RETURNS 404 (GENERIC AND IDENTICAL TO PRIVATE)
  // =========================================================================
  await t.test('Test 4: Non-existent slug returns 404 with identical generic error message', async () => {
    const res = await publicPortfolioRoute.GET(
      createJsonRequest('http://localhost/api/public/portfolios/slug-palsu-pasti-tidak-ada-12345'),
      { params: Promise.resolve({ slug: 'slug-palsu-pasti-tidak-ada-12345' }) }
    );
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.status, 'error');
    assert.equal(body.message, 'Portofolio publik tidak ditemukan.');
  });

  // =========================================================================
  // TEST 5: ACCOUNT EMAIL & SENSITIVE DATA NEVER LEAK
  // =========================================================================
  await t.test('Test 5: Account email, password hash, and user_id NEVER leak in public response', async () => {
    const res = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    const text = await res.text();

    // Verifikasi bahwa string email akun pengguna TIDAK MUNCUL sama sekali dalam response
    assert.ok(!text.includes(user1.email), `Account email '${user1.email}' must NEVER appear in public response`);
    assert.ok(!text.includes('password_hash'), 'password_hash must never appear in response');
    assert.ok(!text.includes('$2a$10$'), 'Password hash content must never appear in response');

    const json = JSON.parse(text);
    // Verifikasi bahwa user_id tidak diekspos di root atau author
    assert.equal(json.data.user_id, undefined);
    assert.equal(json.data.author.user_id, undefined);
    assert.equal(json.data.author.email, undefined);
  });

  // =========================================================================
  // TEST 6 & 7: PUBLIC EMAIL PRIVACY (DEFAULT NULL, VISIBLE WHEN SET)
  // =========================================================================
  await t.test('Test 6 & 7: Public email is null by default; appears only when explicitly set', async () => {
    // 1. Secara default, public_email adalah null
    const res1 = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    const json1 = await res1.json();
    assert.equal(json1.data.contact.public_email, null);

    // 2. Set public_email via sharing endpoint
    const setRes = await sharingRoute.PATCH(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'PATCH', token1, {
        public_email: 'contact.ahmad@developer.org',
        github_url: 'https://github.com/ahmad-pub',
        linkedin_url: 'https://linkedin.com/in/ahmad-pub',
        website_url: 'https://ahmad.dev',
      }),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );
    assert.equal(setRes.status, 200);

    // 3. Verifikasi public_email dan social URLs sekarang muncul di endpoint publik
    const res2 = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    const json2 = await res2.json();
    assert.equal(json2.data.contact.public_email, 'contact.ahmad@developer.org');
    assert.equal(json2.data.contact.github_url, 'https://github.com/ahmad-pub');
    assert.equal(json2.data.contact.linkedin_url, 'https://linkedin.com/in/ahmad-pub');
    assert.equal(json2.data.contact.website_url, 'https://ahmad.dev');

    // 4. Hapus public_email dengan null
    await sharingRoute.PATCH(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'PATCH', token1, {
        public_email: null,
      }),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );

    const res3 = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    const json3 = await res3.json();
    assert.equal(json3.data.contact.public_email, null);
  });

  // =========================================================================
  // TEST 8 & 9: ONLY ACTIVE SKILLS APPEAR; NEEDS_REVIEW & REJECTED EXCLUDED
  // =========================================================================
  await t.test('Test 8 & 9: Only active skills appear; needs_review and rejected are excluded', async () => {
    // Sisipkan entri langsung ke portfolio_skills untuk skill needs_review dan rejected
    await pool.query(
      'INSERT INTO portfolio_skills (portfolio_id, skill_id, display_order) VALUES (?, ?, 3)',
      [u1PortfolioId, u1SkillIdNeedsReview]
    );
    await pool.query(
      'INSERT INTO portfolio_skills (portfolio_id, skill_id, display_order) VALUES (?, ?, 4)',
      [u1PortfolioId, u1SkillIdRejected]
    );

    // Ambil data publik
    const res = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    const skills = json.data.skills;

    // HANYA skill berstatus 'active' yang boleh muncul (JavaScript dan React)
    const skillNames = skills.map((s) => s.name);
    assert.ok(skillNames.includes('JavaScript'), 'Active skill JavaScript must appear');
    assert.ok(skillNames.includes('React'), 'Active skill React must appear');
    assert.ok(!skillNames.includes('Next.js'), 'needs_review skill Next.js must NOT appear in public portfolio');
    assert.ok(!skillNames.includes('MySQL'), 'rejected skill MySQL must NOT appear in public portfolio');

    // Bersihkan entri suntikan
    await pool.query('DELETE FROM portfolio_skills WHERE portfolio_id = ? AND skill_id IN (?, ?)', [
      u1PortfolioId,
      u1SkillIdNeedsReview,
      u1SkillIdRejected,
    ]);
  });

  // =========================================================================
  // TEST 10: NON-OWNED PROJECTS DO NOT APPEAR
  // =========================================================================
  await t.test('Test 10: Projects not belonging to the portfolio owner do NOT appear', async () => {
    // Suntikkan relasi ke proyek milik User 2
    await pool.query(
      'INSERT INTO portfolio_projects (portfolio_id, project_id, display_order) VALUES (?, ?, 99)',
      [u1PortfolioId, u2ProjectId]
    );

    const res = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    const projects = json.data.projects;

    const projectTitles = projects.map((p) => p.title);
    assert.ok(!projectTitles.includes('Proyek Rahasia User 2'), 'Non-owned project must NOT appear in public portfolio');

    // Bersihkan relasi suntikan
    await pool.query('DELETE FROM portfolio_projects WHERE portfolio_id = ? AND project_id = ?', [
      u1PortfolioId,
      u2ProjectId,
    ]);
  });

  // =========================================================================
  // TEST 11: CROSS-USER SHARING SETTINGS PROTECTION (404 NOT FOUND)
  // =========================================================================
  await t.test('Test 11: Cross-user protection: User 2 cannot inspect or mutate User 1 sharing settings', async () => {
    // 1. User 2 mencoba GET sharing settings User 1 -> 404
    const getRes = await sharingRoute.GET(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'GET', token2),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );
    assert.equal(getRes.status, 404);

    // 2. User 2 mencoba PATCH sharing settings User 1 -> 404
    const patchRes = await sharingRoute.PATCH(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'PATCH', token2, {
        is_published: false,
      }),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );
    assert.equal(patchRes.status, 404);

    // 3. Tanpa token autentikasi -> 401
    const anonRes = await sharingRoute.GET(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'GET'),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );
    assert.equal(anonRes.status, 401);
  });

  // =========================================================================
  // TEST 12: OWNER CAN TOGGLE PUBLISH AND UNPUBLISH FREELY
  // =========================================================================
  await t.test('Test 12: Owner can toggle publish and unpublish; public endpoint adapts immediately', async () => {
    // Unpublish
    const unpub = await sharingRoute.PATCH(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'PATCH', token1, {
        is_published: false,
      }),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );
    assert.equal(unpub.status, 200);

    const check1 = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    assert.equal(check1.status, 404, 'Must return 404 after unpublishing');

    // Re-publish
    const repub = await sharingRoute.PATCH(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'PATCH', token1, {
        is_published: true,
      }),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );
    assert.equal(repub.status, 200);

    const check2 = await publicPortfolioRoute.GET(
      createJsonRequest(`http://localhost/api/public/portfolios/${u1Slug}`),
      { params: Promise.resolve({ slug: u1Slug }) }
    );
    assert.equal(check2.status, 200, 'Must return 200 after re-publishing');
  });

  // =========================================================================
  // TEST 13 & 14: SLUG COLLISION (409) AND INVALID SLUG (400) IN SHARING SETTINGS
  // =========================================================================
  await t.test('Test 13 & 14: Slug collision returns 409; invalid slugs return 400', async () => {
    // 1. Buat portofolio untuk User 2
    const u2Create = await portfoliosRoute.POST(
      createJsonRequest('http://localhost/api/portfolios', 'POST', token2, {
        title: 'Portofolio Budi',
        slug: u2Slug,
        is_published: true,
      })
    );
    assert.equal(u2Create.status, 201);
    const u2PortId = (await u2Create.json()).data.id;

    // 2. User 2 mencoba mengganti slug menjadi slug milik User 1 -> 409 Conflict
    const conflictRes = await sharingRoute.PATCH(
      createJsonRequest(`http://localhost/api/portfolios/${u2PortId}/sharing`, 'PATCH', token2, {
        slug: u1Slug, // Sudah dipakai User 1!
      }),
      { params: Promise.resolve({ id: String(u2PortId) }) }
    );
    assert.equal(conflictRes.status, 409);
    const conflictJson = await conflictRes.json();
    assert.match(conflictJson.message, /sudah digunakan/i);

    // 3. User 2 mencoba mengganti slug dengan format tidak valid (huruf besar, reserved word) -> 400 Bad Request
    const badSlugs = ['BudiPortfolio', 'admin', 'api', '-budi-', 'bu'];
    for (const bs of badSlugs) {
      const badRes = await sharingRoute.PATCH(
        createJsonRequest(`http://localhost/api/portfolios/${u2PortId}/sharing`, 'PATCH', token2, {
          slug: bs,
        }),
        { params: Promise.resolve({ id: String(u2PortId) }) }
      );
      assert.equal(badRes.status, 400, `Slug '${bs}' must be rejected with 400`);
    }

    // Bersihkan portofolio User 2
    await portfolioDetailRoute.DELETE(
      createJsonRequest(`http://localhost/api/portfolios/${u2PortId}`, 'DELETE', token2),
      { params: Promise.resolve({ id: String(u2PortId) }) }
    );
  });

  // =========================================================================
  // TEST 15: SOCIAL LINKS VALIDATION & PUBLIC ACCESS INTEGRITY
  // =========================================================================
  await t.test('Test 15: Invalid URLs and invalid email format in sharing settings are rejected with 400', async () => {
    // Invalid email
    const badEmailRes = await sharingRoute.PATCH(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'PATCH', token1, {
        public_email: 'bukan-sebuah-email',
      }),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );
    assert.equal(badEmailRes.status, 400);

    // Invalid URL (bukan HTTP/HTTPS)
    const badUrlRes = await sharingRoute.PATCH(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'PATCH', token1, {
        github_url: 'javascript:alert("hack")',
      }),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );
    assert.equal(badUrlRes.status, 400);

    // Payload kosong tanpa properti yang dapat diubah -> 400
    const emptyRes = await sharingRoute.PATCH(
      createJsonRequest(`http://localhost/api/portfolios/${u1PortfolioId}/sharing`, 'PATCH', token1, {}),
      { params: Promise.resolve({ id: String(u1PortfolioId) }) }
    );
    assert.equal(emptyRes.status, 400);
  });
});

