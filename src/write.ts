import { promises as fs } from 'fs';
import * as path from 'path';
import * as io from '@actions/io';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as git from './git';
import { Benchmark, BenchmarkResult } from './extract';
import { Config } from './config';
import { DEFAULT_INDEX_HTML } from './default_index_html';

export type BenchmarkSuites = { [name: string]: Benchmark[] };
export interface DataJson {
    lastUpdate: number;
    repoUrl: string;
    entries: BenchmarkSuites;
}

export const SCRIPT_PREFIX = 'window.BENCHMARK_DATA = ';
const DEFAULT_DATA_JSON = {
    lastUpdate: 0,
    repoUrl: '',
    entries: {},
};

async function loadDataJs(dataPath: string): Promise<DataJson> {
    try {
        const script = await fs.readFile(dataPath, 'utf8');
        const json = script.slice(SCRIPT_PREFIX.length);
        const parsed = JSON.parse(json);
        core.debug(`Loaded data.js at ${dataPath}`);
        return parsed;
    } catch (err) {
        console.log(`Could not find data.js at ${dataPath}. Using empty default: ${err}`);
        return { ...DEFAULT_DATA_JSON };
    }
}

async function storeDataJs(dataPath: string, data: DataJson) {
    const script = SCRIPT_PREFIX + JSON.stringify(data, null, 2);
    await fs.writeFile(dataPath, script, 'utf8');
    core.debug(`Overwrote ${dataPath} for adding new data`);
}

async function addIndexHtmlIfNeeded(dir: string) {
    const indexHtml = path.join(dir, 'index.html');
    try {
        await fs.stat(indexHtml);
        core.debug(`Skipped to create default index.html since it is already existing: ${indexHtml}`);
        return;
    } catch (_) {
        // Continue
    }

    await fs.writeFile(indexHtml, DEFAULT_INDEX_HTML, 'utf8');
}

function biggerIsBetter(): boolean {
    return false;
}

interface Alert {
    current: BenchmarkResult;
    prev: BenchmarkResult;
    ratio: number;
}

function findAlerts(
    curSuite: Benchmark,
    prevSuite: Benchmark,
    threshold: number,
    checkHostName: boolean,
    withRepetitions: boolean,
): Alert[] {
    core.debug(`Comparing current:${curSuite.commit.id} and prev:${prevSuite.commit.id} for alert`);

    const alerts = [];
    if (checkHostName && curSuite.host_name !== prevSuite.host_name) {
        throw new Error(
            `The current and previous benchmarks were not run on the same machine: ${curSuite.host_name} != ${prevSuite.host_name}`,
        );
    }
    const names: string[] = [];
    for (const current of curSuite.benches) {
        const prev = prevSuite.benches.find((b) => {
            if (withRepetitions) {
                if (
                    current.name.endsWith('_mean') ||
                    current.name.endsWith('_median') ||
                    current.name.endsWith('_stddev')
                ) {
                    return false;
                }
            }
            return b.name === current.name;
        });

        if (prev === undefined) {
            core.debug(`Skipped because benchmark '${current.name}' is not found in previous benchmarks`);
            continue;
        }
        let ratio = 0;

        if (withRepetitions) {
            if (names.includes(current.name)) {
                continue;
            }
            let curMin = 0;
            let prevMin = 0;
            let curMinIndex = 0;
            let prevMinIndex = 0;

            core.debug('adding ' + current.name + ' to the list of names to ignore');
            names.push(current.name);
            const curIndex = curSuite.benches.indexOf(current);
            const prevIndex = prevSuite.benches.indexOf(prev);
            const curRepetitions = current.repetitions;
            const prevRepetitions = prev.repetitions;

            const repeatedCurBenches = curSuite.benches.slice(curIndex, curIndex + curRepetitions);
            const repeatedPrevBenches = prevSuite.benches.slice(prevIndex, prevIndex + prevRepetitions);

            const curTimes: number[] = [];
            const prevTimes: number[] = [];
            for (let i = 0; i < curRepetitions + 1; i++) {
                curTimes.push(repeatedCurBenches[i].value);
            }
            for (let i = 0; i < prevRepetitions; i++) {
                prevTimes.push(repeatedPrevBenches[i].value);
            }
            curMin = Math.min(...curTimes);
            prevMin = Math.min(...prevTimes);
            const minIndices = [curTimes.indexOf(curMin), prevTimes.indexOf(prevMin)];
            curMinIndex = curSuite.benches.indexOf(repeatedCurBenches[minIndices[0]]);
            prevMinIndex = prevSuite.benches.indexOf(repeatedCurBenches[minIndices[0]]);

            ratio = biggerIsBetter()
                ? prevMin / curMin // e.g. current=100, prev=200
                : curMin / prevMin; // e.g. current=200, prev=100

            if (ratio > threshold) {
                core.warning(
                    `Performance alert! Previous minimum value was ${prevMin} and current minimum value is ${curMin}.` +
                        ` It is ${ratio}x worse than previous exceeding a ratio threshold ${threshold}`,
                );
                const curMinBench = curSuite.benches[curMinIndex];
                const prevMinBench = prevSuite.benches[prevMinIndex];
                alerts.push({ current: curMinBench, prev: prevMinBench, ratio });
            }
        } else {
            ratio = biggerIsBetter()
                ? prev.value / current.value // e.g. current=100, prev=200
                : current.value / prev.value; // e.g. current=200, prev=100

            if (ratio > threshold) {
                core.warning(
                    `Performance alert! Previous value was ${prev.value} and current value is ${current.value}.` +
                        ` It is ${ratio}x worse than previous exceeding a ratio threshold ${threshold}`,
                );
                alerts.push({ current, prev, ratio });
            }
        }
    }

    return alerts;
}

