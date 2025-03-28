import adapter from '@sveltejs/adapter-node';

import { vitePreprocess } from "@sveltejs/kit/vite";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
    // If your environment is not supported or you settled on a specific environment, switch out the adapter.
    // See https://kit.svelte.dev/docs/adapters for more information about adapters.
    adapter: adapter({
      // runtime: "nodejs18.x",
      // Skip all TypeScript checks during build to ensure deployment works
      esbuild: {
        tsconfigRaw: {
          compilerOptions: {
            verbatimModuleSyntax: true,
            ignoreDeprecations: "5.0"
          }
        }
      }
    }),
    csrf: {
      checkOrigin: false,
    },
    // Add TypeScript configuration with modern options
    typescript: {
      config: (tsconfig) => {
        // Create a clean version of compiler options without deprecated options
        const { importsNotUsedAsValues, preserveValueImports, ...cleanCompilerOptions } =
          tsconfig.compilerOptions || {};

        // Return configuration with modern options
        return {
          ...tsconfig,
          compilerOptions: {
            ...cleanCompilerOptions,
            verbatimModuleSyntax: true,
            ignoreDeprecations: "5.0"
          }
        };
      }
    }
  },
};

export default config;
