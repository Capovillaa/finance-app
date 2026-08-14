-- Runs once on first cluster init (docker-entrypoint-initdb.d).
-- Extensions themselves are created by the migrations so that every database
-- (dev, test, CI, production) goes through the same code path.
SELECT 'CREATE DATABASE finance_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'finance_test')\gexec
