import fs from 'fs/promises';
import fs_sync from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import logger from './logger.js';
import { processLuaFiles } from './luaProcessor.js';
import { modifyMainLua } from './utils.js';
import rcedit from 'rcedit';
import AdmZip from 'adm-zip';
import { minimatch } from 'minimatch';
import globToRegExp from 'glob-to-regexp';

const execAsync = util.promisify(exec);

export async function buildProject(projectPath, config) {
  // If config debug is not set, RELEASE mode is enabled by default
  if (!config.env.DEBUG && !config.env.RELEASE) {
    config.env.RELEASE = true;
  }

  // Check if projectPath is a directory
  if (!fs_sync.statSync(projectPath).isDirectory()) {
    throw new Error('Invalid project path');
  }

  // Check if project is a Love2D project
  if (!fs_sync.existsSync(path.join(projectPath, 'main.lua'))) {
    throw new Error('Not a Love2D project');
  }

  const buildPath = path.join(config.build_directory, config.version);
  const artifactsPath = path.join(buildPath, 'artifacts');

  // Ensure build directories exist
  await fs.mkdir(artifactsPath, { recursive: true });

  // Copy and filter files
  const gameFilesPath = path.join(artifactsPath, 'game_files');
  await fs.mkdir(gameFilesPath, { recursive: true });
  logger.info('Filtering and copying game files...'); // Use logger

  // Always exclude craftlove.toml
  config.love_files.push(`!./craftlove.toml`);
  // Always exclude build directory
  config.love_files.push(`!./${config.build_directory}/**`);

  function processPatterns(patternsOriginal, currentDir) {
    return patternsOriginal.map((pattern) => {
      const isNegation = pattern.startsWith("!");
      const normalizedPattern = isNegation ? pattern.slice(1) : pattern;
  
      // Replace "./" with the current directory
      const finalPattern = normalizedPattern.startsWith("./")
        ? normalizedPattern.replace("./", path.join(currentDir, "/"))
        : normalizedPattern;
  
      return {
        pattern: finalPattern,
        isNegation,
      };
    });
  }

  function shouldBeIncluded(filePath, processedPatterns) {
    let hasInclusionMatch = false;
  
    for (const { pattern, isNegation } of processedPatterns) {
      if (minimatch(filePath, pattern)) {
        if (isNegation) {
          // If it's an exclusion pattern, return false immediately
          return false;
        } else {
          hasInclusionMatch = true;
        }
      }
    }
  
    // If no exclusion pattern matched, return whether an inclusion pattern matched
    return hasInclusionMatch;
  }

  const parsedPatterns = processPatterns(config.love_files, projectPath);

  // Only returns true if all matches are true


  async function copyFilteredFiles(srcDir, destDir, parsedPatterns) {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (shouldBeIncluded(srcPath, parsedPatterns)) {
        if (entry.isDirectory()) {
          await fs.mkdir(destPath, { recursive: true });
          await copyFilteredFiles(srcPath, destPath, parsedPatterns);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    }
  }
  await copyFilteredFiles(projectPath, gameFilesPath, parsedPatterns);

  await processLuaFiles(gameFilesPath, config);

  // Modify main.lua in the artifacts directory
  const mainLuaPath = path.join(gameFilesPath, 'main.lua');
  await modifyMainLua(mainLuaPath, config.env);

  // Generate .love file
  const loveFilePath = path.join(artifactsPath, `${config.name || path.basename(projectPath)}.love`);
  logger.info('Creating .love file...'); // Use logger

  // Use AdmZip to create .love file
  const zip = new AdmZip();
  zip.addLocalFolder(gameFilesPath);
  zip.writeZip(loveFilePath);

  // Build for each target
  for (const target of config.targets) {
    logger.info(`Building for target: ${target}`); // Use logger
    if (target === 'win32') {
      await buildForWindows(loveFilePath, buildPath, config);
    } else if (target === 'linux') {
      await buildForLinux(loveFilePath, buildPath, config);
    } else {
      logger.warning(`Unsupported target: ${target}`); // Use logger
    }
  }

  // Handle archive files
  if (config.archive_files) {
    for (const [src, dest] of Object.entries(config.archive_files)) {
      const srcPath = path.join(projectPath, src);
      const destPath = path.join(artifactsPath, dest);
      if (fs_sync.statSync(srcPath).isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await copyFilteredFiles(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  // Clean up game directory if not keeping it
  if (!config.keep_game_directory) {
    await fs.rm(gameFilesPath, { recursive: true, force: true });
  }

  // Clean up artifacts if not keeping them
  if (!config.keep_artifacts) {
    await fs.rm(artifactsPath, { recursive: true, force: true });
  }

  logger.info('Build completed successfully!');
}

async function buildForWindows(loveFilePath, buildPath, config) {
  const windowsPath = path.join(buildPath, 'windows');
  await fs.mkdir(windowsPath, { recursive: true });

  logger.info('Building Windows executable...');

  const loveExecutable = path.join(config.love_binaries || '.', 'love.exe');
  const tempExecutable = path.join(windowsPath, 'temp_love.exe');
  const outputExecutable = path.join(windowsPath, `${config.name || 'game'}.exe`);

  // Copy love.exe to a temporary location
  await fs.copyFile(loveExecutable, tempExecutable);

  // Handle metadata and icon
  if (config.windows && config.windows.exe_metadata) {
    await rcedit(tempExecutable, config.windows.exe_metadata);
  }

  const iconFile = config.icon_file ? path.join(config.project_path, config.icon_file) : path.join(config.love_binaries, 'game.ico');
  await rcedit(tempExecutable, { 'icon': iconFile }).catch((error) => {
    throw error;
  });

  // Combine .love file with the modified love.exe
  await execAsync(`copy /b "${tempExecutable}"+"${loveFilePath}" "${outputExecutable}"`, { shell: 'cmd.exe' });

  // Copy other required binaries
  const files = await fs.readdir(path.dirname(loveExecutable));
  for (const file of files) {
    if (file.endsWith('.dll')) {
      await fs.copyFile(path.join(path.dirname(loveExecutable), file), path.join(windowsPath, file));
    }
  }

  // Remove the temporary executable
  await fs.unlink(tempExecutable);
}

async function buildForLinux(loveFilePath, buildPath, config) {
  const linuxPath = path.join(buildPath, 'linux');
  await fs.mkdir(linuxPath, { recursive: true });

  logger.info('Building Linux AppImage...'); // Use logger

  const appImagePath = config.app_image;
  if (!appImagePath) {
    throw new Error('No AppImage path or URL provided in the configuration.');
  }

  const appImageExecutable = path.join(linuxPath, `${config.name || 'game'}-linux.AppImage`);
  await fs.copyFile(appImagePath, appImageExecutable);
  await execAsync(`chmod +x "${appImageExecutable}"`);

  logger.info('AppImage created:', appImageExecutable); // Use logger
}