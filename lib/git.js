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
const { exec, isDir } = require('./support');

async function git( path, ...args ) {
    const output = [];
    const stdout = line => output.push( line );
    const code = await exec( path, null, 'git', args, stdout );
    return { code, output };
}

async function clone( path, origin ) {
    const wd = Path.dirname( path );
    const dir = Path.basename( path );
    await git( wd, 'clone', '-q', origin, dir );
}

const RemoteRefPrefix = 'refs/remote/';

async function listAllBranches( path ) {
    const { output } = await git( path, 'branch', '-a', '--format', '%(refname)');
    return output 
        .filter( branch => branch.startsWith( RemoteRefPrefix ) )
        .map( branch => branch.slice( RemoteRefPrefix.length ) );
}

async function checkout( path, branch ) {
    const branches = await listAllBranches( path );
    const exists = branches.includes( branch );
    if( exists ) {
        await git( path, 'checkout', '-B', branch, 'origin/'+branch );
    }
    else {
        // Create a new, empty branch;
        // See https://stackoverflow.com/a/13969482/8085849 and comments.
        await git( path, 'checkout', '--orphan', branch );
        await git( path, 'rm', '--cached', '-r');
        await git( path, 'clean', '-fd');
    }
}

function isOK( result ) {
    return result.code === 0;
}

async function addAll( path ) {
    return isOK( await git( path, 'add', '-A', '.') );
}

async function commit( path, message ) {
    return isOK( await git( path, 'commit', '-m', message ) );
}

async function merge( path, source ) {
    return isOK( await git( path, 'merge', source ) );
}

async function push( path, branch ) {
    return isOK( await git( path, 'push', '-u', 'origin', branch ) );
}

async function pull( path ) {
    return isOK( await git( path, 'pull') );
}

const RemoteOriginPrefix = 'origin';
const RemoteOriginSuffix = ' (fetch)';

async function listRemotes( path ) {
    const { output } = await git( path, 'remote','-v');
    return output
        .filter( remote => remote.startsWith( RemoteOriginPrefix ) )
        .filter( remote => remote.endsWith( RemoteOriginSuffix ) )
        .map( remote => remote.slice( RemoteOriginPrefix.length ) )
        .map( remote => remote.slice( 0, RemoteOriginSuffix.length * -1 ) )
        .map( remote => remote.trim() );
}

async function readInfo( path ) {
    const exists = await isDir( path );
    if( !exists ) {
        return null;
    }
    // Read a name for the repository. This is extracted from the first remote fetch origin.
    const remotes = await listRemotes( path );

    // Read the repository name from the first remote origin.
    const origin = remotes[0];
    const name = readRepoName( origin );

    // Read the name of the checked-out branch at the specified path.
    const { output: [ branch ] } = await git( path, 'rev-parse','--abbrev-ref','HEAD');
    if( !branch ) {
        throw new Error('Unable to read branch name from '+path );
    }

    // Read the latest commit on the checked-out branch.
    const { output: [ result ] }
        = await git( path, 'log', '--pretty=format:%h %ct %ce %s', '-n', '1', branch );
    if( !result ) {
        throw new Error('Unable to read commit info from '+path );
    }

    // Result is in format e.g. d748d93 1465819027 committer@email.com A commit message
    // First field is the truncated hash; second field is a unix timestamp (seconds
    // since epoch); third field is the committer email; subject is everything after.
    const [ , commit, date, committer, subject ]
        = /^([0-9a-f]+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec( result );

    return {
        name,
        commit,
        branch,
        committer,
        subject,
        date: new Date( Number( date ) * 1000 ),
        remotes
    };
}

// Read a repository name from an origin reference.
function readRepoName( origin ) {
    let name = Path.basename( origin );
    if( name.endsWith('.git') ) {
        name = name.slice( 0, -4 );
    }
    return name;
}

module.exports = {
    clone,
    listAllBranches,
    checkout,
    addAll,
    commit,
    push,
    pull,
    readInfo
};
