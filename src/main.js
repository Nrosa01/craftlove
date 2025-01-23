import { program } from 'commander';
import { loadConfig } from './config.js';
import { buildProject } from './build.js';
import { runProject } from './runner.js';
import logger from './logger.js';

const args = process.argv.slice(2);
if (args.includes('--verbose')) {
    logger.setLevel('info');
} else if (args.includes('--errors-only')) {
    logger.setLevel('error');
} else {
    logger.setLevel('warning');
}

program
    .name('craftlove')
    .description('Build system for Love2D projects')
    .argument('<path>', 'Path to the Love2D project')
    .argument('<mode>', 'If it\'s a build or run command')
    .option('--version <version>', 'Override the version in the build')
    .option('--release', 'Enable RELEASE mode')
    .option('--debug', 'Enable DEBUG mode')
    .option('--set-var <variable>', 'Define a custom conditional compilation variable', (val, vars) => {
        vars.push(val);
        return vars;
    }, [])
    .action(async (mode, projectPath, options) => {
        try {
            const config = await loadConfig(projectPath);

            // Handle version override
            if (options.version) {
                config.version = options.version;
            }

            if (!config.version) {
                config.version = '1.0.0';
            }

            // Handle conditional compilation variables and version
            config.env = {
                ...config.env,
                ...(options.debug && { DEBUG: true }),
                ...(options.release && { RELEASE: true }),
                ...Object.fromEntries(options.setVar.map((v) => [v, true])),
                VERSION: config.version,
            };

            if (mode === 'run') 
                await runProject(projectPath, config, options);
            else if (mode === 'build') 
                await buildProject(projectPath, config);
        
        } catch (error) {
            logger.error('Error during build:', error.message);
            process.exit(1);
        }
    });

program.parse();
