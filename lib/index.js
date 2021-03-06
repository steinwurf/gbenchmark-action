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
const core = __importStar(require("@actions/core"));
const config_1 = require("./config");
const extract_1 = require("./extract");
const write_1 = require("./write");
async function main() {
    const config = await config_1.configFromJobInput();
    core.debug(`Config extracted from job: ${config}`);
    const bench = await extract_1.extractResult(config);
    core.debug(`Google Benchmark result was extracted: ${bench}`);
    await write_1.writeBenchmark(bench, config);
    console.log('gbenchmark-action was run successfully!', '\nData:', bench);
}
main().catch((e) => core.setFailed(e.message));
