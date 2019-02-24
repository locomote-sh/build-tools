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
 * The dev server uses the 'ds:configure' build command to setup its
 * internal build pipeline; the tools and steps used in the pipeline
 * can be modified by editing or replacing that command's configuration.
 * (See build-conf.js in this directory).
 */
async function start( env, args ) {

    // Create an express server as the main mount point.
    const mount = Express();

    // Fetch the server property from the environment and attach the
    // express mount point to it.
    const { server } = env;
    if( !server ) {
        throw new Error('No "server" property in environment');
    }
    server.mount = mount;

    // Configure the server by running the ds:configure command.
    const configure = this['ds:configure'];
    if( !configure ) {
        throw new Error('ds:configure command not found');
    }
    await configure( env, args );

    const { config } = server;
    const { port, mountPath } = config;

    // Check for non-root mount path.
    let httpServer = mount;
    if( mountPath != '/' ) {
        mountPath = absPath( mountPath );
        httpServer = Express();
        httpServer.use( mountPath, mount );
    }

    // The server's (locally) public URL.
    const serverURL = `http://localhost:${port}`;

    // Attach proxy endpoints.
    setupProxies( config, httpServer, serverURL );

    // Start the HTTP server.
    httpServer.listen( port, () => {
        console.log(`Dev server running @ ${serverURL}${mountPath}`);
    });
}

module.exports = { start };

