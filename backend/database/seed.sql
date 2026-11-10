-- SkillProof Master Skills Seeder
-- Format: (name, category, description)

INSERT IGNORE INTO skills (name, category, description) VALUES
-- Frontend Development
('HTML5', 'Frontend', 'Standar markup modern untuk struktur halaman web semantik.'),
('CSS3', 'Frontend', 'Styling dan tata letak web termasuk Flexbox dan Grid.'),
('JavaScript', 'Frontend', 'Bahasa pemrograman inti web untuk interaktivitas client-side.'),
('TypeScript', 'Frontend', 'Superset JavaScript dengan sistem pengetikan statis.'),
('Vue.js', 'Frontend', 'Progressive JavaScript framework untuk antarmuka pengguna.'),
('React', 'Frontend', 'Library JavaScript berbasis komponen untuk UI modern.'),
('Next.js', 'Frontend', 'Framework React dengan SSR, SSG, dan Route Handlers.'),
('Nuxt.js', 'Frontend', 'Framework Vue.js tingkat tinggi dengan SSR dan file-based routing.'),
('Tailwind CSS', 'Frontend', 'Utility-first CSS framework untuk styling cepat dan konsisten.'),
('Bootstrap', 'Frontend', 'Framework CSS responsif dengan komponen antarmuka siap pakai.'),

-- Backend Development
('Node.js', 'Backend', 'Runtime environment JavaScript berbasis mesin V8.'),
('Express.js', 'Backend', 'Web framework minimalis dan fleksibel untuk Node.js.'),
('PHP', 'Backend', 'Bahasa pemrograman server-side untuk aplikasi web dinamis.'),
('Laravel', 'Backend', 'Framework PHP modern dengan sintaks elegan dan ekosistem lengkap.'),
('Python', 'Backend', 'Bahasa pemrograman serbaguna untuk backend, scripting, dan AI.'),
('FastAPI', 'Backend', 'Modern web framework Python berbasis OpenAPI dan async/await.'),
('Django', 'Backend', 'Framework Python berkemampuan tinggi dengan arsitektur MVT.'),
('Go', 'Backend', 'Bahasa pemrograman terkompilasi dan berkonkurensi tinggi.'),
('Java', 'Backend', 'Bahasa berorientasi objek untuk sistem enterprise yang tangguh.'),
('Spring Boot', 'Backend', 'Framework Java untuk pengembangan microservices siap produksi.'),
('REST API', 'Backend', 'Arsitektur komunikasi berbasis protokol HTTP dan format data JSON.'),
('GraphQL', 'Backend', 'Query language untuk API yang memberikan kontrol data fleksibel.'),
('WebSocket', 'Backend', 'Protokol komunikasi dua arah real-time antara client dan server.'),

-- Database & Storage
('MySQL', 'Database', 'Sistem manajemen basis data relasional open-source terpopuler.'),
('PostgreSQL', 'Database', 'RDBMS tingkat lanjut dengan dukungan tipe data kompleks dan ACID.'),
('MongoDB', 'Database', 'Basis data NoSQL berbasis dokumen JSON (BSON).'),
('Redis', 'Database', 'In-memory data structure store untuk caching dan message broker.'),
('SQLite', 'Database', 'Basis data embedded mandiri tanpa server independen.'),
('Prisma ORM', 'Database', 'Next-generation ORM untuk Node.js dan TypeScript.'),

-- Cloud & DevOps
('Docker', 'DevOps', 'Platform kontainerisasi untuk standardisasi deployment aplikasi.'),
('Kubernetes', 'DevOps', 'Sistem orkestrasi otomatis untuk kontainer berskala besar.'),
('Linux System Administration', 'DevOps', 'Pengelolaan server, shell scripting, dan permission OS Linux.'),
('Nginx', 'DevOps', 'Web server dan reverse proxy berkinerja tinggi.'),
('CI/CD Pipelines', 'DevOps', 'Otomatisasi pengujian dan deployment (GitHub Actions / GitLab CI).'),
('AWS Cloud', 'Cloud', 'Layanan infrastruktur komputasi awan dari Amazon Web Services.'),
('Google Cloud Platform', 'Cloud', 'Layanan komputasi awan dari Google.'),

-- Version Control & Tools
('Git', 'Tools', 'Sistem kontrol versi terdistribusi untuk pelacakan kode.'),
('GitHub', 'Tools', 'Platform kolaborasi kode, pull request, dan issue tracking.'),
('Postman', 'Tools', 'Alat pengujian dan dokumentasi kontrak REST API.'),
('Figma', 'UI/UX', 'Alat desain antarmuka kolaboratif berbasis vektor.'),

-- Artificial Intelligence & Data
('Prompt Engineering', 'AI', 'Teknik penyusunan instruksi terstruktur untuk model LLM.'),
('Google Gemini API', 'AI', 'Integrasi API kecerdasan buatan dari Google.'),
('OpenAI API', 'AI', 'Integrasi API LLM (GPT) untuk pemrosesan bahasa alami.'),
('Data Analysis', 'Data', 'Proses inspeksi, pembersihan, dan pemodelan data.'),
('Pandas', 'Data', 'Library Python untuk analisis dan manipulasi data berstruktur.');
