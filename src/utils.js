import fs from 'fs/promises';

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
        craftloveTable += `  ${key.toUpperCase()} = ${value},\n`;
    }

    craftloveTable += "}\n\n";


    mainLuaContent = craftloveTable + mainLuaContent;

    await fs.writeFile(mainLuaPath, mainLuaContent, 'utf-8');
}
