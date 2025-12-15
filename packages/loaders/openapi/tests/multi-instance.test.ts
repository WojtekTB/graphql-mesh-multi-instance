import { describe, it, expect, beforeAll } from '@jest/globals';
import { GraphQLSchema, graphql } from 'graphql';
import { loadGraphQLSchemaFromOpenAPI } from '../src/loadGraphQLSchemaFromOpenAPI.js';
import type { APIEndpointConfig } from '../src/types.js';

/**
 * This test suite verifies the multi-instance API support
 * It tests that multiple API endpoints can be configured and their information
 * is properly stored in the schema extensions
 */
describe('OpenAPI loader: Multi-instance support', () => {
  let createdSchema: GraphQLSchema;
  const testEndpoints: APIEndpointConfig[] = [
    { name: 'ALPHA', endpoint: 'https://alpha.myservice.com' },
    { name: 'BETA', endpoint: 'https://beta.myservice.com' },
    { name: 'GAMMA', endpoint: 'https://gamma.myservice.com' },
  ];

  beforeAll(async () => {
    createdSchema = await loadGraphQLSchemaFromOpenAPI('MultiInstanceTest', {
      source: './fixtures/example_oas2.json',
      cwd: __dirname,
      endpoints: testEndpoints,
    });
  });

  it('should create a valid GraphQL schema', () => {
    expect(createdSchema).toBeInstanceOf(GraphQLSchema);
  });

  it('should store endpoint information in schema extensions', () => {
    expect(createdSchema.extensions).toBeDefined();
    expect(createdSchema.extensions.multiInstanceEndpoints).toBeDefined();
  });

  it('should have all endpoints in the multiInstanceEndpoints extension', () => {
    const multiInstance = createdSchema.extensions.multiInstanceEndpoints as any;
    expect(multiInstance.endpoints).toBeDefined();
    expect(multiInstance.endpoints).toHaveLength(3);
    expect(multiInstance.endpoints).toEqual(
      expect.arrayContaining([
        { name: 'ALPHA', endpoint: 'https://alpha.myservice.com' },
        { name: 'BETA', endpoint: 'https://beta.myservice.com' },
        { name: 'GAMMA', endpoint: 'https://gamma.myservice.com' },
      ]),
    );
  });

  it('should have a properly formed endpointMap', () => {
    const multiInstance = createdSchema.extensions.multiInstanceEndpoints as any;
    expect(multiInstance.endpointMap).toBeDefined();
    expect(multiInstance.endpointMap).toEqual({
      ALPHA: 'https://alpha.myservice.com',
      BETA: 'https://beta.myservice.com',
      GAMMA: 'https://gamma.myservice.com',
    });
  });

  it('should map endpoint names correctly', () => {
    const multiInstance = createdSchema.extensions.multiInstanceEndpoints as any;
    const map = multiInstance.endpointMap;

    expect(map['ALPHA']).toBe('https://alpha.myservice.com');
    expect(map['BETA']).toBe('https://beta.myservice.com');
    expect(map['GAMMA']).toBe('https://gamma.myservice.com');
  });

  it('should allow querying endpoints from schema extensions', () => {
    const multiInstance = createdSchema.extensions.multiInstanceEndpoints as any;
    const endpoints = multiInstance.endpoints;

    // Simulate what a resolver would do - get the endpoint for a specific instance
    const alphaEndpoint = multiInstance.endpointMap[endpoints[0].name];
    expect(alphaEndpoint).toBe('https://alpha.myservice.com');
  });

  describe('Single endpoint (backward compatibility)', () => {
    let singleEndpointSchema: GraphQLSchema;

    beforeAll(async () => {
      singleEndpointSchema = await loadGraphQLSchemaFromOpenAPI('SingleEndpointTest', {
        source: './fixtures/example_oas2.json',
        cwd: __dirname,
        endpoint: 'https://api.myservice.com',
      });
    });

    it('should still work with single endpoint configuration', () => {
      expect(singleEndpointSchema).toBeInstanceOf(GraphQLSchema);
    });

    it('should not add multiInstanceEndpoints extension for single endpoint', () => {
      // When using single endpoint, multiInstanceEndpoints should not be present
      // since the condition checks for endpoints array
      const hasMultiInstance = singleEndpointSchema.extensions?.multiInstanceEndpoints;
      expect(hasMultiInstance).toBeUndefined();
    });
  });

  describe('Empty endpoints array', () => {
    let emptyEndpointsSchema: GraphQLSchema;

    beforeAll(async () => {
      emptyEndpointsSchema = await loadGraphQLSchemaFromOpenAPI('EmptyEndpointsTest', {
        source: './fixtures/example_oas2.json',
        cwd: __dirname,
        endpoints: [],
      });
    });

    it('should handle empty endpoints array gracefully', () => {
      expect(emptyEndpointsSchema).toBeInstanceOf(GraphQLSchema);
    });

    it('should not add multiInstanceEndpoints extension for empty endpoints', () => {
      const hasMultiInstance = emptyEndpointsSchema.extensions?.multiInstanceEndpoints;
      expect(hasMultiInstance).toBeUndefined();
    });
  });
});

describe('Multi-instance resolver pattern example', () => {
  /**
   * This test demonstrates how a resolver would use the endpoint information
   * to fetch data from multiple instances in parallel
   */
  it('should demonstrate multi-instance resolver pattern', async () => {
    const endpoints: APIEndpointConfig[] = [
      { name: 'ALPHA', endpoint: 'https://alpha.myservice.com/users' },
      { name: 'BETA', endpoint: 'https://beta.myservice.com/users' },
    ];

    // Simulate endpoint map as created by enhanceSchemaWithMultiInstanceSupport
    const endpointMap = Object.fromEntries(endpoints.map(e => [e.name, e.endpoint]));

    // Simulate resolver behavior for multi-instance queries
    const mockResolver = async (endpointNames: string[]) => {
      // In a real resolver, you would:
      // 1. Filter the requested instances
      // 2. Fetch from each endpoint in parallel
      // 3. Merge and deduplicate results

      const selectedEndpoints = endpointNames
        .map(name => ({ name, endpoint: endpointMap[name] }))
        .filter(ep => ep.endpoint);

      // Simulate fetching from multiple instances
      const mockResults = selectedEndpoints.map(ep => ({
        instance: ep.name,
        data: [
          { id: 1, name: 'User 1', instance: ep.name },
          { id: 2, name: 'User 2', instance: ep.name },
        ],
      }));

      // Flatten results
      const flattened = mockResults.flatMap(result => result.data);

      // Deduplicate by ID
      const uniqueUsers = Array.from(
        new Map(flattened.map(user => [user.id, user])).values(),
      );

      return uniqueUsers;
    };

    // Test the resolver pattern
    const result = await mockResolver(['ALPHA', 'BETA']);

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    // With deduplication, we should have 2 unique users (ids 1 and 2)
    const uniqueIds = new Set(result.map(u => (u as any).id));
    expect(uniqueIds.size).toBe(2);
  });
});
