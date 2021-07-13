===============================
Google Benchmark action for C++
===============================

This is Steinwurf's public Google Benchmark action.

The action provides a Github Action for continuous benchmarking.
If your project has a C++ benchmark with Google Benchmark, this action collects data from the benchmark outputs
and monitor the results on GitHub Actions workflow.

Usage
-----

This action takes a file that contains benchmark output. One can push this output to a different repository (e.g a benchmark "dump") and
the action compares the current output in the directory with the output from the new commit.

Heres a minimal setup example. You can replace the waf configure/build step with whatever build system you use:

.. code-block:: yaml

    name: Minimal setup
    on:
      push:

    jobs:
      benchmark:
          name: Performance Regression Check
          runs-on: [self-hosted, benchmark]
          steps:
            - uses: actions/checkout@v2
            # Configure with waf
            - name: Configure in no-debug
              run: python3 waf Configure
            # Build the binaries
            - name: Build
              run: python3 waf
            # Run Google Benchmark with and stores the output to a file
            - name: Run benchmark
              run: /path/to/benchmark/binary --benchmark_out='output.json'
            # Run `github-action-benchmark` action
            - name: Compare benchmark result
              uses: steinwurf/gbenchmark-action@v1
              with:
                # What repository are you benchmarking
                name: Awesome Repo Benchmark
                # Where the output from the benchmark is stored
                output-file-path: path/to/output.json
                # The name of the dump-repository containing the previous benchmark
                gh-repository: "your-name/dump-repo"
                # The branch of the dump-repository containing the previous benchmark
                gh-branch: "master"
                # Where the previous data file is stored
                benchmark-data-dir-path: /dump-repo/awesome-repo
                # Workflow will fail when an alert happens
                fail-on-alert: true

In total there are the following action inputs. These can all be found in action.yml:


**name** (Required)

- Type: String
- Default: "Benchmark"

Name of the benchmark. This value must be identical across all benchmarks in your repository.

**output-file-path** (Required)

- Type: String
- Default: N/A

Path to a file which contains the output from benchmark tool. The path can be relative to repository root.

**gh-repository**

- Type: String
- Default: N/A

Name of your dump repository.

**gh-pages-branch** (Required)

- Type: String
- Default: "master"

Name of your GitHub branch.


**benchmark-data-dir-path** (Required)

- Type: String
- Default: N/A

Path to a directory that contains benchmark files on the GitHub branch. The path can be relative to repository root.

**github-token** (Optional)

- Type: String
- Default: N/A

GitHub API token. For updating the repository and/or branch, a personal access token is necessary.
Please see the 'Commit comment' section for more details.

**auto-push** (Optional)

- Type: Boolean
- Default: false

If it is set to `true`, this action automatically pushes the generated commit to the given repository and or branch.


**comment-always** (Optional)

- Type: Boolean
- Default: false

If it is set to `true`, this action will leave a commit comment comparing the current benchmark with previous.
`github-token` is necessary as well. Please note that a personal access token is not necessary to
send a commit comment. `secrets.GITHUB_TOKEN` is sufficient.

**save-data-file** (Optional)

- Type: Boolean
- Default: true

If it is set to `true`, this action will not save the current benchmark to the external data file.

**alert-threshold** (Optional)

- Type: String
- Default: "200%"

Percentage value like `"150%"`. It is a ratio indicating how worse the current benchmark result is.
For example, if we now get `150 ns/iter` and previously got `100 ns/iter`, it gets `150%` worse.

If the current benchmark result is worse than previous exceeding the threshold, an alert will happen.
See `comment-on-alert` and `fail-on-alert` also.

**comment-on-alert** (Optional)

- Type: Boolean
- Default: false

If it is set to `true`, this action will leave a commit comment when an alert happens.
`github-token` is necessary as well. Please note that a personal access token is not necessary to
send a commit comment. `secrets.GITHUB_TOKEN` is sufficient. For the threshold for this, please see
`alert-threshold` also.

**fail-on-alert** (Optional)

- Type: Boolean
- Default: false

If it is set to `true`, the workflow will fail when an alert happens. For the threshold for this, please
see `alert-threshold` and `fail-threshold` also.

**fail-threshold** (Optional)

- Type: String
- Default: The same value as `alert-threshold`

Percentage value in the same format as `alert-threshold`. If this value is set, the threshold value
will be used to determine if the workflow should fail. Default value is set to the same value as
`alert-threshold` input. **This value must be equal or larger than `alert-threshold` value.**

**alert-comment-cc-users** (Optional)

- Type: String
- Default: N/A

Comma-separated GitHub user names mentioned in alert commit comment like `"@foo,@bar"`. These users
will be mentioned in a commit comment when an alert happens. For configuring alerts, please see
`alert-threshold` and `comment-on-alert` also.

**external-data-json-path** (Optional)

- Type: String
- Default: N/A

External JSON file which contains benchmark results until previous job run. When this value is set,
this action updates the file content instead of generating a Git commit.
This option is useful if you don't want to put benchmark results in a dump-repo. Instead,
you need to keep the JSON file persistently among job runs. One option is using a workflow cache
with `actions/cache` action.

**max-items-in-chart** (Optional)

- Type: Number
- Default: N/A

Max number of data points in a chart for avoiding too busy chart. This value must be unsigned integer
larger than zero. If the number of benchmark results for some benchmark suite exceeds this value,
the oldest one will be removed before storing the results to file. By default this value is empty
which means there is no limit.

Development
-----------

This action is written in Typescript, but is transpiled to Javascript using Node.js.
To transpile, lint and test this project, you need Node.js version 12 **or higher**. You can install Node using this guide for Linux::

    https://phoenixnap.com/kb/update-node-js-version

If so, you first install all the required depencies in a folder node_modules by calling::

    python3 waf configure

You can then transpile the Typescript by calling::

    python3 waf

The resulting .js-files will replace the current files in lib/.

You can run a combined transpile, lint and test with::

    python3 waf --run_tests

The transpiled tests and dependencies thereof will be placed in test-temp/ .

Transpile, lint and test can be called individually using::

    npm run build
    npm run lint
    npm run mocha / npm run test
