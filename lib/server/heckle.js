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

const Chokidar = require('chokidar');
const Path = require('path');

const { DefaultConfigFile } = require('./process-argv');

async function setupHeckle( config, mount, _source, _target ) {

    const {
        publicPath,
        useWebpack,
        webpackConfig
    } = config;

    const source = Path.resolve( _source );
    const target = Path.resolve( _target );

    console.log('Initializing heckle...');

    const {
        build,
        loadSiteConfig,
        extensions
    } = require('@locomote.sh/heckle');

    const {
        config: siteConfig,
        configPath
    } = await loadSiteConfig( source );

    // Read config file name and excluded path list from the configuration.
    const {
        configFile = DefaultConfigFile,
        exclude = []
    } = siteConfig;

    // Ensure following files/paths are excluded from the build.
    // TODO: Need to review the fglob lib currently used by heckle
    // TODO: - is it really necessary to repeat each dir name twice?
    xadd( exclude, 'node_modules/*');
    xadd( exclude, 'node_modules/**/*');
    xadd( exclude, 'package.json');
    xadd( exclude, 'package-lock.json');
    xadd( exclude, '*.dependencies');
    xadd( exclude, `${_target}/*`);
    xadd( exclude, `${_target}/**/*`);
    xadd( exclude, configFile );
    // If webpack is being used then ensure that webpack files and
    // source are also excluded.
    if( useWebpack ) {
        const wpCtx = Path.relative('.', webpackConfig.context );
        xadd( exclude, `${wpCtx}/*`);
        xadd( exclude, `${wpCtx}/**/*`);
        xadd( exclude, 'webpack.config.js');
    }
    // Add extended exclude list back to site config.
    siteConfig.exclude = exclude;

    // Add site config to build options.
    const opts = {
        incremental: true,  // Necessary to prevent Heckle from clearing the target.
        serverMode: true,   // Necessary to ensure manifest is loaded from file system.
        config: siteConfig,
        configPath
    };

    // Site extensions.
    const exts = extensions.get();

    // Do an initial build of the source.
    const { error } = await build( source, target, opts, exts );
    if( error ) {
        console.error( error );
    }

    // Watch for changes to the site source.
    watchSource( source, target, exclude, build, opts, exts );

}

// Watch for changes to the site source.
function watchSource( source, target, exclude, build, opts, exts ) {
    // List of modified files.
    let changes = [];
    // Watch for updates to the source.
    Chokidar
        .watch( source, {
            ignored: exclude.map( path => Path.resolve( source, path ) )
        })
        .on('change', ( file ) => {
            changes.push( Path.relative( source, file ) );
        });

    // Check for changes once per second and do a new build if needed.
    setInterval( () => {
        if( changes.length ) {
            const files = changes;
            changes = [];
            const { error } = build( source, target, opts, exts, files );
            if( error ) {
                console.error( error );
            }
        }
    }, 1000 );
}

/**
 * Exclusive add: Add an item to an array if that item is not already
 * on the array.
 * @param a An array.
 * @param i The item to add.
 */
function xadd( a, i ) {
    if( i !== undefined && !a.includes( i ) ) {
        a.push( i );
    }
}

module.exports = { setupHeckle }

