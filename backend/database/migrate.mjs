import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const MIGRATIONS_DIR = path.resolve('database/migrations');

async function runMigrations() {
  console.log('=== SkillProof Database Migration Runner ===\n');

  let pool;
  try {
    const dbName = process.env.DB_NAME || 'skillproof';
    const host = process.env.DB_HOST || 'localhost';
    const port = Number(process.env.DB_PORT) || 3306;
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';

    // 1. Pastikan database MySQL sudah dibuat
    const initConn = await mysql.createConnection({ host, port, user, password });
    await initConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await initConn.end();

    // 2. Buat koneksi pool ke database
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database: dbName,
      waitForConnections: true,
      connectionLimit: 10,
    });

    await pool.query('SELECT 1');
    console.log(`[OK] Terhubung ke database MySQL ('${dbName}').\n`);

    // 3. Ambil seluruh file migrasi (abaikan file rollback)
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql') && !file.endsWith('_rollback.sql'))
      .sort();

    console.log(`Ditemukan ${files.length} file migrasi untuk dieksekusi:\n`);

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      console.log(`-> Mengeksekusi migrasi: ${file}...`);

      // Bersihkan komentar satu baris (-- ...) lalu pisahkan query berdasarkan titik koma (;)
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

      console.log(`   [SELESAI] ${file}\n`);
    }

    console.log('=== Seluruh migrasi database berhasil dieksekusi! ===');
  } catch (error) {
    console.error('\n[GAGAL] Terjadi kesalahan saat migrasi:', error.message);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

runMigrations();
