-- Rollback migration for 001_create_user_skills.sql
-- Urutan drop tabel: anak terlebih dahulu (user_skill_assessments) baru induk (user_skills)
DROP TABLE IF EXISTS user_skill_assessments;
DROP TABLE IF EXISTS user_skills;

