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

const Express = require('express');
const Path    = require('path');

const { setupWebpack } = require('./webpack');
const { setupHeckle }  = require('./heckle');
const { setupFileAPI } = require('./file-api');

/**
 * Read server properties from the build environment. Throws an error
 * if any of the required properties is missing.
 */
function readServerProps( env ) {
    const { server } = env;
    if( !server ) {
        throw new Error('ds: "server" environment variable is required');
    }
    const { config, mount } = server;
    if( !config ) {
        throw new Error('ds: "config" server property is required');
    }
    if( !mount ) {
        throw new Error('ds: "mount" server property is required');
    }
    return server;
}

/**
 * Development server build commands.
 * Note that unlike normal build commands, dev server build commands are
 * used to configure the dev server to (incrementally) build content.
 */
module.exports = {
    "ds:webpack": function( env, args ) {
        const { config, mount } = readServerProps( env );
        const [ source, target ] = args;
        if( !source ) {
            throw new Error('webpack: "source" arg is required');
        }
        if( !target ) {
            throw new Error('webpack: "target" arg is required');
        }
        setupWebpack( config, mount, source, target );
    },
    "ds:heckle": async function( env, args ) {
        const { config, mount } = readServerProps( env );
        const [ source, target ] = args;
        if( !source ) {
            throw new Error('heckle: "source" arg is required');
        }
        if( !target ) {
            throw new Error('heckle: "target" arg is required');
        }
        await setupHeckle( config, mount, source, target );
    },
    "ds:file-api": function( env, args ) {
        const { mount } = readServerProps( env );
        const [ target ] = args;
        if( !target ) {
            throw new Error('file-api: "target" arg is required');
        }
        setupFileAPI( target, mount );
    },
    "ds:static-files": function( env, args ) {
        const [ target ] = args;
        if( !target ) {
            throw new Error('static-files: "target" arg is required');
        }
        const { mount } = readServerProps( env );
        mount.use( Express.static( Path.resolve( target ) ) );
    },
    "ds:configure": {
        "args": [ "source", "target" ],
        "vars": {
            "source": ".",
            "target": "_site"
        },
        "actions": [
            "ds:webpack {source} {target}",
            "ds:file-api {target}",
            "ds:heckle {source} {target}",
            "ds:static-files {target}"
        ]
    }
}
