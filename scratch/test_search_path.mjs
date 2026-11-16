import { createRequire } from 'module';
const require = createRequire('C:/Users/shiva/AppData/Roaming/npm/node_modules/firebase-tools/');
const { PGlite } = require('@electric-sql/pglite');

async function testSearchPath() {
  const db = new PGlite();
  await db.exec(`
    CREATE OR REPLACE FUNCTION _test_safe_fn() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN NULL; END; $$;
    CREATE OR REPLACE FUNCTION _test_unsafe_fn() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$ BEGIN NULL; END; $$;
    CREATE OR REPLACE FUNCTION _test_unsafe_multi_fn() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public, auth' AS $$ BEGIN NULL; END; $$;

    DO $$
    DECLARE
      v_safe_cfg TEXT[];
      v_unsafe_cfg TEXT[];
      v_unsafe_multi_cfg TEXT[];
      v_negative_caught BOOLEAN := FALSE;
    BEGIN
      SELECT proconfig INTO v_safe_cfg FROM pg_proc WHERE oid = '_test_safe_fn()'::regprocedure;
      SELECT proconfig INTO v_unsafe_cfg FROM pg_proc WHERE oid = '_test_unsafe_fn()'::regprocedure;
      SELECT proconfig INTO v_unsafe_multi_cfg FROM pg_proc WHERE oid = '_test_unsafe_multi_fn()'::regprocedure;

      -- Check safe
      ASSERT (
        (v_safe_cfg @> ARRAY['search_path=""'] OR v_safe_cfg @> ARRAY['search_path='])
        AND NOT EXISTS (
          SELECT 1 FROM unnest(v_safe_cfg) AS cfg
          WHERE cfg ~ '^search_path=.+' AND cfg NOT IN ('search_path=""', 'search_path=')
        )
      ), 'Safe function must pass empty search_path check';

      -- Check unsafe 1
      BEGIN
        ASSERT (
          (v_unsafe_cfg @> ARRAY['search_path=""'] OR v_unsafe_cfg @> ARRAY['search_path='])
          AND NOT EXISTS (
            SELECT 1 FROM unnest(v_unsafe_cfg) AS cfg
            WHERE cfg ~ '^search_path=.+' AND cfg NOT IN ('search_path=""', 'search_path=')
          )
        ), 'Unsafe function should fail';
      EXCEPTION WHEN assert_failure THEN
        v_negative_caught := TRUE;
      END;
      ASSERT v_negative_caught = TRUE, 'Assertion Failed: Unsafe function with search_path=public must FAIL check';

      -- Check unsafe multi
      v_negative_caught := FALSE;
      BEGIN
        ASSERT (
          (v_unsafe_multi_cfg @> ARRAY['search_path=""'] OR v_unsafe_multi_cfg @> ARRAY['search_path='])
          AND NOT EXISTS (
            SELECT 1 FROM unnest(v_unsafe_multi_cfg) AS cfg
            WHERE cfg ~ '^search_path=.+' AND cfg NOT IN ('search_path=""', 'search_path=')
          )
        ), 'Unsafe multi function should fail';
      EXCEPTION WHEN assert_failure THEN
        v_negative_caught := TRUE;
      END;
      ASSERT v_negative_caught = TRUE, 'Assertion Failed: Unsafe function with search_path=public, auth must FAIL check';
    END $$;
  `);
  console.log('Search path exact check and negative tests PASSED!');
}

testSearchPath().catch(console.error);
