-- ============================================================================
-- RHK-CADcam — Hinge split-body "arm fold" fraction
-- ----------------------------------------------------------------------------
-- Run once in the Supabase SQL editor (idempotent).
--
-- Adds a per-hinge knob controlling how far the gable-side back-arm mesh
-- (HingeArm) of a SPLIT hinge body folds when the door swings, as a fraction of
-- the door's open angle:
--    0   = arm stays put
--    0.5 = arm folds half the door angle (default — a believable knuckle fold)
--    1   = arm matches the door
-- Ignored when the body GLB has no HingeArm mesh (one-piece bodies just swing
-- with the door).
-- ============================================================================

ALTER TABLE public.hardware_hinges
  ADD COLUMN IF NOT EXISTS model_arm_fold_fraction numeric NOT NULL DEFAULT 0.5;

COMMENT ON COLUMN public.hardware_hinges.model_arm_fold_fraction IS
  'Split hinge body: fraction of the door open angle the gable-side HingeArm mesh folds (0=static, 0.5=half, 1=matches door).';
