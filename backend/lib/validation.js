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
