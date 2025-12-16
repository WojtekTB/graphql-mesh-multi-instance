import type { GraphQLOutputType, GraphQLField, GraphQLObjectType, GraphQLInterfaceType } from 'graphql';
import { isListType, isObjectType, isInterfaceType, GraphQLList, isNonNullType, getNamedType } from 'graphql';

/**
 * Merges results from multiple endpoint requests based on the field's return type
 */
export function mergeResults(
  results: any[],
  fieldType: GraphQLOutputType,
  options: {
    deduplicateBy?: string; // Field name to deduplicate by (e.g., "id")
    preferLatest?: boolean; // When merging objects, prefer latest value over earlier ones
  } = {},
): any {
  if (!results || results.length === 0) {
    return null;
  }

  if (results.length === 1) {
    return results[0];
  }

  const namedType = getNamedType(fieldType);
  const isList = isListType(getNamedType(fieldType));

  if (isList) {
    return mergeArrayResults(results, options);
  } else if (isObjectType(namedType) || isInterfaceType(namedType)) {
    return mergeObjectResults(results, options);
  } else {
    // For scalars, enums, etc., return the first result
    return results[0];
  }
}

/**
 * Merges array results from multiple endpoints
 * Concatenates arrays and optionally deduplicates
 */
function mergeArrayResults(
  results: any[],
  options: {
    deduplicateBy?: string;
    preferLatest?: boolean;
  } = {},
): any[] {
  const allItems: any[] = [];

  for (const result of results) {
    if (Array.isArray(result)) {
      allItems.push(...result);
    } else if (result != null) {
      allItems.push(result);
    }
  }

  if (!options.deduplicateBy) {
    return allItems;
  }

  // Deduplicate by specified field
  const seen = new Map<any, number>();
  const deduplicated: any[] = [];

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    if (item == null || typeof item !== 'object') {
      deduplicated.push(item);
      continue;
    }

    const key = item[options.deduplicateBy];
    if (key == null) {
      deduplicated.push(item);
      continue;
    }

    const existingIndex = seen.get(key);
    if (existingIndex != null) {
      // If preferLatest, replace the existing item
      if (options.preferLatest) {
        deduplicated[existingIndex] = item;
      }
      // Otherwise keep the first occurrence
    } else {
      seen.set(key, deduplicated.length);
      deduplicated.push(item);
    }
  }

  return deduplicated;
}

/**
 * Merges object results from multiple endpoints
 * Deep merges objects, with later values overwriting earlier ones
 */
function mergeObjectResults(
  results: any[],
  options: {
    deduplicateBy?: string;
    preferLatest?: boolean;
  } = {},
): any {
  const merged: any = {};

  for (const result of results) {
    if (result == null || typeof result !== 'object') {
      continue;
    }

    deepMerge(merged, result, options.preferLatest ?? true);
  }

  return merged;
}

/**
 * Deep merges source object into target object
 */
function deepMerge(target: any, source: any, preferLatest: boolean): void {
  for (const key in source) {
    if (!source.hasOwnProperty(key)) {
      continue;
    }

    const sourceValue = source[key];
    const targetValue = target[key];

    if (sourceValue == null) {
      continue;
    }

    if (Array.isArray(sourceValue)) {
      if (!Array.isArray(targetValue)) {
        target[key] = sourceValue;
      } else {
        // Merge arrays by concatenating
        target[key] = [...targetValue, ...sourceValue];
      }
    } else if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue)) {
      if (typeof targetValue !== 'object' || targetValue === null || Array.isArray(targetValue)) {
        target[key] = sourceValue;
      } else {
        // Recursively merge nested objects
        deepMerge(targetValue, sourceValue, preferLatest);
      }
    } else {
      // For scalars, only update if preferLatest or target doesn't have the value
      if (preferLatest || targetValue == null) {
        target[key] = sourceValue;
      }
    }
  }
}

/**
 * Validates that all results have compatible structure
 * Throws error if incompatible
 */
export function validateResultCompatibility(results: any[], fieldType: GraphQLOutputType): void {
  if (!results || results.length <= 1) {
    return;
  }

  const namedType = getNamedType(fieldType);

  // Check consistency across results
  const firstResult = results[0];
  const firstType = firstResult == null ? null : Array.isArray(firstResult) ? 'array' : typeof firstResult;

  for (let i = 1; i < results.length; i++) {
    const result = results[i];
    const resultType = result == null ? null : Array.isArray(result) ? 'array' : typeof result;

    // Allow null values
    if (result == null && firstResult == null) {
      continue;
    }

    // Check type consistency
    if (resultType !== firstType) {
      throw new Error(
        `Incompatible result types from endpoints: expected ${firstType}, got ${resultType} in result #${i + 1}`,
      );
    }
  }
}
