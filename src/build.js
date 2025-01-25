import fs from 'fs/promises';
import fs_sync from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import logger from './logger.js';
import { processLuaFiles } from './luaProcessor.js';
import { modifyMainLua, copyFilteredFiles, shouldBeIncluded, processPatterns } from './utils.js';
import rcedit from 'rcedit';
import AdmZip from 'adm-zip';

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
  config.love_files.push(`!craftlove.toml`);
  // Always exclude build directory
  let buildDirectory = path.basename(config.build_directory);
  config.love_files.push(`!${buildDirectory}/**`);

  const parsedPatterns = processPatterns(config.love_files, projectPath);

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

async function handleArchiveFiles(projectPath, destPath, archiveFiles) {
  for (const [src, dest] of Object.entries(archiveFiles)) {
    const srcPath = path.join(projectPath, src);
    const finalDestPath = path.join(destPath, dest);
    if (fs_sync.statSync(srcPath).isDirectory()) {
      await fs.mkdir(finalDestPath, { recursive: true });
      await copyFilteredFiles(srcPath, finalDestPath, processPatterns(['**/*'], srcPath));
    } else {
      await fs.copyFile(srcPath, finalDestPath);
    }
  }
}

async function buildForWindows(loveFilePath, buildPath, config) {
  const windowsPath = path.join(buildPath, 'windows');
  await fs.mkdir(windowsPath, { recursive: true });

  logger.info('Building Windows executable...');

  const loveExecutable = path.join(config.windows.love_binaries || '.', 'love.exe');
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

  // Handle archive files
  const combinedArchiveFiles = { ...config.archive_files, ...config.windows?.archive_files };
  await handleArchiveFiles(config.project_path, windowsPath, combinedArchiveFiles);

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

  // Handle archive files
  // Here someone should add linux-specific archive files
  await handleArchiveFiles(config.project_path, linuxPath, config.archive_files);

  logger.info('AppImage created:', appImageExecutable); // Use logger
}