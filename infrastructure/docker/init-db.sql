-- Initialize extensions for Bostonia database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create additional databases for testing
CREATE DATABASE bostonia_test;
GRANT ALL PRIVILEGES ON DATABASE bostonia_test TO bostonia;
