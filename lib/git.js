const Path = require('path');
const { exec } = require('./support');

async function git( path, ...args ) {
    const output = [];
    const stdout = line => output.push( line );
    await exec( path, null, 'git', args, stdout );
    return output;
}

async function clone( path, remote ) {
    const wd = Path.dirname( path );
    const dir = Path.basename( path );
    await git( wd, 'clone', '-q', remote, dir );
}

async function listAllBranches( path ) {
    const branches = await git( path, 'branch', '-a');
    return branches.map( branch => branch.trim() );
}

async function checkout( path, branch ) {
    const branches = await listAllBranches( path );
    const exists = branches.contains('remotes/origin/'+branch );
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

async function addAll( path ) {
    await git( path, 'add', '-A', '.');
}

async function commit( path, message ) {
    await git( path, 'commit', '-m', message );
}

async function push( path, branch ) {
    await git( path, 'push', '-u', 'origin', branch );
}

async function readInfo( path ) {
    // Read a name for the repository. This is extracted from the first remote fetch origin.
    const remotes = await git( path, 'remote','-v');
    const rfetch = remotes.find( remote => remote.endsWith(' (fetch)') );
    const name = rfetch && /([^/]*).git \(fetch\)$/.exec( rfetch )[1];
    // Read the name of the checked-out branch at the specified path.
    const [ branch ] = await git( path, 'rev-parse','--abbrev-ref','HEAD');
    if( !branch ) {
        throw new Error('Unable to read branch name from '+path );
    }
    // Read the latest commit on the checked-out branch.
    const [ result ] = await git( path, 'log', '--pretty=format:%h %ct %ce %s', '-n', '1', branch );
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
        date: new Date( Number( date ) * 1000 )
    };
}

module.exports = {
    clone,
    listAllBranches,
    checkout,
    addAll,
    commit,
    push,
    readInfo
};
