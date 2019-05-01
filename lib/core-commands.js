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
    mkdtemp,
    symlink
} = require('fs');

const {
    ensure,
    exec,
    isDir,
    rmDir,
    readJSON,
    writeJSON
} = require('./support');

const { start: startServer } = require('./server');

/**
 * Resolve an origin reference to an absolute reference.
 * - If the reference begins with http:, https: or ssh: then it is returned as is.
 * - If the reference begins with file: then the path portion is resolved to an
 *   absolute path and returned.
 * - Otherwise the reference is assumed to be a file path reference, is resolved
 *   to an absolute path and is returned.
 */
function resolveOrigin( ref ) {
    if( ref.startsWith('http:') || ref.startsWith('https:') || ref.startsWith('ssh:') ) {
        return ref;
    }
    if( ref.startsWith('file:') ) {
        ref = ref.slice( 5 );
    }
    return Path.resolve( ref );
}

/**
 * Get the current working directory from the environment.
 */
function getcwd( env ) {
    const { cwd = '.' } = env;
    return Path.resolve( cwd );
}

const CoreCommands = {
    /**
     * Clone a git remote to a location on the local filesystem.
     */
    'git-clone': async function( env, args ) {

        const [ originRef, branch, dir = branch ] = args;

        ensure( originRef,  'git-clone: <origin> argument is required');
        ensure( branch,     'git-clone: <branch> argument is required');

        const origin = resolveOrigin( originRef );
        const cwd    = getcwd( env );
        const path   = Path.join( cwd, dir );

        console.info('Cloning into %s...', path );

        // First check for an in-place repo.
        const info = await Git.readInfo( path );
        if( info ) {
            // Check if in-place repo matches the one we want.
            const { remotes } = info;
            if( !remotes.includes( origin ) ) {
                // It doesn't, so remove the existing one then clone the one we want.
                await rmDir( path );
                await Git.clone( path, origin );
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
            await Git.clone( path, origin );
            await Git.checkout( path, branch );
        }
    },
    /**
     * Push changes in a local git repository to its remote.
     * Performs a complete add / commit / push cycle, on whatever branch
     * is currently checked out at the specified location.
     */
    'git-push': async function( env, args ) {

        const [ branch, dir = branch ] = args;

        ensure( branch, 'git-push: <branch> argument is required');

        const cwd = getcwd( env );
        const path = Path.join( cwd, dir );

        // Add files.
        await Git.addAll( path );

        console.info('Committing changes in %s...', path );

        // Commit changes.
        const message = `Locomote.sh build ${(new Date()).toISOString()}`;
        if( await Git.commit( path, message ) ) {

            // Push to remote.
            await Git.push( path, branch );

            // Check whether to send an update notification.
            const {
                sendUpdatesNotification: false,
                updatesListenerHost: host,
                updatesListenerPort: port
            } = env;
            if( sendUpdatesNotification && host && port ) {

                console.info('Sending update notification to %s:%s', host, port );

                const { account, name: repo } = await Git.readInfo( path );
                const key = `${account}/${repo}/${branch}`;
                const socket = Net.connect( port, host, () => {
                    socket.end( key );
                });
            }

        }
        else console.info('No changes in %s', path );

    },
    /**
     * Merge changes from one branch into another.
     */
    'git-merge': async function( env, args ) {

        const [ source, branch, dir = branch ] = args;

        ensure( source, 'git-merge: <source> argument is required');
        ensure( branch, 'git-merge: <branch> argument is required');


        console.info('Merging changes from %s into %s...', source, target );
        const cwd = getcwd( env );
        const path = Path.join( cwd, dir );
        await Git.merge( path, source );
    },
    /**
     * Add or update the build record at the specified location.
     */
    'write-build-record': async function( env, args ) {

        const [ source, target ] = args;

        ensure( source, 'write-build-record: <source> argument is required');
        ensure( target, 'write-build-record: <target> argument is required');

        const cwd = getcwd( env );
        const targetPath = Path.resolve( cwd, target );

        // Attempt to read existing record file.
        const recordPath = Path.join( targetPath, '.locomote-build-record.json');
        const record = await readJSON( recordPath, {});

        console.info('Writing build record to %s...', recordPath );

        // Read info from source the source repo.
        const sourcePath = Path.resolve( cwd, source );
        const { name, commit, branch } = await Git.readInfo( sourcePath );

        // Update the record.
        const key = `${name}#${branch}`;
        record[key] = commit;
        await writeJSON( recordPath, record );

    },
    /**
     * Read the build record and write a value to the build environment.
     * Reads the latest commit of a specified source branch from the build
     * record of a specified target branch, and write the commit value to
     * a named variable in the build environment.
     */
    'read-build-record': async function( env, args ) {

        const [ source, target, name ] = args;

        ensure( source, 'read-build-record: <source> argument is required');
        ensure( target, 'read-build-record: <target> argument is required');
        ensure( name,   'read-build-record: <name> argument is required');

        const cwd = getcwd( env );
        const targetPath = Path.resolve( cwd, target );

        // Attempt to read record file.
        const recordPath = Path.join( targetPath, '.locomote-build-record.json');
        const record = await readJSON( recordPath, false );

        if( record ) {

            console.info('Reading build record from %s...', recordPath );

            // Read info from the source repo.
            const sourcePath = Path.resolve( cwd, source );
            const { name: repo, branch } = await Git.readInfo( sourcePath );

            // Read the entry for the source branch.
            const key = `${repo}#${branch}`;
            const commit = record[key];

            // Write value to build env.
            env[name] = commit;
        }
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
    'mktemp': async function( env, args ) {
        const prefix = Path.join( OS.tmpdir(), 'locomote-build-');
        await new Promise( ( resolve, reject ) => {
            mkdtemp( prefix, ( err, path ) => {
                if( err ) {
                    return reject( err );
                }
                console.info('Created temporary directory: %s', path );
                // Set the current working directory to the new location.
                env['cwd'] = path;
                resolve();
            });
        });
    },
    /**
     * Remove a directory and all its contents.
     */
    'rmdir': async function( env, args ) {
        const [ path ] = args;
        ensure( path, 'rmdir: <path> argument is required');
        const cwd = getcwd( env );
        const absPath = Path.resolve( cwd, path );
        console.log('Removing %s...', path );
        await rmDir( absPath );
    },
    /**
     * Change the current working directory.
     */
    'cd': function( env, args ) {
        const [ dir ] = args;
        ensure( dir, 'cd: <dir> argument is required');
        env['cwd'] = dir;
    },
    /**
     * Install npm dependencies. In order to speed up local builds, if an origin
     * argument is supplied, and that origin indicates:
     * - a location on the local file system
     * - which is a non-bare repo with the source branch checked out
     * - and which contains a node_modules directory
     * Then the origin is assumed to contain previously installed npm dependencies
     * for the project, and a symlink is created in the source location to that
     * node_modules directory; otherwise, all required dependencies are installed
     * in the source location by running "npm install".
     */
    'npm-install': async function( env, args ) {

        // Read and check args.
        const [ source, originRef ] = args;
        ensure( source, 'npm-install: <source> argument is required');

        // Check if source directory has a node_modules subdir.
        const cwd = getcwd( env );
        const sourcePath = Path.resolve( cwd, source );
        const sourceMods = Path.join( sourcePath, 'node_modules');
        const hasSourceMods = await isDir( sourceMods );

        // If source doesn't have a node_modules then try checking the origin
        // for one.
        if( !hasSourceMods && originRef ) {
            // Check if the origin is local.
            const origin = resolveOrigin( originRef );
            const isLocalOrigin = !/^(https?|ssh):/.test( origin );
            if( isLocalOrigin ) {
                // Check if origin contains the checked-out source branch.
                const info = await Git.readInfo( origin );
                if( info && info.branch === source ) {
                    // Check if origin has a node_modules subdir.
                    const originMods = Path.join( origin, 'node_modules');
                    const hasOriginMods = await isDir( originMods );
                    if( hasOriginMods ) {
                        // Create a symlink from origin mods to source mods.
                        console.log('Linking %s -> %s', originMods, sourceMods );
                        await new Promise( ( resolve, reject ) => {
                            symlink( originMods, sourceMods,
                                err => err ? reject( err ) : resolve() );
                        });
                        return;
                    }
                }
            }
        }
        // Unable to link to existing modules, so try installing dependencies.
        console.log('Running npm install...');
        const _env = Object.assign({ cwd: sourcePath }, env );
        const _args = ['npm','install'];
        await this.exec( _env, _args );
    },
    /**
     * Execute an external command.
     */
    'exec': async function( env, args ) {

        const [ command, ...cargs ] = args;
        ensure( command, 'exec: <command> argument is required');

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
        const cwd = getcwd( env );
        const code = await exec( cwd, renv, command, cargs, stdout, stderr );
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
     * REMark - ignore what follows on the line.
     */
    'rem': function( env, args ) {},
    /**
     * Start the dev server.
     */
    'start-server': startServer
}

module.exports = CoreCommands;

