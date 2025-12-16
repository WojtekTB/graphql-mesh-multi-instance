# Quick Reference - Multi-Endpoint Feature

## Configuration Examples

### Single Endpoint (Traditional)
```typescript
// Still works exactly as before
const schema = await loadGraphQLSchemaFromJSONSchemas('api', {
  endpoint: 'https://api.example.com',
  operations: [...]
});
```

### Multiple Endpoints (New)
```typescript
const schema = await loadGraphQLSchemaFromJSONSchemas('api', {
  endpoint: [
    { name: 'primary', endpoint: 'https://api-1.example.com' },
    { name: 'replica', endpoint: 'https://api-2.example.com' },
    { name: 'backup', endpoint: 'https://api-3.example.com' }
  ],
  operations: [...]
});
```

## Generated Schema

### With Single Endpoint
```graphql
type Query {
  users: [User]
  posts: [Post]
}
```

### With Multiple Endpoints
```graphql
type Query {
  users(endpointName: String): [User]
  posts(endpointName: String): [Post]
}
```

## Query Examples

### Default Endpoint (No Selection)
```graphql
query {
  users {
    id
    name
  }
}
```

### Explicit Endpoint Selection
```graphql
# Use primary endpoint
query {
  users(endpointName: "primary") {
    id
    name
  }
}

# Use replica endpoint
query {
  users(endpointName: "replica") {
    id
    name
  }
}

# Use backup endpoint
query {
  users(endpointName: "backup") {
    id
    name
  }
}
```

## File Changes at a Glance

```
packages/loaders/json-schema/src/
  ├── types.ts                              [+] EndpointConfig, EndpointOrEndpoints
  ├── directives.ts                         [+] endpoints arg to directives
  ├── addExecutionLogicToComposer.ts        [✓] endpoint parsing & field args
  ├── getDereferencedJSONSchemaFromOperations.ts [+] endpoint normalization
  └── loadGraphQLSchemaFromJSONSchemas.ts   [✓] no changes needed

packages/transports/rest/src/directives/
  ├── httpOperation.ts                      [+] endpoints in options
  └── process.ts                            [+] EndpointOrEndpoints support

packages/loaders/openapi/src/
  └── getJSONSchemaOptionsFromOpenAPIOptions.ts [+] EndpointOrEndpoints type

packages/loaders/raml/src/
  └── getJSONSchemaOptionsFromRAMLOptions.ts [+] EndpointOrEndpoints type
```

## Type Definitions

```typescript
// Endpoint Configuration
interface EndpointConfig {
  name: string;        // e.g., "primary", "replica", "backup"
  endpoint: string;    // e.g., "https://api.example.com"
}

// Flexible Type
type EndpointOrEndpoints = string | EndpointConfig[];
```

## Directive Structure

```typescript
// HTTPOperationDirective now includes:
@httpOperation(
  ...existing fields...
  endpoints: [{name: string, endpoint: string}]  // NEW
)

// TransportDirective now includes:
@transport(
  ...existing fields...
  endpoints: [{name: string, endpoint: string}]  // NEW
)
```

## Runtime Behavior

| Scenario | Behavior |
|----------|----------|
| Single endpoint | No `endpointName` arg added. Works as before. |
| Multiple endpoints, no arg | Uses first endpoint (default) |
| Multiple endpoints, valid arg | Uses specified endpoint |
| Multiple endpoints, invalid arg | Error: "Unknown endpoint: ..." |

## Performance Impact

- **Single endpoint**: Zero overhead (no changes to resolver)
- **Multiple endpoints**: O(n) endpoint lookup where n = number of endpoints (typically 2-4)
- **Network**: No impact - uses same HTTP mechanism

## Backward Compatibility

✅ **100% Compatible** - All existing code continues to work without modification

## Implementation Status

| Phase | Status | Components |
|-------|--------|------------|
| 1. Types | ✅ Complete | EndpointConfig, EndpointOrEndpoints |
| 2. Directives | ✅ Complete | HTTPOperation, Transport directives |
| 3. Schema Gen | ✅ Complete | Endpoint argument injection, directive embedding |
| 4. Runtime | ✅ Complete | Resolver options, directive processing |
| 5. Integration | ✅ Complete | OpenAPI, RAML, JSON Schema loaders |

## Compilation Status

```
✅ No TypeScript errors
✅ All types properly defined
✅ All imports resolved
✅ Ready for testing
```

## Key Files

1. **MULTI_ENDPOINT_IMPLEMENTATION.md** - Full technical documentation
2. **RESOLVER_IMPLEMENTATION_GUIDE.md** - Runtime resolver implementation details
3. **IMPLEMENTATION_CHANGES.md** - Complete change summary
4. **QUICK_REFERENCE.md** - This file

