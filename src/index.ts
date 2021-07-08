import * as core from '@actions/core';
import { configFromJobInput } from './config';
import { extractResult } from './extract';
import { writeBenchmark } from './write';

async function main() {
    const config = await configFromJobInput();
    core.debug(`Config extracted from job: ${config}`);

    const bench = await extractResult(config);
    core.debug(`Google Benchmark result was extracted: ${bench}`);

    await writeBenchmark(bench, config);
    console.log('gbenchmark-action was run successfully!', '\nData:', bench);
}

main().catch(e => core.setFailed(e.message));
