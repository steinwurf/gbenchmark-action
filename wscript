#! /usr/bin/env python
# encoding: utf-8

import os
from waflib.Build import BuildContext
from waflib.extras.wurf.directory import remove_directory


APPNAME = "gbenchmark-action"
VERSION = "1.0.0"


def options(opt):

    opt.add_option(
        "--run_tests", default=False, action="store_true", help="Run all tests"
    )


def configure(conf):

    conf.find_program("node", mandatory=True)

    conf.exec_command("npm install", stdout=None, stderr=None)


def build(bld):

    bld.exec_command("npm run build", stdout=None, stderr=None)

    if bld.options.run_tests:

        bld.exec_command("npm run lint", stdout=None, stderr=None)

        bld.exec_command("npm run test", stdout=None, stderr=None)
