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
  const buildDirectory =  path.join(projectPath, config.build_directory ?? 'build');
  const version = config.version ?? '1.0.0';
  const targets = config.targets ?? [process.platform];
  const love_binaries = config.love_binaries ?? await findLovePath();

  return {
    ...config,
    project_path: projectPath,
    build_directory: buildDirectory,
    version,
    targets,
    love_binaries,
    name: config.name || path.basename(projectPath),
  };
}
