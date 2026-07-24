\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

\echo '== Identity =='
SELECT current_database(), current_schema(), version();

\echo '== Exact row counts =='
WITH user_tables AS (
  SELECT schemaname, tablename
  FROM pg_catalog.pg_tables
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
),
row_counts AS (
  SELECT
    schemaname,
    tablename,
    (
      xpath(
        '/row/count/text()',
        query_to_xml(
          format(
            'SELECT count(*) AS count FROM %I.%I',
            schemaname,
            tablename
          ),
          false,
          true,
          ''
        )
      )
    )[1]::text::bigint AS row_count
  FROM user_tables
)
SELECT jsonb_object_agg(
  schemaname || '.' || tablename,
  row_count
  ORDER BY schemaname, tablename
) AS row_counts
FROM row_counts;

\echo '== Catalog fingerprints =='
SELECT md5(
  string_agg(
    table_schema || '.' || table_name || '.' || column_name || ':' ||
    data_type || ':' || is_nullable || ':' || COALESCE(column_default, ''),
    E'\n'
    ORDER BY table_schema, table_name, ordinal_position
  )
) AS columns_fingerprint
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema');

SELECT md5(
  string_agg(
    namespace.nspname || '.' || relation.relname || '.' ||
    constraint_record.conname || ':' ||
    pg_get_constraintdef(constraint_record.oid),
    E'\n'
    ORDER BY namespace.nspname, relation.relname, constraint_record.conname
  )
) AS constraints_fingerprint
FROM pg_catalog.pg_constraint AS constraint_record
JOIN pg_catalog.pg_class AS relation
  ON relation.oid = constraint_record.conrelid
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema');

SELECT md5(
  string_agg(
    schemaname || '.' || tablename || '.' || indexname || ':' || indexdef,
    E'\n'
    ORDER BY schemaname, tablename, indexname
  )
) AS indexes_fingerprint
FROM pg_catalog.pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema');

\echo '== Prisma migration fingerprint =='
SELECT
  count(*) AS migration_rows,
  md5(
    string_agg(
      migration_name || ':' ||
      COALESCE(finished_at::text, '') || ':' ||
      COALESCE(rolled_back_at::text, '') || ':' ||
      applied_steps_count::text,
      E'\n'
      ORDER BY started_at, id
    )
  ) AS migrations_fingerprint
FROM public._prisma_migrations;

ROLLBACK;
