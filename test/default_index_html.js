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
const cheerio = __importStar(require("cheerio"));
const acorn_1 = require("acorn");
const default_index_html_1 = require("../src/default_index_html");
describe('DEFAULT_INDEX_HTML', function () {
    it('is valid HTML and its script is valid as JavaScript', function () {
        // Verify HTML syntax
        const q = cheerio.load(default_index_html_1.DEFAULT_INDEX_HTML);
        const s = q('#main-script');
        assert_1.strict.ok(s);
        const src = s.html();
        assert_1.strict.ok(src);
        // Verify JavaScript syntax. It raises an error if invalid
        acorn_1.Parser.parse(src);
    });
});
//# sourceMappingURL=default_index_html.js.map