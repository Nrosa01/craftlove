import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import logger from './logger.js';
import { buildProject } from './build.js';
import { modifyMainLua } from './utils.js';
const execAsync = util.promisify(exec);

export async function runProject(projectPath, config, options) {
    if (!config.love_binaries || typeof config.love_binaries !== 'string') {
        throw new Error('Invalid love_binaries path');
    }

    const love_executable = path.join(config.love_binaries, 'love');
    const buildPath = path.join(config.build_directory, config.version);
    const gameFilesPath = path.join(buildPath, 'artifacts', 'game_files');

    // If it doesn't exist release not debug, by default debug is enabled
    if (!config.env.DEBUG && !config.env.RELEASE) {
        config.env.DEBUG = true;
    }

    if (config.env.DEBUG) {
        const mainLuaPath = path.join(projectPath, 'main.lua');
        const tempMainLuaPath = path.join(projectPath, 'main_temp.lua');

        // Create a backup of main.lua
        await fs.copyFile(mainLuaPath, tempMainLuaPath);

        await modifyMainLua(mainLuaPath, config.env);

        // Run the project
        try {
            await execAsync(`"${love_executable}" ${projectPath} debug`);
        } catch (error) {
            logger.error('Error running Love2D project:', error.message);
            throw error;
        } finally {
            // Restore the original main.lua
            await fs.unlink(mainLuaPath);
            await fs.rename(tempMainLuaPath, mainLuaPath);
        }
    } else {
        // Build the project and run from the build path
        await buildProject(projectPath, config, options);
        try {
            await execAsync(`"${love_executable}" ${gameFilesPath}`);
        } catch (error) {
            logger.error('Error running Love2D project:', error.message);
            throw error;
        }
    }
}
