import fs from 'node:fs';
import path from 'node:path';
import pool from '../lib/db.js';

const SEED_FILE = path.resolve('database/seed.sql');

async function runSeed() {
  console.log('=== SkillProof Master Skills Seeder ===\n');

  try {
    // 1. Verifikasi koneksi database
    await pool.query('SELECT 1');
    console.log('[OK] Terhubung ke database MySQL.\n');

    if (!fs.existsSync(SEED_FILE)) {
      throw new Error(`File seeder tidak ditemukan: ${SEED_FILE}`);
    }

    const sqlContent = fs.readFileSync(SEED_FILE, 'utf-8');

    console.log('-> Mengeksekusi database/seed.sql...');

    const statements = sqlContent
      .replace(/--.*$/gm, '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement);
      }
    }

    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM skills');
    const totalSkills = rows[0]?.total || 0;

    console.log(`\n=== Seeder berhasil! Total ${totalSkills} master skills tersedia di database. ===`);
  } catch (error) {
    console.error('\n[GAGAL] Terjadi kesalahan saat seeding:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runSeed();
