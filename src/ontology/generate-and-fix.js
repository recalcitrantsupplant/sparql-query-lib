#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define paths relative to project root
const projectRoot = process.cwd();
const ontologyPath = path.join(projectRoot, 'src/ontology/sparql-query-lib.nt');
const outputPath = path.join(projectRoot, 'src/types/schema-dts.ts');

// Check if ontology file exists
if (!fs.existsSync(ontologyPath)) {
  console.error(`Error: Ontology file ${ontologyPath} not found!`);
  process.exit(1);
}

// Create output directory if it doesn't exist
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Step 1: Generate TypeScript definitions with schema-dts-gen
console.log('Generating TypeScript definitions from ontology...');
try {
  const command = `npx schema-dts-gen --file "${ontologyPath}" --context https://sparql-query-lib/`;
  const output = execSync(command).toString();
  fs.writeFileSync(outputPath, output);
} catch (error) {
  console.error(`Error running schema-dts-gen: ${error.message}`);
  process.exit(1);
}

// Step 2: Fix the generated output by adding DataTypeBase interface and fixing DataType union
console.log('Fixing generated TypeScript definitions...');

try {
  // Read the generated file
  let content = fs.readFileSync(outputPath, 'utf8');
  
  // Add DataTypeBase interface at the beginning of the file
  const dataTypeBase = `interface DataTypeBase {
  "@type": string;
  "@value"?: string;
}

`;
  content = dataTypeBase + content;
  
  // Fix the empty DataType union type
  content = content.replace(
    /export type DataType = ;/,
    'export type DataType = Boolean | Float | Integer | Number | Text | URL;'
  );

  // Add export to IdReference type/interface
  // Use a regex that handles potential interface keyword if schema-dts-gen changes output
  content = content.replace(
    /(type|interface) IdReference =? {/,
    'export interface IdReference {'
  );

  // Add export to SchemaValue type
  content = content.replace(
    /type SchemaValue<T> = T \| readonly T\[];/,
    'export type SchemaValue<T> = T | readonly T[];'
  );
  
  // Write the fixed content back to the file
  fs.writeFileSync(outputPath, content);
  
  console.log(`Successfully generated and fixed TypeScript definitions at ${outputPath}`);
} catch (error) {
  console.error(`Error fixing TypeScript definitions: ${error.message}`);
  process.exit(1);
}
