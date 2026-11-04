import pool from '@/lib/db';

/**
 * Mengambil data portofolio lengkap milik pengguna yang sedang login.
 * Menghubungkan proyek dan bukti nyata, serta HANYA menampilkan skill berstatus 'active'.
 *
 * @param {number} userId - ID Pengguna
 * @param {object} [db] - Instance pool atau connection database
 * @returns {Promise<object|null>} Objek portofolio atau null jika belum ada
 */
export async function getUserPortfolio(userId, db = pool) {
  // 1. Ambil data utama portofolio milik user
  const [portfolioRows] = await db.query(
    `SELECT p.id,
            p.user_id,
            p.career_target_id,
            p.title,
            p.summary,
            p.custom_bio,
            p.slug,
            p.public_email,
            p.github_url,
            p.linkedin_url,
            p.website_url,
            p.is_published,
            p.created_at,
            p.updated_at,
            ct.title AS career_target_title,
            ct.description AS career_target_description
     FROM portfolios p
     LEFT JOIN career_targets ct ON p.career_target_id = ct.id
     WHERE p.user_id = ?
     LIMIT 1`,
    [userId]
  );

  if (portfolioRows.length === 0) {
    return null;
  }

  const portfolio = portfolioRows[0];

  // 2. Ambil proyek yang dipilih untuk portofolio beserta data asli proyek
  const [projectRows] = await db.query(
    `SELECT pp.id AS portfolio_project_id,
            pp.project_id,
            pp.display_order,
            pp.custom_description,
            pp.is_featured,
            pp.created_at AS added_to_portfolio_at,
            p.title AS project_title,
            p.description AS project_original_description,
            p.repository_url,
            p.live_url,
            p.start_date,
            p.end_date
     FROM portfolio_projects pp
     JOIN projects p ON pp.project_id = p.id
     WHERE pp.portfolio_id = ?
     ORDER BY pp.display_order ASC, pp.id ASC`,
    [portfolio.id]
  );

  // Ambil evidences untuk setiap proyek
  const projectIds = projectRows.map((r) => r.project_id);
  const evidencesMap = new Map();

  if (projectIds.length > 0) {
    const [evidenceRows] = await db.query(
      `SELECT pe.id,
              pe.project_id,
              pe.title,
              pe.evidence_type,
              pe.url,
              pe.created_at
       FROM project_evidences pe
       WHERE pe.project_id IN (?)
       ORDER BY pe.id ASC`,
      [projectIds]
    );

    for (const ev of evidenceRows) {
      if (!evidencesMap.has(ev.project_id)) {
        evidencesMap.set(ev.project_id, []);
      }
      evidencesMap.get(ev.project_id).push({
        id: ev.id,
        title: ev.title,
        evidence_type: ev.evidence_type,
        url: ev.url,
        created_at: ev.created_at,
      });
    }
  }

  const formattedProjects = projectRows.map((pr) => ({
    id: pr.portfolio_project_id,
    project_id: pr.project_id,
    title: pr.project_title,
    custom_description: pr.custom_description,
    original_description: pr.project_original_description,
    display_description: pr.custom_description || pr.project_original_description,
    is_featured: Boolean(pr.is_featured),
    display_order: pr.display_order,
    repository_url: pr.repository_url,
    live_url: pr.live_url,
    start_date: pr.start_date,
    end_date: pr.end_date,
    evidences: evidencesMap.get(pr.project_id) || [],
  }));

  // 3. Ambil skill yang dipilih untuk portofolio
  // PENTING: Hanya skill dengan status 'active' pada user_skills yang ditampilkan sebagai verified
  const [skillRows] = await db.query(
    `SELECT ps.id AS portfolio_skill_id,
            ps.skill_id,
            ps.display_order,
            ps.is_featured,
            ps.created_at AS added_to_portfolio_at,
            s.name AS skill_name,
            s.category AS skill_category,
            us.proficiency_level,
            us.score,
            us.updated_at AS skill_verified_at
     FROM portfolio_skills ps
     JOIN skills s ON ps.skill_id = s.id
     JOIN user_skills us ON ps.skill_id = us.skill_id AND us.user_id = ?
     WHERE ps.portfolio_id = ? AND us.status = 'active'
     ORDER BY ps.display_order ASC, ps.id ASC`,
    [userId, portfolio.id]
  );

  const formattedSkills = skillRows.map((sk) => ({
    id: sk.portfolio_skill_id,
    skill_id: sk.skill_id,
    name: sk.skill_name,
    category: sk.skill_category,
    proficiency_level: sk.proficiency_level,
    score: sk.score,
    is_featured: Boolean(sk.is_featured),
    display_order: sk.display_order,
    verified_at: sk.skill_verified_at,
  }));

  return {
    id: portfolio.id,
    user_id: portfolio.user_id,
    title: portfolio.title,
    summary: portfolio.summary,
    custom_bio: portfolio.custom_bio,
    slug: portfolio.slug,
    public_email: portfolio.public_email,
    github_url: portfolio.github_url,
    linkedin_url: portfolio.linkedin_url,
    website_url: portfolio.website_url,
    is_published: Boolean(portfolio.is_published),
    career_target: portfolio.career_target_id
      ? {
          id: portfolio.career_target_id,
          title: portfolio.career_target_title,
          description: portfolio.career_target_description,
        }
      : null,
    projects: formattedProjects,
    skills: formattedSkills,
    created_at: portfolio.created_at,
    updated_at: portfolio.updated_at,
  };
}

