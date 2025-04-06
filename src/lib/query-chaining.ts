import { ParameterMapping, Text, IdReference } from '../types/schema-dts'; // Import Text and IdReference types
// Manually define types based on the structures in src/schemas.ts

// Define SchemaValue locally based on its definition in schema-dts.ts
type SchemaValue<T> = T | readonly T[];

// Based on argumentValueSchema
export interface SparqlValue { // Already exported
  type: 'uri' | 'literal'; // Assuming bnode is not used here based on schema enum
  value: string;
  datatype?: string; // Optional based on schema
  'xml:lang'?: string; // Optional based on schema
}

// Helper function to ensure a value is an array (returns mutable copy) - adapted from QueryOrchestrator
function ensureArray<T>(value: T | readonly T[] | undefined): T[] {
    if (value === undefined || value === null) {
        return [];
    }
    // Explicitly cast value to T when it's not an array to satisfy the type checker
    return Array.isArray(value) ? [...value] : [value as T];
}

// Helper function to safely get the string value from SchemaValue<Text | IdReference>
function getTextValue(ref: Text | IdReference | SchemaValue<Text | IdReference> | undefined): string | undefined {
     const value = ensureArray(ref)[0]; // Take the first element if it's an array
     if (!value) return undefined;
     if (typeof value === 'string') return value; // It's a direct string
     // Check for Text/URL object with @value
     if (typeof value === 'object' && '@value' in value && typeof value['@value'] === 'string') return value['@value'];
     // Check for IdReference object with @id
     if (typeof value === 'object' && '@id' in value && typeof value['@id'] === 'string') return value['@id'];
     return undefined;
}


// Based on argumentRowSchema (Record<string, SparqlValue>)
export type SparqlBinding = Record<string, SparqlValue>; // Export SparqlBinding

// Based on argumentSetSchema
export interface ArgumentSet { // Already exported
  head: {
    vars: string[];
  };
  arguments: SparqlBinding[];
}

// Define SparqlResultsJson locally, using the manually defined SparqlBinding
export interface SparqlResultsJson {
  head: {
    vars: string[];
    link?: string[]; // Optional link headers
  };
  results: {
    bindings: SparqlBinding[]; // Use the derived SparqlBinding type
  };
  boolean?: boolean; // For ASK queries
}


/**
 * Transforms SPARQL Results JSON into the ArgumentSet format expected by applyArguments,
 * applying parameter name mappings defined in the QueryEdge.
 *
 * @param results - The SPARQL Results JSON from the source query.
 * @param mappings - The parameter mappings defined in the QueryEdge.
 * @returns An ArgumentSet suitable for applyArguments.
 * @throws Error if a mapping refers to a variable not present in the results head.
 * @throws Error if a mapping's fromParam or toParam is invalid.
 * @throws Error if a mapping's toParam variableName is duplicated.
 */
export function transformSparqlResultsToArguments(
  results: SparqlResultsJson,
  mappings: ParameterMapping[] // Keep ParameterMapping from schema-dts for internal structure
): ArgumentSet { // Return type is now derived from argumentSetSchema
  // Basic validation of input structure
  if (!results || typeof results !== 'object' || !results.head || !Array.isArray(results.head.vars) || !results.results || !Array.isArray(results.results.bindings)) {
    // Return empty set for malformed or empty results
    return { head: { vars: [] }, arguments: [] };
  }

  const sourceVars = results.head.vars;
  const targetVarsSet = new Set<string>(); // Tracks target variable names to detect duplicates
  let validatedMappings: { sourceVarName: string; targetVarName: string }[] = []; // Use let for reassignment

  // Validate mappings and extract variable names
  for (const mapping of mappings) {
    console.log('Processing mapping:', JSON.stringify(mapping, null, 2)); // Log the current mapping object
    // Use the helper to get variable names from fromParam and toParam
    const sourceVarName = getTextValue(mapping.fromParam);
    const targetVarName = getTextValue(mapping.toParam);
    console.log(`Extracted sourceVarName: "${sourceVarName}", targetVarName: "${targetVarName}"`); // Log extracted names

    if (!sourceVarName) {
        throw new Error(`Mapping error: 'fromParam' is missing a valid string value. Mapping: ${JSON.stringify(mapping)}`);
    }
     if (!targetVarName) {
        throw new Error(`Mapping error: 'toParam' is missing a valid string value. Mapping: ${JSON.stringify(mapping)}`);
    }

    // Check if the source variable exists in the results head
    if (!sourceVars.includes(sourceVarName)) {
      throw new Error(`Mapping error: Source variable "${sourceVarName}" not found in results head: [${sourceVars.join(', ')}]`);
    }
    // Check for duplicate target variable names
    if (targetVarsSet.has(targetVarName)) {
        throw new Error(`Mapping error: Duplicate target parameter name "${targetVarName}" specified.`);
    }
    targetVarsSet.add(targetVarName);
    const newMapping = { sourceVarName, targetVarName }; // Create a separate object
    validatedMappings = [...validatedMappings, newMapping]; // Reassign with new array
  }

  const targetHeadVars = validatedMappings.map(m => m.targetVarName);

  const transformedArguments: SparqlBinding[] = results.results.bindings.map((binding: SparqlBinding) => {
    const transformedBinding: SparqlBinding = {};
    console.log('Processing binding:', JSON.stringify(binding, null, 2)); // Log current binding
    for (const mapping of validatedMappings) {
      const sourceVar = mapping.sourceVarName;
      const targetVar = mapping.targetVarName;
      console.log(`Mapping source "${sourceVar}" to target "${targetVar}"`); // Log mapping being applied
      if (binding[sourceVar]) {
        console.log(`Found source variable "${sourceVar}" in binding. Value:`, JSON.stringify(binding[sourceVar], null, 2)); // Log found source value
        transformedBinding[targetVar] = binding[sourceVar];
      } else {
          console.log(`Source variable "${sourceVar}" not found in binding.`); // Log if source variable is missing
      }
    }
    console.log('Transformed binding:', JSON.stringify(transformedBinding, null, 2)); // Log transformed binding
    return transformedBinding;
  });

  return {
    head: { vars: targetHeadVars },
    arguments: transformedArguments,
  };
}
