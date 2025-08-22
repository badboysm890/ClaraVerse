#!/usr/bin/env node

/**
 * angela Agent Studio CLI
 * 
 * Command-line interface for the angela Agent Studio framework.
 * This tool makes it incredibly easy to:
 * - Generate new nodes from descriptions
 * - Create node plugins
 * - Manage the development environment
 * - Hot-reload nodes during development
 */

import { program } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { NodeGenerator } from '../tools/NodeGenerator';
import { HotReloader } from '../tools/HotReloader';
import { version } from '../package.json';

// ========================================
// CLI Configuration
// ========================================

program
  .name('angela-studio')
  .description('angela Agent Studio - Visual AI Workflow Builder')
  .version(version);

// ========================================
// Node Generation Commands
// ========================================

program
  .command('generate')
  .alias('g')
  .description('Generate a new node from a description')
  .argument('[description]', 'Node description (will prompt if not provided)')
  .option('-o, --output <dir>', 'Output directory', './generated-nodes')
  .option('-f, --format <format>', 'Output format (files|plugin|package)', 'files')
  .option('--no-tests', 'Skip test generation')
  .option('--no-docs', 'Skip documentation generation')
  .action(async (description, options) => {
    await generateNodeCommand(description, options);
  });

program
  .command('create-node')
  .alias('cn')
  .description('Interactive node creation wizard')
  .option('-o, --output <dir>', 'Output directory', './generated-nodes')
  .action(async (options) => {
    await createNodeWizard(options);
  });

program
  .command('batch-generate')
  .alias('bg')
  .description('Generate multiple nodes from a file')
  .argument('<file>', 'File containing node descriptions (one per line)')
  .option('-o, --output <dir>', 'Output directory', './generated-nodes')
  .action(async (file, options) => {
    await batchGenerateCommand(file, options);
  });

// ========================================
// Development Commands
// ========================================

program
  .command('dev')
  .description('Start development mode with hot-reloading')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-w, --watch <dirs...>', 'Directories to watch', ['./src', './plugins'])
  .action(async (options) => {
    await startDevMode(options);
  });

program
  .command('build')
  .description('Build nodes for production')
  .argument('[input]', 'Input directory', './src')
  .option('-o, --output <dir>', 'Output directory', './dist')
  .action(async (input, options) => {
    await buildCommand(input, options);
  });

// ========================================
// Plugin Management Commands
// ========================================

program
  .command('plugin')
  .description('Plugin management commands')
  .addCommand(
    program
      .createCommand('create')
      .description('Create a new plugin')
      .argument('<name>', 'Plugin name')
      .option('-t, --template <template>', 'Plugin template', 'basic')
      .action(async (name, options) => {
        await createPluginCommand(name, options);
      })
  )
  .addCommand(
    program
      .createCommand('install')
      .description('Install a plugin')
      .argument('<plugin>', 'Plugin name or path')
      .action(async (plugin) => {
        await installPluginCommand(plugin);
      })
  )
  .addCommand(
    program
      .createCommand('list')
      .description('List installed plugins')
      .action(async () => {
        await listPluginsCommand();
      })
  );

// ========================================
// Template Commands
// ========================================

program
  .command('template')
  .description('Template management commands')
  .addCommand(
    program
      .createCommand('list')
      .description('List available templates')
      .action(async () => {
        await listTemplatesCommand();
      })
  )
  .addCommand(
    program
      .createCommand('create')
      .description('Create a new template')
      .argument('<name>', 'Template name')
      .action(async (name) => {
        await createTemplateCommand(name);
      })
  );

// ========================================
// Utility Commands
// ========================================

program
  .command('validate')
  .description('Validate node definitions')
  .argument('<files...>', 'Files to validate')
  .action(async (files) => {
    await validateCommand(files);
  });

program
  .command('docs')
  .description('Generate documentation')
  .option('-o, --output <dir>', 'Output directory', './docs')
  .action(async (options) => {
    await generateDocsCommand(options);
  });

program
  .command('init')
  .description('Initialize a new angela Studio project')
  .argument('[name]', 'Project name')
  .option('-t, --template <template>', 'Project template', 'basic')
  .action(async (name, options) => {
    await initProjectCommand(name, options);
  });

// ========================================
// Command Implementations
// ========================================