/**
 * Mengambil detail portofolio berdasarkan ID dengan verifikasi kepemilikan.
 */
export async function getPortfolioById(portfolioId, userId, db = pool) {
  const [rows] = await db.query(
    'SELECT id FROM portfolios WHERE id = ? AND user_id = ? LIMIT 1',
    [portfolioId, userId]
  );

  if (rows.length === 0) {
    return null;
  }

  return getUserPortfolio(userId, db);
}

/**
 * Menyimpan portofolio baru beserta relasi proyek dan skill secara atomik.
 */
export async function savePortfolio(userId, cleanData, db = pool) {
  // 1. Cek apakah user sudah memiliki portofolio (Aturan 1 portofolio per user)
  const [existingUserPortfolio] = await db.query(
    'SELECT id FROM portfolios WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (existingUserPortfolio.length > 0) {
    const error = new Error('Pengguna sudah memiliki portofolio. Silakan perbarui portofolio yang sudah ada.');
    error.status = 409;
    throw error;
  }

  // 2. Cek apakah slug sudah digunakan oleh user lain
  const [existingSlug] = await db.query(
    'SELECT id FROM portfolios WHERE slug = ? LIMIT 1',
    [cleanData.slug]
  );
  if (existingSlug.length > 0) {
    const error = new Error(`Slug '${cleanData.slug}' sudah digunakan oleh pengguna lain.`);
    error.status = 409;
    throw error;
  }

  // 3. Verifikasi kepemilikan career_target_id (jika diisi)
  if (cleanData.career_target_id) {
    const [targetRows] = await db.query(
      'SELECT id FROM career_targets WHERE id = ? AND user_id = ? LIMIT 1',
      [cleanData.career_target_id, userId]
    );
    if (targetRows.length === 0) {
      const error = new Error('Target karier tidak ditemukan atau bukan milik Anda.');
      error.status = 400;
      throw error;
    }
  }

  // 4. Verifikasi kepemilikan semua project_id
  if (cleanData.projects && cleanData.projects.length > 0) {
    const projectIds = cleanData.projects.map((p) => p.project_id);
    const [ownedProjects] = await db.query(
      'SELECT id FROM projects WHERE id IN (?) AND user_id = ?',
      [projectIds, userId]
    );
    if (ownedProjects.length !== projectIds.length) {
      const error = new Error('Satu atau lebih proyek tidak valid atau bukan milik Anda.');
      error.status = 400;
      throw error;
    }
  }

  // 5. Verifikasi bahwa semua skill_id adalah skill AKTIF milik user
  if (cleanData.skills && cleanData.skills.length > 0) {
    const skillIds = cleanData.skills.map((s) => s.skill_id);
    const [activeSkills] = await db.query(
      'SELECT skill_id FROM user_skills WHERE skill_id IN (?) AND user_id = ? AND status = "active"',
      [skillIds, userId]
    );
    if (activeSkills.length !== skillIds.length) {
      const error = new Error('Satu atau lebih skill tidak valid atau belum berstatus aktif pada profil Anda.');
      error.status = 400;
      throw error;
    }
  }

  // 6. Transaksi Database Atomik
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [portfolioResult] = await connection.query(
      `INSERT INTO portfolios (
        user_id,
        career_target_id,
        title,
        summary,
        custom_bio,
        slug,
        public_email,
        github_url,
        linkedin_url,
        website_url,
        is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        cleanData.career_target_id || null,
        cleanData.title,
        cleanData.summary || null,
        cleanData.custom_bio || null,
        cleanData.slug,
        cleanData.public_email || null,
        cleanData.github_url || null,
        cleanData.linkedin_url || null,
        cleanData.website_url || null,
        cleanData.is_published ? 1 : 0,
      ]
    );

    const portfolioId = portfolioResult.insertId;

    // Simpan relasi proyek
    if (cleanData.projects && cleanData.projects.length > 0) {
      for (const pr of cleanData.projects) {
        await connection.query(
          `INSERT INTO portfolio_projects (
            portfolio_id,
            project_id,
            display_order,
            custom_description,
            is_featured
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            portfolioId,
            pr.project_id,
            pr.display_order,
            pr.custom_description || null,
            pr.is_featured ? 1 : 0,
          ]
        );
      }
    }

    // Simpan relasi skill
    if (cleanData.skills && cleanData.skills.length > 0) {
      for (const sk of cleanData.skills) {
        await connection.query(
          `INSERT INTO portfolio_skills (
            portfolio_id,
            skill_id,
            display_order,
            is_featured
          ) VALUES (?, ?, ?, ?)`,
          [
            portfolioId,
            sk.skill_id,
            sk.display_order,
            sk.is_featured ? 1 : 0,
          ]
        );
      }
    }

    await connection.commit();
    return await getUserPortfolio(userId, connection);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Memperbarui portofolio dan mengganti relasi proyek/skill secara atomik.
 */
