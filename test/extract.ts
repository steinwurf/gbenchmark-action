import * as path from 'path';
import { strict as A } from 'assert';
import mock = require('mock-require');
import { BenchmarkResult } from '../src/extract';

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
} as { [key: string]: any };
const dummyGitHubContext = {
    payload: dummyWebhookPayload,
};

mock('@actions/github', { context: dummyGitHubContext });

const { extractResult } = require('../src/extract');

describe('extractResult()', function() {
    after(function() {
        mock.stop('@actions/github');
    });

    afterEach(function() {
        dummyGitHubContext.payload = dummyWebhookPayload;
    });

    const normalCases: Array<{
        expected: BenchmarkResult[];
        file?: string;
    }> = [
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
        it('extracts benchmark output from google benchmark', async function() {
            const file = test.file ?? `googlecpp_output.txt`;
            const outputFilePath = path.join(__dirname, 'data', 'extract', file);
            const config = {
                outputFilePath,
            };
            const bench = await extractResult(config);

            A.equal(bench.commit, dummyWebhookPayload.head_commit);
            A.ok(bench.date <= Date.now(), bench.date.toString());
            A.deepEqual(test.expected, bench.benches);
        });
    }

    it('raises an error when output file is not readable', async function() {
        const config = {
            outputFilePath: 'path/does/not/exist.txt',
        };
        await A.rejects(extractResult(config));
    });

    const toolSpecificErrorCases: Array<{
        it: string;
        file: string;
        expected: RegExp;
    }> = [
        ...(['googlecpp'] as const).map(tool => ({
            it: `raises an error when output file is not in JSON with google benchmark`,
            tool,
            file: 'non_json.txt',
            expected: /must be JSON file/,
        })),
    ];

    for (const t of toolSpecificErrorCases) {
        it(t.it, async function() {
            // Note: go_output.txt is not in JSON format!
            const outputFilePath = path.join(__dirname, 'data', 'extract', t.file);
            const config = { outputFilePath };
            await A.rejects(extractResult(config), t.expected);
        });
    }

    it('collects the commit information from pull_request payload as fallback', async function() {
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
        A.deepEqual(commit.author, expectedUser);
        A.deepEqual(commit.committer, expectedUser);
        A.equal(commit.id, 'abcdef0123456789');
        A.equal(commit.message, 'this is title');
        A.equal(commit.timestamp, 'repo updated at timestamp');
        A.equal(commit.url, 'https://github.com/dummy/repo/pull/1/commits/abcdef0123456789');
    });

    it('raises an error when commit information is not found in webhook payload', async function() {
        dummyGitHubContext.payload = {};
        const outputFilePath = path.join(__dirname, 'data', 'extract', 'googlecpp_output.txt');
        const config = {
            outputFilePath,
        };
        await A.rejects(extractResult(config), /^Error: No commit information is found in payload/);
    });
});