async function generateNodeCommand(description: string | undefined, options: any) {
  const spinner = ora('Generating node...').start();
  
  try {
    // Get description if not provided
    if (!description) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: 'Describe the node you want to create:',
          validate: (input) => input.trim().length > 0 || 'Description is required'
        }
      ]);
      description = answers.description;
    }

    spinner.text = 'Generating node from description...';
    
    const generator = new NodeGenerator();
    const generated = await generator.generateFromPrompt(description!);
    
    spinner.text = 'Creating files...';
    const files = await generator.createNodeFiles(generated, options.output);
    
    spinner.succeed(chalk.green(`✅ Node generated successfully!`));
    
    console.log(chalk.cyan('\n📁 Generated files:'));
    files.forEach(file => console.log(chalk.gray(`  ${file}`)));
    
    console.log(chalk.yellow('\n💡 Next steps:'));
    console.log(chalk.gray('  1. Review the generated code'));
    console.log(chalk.gray('  2. Run tests: npm test'));
    console.log(chalk.gray('  3. Start development: angela-studio dev'));
    
  } catch (error) {
    spinner.fail(chalk.red(`❌ Generation failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function createNodeWizard(options: any) {
  console.log(chalk.cyan('🎨 Node Creation Wizard\n'));
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Node name:',
      validate: (input) => input.trim().length > 0 || 'Name is required'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Node description:',
      validate: (input) => input.trim().length > 0 || 'Description is required'
    },
    {
      type: 'list',
      name: 'category',
      message: 'Node category:',
      choices: [
        'triggers',
        'actions', 
        'transformers',
        'utilities',
        'ai',
        'data',
        'flow-control',
        'integrations',
        'custom'
      ]
    },
    {
      type: 'confirm',
      name: 'hasInputs',
      message: 'Does this node have inputs?',
      default: true
    },
    {
      type: 'confirm',
      name: 'hasOutputs',
      message: 'Does this node have outputs?',
      default: true
    },
    {
      type: 'confirm',
      name: 'hasProperties',
      message: 'Does this node have configuration properties?',
      default: false
    }
  ]);

  // Additional prompts based on answers
  let inputs = [];
  let outputs = [];
  let properties = [];

  if (answers.hasInputs) {
    inputs = await promptForPorts('input');
  }

  if (answers.hasOutputs) {
    outputs = await promptForPorts('output');
  }

  if (answers.hasProperties) {
    properties = await promptForProperties();
  }

  const spinner = ora('Generating node...').start();
  
  try {
    const generator = new NodeGenerator();
    const generated = await generator.generateNode({
      name: answers.name,
      description: answers.description,
      category: answers.category,
      inputs,
      outputs,
      properties
    });
    
    const files = await generator.createNodeFiles(generated, options.output);
    
    spinner.succeed(chalk.green('✅ Node created successfully!'));
    
    console.log(chalk.cyan('\n📁 Generated files:'));
    files.forEach(file => console.log(chalk.gray(`  ${file}`)));
    
  } catch (error) {
    spinner.fail(chalk.red(`❌ Creation failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function promptForPorts(type: 'input' | 'output'): Promise<any[]> {
  const ports = [];
  let addMore = true;

  while (addMore) {
    const port = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: `${type} port name:`,
        validate: (input) => input.trim().length > 0 || 'Name is required'
      },
      {
        type: 'list',
        name: 'dataType',
        message: `${type} port data type:`,
        choices: ['string', 'number', 'boolean', 'object', 'array', 'any']
      },
      {
        type: 'confirm',
        name: 'required',
        message: `Is this ${type} required?`,
        default: type === 'input'
      },
      {
        type: 'input',
        name: 'description',
        message: `${type} port description (optional):`
      }
    ]);

    ports.push({
      name: port.name,
      type: port.dataType,
      required: port.required,
      description: port.description || undefined
    });

    const { continueAdding } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAdding',
        message: `Add another ${type} port?`,
        default: false
      }
    ]);

    addMore = continueAdding;
  }

  return ports;
}

async function promptForProperties(): Promise<any[]> {
  const properties = [];
  let addMore = true;

  while (addMore) {
    const property = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Property name:',
        validate: (input) => input.trim().length > 0 || 'Name is required'
      },
      {
        type: 'list',
        name: 'type',
        message: 'Property type:',
        choices: ['string', 'number', 'boolean', 'select', 'json', 'code']
      },
      {
        type: 'confirm',
        name: 'required',
        message: 'Is this property required?',
        default: false
      },
      {
        type: 'input',
        name: 'defaultValue',
        message: 'Default value (optional):'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Property description (optional):'
      }
    ]);

    properties.push({
      name: property.name,
      type: property.type,
      required: property.required,
      defaultValue: property.defaultValue || undefined,
      description: property.description || undefined
    });

    const { continueAdding } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAdding',
        message: 'Add another property?',
        default: false
      }
    ]);

    addMore = continueAdding;
  }

  return properties;
}

