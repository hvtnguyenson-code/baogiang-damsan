-- P2-002: PPCT curricular component persistence foundation and control plane realignment.
-- Implements ADR-048 physical persistence contracts and data-preserving backfill.

-- Step 1: Create enum types for PPCT curricular components and class applicability profiles.
CREATE TYPE "PpctCurricularComponent" AS ENUM ('CORE', 'SPECIALIZED_STUDY');
CREATE TYPE "PpctClassCurricularProfile" AS ENUM ('CORE_ONLY', 'CORE_PLUS_SPECIALIZED_STUDY');

-- Step 2: Add temporarily nullable component columns to ppct_items, ppct_item_revisions, and ppct_item_lineage.
ALTER TABLE "ppct_items" ADD COLUMN "component" "PpctCurricularComponent";
ALTER TABLE "ppct_item_revisions" ADD COLUMN "component" "PpctCurricularComponent";
ALTER TABLE "ppct_item_lineage" ADD COLUMN "component" "PpctCurricularComponent";

-- Step 3: Backfill all historical rows with component = 'CORE'.
UPDATE "ppct_items" SET "component" = 'CORE' WHERE "component" IS NULL;
UPDATE "ppct_item_revisions" SET "component" = 'CORE' WHERE "component" IS NULL;
UPDATE "ppct_item_lineage" SET "component" = 'CORE' WHERE "component" IS NULL;

-- Step 4: Add temporarily nullable curricular_profile to ppct_class_associations and backfill with 'CORE_ONLY'.
ALTER TABLE "ppct_class_associations" ADD COLUMN "curricular_profile" "PpctClassCurricularProfile";
UPDATE "ppct_class_associations" SET "curricular_profile" = 'CORE_ONLY' WHERE "curricular_profile" IS NULL;

-- Step 5: Enforce NOT NULL constraints on all new columns.
ALTER TABLE "ppct_items" ALTER COLUMN "component" SET NOT NULL;
ALTER TABLE "ppct_item_revisions" ALTER COLUMN "component" SET NOT NULL;
ALTER TABLE "ppct_item_lineage" ALTER COLUMN "component" SET NOT NULL;
ALTER TABLE "ppct_class_associations" ALTER COLUMN "curricular_profile" SET NOT NULL;

-- Step 6: Establish PpctItem composite identity/component uniqueness.
CREATE UNIQUE INDEX "ppct_items_identity_component_key"
    ON "ppct_items"("id", "ppct_plan_id", "component");

-- Step 7: Establish component-aware composite foreign key from PpctItemRevision to PpctItem.
ALTER TABLE "ppct_item_revisions" DROP CONSTRAINT "ppct_item_revisions_item_plan_fkey";
ALTER TABLE "ppct_item_revisions"
    ADD CONSTRAINT "ppct_item_revisions_item_plan_component_fkey"
    FOREIGN KEY ("ppct_item_id", "ppct_plan_id", "component")
    REFERENCES "ppct_items"("id", "ppct_plan_id", "component")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Step 8: Add component-aware provenance unique on PpctItemRevision while preserving historical uniques.
CREATE UNIQUE INDEX "ppct_item_revisions_provenance_component_key"
    ON "ppct_item_revisions"("ppct_version_id", "ppct_item_id", "ppct_plan_id", "component");

-- Step 9: Establish component-aware composite foreign keys on PpctItemLineage predecessor and successor edges.
ALTER TABLE "ppct_item_lineage" DROP CONSTRAINT "ppct_item_lineage_predecessor_revision_fkey";
ALTER TABLE "ppct_item_lineage" DROP CONSTRAINT "ppct_item_lineage_successor_revision_fkey";

ALTER TABLE "ppct_item_lineage"
    ADD CONSTRAINT "ppct_item_lineage_predecessor_revision_fkey"
    FOREIGN KEY ("predecessor_version_id", "predecessor_item_id", "ppct_plan_id", "component")
    REFERENCES "ppct_item_revisions"("ppct_version_id", "ppct_item_id", "ppct_plan_id", "component")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ppct_item_lineage"
    ADD CONSTRAINT "ppct_item_lineage_successor_revision_fkey"
    FOREIGN KEY ("successor_version_id", "successor_item_id", "ppct_plan_id", "component")
    REFERENCES "ppct_item_revisions"("ppct_version_id", "ppct_item_id", "ppct_plan_id", "component")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Step 10: Replace legacy version-wide sequence uniqueness with version + component + sequence uniqueness.
DROP INDEX "ppct_item_revisions_version_sequence_key";
CREATE UNIQUE INDEX "ppct_item_revisions_version_component_sequence_key"
    ON "ppct_item_revisions"("ppct_version_id", "component", "sequence");
