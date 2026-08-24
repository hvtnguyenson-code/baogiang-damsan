\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_sqlstate(command text, expected_state text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE command;
  RAISE EXCEPTION '%: expected SQLSTATE %, command succeeded', label, expected_state;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0001' AND SQLERRM LIKE label || ':%command succeeded%' THEN RAISE; END IF;
  IF SQLSTATE <> expected_state THEN RAISE EXCEPTION '%: expected SQLSTATE %, got %', label, expected_state, SQLSTATE; END IF;
END $$;

DO $$
DECLARE values text[];
BEGIN
  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO values FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = 'ReportingStatementLifecycleState';
  IF values <> ARRAY['SUBMITTED','APPROVED','REJECTED','SUPERSEDED'] THEN RAISE EXCEPTION 'lifecycle enum mismatch: %', values; END IF;
  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO values FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = 'ReportingStatementCommandType';
  IF values <> ARRAY['SUBMIT','APPROVE','REJECT'] THEN RAISE EXCEPTION 'command enum mismatch: %', values; END IF;
  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO values FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = 'ReportingStatementHistoryEvent';
  IF values <> ARRAY['SUBMITTED','APPROVED','REJECTED','SUPERSEDED'] THEN RAISE EXCEPTION 'history enum mismatch: %', values; END IF;
  IF (SELECT count(*) FROM pg_class WHERE relname IN ('reporting_statement_series','reporting_statement_revisions','reporting_statement_revision_states','reporting_statement_revision_subjects','reporting_statement_commands','reporting_statement_histories')) <> 6 THEN RAISE EXCEPTION 'exact six Statement tables are required'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name IN ('reporting_statement_revisions','reporting_statement_commands','reporting_statement_histories') AND column_name = 'updated_at') THEN RAISE EXCEPTION 'immutable/receipt/history tables must not have updated_at'; END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'reporting_statement_revisions' AND column_name = 'canonical_snapshot_json') <> 'text' THEN RAISE EXCEPTION 'canonical snapshot must be TEXT'; END IF;
  IF (SELECT character_maximum_length FROM information_schema.columns WHERE table_name = 'reporting_statement_revisions' AND column_name = 'semantic_hash') <> 64 THEN RAISE EXCEPTION 'semantic hash must be CHAR(64)'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relname LIKE 'reporting_statement_%')) THEN RAISE EXCEPTION 'Statement trigger is forbidden'; END IF;
END $$;

INSERT INTO users (id, username, password_hash, status) VALUES ('a7100000-0000-0000-0000-000000000001','reporting-fixture-user','x','ACTIVE');
INSERT INTO academic_years (id, code, name) VALUES ('a7200000-0000-0000-0000-000000000001','RS-2026','Reporting fixture year');
INSERT INTO subjects (id, code, name) VALUES ('a7300000-0000-0000-0000-000000000001','RS','Reporting fixture subject');
INSERT INTO reporting_statement_series (id, statement_profile, submitter_user_id, academic_year_id, from_civil_date, to_civil_date) VALUES ('a7400000-0000-0000-0000-000000000001','PERSONAL_V1','a7100000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001',DATE '2026-01-01',DATE '2026-01-31');
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO reporting_statement_series (id, statement_profile, submitter_user_id, academic_year_id, from_civil_date, to_civil_date) VALUES ('a7400000-0000-0000-0000-000000000002','PERSONAL_V1','a7100000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001',DATE '2026-01-01',DATE '2026-01-31')$cmd$, '23505', 'S3 exact series key');
INSERT INTO reporting_statement_series (id, statement_profile, submitter_user_id, academic_year_id, from_civil_date, to_civil_date) VALUES ('a7400000-0000-0000-0000-000000000002','PERSONAL_V1','a7100000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001',DATE '2026-02-01',DATE '2026-02-28');
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO reporting_statement_series (id, statement_profile, submitter_user_id, academic_year_id, from_civil_date, to_civil_date) VALUES ('a7400000-0000-0000-0000-000000000003',' ','a7100000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001',DATE '2026-02-01',DATE '2026-01-01')$cmd$, '23514', 'series checks');

INSERT INTO reporting_statement_revisions (id,series_id,snapshot_profile,serializer_version,canonical_snapshot_json,semantic_hash,as_of_instant) VALUES ('a7500000-0000-0000-0000-000000000001','a7400000-0000-0000-0000-000000000001','REPORTING_STATEMENT_SNAPSHOT_V1','v1','{}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',now());
INSERT INTO reporting_statement_revisions (id,series_id,predecessor_revision_id,snapshot_profile,serializer_version,canonical_snapshot_json,semantic_hash,as_of_instant) VALUES ('a7500000-0000-0000-0000-000000000002','a7400000-0000-0000-0000-000000000001','a7500000-0000-0000-0000-000000000001','REPORTING_STATEMENT_SNAPSHOT_V1','v1','{}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',now());
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO reporting_statement_revisions (id,series_id,predecessor_revision_id,snapshot_profile,serializer_version,canonical_snapshot_json,semantic_hash,as_of_instant) VALUES ('a7500000-0000-0000-0000-000000000003','a7400000-0000-0000-0000-000000000002','a7500000-0000-0000-0000-000000000001','p','v','{}','BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',now())$cmd$, '23503', 'S13 cross series lineage');
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO reporting_statement_revisions (id,series_id,predecessor_revision_id,snapshot_profile,serializer_version,canonical_snapshot_json,semantic_hash,as_of_instant) VALUES ('a7500000-0000-0000-0000-000000000003','a7400000-0000-0000-0000-000000000001','a7500000-0000-0000-0000-000000000003','p','v','{}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',now())$cmd$, '23514', 'S13 self lineage');
INSERT INTO reporting_statement_revision_states (revision_id,series_id,lifecycle_state,lifecycle_token) VALUES ('a7500000-0000-0000-0000-000000000001','a7400000-0000-0000-0000-000000000001','APPROVED','a7600000-0000-0000-0000-000000000001'),('a7500000-0000-0000-0000-000000000002','a7400000-0000-0000-0000-000000000001','SUBMITTED','a7600000-0000-0000-0000-000000000002');
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO reporting_statement_revision_states VALUES ('a7500000-0000-0000-0000-000000000003','a7400000-0000-0000-0000-000000000001','SUBMITTED','a7600000-0000-0000-0000-000000000003',now())$cmd$, '23505', 'S5 one submitted');
INSERT INTO reporting_statement_revision_subjects VALUES ('a7500000-0000-0000-0000-000000000001','a7300000-0000-0000-0000-000000000001',now());
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO reporting_statement_revision_subjects VALUES ('a7500000-0000-0000-0000-000000000001','a7300000-0000-0000-0000-000000000001',now())$cmd$, '23505', 'S11 duplicate subject');

