-- ══════════════════════════════════════════════════
--  EduCheck Database Schema
--  PostgreSQL 15+
-- ══════════════════════════════════════════════════

-- Drop in reverse dependency order (for clean re-runs)
DROP TABLE IF EXISTS submission_answers CASCADE;
DROP TABLE IF EXISTS submissions        CASCADE;
DROP TABLE IF EXISTS question_options   CASCADE;
DROP TABLE IF EXISTS questions          CASCADE;
DROP TABLE IF EXISTS schools            CASCADE;

-- ── SCHOOLS ───────────────────────────────────────
CREATE TABLE schools (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  type          TEXT        NOT NULL,          -- 'Primary School' | 'Secondary School'
  location      TEXT        NOT NULL,
  province      TEXT        NOT NULL,
  lat           NUMERIC(9,6) NOT NULL,
  lng           NUMERIC(9,6) NOT NULL,
  students      INT,
  girls         INT,
  boys          INT,
  monitored_by  TEXT,
  last_monitoring TEXT,
  budget        TEXT,
  description   TEXT,
  photo_url     TEXT,
  monitors_list TEXT[],
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── QUESTIONS ──────────────────────────────────────
-- form_type: 'service' | 'infrastructure' | 'survey'
CREATE TABLE questions (
  id          TEXT        PRIMARY KEY,          -- e.g. 's1', 'i1', 'ss1'
  form_type   TEXT        NOT NULL,
  cat         TEXT        NOT NULL,
  q_en        TEXT        NOT NULL,
  q_fr        TEXT        NOT NULL,
  note_en     TEXT,
  note_fr     TEXT,
  question_type TEXT      NOT NULL DEFAULT 'choice',  -- 'choice' | 'text'
  sort_order  INT         NOT NULL DEFAULT 0
);

-- ── QUESTION OPTIONS ──────────────────────────────
CREATE TABLE question_options (
  id          SERIAL PRIMARY KEY,
  question_id TEXT        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label_en    TEXT        NOT NULL,
  label_fr    TEXT        NOT NULL,
  is_problem  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_partial  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_neutral  BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order  INT         NOT NULL DEFAULT 0
);

-- ── SUBMISSIONS ────────────────────────────────────
CREATE TABLE submissions (
  id            BIGSERIAL   PRIMARY KEY,
  school_id     INT         NOT NULL REFERENCES schools(id),
  form_type     TEXT        NOT NULL,
  monitor_name  TEXT,
  problem_count INT         NOT NULL DEFAULT 0,
  ok_count      INT         NOT NULL DEFAULT 0,
  submitted_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── SUBMISSION ANSWERS ─────────────────────────────
CREATE TABLE submission_answers (
  id            BIGSERIAL   PRIMARY KEY,
  submission_id BIGINT      NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id   TEXT        NOT NULL,
  label_en      TEXT,
  label_fr      TEXT,
  is_problem    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_partial    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_neutral    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_free_text  BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ── INDEXES ────────────────────────────────────────
CREATE INDEX idx_submissions_school    ON submissions(school_id);
CREATE INDEX idx_submissions_form_type ON submissions(form_type);
CREATE INDEX idx_answers_submission    ON submission_answers(submission_id);
CREATE INDEX idx_questions_form_type   ON questions(form_type, sort_order);
CREATE INDEX idx_options_question      ON question_options(question_id, sort_order);

-- ══════════════════════════════════════════════════
--  SEED DATA
-- ══════════════════════════════════════════════════

-- ── Schools ───────────────────────────────────────
INSERT INTO schools (id, name, type, location, province, lat, lng, students, girls, boys,
  monitored_by, last_monitoring, budget, description, photo_url, monitors_list)
VALUES
(1,'INSTITUT AKSANTI','Secondary School','Uvira, Sud-Kivu, DRC','Sud-Kivu',
  -3.396000,29.141900,345,143,202,'Integrity Club Aksanti',
  '2 March 2022 by [Heri Bitamala]','CDF 100,000,000',
  'Institut Aksanti faces infrastructural challenges delivering quality education to 345 enrolled students. Toilets are inadequate, female students share facilities with male counterparts, and corruption has affected grade awarding. The Integrity Club formed by CERC has been monitoring since May 2022.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/24701-nature-natural-beauty.jpg/640px-24701-nature-natural-beauty.jpg',
  ARRAY['HERI BITAMALA','MUSA NZAMU','EDEN MAGANGA']),

(2,'COMPLEXE SCOLAIRE CONGO','Primary School','Goma, Nord-Kivu, DRC','Nord-Kivu',
  -1.679200,29.227600,1200,580,620,'Integrity Club Congo',
  '2 March 2022 by [Musa Nzamu]','CDF 85,000,000',
  'Complexe Scolaire Congo faces significant challenges with teacher attendance and resource allocation. The school has been monitored by the Integrity Club Congo since March 2022.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/24701-nature-natural-beauty.jpg/640px-24701-nature-natural-beauty.jpg',
  ARRAY['MUSA NZAMU','EDEN MAGANGA','HERI BITAMALA']),

(3,'GROUPE SCOLAIRE MARANATHA','Primary School','Kinshasa, DRC','Kinshasa',
  -4.321700,15.322200,410,210,200,'Integrity Club Maranatha',
  '2 March 2022 by [Heri Bitamala]','CDF 60,000,000',
  'Groupe Scolaire Maranatha serves 410 students in Kinshasa. The school has infrastructure and curriculum challenges being monitored by the Integrity Club Maranatha since early 2022.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/24701-nature-natural-beauty.jpg/640px-24701-nature-natural-beauty.jpg',
  ARRAY['HERI BITAMALA','MUSA NZAMU','EDEN MAGANGA']),

(4,'LYCEE UMOJA','Secondary School','Tshikapa, Kasaï, DRC','Kasaï',
  -6.411900,20.796900,345,143,202,'Integrity Club Umoja',
  '2 March 2022 by [Eden Maganga]','CDF 100,000,000',
  'Lycée Umoja faces infrastructural challenges in delivering quality education. Inadequate toilets, mixed-gender facilities, and corruption in grade awarding are the main issues. The Integrity Club has monitored since May 2022.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/24701-nature-natural-beauty.jpg/640px-24701-nature-natural-beauty.jpg',
  ARRAY['HERI BITAMALA','MUSA NZAMU','EDEN MAGANGA']),

(5,'ÉCOLE PRIMAIRE ESPOIR','Primary School','Kolwezi, Lualaba, DRC','Lualaba',
  -10.733300,25.416700,410,200,210,'Integrity Club Espoir',
  '2 March 2022 by [Heri Bitamala]','CDF 45,000,000',
  'École Primaire Espoir serves 410 students in Lualaba. Non-functional latrines and deteriorating infrastructure are major issues being addressed by the Integrity Club.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/24701-nature-natural-beauty.jpg/640px-24701-nature-natural-beauty.jpg',
  ARRAY['HERI BITAMALA','MUSA NZAMU','EDEN MAGANGA']);

-- Reset sequence after explicit IDs
SELECT setval('schools_id_seq', 5);

-- ── Service & Teaching Questions ──────────────────
INSERT INTO questions (id, form_type, cat, q_en, q_fr, question_type, sort_order) VALUES
('s1', 'service','infrastructure',
  'Are all classrooms and other school buildings of a suitable size for the number of students?',
  'Toutes les salles de classe et autres bâtiments scolaires sont-ils d''une taille adaptée au nombre d''élèves ?',
  'choice',1),
('s2','service','infrastructure',
  'Do all buildings have enough windows and doors to provide sufficient levels of access, lighting and ventilation?',
  'Tous les bâtiments ont-ils suffisamment de fenêtres et de portes pour assurer l''accès, l''éclairage et la ventilation ?',
  'choice',2),
('s3','service','inclusion',
  'Are all buildings accessible to people with disabilities?',
  'Tous les bâtiments sont-ils accessibles aux personnes handicapées ?',
  'choice',3),
('s4','service','infrastructure',
  'Are all buildings equipped with sufficient numbers of chairs, tables, desks, blackboards and other appropriate furniture?',
  'Tous les bâtiments sont-ils équipés d''un nombre suffisant de chaises, tables, bureaux, tableaux et autres mobiliers ?',
  'choice',4),
('s5','service','hygiene',
  'Are all toilets in good condition, and lockable from the inside?',
  'Tous les toilettes sont-ils en bon état et verrouillables de l''intérieur ?',
  'choice',5),
('s6','service','hygiene',
  'Is clean water available in a sufficient number of locations, and is this appropriately sourced, treated and stored?',
  'L''eau propre est-elle disponible en quantité suffisante et correctement stockée ?',
  'choice',6),
('s7','service','hygiene',
  'Are all areas of the school kept clean, with regular and appropriate disposal of all waste?',
  'Toutes les zones de l''école sont-elles propres avec une élimination régulière des déchets ?',
  'choice',7),
('s8','service','safety',
  'Is the school environment safe and free from threats or violence?',
  'L''environnement scolaire est-il sûr et exempt de menaces ou de violence ?',
  'choice',8),
('s9','service','teaching',
  'Are all teachers present and on time for their classes?',
  'Tous les enseignants sont-ils présents et ponctuels à leurs cours ?',
  'choice',9),
('s10','service','teaching',
  'Are qualified teachers delivering lessons appropriately?',
  'Des enseignants qualifiés dispensent-ils des cours de manière appropriée ?',
  'choice',10),
('s11','service','resources',
  'Are there sufficient learning materials (textbooks, pens, notebooks) available for students?',
  'Y a-t-il suffisamment de matériels pédagogiques (manuels, stylos, cahiers) disponibles pour les élèves ?',
  'choice',11),
('s12','service','integrity',
  'Have any instances of bribery or corruption been observed?',
  'Des cas de corruption ou de pots-de-vin ont-ils été observés ?',
  'choice',12),
('s13','service','management',
  'Is there a functional school management committee?',
  'Existe-t-il un comité de gestion scolaire fonctionnel ?',
  'choice',13),
('s14','service','governance',
  'Are school fees and contributions transparently communicated to parents?',
  'Les frais scolaires sont-ils communiqués de façon transparente aux parents ?',
  'choice',14),
('s15','service','other',
  'Any additional observations about service quality?',
  'Observations supplémentaires sur la qualité des services ?',
  'text',15);

-- ── Infrastructure Questions ───────────────────────
INSERT INTO questions (id, form_type, cat, q_en, q_fr, question_type, sort_order) VALUES
('i1','infrastructure','quality',
  'Is the construction work of good quality and in line with approved plans?',
  'Les travaux de construction sont-ils de bonne qualité et conformes aux plans approuvés ?',
  'choice',1),
('i2','infrastructure','materials',
  'Are appropriate and approved materials being used for construction?',
  'Des matériaux appropriés et approuvés sont-ils utilisés pour la construction ?',
  'choice',2),
('i3','infrastructure','safety',
  'Is the construction site safe for workers and the surrounding community?',
  'Le chantier est-il sûr pour les travailleurs et la communauté environnante ?',
  'choice',3),
('i4','infrastructure','environment',
  'Are environmental safeguards being respected on the construction site?',
  'Les mesures de protection environnementale sont-elles respectées sur le chantier ?',
  'choice',4),
('i5','infrastructure','quality',
  'Are the foundations and structural elements solid and up to standard?',
  'Les fondations et les éléments structurels sont-ils solides et conformes aux normes ?',
  'choice',5),
('i6','infrastructure','quality',
  'Is the roofing properly installed and weather-proof?',
  'La toiture est-elle correctement installée et imperméable ?',
  'choice',6),
('i7','infrastructure','quality',
  'Are doors and windows properly fitted and functional?',
  'Les portes et fenêtres sont-elles correctement installées et fonctionnelles ?',
  'choice',7),
('i8','infrastructure','hygiene',
  'Are sanitation facilities (latrines, handwashing stations) being constructed to appropriate standards?',
  'Les installations sanitaires sont-elles construites selon des normes appropriées ?',
  'choice',8),
('i9','infrastructure','inclusion',
  'Are disability-inclusive features being incorporated into the construction?',
  'Des caractéristiques inclusives pour les personnes handicapées sont-elles intégrées ?',
  'choice',9),
('i10','infrastructure','management',
  'Is the construction progressing according to the agreed schedule?',
  'La construction avance-t-elle selon le calendrier convenu ?',
  'choice',10),
('i11','infrastructure','management',
  'Is there a visible site supervisor present during working hours?',
  'Un superviseur de chantier est-il visible pendant les heures de travail ?',
  'choice',11),
('i12','infrastructure','corruption',
  'Are there signs of substandard materials being substituted for approved ones?',
  'Y a-t-il des signes de remplacement de matériaux approuvés par des matériaux de mauvaise qualité ?',
  'choice',12),
('i13','infrastructure','corruption',
  'Have community members raised concerns about irregularities in the construction process?',
  'Les membres de la communauté ont-ils soulevé des inquiétudes concernant des irrégularités ?',
  'choice',13),
('i14','infrastructure','governance',
  'Has activity on this project been stopped or delayed for any reason not already mentioned?',
  'Les activités de ce projet ont-elles été arrêtées ou retardées pour une raison non mentionnée ?',
  'choice',14),
('i15','infrastructure','finance',
  'Has the contractor or sub-contractor complained that they have not got enough money?',
  'L''entrepreneur ou le sous-traitant s''est-il plaint de ne pas avoir suffisamment d''argent ?',
  'choice',15),
('i16','infrastructure','labour',
  'Have the labourers complained that they have not been correctly paid?',
  'Les ouvriers se sont-ils plaints de ne pas avoir été correctement payés ?',
  'choice',16),
('i17','infrastructure','transparency',
  'Is public information clearly visible on the project site?',
  'Des informations publiques sont-elles clairement visibles sur le site du projet ?',
  'choice',17),
('i18','infrastructure','governance',
  'How would you describe the project management committee''s level of engagement?',
  'Quel est le niveau d''engagement du comité de gestion avec les activités de suivi ?',
  'choice',18),
('i19','infrastructure','community',
  'How would you describe the local community''s level of engagement with this project?',
  'Quel est le niveau d''engagement de la communauté locale envers ce projet ?',
  'choice',19);

-- ── Student Survey Questions ───────────────────────
INSERT INTO questions (id, form_type, cat, q_en, q_fr, question_type, sort_order) VALUES
('ss1','survey','demographics','Are you?','Vous êtes ?','choice',1),
('ss2','survey','demographics','How old are you?','Quel âge avez-vous ?','choice',2),
('ss3','survey','demographics','Do you consider yourself to have a disability?','Considérez-vous avoir un handicap ?','choice',3),
('ss4','survey','participation','Are you a member of the Integrity Club?','Êtes-vous membre du Club d''Intégrité ?','choice',4),
('ss5','survey','awareness','Do you know what this school offers?','Savez-vous ce que cette école offre ?','choice',5),
('ss6','survey','relevance','Do you think this school is needed by the community?','Pensez-vous que cette école est nécessaire pour la communauté ?','choice',6),
('ss7','survey','hygiene','Do you feel that the school environment is clean and well-maintained?','Pensez-vous que l''environnement scolaire est propre et bien entretenu ?','choice',7),
('ss8','survey','teaching','How satisfied are you with the learning materials available?','Êtes-vous satisfait des matériels pédagogiques disponibles ?','choice',8),
('ss9','survey','teaching','Are all of your lessons attended by teachers with the appropriate knowledge or skills?','Tous vos cours sont-ils assurés par des enseignants ayant les compétences appropriées ?','choice',9),
('ss10','survey','hygiene','Are you happy with the toilets and water sources available to you?','Êtes-vous satisfait(e) des toilettes et des sources d''eau disponibles ?','choice',10),
('ss11','survey','safety','Does any of the school''s infrastructure make you feel unsafe?','L''infrastructure de l''école vous fait-elle sentir en danger ?','choice',11),
('ss12','survey','governance','If you had a problem, is there a staff member you would feel comfortable discussing it with?','Si vous aviez un problème, y a-t-il un membre du personnel à qui vous vous sentiriez à l''aise d''en parler ?','choice',12),
('ss13','survey','satisfaction','Overall, are you satisfied with the way this education service is being implemented?','Dans l''ensemble, êtes-vous satisfait(e) de la mise en œuvre de ce service éducatif ?','choice',13),
('ss14','survey','other','Do you have anything else to add?','Avez-vous autre chose à ajouter ?','text',14);

-- ── Question Options ───────────────────────────────
-- Yes/No options (reused across many questions)
-- Service questions
INSERT INTO question_options (question_id,label_en,label_fr,is_problem,is_partial,is_neutral,sort_order) VALUES
-- s1
('s1','Yes','Oui',false,false,false,1),('s1','No','Non',true,false,false,2),
-- s2
('s2','Yes','Oui',false,false,false,1),('s2','No','Non',true,false,false,2),
-- s3
('s3','Yes','Oui',false,false,false,1),('s3','No','Non',true,false,false,2),
-- s4 (three options)
('s4','Yes','Oui',false,false,false,1),
('s4','Yes, but they are in bad condition','Oui, mais en mauvais état',true,true,false,2),
('s4','No','Non',true,false,false,3),
-- s5
('s5','Yes','Oui',false,false,false,1),('s5','No','Non',true,false,false,2),
-- s6
('s6','Yes','Oui',false,false,false,1),('s6','No','Non',true,false,false,2),
-- s7
('s7','Yes','Oui',false,false,false,1),('s7','No','Non',true,false,false,2),
-- s8
('s8','Yes','Oui',false,false,false,1),('s8','No','Non',true,false,false,2),
-- s9 (three options)
('s9','All teachers present','Tous les enseignants présents',false,false,false,1),
('s9','Some teachers absent','Quelques enseignants absents',true,true,false,2),
('s9','Many teachers absent','Beaucoup d''enseignants absents',true,false,false,3),
-- s10
('s10','Yes','Oui',false,false,false,1),('s10','No','Non',true,false,false,2),
-- s11 (three options)
('s11','Sufficient','Suffisant',false,false,false,1),
('s11','Partially sufficient','Partiellement suffisant',true,true,false,2),
('s11','Insufficient','Insuffisant',true,false,false,3),
-- s12
('s12','Yes','Oui',true,false,false,1),('s12','No','Non',false,false,false,2),
-- s13
('s13','Yes','Oui',false,false,false,1),('s13','No','Non',true,false,false,2),
-- s14
('s14','Yes','Oui',false,false,false,1),('s14','No','Non',true,false,false,2);

-- Infrastructure options
INSERT INTO question_options (question_id,label_en,label_fr,is_problem,is_partial,is_neutral,sort_order) VALUES
('i1','Yes','Oui',false,false,false,1),('i1','No','Non',true,false,false,2),
('i2','Yes','Oui',false,false,false,1),('i2','No','Non',true,false,false,2),
('i3','Yes','Oui',false,false,false,1),('i3','No','Non',true,false,false,2),
('i4','Yes','Oui',false,false,false,1),('i4','No','Non',true,false,false,2),
('i5','Yes','Oui',false,false,false,1),('i5','No','Non',true,false,false,2),
('i6','Yes','Oui',false,false,false,1),('i6','No','Non',true,false,false,2),
('i7','Yes','Oui',false,false,false,1),('i7','No','Non',true,false,false,2),
('i8','Yes','Oui',false,false,false,1),('i8','No','Non',true,false,false,2),
('i9','Yes','Oui',false,false,false,1),('i9','No','Non',true,false,false,2),
('i10','On schedule','Dans les délais',false,false,false,1),
('i10','Slightly delayed','Légèrement en retard',true,true,false,2),
('i10','Significantly delayed','Très en retard',true,false,false,3),
('i11','Yes','Oui',false,false,false,1),('i11','No','Non',true,false,false,2),
('i12','Yes','Oui',true,false,false,1),('i12','No','Non',false,false,false,2),
('i13','Yes','Oui',true,false,false,1),('i13','No','Non',false,false,false,2),
('i14','Yes','Oui',true,false,false,1),('i14','No','Non',false,false,false,2),
('i15','Yes','Oui',true,false,false,1),('i15','No','Non',false,false,false,2),
('i16','Yes','Oui',true,false,false,1),('i16','No','Non',false,false,false,2),
('i17','Yes','Oui',false,false,false,1),('i17','No','Non',true,false,false,2),
('i18','Very cooperative','Très coopératif',false,false,false,1),
('i18','Cooperative','Coopératif',false,false,false,2),
('i18','Uncooperative','Peu coopératif',true,true,false,3),
('i18','Very uncooperative','Très peu coopératif',true,false,false,4),
('i19','Very engaged','Très engagée',false,false,false,1),
('i19','Engaged','Engagée',false,false,false,2),
('i19','Not engaged','Peu engagée',true,true,false,3),
('i19','Very disengaged','Pas du tout engagée',true,false,false,4);

-- Survey options
INSERT INTO question_options (question_id,label_en,label_fr,is_problem,is_partial,is_neutral,sort_order) VALUES
('ss1','Female','Femme',false,false,false,1),
('ss1','Male','Homme',false,false,false,2),
('ss1','Other','Autre',false,false,false,3),
('ss2','17 years or less','17 ans ou moins',false,false,false,1),
('ss2','18 to 34 years','18 à 34 ans',false,false,false,2),
('ss2','35 to 59 years','35 à 59 ans',false,false,false,3),
('ss2','60 years or more','60 ans ou plus',false,false,false,4),
('ss3','Yes','Oui',false,false,false,1),('ss3','No','Non',false,false,false,2),
('ss4','Yes','Oui',false,false,false,1),('ss4','No','Non',false,false,false,2),
('ss5','Yes','Oui',false,false,false,1),('ss5','No','Non',true,false,false,2),
('ss6','Yes','Oui',false,false,false,1),('ss6','No','Non',true,false,false,2),
('ss7','Yes','Oui',false,false,false,1),('ss7','No','Non',true,false,false,2),
('ss8','Very satisfied','Très satisfait(e)',false,false,false,1),
('ss8','Satisfied','Satisfait(e)',false,false,false,2),
('ss8','Unsatisfied','Insatisfait(e)',true,true,false,3),
('ss8','Very unsatisfied','Très insatisfait(e)',true,false,false,4),
('ss9','Yes','Oui',false,false,false,1),
('ss9','No','Non',true,false,false,2),
('ss9','I don''t know','Je ne sais pas',false,false,true,3),
('ss10','Yes','Oui',false,false,false,1),('ss10','No','Non',true,false,false,2),
('ss11','Yes','Oui',true,false,false,1),('ss11','No','Non',false,false,false,2),
('ss12','Yes, more than one','Oui, plus d''un',false,false,false,1),
('ss12','Yes, one','Oui, un(e)',false,true,false,2),
('ss12','No, there are none','Non, il n''y en a pas',true,false,false,3),
('ss13','Yes','Oui',false,false,false,1),('ss13','No','Non',true,false,false,2);
