\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_user2_id UUID := gen_random_uuid();
  v_ay_id UUID := gen_random_uuid();
  v_stream_sw UUID;
  v_stream_ay UUID;
  v_stream_lineage UUID;
  v_v1 UUID;
  v_v2 UUID;
  v_v_published UUID;
  v_v_reversed UUID;
  v_cmd_id UUID;
BEGIN
  -- Setup test dependencies
  INSERT INTO "users" ("id", "username", "password_hash", "status")
  VALUES
    (v_user_id, 'bc_test_user_1', 'hash1', 'ACTIVE'),
    (v_user2_id, 'bc_test_user_2', 'hash2', 'ACTIVE');

  INSERT INTO "academic_years" ("id", "code", "name")
  VALUES (v_ay_id, '2026-2027-BC', 'Nam hoc 2026-2027 BC');

  -- =========================================================================
  -- A. Resource / stream invariants (1 - 7)
  -- =========================================================================

  -- 1. SCHOOL_WIDE + academicYearId NULL PASS.
  INSERT INTO "business_policy_streams" ("id", "family_key", "resource_kind", "academic_year_id")
  VALUES (gen_random_uuid(), 'FAMILY_SW_1', 'SCHOOL_WIDE', NULL)
  RETURNING "id" INTO v_stream_sw;

  -- 2. SCHOOL_WIDE + non-null AcademicYear FAIL.
  BEGIN
    INSERT INTO "business_policy_streams" ("family_key", "resource_kind", "academic_year_id")
    VALUES ('FAMILY_SW_INVALID', 'SCHOOL_WIDE', v_ay_id);
    RAISE EXCEPTION 'Invariant 2 failed: SCHOOL_WIDE with academicYearId must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 3. ACADEMIC_YEAR + NULL FAIL.
  BEGIN
    INSERT INTO "business_policy_streams" ("family_key", "resource_kind", "academic_year_id")
    VALUES ('FAMILY_AY_INVALID', 'ACADEMIC_YEAR', NULL);
    RAISE EXCEPTION 'Invariant 3 failed: ACADEMIC_YEAR with NULL academicYearId must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4. ACADEMIC_YEAR + valid AcademicYear PASS.
  INSERT INTO "business_policy_streams" ("id", "family_key", "resource_kind", "academic_year_id")
  VALUES (gen_random_uuid(), 'FAMILY_AY_1', 'ACADEMIC_YEAR', v_ay_id)
  RETURNING "id" INTO v_stream_ay;

  -- 5. duplicate SCHOOL_WIDE family stream FAIL.
  BEGIN
    INSERT INTO "business_policy_streams" ("family_key", "resource_kind", "academic_year_id")
    VALUES ('FAMILY_SW_1', 'SCHOOL_WIDE', NULL);
    RAISE EXCEPTION 'Invariant 5 failed: duplicate SCHOOL_WIDE family stream must fail';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 6. duplicate family + same AcademicYear FAIL.
  BEGIN
    INSERT INTO "business_policy_streams" ("family_key", "resource_kind", "academic_year_id")
    VALUES ('FAMILY_AY_1', 'ACADEMIC_YEAR', v_ay_id);
    RAISE EXCEPTION 'Invariant 6 failed: duplicate ACADEMIC_YEAR stream for same year must fail';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 7. delete referenced AcademicYear FAIL.
  BEGIN
    DELETE FROM "academic_years" WHERE "id" = v_ay_id;
    RAISE EXCEPTION 'Invariant 7 failed: deleting referenced AcademicYear must fail FK';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- =========================================================================
  -- B. Version / lifecycle invariants (8 - 15)
  -- =========================================================================

  -- 8. effectiveUntil < effectiveFrom FAIL.
  BEGIN
    INSERT INTO "business_policy_versions" (
      "stream_id", "version_number", "status", "payload", "validator_version",
      "effective_from", "effective_until", "created_by_user_id"
    ) VALUES (
      v_stream_sw, 1, 'DRAFT', '{"k":"v"}', 'v1',
      DATE '2026-09-10', DATE '2026-09-01', v_user_id
    );
    RAISE EXCEPTION 'Invariant 8 failed: effectiveUntil < effectiveFrom must fail interval check';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 10. valid DRAFT PASS.
  INSERT INTO "business_policy_versions" (
    "id", "stream_id", "version_number", "status", "payload", "validator_version",
    "effective_from", "effective_until", "created_by_user_id"
  ) VALUES (
    gen_random_uuid(), v_stream_sw, 1, 'DRAFT', '{"enabled":true}', 'v1',
    DATE '2026-09-01', DATE '2026-09-30', v_user_id
  ) RETURNING "id" INTO v_v1;

  -- 9. duplicate versionNumber same stream FAIL.
  BEGIN
    INSERT INTO "business_policy_versions" (
      "stream_id", "version_number", "status", "payload", "validator_version",
      "effective_from", "effective_until", "created_by_user_id"
    ) VALUES (
      v_stream_sw, 1, 'DRAFT', '{"enabled":false}', 'v1',
      DATE '2026-09-01', DATE '2026-09-30', v_user_id
    );
    RAISE EXCEPTION 'Invariant 9 failed: duplicate version_number in same stream must fail';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 11. malformed DRAFT evidence FAIL. (DRAFT must not have published_by_user_id)
  BEGIN
    INSERT INTO "business_policy_versions" (
      "stream_id", "version_number", "status", "payload", "validator_version",
      "effective_from", "effective_until", "created_by_user_id", "published_by_user_id", "published_at"
    ) VALUES (
      v_stream_sw, 2, 'DRAFT', '{"enabled":true}', 'v1',
      DATE '2026-10-01', DATE '2026-10-31', v_user_id, v_user_id, NOW()
    );
    RAISE EXCEPTION 'Invariant 11 failed: DRAFT with published evidence must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 12. valid PUBLISHED PASS.
  INSERT INTO "business_policy_versions" (
    "id", "stream_id", "version_number", "status", "payload", "validator_version",
    "effective_from", "effective_until", "created_by_user_id", "published_by_user_id", "published_at"
  ) VALUES (
    gen_random_uuid(), v_stream_sw, 2, 'PUBLISHED', '{"enabled":true}', 'v1',
    DATE '2026-10-01', DATE '2026-10-10', v_user_id, v_user_id, NOW()
  ) RETURNING "id" INTO v_v_published;

  -- 13. malformed PUBLISHED evidence FAIL. (PUBLISHED without published_by_user_id)
  BEGIN
    INSERT INTO "business_policy_versions" (
      "stream_id", "version_number", "status", "payload", "validator_version",
      "effective_from", "effective_until", "created_by_user_id"
    ) VALUES (
      v_stream_sw, 3, 'PUBLISHED', '{"enabled":true}', 'v1',
      DATE '2026-11-01', DATE '2026-11-30', v_user_id
    );
    RAISE EXCEPTION 'Invariant 13 failed: PUBLISHED without published evidence must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 14. valid REVERSED PASS.
  INSERT INTO "business_policy_versions" (
    "id", "stream_id", "version_number", "status", "payload", "validator_version",
    "effective_from", "effective_until", "created_by_user_id",
    "published_by_user_id", "published_at",
    "reversed_by_user_id", "reversed_at", "correction_reason"
  ) VALUES (
    gen_random_uuid(), v_stream_sw, 3, 'REVERSED', '{"enabled":true}', 'v1',
    DATE '2026-11-01', DATE '2026-11-10', v_user_id,
    v_user_id, NOW(),
    v_user2_id, NOW(), 'Sửa lỗi nhập sai'
  ) RETURNING "id" INTO v_v_reversed;

  -- 15. malformed REVERSED evidence FAIL. (empty correction_reason)
  BEGIN
    INSERT INTO "business_policy_versions" (
      "stream_id", "version_number", "status", "payload", "validator_version",
      "effective_from", "effective_until", "created_by_user_id",
      "published_by_user_id", "published_at",
      "reversed_by_user_id", "reversed_at", "correction_reason"
    ) VALUES (
      v_stream_sw, 4, 'REVERSED', '{"enabled":true}', 'v1',
      DATE '2026-11-11', DATE '2026-11-20', v_user_id,
      v_user_id, NOW(),
      v_user2_id, NOW(), '   '
    );
    RAISE EXCEPTION 'Invariant 15 failed: REVERSED with empty correction reason must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- =========================================================================
  -- C. Lineage invariants (16 - 18)
  -- =========================================================================

  INSERT INTO "business_policy_streams" ("id", "family_key", "resource_kind", "academic_year_id")
  VALUES (gen_random_uuid(), 'FAMILY_LINEAGE_TEST', 'SCHOOL_WIDE', NULL)
  RETURNING "id" INTO v_stream_lineage;

  -- 16. self replacement/correction lineage FAIL.
  BEGIN
    INSERT INTO "business_policy_versions" (
      "id", "stream_id", "version_number", "status", "payload", "validator_version",
      "effective_from", "effective_until", "created_by_user_id", "replaces_version_id"
    ) VALUES (
      'cccccccc-0000-0000-0000-000000000001', v_stream_lineage, 1, 'DRAFT', '{"a":1}', 'v1',
      DATE '2026-09-01', NULL, v_user_id, 'cccccccc-0000-0000-0000-000000000001'
    );
    RAISE EXCEPTION 'Invariant 16 failed: self lineage must fail check constraint';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Insert base version in v_stream_lineage
  INSERT INTO "business_policy_versions" (
    "id", "stream_id", "version_number", "status", "payload", "validator_version",
    "effective_from", "effective_until", "created_by_user_id", "published_by_user_id", "published_at"
  ) VALUES (
    'cccccccc-0000-0000-0000-000000000001', v_stream_lineage, 1, 'PUBLISHED', '{"a":1}', 'v1',
    DATE '2026-09-01', DATE '2026-09-10', v_user_id, v_user_id, NOW()
  );

  -- 17. cross-stream lineage FAIL. (replaces_version_id pointing to version in v_stream_sw)
  BEGIN
    INSERT INTO "business_policy_versions" (
      "stream_id", "version_number", "status", "payload", "validator_version",
      "effective_from", "effective_until", "created_by_user_id", "replaces_version_id"
    ) VALUES (
      v_stream_lineage, 2, 'DRAFT', '{"a":2}', 'v1',
      DATE '2026-09-11', NULL, v_user_id, v_v_published
    );
    RAISE EXCEPTION 'Invariant 17 failed: cross-stream lineage must fail trigger';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- 18. valid same-stream lineage PASS.
  INSERT INTO "business_policy_versions" (
    "id", "stream_id", "version_number", "status", "payload", "validator_version",
    "effective_from", "effective_until", "created_by_user_id", "replaces_version_id"
  ) VALUES (
    gen_random_uuid(), v_stream_lineage, 2, 'DRAFT', '{"a":2}', 'v1',
    DATE '2026-09-11', NULL, v_user_id, 'cccccccc-0000-0000-0000-000000000001'
  );

  -- =========================================================================
  -- D. Effectivity / authority invariants (19 - 23)
  -- =========================================================================

  -- Stream for effectivity tests
  INSERT INTO "business_policy_streams" ("id", "family_key", "resource_kind", "academic_year_id")
  VALUES (gen_random_uuid(), 'FAMILY_EFFECTIVITY', 'SCHOOL_WIDE', NULL)
  RETURNING "id" INTO v_stream_lineage;

  -- Version A: 2026-09-01..2026-09-10 PUBLISHED
  INSERT INTO "business_policy_versions" (
    "id", "stream_id", "version_number", "status", "payload", "validator_version",
    "effective_from", "effective_until", "created_by_user_id", "published_by_user_id", "published_at"
  ) VALUES (
    gen_random_uuid(), v_stream_lineage, 1, 'PUBLISHED', '{"x":1}', 'v1',
    DATE '2026-09-01', DATE '2026-09-10', v_user_id, v_user_id, NOW()
  );

  -- 19. inclusive overlap FAIL (2026-09-10..2026-09-20 overlaps on 2026-09-10).
  BEGIN
    INSERT INTO "business_policy_versions" (
      "stream_id", "version_number", "status", "payload", "validator_version",
      "effective_from", "effective_until", "created_by_user_id", "published_by_user_id", "published_at"
    ) VALUES (
      v_stream_lineage, 2, 'PUBLISHED', '{"x":2}', 'v1',
      DATE '2026-09-10', DATE '2026-09-20', v_user_id, v_user_id, NOW()
    );
    RAISE EXCEPTION 'Invariant 19 failed: inclusive overlap must fail exclusion constraint';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  -- 20. adjacent PASS (2026-09-11..2026-09-20 is adjacent).
  INSERT INTO "business_policy_versions" (
    "id", "stream_id", "version_number", "status", "payload", "validator_version",
    "effective_from", "effective_until", "created_by_user_id", "published_by_user_id", "published_at"
  ) VALUES (
    gen_random_uuid(), v_stream_lineage, 2, 'PUBLISHED', '{"x":2}', 'v1',
    DATE '2026-09-11', DATE '2026-09-20', v_user_id, v_user_id, NOW()
  );

  -- 21. deliberate gap PASS (2026-09-25..2026-09-30 has gap 21..24).
  INSERT INTO "business_policy_versions" (
    "id", "stream_id", "version_number", "status", "payload", "validator_version",
    "effective_from", "effective_until", "created_by_user_id", "published_by_user_id", "published_at"
  ) VALUES (
    gen_random_uuid(), v_stream_lineage, 3, 'PUBLISHED', '{"x":3}', 'v1',
    DATE '2026-09-25', DATE '2026-09-30', v_user_id, v_user_id, NOW()
  );

  -- Insert open-ended version: 2026-10-01..NULL
  INSERT INTO "business_policy_versions" (
    "id", "stream_id", "version_number", "status", "payload", "validator_version",
    "effective_from", "effective_until", "created_by_user_id", "published_by_user_id", "published_at"
  ) VALUES (
    gen_random_uuid(), v_stream_lineage, 4, 'PUBLISHED', '{"x":4}', 'v1',
    DATE '2026-10-01', NULL, v_user_id, v_user_id, NOW()
  ) RETURNING "id" INTO v_v2;

  -- 22. open-ended overlap FAIL (2026-10-15..2026-10-20 overlaps with 2026-10-01..NULL).
  BEGIN
    INSERT INTO "business_policy_versions" (
      "stream_id", "version_number", "status", "payload", "validator_version",
      "effective_from", "effective_until", "created_by_user_id", "published_by_user_id", "published_at"
    ) VALUES (
      v_stream_lineage, 5, 'PUBLISHED', '{"x":5}', 'v1',
      DATE '2026-10-15', DATE '2026-10-20', v_user_id, v_user_id, NOW()
    );
    RAISE EXCEPTION 'Invariant 22 failed: open-ended overlap must fail exclusion constraint';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  -- 23. REVERSED row no longer acts as active authority.
  -- In v_stream_sw, v_v_reversed is REVERSED for 2026-11-01..2026-11-10.
  -- Inserting a PUBLISHED version for the exact same date range must PASS!
  INSERT INTO "business_policy_versions" (
    "id", "stream_id", "version_number", "status", "payload", "validator_version",
    "effective_from", "effective_until", "created_by_user_id", "published_by_user_id", "published_at"
  ) VALUES (
    gen_random_uuid(), v_stream_sw, 5, 'PUBLISHED', '{"corrected":true}', 'v1',
    DATE '2026-11-01', DATE '2026-11-10', v_user_id, v_user_id, NOW()
  );

  -- =========================================================================
  -- E. Published immutability invariants (24 - 27)
  -- =========================================================================

  -- 24. direct SQL update payload FAIL.
  BEGIN
    UPDATE "business_policy_versions" SET "payload" = '{"tampered":true}' WHERE "id" = v_v_published;
    RAISE EXCEPTION 'Invariant 24 failed: direct update payload on PUBLISHED version must fail';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- 25. direct SQL update validator version FAIL.
  BEGIN
    UPDATE "business_policy_versions" SET "validator_version" = 'v999' WHERE "id" = v_v_published;
    RAISE EXCEPTION 'Invariant 25 failed: direct update validator_version on PUBLISHED version must fail';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- 26. direct SQL update effectiveFrom FAIL.
  BEGIN
    UPDATE "business_policy_versions" SET "effective_from" = DATE '2026-01-01' WHERE "id" = v_v_published;
    RAISE EXCEPTION 'Invariant 26 failed: direct update effective_from on PUBLISHED version must fail';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- 27. prohibited stream/resource identity mutation FAIL.
  BEGIN
    UPDATE "business_policy_versions" SET "stream_id" = v_stream_ay WHERE "id" = v_v_published;
    RAISE EXCEPTION 'Invariant 27 failed: direct update stream_id on PUBLISHED version must fail';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- =========================================================================
  -- F. Allowed lifecycle mutation (28 - 29)
  -- =========================================================================

  -- 28. intended effectiveUntil close PASS. (v_v2 is open-ended PUBLISHED: 2026-10-01..NULL)
  UPDATE "business_policy_versions" SET "effective_until" = DATE '2026-10-15' WHERE "id" = v_v2;

  -- 29. unrelated semantic mutation still FAIL (updating closed effective_until or payload).
  BEGIN
    UPDATE "business_policy_versions" SET "payload" = '{"hacked":true}' WHERE "id" = v_v2;
    RAISE EXCEPTION 'Invariant 29 failed: semantic mutation on closed PUBLISHED version must fail';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- =========================================================================
  -- G. Command receipt invariants (30 - 32)
  -- =========================================================================

  -- 30. actor + command identity unique PASS.
  INSERT INTO "business_policy_commands" ("id", "actor_user_id", "command_id", "fingerprint", "result")
  VALUES (gen_random_uuid(), v_user_id, 'cmd-001', repeat('a', 64), '{"status":"ok"}')
  RETURNING "id" INTO v_cmd_id;

  -- 31. conflicting duplicate receipt FAIL.
  BEGIN
    INSERT INTO "business_policy_commands" ("actor_user_id", "command_id", "fingerprint", "result")
    VALUES (v_user_id, 'cmd-001', repeat('b', 64), '{"status":"dup"}');
    RAISE EXCEPTION 'Invariant 31 failed: duplicate (actor, command_id) must fail unique constraint';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 32. required command/fingerprint shape constraints FAIL on blank command or short fingerprint.
  BEGIN
    INSERT INTO "business_policy_commands" ("actor_user_id", "command_id", "fingerprint", "result")
    VALUES (v_user_id, '   ', repeat('a', 64), '{"status":"ok"}');
    RAISE EXCEPTION 'Invariant 32 failed: empty command_id must fail shape check';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "business_policy_commands" ("actor_user_id", "command_id", "fingerprint", "result")
    VALUES (v_user_id, 'cmd-002', 'short_fp', '{"status":"ok"}');
    RAISE EXCEPTION 'Invariant 32 failed: short fingerprint must fail shape check';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- =========================================================================
  -- H. Retention invariants (33 - 34)
  -- =========================================================================

  -- 33. retained stream/version cannot be inconsistently deleted.
  -- Deleting a stream with versions must FAIL via FK RESTRICT.
  BEGIN
    DELETE FROM "business_policy_streams" WHERE "id" = v_stream_sw;
    RAISE EXCEPTION 'Invariant 33 failed: stream with versions cannot be deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- 34. AcademicYear FK prevents orphan resource.
  -- Deleting academic_year referenced by stream v_stream_ay must FAIL.
  BEGIN
    DELETE FROM "academic_years" WHERE "id" = v_ay_id;
    RAISE EXCEPTION 'Invariant 34 failed: AcademicYear with stream cannot be deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

END $$;

ROLLBACK;
