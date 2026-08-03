const path = require('path');
const WebpackObfuscator = require('webpack-obfuscator');

module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      // Add path aliases to match tsconfig.json
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        '@/sdk': path.resolve(__dirname, 'src/sdk/index.js'),
        '@/sdk/*': path.resolve(__dirname, 'src/sdk/*'),
        '@/components/*': path.resolve(__dirname, 'src/components/*'),
        '@/features/*': path.resolve(__dirname, 'src/features/*'),
        '@/hooks/*': path.resolve(__dirname, 'src/hooks/*'),
        '@/utils/*': path.resolve(__dirname, 'src/utils/*'),
        '@/types/*': path.resolve(__dirname, 'src/types/*'),
        '@/config/*': path.resolve(__dirname, 'src/config/*'),
        '@/services/*': path.resolve(__dirname, 'src/services/*'),
        '@/contexts/*': path.resolve(__dirname, 'src/contexts/*'),
        '@/styles/*': path.resolve(__dirname, 'src/styles/*'),
        '@/assets/*': path.resolve(__dirname, 'src/assets/*'),
        '@/i18n/*': path.resolve(__dirname, 'src/i18n/*'),
        '@/mcp-client/*': path.resolve(__dirname, 'src/mcp-client/*'),
      };

      // Only obfuscate in production builds
      if (env === 'production') {
        webpackConfig.plugins.push(
          new WebpackObfuscator(
            {
              // String array encoding
              rotateStringArray: true,
              stringArray: true,
              stringArrayCallsTransform: true,
              stringArrayEncoding: ['base64'],
              stringArrayIndexShift: true,
              stringArrayRotate: true,
              stringArrayShuffle: true,
              stringArrayThreshold: 0.75,

              // String array wrappers
              stringArrayWrappersCount: 2,
              stringArrayWrappersChainedCalls: true,
              stringArrayWrappersParametersMaxCount: 4,
              stringArrayWrappersType: 'function',

              // Transformations
              transformObjectKeys: true,
              unicodeEscapeSequence: false,

              // Control flow flattening (can impact performance)
              controlFlowFlattening: false,
              controlFlowFlatteningThreshold: 0.75,

              // Dead code injection
              deadCodeInjection: false,
              deadCodeInjectionThreshold: 0.4,

              // Debug protection (be careful with this)
              debugProtection: false,
              debugProtectionInterval: 0,

              // Disable console output
              disableConsoleOutput: false,

              // Identifier names generator
              identifierNamesGenerator: 'hexadecimal',

              // Log
              log: false,

              // Numbers to expressions
              numbersToExpressions: false,

              // Rename globals
              renameGlobals: false,

              // Self defending
              selfDefending: false,

              // Simplify
              simplify: true,

              // Split strings
              splitStrings: false,
              splitStringsChunkLength: 10,

              // Target
              target: 'browser',

              // Compact
              compact: true,
            },
            // Exclude node_modules from obfuscation
            ['**/node_modules/**', '**/vendor/**']
          )
        );
      }
      return webpackConfig;
    }
  }
};

