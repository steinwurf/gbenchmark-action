import { exec } from '@actions/exec';
import * as core from '@actions/core';
import * as github from '@actions/github';

interface ExecResult {
    stdout: string;
    stderr: string;
    code: number | null;
}

async function capture(cmd: string, args: string[]): Promise<ExecResult> {
    const res: ExecResult = {
        stdout: '',
        stderr: '',
        code: null,
    };

    try {
        const code = await exec(cmd, args, {
            listeners: {
                stdout(data) {
                    res.stdout += data.toString();
                },
                stderr(data) {
                    res.stderr += data.toString();
                },
            },
        });
        res.code = code;
        return res;
    } catch (err) {
        const msg = `Command '${cmd}' failed with args '${args.join(' ')}': ${res.stderr}: ${err}`;
        core.debug(`@actions/exec.exec() threw an error: ${msg}`);
        throw new Error(msg);
    }
}

export async function cmd(...args: string[]): Promise<string> {
    core.debug(`Executing Git: ${args.join(' ')}`);
    const userArgs = [
        '-c',
        'user.name=github-action-benchmark',
        '-c',
        'user.email=github@users.noreply.github.com',
        '-c',
        'http.https://github.com/.extraheader=', // This config is necessary to support actions/checkout@v2 (#9)
    ];
    const res = await capture('git', userArgs.concat(args));
    if (res.code !== 0) {
        throw new Error(`Command 'git ${args.join(' ')}' failed: ${JSON.stringify(res)}`);
    }
    return res.stdout;
}

function getRemoteUrl(token: string | undefined, fullName?: string): string {
    /* eslint-disable @typescript-eslint/camelcase */
    if (!fullName) {
        fullName = github.context.payload.repository?.full_name;
    }
    /* eslint-enable @typescript-eslint/camelcase */

    if (!fullName) {
        throw new Error(`Repository info is not available in payload: ${JSON.stringify(github.context.payload)}`);
    }

    return `https://x-access-token:${token}@github.com/${fullName}.git`;
}

export async function add(filePath: string, ...gitOptions: string[]): Promise<string> {
    core.debug(`Executing 'git add' with token and git options '${gitOptions.join(' ')}'`);

    let args = ['add', filePath];
    if (gitOptions.length > 0) {
        args = gitOptions.concat(args);
    }

    return cmd(...args);
}

export async function checkout(ghBranch: string, ...gitOptions: string[]): Promise<string> {
    core.debug(`Executing 'git checkout' to branch ${ghBranch} with token and git options '${gitOptions.join(' ')}'`);

    let args = ['checkout', ghBranch];
    if (gitOptions.length > 0) {
        args = gitOptions.concat(args);
    }

    return cmd(...args);
}

export async function commit(message: string, ...gitOptions: string[]): Promise<string> {
    core.debug(`Executing 'git commit' with token and git options '${gitOptions.join(' ')}'`);

    let args = ['commit', '-m', message];
    if (gitOptions.length > 0) {
        args = gitOptions.concat(args);
    }

    return cmd(...args);
}

export async function push(
    token: string | undefined,
    ghRepository: string | undefined,
    ...gitOptions: string[]
): Promise<string> {
    core.debug(`Executing 'git push' with token and git options '${gitOptions.join(' ')}'`);

    if (ghRepository && token) {
        const remote = getRemoteUrl(token, ghRepository);
        let args = ['push', remote, '--no-verify'];
        if (gitOptions.length > 0) {
            args = gitOptions.concat(args);
        }

        return cmd(...args);
    } else {
        let args = ['push', '--no-verify'];
        if (gitOptions.length > 0) {
            args = gitOptions.concat(args);
        }

        return cmd(...args);
    }
}

export async function pull(
    token: string | undefined,
    ghRepository: string | undefined,
    ...gitOptions: string[]
): Promise<string> {
    core.debug(`Executing 'git pull' with token and git options '${gitOptions.join(' ')}'`);

    if (ghRepository && token) {
        const remote = getRemoteUrl(token, ghRepository);
        let args = ['pull', remote];
        if (gitOptions.length > 0) {
            args = gitOptions.concat(args);
        }

        return cmd(...args);
    } else {
        let args = ['pull'];
        if (gitOptions.length > 0) {
            args = gitOptions.concat(args);
        }

        return cmd(...args);
    }
}

export async function reset(...gitOptions: string[]): Promise<string> {
    core.debug(`Executing 'git pull' with token and git options '${gitOptions.join(' ')}'`);

    let args = ['reset', '--hard', 'HEAD~1'];
    if (gitOptions.length > 0) {
        args = gitOptions.concat(args);
    }

    return cmd(...args);
}

export async function clone(
    token: string | undefined,
    ghRepository: string,
    ...cloneOptions: string[]
): Promise<string> {
    core.debug(
        `Executing 'git clone' of repository '${ghRepository}' with token and options '${cloneOptions.join(' ')}'`,
    );

    const remote = token !== undefined ? getRemoteUrl(token, ghRepository) : 'origin';
    let args = ['clone', remote];
    if (cloneOptions.length > 0) {
        args = args.concat(cloneOptions);
    }

    return cmd(...args);
}

export async function currentBranch(...gitOptions: string[]): Promise<string> {
    core.debug(`Executing 'rev-parse'`);

    let args = ['rev-parse', '--abbrev-ref', 'HEAD'];
    if (gitOptions.length > 0) {
        args = gitOptions.concat(args);
    }
    return cmd(...args);
}
