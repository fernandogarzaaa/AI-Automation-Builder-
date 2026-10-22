#!/usr/bin/env node
// Negative-control subject. It MUST fail the Genesis policy-quality threshold.
// It deliberately ignores the task and accepts everything.
process.stdout.write(JSON.stringify({ label: 'accepted' }));
