/**
 * Vector Math Utilities
 * 
 * Provides vector operations for similarity search
 */

/**
 * Calculate cosine similarity between two vectors
 * 
 * @param vectorA First vector
 * @param vectorB Second vector
 * @returns Cosine similarity score (-1 to 1, higher = more similar)
 */
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error(`Vector dimensions must match: ${vectorA.length} vs ${vectorB.length}`);
  }

  if (vectorA.length === 0) {
    throw new Error('Vectors cannot be empty');
  }

  // Calculate dot product
  let dotProduct = 0;
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
  }

  // Calculate magnitudes
  const magnitudeA = Math.sqrt(
    vectorA.reduce((sum, val) => sum + val * val, 0)
  );
  const magnitudeB = Math.sqrt(
    vectorB.reduce((sum, val) => sum + val * val, 0)
  );

  // Avoid division by zero
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  // Cosine similarity
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Calculate Euclidean distance between two vectors
 * 
 * @param vectorA First vector
 * @param vectorB Second vector
 * @returns Euclidean distance (lower = more similar)
 */
export function euclideanDistance(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error(`Vector dimensions must match: ${vectorA.length} vs ${vectorB.length}`);
  }

  let sumSquaredDiff = 0;
  for (let i = 0; i < vectorA.length; i++) {
    const diff = vectorA[i] - vectorB[i];
    sumSquaredDiff += diff * diff;
  }

  return Math.sqrt(sumSquaredDiff);
}

/**
 * Normalize a vector to unit length
 * 
 * @param vector Input vector
 * @returns Normalized vector
 */
export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );

  if (magnitude === 0) {
    return vector; // Return zero vector as-is
  }

  return vector.map(val => val / magnitude);
}
