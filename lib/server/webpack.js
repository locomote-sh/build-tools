/* 
   Copyright 2019 Locomote Ltd.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

const Webpack = require('webpack');
const WPMWare = require('webpack-dev-middleware');

// Setup webpack middleware.
function setupWebpack( config, mount, source, target ) {

    let {
        mountPath,
        webpackConfig
    } = config;

    console.log('Initializing webpack...');

    // Configure webpack middleware.

    // Note that next is a bit of a hack, based on description of env
    // vars at https://webpack.js.org/guides/environment-variables/
    // (Basically, if the webpack config file exports a function, then
    // resolve the actual config my calling it with the environment vars).
    if( typeof webpackConfig === 'function' ) {
        const env = { SOURCE: source, TARGET: target };
        webpackConfig = webpackConfig( env );
    }

    const compiler = Webpack( webpackConfig );

    mount.use( WPMWare( compiler, {
        hot:            true,
        filename:       'bundle.js',
        publicPath:     mountPath,
        stats: {
            colors:     true
        },
        historyApiFallback: true,
        writeToDisk:    true
    }));

}

module.exports = { setupWebpack }

