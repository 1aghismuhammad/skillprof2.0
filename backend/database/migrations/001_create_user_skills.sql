CREATE TABLE IF NOT EXISTS user_skills (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    skill_id INT UNSIGNED NOT NULL,
    proficiency_level ENUM('beginner', 'intermediate', 'advanced') NULL,
    score TINYINT UNSIGNED NULL,
    status ENUM('needs_review', 'active', 'rejected') NOT NULL DEFAULT 'needs_review',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uq_user_skills_user_skill UNIQUE (user_id, skill_id),
    CONSTRAINT fk_user_skills_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_skills_skill FOREIGN KEY (skill_id)
        REFERENCES skills(id) ON DELETE CASCADE,
    CONSTRAINT chk_user_skills_score CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    INDEX idx_user_skills_user_status (user_id, status),
    INDEX idx_user_skills_skill (skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_skill_assessments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_skill_id INT UNSIGNED NOT NULL,
    source_type ENUM('ai', 'manual') NOT NULL,
    analysis_skill_id INT UNSIGNED NULL,
    proficiency_level ENUM('beginner', 'intermediate', 'advanced') NOT NULL,
    score TINYINT UNSIGNED NOT NULL,
    notes TEXT NULL,
    review_status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_user_skill_assessments_analysis UNIQUE (analysis_skill_id),
    CONSTRAINT fk_user_skill_assessments_user_skill FOREIGN KEY (user_skill_id)
        REFERENCES user_skills(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_skill_assessments_analysis FOREIGN KEY (analysis_skill_id)
        REFERENCES ai_analysis_skills(id) ON DELETE SET NULL,
    CONSTRAINT chk_user_skill_assessments_source CHECK (
        source_type = 'ai' OR analysis_skill_id IS NULL
    ),
    CONSTRAINT chk_user_skill_assessments_score CHECK (score BETWEEN 0 AND 100),
    INDEX idx_user_skill_assessments_review (user_skill_id, review_status),
    INDEX idx_user_skill_assessments_source (source_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
