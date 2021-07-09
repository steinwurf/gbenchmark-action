import { deepStrictEqual as eq, ok as assertOk } from 'assert';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as cheerio from 'cheerio';
import markdownit = require('markdown-it');
import mock = require('mock-require');
import rimraf = require('rimraf');
import { Config } from '../src/config';
import { Benchmark } from '../src/extract';
import { DataJson } from '../src/write';

const ok: (x: any, msg?: string) => asserts x = assertOk;

type OctokitOpts = { owner: string; repo: string; commit_sha: string; body: string };
class FakedOctokitRepos {
    spyOpts: OctokitOpts[];
    constructor() {
        this.spyOpts = [];
    }
    createCommitComment(opt: OctokitOpts) {
        this.spyOpts.push(opt);
        return Promise.resolve({
            status: 201,
            data: {
                html_url: 'https://dummy-comment-url',
            },
        });
    }
    lastCall(): OctokitOpts {
        return this.spyOpts[this.spyOpts.length - 1];
    }
    clear() {
        this.spyOpts = [];
    }
}

const fakedRepos = new FakedOctokitRepos();

class FakedOctokit {
    repos: FakedOctokitRepos;
    opt: { token: string };
    constructor(token: string) {
        this.opt = { token };
        this.repos = fakedRepos;
    }
}

type GitFunc = 'add' | 'cmd' | 'clone' | 'checkout' | 'commit' | 'currentBranch' | 'push' | 'pull' | 'reset';
class GitSpy {
    history: [GitFunc, unknown[]][];
    pushFailure: null | string;
    pushFailureCount: number;

    constructor() {
        this.history = [];
        this.pushFailure = null;
        this.pushFailureCount = 0;
    }

    call(func: GitFunc, args: unknown[]) {
        this.history.push([func, args]);
    }

    clear() {
        this.history = [];
        this.pushFailure = null;
        this.pushFailureCount = 0;
    }

    mayFailPush() {
        if (this.pushFailure !== null && this.pushFailureCount > 0) {
            --this.pushFailureCount;
            throw new Error(this.pushFailure);
        }
    }
}
const gitSpy = new GitSpy();

interface RepositoryPayload {
    owner: {
        login: string;
    };
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
}

const gitHubContext = {
    payload: {
        repository: {
            owner: {
                login: 'user',
            },
            name: 'repo',
            full_name: 'user/repo',
            html_url: 'https://github.com/user/repo',
            private: false,
        } as RepositoryPayload | null,
    },
    workflow: 'Workflow name',
};

mock('@actions/core', {
    debug: () => {
        /* do nothing */
    },
    warning: () => {
        /* do nothing */
    },
});
mock('@actions/github', { context: gitHubContext, GitHub: FakedOctokit });
mock('../src/git', {
    async add(...args: unknown[]) {
        gitSpy.call('add', args);
        return '';
    },
    async cmd(...args: unknown[]) {
        gitSpy.call('cmd', args);
        return '';
    },
    async clone(...args: unknown[]) {
        gitSpy.call('clone', args);
        return '';
    },
    async checkout(...args: unknown[]) {
        gitSpy.call('checkout', args);
        return '';
    },
    async commit(...args: unknown[]) {
        gitSpy.call('commit', args);
        return '';
    },
    async currentBranch(...args: unknown[]) {
        gitSpy.call('currentBranch', args);
        return '';
    },
    async push(...args: unknown[]) {
        gitSpy.call('push', args);
        gitSpy.mayFailPush(); // For testing retry
        return '';
    },
    async pull(...args: unknown[]) {
        gitSpy.call('pull', args);
        return '';
    },
    async reset(...args: unknown[]) {
        gitSpy.call('reset', args);
        return '';
    },
});

const writeBenchmark: (b: Benchmark, c: Config) => Promise<any> = require('../src/write').writeBenchmark;

