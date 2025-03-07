import adapter from "@sveltejs/adapter-vercel";
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
      runtime: "nodejs18.x",
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
    // Add TypeScript configuration to remove deprecated options
    typescript: {
      config: (tsconfig) => {
        const {
          // Destructure and remove the deprecated options
          importsNotUsedAsValues: _,
          preserveValueImports: __,
          // Keep the rest of the compiler options
          ...compilerOptions
        } = tsconfig.compilerOptions;

        // Ensure ignoreDeprecations is set even in the generated config
        return {
          ...tsconfig,
          compilerOptions: {
            ...compilerOptions,
            verbatimModuleSyntax: true,
            ignoreDeprecations: "5.0"
          }
        };
      }
    }
  },
};

export default config;
