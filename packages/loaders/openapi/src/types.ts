import type { JSONSchemaLoaderOptions } from '@omnigraph/json-schema';
import type { HATEOASConfig } from './getJSONSchemaOptionsFromOpenAPIOptions.js';

export interface APIEndpointConfig {
  name: string;
  endpoint: string;
}

export interface OpenAPILoaderOptions extends Partial<JSONSchemaLoaderOptions> {
  // The URL or FileSystem path to the OpenAPI Document.
  source: string;
  selectQueryOrMutationField?: SelectQueryOrMutationFieldConfig[];
  fallbackFormat?: 'json' | 'yaml' | 'js' | 'ts';
  jsonApi?: boolean;
  HATEOAS?: HATEOASConfig | boolean;
  // Support for multiple API instances
  endpoints?: APIEndpointConfig[];
}

export interface SelectQueryOrMutationFieldConfig {
  type: 'query' | 'mutation' | 'Query' | 'Mutation';
  fieldName: string;
}
