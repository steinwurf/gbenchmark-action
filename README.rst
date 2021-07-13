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
      # Upload the updated cache file for the next job by actions/cache




