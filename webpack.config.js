const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

// `npm run build` gera desenvolvimento (com source maps); `npm run build:prod` minifica.
module.exports = (env, argv) => ({
  mode: argv.mode || 'development',
  devtool: argv.mode === 'production' ? false : 'cheap-source-map',

  entry: {
    background: './src/background.js',
    popup: './src/popup.js',
    recorder: './src/recorder.js',
    'mp3-worker': './src/mp3-worker.js',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        { from: './src/audio-processor.js', to: 'audio-processor.js' },
      ],
    }),
  ],
})
