# Plan: Detect LIMIT, OFFSET, and HAVING Parameters

This document outlines the plan to extend the SPARQL query parser to detect `LIMIT`, `OFFSET`, and `HAVING` clauses that use specific placeholder formats (`LIMIT 001`, `OFFSET 001`, etc.) as parameters.

## Steps

1.  **Update Ontology (`src/ontology/sparql-query-lib.nt`):**
    *   Define new `rdf:Property` entries:
        *   `sq:hasLimitParameter` (range `xsd:string`)
        *   `sq:hasOffsetParameter` (range `xsd:string`)
        *   `sq:hasHavingParameter` (range `xsd:string`) - *Need to confirm the exact placeholder format for HAVING.*
    *   Add these properties to the `rdfs:domain` of the `sq:Query` class.

2.  **Generate TypeScript Definitions:**
    *   Run `node src/ontology/generate-and-fix.js` to update `src/types/schema-dts.ts`.

3.  **Enhance Parser Logic (`src/lib/parser.ts`):**
    *   Modify the `detectParameters` function.
    *   Implement logic (likely using regex on the raw query string *before* full parsing, or potentially extending the `sparqljs` visitor) to find patterns like:
        *   `LIMIT\s+(\d{3,})`
        *   `OFFSET\s+(\d{3,})`
        *   A similar pattern for `HAVING` (e.g., `HAVING\s+\(.*\bPARAM\d{3,}\b.*\)` - needs refinement based on expected structure).
    *   Extract the *full matched placeholder* (e.g., "LIMIT 001", "OFFSET 002") as the parameter identifier.
    *   Store these identifiers in the appropriate fields of the `ParsedQuery` result (e.g., `limitParameters`, `offsetParameters`, `havingParameters`).

4.  **Update Entity Management (`src/lib/EntityManager.ts`, `src/lib/QueryOrchestrator.ts`):**
    *   Modify the mapping logic within `EntityManager` (or related functions) to handle the new parameter types.
    *   Ensure `QueryOrchestrator.createQuery` and `updateQuery` correctly process and store these parameters using the new ontology properties (`sq:hasLimitParameter`, etc.).
    *   Verify that `getQuery` retrieves these parameters correctly.

5.  **Add/Update Tests:**
    *   In `test/lib/parser.detectParameters.test.ts`: Add tests specifically for detecting `LIMIT`, `OFFSET`, and `HAVING` parameters with the `00X` format.
    *   In `test/routes/queries/detectParameters.test.ts`: Add integration tests to ensure the API endpoint correctly identifies and returns these parameters.
    *   Cover edge cases: multiple parameters, no parameters, parameters mixed with regular clauses.

6.  **Refine HAVING Parameter Format:**
    *   Clarify the exact expected format for `HAVING` parameters (e.g., `HAVING (?count > HAVING_PARAM_001)`). Update Step 1 and 3 accordingly.
