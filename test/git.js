"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const assert_2 = require("assert");
const mock = require("mock-require");
class FakedExec {
    constructor() {
        this.lastArgs = null;
        this.stdout = 'this is test';
        this.stderr = null;
        this.exitCode = 0;
        this.error = null;
    }
    reset() {
        this.lastArgs = null;
        this.stdout = 'this is test';
        this.stderr = null;
        this.exitCode = 0;
        this.error = null;
    }
}
const fakedExec = new FakedExec();
const gitHubContext = {
    payload: {
        repository: {
            full_name: 'user/repo',
        },
        path: {
            full_path: '/this/is/a/path',
        },
        branch: {
            full_name: 'my-branch',
        },
    },
};
mock('@actions/exec', {
    exec: (c, a, o) => {
        fakedExec.lastArgs = [c, a, o];
        o.listeners.stdout(Buffer.from(fakedExec.stdout));
        if (fakedExec.stderr !== null) {
            o.listeners.stderr(Buffer.from(fakedExec.stderr));
        }
        if (fakedExec.error === null) {
            return Promise.resolve(fakedExec.exitCode);
        }
        else {
            return Promise.reject(new Error(fakedExec.error));
        }
    },
});
mock('@actions/core', {
    debug: () => {
        /* do nothing */
    },
});
mock('@actions/github', {
    context: gitHubContext,
});
const { cmd, add, checkout, commit, push, pull, reset, clone, currentBranch } = require('../src/git');
const ok = assert_1.strict.ok;
const userArgs = [
    '-c',
    'user.name=github-action-benchmark',
    '-c',
    'user.email=github@users.noreply.github.com',
    '-c',
    'http.https://github.com/.extraheader=',
];
describe('git', function () {
    after(function () {
        mock.stop('@actions/exec');
        mock.stop('@actions/core');
        mock.stop('@actions/github');
    });
    afterEach(function () {
        fakedExec.reset();
    });
    describe('cmd()', function () {
        it('runs Git command successfully', async function () {
            const stdout = await cmd('log', '--oneline');
            const args = fakedExec.lastArgs;
            assert_2.deepStrictEqual(stdout, 'this is test');
            ok(args);
            assert_2.deepStrictEqual(args[0], 'git');
            assert_2.deepStrictEqual(args[1], userArgs.concat(['log', '--oneline']));
            ok('listeners' in args[2]);
        });
        it('raises an error when command returns non-zero exit code', async function () {
            fakedExec.exitCode = 101;
            await assert_1.strict.rejects(() => cmd('show'), /^Error: Command 'git show' failed: /);
            assert_2.notDeepStrictEqual(fakedExec.lastArgs, null);
        });
        it('raises an error with stderr output', async function () {
            fakedExec.exitCode = 101;
            fakedExec.stderr = 'this is error output!';
            await assert_1.strict.rejects(() => cmd('show'), /this is error output!/);
        });
        it('raises an error when exec.exec() threw an error', async function () {
            fakedExec.error = 'this is error from exec.exec';
            fakedExec.stderr = 'this is stderr output!';
            await assert_1.strict.rejects(() => cmd('show'), /this is error from exec\.exec/);
            await assert_1.strict.rejects(() => cmd('show'), /this is stderr output!/);
        });
    });
    describe('add()', function () {
        afterEach(function () {
            gitHubContext.payload.path = { full_path: '/path/to/dir' };
        });
        it('runs `git add` with given path and options', async function () {
            const stdout = await add('/path/to/dir', 'opt1', 'opt2');
            const args = fakedExec.lastArgs;
            assert_2.deepStrictEqual(stdout, 'this is test');
            ok(args);
            assert_2.deepStrictEqual(args[0], 'git');
            assert_2.deepStrictEqual(args[1], userArgs.concat(['opt1', 'opt2', 'add', '/path/to/dir']));
        });
    });
    describe('clone()', function () {
        afterEach(function () {
            gitHubContext.payload.repository = { full_name: 'user/repo' };
        });
        it('runs `git clone` with given token, repository and options', async function () {
            var _a;
            const stdout = await clone('this-is-token', (_a = gitHubContext.payload.repository) === null || _a === void 0 ? void 0 : _a.full_name, 'opt1', 'opt2');
            const args = fakedExec.lastArgs;
            assert_2.deepStrictEqual(stdout, 'this is test');
            ok(args);
            assert_2.deepStrictEqual(args[0], 'git');
            assert_2.deepStrictEqual(args[1], userArgs.concat([
                'clone',
                'https://x-access-token:this-is-token@github.com/user/repo.git',
                'opt1',
                'opt2',
            ]));
        });
        it('raises an error when repository info is not included in payload', async function () {
            gitHubContext.payload.repository = null;
            await assert_1.strict.rejects(() => { var _a; return clone('my-token', (_a = gitHubContext.payload.repository) === null || _a === void 0 ? void 0 : _a.full_name, 'opt1', 'opt2'); }, /^Error: Repository info is not available in payload/);
            assert_2.deepStrictEqual(fakedExec.lastArgs, null);
        });
    });
    describe('checkout()', function () {
        afterEach(function () {
            gitHubContext.payload.repository = { full_name: 'user/repo' };
        });
        it('runs `git checkout` with given branch and options', async function () {
            const stdout = await checkout('my-branch', 'opt1', 'opt2');
            const args = fakedExec.lastArgs;
            assert_2.deepStrictEqual(stdout, 'this is test');
            ok(args);
            assert_2.deepStrictEqual(args[0], 'git');
            assert_2.deepStrictEqual(args[1], userArgs.concat(['opt1', 'opt2', 'checkout', 'my-branch']));
        });
    });
    describe('commit()', function () {
        afterEach(function () {
            gitHubContext.payload.repository = { full_name: 'user/repo' };
        });
        it('runs `git commit` with given message and options', async function () {
            const stdout = await commit('my-message', 'opt1', 'opt2');
            const args = fakedExec.lastArgs;
            assert_2.deepStrictEqual(stdout, 'this is test');
            ok(args);
            assert_2.deepStrictEqual(args[0], 'git');
            assert_2.deepStrictEqual(args[1], userArgs.concat(['opt1', 'opt2', 'commit', '-m', 'my-message']));
        });
    });
    describe('currentBranch()', function () {
        afterEach(function () {
            gitHubContext.payload.repository = { full_name: 'user/repo' };
        });
        it('runs `git rev-parse` with given options', async function () {
            const stdout = await currentBranch('opt1', 'opt2');
            const args = fakedExec.lastArgs;
            assert_2.deepStrictEqual(stdout, 'this is test');
            ok(args);
            assert_2.deepStrictEqual(args[0], 'git');
            assert_2.deepStrictEqual(args[1], userArgs.concat(['opt1', 'opt2', 'rev-parse', '--abbrev-ref', 'HEAD']));
        });
    });
    describe('push()', function () {
        afterEach(function () {
            gitHubContext.payload.repository = { full_name: 'user/repo' };
        });
        it('runs `git push` with given repository and options with token', async function () {
            var _a;
            const stdout = await push('this-is-token', (_a = gitHubContext.payload.repository) === null || _a === void 0 ? void 0 : _a.full_name, 'opt1', 'opt2');
            const args = fakedExec.lastArgs;
            assert_2.deepStrictEqual(stdout, 'this is test');
            ok(args);
            assert_2.deepStrictEqual(args[0], 'git');
            assert_2.deepStrictEqual(args[1], userArgs.concat([
                'opt1',
                'opt2',
                'push',
                'https://x-access-token:this-is-token@github.com/user/repo.git',
                '--no-verify',
            ]));
        });
    });
    describe('pull()', function () {
        afterEach(function () {
            gitHubContext.payload.repository = { full_name: 'user/repo' };
        });
        it('runs `git pull` with given repository and options with token', async function () {
            const stdout = await pull('this-is-token', 'user/my-repository', 'opt1', 'opt2');
            const args = fakedExec.lastArgs;
            assert_2.deepStrictEqual(stdout, 'this is test');
            ok(args);
            assert_2.deepStrictEqual(args[0], 'git');
            assert_2.deepStrictEqual(args[1], userArgs.concat([
                'opt1',
                'opt2',
                'pull',
                'https://x-access-token:this-is-token@github.com/user/my-repository.git',
            ]));
        });
    });
    describe('reset()', function () {
        afterEach(function () {
            gitHubContext.payload.repository = { full_name: 'user/repo' };
        });
        it('runs `git reset` with given ptions', async function () {
            const stdout = await reset('opt1', 'opt2');
            const args = fakedExec.lastArgs;
            assert_2.deepStrictEqual(stdout, 'this is test');
            ok(args);
            assert_2.deepStrictEqual(args[0], 'git');
            assert_2.deepStrictEqual(args[1], userArgs.concat(['opt1', 'opt2', 'reset', '--hard', 'HEAD~1']));
        });
    });
});
//# sourceMappingURL=git.js.map