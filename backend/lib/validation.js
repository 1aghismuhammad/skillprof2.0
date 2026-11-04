/**
 * Helper validasi input autentikasi & proyek SkillProof
 */

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  // Format standar email: [teks]@[teks].[teks]
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const trimmed = email.trim();
  return emailRegex.test(trimmed) && trimmed.length <= 150;
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  // Kata sandi minimal 8 karakter dan maksimal 100 karakter
  return password.length >= 8 && password.length <= 100;
}

export function validateName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100;
}

export function validateProjectTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const trimmed = title.trim();
  return trimmed.length >= 1 && trimmed.length <= 200;
}

export function validateUrl(url, maxLength = 255) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length > maxLength) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

export function parsePositiveInt(val) {
  const num = Number(val);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

export function validateProjectInput(payload, isUpdate = false) {
  const errors = [];
  const cleanData = {};

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload JSON tidak valid.'] };
  }

  // 1. Judul Proyek (Title)
  if (!isUpdate || payload.title !== undefined) {
    if (!validateProjectTitle(payload.title)) {
      errors.push('Judul proyek wajib diisi (1 hingga 200 karakter).');
    } else {
      cleanData.title = payload.title.trim();
    }
  }

  // 2. Deskripsi (Description)
  if (!isUpdate || payload.description !== undefined) {
    if (payload.description === null || payload.description === undefined) {
      cleanData.description = '';
    } else if (typeof payload.description !== 'string') {
      errors.push('Deskripsi proyek harus berupa teks.');
    } else {
      cleanData.description = payload.description.trim();
    }
  }

  // 3. Repository URL
  if (payload.repository_url !== undefined) {
    if (payload.repository_url === null || payload.repository_url === '') {
      cleanData.repository_url = null;
    } else if (!validateUrl(payload.repository_url, 255)) {
      errors.push('Format URL repositori tidak valid (harus diawali http:// atau https://, maksimal 255 karakter).');
    } else {
      cleanData.repository_url = payload.repository_url.trim();
    }
  } else if (!isUpdate) {
    cleanData.repository_url = null;
  }

  // 4. Live Demo URL
  if (payload.live_url !== undefined) {
    if (payload.live_url === null || payload.live_url === '') {
      cleanData.live_url = null;
    } else if (!validateUrl(payload.live_url, 255)) {
      errors.push('Format URL live demo tidak valid (harus diawali http:// atau https://, maksimal 255 karakter).');
    } else {
      cleanData.live_url = payload.live_url.trim();
    }
  } else if (!isUpdate) {
    cleanData.live_url = null;
  }

  // 5. Start Date & End Date
  let startDate = null;
  let endDate = null;

  if (payload.start_date !== undefined) {
    if (payload.start_date === null || payload.start_date === '') {
      cleanData.start_date = null;
    } else if (!validateDate(payload.start_date)) {
      errors.push('Format tanggal mulai tidak valid (gunakan format YYYY-MM-DD).');
    } else {
      cleanData.start_date = payload.start_date.trim();
      startDate = cleanData.start_date;
    }
  } else if (!isUpdate) {
    cleanData.start_date = null;
  }

  if (payload.end_date !== undefined) {
    if (payload.end_date === null || payload.end_date === '') {
      cleanData.end_date = null;
    } else if (!validateDate(payload.end_date)) {
      errors.push('Format tanggal selesai tidak valid (gunakan format YYYY-MM-DD).');
    } else {
      cleanData.end_date = payload.end_date.trim();
      endDate = cleanData.end_date;
    }
  } else if (!isUpdate) {
    cleanData.end_date = null;
  }

  if (startDate && endDate && startDate > endDate) {
    errors.push('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.');
  }

  // 6. Evidences (Opsional)
  if (payload.evidences !== undefined) {
    if (!Array.isArray(payload.evidences)) {
      errors.push('Daftar bukti (evidences) harus berupa array.');
    } else {
      const cleanEvidences = [];
      const allowedTypes = ['repository', 'demo', 'document', 'certificate', 'other'];

      for (let i = 0; i < payload.evidences.length; i++) {
        const item = payload.evidences[i];
        if (!item || typeof item !== 'object') {
          errors.push(`Bukti ke-${i + 1} tidak valid.`);
          continue;
        }

        const evTitle = typeof item.title === 'string' ? item.title.trim() : '';
        const evUrl = typeof item.url === 'string' ? item.url.trim() : '';
        const evType = item.evidence_type && allowedTypes.includes(item.evidence_type)
          ? item.evidence_type
          : 'other';

        if (!evTitle || evTitle.length > 150) {
          errors.push(`Judul bukti ke-${i + 1} wajib diisi (maksimal 150 karakter).`);
        }
        if (!validateUrl(evUrl, 500)) {
          errors.push(`URL bukti ke-${i + 1} tidak valid (maksimal 500 karakter).`);
        }

        cleanEvidences.push({
          title: evTitle,
          url: evUrl,
          evidence_type: evType,
        });
      }

      cleanData.evidences = cleanEvidences;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: cleanData,
  };
}

export function validateSkillsQuery(searchParams) {
  const errors = [];
  let page = 1;
  let limit = 20;
  let search = '';
  let category = '';

  const rawPage = searchParams.get('page');
  if (rawPage !== null && rawPage !== '') {
    const parsedPage = Number(rawPage);
    if (!Number.isInteger(parsedPage) || parsedPage <= 0) {
      errors.push('Parameter page harus berupa bilangan bulat positif.');
    } else {
      page = parsedPage;
    }
  }

  const rawLimit = searchParams.get('limit');
  if (rawLimit !== null && rawLimit !== '') {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) {
      errors.push('Parameter limit harus berupa bilangan bulat antara 1 hingga 100.');
    } else {
      limit = parsedLimit;
    }
  }

  const rawSearch = searchParams.get('search') || searchParams.get('q');
  if (rawSearch) {
    if (typeof rawSearch !== 'string' || rawSearch.length > 100) {
      errors.push('Parameter pencarian maksimal 100 karakter.');
    } else {
      search = rawSearch.trim();
    }
  }

  const rawCategory = searchParams.get('category');
  if (rawCategory) {
    if (typeof rawCategory !== 'string' || rawCategory.length > 50) {
      errors.push('Parameter kategori maksimal 50 karakter.');
    } else {
      category = rawCategory.trim();
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: { page, limit, search, category },
  };
}

export const VALID_PROFICIENCY_LEVELS = ['beginner', 'intermediate', 'advanced'];

export function validateProficiencyLevel(level) {
  if (!level || typeof level !== 'string') return false;
  return VALID_PROFICIENCY_LEVELS.includes(level.trim().toLowerCase());
}

export function validateScore(score) {
  if (score === null || score === undefined || score === '') return false;
  const num = Number(score);
  return Number.isInteger(num) && num >= 0 && num <= 100;
}

export function validateManualSkillInput(payload) {
  const errors = [];
  const cleanData = {};

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload JSON tidak valid.'] };
  }

  // 1. Skill ID
  const skillId = parsePositiveInt(payload.skill_id);
  if (!skillId) {
    errors.push('skill_id wajib berupa bilangan bulat positif.');
  } else {
    cleanData.skill_id = skillId;
  }

  // 2. Proficiency Level
  if (!validateProficiencyLevel(payload.proficiency_level)) {
    errors.push('proficiency_level wajib diisi dengan salah satu dari: beginner, intermediate, advanced.');
  } else {
    cleanData.proficiency_level = payload.proficiency_level.trim().toLowerCase();
  }

  // 3. Score
  if (!validateScore(payload.score)) {
    errors.push('score wajib berupa bilangan bulat antara 0 hingga 100.');
  } else {
    cleanData.score = Number(payload.score);
  }

  // 4. Notes
  if (payload.notes !== undefined && payload.notes !== null) {
    if (typeof payload.notes !== 'string') {
      errors.push('Catatan (notes) harus berupa teks.');
    } else {
      cleanData.notes = payload.notes.trim().slice(0, 1000);
    }
  } else {
    cleanData.notes = null;
  }

  return {
    valid: errors.length === 0,
    errors,
    data: cleanData,
  };
}

