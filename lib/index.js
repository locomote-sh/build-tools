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
    addCommands,
    runCommand
} = require('./commands');

const CoreCommands = require('./core-commands');

/**
 * Run a named command.
 * @param name  The command name.
 * @param env   Build environment variables.
 * @param args  Positional arguments for the command.
 * @param defs  Optional additional command definition files to load.
 */
async function run( name, env, args, defs ) {

    // Load core commands.
    addCommands( CoreCommands );

    // Load additional command files.
    defs.forEach( def => addCommands( def ) );

    // Execute the command.
    try {
        runCommand( name, env, args );
    }
    catch( e ) {
        console.error('Executing command: '+name, e );
    }

}

module.exports = { run };

