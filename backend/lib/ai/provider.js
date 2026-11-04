/**
 * Abstraksi Provider AI untuk SkillProof Backend
 * Mendukung Google Gemini (default), OpenAI-compatible REST API, dan Mock Provider untuk pengujian.
 */

const DEFAULT_TIMEOUT_MS = 30000; // 30 detik timeout
const MAX_RETRIES = 2;

/**
 * Base AI Provider Interface
 */
export class BaseAIProvider {
  async analyzeProject({ prompt, systemPrompt }) {
    throw new Error('Method analyzeProject() must be implemented by subclass.');
  }
}

/**
 * Google Gemini Provider (Official REST API v1beta)
 */
export class GeminiProvider extends BaseAIProvider {
  constructor({ apiKey, model, baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    super();
    this.apiKey = apiKey;
    this.model = model || 'gemini-1.5-flash';
    this.baseUrl = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.timeoutMs = timeoutMs;
  }

  async analyzeProject({ prompt, systemPrompt }) {
    if (!this.apiKey) {
      throw new Error('AI_API_KEY tidak dikonfigurasi pada server.');
    }

    const endpoint = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const payload = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    };

    let attempt = 0;
    let lastError = null;

    while (attempt <= MAX_RETRIES) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.status === 429) {
          const err = new Error('Rate limit tercapai pada provider AI.');
          err.status = 429;
          if (attempt <= MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            continue;
          }
          throw err;
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${response.status} dari provider AI.`;
          const err = new Error(errMsg);
          err.status = response.status;
          throw err;
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const contentText = candidate?.content?.parts?.[0]?.text;

        if (!contentText) {
          throw new Error('Provider AI mengembalikan respons kosong.');
        }

        return contentText;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (err.name === 'AbortError') {
          lastError = new Error(`Permintaan ke provider AI melampaui batas waktu (${this.timeoutMs / 1000}s).`);
          lastError.status = 504;
        }
        if (attempt > MAX_RETRIES) {
          break;
        }
        // Tunggu sebelum retry jika error jaringan sementara
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }

    throw lastError;
  }
}

/**
 * OpenAI-Compatible Provider (REST API)
 */
export class OpenAICompatibleProvider extends BaseAIProvider {
  constructor({ apiKey, model, baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    super();
    this.apiKey = apiKey;
    this.model = model || 'gpt-4o-mini';
    this.baseUrl = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  async analyzeProject({ prompt, systemPrompt }) {
    if (!this.apiKey) {
      throw new Error('AI_API_KEY tidak dikonfigurasi pada server.');
    }

    const endpoint = `${this.baseUrl}/chat/completions`;
    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTP ${response.status} dari provider AI.`;
        const err = new Error(errMsg);
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      const contentText = data.choices?.[0]?.message?.content;

      if (!contentText) {
        throw new Error('Provider AI mengembalikan respons kosong.');
      }

      return contentText;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Permintaan ke provider AI melampaui batas waktu (${this.timeoutMs / 1000}s).`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    }
  }
}

/**
 * Mock Provider untuk Pengujian & Simulasi Terisolasi (Zero-Cost Testing)
 */
export class MockAIProvider extends BaseAIProvider {
  constructor({ customResponse = null, shouldFail = false, failureStatus = 500 } = {}) {
    super();
    this.customResponse = customResponse;
    this.shouldFail = shouldFail;
    this.failureStatus = failureStatus;
  }

  async analyzeProject({ prompt, systemPrompt }) {
    if (this.shouldFail) {
      const err = new Error('Simulasi kegagalan provider AI untuk pengujian.');
      err.status = this.failureStatus;
      throw err;
    }

    if (this.customResponse) {
      return typeof this.customResponse === 'string'
        ? this.customResponse
        : JSON.stringify(this.customResponse);
    }

    // Default mock response untuk rekomendasi jika prompt terindikasi untuk modul rekomendasi
    if (prompt && (prompt.includes('TARGET KARIER PENGGUNA') || prompt.includes('KESENJANGAN KOMPETENSI') || prompt.includes('rekomendasi pembelajaran'))) {
      const mockRecOutput = {
        courses: [
          {
            title: 'Modern Web Development with React',
            platform: 'Coursera',
            skill_name: 'React',
            level: 'intermediate',
            description: 'Membangun aplikasi web frontend modern dengan komponen modular dan manajemen state.',
            url: 'https://www.coursera.org',
            estimated_duration: '4-6 minggu',
          },
          {
            title: 'Advanced JavaScript Programming',
            platform: 'freeCodeCamp',
            skill_name: 'JavaScript',
            level: 'intermediate',
            description: 'Pendalaman konsep asinkron, closure, dan arsitektur modular JavaScript modern.',
            url: 'https://www.freecodecamp.org',
            estimated_duration: '30 jam',
          },
        ],
        projects: [
          {
            title: 'Collaborative Task Management Dashboard',
            description: 'Aplikasi manajemen tugas interaktif dengan arsitektur komponen terstruktur, filter status, dan autentikasi aman.',
            difficulty_level: 'intermediate',
            target_skills: ['React', 'JavaScript'],
            key_features: [
              'Autentikasi pengguna berbasis JWT',
              'Manajemen state global dan filter data',
              'Responsif dan ramah aksesibilitas',
            ],
            suggested_evidences: [
              'Repositori GitHub dengan dokumentasi arsitektur',
              'Demo aplikasi yang dapat diuji langsung',
            ],
            expected_outcome: 'Penguasaan implementasi UI komponen modular dan integrasi state interaktif.',
          },
          {
            title: 'E-Commerce Product Catalog & Analytics',
            description: 'Sistem katalog produk dinamis dengan integrasi API data dan visualisasi statistik penjualan.',
            difficulty_level: 'intermediate',
            target_skills: ['React', 'JavaScript'],
            key_features: [
              'Katalog produk terstruktur dengan paginasi',
              'Integrasi REST API backend',
              'Pengujian komponen dengan unit test',
            ],
            suggested_evidences: [
              'Tautan repositori publik dengan riwayat commit rapi',
              'Dokumentasi API dan bukti pengujian unit',
            ],
            expected_outcome: 'Kemampuan mengintegrasikan API backend ke dalam antarmuka web interaktif.',
          },
        ],
      };
      return JSON.stringify(mockRecOutput);
    }

    // Default mock response untuk portofolio jika prompt terindikasi untuk modul portofolio
    if (prompt && (prompt.includes('Portfolio Synthesizer') || prompt.includes('draf portofolio kompetensi') || prompt.includes('DAFTAR PROYEK NYATA MILIK MAHASISWA') || (systemPrompt && systemPrompt.includes('Portfolio Synthesizer')))) {
      const mockPortfolioOutput = {
        title: 'Full-Stack Web Architect & JavaScript Specialist',
        summary: 'Mahasiswa berdedikasi dengan rekam jejak nyata dalam pengembangan sistem web modern. Terampil dalam integrasi arsitektur REST API, manajemen database terstruktur, dan komponen UI modular.',
        custom_bio: 'Fokus pada pengembangan aplikasi web berkinerja tinggi dengan kode bersih dan keamanan teruji.',
        suggested_slug: 'ahmad-fauzi-portfolio',
        selected_project_ids: [1, 2],
        project_contributions: [
          {
            project_id: 1,
            custom_description: 'Merancang arsitektur backend REST API dan struktur data MySQL dengan performa tinggi serta dokumentasi lengkap.',
          },
        ],
        selected_skill_ids: [1, 2],
      };
      return JSON.stringify(mockPortfolioOutput);
    }

    // Default mock response konservatif
    const mockOutput = {
      summary: 'Proyek ini merupakan implementasi aplikasi web yang mencakup pengelolaan data dan antarmuka pengguna.',
      feedback: 'Pertimbangkan untuk menambahkan pengujian unit otomatis dan dokumentasi API terstruktur untuk meningkatkan kualitas proyek.',
      skills: [
        {
          name: 'JavaScript',
          category: 'Frontend',
          proficiency_level: 'intermediate',
          score: 75,
          reasoning: 'Penggunaan JavaScript terindikasi secara konsisten dalam implementasi fungsionalitas logika proyek.',
          evidence: 'Disebutkan pada deskripsi proyek dan tautan repositori yang dicantumkan.',
        },
        {
          name: 'MySQL',
          category: 'Database',
          proficiency_level: 'intermediate',
          score: 70,
          reasoning: 'Struktur penyimpanan data relasional terhubung dengan baik sesuai deskripsi arsitektur data.',
          evidence: 'Terindikasi dari spesifikasi teknologi yang digunakan.',
        },
      ],
    };

    return JSON.stringify(mockOutput);
  }
}

let globalOverrideProvider = null;

/**
 * Mengatur instance AI provider global untuk simulasi pengujian
 */
export function setGlobalAIProvider(provider) {
  globalOverrideProvider = provider;
}

/**
 * Factory function untuk mendapatkan instance AI Provider berdasarkan environment
 */
export function getAIProvider(overrideProvider = null) {
  if (overrideProvider) {
    return overrideProvider;
  }

  if (globalOverrideProvider) {
    return globalOverrideProvider;
  }

  const providerType = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  const baseUrl = process.env.AI_BASE_URL;

  if (providerType === 'mock') {
    return new MockAIProvider();
  }

  if (providerType === 'openai') {
    return new OpenAICompatibleProvider({ apiKey, model, baseUrl });
  }

  // Default: Gemini
  return new GeminiProvider({ apiKey, model, baseUrl });
}
