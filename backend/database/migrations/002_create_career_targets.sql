-- Migration 002: Create Career Targets and Career Target Skills
-- Compatibility: MariaDB 10.4.32+ / MySQL 8.0+
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci

CREATE TABLE IF NOT EXISTS career_targets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_career_targets_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_career_targets_user_title UNIQUE (user_id, title),
    INDEX idx_career_targets_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS career_target_skills (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    career_target_id INT UNSIGNED NOT NULL,
    skill_id INT UNSIGNED NOT NULL,
    expected_proficiency_level ENUM('beginner', 'intermediate', 'advanced') NOT NULL DEFAULT 'intermediate',
    expected_score TINYINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_career_target_skills_target FOREIGN KEY (career_target_id)
        REFERENCES career_targets(id) ON DELETE CASCADE,
    CONSTRAINT fk_career_target_skills_skill FOREIGN KEY (skill_id)
        REFERENCES skills(id) ON DELETE RESTRICT,
    CONSTRAINT uq_career_target_skills_target_skill UNIQUE (career_target_id, skill_id),
    CONSTRAINT chk_career_target_skills_score CHECK (
        expected_score IS NULL OR (expected_score BETWEEN 0 AND 100)
    ),
    INDEX idx_career_target_skills_target (career_target_id),
    INDEX idx_career_target_skills_skill (skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

