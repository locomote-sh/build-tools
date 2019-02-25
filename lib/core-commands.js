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
const Git = require('./git');
const OS = require('os');

const {
    mkdir,
    mkdtemp
} = require('fs');

const {
    ensure,
    exec,
    rmDir
} = require('./support');

const { start: startServer } = require('./server');

const CoreCommands = {
    /**
     * Clone a git remote to a location on the local filesystem.
     */
    'git-clone': async function( env, args ) {

        const { remote, workspace } = env;
        const [ branch, dir = branch ] = args;

        ensure( branch,     'git-clone: <branch> argument is required');
        ensure( remote,     'git-clone: <remote> env var is required');
        ensure( workspace,  'git-clone: <workspace> env var is required');

        const path = Path.join( workspace, dir );

        console.info('Cloning into %s...', path );

        // First check for an in-place repo.
        const info = await Git.readInfo( path );
        if( info ) {
            // Check if in-place repo matches the one we want.
            if( !info.remote.contains( remote ) ) {
                // It doesn't, so remove the existing one then clone the one we want.
                await rmDir( path );
                await Git.clone( path, remote );
                await Git.checkout( path, branch );
            }
            else {
                // Repo in place is the one we want, checkout the required branch
                // and do a pull.
                await Git.checkout( path, branch );
                await Git.pull( path );
            }
        }
        else {
            // No repo in place, clone the one we want.
            await Git.clone( path, remote );
            await Git.checkout( path, branch );
        }
    },
    /**
     * Push changes in a local git repository to its remote.
     * Performs a complete add / commit / push cycle, on whatever branch
     * is currently checked out at the specified location.
     */
    'git-push': async function( env, args ) {

        const { workspace } = env;
        const [ branch, dir = branch ] = args;

        ensure( branch,     'git-push: <branch> argument is required');
        ensure( workspace,  'git-push: <workspace> env var is required');

        const path = Path.join( workspace, dir );

        // Add files.
        const hasChanges = await Git.addAll( path );
        
        if( hasChanges ) {

            console.info('Committing changes in %s...', path );

            // Commit changes.
            const message = `Locomote.sh build ${Date.now()}`;
            await Git.commit( path, message );

            // Push to remote.
            await Git.push( path );

        }
        else {
            console.info('No changes in %s', path );
        }

    },
    /**
     * Merge changes from one branch into another.
     */
    'git-merge': async function( env, args ) {

        const { workspace } = env;
        const [ source, branch, dir = branch ] = args;

        ensure( source,     'git-merge: <source> argument is required');
        ensure( branch,     'git-merge: <branch> argument is required');
        ensure( workspace,  'git-merge: <workspace> env var is required');


        console.info('Merging changes from %s into %s...', source, target );
        const path = Path.join( workspace, dir );
        await Git.merge( path, source );
    },
    /**
     * Add or update the build record at the specified location.
     */
    'write-build-record': async function( env, args ) {

        const { workspace } = env;
        const [ sourceDir, targetDir ] = args;

        ensure( sourceDir,  'build-record: <sourceDir> argument is required');
        ensure( targetDir,  'build-record: <targetDir> argument is required');
        ensure( workspace,  'build-record: <workspace> env var is required');

        // Attempt to read existing record file.
        const recordPath = Path.join( target, '.locomote-build-record.json');
        const record = await readJSON( recordPath, {});

        console.info('Updating build record in %s...', recordPath );

        // Read info from source the source repo.
        const sourcePath = Path.join( workspace, sourceDir );
        const { name, commit, branch } = await Git.readInfo( sourcePath );

        // Update the record.
        const key = `${name}#${branch}`;
        record[key] = commit;
        await writeJSON( recordPath, record );

    },
    /**
     * Ensure that a directory exists at a specified location.
     */
    'ensure-dir': function( env, args ) {
        const [ path ] = args;
        ensure( name, 'ensure-dir: <path> argument is required');
        return new Promise( ( resolve, reject ) => {
            mkdir( path, { recursive: true }, err => {
                if( err ) {
                    return reject( err );
                }
                console.info('Ensured directory at %s...', path );
                resolve();
            });
        });
    },
    /**
     * Create a temporary working directory and write the path to its
     * location into the environment under the specified name.
     */
    'temp-dir': async function( env, args ) {
        const [ name ] = args;
        ensure( name, 'temp-dir: <name> argument is required');
        const prefix = Path.join( OS.tmpdir(), 'locomote-build-');
        return new Promise( ( resolve, reject ) => {
            mkdtemp( prefix, ( err, path ) => {
                if( err ) {
                    return reject( err );
                }
                console.info('Created temporary directory "%s" at %s', name, path );
                env[name] = path;
            });
        });
    },
    /**
     * Execute an external command.
     */
    'exec': async function( env, args ) {

        const [ command, ...cargs ] = args;
        const { workspace } = env;

        ensure( command,    'exec: <command> argument is required');
        ensure( workspace,  'exec: <workspace> env var is required');

        // Runtime environment vars; uses a copy of the process env as the base env.
        const renv = Object.keys( env )
            .filter( key => !key.startsWith('_') )
            .reduce( ( renv, key ) => {
                // Copy public environment vars into the runtime env.
                renv['LOCOMOTE_'+key.toUpperCase()] = env[key];
                return renv;
            }, Object.assign( {}, process.env ) );

        // Log functions for the command's stderr + stdout.
        const stdout = line => console.info( line );
        const stderr = line => console.error( line );

        // Execute the command.
        const code = await exec( workspace, renv, command, cargs, stdout, stderr );
        if( code !== 0 ) {
            throw new Error(`Command "${args.join(' ')}" exited with code ${code}`);
        }

    },
    /**
     * Execute the npx command.
     * This is just a shorthand for "exec npx...".
     */
    'npx': function( env, args ) {
        return this.exec( env, ['npx'].concat( args ) );
    },
    /**
     * Start the dev server.
     */
    'start-server': startServer
}

module.exports = CoreCommands;