function getCurrentRepo() {
    const repo = github.context.payload.repository;
    if (!repo) {
        throw new Error(
            `Repository information is not available in payload: ${JSON.stringify(github.context.payload, null, 2)}`,
        );
    }
    return repo;
}

function floatStr(n: number) {
    if (Number.isInteger(n)) {
        return n.toFixed(0);
    }

    if (n > 0.1) {
        return n.toFixed(2);
    }

    return n.toString();
}

function strVal(b: BenchmarkResult): string {
    let s = `\`${b.value}\` ${b.unit}`;
    if (b.range) {
        s += ` (\`${b.range}\`)`;
    }
    return s;
}

function commentFooter(): string {
    const repo = getCurrentRepo();
    const repoUrl = repo.html_url ?? '';
    const actionUrl = repoUrl + '/actions?query=workflow%3A' + encodeURIComponent(github.context.workflow);

    return `This comment was automatically generated by [workflow](${actionUrl}) using [github-action-benchmark](https://github.com/marketplace/actions/continuous-benchmark).`;
}

function buildComment(benchName: string, curSuite: Benchmark, prevSuite: Benchmark): string {
    const lines = [
        `# ${benchName}`,
        '',
        '<details>',
        '',
        `| Benchmark suite | Current: ${curSuite.commit.id} | Previous: ${prevSuite.commit.id} | Ratio |`,
        '|-|-|-|-|',
    ];

    for (const current of curSuite.benches) {
        let line;
        const prev = prevSuite.benches.find((i) => i.name === current.name);

        if (prev) {
            const ratio = biggerIsBetter()
                ? prev.value / current.value // e.g. current=100, prev=200
                : current.value / prev.value;

            line = `| \`${current.name}\` | ${strVal(current)} | ${strVal(prev)} | \`${floatStr(ratio)}\` |`;
        } else {
            line = `| \`${current.name}\` | ${strVal(current)} | | |`;
        }

        lines.push(line);
    }

    // Footer
    lines.push('', '</details>', '', commentFooter());

    return lines.join('\n');
}

