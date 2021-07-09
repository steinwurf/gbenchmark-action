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
const path = __importStar(require("path"));
const assert_1 = require("assert");
const mock = require("mock-require");
const dummyWebhookPayload = {
    // eslint-disable-next-line @typescript-eslint/camelcase
    head_commit: {
        author: null,
        committer: null,
        id: '123456789abcdef',
        message: 'this is dummy',
        timestamp: 'dummy timestamp',
        url: 'https://github.com/dummy/repo',
    },
};
const dummyGitHubContext = {
    payload: dummyWebhookPayload,
};
mock('@actions/github', { context: dummyGitHubContext });
const { extractResult } = require('../src/extract');
describe('extractResult()', function () {
    after(function () {
        mock.stop('@actions/github');
    });
    afterEach(function () {
        dummyGitHubContext.payload = dummyWebhookPayload;
    });
    const normalCases = [
        {
            expected: [
                {
                    extra: 'iterations: 3070566\ncpu: 213.65507206163295 ns\nthreads: 1',
                    name: 'fib_10',
                    unit: 'ns/iter',
                    value: 214.98980114547953,
                },
                {
                    extra: 'iterations: 23968\ncpu: 27364.90320427236 ns\nthreads: 1',
                    name: 'fib_20',
                    unit: 'ns/iter',
                    value: 27455.600415007055,
                },
            ],
        },
    ];
    for (const test of normalCases) {
        it('extracts benchmark output from google benchmark', async function () {
            var _a;
            const file = (_a = test.file) !== null && _a !== void 0 ? _a : `googlecpp_output.txt`;
            const outputFilePath = path.join(__dirname, 'data', 'extract', file);
            const config = {
                outputFilePath,
            };
            const bench = await extractResult(config);
            assert_1.strict.equal(bench.commit, dummyWebhookPayload.head_commit);
            assert_1.strict.ok(bench.date <= Date.now(), bench.date.toString());
            assert_1.strict.deepEqual(test.expected, bench.benches);
        });
    }
    it('raises an error when output file is not readable', async function () {
        const config = {
            outputFilePath: 'path/does/not/exist.txt',
        };
        await assert_1.strict.rejects(extractResult(config));
    });
    const toolSpecificErrorCases = [
        ...['googlecpp'].map(tool => ({
            it: `raises an error when output file is not in JSON with google benchmark`,
            tool,
            file: 'non_json.txt',
            expected: /must be JSON file/,
        })),
    ];
    for (const t of toolSpecificErrorCases) {
        it(t.it, async function () {
            // Note: go_output.txt is not in JSON format!
            const outputFilePath = path.join(__dirname, 'data', 'extract', t.file);
            const config = { outputFilePath };
            await assert_1.strict.rejects(extractResult(config), t.expected);
        });
    }
    it('collects the commit information from pull_request payload as fallback', async function () {
        dummyGitHubContext.payload = {
            pull_request: {
                title: 'this is title',
                html_url: 'https://github.com/dummy/repo/pull/1',
                head: {
                    sha: 'abcdef0123456789',
                    user: {
                        login: 'user',
                    },
                    repo: {
                        updated_at: 'repo updated at timestamp',
                    },
                },
            },
        };
        const outputFilePath = path.join(__dirname, 'data', 'extract', 'googlecpp_output.txt');
        const config = {
            outputFilePath,
        };
        const { commit } = await extractResult(config);
        const expectedUser = {
            name: 'user',
            username: 'user',
        };
        assert_1.strict.deepEqual(commit.author, expectedUser);
        assert_1.strict.deepEqual(commit.committer, expectedUser);
        assert_1.strict.equal(commit.id, 'abcdef0123456789');
        assert_1.strict.equal(commit.message, 'this is title');
        assert_1.strict.equal(commit.timestamp, 'repo updated at timestamp');
        assert_1.strict.equal(commit.url, 'https://github.com/dummy/repo/pull/1/commits/abcdef0123456789');
    });
    it('raises an error when commit information is not found in webhook payload', async function () {
        dummyGitHubContext.payload = {};
        const outputFilePath = path.join(__dirname, 'data', 'extract', 'googlecpp_output.txt');
        const config = {
            outputFilePath,
        };
        await assert_1.strict.rejects(extractResult(config), /^Error: No commit information is found in payload/);
    });
});
//# sourceMappingURL=extract.js.map