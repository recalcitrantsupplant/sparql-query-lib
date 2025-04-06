interface DataTypeBase {
  "@type": string;
  "@value"?: string;
}

/** Used at the top-level node to indicate the context for the JSON-LD objects used. The context provided in this type is compatible with the keys and URLs in the rest of this generated file. */
export type WithContext<T extends Thing> = T & {
    "@context": "https://sparql-query-lib/";
};
export interface Graph {
    "@context": "https://sparql-query-lib/";
    "@graph": readonly Thing[];
}
export type SchemaValue<T> = T | readonly T[];
export interface IdReference {
    /** IRI identifying the canonical address of this object. */
    "@id": string;
};

interface BooleanLeaf extends DataTypeBase {
    "@type": "http://schema.org/Boolean";
}
export type Boolean = BooleanLeaf | boolean;

interface DateTimeLeaf extends DataTypeBase {
    "@type": "http://schema.org/DateTime";
}
export type DateTime = DateTimeLeaf | string;

interface NumberLeaf extends DataTypeBase {
    "@type": "http://schema.org/Number";
}
export type Number = NumberLeaf | Float | Integer | number | `${number}`;

interface TextLeaf extends DataTypeBase {
    "@type": "http://schema.org/Text";
}
export type Text = TextLeaf | URL | string;

export type DataType = Boolean | Float | Integer | Number | Text | URL;

interface ArgumentsBase extends ThingBase {
    "bindings"?: SchemaValue<Thing | IdReference>;
}
interface ArgumentsLeaf extends ArgumentsBase {
    "@type": "Arguments";
}
export type Arguments = ArgumentsLeaf;

interface BackendBase extends ThingBase {
    "backendType"?: SchemaValue<Text | IdReference>;
    "http://schema.org/dateCreated"?: SchemaValue<DateTime | IdReference>;
    "http://schema.org/dateModified"?: SchemaValue<DateTime | IdReference>;
    "description"?: SchemaValue<Text | IdReference>;
    "endpoint"?: SchemaValue<URL | IdReference>;
    "name"?: SchemaValue<Text | IdReference>;
    "password"?: SchemaValue<Text | IdReference>;
    "username"?: SchemaValue<Text | IdReference>;
}
interface BackendLeaf extends BackendBase {
    "@type": "Backend";
}
export type Backend = BackendLeaf;

interface BackendStateBase extends ThingBase {
    "backends"?: SchemaValue<Backend | IdReference>;
    "currentBackend"?: SchemaValue<Text | IdReference>;
}
interface BackendStateLeaf extends BackendStateBase {
    "@type": "BackendState";
}
export type BackendState = BackendStateLeaf;

interface FloatLeaf extends DataTypeBase {
    "@type": "http://schema.org/Float";
}
export type Float = FloatLeaf | number | `${number}`;

interface HeadBase extends ThingBase {
    "vars"?: SchemaValue<QueryParameter | Text | IdReference>;
}
interface HeadLeaf extends HeadBase {
    "@type": "Head";
}
export type Head = HeadLeaf;

interface IntegerLeaf extends DataTypeBase {
    "@type": "http://schema.org/Integer";
}
export type Integer = IntegerLeaf | number | `${number}`;

interface LibraryBase extends ThingBase {
    "http://schema.org/dateCreated"?: SchemaValue<DateTime | IdReference>;
    "http://schema.org/dateModified"?: SchemaValue<DateTime | IdReference>;
    "defaultBackend"?: SchemaValue<Text | IdReference>;
    "description"?: SchemaValue<Text | IdReference>;
    "name"?: SchemaValue<Text | IdReference>;
}
interface LibraryLeaf extends LibraryBase {
    "@type": "Library";
}
export type Library = LibraryLeaf;

interface NodeParameterMappingBase extends ThingBase {
    "parameterName"?: SchemaValue<Text | IdReference>;
    "parameterValue"?: SchemaValue<Text | IdReference>;
}
interface NodeParameterMappingLeaf extends NodeParameterMappingBase {
    "@type": "NodeParameterMapping";
}
export type NodeParameterMapping = NodeParameterMappingLeaf;

interface ParameterMappingBase extends ThingBase {
    "fromParam"?: SchemaValue<Text | IdReference>;
    "toParam"?: SchemaValue<Text | IdReference>;
}
interface ParameterMappingLeaf extends ParameterMappingBase {
    "@type": "ParameterMapping";
}
export type ParameterMapping = ParameterMappingLeaf;

interface QueryBindingsBase extends ThingBase {
    "arguments"?: SchemaValue<Arguments | IdReference>;
    "head"?: SchemaValue<Head | IdReference>;
}
interface QueryBindingsLeaf extends QueryBindingsBase {
    "@type": "QueryBindings";
}
export type QueryBindings = QueryBindingsLeaf;

