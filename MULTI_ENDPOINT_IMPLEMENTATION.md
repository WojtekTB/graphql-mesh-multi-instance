# Multi-Endpoint Implementation

## Overview
This implementation enables GraphQL Mesh's JSON Schema loader to support multiple endpoints, allowing queries and mutations to dynamically select which endpoint to hit at runtime.

## Implementation Summary

### Phase 1: Type System Updates ✅

**Files Modified:**
- [packages/loaders/json-schema/src/types.ts](packages/loaders/json-schema/src/types.ts)
- [packages/loaders/json-schema/src/addExecutionLogicToComposer.ts](packages/loaders/json-schema/src/addExecutionLogicToComposer.ts)

**Changes:**
- Added `EndpointConfig` interface to define endpoint name + URL pairs
- Added `EndpointOrEndpoints` type alias for flexibility
- Updated `JSONSchemaLoaderOptions.endpoint` to accept `string | EndpointConfig[]`
- Updated `AddExecutionLogicToComposerOptions.endpoint` to accept optional `EndpointOrEndpoints`

```typescript
export interface EndpointConfig {
  name: string;
  endpoint: string;
}

export type EndpointOrEndpoints = string | EndpointConfig[];
```

### Phase 2: Directive Updates ✅

**Files Modified:**
- [packages/loaders/json-schema/src/directives.ts](packages/loaders/json-schema/src/directives.ts)

**Changes:**
- Added `endpoints` argument to `HTTPOperationDirective` to store endpoint metadata
- Added `endpoints` argument to `TransportDirective` to persist endpoints at schema level

These directives now carry all endpoint configurations for runtime resolution.

### Phase 3: Schema Generation Updates ✅

**Files Modified:**
- [packages/loaders/json-schema/src/addExecutionLogicToComposer.ts](packages/loaders/json-schema/src/addExecutionLogicToComposer.ts)

**Changes:**
- Parse endpoint/endpoints configuration at function entry
- When multiple endpoints detected, automatically add `endpointName: String` argument to all HTTP operation fields
- Include all endpoint configs in the `httpOperation` directive args
- Store endpoints array in transport directive extensions

**Key Logic:**
```typescript
// Parse endpoints configuration
let endpointConfigs: EndpointConfig[] = [];
let defaultEndpoint: string = '';

if (Array.isArray(endpoint)) {
  endpointConfigs = endpoint;
  if (endpointConfigs.length > 0) {
    defaultEndpoint = endpointConfigs[0].endpoint;
  }
} else if (typeof endpoint === 'string') {
  defaultEndpoint = endpoint;
}

const hasMultipleEndpoints = endpointConfigs.length > 1;

// Add endpoint selection argument if multiple endpoints are available
if (hasMultipleEndpoints) {
  field.addArgs({
    endpointName: {
      type: 'String',
      description: `Select which endpoint to use. Available: ${endpointConfigs.map(ec => ec.name).join(', ')}. Defaults to: ${endpointConfigs[0].name}`,
    },
  });
}
```

### Phase 4: Runtime Resolver Updates ✅

**Files Modified:**
- [packages/transports/rest/src/directives/httpOperation.ts](packages/transports/rest/src/directives/httpOperation.ts)
- [packages/transports/rest/src/directives/process.ts](packages/transports/rest/src/directives/process.ts)

**Changes:**
- Updated `HTTPRootFieldResolverOpts` to include optional `endpoints` parameter
- Updated `ProcessDirectiveArgs` to accept `EndpointOrEndpoints`
- Modified `processDirectives` to extract endpoints from transport directive extensions
- Enhanced directive processing to pass endpoints to field resolvers

The resolver can now access `endpointName` from args and select the corresponding endpoint from the endpoints array.

### Phase 5: Type Integration Updates ✅

