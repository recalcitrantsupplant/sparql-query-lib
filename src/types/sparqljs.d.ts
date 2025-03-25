declare module 'sparqljs' {
  export class Parser {
    constructor(options?: any);
    parse(query: string): any;
  }

  export class Generator {
    constructor(options?: any);
    stringify(query: any): string;
  }
}
