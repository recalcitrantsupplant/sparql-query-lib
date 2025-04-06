import { transformSparqlResultsToArguments } from '../../src/lib/query-chaining';
import { ParameterMapping } from '../../src/types/schema-dts';

// Define types locally for test data clarity (matching those in query-chaining.ts)
interface SparqlValue {
  type: 'uri' | 'literal';
  value: string;
  datatype?: string;
  'xml:lang'?: string;
}
type SparqlBinding = Record<string, SparqlValue>;
interface SparqlResultsJson {
  head: { vars: string[] };
  results: { bindings: SparqlBinding[] };
}
interface ArgumentSet {
  head: { vars: string[] };
  arguments: SparqlBinding[];
}

describe('transformSparqlResultsToArguments', () => {
  it('should transform results and map variable names correctly', () => {
    const results: SparqlResultsJson = {
      head: { vars: ['s', 'p', 'o'] },
      results: {
        bindings: [
          {
            s: { type: 'uri', value: 'http://example.org/s1' },
            p: { type: 'uri', value: 'http://example.org/p1' },
            o: { type: 'literal', value: 'object1' },
          },
          {
            s: { type: 'uri', value: 'http://example.org/s2' },
            p: { type: 'uri', value: 'http://example.org/p2' },
            // 'o' is unbound in this row
          },
        ],
      },
    };

    const mappings: ParameterMapping[] = [
      { '@type': 'ParameterMapping', fromParam: 's', toParam: 'subject' },
      { '@type': 'ParameterMapping', fromParam: 'o', toParam: 'objectValue' },
    ];

    const expected: ArgumentSet = {
      head: { vars: ['subject', 'objectValue'] },
      arguments: [
        {
          subject: { type: 'uri', value: 'http://example.org/s1' },
          objectValue: { type: 'literal', value: 'object1' },
        },
        {
          subject: { type: 'uri', value: 'http://example.org/s2' },
          // objectValue is not present as 'o' was unbound
        },
      ],
    };

    expect(transformSparqlResultsToArguments(results, mappings)).toEqual(expected);
  });

  it('should return an empty ArgumentSet for empty results bindings', () => {
    const results: SparqlResultsJson = {
      head: { vars: ['s', 'p', 'o'] },
      results: { bindings: [] },
    };
    const mappings: ParameterMapping[] = [
      { '@type': 'ParameterMapping', fromParam: 's', toParam: 'subject' },
    ];
    const expected: ArgumentSet = {
      head: { vars: ['subject'] },
      arguments: [],
    };
    expect(transformSparqlResultsToArguments(results, mappings)).toEqual(expected);
  });

   it('should return an empty ArgumentSet for malformed results (missing results)', () => {
    const results: any = {
      head: { vars: ['s', 'p', 'o'] },
      // results property is missing
    };
    const mappings: ParameterMapping[] = [
      { '@type': 'ParameterMapping', fromParam: 's', toParam: 'subject' },
    ];
    const expected: ArgumentSet = {
      head: { vars: [] }, // Expect empty head and args
      arguments: [],
    };
    expect(transformSparqlResultsToArguments(results, mappings)).toEqual(expected);
  });

   it('should return an empty ArgumentSet for malformed results (missing head)', () => {
    const results: any = {
      // head property is missing
      results: { bindings: [] },
    };
    const mappings: ParameterMapping[] = [
      { '@type': 'ParameterMapping', fromParam: 's', toParam: 'subject' },
    ];
    const expected: ArgumentSet = {
      head: { vars: [] }, // Expect empty head and args
      arguments: [],
    };
    expect(transformSparqlResultsToArguments(results, mappings)).toEqual(expected);
  });


  it('should throw an error if a mapping refers to a non-existent source variable', () => {
    const results: SparqlResultsJson = {
      head: { vars: ['s', 'p'] },
      results: { bindings: [{ s: { type: 'uri', value: 'uri' }, p: { type: 'uri', value: 'uri2' } }] },
    };
    const mappings: ParameterMapping[] = [
      { '@type': 'ParameterMapping', fromParam: 's', toParam: 'subject' },
      { '@type': 'ParameterMapping', fromParam: 'o', toParam: 'objectValue' }, // 'o' is not in head.vars
    ];
    expect(() => transformSparqlResultsToArguments(results, mappings)).toThrow(
      'Mapping error: Source variable "o" not found in results head: [s, p]'
    );
  });

  it('should throw an error if a mapping specifies a duplicate target parameter name', () => {
    const results: SparqlResultsJson = {
      head: { vars: ['s', 'p', 'o'] },
      results: { bindings: [] },
    };
    const mappings: ParameterMapping[] = [
      { '@type': 'ParameterMapping', fromParam: 's', toParam: 'targetVar' },
      { '@type': 'ParameterMapping', fromParam: 'p', toParam: 'anotherVar' },
      { '@type': 'ParameterMapping', fromParam: 'o', toParam: 'targetVar' }, // Duplicate 'targetVar'
    ];
    expect(() => transformSparqlResultsToArguments(results, mappings)).toThrow(
      'Mapping error: Duplicate target parameter name "targetVar" specified.'
    );
  });

  it('should throw an error if fromParam is not a simple string', () => {
    const results: SparqlResultsJson = {
      head: { vars: ['s'] },
      results: { bindings: [] },
    };
    const mappings: any[] = [ // Use 'any' to bypass ParameterMapping type check for test
      { '@type': 'ParameterMapping', fromParam: { '@id': 'http://example.org/s' }, toParam: 'subject' },
    ];
    // Expect error because the extracted @id is not in results.head.vars
    expect(() => transformSparqlResultsToArguments(results, mappings)).toThrow(
      'Mapping error: Source variable "http://example.org/s" not found in results head: [s]'
    );
  });

  it('should handle toParam as an IdReference object correctly', () => {
    const results: SparqlResultsJson = {
      head: { vars: ['s'] },
      results: { bindings: [] },
    };
    const mappings: any[] = [ // Use 'any' to bypass ParameterMapping type check for test
      { '@type': 'ParameterMapping', fromParam: 's', toParam: { '@id': 'http://example.org/subject' } }, // Use IdReference for toParam
    ];
    // Expect success, as getTextValue handles IdReference
    const expected: ArgumentSet = {
      head: { vars: ['http://example.org/subject'] }, // Target var name is the @id
      arguments: [], // No bindings in results
    };
    expect(transformSparqlResultsToArguments(results, mappings)).toEqual(expected);
  });

});
