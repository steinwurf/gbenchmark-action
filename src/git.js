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
exports.currentBranch = exports.clone = exports.reset = exports.pull = exports.push = exports.commit = exports.checkout = exports.add = exports.cmd = void 0;
const exec_1 = require("@actions/exec");
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
async function capture(cmd, args) {
    const res = {
        stdout: '',
        stderr: '',
        code: null,
    };
    try {
        const code = await exec_1.exec(cmd, args, {
            listeners: {
                stdout(data) {
                    res.stdout += data.toString();
                },
                stderr(data) {
                    res.stderr += data.toString();
                },
            },
        });
        res.code = code;
        return res;
    }
    catch (err) {
        const msg = `Command '${cmd}' failed with args '${args.join(' ')}': ${res.stderr}: ${err}`;
        core.debug(`@actions/exec.exec() threw an error: ${msg}`);
        throw new Error(msg);
    }
}
async function cmd(...args) {
    core.debug(`Executing Git: ${args.join(' ')}`);
    const userArgs = [
        '-c',
        'user.name=github-action-benchmark',
        '-c',
        'user.email=github@users.noreply.github.com',
        '-c',
        'http.https://github.com/.extraheader=', // This config is necessary to support actions/checkout@v2 (#9)
    ];
    const res = await capture('git', userArgs.concat(args));
    if (res.code !== 0) {
        throw new Error(`Command 'git ${args.join(' ')}' failed: ${JSON.stringify(res)}`);
    }
    return res.stdout;
}
exports.cmd = cmd;
function getRemoteUrl(token, fullName) {
    var _a;
    /* eslint-disable @typescript-eslint/camelcase */
    if (!fullName) {
        fullName = (_a = github.context.payload.repository) === null || _a === void 0 ? void 0 : _a.full_name;
    }
    /* eslint-enable @typescript-eslint/camelcase */
    if (!fullName) {
        throw new Error(`Repository info is not available in payload: ${JSON.stringify(github.context.payload)}`);
    }
    return `https://x-access-token:${token}@github.com/${fullName}.git`;
}
async function add(filePath, ...gitOptions) {
    core.debug(`Executing 'git add' with token and git options '${gitOptions.join(' ')}'`);
    let args = ['add', filePath];
    if (gitOptions.length > 0) {
        args = gitOptions.concat(args);
    }
    return cmd(...args);
}
exports.add = add;
async function checkout(ghBranch, ...gitOptions) {
    core.debug(`Executing 'git checkout' to branch ${ghBranch} with token and git options '${gitOptions.join(' ')}'`);
    let args = ['checkout', ghBranch];
    if (gitOptions.length > 0) {
        args = gitOptions.concat(args);
    }
    return cmd(...args);
}
exports.checkout = checkout;
async function commit(message, ...gitOptions) {
    core.debug(`Executing 'git commit' with token and git options '${gitOptions.join(' ')}'`);
    let args = ['commit', '-m', message];
    if (gitOptions.length > 0) {
        args = gitOptions.concat(args);
    }
    return cmd(...args);
}
exports.commit = commit;
async function push(token, ghRepository, ...gitOptions) {
    core.debug(`Executing 'git push' with token and git options '${gitOptions.join(' ')}'`);
    if (ghRepository && token) {
        const remote = getRemoteUrl(token, ghRepository);
        let args = ['push', remote, '--no-verify'];
        if (gitOptions.length > 0) {
            args = gitOptions.concat(args);
        }
        return cmd(...args);
    }
    else {
        let args = ['push', '--no-verify'];
        if (gitOptions.length > 0) {
            args = gitOptions.concat(args);
        }
        return cmd(...args);
    }
}
exports.push = push;
async function pull(token, ghRepository, ...gitOptions) {
    core.debug(`Executing 'git pull' with token and git options '${gitOptions.join(' ')}'`);
    if (ghRepository && token) {
        const remote = getRemoteUrl(token, ghRepository);
        let args = ['pull', remote];
        if (gitOptions.length > 0) {
            args = gitOptions.concat(args);
        }
        return cmd(...args);
    }
    else {
        let args = ['pull'];
        if (gitOptions.length > 0) {
            args = gitOptions.concat(args);
        }
        return cmd(...args);
    }
}
exports.pull = pull;
async function reset(...gitOptions) {
    core.debug(`Executing 'git pull' with token and git options '${gitOptions.join(' ')}'`);
    let args = ['reset', '--hard', 'HEAD~1'];
    if (gitOptions.length > 0) {
        args = gitOptions.concat(args);
    }
    return cmd(...args);
}
exports.reset = reset;
async function clone(token, ghRepository, ...cloneOptions) {
    core.debug(`Executing 'git clone' of repository '${ghRepository}' with token and options '${cloneOptions.join(' ')}'`);
    const remote = token !== undefined ? getRemoteUrl(token, ghRepository) : 'origin';
    let args = ['clone', remote];
    if (cloneOptions.length > 0) {
        args = args.concat(cloneOptions);
    }
    return cmd(...args);
}
exports.clone = clone;
async function currentBranch(...gitOptions) {
    core.debug(`Executing 'rev-parse'`);
    let args = ['rev-parse', '--abbrev-ref', 'HEAD'];
    if (gitOptions.length > 0) {
        args = gitOptions.concat(args);
    }
    return cmd(...args);
}
exports.currentBranch = currentBranch;
//# sourceMappingURL=git.js.map