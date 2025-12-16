# Multi-Endpoint Combined Results Feature

## Overview

This enhancement extends the multi-endpoint feature to allow users to select multiple endpoints and receive combined/merged results. This is useful for:

- **Data aggregation**: Combine results from primary and replica databases
- **Failover with merging**: Get data from backup endpoint if primary fails, merged with primary results
- **Multi-region queries**: Query same data from multiple geographic regions and combine
- **Result enrichment**: Call secondary endpoints to augment primary results

## Configuration

The same configuration from the basic multi-endpoint setup applies:

```typescript
const schema = await loadGraphQLSchemaFromJSONSchemas('api', {
  endpoint: [
    { name: 'primary', endpoint: 'https://api-primary.example.com' },
    { name: 'replica', endpoint: 'https://api-replica.example.com' },
    { name: 'backup', endpoint: 'https://api-backup.example.com' }
  ],
  operations: [...]
});
```

## Generated GraphQL Schema

```graphql
type Query {
  # Single or array of endpoint names can be passed
  users(endpointName: [String]): [User]
  posts(endpointName: [String]): [Post]
}
```

## Query Examples

### Single Endpoint (Default)
```graphql
query {
  users {
    id
    name
  }
}
```
Result: Uses first endpoint (primary) by default

### Explicit Single Endpoint
```graphql
query {
  users(endpointName: "replica") {
    id
    name
  }
}
```
Result: Uses replica endpoint only

### Multiple Endpoints (Combined Results)
```graphql
query {
  # Get users from both primary and replica, merged together
  users(endpointName: ["primary", "replica"]) {
    id
    name
  }
}
```

Results from both endpoints are fetched in parallel and automatically merged.

### Complex Multi-Endpoint Query
```graphql
query {
  # Combine data from all three endpoints
  users(endpointName: ["primary", "replica", "backup"]) {
    id
    name
    email
  }
}
```

## Result Merging Behavior

The merging strategy depends on the field's return type:

### For List Types (Arrays)

**Default behavior**: Concatenate results and deduplicate by `id` field

```typescript
// Endpoint 1 response:
[
  { id: "1", name: "Alice", email: "alice@example.com" },
  { id: "2", name: "Bob", email: "bob@example.com" }
]

// Endpoint 2 response:
[
  { id: "2", name: "Bob", email: "bob.new@example.com" },  // Updated email
  { id: "3", name: "Charlie", email: "charlie@example.com" }
]

// Merged result (deduplicates by id, prefers latest):
[
  { id: "1", name: "Alice", email: "alice@example.com" },
  { id: "2", name: "Bob", email: "bob.new@example.com" },   // Updated with latest
  { id: "3", name: "Charlie", email: "charlie@example.com" }
]
```

### For Object Types

**Default behavior**: Deep merge objects, with later values overwriting earlier ones

```typescript
// Endpoint 1 response:
{
  profile: {
    name: "Alice",
    bio: "Engineer"
  },
  settings: {
    theme: "dark",
    notifications: true
  }
}

// Endpoint 2 response:
{
  profile: {
    name: "Alice",
    status: "online"      // New field
  },
  stats: {
    followers: 1000       // New field
  }
}

// Merged result:
{
  profile: {
    name: "Alice",
    bio: "Engineer",
    status: "online"      // Added from endpoint 2
  },
  settings: {
    theme: "dark",
    notifications: true
  },
  stats: {
    followers: 1000       // Added from endpoint 2
  }
}
```

### For Scalar Types

**Default behavior**: Returns first endpoint's result

```typescript
// Endpoint 1: "2024-12-16"
// Endpoint 2: "2024-12-16"
// Result: "2024-12-16"
```

## Performance Characteristics

- **Parallel Requests**: All endpoints are queried in parallel, not sequentially
- **Timeout**: Global timeout applies to the entire multi-endpoint request (not per endpoint)
- **Partial Failure**: If any endpoint fails, the entire query fails with descriptive error

```typescript
// Example with timeouts
const schema = await loadGraphQLSchemaFromJSONSchemas('api', {
  endpoint: [...],
  operations: [...],
  timeout: 5000 // 5 second timeout for entire multi-endpoint request
});
```