function buildAlertComment(
    alerts: Alert[],
    benchName: string,
    curSuite: Benchmark,
    prevSuite: Benchmark,
    threshold: number,
    cc: string[],
): string {
    // Do not show benchmark name if it is the default value 'Benchmark'.
    const benchmarkText = benchName === 'Benchmark' ? '' : ` **'${benchName}'**`;
    const title = threshold === 0 ? '# Performance Report' : '# :warning: **Performance Alert** :warning:';
    const thresholdString = floatStr(threshold);
    const lines = [
        title,
        '',
        `Possible performance regression was detected for benchmark${benchmarkText}.`,
        `Benchmark result of this commit is worse than the previous benchmark result exceeding threshold \`${thresholdString}\`.`,
        '',
        `| Benchmark suite | Current: ${curSuite.commit.id} | Previous: ${prevSuite.commit.id} | Ratio |`,
        '|-|-|-|-|',
    ];

    for (const alert of alerts) {
        const { current, prev, ratio } = alert;
        const line = `| \`${current.name}\` | ${strVal(current)} | ${strVal(prev)} | \`${floatStr(ratio)}\` |`;
        lines.push(line);
    }

    // Footer
    lines.push('', commentFooter());

    if (cc.length > 0) {
        lines.push('', `CC: ${cc.join(' ')}`);
    }

    return lines.join('\n');
}

async function leaveComment(commitId: string, body: string, token: string) {
    core.debug('Sending comment:\n' + body);

    const repo = getCurrentRepo();

    const repoUrl = repo.html_url ?? '';
    const client = new github.GitHub(token);
    const res = await client.repos.createCommitComment({
        owner: repo.owner.login,
        repo: repo.name,

        commit_sha: commitId,
        body,
    });

    const commitUrl = `${repoUrl}/commit/${commitId}`;
    console.log(`Comment was sent to ${commitUrl}. Response:`, res.status, res.data);

    return res;
}

async function handleComment(benchName: string, curSuite: Benchmark, prevSuite: Benchmark, config: Config) {
    const { commentAlways, githubToken } = config;

    if (!commentAlways) {
        core.debug('Comment check was skipped because comment-always is disabled');
        return;
    }

    if (!githubToken) {
        throw new Error("'comment-always' input is set but 'github-token' input is not set");
    }

    core.debug('Commenting about benchmark comparison');

    const body = buildComment(benchName, curSuite, prevSuite);

    await leaveComment(curSuite.commit.id, body, githubToken);
}

async function handleAlert(benchName: string, curSuite: Benchmark, prevSuite: Benchmark, config: Config) {
    const {
        withRepetitions,
        alertThreshold,
        githubToken,
        commentOnAlert,
        failOnAlert,
        alertCommentCcUsers,
        failThreshold,
        checkHostName,
    } = config;

    if (!commentOnAlert && !failOnAlert) {
        core.debug('Alert check was skipped because both comment-on-alert and fail-on-alert were disabled');
        return;
    }

    const alerts = findAlerts(curSuite, prevSuite, alertThreshold, checkHostName, withRepetitions);
    if (alerts.length === 0) {
        core.debug('No performance alert found happily');
        return;
    }

    core.debug(`Found ${alerts.length} alerts`);
    const body = buildAlertComment(alerts, benchName, curSuite, prevSuite, alertThreshold, alertCommentCcUsers);
    let message = body;
    let url = null;

    if (commentOnAlert) {
        if (!githubToken) {
            throw new Error("'comment-on-alert' input is set but 'github-token' input is not set");
        }
        const res = await leaveComment(curSuite.commit.id, body, githubToken);

        url = res.data.html_url;
        message = body + `\nComment was generated at ${url}`;
    }

    if (failOnAlert) {
        // Note: alertThreshold is smaller than failThreshold. It was checked in config.ts
        const len = alerts.length;
        const threshold = floatStr(failThreshold);
        const failures = alerts.filter((a) => a.ratio > failThreshold);
        if (failures.length > 0) {
            core.debug('Mark this workflow as fail since one or more fatal alerts found');
            if (failThreshold !== alertThreshold) {
                // Prepend message that explains how these alerts were detected with different thresholds
                message = `${failures.length} of ${len} alerts exceeded the failure threshold \`${threshold}\` specified by fail-threshold input:\n\n${message}`;
            }
            throw new Error(message);
        } else {
            core.debug(
                `${len} alerts exceeding the alert threshold ${alertThreshold} were found but` +
                    ` all of them did not exceed the failure threshold ${threshold}`,
            );
        }
    }
}

