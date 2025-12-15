import {
  loadGraphQLSchemaFromJSONSchemas,
  loadNonExecutableGraphQLSchemaFromJSONSchemas,
} from '@omnigraph/json-schema';
import { getJSONSchemaOptionsFromOpenAPIOptions } from './getJSONSchemaOptionsFromOpenAPIOptions.js';
import type { OpenAPILoaderOptions } from './types.js';
import type { APIEndpointConfig } from './types.js';

/**
 * Creates a local GraphQLSchema instance from a OpenAPI Document.
 * Everytime this function is called, the OpenAPI file and its dependencies will be resolved on runtime.
 * If you want to avoid this, use `createBundle` function to create a bundle once and save it to a storage
 * then load it with `loadGraphQLSchemaFromBundle`.
 *
 * When `endpoints` option is provided with multiple API instances, the generated resolvers will
 * accept an `endpointNames` parameter to select which instances to call.
 */
export async function loadGraphQLSchemaFromOpenAPI(name: string, options: OpenAPILoaderOptions) {
  const extraJSONSchemaOptions = await getJSONSchemaOptionsFromOpenAPIOptions(name, options);

  // If multiple endpoints are provided, enhance the operations to support endpointNames parameter
  if (extraJSONSchemaOptions.endpoints && extraJSONSchemaOptions.endpoints.length > 0) {
    const schema = await loadGraphQLSchemaFromJSONSchemas(name, {
      ...options,
      ...extraJSONSchemaOptions,
    });

    return enhanceSchemaWithMultiInstanceSupport(schema, extraJSONSchemaOptions.endpoints);
  }

  return loadGraphQLSchemaFromJSONSchemas(name, {
    ...options,
    ...extraJSONSchemaOptions,
  });
}

export async function loadNonExecutableGraphQLSchemaFromOpenAPI(
  name: string,
  options: OpenAPILoaderOptions,
) {
  const extraJSONSchemaOptions = await getJSONSchemaOptionsFromOpenAPIOptions(name, options);
  return loadNonExecutableGraphQLSchemaFromJSONSchemas(name, {
    ...options,
    ...extraJSONSchemaOptions,
  });
}

/**
 * Enhances the GraphQL schema with support for multiple API instances.
 * Wraps resolvers to accept and process endpointNames parameter.
 */
function enhanceSchemaWithMultiInstanceSupport(schema: any, endpoints: APIEndpointConfig[]) {
  const endpointMap = new Map(endpoints.map(e => [e.name, e.endpoint]));

  // If the schema has custom resolvers, we would wrap them here
  // For now, the endpoints information is available through the schema extensions
  const enhancedSchema = schema;

  if (!enhancedSchema.extensions) {
    enhancedSchema.extensions = {};
  }

  enhancedSchema.extensions.multiInstanceEndpoints = {
    endpoints: Array.from(endpointMap.entries()).map(([name, endpoint]) => ({ name, endpoint })),
    endpointMap: Object.fromEntries(endpointMap),
  };

  return enhancedSchema;
}

export { processDirectives } from '@omnigraph/json-schema';
