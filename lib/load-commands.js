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
 * Compile a command definition into a function for invoking the command.
 * @param command       The command name.
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
function compileCommand( command, definition ) {
    if( typeof definition === 'function' ) {
        // The definition is supplied as an actual command implementation.
        return definition;
    }
    // Read properties from the definition.
    const {
        args = [],      // Names for positional arguments.
        vars = {},      // Named, locally scoped environment values.
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
        return function( env, _args, commands ) {
            // Read the command function from the set of available commands.
            const fn = commands[name];
            if( !fn ) {
                throw new Error('Command not found: '+name );
            }
            // Evaluate the command's arguments against the current environment.
            const cargs = args.map( arg => TT.eval( arg, env ) );
            // Call the command function.
            return fn.call( this, env, cargs );
        }
    });
    // Return a function for invoking the command's actions.
    return async function( env, cargs ) {
        console.info('Running %s...', command );
        // Read the set of in-scope commands.
        const { _commands } = env;
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
        env.__args__ = cargs.join(' ');
        // Iterate over the command actions and call each in turn.
        // Note that individual actions don't have positional arguments (although
        // the commands they call may do) so the 'args' param is null here.
        for( const fn of calls ) {
            await fn( env, null, _commands );
        }
    }
}

/**
 * Compile a set of command definitions.
 * See loadCommands().
 */
function compileCommands( commands ) {
    // Iterate over the commands and compile to functions where needed.
    for( const command in commands ) {
        // Replace the command definition with the compiled command.
        const definition = commands[command];
        commands[command] = compileCommand( command, definition );
    }
    return commands;
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
    return compileCommands( commands );
}

module.exports = { loadCommands, compileCommands, compileCommand };

