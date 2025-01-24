import fs_async from 'fs/promises';
import fs from 'fs';
import path from 'path';
import logger from './logger.js';
import LineEndingCorrector from 'line-ending-corrector'

/**
 * Converts a Lua expression to a JavaScript expression.
 * @param {string} luaExpr - Lua expression to convert.
 * @param {object} env - Environment variables for evaluation.
 * @returns {boolean} - The result of evaluating the converted expression.
 */
function evaluateLuaExpression(luaExpr, env) {
  const jsExpr = luaExpr
    .replace(/_G\.CRAFT_LOVE\./g, 'env.')
    .replace(/CRAFT_LOVE\./g, 'env.')
    .replace(/==/g, '===')
    .replace(/~=/g, '!==')
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\b/g, '!');

  try {
    return Function('env', `return ${jsExpr}`)(env);
  } catch (e) {
    logger.error(`Failed to evaluate expression: ${luaExpr}`);
    return false;
  }
}

/**
 * Checks if a block should be processed based on its condition.
 * @param {string} condition - The condition of the block.
 * @returns {boolean} - True if the block should be processed, false otherwise.
 */
function shouldProcessBlock(condition) {
  return condition.includes('CRAFT_LOVE') || condition.includes('_G.CRAFT_LOVE');
}

/**
 * Represents a block of Lua code (if-elseif-else).
 */
class ConditionalExpression {
  constructor(condition, body, elseIfBlocks = [], elseBlock = null, nextText = '') {
    this.condition = condition;
    this.body = body;
    this.elseIfBlocks = elseIfBlocks;
    this.elseBlock = elseBlock;
    this.nextText = nextText;
    this.is_craft_love = shouldProcessBlock(condition);
  }
}


/**
 * Parses a block of Lua code (if-elseif-else) and returns the ConditionalExpression object.
 * @param {string[]} lines - Array of lines in the file.
 * @param {number} startIndex - Index of the line where the block starts.
 * @returns {object} - { expression: ConditionalExpression, endIndex: number }
 */
function parseConditional(lines, startIndex, env) {
  let i = startIndex;
  const ifMatch = lines[i].match(/^\s*if (.+) then$/);
  if (!ifMatch) {
    throw new Error(`Invalid block starting at line ${i + 1}`);
  }

  const condition = ifMatch[1];
  const body = [];
  const elseIfBlocks = [];
  let elseBlock = null;
  let nextText = '';

  i++;

  const findNextExpr = (start) => {
    let nestedLevel = 0; // Contador de bloques anidados
    for (let j = start; j < lines.length; j++) {
      const line = lines[j];

      if (line.match(/^\s*if .+ then$/)) {
        nestedLevel++; // Incrementar el nivel de anidamiento
      } else if (line.match(/^\s*end$/)) {
        if (nestedLevel === 0) {
          return j; // Devolver el índice del "end" correspondiente
        }
        nestedLevel--; // Decrementar el nivel de anidamiento
      } else if (line.match(/^\s*elseif .+ then$/) || line.match(/^\s*else$/)) {
        if (nestedLevel === 0) {
          return j; // Devolver el índice del "elseif" o "else"
        }
      }
    }
    throw new Error(`Unclosed block starting at line ${start + 1}`);
  };

  // Procesar el cuerpo del bloque "if"
  let nextExprIndex = findNextExpr(i);
  while (i < nextExprIndex) {
    const line = lines[i];

    // Verificar si es un bloque "if" anidado
    const nestedIfMatch = line.match(/^\s*if (.+) then$/);
    if (nestedIfMatch) {
      const { expression: nestedExpression, endIndex: nestedEndIndex } = parseConditional(lines, i, env);
      body.push(processConditional(nestedExpression, env)); // Procesar el bloque anidado
      i = nestedEndIndex + 1; // Saltar al siguiente bloque
    } else {
      body.push(line);
      i++;
    }
  }

  // Procesar "elseif" y "else"
  while (i < lines.length) {
    const line = lines[i];

    const elseifMatch = line.match(/^\s*elseif (.+) then$/);
    const elseMatch = line.match(/^\s*else$/);
    const endMatch = line.match(/^\s*end$/);

    if (elseifMatch) {
      const condition = elseifMatch[1];
      i++;
      const elseifBody = [];
      const elseifEndIndex = findNextExpr(i);
      while (i < elseifEndIndex) {
        elseifBody.push(lines[i]);
        i++;
      }
      elseIfBlocks.push({ condition, body: elseifBody.join('\n') });
    } else if (elseMatch) {
      i++;
      const elseBody = [];
      const elseEndIndex = findNextExpr(i);
      while (i < elseEndIndex) {
        elseBody.push(lines[i]);
        i++;
      }
      elseBlock = elseBody.join('\n');
    } else if (endMatch) {
      // Capturar el texto después del bloque
      nextText = lines.slice(i + 1).join('\n');
      return {
        expression: new ConditionalExpression(condition, body.join('\n'), elseIfBlocks, elseBlock, nextText),
        endIndex: i,
      };
    } else {
      i++;
    }
  }

  throw new Error(`Unclosed block starting at line ${startIndex + 1}`);
}


/**
 * Processes a ConditionalExpression and returns the lines to keep.
 * @param {ConditionalExpression} expression - The expression to process.
 * @param {object} env - Environment variables for evaluation.
 * @returns {string} - Processed text.
 */
