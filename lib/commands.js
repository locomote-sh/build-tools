const Path = require('path');
const Git = require('./git');

const {
    ensure,
    exec
} = require('./support');

const Log = require('log4js').getLogger('build');

const CoreCommands = {
    /**
     * Clone a git remote to a location on the local filesystem.
     */
    'git-clone': async function( env, branch, dir = branch ) {

        const { remote, workspace } = env;

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
    'git-push': async function( env, branch, dir = branch ) {

        const { workspace } = env;

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
    'build-record': async function( env, sourceDir, targetDir ) {

        const { workspace } = env;

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
     * Run an external command.
     */
    'run': async function( env, command, ...args ) {

        const { workspace } = env;

        ensure( command,    'run: <command> argument is required');
        ensure( workspace,  'run: <workspace> env var is required');

        // Runtime environment vars.
        const renv = Object.keys( env )
            .reduce( ( renv, key ) => {
                renv['LOCOMOTE_'+key.toUpperCase()] = env[key];
                return renv;
            }, {});

        // Log functions for the command's stderr + stdout.
        const stdout = line => Log.info( line );
        const stderr = line => Log.error( line );

        // Execute the command.
        const code = await exec( workspace, renv, command, args, stdout, stderr );

        Log.info('Command "%s %s" exited with code %d', command, args.join(' '), code );

    }
}