INSERT INTO reporting_statement_commands (id,command_type,actor_user_id,request_key,request_fingerprint,series_id,result_revision_id,result_lifecycle_state,result_lifecycle_token,submission_as_of_instant) VALUES ('a7700000-0000-0000-0000-000000000001','SUBMIT','a7100000-0000-0000-0000-000000000001','submit-1','fp-1','a7400000-0000-0000-0000-000000000001','a7500000-0000-0000-0000-000000000002','SUBMITTED','a7600000-0000-0000-0000-000000000002',now());
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO reporting_statement_commands (id,command_type,actor_user_id,request_key,request_fingerprint,series_id,result_revision_id,result_lifecycle_state,result_lifecycle_token,submission_as_of_instant) VALUES ('a7700000-0000-0000-0000-000000000002','SUBMIT','a7100000-0000-0000-0000-000000000001','submit-1','changed','a7400000-0000-0000-0000-000000000001','a7500000-0000-0000-0000-000000000002','SUBMITTED','a7600000-0000-0000-0000-000000000002',now())$cmd$, '23505', 'S9 S10 command identity');
INSERT INTO reporting_statement_histories (id,series_id,revision_id,event_type,state_after,actor_user_id,command_id,lifecycle_token_after,submission_as_of_instant) VALUES ('a7800000-0000-0000-0000-000000000001','a7400000-0000-0000-0000-000000000001','a7500000-0000-0000-0000-000000000002','SUBMITTED','SUBMITTED','a7100000-0000-0000-0000-000000000001','a7700000-0000-0000-0000-000000000001','a7600000-0000-0000-0000-000000000002',now());
SELECT pg_temp.expect_sqlstate($cmd$INSERT INTO reporting_statement_commands (id,command_type,actor_user_id,request_key,request_fingerprint,series_id,result_revision_id,result_lifecycle_state,result_lifecycle_token) VALUES ('a7700000-0000-0000-0000-000000000003','SUBMIT','a7100000-0000-0000-0000-000000000001','submit-2','fp','a7400000-0000-0000-0000-000000000001','a7500000-0000-0000-0000-000000000002','SUBMITTED','a7600000-0000-0000-0000-000000000002')$cmd$, '23514', 'command submit shape');

UPDATE reporting_statement_revision_states SET lifecycle_state = 'SUPERSEDED', lifecycle_token = 'a7600000-0000-0000-0000-000000000004' WHERE revision_id = 'a7500000-0000-0000-0000-000000000001' AND lifecycle_state = 'APPROVED' AND lifecycle_token = 'a7600000-0000-0000-0000-000000000001';
UPDATE reporting_statement_revision_states SET lifecycle_state = 'APPROVED', lifecycle_token = 'a7600000-0000-0000-0000-000000000005' WHERE revision_id = 'a7500000-0000-0000-0000-000000000002' AND lifecycle_state = 'SUBMITTED' AND lifecycle_token = 'a7600000-0000-0000-0000-000000000002';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM reporting_statement_revision_states WHERE revision_id='a7500000-0000-0000-0000-000000000002' AND lifecycle_state='APPROVED') THEN RAISE EXCEPTION 'S8 successor shape failed'; END IF; END $$;
SELECT pg_temp.expect_sqlstate($cmd$DELETE FROM users WHERE id='a7100000-0000-0000-0000-000000000001'$cmd$, '23503', 'S12 user restrict');
SELECT pg_temp.expect_sqlstate($cmd$DELETE FROM academic_years WHERE id='a7200000-0000-0000-0000-000000000001'$cmd$, '23503', 'S12 academic year restrict');
SELECT pg_temp.expect_sqlstate($cmd$DELETE FROM subjects WHERE id='a7300000-0000-0000-0000-000000000001'$cmd$, '23503', 'S12 subject restrict');
SELECT pg_temp.expect_sqlstate($cmd$DELETE FROM reporting_statement_series WHERE id='a7400000-0000-0000-0000-000000000001'$cmd$, '23503', 'S12 series restrict');
SELECT pg_temp.expect_sqlstate($cmd$DELETE FROM reporting_statement_revisions WHERE id='a7500000-0000-0000-0000-000000000002'$cmd$, '23503', 'S12 revision restrict');
SELECT pg_temp.expect_sqlstate($cmd$DELETE FROM reporting_statement_commands WHERE id='a7700000-0000-0000-0000-000000000001'$cmd$, '23503', 'S12 command restrict');
ROLLBACK;
SELECT 'Reporting Statement persistence schema verification S1-S20 foundation PASS' AS result;