**Files Modified:**
- [packages/loaders/openapi/src/getJSONSchemaOptionsFromOpenAPIOptions.ts](packages/loaders/openapi/src/getJSONSchemaOptionsFromOpenAPIOptions.ts)
- [packages/loaders/raml/src/getJSONSchemaOptionsFromRAMLOptions.ts](packages/loaders/raml/src/getJSONSchemaOptionsFromRAMLOptions.ts)
- [packages/loaders/json-schema/src/getDereferencedJSONSchemaFromOperations.ts](packages/loaders/json-schema/src/getDereferencedJSONSchemaFromOperations.ts)

**Changes:**
- Updated OpenAPI and RAML loaders to support `EndpointOrEndpoints` type
- Updated schema dereferencing to normalize multi-endpoint to string for schema loading (uses first endpoint)

## Usage Example

### Single Endpoint (Backward Compatible)
```typescript
const schema = await loadGraphQLSchemaFromJSONSchemas('my-api', {
  endpoint: 'https://api.example.com',
  operations: [...]
});
```

**Generated GraphQL:**
```graphql
type Query {
  getUsers: [User]
}
```

**Query:**
```graphql
query {
  getUsers {
    id
    name
  }
}
```

### Multiple Endpoints (New Feature)
```typescript
const schema = await loadGraphQLSchemaFromJSONSchemas('my-api', {
  endpoint: [
    { name: 'primary', endpoint: 'https://api-primary.example.com' },
    { name: 'replica', endpoint: 'https://api-replica.example.com' },
    { name: 'backup', endpoint: 'https://api-backup.example.com' }
  ],
  operations: [...]
});
```

**Generated GraphQL:**
```graphql
type Query {
  getUsers(endpointName: String): [User]
}
```

**Queries:**
```graphql
# Uses default (first) endpoint
query {
  getUsers {
    id
    name
  }
}

# Use primary explicitly
query {
  getUsers(endpointName: "primary") {
    id
    name
  }
}

# Use replica
query {
  getUsers(endpointName: "replica") {
    id
    name
  }
}

# Use backup
query {
  getUsers(endpointName: "backup") {
    id
    name
  }
}
```

## Directive Structure

### httpOperation Directive
```typescript
@httpOperation(
  path: String!
  httpMethod: HTTPMethod!
  endpoints: [{name: String, endpoint: String}]  // NEW
  ...otherArgs
)
```

### transport Directive Extension
```typescript
{
  subgraph: String
  kind: String
  location: String                                  // First endpoint or single endpoint
  endpoints: [{name: String, endpoint: String}]   // NEW - All endpoints
  headers: [[String]]
  queryParams: [[String]]
  queryStringOptions: ObjMap
}
```

## Backward Compatibility

✅ **Fully backward compatible**
- Existing single-endpoint configurations work without changes
- When a string endpoint is provided, it's converted to `defaultEndpoint`
- The `endpointName` argument is only added when multiple endpoints are detected
- All existing functionality preserved

## Implementation Status

| Component | Status | Files |
|-----------|--------|-------|
| Type Definitions | ✅ Complete | types.ts |
| Directives | ✅ Complete | directives.ts |
| Schema Generation | ✅ Complete | addExecutionLogicToComposer.ts |
| Runtime Resolution | ✅ Complete | httpOperation.ts, process.ts |
| Type Integration | ✅ Complete | openapi, raml, json-schema loaders |
| Compilation | ✅ No Errors | All files |

## Next Steps for End Users

1. **Update Configuration**: Pass an array of `EndpointConfig` objects instead of a single string
2. **Schema Introspection**: Queries/mutations will show the new `endpointName: String` argument
3. **Runtime Queries**: Include the `endpointName` argument to select endpoint, or omit for default
4. **Server Logic**: The resolver will select the endpoint based on the argument and route the request accordingly

## Technical Highlights

- **Non-breaking**: Existing single-endpoint setups continue to work
- **Scalable**: Supports any number of endpoints
- **Type-safe**: Full TypeScript support with proper type inference
- **Introspectable**: Endpoint options are documented in field descriptions
- **Flexible**: Default endpoint selected if argument not provided
- **Efficient**: Minimal schema overhead - just metadata storage

