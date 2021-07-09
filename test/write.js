"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const path = __importStar(require("path"));
const fs_1 = require("fs");
const cheerio = __importStar(require("cheerio"));
const markdownit = require("markdown-it");
const mock = require("mock-require");
const rimraf = require("rimraf");
const ok = assert_1.ok;
class FakedOctokitRepos {
    constructor() {
        this.spyOpts = [];
    }
    createCommitComment(opt) {
        this.spyOpts.push(opt);
        return Promise.resolve({
            status: 201,
            data: {
                html_url: 'https://dummy-comment-url',
            },
        });
    }
    lastCall() {
        return this.spyOpts[this.spyOpts.length - 1];
    }
    clear() {
        this.spyOpts = [];
    }
}
const fakedRepos = new FakedOctokitRepos();
class FakedOctokit {
    constructor(token) {
        this.opt = { token };
        this.repos = fakedRepos;
    }
}
class GitSpy {
    constructor() {
        this.history = [];
        this.pushFailure = null;
        this.pushFailureCount = 0;
    }
    call(func, args) {
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
        },
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
    async add(...args) {
        gitSpy.call('add', args);
        return '';
    },
    async cmd(...args) {
        gitSpy.call('cmd', args);
        return '';
    },
    async clone(...args) {
        gitSpy.call('clone', args);
        return '';
    },
    async checkout(...args) {
        gitSpy.call('checkout', args);
        return '';
    },
    async commit(...args) {
        gitSpy.call('commit', args);
        return '';
    },
    async currentBranch(...args) {
        gitSpy.call('currentBranch', args);
        return '';
    },
    async push(...args) {
        gitSpy.call('push', args);
        gitSpy.mayFailPush(); // For testing retry
        return '';
    },
    async pull(...args) {
        gitSpy.call('pull', args);
        return '';
    },
    async reset(...args) {
        gitSpy.call('reset', args);
        return '';
    },
});
const writeBenchmark = require('../src/write').writeBenchmark;
describe('writeBenchmark()', function () {
    const savedCwd = process.cwd();
    before(function () {
        process.chdir(path.join(__dirname, 'data', 'write'));
    });
    after(function () {
        mock.stop('@actions/core');
        mock.stop('@actions/github');
        mock.stop('../src/git');
        process.chdir(savedCwd);
    });
    afterEach(function () {
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
    function bench(name, value, range = '± 20', unit = 'ns/iter') {
        return {
            name,
            range,
            unit,
            value,
        };
    }
    context('with external json file', function () {
        const dataJson = 'data.json';
        const defaultCfg = {
            name: 'Test benchmark',
            outputFilePath: 'dummy',
            ghBranch: 'dummy',
            ghRepository: undefined,
            benchmarkDataDirPath: 'dummy',
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
        afterEach(async function () {
            try {
                await fs_1.promises.unlink(dataJson);
            }
            catch (_) {
                // Ignore
            }
            gitHubContext.payload.repository = savedRepository;
        });
        const md2html = markdownit();
        const normalCases = [
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
            it(t.it, async function () {
                if (t.repoPayload !== undefined) {
                    gitHubContext.payload.repository = t.repoPayload;
                }
                if (t.data !== null) {
                    await fs_1.promises.writeFile(dataJson, JSON.stringify(t.data), 'utf8');
                }
                let caughtError = null;
                try {
                    await writeBenchmark(t.added, t.config);
                }
                catch (err) {
                    if (!t.error && !t.commitComment) {
                        throw err;
                    }
                    caughtError = err;
                }
                const json = JSON.parse(await fs_1.promises.readFile(dataJson, 'utf8'));
                assert_1.deepStrictEqual(typeof json.lastUpdate, 'number');
                ok(json.entries[t.config.name]);
                const len = json.entries[t.config.name].length;
                ok(len > 0);
                assert_1.deepStrictEqual(json.entries[t.config.name][len - 1], t.added); // Check last item is the newest
                if (t.data !== null) {
                    ok(json.lastUpdate > t.data.lastUpdate);
                    assert_1.deepStrictEqual(json.repoUrl, t.data.repoUrl);
                    for (const name of Object.keys(t.data.entries)) {
                        const entries = t.data.entries[name];
                        if (name === t.config.name) {
                            if (t.config.maxItemsInChart === null || len < t.config.maxItemsInChart) {
                                assert_1.deepStrictEqual(len, entries.length + 1, name);
                                // Check benchmark data except for the last appended one are not modified
                                assert_1.deepStrictEqual(json.entries[name].slice(0, -1), entries, name);
                            }
                            else {
                                // When data items was truncated due to max-items-in-chart
                                assert_1.deepStrictEqual(len, entries.length, name); // Number of items did not change because first item was shifted
                                assert_1.deepStrictEqual(json.entries[name].slice(0, -1), entries.slice(1), name);
                            }
                        }
                        else {
                            assert_1.deepStrictEqual(json.entries[name], entries, name);
                        }
                    }
                }
                if (t.error) {
                    ok(caughtError);
                    const expected = t.error.join('\n');
                    assert_1.deepStrictEqual(expected, caughtError.message);
                }
                if (t.commitComment !== undefined) {
                    ok(caughtError);
                    // Last line is appended only for failure message
                    const messageLines = caughtError.message.split('\n');
                    ok(messageLines.length > 0);
                    const expectedMessage = messageLines.slice(0, -1).join('\n');
                    ok(fakedRepos.spyOpts.length > 0, `len: ${fakedRepos.spyOpts.length}, caught: ${caughtError.message}`);
                    const opts = fakedRepos.lastCall();
                    assert_1.deepStrictEqual(opts.owner, 'user');
                    assert_1.deepStrictEqual(opts.repo, 'repo');
                    assert_1.deepStrictEqual(opts.commit_sha, 'current commit id');
                    assert_1.deepStrictEqual(opts.body, expectedMessage);
                    const commentLine = messageLines[messageLines.length - 1];
                    assert_1.deepStrictEqual(commentLine, t.commitComment);
                    // Check the body is a correct markdown document by markdown parser
                    // Validate markdown content via HTML
                    // TODO: Use Markdown AST instead of DOM API
                    const html = md2html.render(opts.body);
                    const query = cheerio.load(html);
                    const h1 = query('h1');
                    assert_1.deepStrictEqual(h1.length, 1);
                    assert_1.deepStrictEqual(h1.text(), ':warning: Performance Alert :warning:');
                    const tr = query('tbody tr');
                    assert_1.deepStrictEqual(tr.length, t.added.benches.length);
                    const a = query('a');
                    assert_1.deepStrictEqual(a.length, 2);
                    const workflowLink = a.first();
                    assert_1.deepStrictEqual(workflowLink.text(), 'workflow');
                    const workflowUrl = workflowLink.attr('href');
                    ok(workflowUrl === null || workflowUrl === void 0 ? void 0 : workflowUrl.startsWith(json.repoUrl), workflowUrl);
                    const actionLink = a.last();
                    assert_1.deepStrictEqual(actionLink.text(), 'github-action-benchmark');
                    assert_1.deepStrictEqual(actionLink.attr('href'), 'https://github.com/marketplace/actions/continuous-benchmark');
                }
            });
        }
    });
    // Tests for updating GitHub branch
    context('with gh-pages branch', function () {
        beforeEach(async function () {
            global.window = {}; // Fake window object on browser
        });
        afterEach(async function () {
            gitSpy.clear();
            delete global.window;
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
        async function isFile(p) {
            try {
                const s = await fs_1.promises.stat(p);
                return s.isFile();
            }
            catch (_) {
                return false;
            }
        }
        async function isDir(p) {
            try {
                const s = await fs_1.promises.stat(p);
                return s.isDirectory();
            }
            catch (_) {
                return false;
            }
        }
        async function loadDataJs(dataDir) {
            const dataJs = path.join(dataDir, 'data.js');
            if (!(await isDir(dataDir)) || !(await isFile(dataJs))) {
                return null;
            }
            const dataSource = await fs_1.promises.readFile(dataJs, 'utf8');
            eval(dataSource);
            return global.window.BENCHMARK_DATA;
        }
        const defaultCfg = {
            name: 'Test benchmark',
            outputFilePath: 'dummy',
            ghBranch: 'gh-pages',
            ghRepository: 'dummy repo',
            benchmarkDataDirPath: 'data-dir',
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
        function gitHistory(cfg = {}) {
            var _a, _b;
            const extraArgs = ['--git-dir=./.git', '--work-tree=.'];
            const dir = (_a = cfg.dir) !== null && _a !== void 0 ? _a : 'data-dir';
            const token = 'token' in cfg ? cfg.token : 'dummy token';
            const repository = 'repository' in cfg ? cfg.repository : 'dummy repo';
            const autoPush = (_b = cfg.autoPush) !== null && _b !== void 0 ? _b : true;
            const hist = [
                ['clone', [token, repository]],
                ['pull', [token, repository, extraArgs[0], extraArgs[1]]],
                ['checkout', ['gh-pages', extraArgs[0], extraArgs[1]]],
                ['add', [dir, extraArgs[0], extraArgs[1]]],
                ['commit', ['add Test benchmark google benchmark result for current commit id'].concat(extraArgs)],
                autoPush ? ['push', [token, repository, extraArgs[0], extraArgs[1]]] : undefined,
                autoPush ? ['reset', [extraArgs[0], extraArgs[1]]] : undefined,
            ];
            return hist.filter((x) => x !== undefined);
        }
        const normalCases = [
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
            it(t.it, async function () {
                if (t.privateRepo) {
                    gitHubContext.payload.repository = gitHubContext.payload.repository
                        ? { ...gitHubContext.payload.repository, private: true }
                        : null;
                }
                const originalDataJs = path.join(t.config.benchmarkDataDirPath, 'original_data.js');
                const dataJs = path.join(t.config.benchmarkDataDirPath, 'data.js');
                const indexHtml = path.join(t.config.benchmarkDataDirPath, 'index.html');
                if (await isFile(originalDataJs)) {
                    await fs_1.promises.copyFile(originalDataJs, dataJs);
                }
                let indexHtmlBefore = null;
                try {
                    indexHtmlBefore = await fs_1.promises.readFile(indexHtml);
                }
                catch (_) {
                    // Ignore
                }
                let caughtError = null;
                const beforeData = await loadDataJs(path.join(t.config.benchmarkDataDirPath, 'data.js'));
                const beforeDate = Date.now();
                try {
                    await writeBenchmark(t.added, t.config);
                }
                catch (err) {
                    if (t.error === undefined) {
                        throw err;
                    }
                    caughtError = err;
                }
                if (t.error) {
                    ok(caughtError);
                    const expected = t.error.join('\n');
                    assert_1.deepStrictEqual(expected, caughtError.message);
                    return;
                }
                // Post condition checks for success cases
                const afterDate = Date.now();
                assert_1.deepStrictEqual(t.gitHistory, gitSpy.history);
                ok(await isDir(t.config.benchmarkDataDirPath));
                ok(await isFile(path.join(t.config.benchmarkDataDirPath, 'index.html')));
                ok(await isFile(dataJs));
                const data = await loadDataJs(path.join(t.config.benchmarkDataDirPath, 'data.js'));
                ok(data);
                assert_1.deepStrictEqual(typeof data.lastUpdate, 'number');
                ok(beforeDate <= data.lastUpdate && data.lastUpdate <= afterDate, `Should be ${beforeDate} <= ${data.lastUpdate} <= ${afterDate}`);
                ok(data.entries[t.config.name]);
                const len = data.entries[t.config.name].length;
                ok(len > 0);
                assert_1.deepStrictEqual(data.entries[t.config.name][len - 1], t.added); // Check last item is the newest
                if (beforeData !== null) {
                    assert_1.deepStrictEqual(beforeData.repoUrl, data.repoUrl);
                    for (const name of Object.keys(beforeData.entries)) {
                        if (name === t.config.name) {
                            assert_1.deepStrictEqual(beforeData.entries[name], data.entries[name].slice(0, -1)); // New data was appended
                        }
                        else {
                            assert_1.deepStrictEqual(beforeData.entries[name], data.entries[name]);
                        }
                    }
                }
                if (indexHtmlBefore !== null) {
                    const indexHtmlAfter = await fs_1.promises.readFile(indexHtml);
                    assert_1.deepStrictEqual(indexHtmlBefore, indexHtmlAfter); // If index.html is already existing, do not touch it
                }
            });
        }
    });
});
//# sourceMappingURL=write.js.map