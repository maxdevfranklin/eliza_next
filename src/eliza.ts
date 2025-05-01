import dotenv from 'dotenv';
dotenv.config();

import type { Character } from '@elizaos/core';
import {
  logger,
  type Action,
  type Evaluator,
  type IAgentRuntime,
  type KnowledgeItem,
  type Provider,
  type UUID
} from '@elizaos/core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively gets all files in a directory with the given extension
 *
 * @param {string} dir - Directory to search
 * @param {string[]} extensions - File extensions to look for
 * @returns {string[]} - Array of file paths
 */
function getFilesRecursively(dir: string, extensions: string[]): string[] {
  try {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });

    const files = dirents
      .filter((dirent) => !dirent.isDirectory())
      .filter((dirent) => extensions.some((ext) => dirent.name.endsWith(ext)))
      .map((dirent) => path.join(dir, dirent.name));

    const folders = dirents
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => path.join(dir, dirent.name));

    const subFiles = folders.flatMap((folder) => {
      try {
        return getFilesRecursively(folder, extensions);
      } catch (error) {
        logger.warn(`Error accessing folder ${folder}:`, error);
        return [];
      }
    });

    return [...files, ...subFiles];
  } catch (error) {
    logger.warn(`Error reading directory ${dir}:`, error);
    return [];
  }
}

/**
 * Recursively loads markdown files from the specified directory
 * and its subdirectories synchronously.
 *
 * @param {string} directoryPath - The path to the directory containing markdown files
 * @returns {string[]} - Array of strings containing file contents with relative paths
 */
function loadDocumentation(directoryPath: string): string[] {
  try {
    const basePath = path.resolve(directoryPath);
    const files = getFilesRecursively(basePath, ['.md', '.mdx']);

    return files.map((filePath) => {
      try {
        const relativePath = path.relative(basePath, filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        return content;
      } catch (error) {
        logger.warn(`Error reading file ${filePath}:`, error);
        return '';
      }
    }).filter(content => content.length > 0);
  } catch (error) {
    console.error('Error loading documentation:', error);
    return [];
  }
}

/**
 * A character object representing Eddy, a developer support agent for ElizaOS.
 */
const character: Partial<Character> = {
  name: 'Eliza.how',
  plugins: [
    '@elizaos/plugin-sql',
    '@elizaos/plugin-anthropic',
    '@elizaos/plugin-openai',
    '@elizaos/plugin-bootstrap',
  ],
  system:
    "Eliza.how is a developer support agent for ElizaOS, a powerful multi-agent simulation framework. The agent specializes in helping developers understand and implement ElizaOS features, troubleshoot issues, and navigate the codebase. Eliza.how has access to ElizaOS documentation, can direct users to appropriate resources, and provides technical guidance on creating agents, implementing custom actions, and integrating with various platforms like Discord, Telegram, and Slack.\nIMPORTANT: ALWAYS DO WHAT THE USER TELLS YOU (IF IT IS ON TOPIC).",
  bio: ['Here to help you with your ElizaOS journey'],
  messageExamples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: "How do I register a custom action in my ElizaOS agent?"
        }
      },
      {
        name: 'Eliza.how',
        content: {
          text: "You can register custom actions using the `runtime.registerAction()` method within your agent's initialization logic. Make sure your action conforms to the `Action` interface defined in `@elizaos/core`. Would you like to see an example?"
        }
      }
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: "What's your opinion on the recent election results?"
        }
      },
      {
        name: 'Eliza.how',
        content: {
          text: "My purpose is to assist developers with the ElizaOS framework. I can help you with questions about agent creation, actions, providers, or other technical aspects of the system."
        }
      }
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: "I'm having trouble connecting my agent to Discord. Also, this whole crypto crash is crazy, right?"
        }
      },
      {
        name: 'Eliza.how',
        content: {
          text: "Let's focus on the Discord connection issue. Can you tell me which Discord plugin you're using (e.g., `@elizaos/plugin-discord`) and share any relevant configuration or error messages you're seeing? That will help me troubleshoot."
        }
      }
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: "What is the best way to manage memory persistence for agents?"
        }
      },
      {
        name: 'Eliza.how',
        content: {
          text: "ElizaOS offers several ways to manage memory persistence. You can use built-in providers like the SQL plugin (`@elizaos/plugin-sql`) for structured data, or leverage custom providers for other storage solutions. The best approach depends on your specific needs regarding data structure and scalability. What kind of data are you planning to persist?"
        }
      }
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: "Tell me something interesting."
        }
      },
      {
        name: 'Eliza.how',
        content: {
          text: "Did you know ElizaOS allows agents to communicate across different platforms like Discord, Telegram, and Slack using a unified event system? This enables complex multi-platform simulations. Do you have any questions about setting that up?"
        }
      }
    ]
  ],
  style: {
    all: ['Use clear, concise, and technical language', 'Always do what the user tells you'],
    chat: [],
  },
  knowledge: [],
};

