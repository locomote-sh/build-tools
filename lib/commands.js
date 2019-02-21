const Path = require('path');
const Git = require('./git');
const OS = require('os');
const TT = require('tinytemper');

const {
    mkdir,
    mkdtemp
} = require('fs');

const {
    ensure,
    exec
} = require('./support');

const Log = require('log4js').getLogger('build');

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

        Log.info('Cloning into %s...', path );

        await Git.clone( path, remote );
        await Git.checkout( path, branch );

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

            Log.info('Committing changes in %s...', path );

            // Commit changes.
            const message   = `Locomote.sh build ${Date.now()}`;
            await Git.commit( path, message );

            // Push to remote.
            await Git.push( path );

        }
        else {
            Log.info('No changes in %s', path );
        }

    },
    /**
     * Add or update the build record at the specified location.
     */
    'build-record': async function( env, args ) {

        const { workspace } = env;
        const [ sourceDir, targetDir ] = args;

        ensure( sourceDir,  'build-record: <sourceDir> argument is required');
        ensure( targetDir,  'build-record: <targetDir> argument is required');
        ensure( workspace,  'build-record: <workspace> env var is required');

        // Attempt to read existing record file.
        const recordPath = Path.join( target, '.locomote-build-record.json');
        const record = await readJSON( recordPath, {});

        Log.info('Updating build record in %s...', recordPath );

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
                Log.info('Ensured directory at %s...', path );
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
                Log.info('Created temporary directory "%s" at %s', name, path );
                env[name] = path;
            });
        });
    },
    /**
     * Run an external command.
     */
    'run': async function( env, args ) {

        const [ command, ...cargs ] = args;
        const { workspace } = env;

        ensure( command,    'run: <command> argument is required');
        ensure( workspace,  'run: <workspace> env var is required');

        // Runtime environment vars.
        const renv = Object.keys( env )
            .reduce( ( renv, key ) => {
                // Copy public environment vars into the runtime env.
                if( !key.startsWith('_') ) {
                    renv['LOCOMOTE_'+key.toUpperCase()] = env[key];
                }
                return renv;
            }, {});

        // Log functions for the command's stderr + stdout.
        const stdout = line => Log.info( line );
        const stderr = line => Log.error( line );

        // Execute the command.
        const code = await exec( workspace, renv, command, cargs, stdout, stderr );

        Log.info('Command "%s %s" exited with code %d', command, args.join(' '), code );

    }
}

/**
 * Compile a command definition into a function for invoking the command.
 * @param command       The command name.
 * @param definition    The command definition; an object with at least
 *                      an "action" or "actions" property, defining one
 *                      or more actions to invoke. An action may be either
 *                      a function accepting a single 'env' argument, a
 *                      string in "<name> <args...>" format, or an array
 *                      following the same format.
 * @returns Returns a function which can be called in order to invoke the
 * commands actions.
 */
function compileCommand( command, definition ) {
    // Read properties from the definition.
    const {
        args = {},
        action,
        actions = []
    } = definition;
    // Check that actions property is valid.
    if( !Array.isArray( actions ) ) {
        throw new error('Command "actions" must be an array: '+command );
    }
    // If single action specified then add to the array of actions.
    if( action ) {
        actions.push( action );
    }
    // Check that we have at least one action.
    if( actions.length == 0 ) {
        throw new Error('Command must define an action or actions: '+command );
    }
    // Convert the array of actions into an array of functions.
    const calls = actions.map( action => {
        // If action is a function then use as-is.
        if( typeof action === 'function' ) {
            return action;
        }
        // If action is a string then convert to a [ name, ...args ] array.
        if( typeof action === 'string' ) {
            action = action.split(/\s+/g);
        }
        // If action isn't an array at this point then it's an invalid value.
        if( !Array.isArray( action ) ) {
            throw new Error('Action must be a function, array or string: '+command );
        }
        // Extract command name and arguments from the action.
        const [ name, ...args ] = action;
        // Return a function to invoke the named command.
        return function( env, args, commands ) {
            // Read the command function from the set of available commands.
            const fn = commands[name];
            if( !fn ) {
                throw new Error('Command not found: '+name );
            }
            // Evaluate the command's arguments against the current environment.
            const cargs = args.map( arg => TT.eval( env, arg ) );
            // Call the command function.
            return fn.call( this, env, cargs );
        }
    });
    // Return a function for invoking the command's actions.
    return async function( env ) {
        // Read the set of in-scope commands.
        const { _commands } = env;
        // Create a copy of the environment for this command.
        const cenv = Object.assign( {}, env );
        // Add command arguments evaluated against the parent environment scope.
        for( const name in args ) {
            cenv[name] = TT.eval( env, args[name] );
        }
        // Iterate over the command actions and call each in turn.
        for( const fn of calls ) {
            await fn( env, null, _commands );
        }
    }
}

/**
 * Load commands from a command definition file. The file may be a JSON
 * file or node.js module. An example definition file might look like this:
 * ```
 * {
 *   "cli:deploy": {
 *     "args": {
 *       "source": "git:master",
 *       "target": "git:test"
 *     },
 *     "actions": [
 *       "prepare-workspace temp",
 *       "build-from-git"
 *     ]
 *   },
 *   "change:master": {
 *     "args": {
 *       "source": "git:master",
 *       "target": "git:test"
 *     },
 *     "actions": [
 *       "prepare-workspace",
 *       "build-from-git"
 *     ]
 *   }
 * }
 * ```
 */
function loadCommands( file ) {
    // Resolve the file name to an absolute path.
    const path = Path.resolve( file );
    // Load the file.
    const commands = require( path );
    // Iterate over the commands and compile to functions where needed.
    for( const command in commands ) {
        const definition = commands[command];
        if( typeof definition !== 'function' ) {
            commands[command] = compileCommand( command, definition );
        }
    }
    return commands;
}

module.exports = { CoreCommands, loadCommands };

