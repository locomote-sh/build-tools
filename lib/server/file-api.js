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

const Path = require('path');

const QueryAPI = require('@locomote.sh/query-api/lib/locomote');

const Filesets = require('@locomote.sh/filesets').init();

const Chokidar = require('chokidar');

/**
 * Initialize query functions with a content origin.
 * @param target    The build target; the path containing files to serve.
 * @param mount     An express server to mount endpoints onto.
 */
function setupFileAPI( target, mount ) {

    // Initialize the file API.
    const {
        addFiles,
        removeFiles,
        handleFileRecordRequest,
        handleQueryRequest,
        makeContentOrigin
    } = QueryAPI( Filesets );

    // Initialize content origin.
    const origin = makeContentOrigin();

    // Watch for file updates.
    watchFiles( target, origin, addFiles, removeFiles );

    // Middleware to intercept file record requests.
    // Any file request with a ?format=record query string will return
    // the file db record for the request file.
    mount.use( ( req, res, next ) => {
        if( req.query.format === 'record' ) {
            handleFileRecordRequest( origin, req, res );
            return;
        }
        // Non-record request, continue processing.
        next();
    });

    // Query API request handler.
    mount.get('/query.api', ( req, res ) => {
        try {
            handleQueryRequest( origin, req, res );
        }
        catch( e ) {
            res.sendStatus( 500, e.toString() );
        }
    });

}

/**
 * Watch for file updates and update the file db accordingly.
 * @param path          The path to watch.
 * @param origin        A content origin.
 * @param addFiles      A function for adding file records to the file db.
 * @param removeFiles   A function for removing file records from the file db.
 */
function watchFiles( path, origin, addFiles, removeFiles ) {

    let additions = []; // List of file additions.
    let deletions = []; // List of file deletions.

    // Watch for file system changes and update the file DB.
    Chokidar
        .watch( path, {})
        .on('all', ( type, file ) => {
            file = Path.relative( path, file );
            switch( type ) {
                case 'add':
                case 'change':
                    additions.push( file );
                    break;
                case 'unlink':
                    deletions.push( file );
                    break;
            }
        });

    // File changes are batched over a half-second interval.
    setInterval( async () => {
        try {
            // Capture file lists.
            const _additions = additions;
            additions = [];
            const _deletions = deletions;
            deletions = [];
            // Apply updates.
            await addFiles( origin, _additions, path );
            await removeFiles( origin, _deletions );
        }
        catch( e ) {
            console.error('Error handling file updates', e );
        }
    }, 500 );

}

module.exports = { setupFileAPI };