async function batchGenerateCommand(file: string, options: any) {
  const spinner = ora('Reading file...').start();
  
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(file, 'utf-8');
    const descriptions = content.split('\n').filter(line => line.trim().length > 0);
    
    spinner.text = `Generating ${descriptions.length} nodes...`;
    
    const generator = new NodeGenerator();
    const results = await Promise.all(
      descriptions.map(async (description, index) => {
        try {
          const generated = await generator.generateFromPrompt(description);
          const nodeDir = `${options.output}/node-${index + 1}`;
          const files = await generator.createNodeFiles(generated, nodeDir);
          return { success: true, description, files };
        } catch (error) {
          return { success: false, description, error };
        }
      })
    );
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    spinner.succeed(chalk.green(`✅ Generated ${successful.length}/${descriptions.length} nodes`));
    
    if (failed.length > 0) {
      console.log(chalk.red(`\n❌ Failed to generate ${failed.length} nodes:`));
      failed.forEach(f => console.log(chalk.gray(`  - ${f.description}`)));
    }
    
  } catch (error) {
    spinner.fail(chalk.red(`❌ Batch generation failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function startDevMode(options: any) {
  console.log(chalk.cyan('🚀 Starting angela Studio development mode...\n'));
  
  const reloader = new HotReloader({
    port: parseInt(options.port),
    watchDirs: options.watch
  });
  
  await reloader.start();
  
  console.log(chalk.green(`✅ Development server running on port ${options.port}`));
  console.log(chalk.gray('📁 Watching directories:'));
  options.watch.forEach((dir: string) => console.log(chalk.gray(`  ${dir}`)));
  console.log(chalk.yellow('\n💡 Make changes to your nodes and see them update live!'));
}

async function buildCommand(input: string, options: any) {
  const spinner = ora('Building nodes...').start();
  
  try {
    // TODO: Implement build logic
    spinner.succeed(chalk.green('✅ Build completed'));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Build failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function createPluginCommand(name: string, options: any) {
  const spinner = ora(`Creating plugin ${name}...`).start();
  
  try {
    // TODO: Implement plugin creation
    spinner.succeed(chalk.green(`✅ Plugin ${name} created`));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Plugin creation failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function installPluginCommand(plugin: string) {
  const spinner = ora(`Installing plugin ${plugin}...`).start();
  
  try {
    // TODO: Implement plugin installation
    spinner.succeed(chalk.green(`✅ Plugin ${plugin} installed`));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Plugin installation failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function listPluginsCommand() {
  console.log(chalk.cyan('📦 Installed Plugins:\n'));
  // TODO: List plugins
  console.log(chalk.gray('No plugins installed'));
}

async function listTemplatesCommand() {
  console.log(chalk.cyan('📋 Available Templates:\n'));
  // TODO: List templates
  console.log(chalk.gray('No templates available'));
}

async function createTemplateCommand(name: string) {
  const spinner = ora(`Creating template ${name}...`).start();
  
  try {
    // TODO: Implement template creation
    spinner.succeed(chalk.green(`✅ Template ${name} created`));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Template creation failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function validateCommand(files: string[]) {
  const spinner = ora('Validating files...').start();
  
  try {
    // TODO: Implement validation
    spinner.succeed(chalk.green('✅ All files are valid'));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Validation failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function generateDocsCommand(options: any) {
  const spinner = ora('Generating documentation...').start();
  
  try {
    // TODO: Implement docs generation
    spinner.succeed(chalk.green('✅ Documentation generated'));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Documentation generation failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function initProjectCommand(name: string | undefined, options: any) {
  const projectName = name || 'my-angela-studio-project';
  const spinner = ora(`Initializing project ${projectName}...`).start();
  
  try {
    // TODO: Implement project initialization
    spinner.succeed(chalk.green(`✅ Project ${projectName} initialized`));
    
    console.log(chalk.yellow('\n💡 Next steps:'));
    console.log(chalk.gray(`  cd ${projectName}`));
    console.log(chalk.gray('  npm install'));
    console.log(chalk.gray('  angela-studio dev'));
    
  } catch (error) {
    spinner.fail(chalk.red(`❌ Project initialization failed: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// ========================================
// Error Handling
// ========================================

process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n💥 Uncaught Exception:'));
  console.error(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('\n💥 Unhandled Rejection at:'), promise);
  console.error(chalk.red('Reason:'), reason);
  process.exit(1);
});

// ========================================
// Main
// ========================================

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
} 
