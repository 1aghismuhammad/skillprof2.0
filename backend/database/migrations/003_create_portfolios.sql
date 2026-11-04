-- Migration 003: Create Portfolios, Portfolio Projects, and Portfolio Skills
-- Compatibility: MariaDB 10.4.32+ / MySQL 8.0+
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci

-- 1. Tabel Utama: portfolios
CREATE TABLE IF NOT EXISTS portfolios (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    career_target_id INT UNSIGNED NULL,
    title VARCHAR(200) NOT NULL,
    summary TEXT NULL,
    custom_bio TEXT NULL,
    slug VARCHAR(100) NOT NULL,
    public_email VARCHAR(150) NULL,
    github_url VARCHAR(255) NULL,
    linkedin_url VARCHAR(255) NULL,
    website_url VARCHAR(255) NULL,
    is_published TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_portfolios_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_portfolios_career_target FOREIGN KEY (career_target_id)
        REFERENCES career_targets(id) ON DELETE SET NULL,
    CONSTRAINT uq_portfolios_user UNIQUE (user_id),
    CONSTRAINT uq_portfolios_slug UNIQUE (slug),
    INDEX idx_portfolios_user (user_id),
    INDEX idx_portfolios_slug_published (slug, is_published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabel Relasi Proyek Portofolio: portfolio_projects
CREATE TABLE IF NOT EXISTS portfolio_projects (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT UNSIGNED NOT NULL,
    project_id INT UNSIGNED NOT NULL,
    display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    custom_description TEXT NULL,
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_portfolio_projects_portfolio FOREIGN KEY (portfolio_id)
        REFERENCES portfolios(id) ON DELETE CASCADE,
    CONSTRAINT fk_portfolio_projects_project FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT uq_portfolio_projects_portfolio_project UNIQUE (portfolio_id, project_id),
    INDEX idx_portfolio_projects_portfolio_order (portfolio_id, display_order),
    INDEX idx_portfolio_projects_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabel Relasi Skill Portofolio: portfolio_skills
CREATE TABLE IF NOT EXISTS portfolio_skills (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    portfolio_id INT UNSIGNED NOT NULL,
    skill_id INT UNSIGNED NOT NULL,
    display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_portfolio_skills_portfolio FOREIGN KEY (portfolio_id)
        REFERENCES portfolios(id) ON DELETE CASCADE,
    CONSTRAINT fk_portfolio_skills_skill FOREIGN KEY (skill_id)
        REFERENCES skills(id) ON DELETE RESTRICT,
    CONSTRAINT uq_portfolio_skills_portfolio_skill UNIQUE (portfolio_id, skill_id),
    INDEX idx_portfolio_skills_portfolio_order (portfolio_id, display_order),
    INDEX idx_portfolio_skills_skill (skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

