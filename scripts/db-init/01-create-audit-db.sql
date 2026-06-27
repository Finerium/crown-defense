-- Runs once on first container init. Creates the second (audit) database.
-- POSTGRES_DB already created crowndefense_operational; ADR-013 keeps audit separate.
CREATE DATABASE crowndefense_audit OWNER crowndefense;
