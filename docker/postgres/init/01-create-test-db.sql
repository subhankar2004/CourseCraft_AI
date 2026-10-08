-- Runs once, on first start of an empty postgres volume.
-- A separate database for automated tests so they never touch dev data.
CREATE DATABASE coursecraft_test;
