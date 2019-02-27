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
const TT = require('@locomote.sh/tinytemper');

/**
 * An object hosting all registered commands. Command functions are
 * bound to this object and can use this[...] to resolve references
 * to other command functions.
 */
const Commands = {};

/**
 * Attach a command function to the Commands object.
 */
function attachCommandFunction( name, fn ) {
    Commands[name] = fn.bind( Commands );
}

/**
 * Compile a command definition into a function for invoking the command.
 * @param name          The command name.
 * @param definition    The command definition; either an object with at least
 *                      an "action" or "actions" property, defining one or more
 *                      actions to invoke. An action may be either a function
 *                      accepting a single 'env' argument, a string in
 *                      "<name> <args...>" format, or an array following the
 *                      same format; or the definition can be a function,
 *                      implementing the command directly and taking ( env, args)
 *                      parameters.
 * @returns Returns a function which can be called in order to invoke the
 * commands actions.
 */
function compileCommand( name, definition ) {
    if( typeof definition === 'function' ) {
        // The definition is supplied as an actual command implementation.
        // Attach the function to the Commands object and return.
        return attachCommandFunction( name, definition );
    }
    // Read properties from the definition.
    const {
        args = [],      // Names for positional arguments.
        vars = {},      // Named, locally scoped environment values.
        action,
        actions = []
        silentFail = false // If true then swallow errors.
    } = definition;
    // Check that actions property is valid.
    if( !Array.isArray( actions ) ) {
        throw new error('Command "actions" must be an array: '+name );
    }
    // If single action specified then add to the array of actions.
    if( action ) {
        actions.push( action );
    }
    // Check that we have at least one action.
    if( actions.length == 0 ) {
        throw new Error('Command must define an action or actions: '+name );
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
            throw new Error('Action must be a function, array or string: '+name );
        }
        // Extract command name and arguments from the action.
        const [ aname, ...aargs ] = action;
        // Return a function to invoke the named command.
        return function( env ) {
            // Read the command function from the set of available commands.
            const fn = Commands[aname];
            if( !fn ) {
                throw new Error('Command not found: '+aname );
            }
            // Evaluate the command's arguments against the current environment.
            const cargs = aargs.map( arg => TT.eval( arg, env ) );
            // Call the command function.
            return fn.call( Commands, env, cargs );
        }
    });
    // Create the function for invoking the command's actions.
    const command = async function( env, cargs ) {
        console.info('Running %s...', name );
        // Create a local scope for this command.
        const scope = Object.assign( {}, env );
        // Add command variables evaluated against the parent environment scope.
        for( const name in vars ) {
            scope[name] = TT.eval( vars[name], env );
        }
        // Add positional arguments to the local scope.
        args.forEach( ( arg, idx ) => {
            const carg = cargs[idx];
            if( carg ) {
                scope[arg] = TT.eval( carg, env );
            }
        });
        // Add full argument list to a special var.
        scope.__args__ = cargs.join(' ');
        try {
            // Iterate over the command actions and call each in turn.
            // Note that individual actions don't have positional arguments (although
            // the commands they call may do) so the 'args' param is omitted here.
            for( const fn of calls ) {
                await fn( scope );
            }
        }
        catch( e ) {
            // If silent fail mode isn't enabled then rethrow execution errors.
            if( !silentFail ) {
                throw e;
            }
            // Else the command will return as if it completed.
        }
    }
    // Attach the command function to Commands and return.
    return attachCommandFunction( name, command );
}

/**
 * Compile a set of command definitions.
 * See loadCommands().
 */
function compileCommands( commands ) {
    // Iterate over the commands and compile to functions where needed.
    for( const name in commands ) {
        // Replace the command definition with the compiled command.
        const definition = commands[name];
        compileCommand( name, definition );
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
    // Compile the loaded commands.
    compileCommands( commands );
}

/**
 * Register command definitions.
 * @param defOrFile Either an object containing command definitions, or a
 *                  string providing the file name of a command definition
 *                  file.
 */
function addCommands( defOrFile ) {
    if( typeof defOrFile === 'string' ) {
        loadCommands( defOrFile );
    }
    else {
        compileCommands( defOrFile );
    }
}

/**
 * Run a command.
 * @param name  The name of the command to run.
 * @param env   The command's execution environment.
 * @param args  The command's arguments.
 */
async function runCommand( name, env, args ) {

    // Find the command to run.
    const command = Commands[name];
    if( !command ) {
        throw new Error('Bad command name: '+name );
    }

    // Execute the command.
    await command( env, args );
}

module.exports = {
    addCommands,
    runCommand
};

