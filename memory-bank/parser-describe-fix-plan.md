# Plan to Fix Parameter Detection in DESCRIBE Queries

**Problem:**
- The `detectParameters` function in `src/lib/parser.ts` fails to identify `VALUES` clauses containing `UNDEF` (used for parameter injection) when they are located within a nested `SELECT` query inside a `DESCRIBE` query.
- Example query provided by user shows this issue: the `VALUES ?assessment { UNDEF }` is detected when the `DESCRIBE` is commented out, but not when it's active.

**Root Cause:**
- The `sparqljs` parser generates an AST where the nested `SELECT` appears as a distinct `query` node within the `DESCRIBE` structure.
- The current recursive `processPatterns` function in `detectParameters` does not explicitly check for or recurse into these nested `query` nodes to find `VALUES` clauses within their `where` blocks.

**Solution:**
1.  **Modify `src/lib/parser.ts`:**
    - Enhance the `processPatterns` function within the `detectParameters` method.
    - Add logic to check if a pattern has `type: 'query'`.
    - If it's a nested query, recursively call `processPatterns` on its `where` property (if it exists) to search for `VALUES` clauses within the nested query.

**Testing Strategy:**
1.  **Modify `test/lib/parser.detectParameters.test.ts`:**
    - **Test 1 (Control):** Add a test using the user's query with the `DESCRIBE` commented out. Assert that `['assessment']` is detected.
    - **Test 2 (Failure/Verification):** Add a test using the full user query with the `DESCRIBE` uncommented.
        - This test should initially fail (demonstrating the bug).
        - After applying the code fix, this test should pass, asserting that `['assessment']` is detected.