interface QueryEdgeBase extends ThingBase {
    "fromNodeId"?: SchemaValue<Text | IdReference>;
    "mappings"?: SchemaValue<ParameterMapping | IdReference>;
    "toNodeId"?: SchemaValue<Text | IdReference>;
}
interface QueryEdgeLeaf extends QueryEdgeBase {
    "@type": "QueryEdge";
}
export type QueryEdge = QueryEdgeLeaf;

interface QueryGroupBase extends ThingBase {
    "http://schema.org/dateCreated"?: SchemaValue<DateTime | IdReference>;
    "http://schema.org/dateModified"?: SchemaValue<DateTime | IdReference>;
    "description"?: SchemaValue<Text | IdReference>;
    "edges"?: SchemaValue<QueryEdge | IdReference>;
    "endNodeIds"?: SchemaValue<Text | IdReference>;
    "http://schema.org/isPartOf"?: SchemaValue<Library | QueryGroup | IdReference>;
    "name"?: SchemaValue<Text | IdReference>;
    "nodes"?: SchemaValue<QueryNode | IdReference>;
    "startNodeIds"?: SchemaValue<Text | IdReference>;
}
interface QueryGroupLeaf extends QueryGroupBase {
    "@type": "QueryGroup";
}
export type QueryGroup = QueryGroupLeaf;

interface QueryNodeBase extends ThingBase {
    "backendId"?: SchemaValue<Text | IdReference>;
    "parameterMappings"?: SchemaValue<NodeParameterMapping | IdReference>;
    "queryId"?: SchemaValue<Text | IdReference>;
}
interface QueryNodeLeaf extends QueryNodeBase {
    "@type": "QueryNode";
}
export type QueryNode = QueryNodeLeaf;

interface QueryParameterBase extends ThingBase {
    "allowedTypes"?: SchemaValue<Text | IdReference>;
    "paramName"?: SchemaValue<Text | IdReference>;
}
interface QueryParameterLeaf extends QueryParameterBase {
    "@type": "QueryParameter";
}
export type QueryParameter = QueryParameterLeaf;

interface QueryParameterGroupBase extends ThingBase {
    "vars"?: SchemaValue<QueryParameter | Text | IdReference>;
}
interface QueryParameterGroupLeaf extends QueryParameterGroupBase {
    "@type": "QueryParameterGroup";
}
export type QueryParameterGroup = QueryParameterGroupLeaf;

interface SparqlBindingValueBase extends ThingBase {
    "bindingType"?: SchemaValue<Text | IdReference>;
    "datatype"?: SchemaValue<URL | IdReference>;
    "value"?: SchemaValue<Text | IdReference>;
    "xmlLang"?: SchemaValue<Text | IdReference>;
}
interface SparqlBindingValueLeaf extends SparqlBindingValueBase {
    "@type": "SparqlBindingValue";
}
export type SparqlBindingValue = SparqlBindingValueLeaf;

interface StoredQueryBase extends ThingBase {
    "http://schema.org/dateCreated"?: SchemaValue<DateTime | IdReference>;
    "http://schema.org/dateModified"?: SchemaValue<DateTime | IdReference>;
    "defaultBackend"?: SchemaValue<Text | IdReference>;
    "description"?: SchemaValue<Text | IdReference>;
    "hasLimitParameter"?: SchemaValue<Text | IdReference>;
    "hasOffsetParameter"?: SchemaValue<Text | IdReference>;
    "http://schema.org/isPartOf"?: SchemaValue<Library | QueryGroup | IdReference>;
    "name"?: SchemaValue<Text | IdReference>;
    "outputVars"?: SchemaValue<Text | IdReference>;
    "parameters"?: SchemaValue<QueryParameterGroup | IdReference>;
    "query"?: SchemaValue<Text | IdReference>;
    "queryType"?: SchemaValue<Text | IdReference>;
}
interface StoredQueryLeaf extends StoredQueryBase {
    "@type": "StoredQuery";
}
export type StoredQuery = StoredQueryLeaf;

interface ThingBase extends Partial<IdReference> {
    "http://schema.org/description"?: SchemaValue<Text | IdReference>;
    "http://schema.org/identifier"?: SchemaValue<Text | URL | IdReference>;
    "http://schema.org/name"?: SchemaValue<Text | IdReference>;
    "http://schema.org/url"?: SchemaValue<URL | IdReference>;
}
interface ThingLeaf extends ThingBase {
    "@type": "http://schema.org/Thing";
}
export type Thing = ThingLeaf | Arguments | Backend | BackendState | Head | Library | NodeParameterMapping | ParameterMapping | QueryBindings | QueryEdge | QueryGroup | QueryNode | QueryParameter | QueryParameterGroup | SparqlBindingValue | StoredQuery;

interface URLLeaf extends DataTypeBase {
    "@type": "http://schema.org/URL";
}
export type URL = URLLeaf | string;