export async function updatePortfolio(portfolioId, userId, cleanData, db = pool) {
  // 1. Verifikasi keberadaan dan kepemilikan portofolio
  const [existingPortfolio] = await db.query(
    'SELECT id, slug, user_id FROM portfolios WHERE id = ? AND user_id = ? LIMIT 1',
    [portfolioId, userId]
  );
  if (existingPortfolio.length === 0) {
    const error = new Error('Portofolio tidak ditemukan.');
    error.status = 404;
    throw error;
  }

  // 2. Jika slug diubah, pastikan tidak bertabrakan dengan portofolio lain
  if (cleanData.slug && cleanData.slug !== existingPortfolio[0].slug) {
    const [conflictSlug] = await db.query(
      'SELECT id FROM portfolios WHERE slug = ? AND id != ? LIMIT 1',
      [cleanData.slug, portfolioId]
    );
    if (conflictSlug.length > 0) {
      const error = new Error(`Slug '${cleanData.slug}' sudah digunakan oleh pengguna lain.`);
      error.status = 409;
      throw error;
    }
  }

  // 3. Verifikasi career_target_id (jika diubah/diisi)
  if (cleanData.career_target_id !== undefined && cleanData.career_target_id !== null) {
    const [targetRows] = await db.query(
      'SELECT id FROM career_targets WHERE id = ? AND user_id = ? LIMIT 1',
      [cleanData.career_target_id, userId]
    );
    if (targetRows.length === 0) {
      const error = new Error('Target karier tidak ditemukan atau bukan milik Anda.');
      error.status = 400;
      throw error;
    }
  }

  // 4. Verifikasi kepemilikan proyek jika ada array projects
  if (cleanData.projects !== undefined && cleanData.projects.length > 0) {
    const projectIds = cleanData.projects.map((p) => p.project_id);
    const [ownedProjects] = await db.query(
      'SELECT id FROM projects WHERE id IN (?) AND user_id = ?',
      [projectIds, userId]
    );
    if (ownedProjects.length !== projectIds.length) {
      const error = new Error('Satu atau lebih proyek tidak valid atau bukan milik Anda.');
      error.status = 400;
      throw error;
    }
  }

  // 5. Verifikasi skill aktif jika ada array skills
  if (cleanData.skills !== undefined && cleanData.skills.length > 0) {
    const skillIds = cleanData.skills.map((s) => s.skill_id);
    const [activeSkills] = await db.query(
      'SELECT skill_id FROM user_skills WHERE skill_id IN (?) AND user_id = ? AND status = "active"',
      [skillIds, userId]
    );
    if (activeSkills.length !== skillIds.length) {
      const error = new Error('Satu atau lebih skill tidak valid atau belum berstatus aktif pada profil Anda.');
      error.status = 400;
      throw error;
    }
  }

  // 6. Transaksi Database Atomik
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Bangun dynamic UPDATE untuk kolom-kolom portfolios
    const updateFields = [];
    const updateValues = [];

    if (cleanData.title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(cleanData.title);
    }
    if (cleanData.slug !== undefined) {
      updateFields.push('slug = ?');
      updateValues.push(cleanData.slug);
    }
    if (cleanData.summary !== undefined) {
      updateFields.push('summary = ?');
      updateValues.push(cleanData.summary);
    }
    if (cleanData.custom_bio !== undefined) {
      updateFields.push('custom_bio = ?');
      updateValues.push(cleanData.custom_bio);
    }
    if (cleanData.career_target_id !== undefined) {
      updateFields.push('career_target_id = ?');
      updateValues.push(cleanData.career_target_id);
    }
    if (cleanData.public_email !== undefined) {
      updateFields.push('public_email = ?');
      updateValues.push(cleanData.public_email);
    }
    if (cleanData.github_url !== undefined) {
      updateFields.push('github_url = ?');
      updateValues.push(cleanData.github_url);
    }
    if (cleanData.linkedin_url !== undefined) {
      updateFields.push('linkedin_url = ?');
      updateValues.push(cleanData.linkedin_url);
    }
    if (cleanData.website_url !== undefined) {
      updateFields.push('website_url = ?');
      updateValues.push(cleanData.website_url);
    }
    if (cleanData.is_published !== undefined) {
      updateFields.push('is_published = ?');
      updateValues.push(cleanData.is_published ? 1 : 0);
    }

    if (updateFields.length > 0) {
      updateValues.push(portfolioId, userId);
      await connection.query(
        `UPDATE portfolios SET ${updateFields.join(', ')} WHERE id = ? AND user_id = ?`,
        updateValues
      );
    }

    // Jika projects disediakan dalam request, ganti seluruh relasi proyek
    if (cleanData.projects !== undefined) {
      await connection.query('DELETE FROM portfolio_projects WHERE portfolio_id = ?', [portfolioId]);
      for (const pr of cleanData.projects) {
        await connection.query(
          `INSERT INTO portfolio_projects (
            portfolio_id,
            project_id,
            display_order,
            custom_description,
            is_featured
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            portfolioId,
            pr.project_id,
            pr.display_order,
            pr.custom_description || null,
            pr.is_featured ? 1 : 0,
          ]
        );
      }
    }

    // Jika skills disediakan dalam request, ganti seluruh relasi skill
    if (cleanData.skills !== undefined) {
      await connection.query('DELETE FROM portfolio_skills WHERE portfolio_id = ?', [portfolioId]);
      for (const sk of cleanData.skills) {
        await connection.query(
          `INSERT INTO portfolio_skills (
            portfolio_id,
            skill_id,
            display_order,
            is_featured
          ) VALUES (?, ?, ?, ?)`,
          [
            portfolioId,
            sk.skill_id,
            sk.display_order,
            sk.is_featured ? 1 : 0,
          ]
        );
      }
    }

    await connection.commit();
    return await getUserPortfolio(userId, connection);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Menghapus portofolio pengguna beserta relasinya secara cascade.
 */
export async function deletePortfolio(portfolioId, userId, db = pool) {
  const [existingPortfolio] = await db.query(
    'SELECT id FROM portfolios WHERE id = ? AND user_id = ? LIMIT 1',
    [portfolioId, userId]
  );

  if (existingPortfolio.length === 0) {
    const error = new Error('Portofolio tidak ditemukan.');
    error.status = 404;
    throw error;
  }

  await db.query('DELETE FROM portfolios WHERE id = ? AND user_id = ?', [portfolioId, userId]);

  return {
    success: true,
    message: 'Portofolio berhasil dihapus.',
  };
}

/**
 * Mengambil portofolio publik berdasarkan slug.
 * SYARAT MUTLAK KEAMANAN & PRIVASI:
 * 1. Hanya portofolio dengan is_published = 1 yang dikembalikan.
 * 2. Portofolio privat (is_published = 0) dan slug yang tidak ada SAMA-SAMA mengembalikan null (HTTP 404),
 *    mencegah kebocoran status keberadaan slug privat.
 * 3. HANYA mengembalikan DTO publik dengan allowlist field yang aman.
 * 4. TIDAK PERNAH mengembalikan: user_id, email akun pengguna (users.email), password_hash, atau data internal.
 * 5. HANYA mengembalikan proyek yang valid milik pemilik portofolio.
 * 6. HANYA mengembalikan skill yang berstatus 'active' pada tabel user_skills (mengecualikan needs_review & rejected).
 * 7. Kontak email publik (public_email) hanya muncul jika pengguna mengisinya secara eksplisit.
 *
 * @param {string} slug - Slug portofolio publik
 * @param {object} [db] - Instance pool atau connection database
 * @returns {Promise<object|null>} DTO portofolio publik atau null jika tidak ditemukan/tidak dipublikasikan
 */
export async function getPublicPortfolioBySlug(slug, db = pool) {
  if (!slug || typeof slug !== 'string') {
    return null;
  }

  const cleanSlug = slug.trim().toLowerCase();

  // 1. Query portofolio HANYA jika is_published = 1
  // JOIN users hanya untuk mengambil name, avatar_url, bio.
  // PENTING: users.email dan users.password_hash TIDAK DIAMBIL sama sekali dalam query!
  const [portfolioRows] = await db.query(
    `SELECT p.id,
            p.user_id,
            p.title,
            p.summary,
            p.custom_bio,
            p.slug,
            p.public_email,
            p.github_url,
            p.linkedin_url,
            p.website_url,
            p.is_published,
            p.created_at,
            p.updated_at,
            u.name AS user_name,
            u.avatar_url AS user_avatar_url,
            u.bio AS user_bio,
            ct.title AS career_target_title,
            ct.description AS career_target_description
     FROM portfolios p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN career_targets ct ON p.career_target_id = ct.id
     WHERE p.slug = ? AND p.is_published = 1
     LIMIT 1`,
    [cleanSlug]
  );

  if (portfolioRows.length === 0) {
    return null;
  }

  const portfolio = portfolioRows[0];

  // 2. Ambil proyek portofolio yang terverifikasi milik pengguna
  const [projectRows] = await db.query(
    `SELECT pp.id AS portfolio_project_id,
            pp.project_id,
            pp.display_order,
            pp.custom_description,
            pp.is_featured,
            p.title AS project_title,
            p.description AS project_original_description,
            p.repository_url,
            p.live_url,
            p.start_date,
            p.end_date
     FROM portfolio_projects pp
     JOIN projects p ON pp.project_id = p.id AND p.user_id = ?
     WHERE pp.portfolio_id = ?
     ORDER BY pp.display_order ASC, pp.id ASC`,
    [portfolio.user_id, portfolio.id]
  );

  const projectIds = projectRows.map((r) => r.project_id);
  const evidencesMap = new Map();

  if (projectIds.length > 0) {
    const [evidenceRows] = await db.query(
      `SELECT pe.project_id,
              pe.title,
              pe.evidence_type,
              pe.url
       FROM project_evidences pe
       WHERE pe.project_id IN (?)
       ORDER BY pe.id ASC`,
      [projectIds]
    );

    for (const ev of evidenceRows) {
      if (!evidencesMap.has(ev.project_id)) {
        evidencesMap.set(ev.project_id, []);
      }
      evidencesMap.get(ev.project_id).push({
        title: ev.title,
        evidence_type: ev.evidence_type,
        url: ev.url,
      });
    }
  }

  const publicProjects = projectRows.map((pr) => ({
    id: pr.portfolio_project_id,
    title: pr.project_title,
    description: pr.custom_description || pr.project_original_description,
    repository_url: pr.repository_url,
    live_url: pr.live_url,
    start_date: pr.start_date,
    end_date: pr.end_date,
    is_featured: Boolean(pr.is_featured),
    display_order: pr.display_order,
    evidences: evidencesMap.get(pr.project_id) || [],
  }));

  // 3. Ambil skill terkurasi yang HANYA berstatus 'active' pada user_skills
  // Skill needs_review atau rejected TIDAK BOLEH dikembalikan ke publik
  const [skillRows] = await db.query(
    `SELECT ps.id AS portfolio_skill_id,
            ps.display_order,
            ps.is_featured,
            s.name AS skill_name,
            s.category AS skill_category,
            us.proficiency_level,
            us.score,
            us.updated_at AS skill_verified_at
     FROM portfolio_skills ps
     JOIN skills s ON ps.skill_id = s.id
     JOIN user_skills us ON ps.skill_id = us.skill_id AND us.user_id = ?
     WHERE ps.portfolio_id = ? AND us.status = 'active'
     ORDER BY ps.display_order ASC, ps.id ASC`,
    [portfolio.user_id, portfolio.id]
  );

  const publicSkills = skillRows.map((sk) => ({
    id: sk.portfolio_skill_id,
    name: sk.skill_name,
    category: sk.skill_category,
    proficiency_level: sk.proficiency_level,
    score: sk.score,
    is_featured: Boolean(sk.is_featured),
    display_order: sk.display_order,
    verified_at: sk.skill_verified_at,
  }));

  // 4. Susun DTO Publik dengan Allowlist Eksplisit
  return {
    title: portfolio.title,
    slug: portfolio.slug,
    summary: portfolio.summary,
    custom_bio: portfolio.custom_bio,
    author: {
      name: portfolio.user_name,
      avatar_url: portfolio.user_avatar_url,
      bio: portfolio.custom_bio || portfolio.user_bio || null,
    },
    contact: {
      public_email: portfolio.public_email || null,
      github_url: portfolio.github_url || null,
      linkedin_url: portfolio.linkedin_url || null,
      website_url: portfolio.website_url || null,
    },
    career_target: portfolio.career_target_title
      ? {
          title: portfolio.career_target_title,
          description: portfolio.career_target_description,
        }
      : null,
    projects: publicProjects,
    skills: publicSkills,
    published_at: portfolio.updated_at,
  };
}

/**
 * Mengambil pengaturan berbagi dan privasi portofolio milik pengguna.
 */
export async function getPortfolioSharingSettings(portfolioId, userId, db = pool) {
  const [rows] = await db.query(
    `SELECT id,
            slug,
            is_published,
            public_email,
            github_url,
            linkedin_url,
            website_url,
            created_at,
            updated_at
     FROM portfolios
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [portfolioId, userId]
  );

  if (rows.length === 0) {
    return null;
  }

  const p = rows[0];
  return {
    portfolio_id: p.id,
    slug: p.slug,
    is_published: Boolean(p.is_published),
    public_email: p.public_email,
    github_url: p.github_url,
    linkedin_url: p.linkedin_url,
    website_url: p.website_url,
    public_url: `/api/public/portfolios/${p.slug}`,
    updated_at: p.updated_at,
  };
}

/**
 * Memperbarui pengaturan berbagi dan privasi portofolio milik pengguna.
 */
export async function updatePortfolioSharing(portfolioId, userId, cleanSharingData, db = pool) {
  // 1. Verifikasi keberadaan dan kepemilikan
  const [existingRows] = await db.query(
    'SELECT id, slug FROM portfolios WHERE id = ? AND user_id = ? LIMIT 1',
    [portfolioId, userId]
  );

  if (existingRows.length === 0) {
    const error = new Error('Portofolio tidak ditemukan.');
    error.status = 404;
    throw error;
  }

  const existing = existingRows[0];

  // 2. Jika slug diubah, pastikan tidak bertabrakan dengan portofolio lain
  if (cleanSharingData.slug && cleanSharingData.slug !== existing.slug) {
    const [conflictRows] = await db.query(
      'SELECT id FROM portfolios WHERE slug = ? AND id != ? LIMIT 1',
      [cleanSharingData.slug, portfolioId]
    );

    if (conflictRows.length > 0) {
      const error = new Error(`Slug '${cleanSharingData.slug}' sudah digunakan oleh pengguna lain.`);
      error.status = 409;
      throw error;
    }
  }

  // 3. Bangun query update dinamis
  const updateFields = [];
  const updateValues = [];

  if (cleanSharingData.is_published !== undefined) {
    updateFields.push('is_published = ?');
    updateValues.push(cleanSharingData.is_published ? 1 : 0);
  }

  if (cleanSharingData.slug !== undefined) {
    updateFields.push('slug = ?');
    updateValues.push(cleanSharingData.slug);
  }

  if (cleanSharingData.public_email !== undefined) {
    updateFields.push('public_email = ?');
    updateValues.push(cleanSharingData.public_email);
  }

  if (cleanSharingData.github_url !== undefined) {
    updateFields.push('github_url = ?');
    updateValues.push(cleanSharingData.github_url);
  }

  if (cleanSharingData.linkedin_url !== undefined) {
    updateFields.push('linkedin_url = ?');
    updateValues.push(cleanSharingData.linkedin_url);
  }

  if (cleanSharingData.website_url !== undefined) {
    updateFields.push('website_url = ?');
    updateValues.push(cleanSharingData.website_url);
  }

  if (updateFields.length > 0) {
    updateValues.push(portfolioId, userId);
    await db.query(
      `UPDATE portfolios SET ${updateFields.join(', ')} WHERE id = ? AND user_id = ?`,
      updateValues
    );
  }

  return getPortfolioSharingSettings(portfolioId, userId, db);
}