function addBenchmarkToDataJson(
    benchName: string,
    bench: Benchmark,
    data: DataJson,
    maxItems: number | null,
): Benchmark | null {
    const htmlUrl = github.context.payload.repository?.html_url ?? '';

    let prevBench: Benchmark | null = null;
    data.lastUpdate = Date.now();
    data.repoUrl = htmlUrl;

    // Add benchmark result
    if (data.entries[benchName] === undefined) {
        data.entries[benchName] = [bench];
        core.debug(`No suite was found for benchmark '${benchName}' in existing data. Created`);
    } else {
        const suites = data.entries[benchName];
        // Get last suite which has different commit ID for alert comment
        for (const e of suites.slice().reverse()) {
            if (e.commit.id !== bench.commit.id) {
                prevBench = e;
                break;
            }
        }

        suites.push(bench);

        if (maxItems !== null && suites.length > maxItems) {
            suites.splice(0, suites.length - maxItems);
            core.debug(
                `Number of data items for '${benchName}' was truncated to ${maxItems} due to max-items-in-charts`,
            );
        }
    }

    return prevBench;
}

function isRemoteRejectedError(err: unknown) {
    if (err instanceof Error) {
        return ['[remote rejected]', '[rejected]'].some((l) => err.message.includes(l));
    }
    return false;
}
async function shouldAutoPush(
    githubToken: string | undefined,
    autoPush: boolean,
    autoPushFilter: string,
): Promise<boolean> {
    if (!githubToken) {
        core.debug(`Auto-push is skipped because it requires 'github-token' input`);
        return false;
    }
    if (!autoPush) {
        core.debug(`Auto-push is skipped because it requires 'auto-push: true'`);
        return false;
    }
    if (autoPushFilter) {
        const branch = await git.currentBranch();
        core.debug(`Comparing characters of current branch and auto-push-filter...`);
        let result;
        if (branch.trim().length === autoPushFilter.trim().length) {
            for (let i = 0; i < branch.trim().length; i++) {
                core.debug(`${branch.trim()[i]} : ${autoPushFilter.trim()[i]}`);
                if (branch.trim()[i] !== autoPushFilter.trim()[i]) {
                    core.debug(
                        `character ${i} of branch and auto-push-filter do not match (${branch.trim()[i]} !== ${
                            autoPushFilter.trim()[i]
                        })`,
                    );
                    result = false;
                    break;
                }
            }
            if (result !== false) {
                result = true;
            }
        } else {
            result = false;
        }
        core.debug(`result is ${result}`);
        if (!result) {
            core.debug(
                `Auto-push is skipped because auto-push-filter and current branch does not match (${branch} != ${autoPushFilter})`,
            );
        }
        return result;
    }
    // If no autoPushFilter we always push.
    return true;
}
async function writeBenchmarkToGitHubWithRetry(
    bench: Benchmark,
    config: Config,
    retry: number,
): Promise<Benchmark | null> {
    const {
        name,
        ghBranch,
        ghRepository,
        benchmarkDataDirPath,
        githubToken,
        autoPush,
        autoPushFilter,
        maxItemsInChart,
    } = config;

    const benchmarkBaseDir: string = path.dirname(benchmarkDataDirPath);
    let extraGitArguments: string[] = [];
    if (ghRepository) {
        extraGitArguments = ['--git-dir=' + benchmarkBaseDir + '/.git', '--work-tree=' + benchmarkBaseDir];
    } else {
        extraGitArguments = [];
    }

    if (ghRepository) {
        if (await io.which(benchmarkBaseDir)) {
            core.debug(`Benchmark directory already exists. Removing it...`);
            await io.rmRF(benchmarkBaseDir);
        }
        await git.clone(githubToken, ghRepository);
        await git.pull(githubToken, ghRepository, ...extraGitArguments);
    }
    await git.checkout(ghBranch, ...extraGitArguments);

    if (!(await io.which(benchmarkDataDirPath))) {
        await io.mkdirP(benchmarkDataDirPath);
        core.debug(`'${benchmarkDataDirPath}' does not exist. Created it`);
    }
    const data = await loadDataJs(path.join(benchmarkDataDirPath, 'data.js'));
    const prevBench = addBenchmarkToDataJson(name, bench, data, maxItemsInChart);

    await storeDataJs(path.join(benchmarkDataDirPath, 'data.js'), data);
    await addIndexHtmlIfNeeded(benchmarkDataDirPath);
    await git.add(benchmarkDataDirPath, ...extraGitArguments);
    await git.commit(`add ${name} google benchmark result for ${bench.commit.id}`, ...extraGitArguments);
    if (await shouldAutoPush(githubToken, autoPush, autoPushFilter)) {
        try {
            await git.push(githubToken, ghRepository, ...extraGitArguments);
            core.debug(
                `Automatically pushed the generated commit to ${ghBranch} branch since 'auto-push' is set to true`,
            );
        } catch (err) {
            if (!isRemoteRejectedError(err)) {
                throw err;
            }
            // Fall through

            core.warning(`Auto-push failed because the remote ${ghBranch} was updated after git pull`);

            if (retry > 0) {
                core.debug('Rollback the auto-generated commit before retry');
                await git.reset(...extraGitArguments);

                core.warning(
                    `Retrying to generate a commit and push to remote ${ghBranch} with retry count ${retry}...`,
                );
                return await writeBenchmarkToGitHubWithRetry(bench, config, retry - 1); // Recursively retry
            } else {
                core.warning(`Failed to add benchmark data to '${name}' data: ${JSON.stringify(bench)}`);
                throw new Error(
                    `Auto-push failed 3 times since the remote branch ${ghBranch} rejected pushing all the time. Last exception was: ${err.message}`,
                );
            }
        }
    } else {
        core.debug(
            `Auto-push to ${ghBranch} is skipped because it requires both 'github-token' and 'auto-push' inputs`,
        );
    }

    return prevBench;
}