export function validateSkillUpdateInput(payload) {
  const errors = [];
  const cleanData = {};

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload JSON tidak valid.'] };
  }

  const hasLevel = payload.proficiency_level !== undefined;
  const hasScore = payload.score !== undefined;
  const hasNotes = payload.notes !== undefined;

  if (!hasLevel && !hasScore && !hasNotes) {
    return {
      valid: false,
      errors: ['Minimal sertakan satu atribut yang ingin diperbarui (proficiency_level, score, atau notes).'],
    };
  }

  if (hasLevel) {
    if (!validateProficiencyLevel(payload.proficiency_level)) {
      errors.push('proficiency_level harus bernilai salah satu dari: beginner, intermediate, advanced.');
    } else {
      cleanData.proficiency_level = payload.proficiency_level.trim().toLowerCase();
    }
  }

  if (hasScore) {
    if (!validateScore(payload.score)) {
      errors.push('score harus berupa bilangan bulat antara 0 hingga 100.');
    } else {
      cleanData.score = Number(payload.score);
    }
  }

  if (hasNotes) {
    if (payload.notes === null || payload.notes === '') {
      cleanData.notes = null;
    } else if (typeof payload.notes !== 'string') {
      errors.push('Catatan (notes) harus berupa teks.');
    } else {
      cleanData.notes = payload.notes.trim().slice(0, 1000);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: cleanData,
  };
}

