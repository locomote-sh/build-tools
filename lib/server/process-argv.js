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

// Default configuration file name.
const DefaultConfigFile = './locomote.ds.json';

// Default configuration.
const DefaultConfig = {
    // Where to mount the server.
    mountPath:          '/',
    // Port to listen under.
    port:               3000,
    // Where to read public files from.
    publicPath:         '_site',
    // Whether to use webpack middleware.
    useWebpack:         true,
    // Name of the webpack config file.
    webpackConfigFile:  './webpack.config.js',
    // Inline webpack config - takes precedence over file config.
    webpackConfig:      undefined,
    // Whether to use Heckle middleware.
    useHeckle:          true,
    // An object mapping paths to proxied URLs.
    proxies:            {},
    // Whether to log proxy request forwarding.
    logProxyRequests:   true
}

const Opts = {
    '-m':               'mountPath',
    '--mountPath':      'mountPath',
    '-P':               'port',
    '--port':           'port',
    '-p':               'publicPath',
    '--publicPath':     'publicPath',
    '-c':               'configFile',
    '--configFile':     'configFile',
    '--wpConfigFile':   'webpackConfigFile'
}

const OptsUsage = {
    '-m | --mountPath <path>': [
        `Specify the path to mount the server under`,
        `e.g. "-m /root" will serve files from "http://localhost:{port}/root"`
    ],
    '-P | --port <port>': [
        `The port number the server will listen under; defaults to ${DefaultConfig.port}`,
    ],
    '-p | --publicPath <path>': [
        `The local path which files will be server from;`,
        `defaults to ${DefaultConfig.publicPath}`
    ],
    '-c | --configFile <file>': [
        `A local file to read the server configuration from;`,
        `Defaults to ${DefaultConfigFile}`
    ],
    '--wpConfigFile <file>': [
        `A local file to read the webpack configuration from, e.g. ${DefaultConfig.webpackConfigFile}`
    ]
}

const Flags = {
    '--noWebpack':  {
        'useWebpack': false
    },
    '--noHeckle': {
        'useHeckle': false
    },
    '--print-config': {
        'printConfig': true
    }
}

const FlagsUsage = {
    '--noWebpack': ['Disable webpack middleware.'],
    '--noHeckle': ['Disable Heckle middleware.'],
    '--print-config': ['Print the effective configuration and exit']
}

// Read command line.
const [ , , ...argv ] = process.argv;

// Initialize the configuration.
let config = {};
let opt = false;    // The option being processed.
// Iterate over command line args.
for( let arg of argv ) {
    // If help flag then print usage.
    if( arg == '-h' || arg == '--help' ) {
        usage();
    }
    // If have an option then assign arg as its value.
    if( opt ) {
        config[opt] = arg;
        opt = false;
        continue;
    }
    // Check whether the arg represents an option.
    opt = Opts[arg];
    if( !opt ) {
        // No option, check if arg represents a flag.
        let flag = Flags[arg];
        if( flag ) {
            // Merge flag into config.
            config = Object.assign( config, flag );
        }
        else {
            // Bad argument.
            console.error(`Bad flag or option: ${arg}`);
            process.exit( 1 );
        }
    }
}
// Check for hanging option.
if( opt ) {
    console.error(`Missing value for option: ${opt}`);
    process.exit( 1 );
}
if( argv.length == 0 ) {
    console.log('Using default configuration');
}

const Path = require('path');

// Try loading custom configuration.
try {
    let { configFile = DefaultConfigFile } = config;
    configFile = Path.resolve( configFile );
    // Load configuration from file - note that command line
    // options take precedence over settings in the file, which
    // overwrite default settings.
    config = Object.assign( DefaultConfig, require( configFile ), config );
    console.log(`Loaded configuration from ${configFile}`);
}
catch( e ) {
    // Module not found means no custom configuration, so continue
    // as normal; otherwise, report the error and exit.
    if( e.code != 'MODULE_NOT_FOUND' ) {
        console.error('Error loading configuration:');
        console.error( e );
        process.exit( 1 );
    }
    // Copy command line options over default config.
    config = Object.assign( DefaultConfig, config );
}

// If webpack being used then check whether to load its configuration.
let { useWebpack, webpackConfig, webpackConfigFile } = config;
if( useWebpack ) {
    if( webpackConfig !== undefined ) {
        console.log('Using inline webpack configuration');
    }
    else {
        try {
            config.webpackConfig = require( Path.resolve( webpackConfigFile ) );
        }
        catch( e ) {
            if( e.code == 'MODULE_NOT_FOUND' ) {
                console.warn('%s not found, disabling webpack support', webpackConfigFile );
                config.useWebpack = false;
            }
            else throw e;
        }
    }
}

if( config.printConfig ) {
    console.log('Effective configuration:');
    console.log( JSON.stringify( config, null, 4 ) );
    process.exit( 1 );
}

// Export the configuration.
module.exports = config;

// Print command usage and exit.
function usage() {
    console.log('Locomote.sh development server');
    console.log();
    console.log('Options:');
    console.log();
    printUsage( OptsUsage );
    console.log();
    console.log('Flags:');
    console.log();
    printUsage( FlagsUsage );
    console.log();
    process.exit( 1 );
}

function printUsage( usage ) {
    for( let key in usage ) {
        let lines = usage[key];
        lines.forEach( ( line, idx ) => {
            let suffix = idx == 0 ? key : '';
            suffix = suffix.padEnd( 25, ' ');
            suffix = suffix.padStart( 27, ' ');
            console.log( suffix, line );
        });
    }
}
