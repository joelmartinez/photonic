const path = require('path');
const fs = require('fs');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Dynamically find all photonics scene modules
const photonicsDir = path.resolve(__dirname, 'src/photonics');
const photonicModules = {};

if (fs.existsSync(photonicsDir)) {
  const files = fs.readdirSync(photonicsDir);
  files.forEach(file => {
    if (file.endsWith('.js')) {
      const name = path.basename(file, '.js');
      photonicModules[`photonics/${name}`] = `./src/photonics/${file}`;
    }
  });
}

module.exports = {
  entry: {
    app: './src/index.js',
    os: './src/os/index.js',
    viz: './src/viz/index.js',
    sonance: './src/sonance/index.js',
    ...photonicModules
  },
  output: {
    filename: (pathData) => {
      // Photonics modules go to photonics/ subfolder without .gen suffix
      if (pathData.chunk.name.startsWith('photonics/')) {
        return '[name].js';
      }
      // Other modules keep the .gen.js naming
      return '[name].gen.js';
    },
    path: path.resolve(__dirname, '../CodeCubeConsole/out/script'),
    clean: {
      keep: (asset) => {
        return asset.startsWith('photonics/');
      }
    }
  },
  mode: 'production',
  optimization: {
    minimize: true
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'node_modules/mermaid/dist/mermaid.min.js'),
          to: 'mermaid.min.js'
        }
      ]
    })
  ],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  }
};
