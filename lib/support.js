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

const {
    stat,
    readFile,
    writeFile
} = require('fs');

const { spawn } = require('child_process');

const rimraf = require('rimraf');

/**
 * Ensure a value is defined, else throw an error.
 * @param value     The value to test.
 * @param message   The error message to throw if value is undefined.
 */
function ensure( value, message ) {
    if( value === undefined || !value.length ) throw new Error( message );
}

/**
 * Drain a text buffer. Splits the buffer into separate lines and
 * writes each line to a sink function. If the input isn't fully read
 * yet then the final line is retained (as it may be incomplete) and
 * returned as the starting contents for a new buffer.
 * @param buffer    A text buffer (i.e. string).
 * @param sink      A sink function, is called once for each separate
 *                  text line in the buffer.
 * @param done      A flag indicating whether the input feeding the
 *                  buffer has been fully read into the buffer.
 */
function drain( buffer, sink, done ) {
    // Split the buffer into its component lines.
    let lines = buffer.split('\n');
    let result;
    // Check if all input has been fully read.
    if( !done ) {
        // If not then return the last line in the buffer as the
        // result - this will be used as the starting contents for
        // the next buffer.
        let last = lines.length - 1;
        result = lines[last];
        // Remove last line from the list of lines.
        lines = lines.slice( 0, last );
    }
    // Write lines to the sink function and return.
    lines.forEach( sink );
    return result;
}

/**
 * Execute a command.
 * @param cwd   The command's working directory path.
 * @param env   Environment variables.
 * @param cmd   The name/path of the command to execute.
 * @param args  An array containing the command's arguments.
 * @param out   A function to write stdout to.
 * @param err   A function to write stderr to.
 */
function exec( cwd, env, cmd, args, out = () => {}, err = () => {} ) {
    return new Promise( ( resolve, reject ) => {
        const proc = spawn( cmd, args, { cwd, env });
        let stdout = '', stderr = '';
        proc.stdout.on('data', data => {
            stdout += data.toString();
            stdout = drain( stdout, out );
        });
        proc.stderr.on('data', data => {
            stderr += data.toString();
            stderr = drain( stderr, err );
        });
        proc.on('error', reject );
        proc.on('close', code => {
            drain( stdout, out, true );
            drain( stderr, err, true );
            resolve( code );
        });
    });

}

/**
 * Test if a path exists and is a directory.
 */
function isDir( path ) {
    return new Promise( ( resolve, reject ) => {
        stat( path, ( err, stats ) => {
            if( err ) {
                if( err.code == 'ENOENT' ) {
                    resolve( false );
                }
                else reject( err );
            }
            else resolve( stats.isDirectory() );
        });
    });
}

/**
 * Remove a directory and all its contents.
 */
function rmDir( path ) {
    return new Promise( ( resolve, reject ) => {
        rimraf( path, err => err ? reject( err ) : resolve );
    });
}

/**
 * Read JSON from a file.
 */
function readJSON( path, defaultValue ) {
    return new Promise( ( resolve, reject ) => {
        readFile( path, ( err, data ) => {
            if( err ) {
                if( err.code == 'ENOENT' && defaultValue !== undefined ) {
                    resolve( defaultValue );
                }
                else {
                    reject( err );
                }
            }
            else resolve( JSON.parse( data.toString() ) );
        });
    });
}

/**
 * Write JSON to a file.
 */
function writeJSON( path, data ) {
    return new Promise( ( resolve, reject ) => {
        const json = JSON.stringify( data );
        writeFile( path, json, err => err ? reject( err ) : resolve() );
    });
}

module.exports = {
    ensure, 
    exec,
    isDir,
    rmDir,
    readJSON,
    writeJSON
};