export function validateAssessmentAcceptInput(payload) {
  const errors = [];
  const cleanData = {
    hasCorrection: false,
  };

  if (!payload || typeof payload !== 'object') {
    // Payload kosong sah (artinya menerima rekomendasi AI apa adanya)
    return { valid: true, errors: [], data: cleanData };
  }

  if (payload.proficiency_level !== undefined) {
    if (!validateProficiencyLevel(payload.proficiency_level)) {
      errors.push('proficiency_level koreksi harus bernilai salah satu dari: beginner, intermediate, advanced.');
    } else {
      cleanData.proficiency_level = payload.proficiency_level.trim().toLowerCase();
      cleanData.hasCorrection = true;
    }
  }

  if (payload.score !== undefined) {
    if (!validateScore(payload.score)) {
      errors.push('score koreksi harus berupa bilangan bulat antara 0 hingga 100.');
    } else {
      cleanData.score = Number(payload.score);
      cleanData.hasCorrection = true;
    }
  }

  if (payload.notes !== undefined && payload.notes !== null) {
    if (typeof payload.notes !== 'string') {
      errors.push('Catatan (notes) harus berupa teks.');
    } else {
      cleanData.notes = payload.notes.trim().slice(0, 1000);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: cleanData,
  };
}

export function validateAssessmentRejectInput(payload) {
  const errors = [];
  const cleanData = {};

  if (!payload || typeof payload !== 'object') {
    return { valid: true, errors: [], data: cleanData };
  }

  if (payload.notes !== undefined && payload.notes !== null) {
    if (typeof payload.notes !== 'string') {
      errors.push('Alasan penolakan (notes) harus berupa teks.');
    } else {
      cleanData.notes = payload.notes.trim().slice(0, 1000);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: cleanData,
  };
}

export function validateUserSkillsQuery(searchParams) {
  const errors = [];
  let page = 1;
  let limit = 20;
  let status = 'active';
  let category = '';
  let search = '';

  const rawStatus = searchParams.get('status');
  const allowedStatuses = ['active', 'needs_review', 'rejected', 'all'];
  if (rawStatus) {
    const s = rawStatus.trim().toLowerCase();
    if (!allowedStatuses.includes(s)) {
      errors.push('Parameter status harus salah satu dari: active, needs_review, rejected, all.');
    } else {
      status = s;
    }
  }

  const rawPage = searchParams.get('page');
  if (rawPage !== null && rawPage !== '') {
    const parsedPage = Number(rawPage);
    if (!Number.isInteger(parsedPage) || parsedPage <= 0) {
      errors.push('Parameter page harus berupa bilangan bulat positif.');
    } else {
      page = parsedPage;
    }
  }

  const rawLimit = searchParams.get('limit');
  if (rawLimit !== null && rawLimit !== '') {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) {
      errors.push('Parameter limit harus berupa bilangan bulat antara 1 hingga 100.');
    } else {
      limit = parsedLimit;
    }
  }

  const rawSearch = searchParams.get('search') || searchParams.get('q');
  if (rawSearch) {
    if (typeof rawSearch !== 'string' || rawSearch.length > 100) {
      errors.push('Parameter pencarian maksimal 100 karakter.');
    } else {
      search = rawSearch.trim();
    }
  }

  const rawCategory = searchParams.get('category');
  if (rawCategory) {
    if (typeof rawCategory !== 'string' || rawCategory.length > 50) {
      errors.push('Parameter kategori maksimal 50 karakter.');
    } else {
      category = rawCategory.trim();
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: { page, limit, status, category, search },
  };
}

export function validateAssessmentsQuery(searchParams) {
  const errors = [];
  let page = 1;
  let limit = 20;
  let status = 'pending';
  let sourceType = 'all';

  const rawStatus = searchParams.get('status');
  const allowedStatuses = ['pending', 'accepted', 'rejected', 'all'];
  if (rawStatus) {
    const s = rawStatus.trim().toLowerCase();
    if (!allowedStatuses.includes(s)) {
      errors.push('Parameter status harus salah satu dari: pending, accepted, rejected, all.');
    } else {
      status = s;
    }
  }

  const rawSource = searchParams.get('source_type') || searchParams.get('source');
  const allowedSources = ['ai', 'manual', 'all'];
  if (rawSource) {
    const src = rawSource.trim().toLowerCase();
    if (!allowedSources.includes(src)) {
      errors.push('Parameter source_type harus salah satu dari: ai, manual, all.');
    } else {
      sourceType = src;
    }
  }

  const rawPage = searchParams.get('page');
  if (rawPage !== null && rawPage !== '') {
    const parsedPage = Number(rawPage);
    if (!Number.isInteger(parsedPage) || parsedPage <= 0) {
      errors.push('Parameter page harus berupa bilangan bulat positif.');
    } else {
      page = parsedPage;
    }
  }

  const rawLimit = searchParams.get('limit');
  if (rawLimit !== null && rawLimit !== '') {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) {
      errors.push('Parameter limit harus berupa bilangan bulat antara 1 hingga 100.');
    } else {
      limit = parsedLimit;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: { page, limit, status, sourceType },
  };
}

export function validateProfileUpdateInput(payload) {
  const errors = [];
  const cleanData = {};

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload JSON tidak valid.'] };
  }

  // 1. name: wajib, string 2–100 karakter setelah trim
  if (payload.name === undefined || payload.name === null) {
    errors.push('Nama wajib diisi.');
  } else if (!validateName(payload.name)) {
    errors.push('Nama harus memiliki panjang antara 2 hingga 100 karakter.');
  } else {
    cleanData.name = payload.name.trim();
  }

  // 2. bio: opsional, string atau null, maksimal 1.000 karakter
  if (payload.bio !== undefined) {
    if (payload.bio === null || payload.bio === '') {
      cleanData.bio = null;
    } else if (typeof payload.bio !== 'string') {
      errors.push('Bio harus berupa teks atau null.');
    } else if (payload.bio.trim().length > 1000) {
      errors.push('Bio maksimal 1.000 karakter.');
    } else {
      cleanData.bio = payload.bio.trim();
    }
  }

  // 3. avatar_url: opsional, string atau null, maksimal 255 karakter, URL absolut http: atau https:
  if (payload.avatar_url !== undefined) {
    if (payload.avatar_url === null || payload.avatar_url === '') {
      cleanData.avatar_url = null;
    } else if (typeof payload.avatar_url !== 'string') {
      errors.push('URL avatar harus berupa teks atau null.');
    } else {
      const trimmed = payload.avatar_url.trim();
      if (trimmed.length > 255) {
        errors.push('URL avatar maksimal 255 karakter.');
      } else {
        try {
          const parsed = new URL(trimmed);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            errors.push('URL avatar harus menggunakan protokol http: atau https:.');
          } else {
            cleanData.avatar_url = trimmed;
          }
        } catch {
          errors.push('Format URL avatar tidak valid (harus merupakan URL absolut yang valid).');
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: cleanData,
  };
}

export function validateCareerTargetTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const trimmed = title.trim();
  return trimmed.length >= 2 && trimmed.length <= 150;
}

export function validateCareerTargetInput(payload, isUpdate = false) {
  const errors = [];
  const cleanData = {};

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload JSON tidak valid.'] };
  }

  // 1. Title
  if (!isUpdate || payload.title !== undefined) {
    if (!validateCareerTargetTitle(payload.title)) {
      errors.push('Judul target karier wajib diisi (2 hingga 150 karakter).');
    } else {
      cleanData.title = payload.title.trim();
    }
  }

  // 2. Description
  if (payload.description !== undefined) {
    if (payload.description === null || payload.description === '') {
      cleanData.description = null;
    } else if (typeof payload.description !== 'string') {
      errors.push('Deskripsi target karier harus berupa teks.');
    } else if (payload.description.trim().length > 2000) {
      errors.push('Deskripsi target karier maksimal 2.000 karakter.');
    } else {
      cleanData.description = payload.description.trim();
    }
  } else if (!isUpdate) {
    cleanData.description = null;
  }

  // 3. Target Skills (opsional)
  if (payload.target_skills !== undefined) {
    if (!Array.isArray(payload.target_skills)) {
      errors.push('target_skills harus berupa array.');
    } else {
      const cleanSkills = [];
      const seenSkillIds = new Set();

      for (let i = 0; i < payload.target_skills.length; i++) {
        const item = payload.target_skills[i];
        if (!item || typeof item !== 'object') {
          errors.push(`Target skill ke-${i + 1} tidak valid.`);
          continue;
        }

        const skillId = parsePositiveInt(item.skill_id);
        if (!skillId) {
          errors.push(`Target skill ke-${i + 1}: skill_id wajib berupa bilangan bulat positif.`);
          continue;
        }

        if (seenSkillIds.has(skillId)) {
          errors.push(`Target skill ke-${i + 1}: skill_id ${skillId} duplikat dalam request.`);
        }
        seenSkillIds.add(skillId);

        let proficiencyLevel = 'intermediate';
        if (item.expected_proficiency_level !== undefined && item.expected_proficiency_level !== null) {
          if (!validateProficiencyLevel(item.expected_proficiency_level)) {
            errors.push(`Target skill ke-${i + 1}: expected_proficiency_level harus salah satu dari: beginner, intermediate, advanced.`);
          } else {
            proficiencyLevel = item.expected_proficiency_level.trim().toLowerCase();
          }
        }

        let expectedScore = null;
        if (item.expected_score !== undefined && item.expected_score !== null && item.expected_score !== '') {
          if (!validateScore(item.expected_score)) {
            errors.push(`Target skill ke-${i + 1}: expected_score harus berupa bilangan bulat antara 0 hingga 100.`);
          } else {
            expectedScore = Number(item.expected_score);
          }
        }

        cleanSkills.push({
          skill_id: skillId,
          expected_proficiency_level: proficiencyLevel,
          expected_score: expectedScore,
        });
      }

      cleanData.target_skills = cleanSkills;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: cleanData,
  };
}

export const RESERVED_SLUGS = [
  'admin',
  'api',
  'auth',
  'login',
  'register',
  'logout',
  'dashboard',
  'profile',
  'projects',
  'skills',
  'settings',
  'public',
  'portfolio',
  'portfolios',
  'generate',
  'me',
  'test',
  'help',
  'docs',
  'support',
  'terms',
  'privacy',
  'null',
  'undefined',
];

/**
 * Validasi format slug dan pengecekan reserved words
 * Format: ^[a-z0-9]+(?:-[a-z0-9]+)*$ (panjang 3-60 karakter)
 */
export function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const trimmed = slug.trim();
  if (trimmed.length < 3 || trimmed.length > 60) return false;
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(trimmed)) return false;
  if (RESERVED_SLUGS.includes(trimmed.toLowerCase())) return false;
  return true;
}

