'use strict';
// Built-in decomposition with no model: a phase template that turns one task
// into subtasks, each sized to a single focus block where possible. An agent
// using agent/decompose.md is expected to do better; this is the floor.

const TEMPLATE = {
  research: [
    { title: 'Read the existing context and write down what is already known', blocks: 1 },
    { title: 'List the open questions and who or what can answer each', blocks: 1 },
    { title: 'Answer the open questions and record the findings', blocks: 2 },
  ],
  design: [
    { title: 'Sketch two or three approaches with trade-offs', blocks: 1 },
    { title: 'Pick an approach and write a one-page design note', blocks: 1 },
    { title: 'Get the design note reviewed and fold in the feedback', blocks: 1 },
  ],
  implement: [
    { title: 'Set up the scaffolding and a walking skeleton', blocks: 1 },
    { title: 'Build the core path end to end', blocks: 2 },
    { title: 'Handle the edge cases and errors', blocks: 1 },
  ],
  verify: [
    { title: 'Write tests for the core path and edge cases', blocks: 1 },
    { title: 'Run it for real and fix what breaks', blocks: 1 },
    { title: 'Get a review, ship, and note what was learned', blocks: 1 },
  ],
};

function template(task, phases) {
  const chosen = (phases && phases.length ? phases : Object.keys(TEMPLATE)).filter((p) => TEMPLATE[p]);
  const out = [];
  let order = 10;
  for (const phase of chosen) {
    for (const step of TEMPLATE[phase]) {
      out.push({
        title: step.title,
        phase,
        blocks: step.blocks,
        parent: task.id,
        status: task.status === 'done' ? 'done' : 'backlog',
        order,
        body: 'Part of: ' + task.title + '\n\nDone when: (fill in a checkable outcome)',
      });
      order += 10;
    }
  }
  return out;
}

module.exports = { template, TEMPLATE };
