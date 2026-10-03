import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../index.html', import.meta.url),'utf8');
test('loading state is explicit about one-time preparation and fast follow-ups',()=>{
 assert.match(html,/Identifying the essential skills/);
 assert.match(html,/Retrieving your next prepared question/);
 assert.match(html,/essential skills completed/);
 assert.doesNotMatch(html,/finishEarlyBtn|Evidence confidence:/);
 assert.doesNotMatch(html,/id="downloadBtn"|id="deleteSessionBtn"|id="reportBackBtn"/);
 new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
test('report UI shows competency, specific gap, untested requirements and action plan without answer recap',()=>{
 assert.match(html,/Your current test-based finding:/);
 assert.match(html,/Other required skills — not assessed/);
 assert.match(html,/personalised 30 \/ 60 \/ 90-day plan/);
});
test('bank generator and next-question endpoints keep answers and rationales private',()=>{
 const endpoint=readFileSync(new URL('../api/next-question.js',import.meta.url),'utf8');
 assert.match(endpoint,/choosePreparedQuestion/);
 assert.match(endpoint,/publicQuestion\(question\)/);
 assert.match(endpoint,/questionBank:generated\.questionBank/);
});