async function writeBenchmarkToGitHub(bench: Benchmark, config: Config): Promise<Benchmark | null> {
    try {
        return await writeBenchmarkToGitHubWithRetry(bench, config, 10);
    } finally {
        // `git switch` does not work for backing to detached head
        core.debug('Finished writing benchmark to branch.');
    }
}

async function loadDataJson(jsonPath: string): Promise<DataJson> {
    try {
        const content = await fs.readFile(jsonPath, 'utf8');
        const json: DataJson = JSON.parse(content);
        core.debug(`Loaded external JSON file at ${jsonPath}`);
        return json;
    } catch (err) {
        core.warning(
            `Could not find external JSON file for benchmark data at ${jsonPath}. Using empty default: ${err}`,
        );
        return { ...DEFAULT_DATA_JSON };
    }
}

async function writeBenchmarkToExternalJson(
    bench: Benchmark,
    jsonFilePath: string,
    config: Config,
): Promise<Benchmark | null> {
    const { name, maxItemsInChart, saveDataFile } = config;
    const data = await loadDataJson(jsonFilePath);
    const prevBench = addBenchmarkToDataJson(name, bench, data, maxItemsInChart);

    if (!saveDataFile) {
        core.debug('Skipping storing benchmarks in external data file');
        return prevBench;
    }

    try {
        const jsonDirPath = path.dirname(jsonFilePath);
        await io.mkdirP(jsonDirPath);
        await fs.writeFile(jsonFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        throw new Error(`Could not store benchmark data as JSON at ${jsonFilePath}: ${err}`);
    }

    return prevBench;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function writeBenchmark(bench: Benchmark, config: Config) {
    const { name, externalDataJsonPath } = config;
    const prevBench = externalDataJsonPath
        ? await writeBenchmarkToExternalJson(bench, externalDataJsonPath, config)
        : await writeBenchmarkToGitHub(bench, config);
    core.debug('Handling comments and alerts...');
    // Put this after `git push` for reducing possibility to get conflict on push. Since sending
    // comment take time due to API call, do it after updating remote branch.
    if (prevBench === null) {
        core.debug('Alert check was skipped because previous benchmark result was not found');
    } else {
        await handleComment(name, bench, prevBench, config);
        await handleAlert(name, bench, prevBench, config);
    }
}