describe('writeBenchmark()', function() {
    const savedCwd = process.cwd();

    before(function() {
        process.chdir(path.join(__dirname, 'data', 'write'));
    });

    after(function() {
        mock.stop('@actions/core');
        mock.stop('@actions/github');
        mock.stop('../src/git');
        process.chdir(savedCwd);
    });

    afterEach(function() {
        fakedRepos.clear();
    });

    // Utilities for test data
    const lastUpdate = Date.now() - 10000;
    const user = {
        email: 'dummy@example.com',
        name: 'User',
        username: 'user',
    };
    const repoUrl = 'https://github.com/user/repo';

    function commit(id = 'commit id', message = 'dummy message', u = user) {
        return {
            author: u,
            committer: u,
            distinct: false,
            id,
            message,
            timestamp: 'dummy stamp',
            tree_id: 'dummy tree id',
            url: 'https://github.com/user/repo/commit/' + id,
        };
    }

    function bench(name: string, value: number, range = '± 20', unit = 'ns/iter') {
        return {
            name,
            range,
            unit,
            value,
        };
    }

    context('with external json file', function() {
        const dataJson = 'data.json';
        const defaultCfg: Config = {
            name: 'Test benchmark',
            outputFilePath: 'dummy', // Should not affect
            ghBranch: 'dummy', // Should not affect
            ghRepository: undefined,
            benchmarkDataDirPath: 'dummy', // Should not affect
            githubToken: undefined,
            autoPush: false,
            autoPushFilter: '',
            commentAlways: false,
            saveDataFile: true,
            commentOnAlert: false,
            alertThreshold: 2.0,
            failOnAlert: true,
            alertCommentCcUsers: ['@user'],
            externalDataJsonPath: dataJson,
            maxItemsInChart: null,
            failThreshold: 2.0,
        };

        const savedRepository = gitHubContext.payload.repository;

        afterEach(async function() {
            try {
                await fs.unlink(dataJson);
            } catch (_) {
                // Ignore
            }
            gitHubContext.payload.repository = savedRepository;
        });

        const md2html = markdownit();

        const normalCases: Array<{
            it: string;
            config: Config;
            data: DataJson | null;
            added: Benchmark;
            error?: string[];
            commitComment?: string;
            repoPayload?: null | RepositoryPayload;
        }> = [
            {
                it: 'raises an alert without CC names',
                config: { ...defaultCfg, alertCommentCcUsers: [] },
                data: {
                    lastUpdate,
                    repoUrl,
                    entries: {
                        'Test benchmark': [
                            {
                                commit: commit('prev commit id'),
                                date: lastUpdate - 1000,
                                benches: [bench('bench_fib_10', 100)],
                            },
                        ],
                    },
                },
                added: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    benches: [bench('bench_fib_10', 210)], // Exceeds 2.0 threshold
                },
                error: [
                    '# :warning: **Performance Alert** :warning:',
                    '',
                    "Possible performance regression was detected for benchmark **'Test benchmark'**.",
                    'Benchmark result of this commit is worse than the previous benchmark result exceeding threshold `2`.',
                    '',
                    '| Benchmark suite | Current: current commit id | Previous: prev commit id | Ratio |',
                    '|-|-|-|-|',
                    '| `bench_fib_10` | `210` ns/iter (`± 20`) | `100` ns/iter (`± 20`) | `2.10` |',
                    '',
                    'This comment was automatically generated by [workflow](https://github.com/user/repo/actions?query=workflow%3AWorkflow%20name) using [github-action-benchmark](https://github.com/marketplace/actions/continuous-benchmark).',
                ],
            },
        ];
        for (const t of normalCases) {
            it(t.it, async function() {
                if (t.repoPayload !== undefined) {
                    gitHubContext.payload.repository = t.repoPayload;
                }
                if (t.data !== null) {
                    await fs.writeFile(dataJson, JSON.stringify(t.data), 'utf8');
                }

                let caughtError: Error | null = null;
                try {
                    await writeBenchmark(t.added, t.config);
                } catch (err) {
                    if (!t.error && !t.commitComment) {
                        throw err;
                    }
                    caughtError = err;
                }

                const json: DataJson = JSON.parse(await fs.readFile(dataJson, 'utf8'));

                eq(typeof json.lastUpdate, 'number');
                ok(json.entries[t.config.name]);
                const len = json.entries[t.config.name].length;
                ok(len > 0);
                eq(json.entries[t.config.name][len - 1], t.added); // Check last item is the newest

                if (t.data !== null) {
                    ok(json.lastUpdate > t.data.lastUpdate);
                    eq(json.repoUrl, t.data.repoUrl);
                    for (const name of Object.keys(t.data.entries)) {
                        const entries: Benchmark[] = t.data.entries[name];
                        if (name === t.config.name) {
                            if (t.config.maxItemsInChart === null || len < t.config.maxItemsInChart) {
                                eq(len, entries.length + 1, name);
                                // Check benchmark data except for the last appended one are not modified
                                eq(json.entries[name].slice(0, -1), entries, name);
                            } else {
                                // When data items was truncated due to max-items-in-chart
                                eq(len, entries.length, name); // Number of items did not change because first item was shifted
                                eq(json.entries[name].slice(0, -1), entries.slice(1), name);
                            }
                        } else {
                            eq(json.entries[name], entries, name);
                        }
                    }
                }

                if (t.error) {
                    ok(caughtError);
                    const expected = t.error.join('\n');
                    eq(expected, caughtError.message);
                }

                if (t.commitComment !== undefined) {
                    ok(caughtError);
                    // Last line is appended only for failure message
                    const messageLines = caughtError.message.split('\n');
                    ok(messageLines.length > 0);
                    const expectedMessage = messageLines.slice(0, -1).join('\n');
                    ok(
                        fakedRepos.spyOpts.length > 0,
                        `len: ${fakedRepos.spyOpts.length}, caught: ${caughtError.message}`,
                    );
                    const opts = fakedRepos.lastCall();
                    eq(opts.owner, 'user');
                    eq(opts.repo, 'repo');
                    eq(opts.commit_sha, 'current commit id');
                    eq(opts.body, expectedMessage);
                    const commentLine = messageLines[messageLines.length - 1];
                    eq(commentLine, t.commitComment);

                    // Check the body is a correct markdown document by markdown parser
                    // Validate markdown content via HTML
                    // TODO: Use Markdown AST instead of DOM API
                    const html = md2html.render(opts.body);
                    const query = cheerio.load(html);

                    const h1 = query('h1');
                    eq(h1.length, 1);
                    eq(h1.text(), ':warning: Performance Alert :warning:');

                    const tr = query('tbody tr');
                    eq(tr.length, t.added.benches.length);

                    const a = query('a');
                    eq(a.length, 2);

                    const workflowLink = a.first();
                    eq(workflowLink.text(), 'workflow');
                    const workflowUrl = workflowLink.attr('href');
                    ok(workflowUrl?.startsWith(json.repoUrl), workflowUrl);

                    const actionLink = a.last();
                    eq(actionLink.text(), 'github-action-benchmark');
                    eq(actionLink.attr('href'), 'https://github.com/marketplace/actions/continuous-benchmark');
                }
            });
        }
    });

    // Tests for updating GitHub branch
    context('with gh-pages branch', function() {
        beforeEach(async function() {
            (global as any).window = {}; // Fake window object on browser
        });
        afterEach(async function() {
            gitSpy.clear();
            delete (global as any).window;
            for (const p of [
                path.join('data-dir', 'data.js'),
                path.join('data-dir', 'index.html'),
                'new-data-dir',
                path.join('with-index-html', 'data.js'),
            ]) {
                // Ignore exception
                await new Promise(resolve => rimraf(p, resolve));
            }
        });

        async function isFile(p: string) {
            try {
                const s = await fs.stat(p);
                return s.isFile();
            } catch (_) {
                return false;
            }
        }

        async function isDir(p: string) {
            try {
                const s = await fs.stat(p);
                return s.isDirectory();
            } catch (_) {
                return false;
            }
        }

        async function loadDataJs(dataDir: string) {
            const dataJs = path.join(dataDir, 'data.js');
            if (!(await isDir(dataDir)) || !(await isFile(dataJs))) {
                return null;
            }
            const dataSource = await fs.readFile(dataJs, 'utf8');
            eval(dataSource);
            return (global as any).window.BENCHMARK_DATA as DataJson;
        }

        const defaultCfg: Config = {
            name: 'Test benchmark',
            outputFilePath: 'dummy', // Should not affect
            ghBranch: 'gh-pages',
            ghRepository: 'dummy repo',
            benchmarkDataDirPath: 'data-dir', // Should not affect
            githubToken: 'dummy token',
            autoPush: true,
            autoPushFilter: '',
            commentAlways: false,
            saveDataFile: true,
            commentOnAlert: false,
            alertThreshold: 2.0,
            failOnAlert: true,
            alertCommentCcUsers: [],
            externalDataJsonPath: undefined,
            maxItemsInChart: null,
            failThreshold: 2.0,
        };

        function gitHistory(
            cfg: {
                dir?: string;
                autoPush?: boolean;
                token?: string | undefined;
                repository?: string | undefined;
            } = {},
        ): [GitFunc, unknown[]][] {
            const extraArgs: string[] = ['--git-dir=./.git', '--work-tree=.'];
            const dir = cfg.dir ?? 'data-dir';
            const token = 'token' in cfg ? cfg.token : 'dummy token';
            const repository = 'repository' in cfg ? cfg.repository : 'dummy repo';
            const autoPush = cfg.autoPush ?? true;
            const hist: Array<[GitFunc, unknown[]] | undefined> = [
                ['clone', [token, repository]],
                ['pull', [token, repository, extraArgs[0], extraArgs[1]]],
                ['checkout', ['gh-pages', extraArgs[0], extraArgs[1]]],
                ['add', [dir, extraArgs[0], extraArgs[1]]],
                ['commit', ['add Test benchmark google benchmark result for current commit id'].concat(extraArgs)],
                autoPush ? ['push', [token, repository, extraArgs[0], extraArgs[1]]] : undefined,
                autoPush ? ['reset', [extraArgs[0], extraArgs[1]]] : undefined,
            ];
            return hist.filter((x: [GitFunc, unknown[]] | undefined): x is [GitFunc, unknown[]] => x !== undefined);
        }

        const normalCases: Array<{
            it: string;
            config: Config;
            added: Benchmark;
            gitHistory: [GitFunc, unknown[]][];
            privateRepo?: boolean;
            error?: string[];
        }> = [
            {
                it: 'appends new data',
                config: defaultCfg,
                added: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    benches: [bench('bench_fib_10', 135)],
                },
                gitHistory: gitHistory(),
            },
        ];

        for (const t of normalCases) {
            it(t.it, async function() {
                if (t.privateRepo) {
                    gitHubContext.payload.repository = gitHubContext.payload.repository
                        ? { ...gitHubContext.payload.repository, private: true }
                        : null;
                }

                const originalDataJs = path.join(t.config.benchmarkDataDirPath, 'original_data.js');
                const dataJs = path.join(t.config.benchmarkDataDirPath, 'data.js');
                const indexHtml = path.join(t.config.benchmarkDataDirPath, 'index.html');

                if (await isFile(originalDataJs)) {
                    await fs.copyFile(originalDataJs, dataJs);
                }

                let indexHtmlBefore = null;
                try {
                    indexHtmlBefore = await fs.readFile(indexHtml);
                } catch (_) {
                    // Ignore
                }

                let caughtError: Error | null = null;
                const beforeData = await loadDataJs(path.join(t.config.benchmarkDataDirPath, 'data.js'));
                const beforeDate = Date.now();
                try {
                    await writeBenchmark(t.added, t.config);
                } catch (err) {
                    if (t.error === undefined) {
                        throw err;
                    }
                    caughtError = err;
                }

                if (t.error) {
                    ok(caughtError);
                    const expected = t.error.join('\n');
                    eq(expected, caughtError.message);
                    return;
                }

                // Post condition checks for success cases

                const afterDate = Date.now();

                eq(t.gitHistory, gitSpy.history);

                ok(await isDir(t.config.benchmarkDataDirPath));
                ok(await isFile(path.join(t.config.benchmarkDataDirPath, 'index.html')));
                ok(await isFile(dataJs));

                const data = await loadDataJs(path.join(t.config.benchmarkDataDirPath, 'data.js'));
                ok(data);

                eq(typeof data.lastUpdate, 'number');
                ok(
                    beforeDate <= data.lastUpdate && data.lastUpdate <= afterDate,
                    `Should be ${beforeDate} <= ${data.lastUpdate} <= ${afterDate}`,
                );
                ok(data.entries[t.config.name]);
                const len = data.entries[t.config.name].length;
                ok(len > 0);
                eq(data.entries[t.config.name][len - 1], t.added); // Check last item is the newest

                if (beforeData !== null) {
                    eq(beforeData.repoUrl, data.repoUrl);
                    for (const name of Object.keys(beforeData.entries)) {
                        if (name === t.config.name) {
                            eq(beforeData.entries[name], data.entries[name].slice(0, -1)); // New data was appended
                        } else {
                            eq(beforeData.entries[name], data.entries[name]);
                        }
                    }
                }

                if (indexHtmlBefore !== null) {
                    const indexHtmlAfter = await fs.readFile(indexHtml);
                    eq(indexHtmlBefore, indexHtmlAfter); // If index.html is already existing, do not touch it
                }
            });
        }
    });
});