## Error Handling

### Invalid Endpoint Name
```graphql
query {
  users(endpointName: ["primary", "invalid"]) {
    id
    name
  }
}
```

**Error Response:**
```json
{
  "errors": [{
    "message": "Invalid endpoint name: invalid. Available: primary, replica, backup"
  }]
}
```

### Endpoint Failure During Multi-Request
```graphql
query {
  users(endpointName: ["primary", "replica"]) {
    id
  }
}
```

**If replica fails:**
```json
{
  "errors": [{
    "message": "Failed to fetch from multiple endpoints: Endpoint [replica] returned HTTP 500: Internal Server Error"
  }]
}
```

### Type Incompatibility
If endpoints return different types (e.g., one returns array, one returns object), an error is thrown:

```json
{
  "errors": [{
    "message": "Incompatible result types from endpoints: expected array, got object in result #2"
  }]
}
```

## Advanced Usage

### Querying Specific Endpoints for Different Fields

```graphql
query {
  # Get users from both endpoints
  users(endpointName: ["primary", "replica"]) {
    id
    name
  }

  # Get posts from primary only (for consistency)
  posts(endpointName: "primary") {
    id
    title
  }

  # Get stats from backup
  systemStats: stats(endpointName: "backup") {
    uptime
  }
}
```

### Combining with Variables

```graphql
query GetData($endpoints: [String]) {
  users(endpointName: $endpoints) {
    id
    name
  }
}
```

```json
{
  "endpoints": ["primary", "replica"]
}
```

## Deduplication Strategy

The merger uses the `id` field by default for deduplication. When merging:

1. **First occurrence**: The first item with a given `id` is added to results
2. **Duplicate**: If another endpoint returns an item with the same `id`:
   - The newer item replaces the older one (preferLatest=true)
   - This allows later endpoints to update/correct data from earlier endpoints

## Implementation Details

### Request Flow for Multiple Endpoints

```
Query received with endpointName: ["primary", "replica"]
           ↓
Validate endpoint names exist
           ↓
Make parallel requests to both endpoints
           ↓
┌──────────────────────────┬──────────────────────────┐
│                          │                          │
v                          v                          v
Request to Primary    Request to Replica
           │                          │
           └──────────────┬───────────┘
                          ↓
               Wait for all responses
                          ↓
            Validate result compatibility
                          ↓
            Merge results by type
                          ↓
             Return combined result
```

### Type Detection

- **List Type**: `[User]` - Concatenate and deduplicate arrays
- **Object Type**: `User` - Deep merge objects
- **Scalar Type**: `String`, `Int`, etc. - Return first result
- **Nullable**: Null results are skipped during merge

## Use Cases

### 1. Read Replicas with Fallback
```graphql
# Try primary first, fall back to replica if stale
query {
  freshUsers(endpointName: ["primary", "replica"]) {
    id
    name
    lastModified
  }
}
```

### 2. Multi-Region Data Aggregation
```graphql
query {
  globalUsers(endpointName: ["us-east", "eu-west", "ap-south"]) {
    id
    region
    count
  }
}
```

### 3. Cross-Database Queries
```graphql
query {
  # Combine users from transactional DB and analytics DB
  users(endpointName: ["transactional-db", "analytics-db"]) {
    id
    name
    transactions  # Only in transactional-db
    analytics     # Only in analytics-db
  }
}
```

### 4. Caching with Verification
```graphql
query {
  users(endpointName: ["cache", "source"]) {
    id
    name
    # Cache might be stale, verify with source
  }
}
```

## Limitations & Considerations

1. **No custom merge logic**: Currently uses built-in merge strategies. For complex merging, consider implementing at client level
2. **Timeout applies to all**: If one endpoint is slow, the entire request timeout applies
3. **All-or-nothing**: If any endpoint fails, the entire query fails
4. **Scalability**: Requesting from many endpoints (e.g., 10+) in parallel may consume significant resources

## Future Enhancements

Potential improvements for future versions:

- Per-endpoint timeouts
- Partial success modes (return available data if some endpoints fail)
- Custom merge strategies via directives
- Result caching for specific endpoints
- Circuit breaker for failing endpoints