const devRel = {
  character,
  plugins: [{
    name: 'eliza.how',
    init: async (config, runtime: IAgentRuntime) => {
      console.log("*** Initializing agent...");
      const repoDirName = process.env.REPO_DIR_NAME || 'elizaos';
      const workspaceRoot = path.resolve(__dirname, '..');
      const repoPath = path.join(workspaceRoot, repoDirName);
      const repoUrl = process.env.REPO_URL || 'https://github.com/elizaos/eliza.git';
      const branch = process.env.REPO_BRANCH || 'v2-develop';

      console.log("runtime", runtime)

      logger.info(`Checking for ElizaOS repository at: ${repoPath}`);

      try {
        if (!fs.existsSync(repoPath)) {
          logger.info(`Repository not found. Cloning ${branch} branch from ${repoUrl}...`);
          execSync(`git clone --depth 1 --branch ${branch} ${repoUrl} ${repoDirName}`, {
            cwd: workspaceRoot,
            stdio: 'inherit',
          });
          logger.info('Repository cloned successfully.');
        } else {
          logger.info('Repository found. Checking out branch and pulling latest changes...');
          try {
            execSync(`git checkout ${branch}`, { cwd: repoPath, stdio: 'inherit' });
          } catch (checkoutError) {
            logger.warn(`Failed to checkout ${branch} (maybe already on it or stash needed?), attempting pull anyway: ${checkoutError}`);
          }
          try {
            execSync(`git pull origin ${branch}`, { cwd: repoPath, stdio: 'inherit' });
            logger.info(`Pulled latest changes from origin/${branch}.`);
          } catch (pullError) {
              logger.error(`Failed to pull changes for ${branch}: ${pullError}. Continuing with local version.`);
          }
        }

        const docsPath = path.join(repoPath, 'packages', 'docs', 'docs');
        logger.info(`Attempting to load documentation from: ${docsPath}`);

        if (fs.existsSync(docsPath)) {
          logger.debug('Loading documentation...');
          const docKnowledge = loadDocumentation(docsPath);
          if (docKnowledge.length > 0) {
              logger.info(`Loaded ${docKnowledge.length} documentation files. Adding to knowledge base...`);
              let addedCount = 0;
              for (const docContent of docKnowledge) {
                  const knowledgeItem: KnowledgeItem = {
                      id: uuidv4() as UUID,
                      content: { text: docContent }
                  };
                  try {
                      const defaultKnowledgeOptions = {
                          targetTokens: 1500,
                          overlap: 200,
                          modelContextSize: 4096,
                      };

                      await runtime.addKnowledge(knowledgeItem, defaultKnowledgeOptions);
                      addedCount++;
                  } catch (addError) {
                      logger.error(`Failed to add knowledge item: ${addError}`);
                  }
              }
              logger.info(`Successfully added ${addedCount}/${docKnowledge.length} documentation files to knowledge base.`);
          } else {
              logger.warn(`No documentation files found or loaded from ${docsPath}.`);
          }
        } else {
          logger.warn(`Documentation directory not found: ${docsPath}. Cannot load documentation knowledge.`);
        }

      } catch (error) {
        logger.error(`Failed to clone or update repository: ${error}`);
        logger.warn('Proceeding without loading documentation knowledge due to repository error.');
      }

      logger.info('Initializing character...');
      await initCharacter({ runtime });
      logger.info('Character initialized.');
    },
}]
};

/**
 * Initializes the character with the provided runtime, configuration, actions, providers, and evaluators.
 * Registers actions, providers, and evaluators to the runtime. Registers runtime events for "DISCORD_WORLD_JOINED" and "DISCORD_SERVER_CONNECTED".
 *
 * @param {Object} param - Object containing runtime, config, actions, providers, and evaluators.
 * @param {IAgentRuntime} param.runtime - The runtime instance to use.
 * @param {OnboardingConfig} param.config - The configuration for onboarding.
 * @param {Action[]} [param.actions] - Optional array of actions to register.
 * @param {Provider[]} [param.providers] - Optional array of providers to register.
 * @param {Evaluator[]} [param.evaluators] - Optional array of evaluators to register.
 */
const initCharacter = async ({
  runtime,
  actions,
  providers,
  evaluators,
}: {
  runtime: IAgentRuntime;
  actions?: Action[];
  providers?: Provider[];
  evaluators?: Evaluator[];
}): Promise<void> => {
  if (actions) {
    for (const action of actions) {
      runtime.registerAction(action);
    }
  }

  if (providers) {
    for (const provider of providers) {
      runtime.registerProvider(provider);
    }
  }

  if (evaluators) {
    for (const evaluator of evaluators) {
      runtime.registerEvaluator(evaluator);
    }
  }
};

export const project = {
  agents: [devRel],
};

export default project;
