import type { Configuration } from 'webpack';
import { plugins } from './webpack.plugins';
import { rules } from './webpack.rules';
import CopyPlugin from 'copy-webpack-plugin';
import path from 'path';

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

rules.push({
  test: /\.(png|jpg|jpeg|gif|svg)$/i,
  type: 'asset/resource',
  generator: {
      filename: 'assets/[hash][ext][query]'
  }
});

export const rendererConfig: Configuration = {
  module: { rules },
  plugins: [
    ...plugins,
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'src', 'assets'),
          to: path.resolve(__dirname, '.webpack/renderer', 'assets'),
        },
      ],
    }),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
};