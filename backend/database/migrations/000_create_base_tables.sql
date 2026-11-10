-- Migration 000: Create Base Tables (Users, Skills, Projects, Evidences, AI Analyses)
-- Compatibility: MariaDB 10.4.32+ / MySQL 8.0+
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci

-- 1. Tabel Pengguna (users)
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    bio TEXT NULL,
    avatar_url VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabel Katalog Master Skill (skills)
CREATE TABLE IF NOT EXISTS skills (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(100) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_skills_name (name),
    INDEX idx_skills_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabel Proyek Mahasiswa (projects)
CREATE TABLE IF NOT EXISTS projects (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    repository_url VARCHAR(255) NULL,
    live_url VARCHAR(255) NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_projects_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabel Bukti Pekerjaan Proyek (project_evidences)
CREATE TABLE IF NOT EXISTS project_evidences (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id INT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    evidence_type VARCHAR(50) NOT NULL DEFAULT 'other',
    url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_evidences_project FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_project_evidences_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabel Riwayat Sesi Analisis AI (ai_analyses)
CREATE TABLE IF NOT EXISTS ai_analyses (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id INT UNSIGNED NOT NULL,
    summary TEXT NULL,
    feedback TEXT NULL,
    raw_response LONGTEXT NULL,
    status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_analyses_project FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_ai_analyses_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabel Detail Hasil Skill per Sesi Analisis (ai_analysis_skills)
CREATE TABLE IF NOT EXISTS ai_analysis_skills (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    analysis_id INT UNSIGNED NOT NULL,
    skill_id INT UNSIGNED NOT NULL,
    proficiency_level ENUM('beginner', 'intermediate', 'advanced') NOT NULL,
    score TINYINT UNSIGNED NOT NULL,
    reasoning TEXT NULL,
    evidence TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_analysis_skills_analysis FOREIGN KEY (analysis_id)
        REFERENCES ai_analyses(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_analysis_skills_skill FOREIGN KEY (skill_id)
        REFERENCES skills(id) ON DELETE CASCADE,
    CONSTRAINT chk_ai_analysis_skills_score CHECK (score BETWEEN 0 AND 100),
    INDEX idx_ai_analysis_skills_analysis (analysis_id),
    INDEX idx_ai_analysis_skills_skill (skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