/**
 * Validasi payload pembuatan dan pembaruan portofolio
 */
export function validatePortfolioInput(payload, isUpdate = false) {
  const errors = [];
  const cleanData = {};

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload JSON tidak valid.'] };
  }

  // 1. Judul Portofolio (Title)
  if (!isUpdate || payload.title !== undefined) {
    if (!payload.title || typeof payload.title !== 'string') {
      errors.push('Judul portofolio wajib diisi (1 hingga 200 karakter).');
    } else {
      const trimmed = payload.title.trim();
      if (trimmed.length < 1 || trimmed.length > 200) {
        errors.push('Judul portofolio harus memiliki panjang antara 1 hingga 200 karakter.');
      } else {
        cleanData.title = trimmed;
      }
    }
  }

  // 2. Slug
  if (!isUpdate || payload.slug !== undefined) {
    if (!payload.slug || typeof payload.slug !== 'string') {
      errors.push('Slug portofolio wajib diisi.');
    } else {
      const trimmedSlug = payload.slug.trim();
      if (!validateSlug(trimmedSlug)) {
        if (RESERVED_SLUGS.includes(trimmedSlug.toLowerCase())) {
          errors.push(`Slug '${trimmedSlug}' adalah kata yang dicadangkan oleh sistem dan tidak dapat digunakan.`);
        } else {
          errors.push('Format slug tidak valid. Gunakan huruf kecil, angka, dan tanda hubung (-) tunggal (3 hingga 60 karakter).');
        }
      } else {
        cleanData.slug = trimmedSlug.toLowerCase();
      }
    }
  }

  // 3. Ringkasan (Summary)
  if (payload.summary !== undefined) {
    if (payload.summary === null || payload.summary === '') {
      cleanData.summary = null;
    } else if (typeof payload.summary !== 'string') {
      errors.push('Ringkasan portofolio harus berupa teks.');
    } else if (payload.summary.trim().length > 2000) {
      errors.push('Ringkasan portofolio maksimal 2000 karakter.');
    } else {
      cleanData.summary = payload.summary.trim();
    }
  } else if (!isUpdate) {
    cleanData.summary = null;
  }

  // 4. Custom Bio
  if (payload.custom_bio !== undefined) {
    if (payload.custom_bio === null || payload.custom_bio === '') {
      cleanData.custom_bio = null;
    } else if (typeof payload.custom_bio !== 'string') {
      errors.push('Bio kustom harus berupa teks.');
    } else if (payload.custom_bio.trim().length > 1000) {
      errors.push('Bio kustom maksimal 1000 karakter.');
    } else {
      cleanData.custom_bio = payload.custom_bio.trim();
    }
  } else if (!isUpdate) {
    cleanData.custom_bio = null;
  }

  // 5. Career Target ID (opsional)
  if (payload.career_target_id !== undefined) {
    if (payload.career_target_id === null || payload.career_target_id === '') {
      cleanData.career_target_id = null;
    } else {
      const parsedCtId = parsePositiveInt(payload.career_target_id);
      if (!parsedCtId) {
        errors.push('ID target karier harus berupa bilangan bulat positif.');
      } else {
        cleanData.career_target_id = parsedCtId;
      }
    }
  } else if (!isUpdate) {
    cleanData.career_target_id = null;
  }

  // 6. Public Email (opsional)
  if (payload.public_email !== undefined) {
    if (payload.public_email === null || payload.public_email === '') {
      cleanData.public_email = null;
    } else if (!validateEmail(payload.public_email)) {
      errors.push('Format email publik tidak valid.');
    } else {
      cleanData.public_email = payload.public_email.trim();
    }
  } else if (!isUpdate) {
    cleanData.public_email = null;
  }

  // 7. URLs (github_url, linkedin_url, website_url)
  for (const urlField of ['github_url', 'linkedin_url', 'website_url']) {
    if (payload[urlField] !== undefined) {
      if (payload[urlField] === null || payload[urlField] === '') {
        cleanData[urlField] = null;
      } else if (!validateUrl(payload[urlField], 255)) {
        errors.push(`Format URL ${urlField} tidak valid (harus diawali http:// atau https://, maksimal 255 karakter).`);
      } else {
        cleanData[urlField] = payload[urlField].trim();
      }
    } else if (!isUpdate) {
      cleanData[urlField] = null;
    }
  }

  // 8. Is Published (opsional, default false)
  if (payload.is_published !== undefined) {
    cleanData.is_published = Boolean(payload.is_published);
  } else if (!isUpdate) {
    cleanData.is_published = false;
  }

  // 9. Projects (opsional array)
  if (payload.projects !== undefined) {
    if (!Array.isArray(payload.projects)) {
      errors.push('Daftar proyek portofolio harus berupa array.');
    } else {
      const cleanProjects = [];
      const seenProjectIds = new Set();

      for (let i = 0; i < payload.projects.length; i++) {
        const item = payload.projects[i];
        if (!item || typeof item !== 'object') {
          errors.push(`Proyek portofolio ke-${i + 1} tidak valid.`);
          continue;
        }

        const projId = parsePositiveInt(item.project_id);
        if (!projId) {
          errors.push(`Proyek portofolio ke-${i + 1}: project_id harus berupa bilangan bulat positif.`);
          continue;
        }

        if (seenProjectIds.has(projId)) {
          errors.push(`Proyek dengan ID ${projId} didaftarkan lebih dari sekali dalam portofolio.`);
          continue;
        }
        seenProjectIds.add(projId);

        let customDesc = null;
        if (item.custom_description !== undefined && item.custom_description !== null && item.custom_description !== '') {
          if (typeof item.custom_description !== 'string') {
            errors.push(`Proyek portofolio ke-${i + 1}: custom_description harus berupa teks.`);
          } else {
            customDesc = item.custom_description.trim().slice(0, 2000);
          }
        }

        const displayOrder = Number.isInteger(Number(item.display_order)) && Number(item.display_order) >= 0
          ? Number(item.display_order)
          : i + 1;

        cleanProjects.push({
          project_id: projId,
          display_order: displayOrder,
          custom_description: customDesc,
          is_featured: Boolean(item.is_featured),
        });
      }

      cleanData.projects = cleanProjects;
    }
  }

  // 10. Skills (opsional array)
  if (payload.skills !== undefined) {
    if (!Array.isArray(payload.skills)) {
      errors.push('Daftar skill portofolio harus berupa array.');
    } else {
      const cleanSkills = [];
      const seenSkillIds = new Set();

      for (let i = 0; i < payload.skills.length; i++) {
        const item = payload.skills[i];
        if (!item || typeof item !== 'object') {
          errors.push(`Skill portofolio ke-${i + 1} tidak valid.`);
          continue;
        }

        const skillId = parsePositiveInt(item.skill_id);
        if (!skillId) {
          errors.push(`Skill portofolio ke-${i + 1}: skill_id harus berupa bilangan bulat positif.`);
          continue;
        }

        if (seenSkillIds.has(skillId)) {
          errors.push(`Skill dengan ID ${skillId} didaftarkan lebih dari sekali dalam portofolio.`);
          continue;
        }
        seenSkillIds.add(skillId);

        const displayOrder = Number.isInteger(Number(item.display_order)) && Number(item.display_order) >= 0
          ? Number(item.display_order)
          : i + 1;

        cleanSkills.push({
          skill_id: skillId,
          display_order: displayOrder,
          is_featured: Boolean(item.is_featured),
        });
      }

      cleanData.skills = cleanSkills;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: cleanData,
  };
}

