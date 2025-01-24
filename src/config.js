import fs from 'fs/promises';
import path from 'path';
import toml from 'toml';
import logger from './logger.js';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

async function findLovePath() {
  const command = process.platform === 'win32' ? 'where love' : 'which love';
  try {
    const { stdout } = await execPromise(command);
    const lovePath = stdout.trim();
    return path.dirname(lovePath);
  } catch (error) {
    logger.error('Could not find love executable');
    return null;
  }
}

export async function loadConfig(projectPath) {
  const configPath = path.join(projectPath, 'craftlove.toml');
  let config = {};

  try {
    const configFile = await fs.readFile(configPath, 'utf-8');
    config = toml.parse(configFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    logger.warning('No craftlove.toml found, using defaults');
  }

  // Set defaults
  
  // if config.windows is undefined, define it
  config.windows = config.windows ?? {};
  config.keep_game_directory = config.keep_game_directory ?? false;
  config.keep_artifacts = config.keep_artifacts ?? false;
  config.conditional_compilation = {
    enabled: false,
    remove_assertions: true,
    ...config.conditional_compilation,
  };
  config.archive_files = config.archive_files ?? {};
  config.love_files = config.love_files ?? ['**/*', '!**/.*']; // Default to all files except hidden files

  const buildDirectory = path.join(projectPath, config.build_directory ?? 'craftlove_build');
  const version = config.version ?? '1.0.0';
  const targets = config.targets ?? [process.platform];
  config.windows = 
  {
    love_binaries : await findLovePath(),
    archive_files : {},
    ...config.windows,
  }

  config.artifacts = [].concat(config.artifacts ?? ['archive']).flat();

  return {
    ...config,
    project_path: projectPath,
    build_directory: buildDirectory,
    version,
    targets,
    name: config.name || path.basename(projectPath),
  };
}