function processConditional(expression, env) {
  if (expression.is_craft_love) {
    // Evaluate the condition and return the corresponding body
    if (evaluateLuaExpression(expression.condition, env)) {
      return processContent(expression.body, env);
    }

    for (const elseifBlock of expression.elseIfBlocks) {
      if (evaluateLuaExpression(elseifBlock.condition, env)) {
        return processContent(elseifBlock.body, env);
      }
    }

    if (expression.elseBlock) {
      return processContent(expression.elseBlock, env);
    }

    return ''; // No condition matched, remove the block
  } else {
    // Retain the block structure but process nested blocks
    let result = `if ${expression.condition} then\n`;
    result += processContent(expression.body, env) + '\n'; // Procesar el cuerpo del bloque if

    for (const elseifBlock of expression.elseIfBlocks) {
      result += `elseif ${elseifBlock.condition} then\n`;
      result += processContent(elseifBlock.body, env) + '\n'; // Procesar el cuerpo del bloque elseif
    }

    if (expression.elseBlock) {
      result += 'else\n';
      result += processContent(expression.elseBlock, env) + '\n'; // Procesar el cuerpo del bloque else
    }

    result += 'end';
    return result;
  }
}

/**
 * Processes the content of a block, including nested blocks.
 * @param {string} content - The content of the block.
 * @param {object} env - Environment variables for evaluation.
 * @returns {string} - Processed text.
 */
function processContent(content, env) {
  const lines = content.split('\n');
  let processedText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // If line is an assertion, skip it
    if (line.match(/^\s*assert\(.+\)$/))
      continue;


    const ifMatch = line.match(/^\s*if (.+) then$/);
    if (ifMatch) {
      const { expression, endIndex } = parseConditional(lines, i);
      processedText += processConditional(expression, env) + '\n';
      i = endIndex;
    } else if (shouldProcessBlock(line)) {
      // Process lines that contain CRAFT_LOVE
      processedText += processLine(line, env) + '\n';
    } else {
      // Copy lines that do not contain CRAFT_LOVE as-is
      processedText += line + '\n';
    }
  }

  return processedText;
}

/**
 * Processes a single line that contains CRAFT_LOVE.
 * @param {string} line - The line to process.
 * @param {object} env - Environment variables for evaluation.
 * @returns {string} - Processed line.
 */
function processLine(line, env) {
  // Evaluate the line if it contains CRAFT_LOVE
  if (shouldProcessBlock(line)) {
    return evaluateLuaExpression(line, env) ? line : '';
  }
  return line; // Return the line as-is if it doesn't contain CRAFT_LOVE
}


/**
 * Processes a Lua file to remove conditional compilation blocks.
 * @param {string} filePath - Path to the Lua file.
 * @param {object} env - Environment variables for evaluation.
 * @param {boolean} removeAssertions - Whether to remove assertions.
 */
async function processFile(filePath, env, removeAssertions) {
  const readStream = fs.createReadStream(filePath, { encoding: 'utf-8' });

  const modifiedStream = LineEndingCorrector.LineEndingCorrector.correctStream (readStream , { encoding: 'utf8', eolc: 'LF' });

  let content = '';

  for await (const chunk of modifiedStream) {
    content += chunk;
  }

  let processedContent = '';

  const removeAssertionsFromLine = (line) => {
    if (removeAssertions) {
      return line.replace(/assert\(([^)]*)\)/g, '');
    }
    return line;
  };

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Handle inline comments
    const ifInlineMatch = line.match(/^\s*---#if_inline (.+)/);
    const ifBelowMatch = line.match(/^\s*---#if_below (.+)/);

    if (ifInlineMatch) {
      const expr = ifInlineMatch[1];
      if (evaluateLuaExpression(expr, env)) {
        processedContent += line.replace(ifInlineMatch[0], '') + '\n';
      }
      continue;
    }

    if (ifBelowMatch) {
      const expr = ifBelowMatch[1];
      if (!evaluateLuaExpression(expr, env)) {
        i++; // Skip the next line
      }
      continue;
    }

    // Handle if blocks
    const ifMatch = line.match(/^\s*if (.+) then$/);
    if (ifMatch) {
      const { expression, endIndex } = parseConditional(lines, i, env);
      processedContent += processConditional(expression, env) + '\n';
      i = endIndex;
      continue;
    }

    // Handle regular lines
    line = removeAssertionsFromLine(line);
    processedContent += line + '\n';
  }

  await fs_async.writeFile(filePath, processedContent.trim(), 'utf-8');
}

/**
 * Processes Lua files to remove conditional compilation blocks.
 * @param {string} projectPath - Path to the project directory.
 * @param {object} variables - A map of variables for conditional compilation.
 * @param {object} config - Build configuration.
 */
export async function processLuaFiles(projectPath, config) {
  if (!config.conditional_compilation.enabled) {
    return;
  }

  logger.info('Processing Lua files for conditional compilation...');

  const processDirectory = async (dir, env) => {
    const entries = await fs_async.readdir(dir, { withFileTypes: true });
    const removeAssertions = config.conditional_compilation.remove_assertions;

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await processDirectory(entryPath, env);
      } else if (entry.isFile() && entry.name.endsWith('.lua')) {
        await processFile(entryPath, env, removeAssertions);
      }
    }
  };

  await processDirectory(projectPath, config.env);
  logger.info('Lua files processed successfully.');
}