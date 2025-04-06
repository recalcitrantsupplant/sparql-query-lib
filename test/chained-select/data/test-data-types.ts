import crypto from 'crypto'; // Needed for UUID generation example

export interface Hobby { // Added export
  uri: string; // Represents the RDF resource identifier
  name: string;
  yearsPracticed: number;
  _rdfType?: string; // Optional RDF type identifier
}

export interface Address { // Added export
  uri: string; // Represents the RDF resource identifier
  street: string;
  city: string;
  postalCode: string;
  country: string;
  _rdfType?: string; // Optional RDF type identifier
}

export interface Person { // Added export
  uri: string; // Represents the RDF resource identifier
  id: string; // Typically auto-generated, e.g., crypto.randomUUID()
  firstName: string;
  lastName: string;
  age: number;
  currentAddress: Address; // Object attribute
  hobbies: Hobby[]; // Array attribute
  _rdfType?: string; // Optional RDF type identifier
}
