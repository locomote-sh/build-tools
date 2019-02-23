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

const { absPath } = require('./support');
const { setupProxies } = require('./proxies');

/**
 * Start the development server.
 * The dev server uses the 'ds:build' build command to setup its
 * internal build pipeline; the tools and steps used in the pipeline
 * can be modified by editing or replacing that command's configuration.
 * (See build-conf.js in this directory).
 */
async function start( config, args, commands ) {

    // Create an express server as the main mount point.
    const mount = Express();

    // Create a build environment with a "server" var.
    const env = { server: { config, mount } };

    // Configure the server by running the ds:configure command.
    const configure = commands['ds:configure'];
    if( !configure ) {
        throw new Error('ds:configure command not found');
    }
    // TODO: Problem here is that 'env' doesn't contain a _commands lookup...
    await configure( env, args );

    // Check for non-root mount path.
    let server = mount;
    if( mountPath != '/' ) {
        mountPath = absPath( mountPath );
        server = Express();
        server.use( mountPath, mount );
    }

    // The server's (locally) public URL.
    const serverURL = `http://localhost:${port}`;

    // Attach proxy endpoints.
    setupProxies( config, server, serverURL );

    // Start the HTTP server.
    server.listen( port, () => {
        console.log(`Dev server running @ ${serverURL}${mountPath}`);
    });
}

module.exports = { start };

