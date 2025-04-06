# Active Context
## Next Steps (Immediate)

1.  **COMPLETE:** Secure Argument Handling in Execution Route (using `SparqlQueryParser.applyArguments` and `VALUES` pattern).
2.  **Implement QueryGroup Execution:** Enhance `src/routes/execute.ts` to handle the execution of `QueryGroup` entities.
3.  **Implement ASK Query Support:** Add `askQuery` method to `ISparqlExecutor` and corresponding implementations, and update `execute.ts`.
4.  **Add API Tests:** Start adding integration tests for the API routes (`/api/backends`, `/api/queries`, `/api/libraries`, `/api/queryGroups`, `/api/execute`) to ensure they function correctly.
5.  **Refine `QueryGroup` Schema/Types:** Ensure the `nodes` and `edges` properties in `QueryGroup` schemas and types fully support the required execution logic (potentially adding fields if needed). (Partially addressed during route creation, may need further refinement).


## Recent Changes & Decisions

*   **CRUD Routes Complete:** CRUD routes for `Backend`, `StoredQuery`, `Library`, and `QueryGroup` entities implemented and registered.
*   **Execution Route Enhanced:** `/api/execute` route updated to:
    *   Use safe argument parsing (`SparqlQueryParser.applyArguments`).
    *   Dynamically instantiate `ISparqlExecutor` based on `Backend.backendType`.
*   **Ontology Updated:** Added `backendType` property to `Backend` class. Types regenerated.
*   **Schema Refactoring:** Extracted Fastify schemas from individual route files into a central `src/schemas.ts` file and updated routes/index.ts accordingly.
*   **Factory Pattern Implemented:** Centralized entity creation logic (`StoredQuery`, `Library`, `Backend`) into factory functions in `src/lib/factories.ts`. Updated POST routes and creation schemas.
*   **Cleanup:** Removed old file-based storage and related tests.

## Key Patterns & Preferences

*   Use the Factory Pattern (`src/lib/factories.ts`) for creating new `schema-dts.ts` entities via API routes.
*   Use `EntityManager` for all persistence operations related to `schema-dts.ts` entities.
*   Structure API routes as Fastify plugins within the `src/routes/` directory.
*   Pass the `EntityManager` instance to route plugins via options during registration in `src/index.ts`.
*   Maintain clear separation between internal persistence logic and external query execution logic.
*   Keep memory bank files (`code-status.md`, `progress.md`, `activeContext.md`, `systemPatterns.md`) updated with significant changes.
