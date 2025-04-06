# Query Chaining Implementation Plan

## Objective

Implement functionality to execute a `QueryGroup` where the output of one query node (`fromNode`, specifically a `SELECT` query returning SPARQL Results JSON) is transformed and used as input parameters for a subsequent query node (`toNode`), guided by the mappings defined in a `QueryEdge`.

## Current State Analysis

*   **Schema (`src/types/schema-dts.ts`):** Defines `QueryGroup`, `QueryNode`, `QueryEdge`, and `ParameterMapping`, which are suitable for representing the chaining structure.
*   **Parameter Detection (`src/lib/parser.ts::detectParameters`):** Identifies parameterizable `VALUES` clauses (those containing an `UNDEF` row) within a SPARQL query.
*   **Parameter Application (`src/lib/parser.ts::applyArguments`):** Injects data into `VALUES` clauses. It expects input data in the format `{ head: { vars: [...] }, arguments: [...] }` and matches variables based on `head.vars`. It requires the number of argument sets provided to match the number of `UNDEF` `VALUES` clauses found in order.

## Gaps and Required Implementation Steps

1.  **Input Data Transformation:**
    *   **Need:** Convert SPARQL Results JSON (`{ head: { vars: [...] }, results: { bindings: [...] } }`) from the `fromNode` into the format expected by `applyArguments` (`{ head: { vars: [...] }, arguments: [...] }`).
    *   **Action:** Create a `transformSparqlResultsToArguments` function.

2.  **Parameter Name Mapping:**
    *   **Need:** Apply the `ParameterMapping` (`fromParam` -> `toParam`) defined in the `QueryEdge` during the transformation. This involves renaming variables in both the `head.vars` array and the keys within the `arguments` array of the transformed data structure.
    *   **Action:** Incorporate mapping logic into the `transformSparqlResultsToArguments` function.

3.  **Execution Orchestration:**
    *   **Need:** A high-level process to manage the chain: execute `fromNode`, transform results, apply to `toNode`, execute `toNode`.
    *   **Action:** Implement a new execution function/method (e.g., in `EntityManager` or a dedicated `QueryGroupExecutor`) that orchestrates these steps.

3.  **Argument Type Validation:**
    *   **Need:** Ensure the data types (`uri` or `literal`) of the values coming from the `fromNode` (after transformation and mapping) are compatible with the `allowedTypes` defined for the corresponding parameters in the `toNode`'s `StoredQuery` definition.
    *   **Action:** Add a validation step within the execution orchestration logic *before* calling `applyArguments`. This step will compare the `type` of each value in the transformed arguments against the `allowedTypes` specified for the target parameter in the `toNode`.

4.  **Target Query Compatibility:**
    *   **Constraint:** The current parameter injection mechanism (`applyArguments`) relies on the target query (`toNode`) having a `VALUES` clause with an `UNDEF` row.
    *   **Assumption (Initial):** Queries intended as targets (`toNode`) in a chain *must* use the `VALUES ... UNDEF` pattern for receiving chained inputs. Alternative binding mechanisms are out of scope for the initial implementation.

## Proposed Implementation Details

1.  **New File: `src/lib/query-chaining.ts`**
    *   Define `transformSparqlResultsToArguments(results: SparqlResultsJson, mappings: ParameterMapping[]): ArgumentSet`.
    *   This function handles both the structural change (`results.bindings` -> `arguments`) and the variable name mapping based on `mappings`.

2.  **Execution Logic (Location TBD: `EntityManager` or `QueryGroupExecutor`)**
    *   Add a method like `executeQueryGroup(queryGroup: QueryGroup, startNodeId: string, initialArgs?: any): Promise<any>`.
    *   This method will traverse the graph defined by `QueryGroup`, executing nodes sequentially.
    *   For edges connecting a `SELECT` `fromNode` to a `toNode`:
        *   Fetch `fromNode`'s `StoredQuery` (validate it's `SELECT`).
        *   Execute `fromNode` query.
        *   Fetch `toNode`'s `StoredQuery` to get parameter definitions (`allowedTypes`).
        *   Fetch `QueryEdge`'s `mappings`.
        *   Call `transformSparqlResultsToArguments` with results and mappings.
        *   **Validate** the `type` ('uri' or 'literal') of each value in the transformed arguments against the `allowedTypes` for the corresponding mapped parameter (`toParam`) from the `toNode`'s definition. Throw an error on mismatch.
        *   Call `parser.applyArguments` for the `toNode` query string using the validated, transformed arguments (wrapped in an array: `[transformedArgs]`).
        *   Execute the modified `toNode` query.

3.  **Testing:**
    *   Unit tests for `transformSparqlResultsToArguments`.
    *   Integration tests for `executeQueryGroup` covering various chaining scenarios.

## Next Steps

*   Confirm this plan.
*   If approved, switch to ACT mode to begin implementing the `transformSparqlResultsToArguments` function and associated tests.
