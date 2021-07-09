#!/bin/bash

set -e

version="$1"

if [[ "$version" == "" ]]; then
    echo 'Release branch name must be given as first argument' >&2
    exit 1
fi

if [ ! -d .git ]; then
    echo 'This script must be run at root directory of this repository' >&2
    exit 1
fi

if ! git diff --quiet; then
    echo 'Working tree is dirty! Please ensure all changes are committed and working tree is clean' >&2
    exit 1
fi

if ! git diff --cached --quiet; then
    echo 'Git index is dirty! Please ensure all changes are committed and Git index is clean' >&2
    exit 1
fi

branch="$(git symbolic-ref --short HEAD)"
if [[ "$branch" != "master" ]]; then
    echo 'Current branch is not master. Please move to master before running this script' >&2
    exit 1
fi

echo "Releasing to $version branch..."

set -x
npm install
npm run build
npm prune --production

rm -rf .release
mkdir -p .release

cp action.yml src/*.js package.json package-lock.json .release/

git checkout "$version"
git pull
rm -rf node_modules  # remove node_modules/.cache
mkdir -p src

mv .release/action.yml .
mv .release/*.js ./src/
mv .release/*.json .

git add action.yml ./src/*.js package.json package-lock.json .gitignore README.rst
set +x

echo "Done. Please check 'git diff --cached' to verify changes. If ok, add version tag and push it to remote"
