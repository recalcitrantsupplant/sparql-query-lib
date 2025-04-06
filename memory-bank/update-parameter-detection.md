# Plan: Enhance `detectParameters` for SPARQL UPDATE Queries

**Goal:** Modify the `detectParameters` function in `src/lib/parser.ts` to correctly identify parameter groups (defined by `VALUES ... { UNDEF }`) within the `WHERE` clauses of SPARQL `UPDATE` operations (e.g., `INSERT`, `DELETE`), in addition to `SELECT` queries.

**Current Limitation:** The function currently only processes the top-level `where` property of a parsed query object, which is typical for `SELECT` queries. It does not inspect the structure of parsed `UPDATE` queries.

**`sparqljs` Update Structure:**
Parsed `UPDATE` queries typically have:
- `type: "update"`
- An `updates: []` array containing individual update operations.
- Each update operation object within the array (e.g., representing an `INSERT` or `DELETE`) can have its own `where` property containing the patterns for that specific operation's condition.

**Steps to Modify `detectParameters`:**

1.  **Parse the Query:** Keep the initial `const parsedQuery = this.parseQuery(queryString);`.
2.  **Check Query Type:** Add a check for the query type:
    ```typescript
    if (parsedQuery.type === 'update' && Array.isArray(parsedQuery.updates)) {
        // Handle UPDATE queries
        // ...
    } else if (parsedQuery.where) {
        // Handle SELECT/ASK/DESCRIBE/CONSTRUCT queries (existing logic)
        processPatterns(parsedQuery.where);
    }
    ```
3.  **Process `updates` Array:** Inside the `if (parsedQuery.type === 'update')` block, iterate through the `parsedQuery.updates` array.
    ```typescript
    parsedQuery.updates.forEach((updateOperation: any) => {
        // Check if the specific update operation has a 'where' clause
        if (updateOperation.where) {
            // Process the patterns within this update's WHERE clause
            // The existing processPatterns helper should work here
            processPatterns(updateOperation.where);
        }
        // Note: Some update types like INSERT DATA/DELETE DATA might not have a 'where'.
        // Also consider if parameters could appear in INSERT { } or DELETE { } patterns directly (less common for UNDEF).
        // For now, focus on the WHERE clause of INSERT/DELETE operations.
    });
    ```
4.  **Refactor `processPatterns` (If Necessary):** Ensure the existing `processPatterns` helper function correctly handles the pattern structures found within update `WHERE` clauses. It seems robust enough as it recursively checks various pattern types (`group`, `optional`, `union`, etc.), which should cover most cases. No immediate change seems needed here, but keep it in mind during testing.
5.  **Testing:**
    *   Add new test cases to `test/lib/parser.detectParameters.test.ts`.
    *   Include tests for:
        *   `INSERT { ... } WHERE { VALUES ?param { UNDEF } ... }`
        *   `DELETE { ... } WHERE { VALUES ?param { UNDEF } ... }`
        *   `DELETE WHERE { VALUES ?param { UNDEF } ... }` (if applicable)
        *   Queries with multiple `UPDATE` operations in one request.
        *   Mixed `SELECT` and `UPDATE` queries (if the parser is ever used on multi-statement strings, though likely not).
        *   Update queries *without* `UNDEF` parameters to ensure they don't yield false positives.

**Considerations:**

*   **`INSERT DATA`/`DELETE DATA`:** These operations don't have `WHERE` clauses and thus won't have parameters defined this way. The logic should naturally ignore them.
*   **Other Update Types:** Operations like `LOAD`, `CLEAR`, `CREATE`, `DROP`, `COPY`, `MOVE`, `ADD` don't typically use `VALUES { UNDEF }` for parameterization in the same way. The focus remains on `INSERT`/`DELETE` variants with `WHERE`.
*   **`applyArguments`:** The `applyArguments` function will also need similar logic to find the correct `VALUES` clause within `UPDATE` structures to apply the arguments. The steps will mirror those for `detectParameters`.

This plan provides a clear path to extending parameter detection to common SPARQL Update operations.
