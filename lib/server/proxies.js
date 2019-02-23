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

const Proxy = require('express-http-proxy');
const URL   = require('url');
const Path  = require('path');

const { absPath } = require('./support');

// Create a HTTP proxy.
function createProxy( url, logProxyRequests ) {
    // Extract parts from URL.
    const { protocol, host, pathname = '' } = URL.parse( url );
    // Make the proxy host.
    return Proxy( host, {
        https: protocol == 'https:',
        // Prepend the forwarding path to the request path.
        proxyReqPathResolver: req => {
            let path = Path.join( pathname, req.url );
            if( logProxyRequests ) {
                console.log('>', path );
            }
            return path;
        }
    });
}

function setupProxies( config, server, serverURL ) {

    const { proxies, logProxyRequests } = config;

    // Mount proxies.
    for( const path in proxies ) {
        // Read proxy forward URL.
        const url = proxies[path];
        if( typeof url != 'string' ) {
            console.error(`Forwarding URL for proxy path "${path}" must be a string`);
            process.exit( 1 );
        }
        path = absPath( path );
        server.use( path, createProxy( url, logProxyRequests ) );
        console.log(`Forwarding ${serverURL}${path} -> ${url}`);
    }

}

module.exports = { setupProxies }

