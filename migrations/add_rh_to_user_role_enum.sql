-- Migration: Add 'RH' value to user_role enum
-- Run this on your Supabase database (SQL Editor)

-- Step 1: Add RH to the enum type
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'RH';

-- Verify the migration
-- SELECT enum_range(NULL::user_role);
