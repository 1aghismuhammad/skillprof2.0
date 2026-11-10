-- Rollback Migration 000: Drop Base Tables
-- Compatibility: MariaDB 10.4.32+ / MySQL 8.0+

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS ai_analysis_skills;
DROP TABLE IF EXISTS ai_analyses;
DROP TABLE IF EXISTS project_evidences;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS skills;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;
