import fs from 'fs/promises';
import path from 'path';
import { minimatch } from 'minimatch';

/**
 * Modifies the main.lua file to include _G.CRAFT_LOVE variables.
 * @param {string} mainLuaPath - Path to the main.lua file.
 * @param {object} env - Environment variables to include.
 */
export async function modifyMainLua(mainLuaPath, env) {
  // Read and modify main.lua
  let mainLuaContent = await fs.readFile(mainLuaPath, 'utf-8');
  let craftloveTable = "_G.CRAFT_LOVE = {\n";

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      craftloveTable += `  ${key.toUpperCase()} = "${value}",\n`;
    } else {
      craftloveTable += `  ${key.toUpperCase()} = ${value},\n`;
    }
  }

  craftloveTable += "}\n\n";

  mainLuaContent = craftloveTable + mainLuaContent;

  await fs.writeFile(mainLuaPath, mainLuaContent, 'utf-8');
}

export function processPatterns(patternsOriginal, currentDir) {
  const extraPatterns = [];

  const processedPatterns = patternsOriginal.map((pattern) => {
    const isNegation = pattern.startsWith("!");
    const normalizedPattern = isNegation ? pattern.slice(1) : pattern;

    // Add currentDir only if the pattern does not start with *
    const finalPattern = normalizePathForMatch(normalizedPattern.startsWith("*")
      ? normalizedPattern // Leave patterns starting with * unchanged
      : path.join(currentDir, normalizedPattern)); // Add currentDir

    // I'm not sure if there is a way to do this without this dirty harcoded hack
    // I would expect minimatch to match stuff line "engine" and "engine/**" but it seems that's not possible
    // Check if the pattern ends with /**
    if (finalPattern.endsWith("/**") && !finalPattern.startsWith("*")) {
      // Add a pattern without /** to include the directory itself
      const dirPattern = finalPattern.slice(0, -3); // Remove /**
      extraPatterns.push({
        pattern: dirPattern,
        isNegation,
      });
    }

    return {
      pattern: finalPattern,
      isNegation,
    };
  });

  // Merge processedPatterns and extraPatterns
  return [...processedPatterns, ...extraPatterns];
}

export function normalizePathForMatch(filePath) {
  return path.sep === "\\" ? filePath.replace(/\\/g, "/") : filePath;
}

export function shouldBeIncluded(filePath, processedPatterns) {
  let hasInclusionMatch = false;

  for (const { pattern, isNegation } of processedPatterns) {
    if (hasInclusionMatch && !isNegation)
      continue; // Skip if already included


    if (minimatch(filePath, pattern)) {
      if (isNegation) {
        return false;
      } else {
        hasInclusionMatch = true;
      }
    }
  }
  return hasInclusionMatch;
}

export async function copyFilteredFiles(srcDir, destDir, parsedPatterns) {
  const createdDirs = [];

  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (shouldBeIncluded(normalizePathForMatch(srcPath), parsedPatterns)) {
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        createdDirs.push(destPath);
        await copyFilteredFiles(srcPath, destPath, parsedPatterns);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  // Remove empty directories
  for (const dir of createdDirs.reverse()) {
    const files = await fs.readdir(dir);
    if (files.length === 0) {
      await fs.rmdir(dir);
    }
  }
}
