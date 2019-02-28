# build-tools
Command line build tools for Locomote.sh.

Allows content in a Locomote content repository to be built and served locally, or published to the server.

## Installation

`npm install git+https://github.com/locomote-sh/pwa-build-tools.git`

## Usage

`npx locomote [command] <options...> <args...>`

Where:

* `[command]` is a build commands, see 'Commands' section below;
* `<options...> are runtime options, see 'Options' section below;
* `<args...>` is one or more arguments to the build command.

## Commands

A number of standard commands are available, these are:

* `serve <source> <target>`: Build a project and serve it locally using the development server.
The build source and target locations can be optionally specified as arguments;
they default to `.` (i.e. the current directory) and `_site` respectively.
The development server will watch the source location and automatically rebuild the project after updates.
* `pwa-build <source>`: Build PWA assets.
This command will generate an assortment of different assets - app icon and splashscreen images, web manifest files etc.
- from information in the content manifest and write them to the source location.
The source location may be optionally specified as the command's argument;
it defaults to `.` (i.e. the current directory).
* `build <origin> <source> <target>`: Build a project and write the result to the content repository.
All arguments are optional.
The `origin` argument is a file path or URL to the content repository, and defaults to `.` (i.e. the current directory).
The `source` and `target` arguments here specify the _names_ of the content repository branches holding the project source and built content.
They default to the values `master` and `test` respectively,
meaning that the command will build the contents of the _master_ branch and write the result to the _test_ branch.

## Options

The following runtime switches and flags are available:

* `-h`, `--help`: Print the command help message and exit.
* `-v`, `--version`: Print the command version and exit.
* `--config <file>`: Specify the name of a file containing additional tool configuration.
* `-E<name>=<value>`: Specify additional build environment variables as `name=value` pairs.

## Sample usage

Generate PWA assets for the project in the current directory:
```
> npx locomote pwa-build
```

Run the development server from the project's root directory:
```
> npx locomote serve
```

Build the project from its root directory and publish the results on the _test_ branch:
```
> npx locomote build
> git push --all
```

Build a remote project and publish the results directly to the _public_ branch:
```
> npx locomote build ssh://git@cms.locomote.sh:22222/account/project.git master public
```
