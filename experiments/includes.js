import path from "path";
import assert from "assert";
import { minimatch } from "minimatch";

// Function to normalize paths for minimatch (only on Windows)
function normalizePathForMatch(filePath) {
  return path.sep === "\\" ? filePath.replace(/\\/g, "/") : filePath;
}

// Function to check if a file should be included
function shouldBeIncluded(filePath, processedPatterns) {
  let hasInclusionMatch = false;
  const normalizedFilePath = normalizePathForMatch(filePath);

  for (const { pattern, isNegation } of processedPatterns) {
    if (hasInclusionMatch && !isNegation) 
      continue; // Skip if already included

    const normalizedPattern = normalizePathForMatch(pattern);

    if (minimatch(normalizedFilePath, normalizedPattern)) {
      if (isNegation) {
        return false;
      } else {
        hasInclusionMatch = true;
      }
    }
  }
  return hasInclusionMatch;
}

// Helper to transform original patterns into processed patterns
function processPatterns(patternsOriginal, currentDir) {
  return patternsOriginal.map((pattern) => {
    const isNegation = pattern.startsWith("!");
    const normalizedPattern = isNegation ? pattern.slice(1) : pattern;

    // Add currentDir only if the pattern does not start with *
    const finalPattern = normalizedPattern.startsWith("*")
      ? normalizedPattern // Leave patterns starting with * unchanged
      : path.join(currentDir, normalizedPattern); // Add currentDir

    return {
      pattern: finalPattern,
      isNegation,
    };
  });
}

// Test cases
const currentDir = "test"; // Simulated current directory
const files = [
  "main.lua",
  "craftlove.toml",
  "metadata/file1.txt",
  "metadata/file2.txt",
  ".hiddenfile", // Simulated hidden file
].map((file) => path.join(currentDir, file)); // Make file paths relative to currentDir

const patternsOriginal = [
  "**/*", // Include all files
  "!.*", // Exclude hidden files
  "!metadata/**", // Exclude everything in metadata
  "!craftlove.toml", // Exclude craftlove.toml
];

const processedPatterns = processPatterns(patternsOriginal, currentDir);

// Expected results
const expectedResults = [
  true, // test/main.lua -> Included by **/*
  false, // test/craftlove.toml -> Excluded by !craftlove.toml
  false, // test/metadata/file1.txt -> Excluded by !metadata/**
  false, // test/metadata/file2.txt -> Excluded by !metadata/**
  false, // test/.hiddenfile -> Excluded by !.*
];

// Automated tests
files.forEach((file, index) => {
  const result = shouldBeIncluded(file, processedPatterns);
  console.log(`Testing ${file}: Expected ${expectedResults[index]}, Got ${result}`);
  assert.strictEqual(result, expectedResults[index]);
});

console.log("All tests passed!");