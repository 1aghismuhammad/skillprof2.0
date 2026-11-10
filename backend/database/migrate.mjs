import fs from 'node:fs';
import path from 'node:path';
import pool from '../lib/db.js';

const MIGRATIONS_DIR = path.resolve('database/migrations');

async function runMigrations() {
  console.log('=== SkillProof Database Migration Runner ===\n');

  try {
    // 1. Verifikasi koneksi database
    await pool.query('SELECT 1');
    console.log('[OK] Terhubung ke database MySQL.\n');

    // 2. Ambil seluruh file migrasi (abaikan file rollback)
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql') && !file.endsWith('_rollback.sql'))
      .sort();

    console.log(`Ditemukan ${files.length} file migrasi untuk dieksekusi:\n`);

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      console.log(`-> Mengeksekusi migrasi: ${file}...`);

      // Pisahkan query berdasarkan titik koma (;)
      const statements = sqlContent
        .split(/;\s*$/m)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.trim()) {
          await pool.query(statement);
        }
      }

      console.log(`   [SELESAI] ${file}\n`);
    }

    console.log('=== Seluruh migrasi database berhasil dieksekusi! ===');
  } catch (error) {
    console.error('\n[GAGAL] Terjadi kesalahan saat migrasi:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigrations();
