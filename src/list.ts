import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fuzzy from 'fuzzy';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Package } from './types/index.js';
import { displayPackageDetailsWithActions } from './utils/display.js';
import { installPackage, uninstallPackage } from './utils/package-management.js';
import { createInterface } from 'readline';
import Table from 'cli-table3'; // Import cli-table3
import stringWidth from 'string-width'; // Import string-width
import AutocompletePrompt from 'inquirer-autocomplete-prompt'; // Import autocomplete prompt

// Register the autocomplete prompt
inquirer.registerPrompt('autocomplete', AutocompletePrompt);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageListPath = path.join(__dirname, '../packages/package-list.json');
export async function list() {
  let packages: Package[];
  try {
    const data = fs.readFileSync(packageListPath, 'utf8');
    packages = JSON.parse(data);
    if (!Array.isArray(packages)) {
      throw new Error('Package list is not an array');
    }
    console.log(chalk.bold.cyan('\n📦 Available Packages'));
    console.log(chalk.gray(`Found ${packages.length} packages\n`));
  } catch (error) {
    console.error(chalk.red(`Error loading package list from ${packageListPath}`));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  // Prepare choices for inquirer using table-like format
  const choices = packages.map((pkg, index) => ({
    name: `${pkg.name.padEnd(24)} │ ${
      pkg.description.length > 47 ? `${pkg.description.slice(0, 44)}...` : pkg.description.padEnd(49)
    } │ ${pkg.vendor.padEnd(19)} │ ${pkg.license.padEnd(14)}`,
    value: pkg,
    short: pkg.name
  }));

  const answer = await inquirer.prompt<{ selectedPackage: Package }>([
    {
      type: 'autocomplete',
      name: 'selectedPackage',
      message: 'Search and select a package:',
      source: async (_answersSoFar: any, input: string) => {
        if (!input) return choices;

        return fuzzy
          .filter(input.toLowerCase(), choices, {
            extract: (choice) => `${choice.value.name} ${choice.value.description} ${choice.value.vendor}`.toLowerCase()
          })
          .map(result => result.original);
      },
      pageSize: 10
    }
  ]);

  const displayPackages = answer.selectedPackage ? [answer.selectedPackage] : packages;

  if (displayPackages.length === 0) {
    console.log(chalk.yellow('\nNo packages found matching your search.'));
    return;
  }

  console.log(chalk.bold.white(`\nShowing ${displayPackages.length} package(s):`));
  displayPackages.forEach(displayPackageDetailsWithActions);

  if (displayPackages.length === 1) {
    const pkg = displayPackages[0];
    await handleSelectedPackage(pkg);
  }
}

async function handleSelectedPackage(pkg: Package) {
  const action = await displayPackageDetailsWithActions(pkg);
  
  switch (action) {
    case 'install':
      console.log(chalk.cyan(`\nPreparing to install ${pkg.name}...`));
      await installPackage(pkg);
      break;
    case 'uninstall':
      const { confirmUninstall } = await inquirer.prompt<{ confirmUninstall: boolean }>([
        {
          type: 'confirm',
          name: 'confirmUninstall',
          message: `Are you sure you want to uninstall ${pkg.name}?`,
          default: false
        }
      ]);
      
      if (confirmUninstall) {
        await uninstallPackage(pkg.name);
        console.log(chalk.green(`Successfully uninstalled ${pkg.name}`));
      } else {
        console.log('Uninstallation cancelled.');
      }
      break;
    case 'open':
      if (pkg.sourceUrl) {
        const open = (await import('open')).default;
        await open(pkg.sourceUrl);
        console.log(chalk.green(`\nOpened ${pkg.sourceUrl} in your browser`));
      } else {
        console.log(chalk.yellow('\nNo source URL available for this package'));
      }
      break;
    case 'back':
      await list();
      return;
    case 'exit':
      process.exit(0);
  }
  
  // Show actions again after completing an action (except for exit/back)
  await handleSelectedPackage(pkg);
}