/**
 * Memvalidasi input pengaturan berbagi dan privasi portofolio.
 * Mendukung perubahan status publikasi, slug, email publik, dan tautan kontak.
 */
export function validateSharingInput(payload) {
  const errors = [];
  const cleanData = {};

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Payload JSON tidak valid.'], data: {} };
  }

  // 1. is_published (opsional)
  if (payload.is_published !== undefined) {
    cleanData.is_published = Boolean(payload.is_published);
  }

  // 2. slug (opsional)
  if (payload.slug !== undefined) {
    if (!payload.slug || typeof payload.slug !== 'string') {
      errors.push('Slug portofolio wajib diisi.');
    } else {
      const trimmedSlug = payload.slug.trim();
      if (!validateSlug(trimmedSlug)) {
        if (RESERVED_SLUGS.includes(trimmedSlug.toLowerCase())) {
          errors.push(`Slug '${trimmedSlug}' adalah kata yang dicadangkan oleh sistem dan tidak dapat digunakan.`);
        } else {
          errors.push('Format slug tidak valid. Gunakan huruf kecil, angka, dan tanda hubung (-) tunggal (3 hingga 60 karakter).');
        }
      } else {
        cleanData.slug = trimmedSlug.toLowerCase();
      }
    }
  }

  // 3. public_email (opsional, null atau string)
  if (payload.public_email !== undefined) {
    if (payload.public_email === null || payload.public_email === '') {
      cleanData.public_email = null;
    } else if (!validateEmail(payload.public_email)) {
      errors.push('Format email publik tidak valid.');
    } else {
      cleanData.public_email = payload.public_email.trim();
    }
  }

  // 4. URL Kontak Sosial (github_url, linkedin_url, website_url)
  for (const urlField of ['github_url', 'linkedin_url', 'website_url']) {
    if (payload[urlField] !== undefined) {
      if (payload[urlField] === null || payload[urlField] === '') {
        cleanData[urlField] = null;
      } else if (!validateUrl(payload[urlField], 255)) {
        errors.push(`Format URL ${urlField} tidak valid (harus diawali http:// atau https://, maksimal 255 karakter).`);
      } else {
        cleanData[urlField] = payload[urlField].trim();
      }
    }
  }

  // Cek apakah ada setidaknya satu field yang disediakan
  if (Object.keys(cleanData).length === 0 && errors.length === 0) {
    errors.push('Setidaknya salah satu pengaturan (is_published, slug, public_email, github_url, linkedin_url, website_url) wajib disediakan.');
  }

  return {
    valid: errors.length === 0,
    errors,
    data: cleanData,
  };
}


