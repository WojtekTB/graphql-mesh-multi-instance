# Resolver Implementation for Endpoint Selection

This document explains how the runtime resolver handles endpoint selection when multiple endpoints are configured.

## Resolver Flow

### 1. Field Argument Capture
When a query is executed with an `endpointName` argument, the resolver receives it in the `args` object:

```typescript
field.resolve = async (root, args, context, info) => {
  // args contains: { endpointName: "replica" } (if provided)
  // The resolver needs to handle endpoint selection here
}
```

### 2. Endpoint Selection Logic

The resolver needs to:
1. Extract the `endpointName` from args (if present)
2. Look up the endpoint from the directive metadata
3. Use the selected endpoint for the HTTP request
4. Fall back to default endpoint if not provided

**Pseudocode:**
```typescript
// Get endpoints from directive
const endpoints = directiveAnnotation.args.endpoints; // [{name, endpoint}, ...]

// Get requested endpoint name from args
const endpointName = args.endpointName;

// Select endpoint
let selectedEndpoint: string;
if (endpointName && endpoints) {
  const foundEndpoint = endpoints.find(ep => ep.name === endpointName);
  if (foundEndpoint) {
    selectedEndpoint = foundEndpoint.endpoint;
  } else {
    throw new Error(`Unknown endpoint: ${endpointName}. Available: ${endpoints.map(e => e.name).join(', ')}`);
  }
} else {
  // Use first endpoint as default or the single endpoint
  selectedEndpoint = endpoints?.[0]?.endpoint || defaultEndpoint;
}

// Use selectedEndpoint for HTTP request
const url = urlJoin(selectedEndpoint, path);
// ... make request to url
```

## Implementation in httpOperation.ts

The key section where endpoint selection should be integrated:

```typescript
export function addHTTPRootFieldResolver(
  schema: GraphQLSchema,
  field: GraphQLField<any, any>,
  globalLogger: Logger = new DefaultLogger('HTTP'),
  globalFetch: MeshFetch,
  {
    path,
    operationSpecificHeaders,
    httpMethod,
    isBinary,
    requestBaseBody,
    queryParamArgMap,
    queryStringOptionsByParam,
    queryStringOptions,
    jsonApiFields,
    endpoints,  // NEW: Multiple endpoints available
  }: HTTPRootFieldResolverOpts,
  {
    sourceName,
    endpoint,  // Can now be string | EndpointConfig[]
    timeout,
    operationHeaders: globalOperationHeaders,
    queryStringOptions: globalQueryStringOptions = {},
    queryParams: globalQueryParams,
  }: GlobalOptions,
) {
  // ... existing code ...

  field.resolve = async (root, args, context, info) => {
    // ... existing setup code ...

    // NEW: Handle endpoint selection
    let resolvedEndpoint = endpoint;
    if (endpoints && Array.isArray(endpoints) && endpoints.length > 0) {
      const endpointName = args.endpointName;
      if (endpointName) {
        const selectedEp = endpoints.find(ep => ep.name === endpointName);
        if (!selectedEp) {
          throw createGraphQLError(
            `Unknown endpoint: "${endpointName}". Available endpoints: ${endpoints.map(e => e.name).join(', ')}`,
            { nodes: info.fieldNodes }
          );
        }
        resolvedEndpoint = selectedEp.endpoint;
      } else {
        // Use first endpoint as default
        resolvedEndpoint = endpoints[0].endpoint;
      }
    }

    // Use resolvedEndpoint instead of endpoint for URL construction
    const interpolationData = { root, args, context, env: process.env };
    const interpolatedBaseUrl = stringInterpolator.parse(resolvedEndpoint, interpolationData);
    const interpolatedPath = stringInterpolator.parse(path, interpolationData);
    let fullPath = urlJoin(interpolatedBaseUrl, interpolatedPath);

    // ... rest of resolver logic continues as normal ...
  };
}
```

## Error Handling

### Invalid Endpoint Name
```graphql
# Query
query {
  getUsers(endpointName: "invalid-endpoint") {
    id
  }
}

# Error Response
{
  "errors": [{
    "message": "Unknown endpoint: \"invalid-endpoint\". Available endpoints: primary, replica, backup",
    "path": ["getUsers"]
  }]
}
```

### Valid Endpoint Selection
```graphql
# Query
query {
  getUsers(endpointName: "replica") {
    id
    name
  }
}

# Response (routes to replica endpoint)
{
  "data": {
    "getUsers": [
      { "id": "1", "name": "Alice" },
      { "id": "2", "name": "Bob" }
    ]
  }
}
```

## Directive Metadata Flow

1. **Schema Build Time** (addExecutionLogicToComposer.ts)
   - Endpoints array is embedded in httpOperation directive args
   - Example: `endpoints: [{name: "primary", endpoint: "https://api-primary.com"}, ...]`

2. **Directive Processing** (process.ts)
   - Directive is read and passed to addHTTPRootFieldResolver
   - Through the HTTPRootFieldResolverOpts.endpoints parameter

3. **Runtime** (httpOperation.ts)
   - Resolver receives endpoints in closure scope
   - Also receives endpointName in args
   - Resolves and uses selected endpoint

## Performance Considerations

✅ **Zero Overhead for Single Endpoint**
- When single endpoint is used, endpointName argument is not added
- No additional checks needed in resolver

✅ **Minimal Overhead for Multiple Endpoints**
- Array lookup is O(n) where n = number of endpoints (typically 2-4)
- String parsing already happens anyway
- No network overhead for endpoint selection

✅ **Caching Opportunities**
- Endpoint URLs can be cached by clients
- HTTP caching headers respected
- Connection pooling still applies

## Testing Recommendations

### Unit Test Cases
1. Single endpoint - no endpointName argument
2. Multiple endpoints - endpointName not provided (default)
3. Multiple endpoints - endpointName provided (valid)
4. Multiple endpoints - endpointName provided (invalid)
5. Schema introspection shows correct argument

### Integration Test Cases
1. Query with different endpoint names makes requests to correct URLs
2. Response times vary based on endpoint selection
3. Error handling works correctly
4. Headers and query params are preserved across endpoint selection

### E2E Test Cases
1. Create test endpoints with different responses
2. Run queries with various endpointName values
3. Verify correct endpoint was called
4. Verify correct response returned

## Example Test Implementation

```typescript
describe('Multi-Endpoint Resolver', () => {
  it('should use default endpoint when endpointName not provided', async () => {
    const result = await graphql(schema, `
      query {
        getUsers {
          id
        }
      }
    `);
    expect(result.data.getUsers).toBeDefined();
    expect(primaryEndpointCalled).toBe(true); // Primary is default
  });

  it('should use selected endpoint when endpointName provided', async () => {
    const result = await graphql(schema, `
      query {
        getUsers(endpointName: "replica") {
          id
        }
      }
    `);
    expect(result.data.getUsers).toBeDefined();
    expect(replicaEndpointCalled).toBe(true);
  });

  it('should error on invalid endpoint name', async () => {
    const result = await graphql(schema, `
      query {
        getUsers(endpointName: "invalid") {
          id
        }
      }
    `);
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toContain('Unknown endpoint');
  });
});
```

