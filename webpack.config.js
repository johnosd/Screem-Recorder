const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
  mode: 'development',
  devtool: 'cheap-source-map',

  entry: {
    background: './src/background.js',
    popup: './src/popup.js',
    recorder: './src/recorder.js',
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
}
